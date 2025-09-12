/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { BootstrapVersion } from '../accelerator';
import { IPrincipal } from 'aws-cdk-lib/aws-iam';

export class BootstrapStack extends AcceleratorStack {
  readonly qualifier: string;
  readonly managementAccount: string;
  readonly s3KmsKeyOutputValue: string;
  readonly assetBucketName: string;
  constructor(scope: Construct, id: string, props: AcceleratorStackProps, bootstrapQualifier?: string) {
    super(scope, id, props);

    const customDeploymentRoleName =
      this.props.globalConfig.cdkOptions?.customDeploymentRole ?? `${props.prefixes.accelerator}-Deployment-Role`;
    this.qualifier = bootstrapQualifier ?? 'accel';
    this.managementAccount = props.accountsConfig.getManagementAccountId();
    this.assetBucketName = this.getAssetBucketName();
    this.s3KmsKeyOutputValue = '-';
    if (props.useExistingRoles) {
      return;
    }
    if (!this.account || !this.region) {
      throw new Error('Must pass account and region to the bootstrap stack');
    }

    // Create Cfn Parameters
    // These parameters are required to exist due to how cdk creates a change set during bootstrapping
    new cdk.CfnParameter(this, 'CloudFormationExecutionPolicies');
    new cdk.CfnParameter(this, 'ContainerAssetsRepositoryName', { default: '' });
    new cdk.CfnParameter(this, 'FileAssetsBucketKmsKeyId', { default: '' });
    new cdk.CfnParameter(this, 'FileAssetsBucketName', { default: '' });
    new cdk.CfnParameter(this, 'PublicAccessBlockConfiguration');
    new cdk.CfnParameter(this, 'Qualifier');
    new cdk.CfnParameter(this, 'TrustedAccountsForLookup');
    new cdk.CfnParameter(this, 'TrustedAccounts', { type: 'CommaDelimitedList' });

    // Create CDK roles for default CDK stack synthesis
    const deploymentRole = this.createCustomDeploymentRole(
      customDeploymentRoleName,
      this.props.globalConfig.homeRegion,
    );
    const managementDeploymentRole = this.createManagementDeploymentRole(
      `${props.prefixes.accelerator}-Management-Deployment-Role`,
      this.props.accountsConfig.getManagementAccountId(),
      this.props.globalConfig.homeRegion,
    );

    const deploymentRoles = [deploymentRole];
    if (managementDeploymentRole) {
      deploymentRoles.push(managementDeploymentRole);
    }
    const deploymentRoleNames = deploymentRoles.map(role => role.roleName);
    // Create S3 KMS key and bucket
    const centralizeBuckets = this.props.globalConfig.cdkOptions.centralizeBuckets;
    const shouldCreateBucket = !centralizeBuckets || (centralizeBuckets && this.account === this.managementAccount);

    if (shouldCreateBucket) {
      this.logger.info(`Creating bucket for region ${this.region} in account ${this.account}`);

      const s3KmsKey = this.createBucketCmk({
        accountId: this.account,
        deploymentRoles: deploymentRoleNames,
      });
      this.s3KmsKeyOutputValue = s3KmsKey.keyArn;

      this.createAssetBucket({
        kmsKey: s3KmsKey,
        deploymentRoles: deploymentRoleNames,
      });
    }

    // Create SSM Parameter for CDK Bootstrap Version
    const cdkBootstrapVersionParam = new cdk.aws_ssm.StringParameter(this, 'CdkBootstrapVersion', {
      parameterName: `/cdk-bootstrap/${this.qualifier}/version`,
      stringValue: BootstrapVersion.toString(),
    });
    // Override logical Id
    const cfnCdkBootstrapVersionParam = cdkBootstrapVersionParam.node.defaultChild as cdk.aws_ssm.CfnParameter;
    cfnCdkBootstrapVersionParam.overrideLogicalId('CdkBootstrapVersion');

    // Outputs
    new cdk.CfnOutput(this, 'BootstrapVersionOutput', {
      value: BootstrapVersion.toString(),
      description: 'The version of the bootstrap resources that are currently mastered in this stack',
    });

    new cdk.CfnOutput(this, 'BucketNameOutput', {
      value: this.assetBucketName,
      description: 'The name of the S3 bucket owned by the CDK toolkit stack',
    });

    new cdk.CfnOutput(this, 'BucketDomainNameOutput', {
      value: this.getAssetBucketDomainName(),
      description: 'The domain name of the S3 bucket owned by the CDK toolkit stack',
    });

    new cdk.CfnOutput(this, 'FileAssetKeyArnOutput', {
      value: this.s3KmsKeyOutputValue,
      description: 'The ARN of the KMS key used to encrypt the asset bucket ',
      exportName: `CdkBootstrap-${this.qualifier}-FileAssetKeyArn`,
    });
    if (managementDeploymentRole) {
      new cdk.CfnOutput(this, 'ManagementDeploymentRoleArn', {
        value: managementDeploymentRole.roleArn,
        description: 'The ARN of the management account bootstrap role',
      });
    }
  }

  createCustomDeploymentRole(customRoleName: string, homeRegion: string) {
    if (cdk.Stack.of(this).region !== homeRegion) {
      return cdk.aws_iam.Role.fromRoleName(this, 'CustomDeploymentRole', customRoleName);
    }
    const customDeploymentRole = new cdk.aws_iam.Role(this, 'CustomDeploymentRole', {
      assumedBy: this.setCompositePrincipals({
        managementAccount: this.managementAccount,
        cfnServicePrincipal: true,
      }),
      roleName: customRoleName,
    });
    this.setAssumeSelfPermissions(customDeploymentRole, customRoleName);
    customDeploymentRole.addManagedPolicy(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));
    // Override logical Id
    const cfnCustomDeploymentRole = customDeploymentRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnCustomDeploymentRole.overrideLogicalId('CustomDeploymentRole');
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/CustomDeploymentRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Custom resource provider framework-role created by cdk.',
      },
    ]);
    return customDeploymentRole;
  }

  createManagementDeploymentRole(managementRoleName: string, managementAccount: string, homeRegion: string) {
    if (cdk.Stack.of(this).account !== managementAccount) {
      return;
    }
    if (cdk.Stack.of(this).region !== homeRegion) {
      return cdk.aws_iam.Role.fromRoleName(this, 'ManagementDeploymentRole', managementRoleName);
    }
    const managementDeploymentRole = new cdk.aws_iam.Role(this, 'ManagementDeploymentRole', {
      assumedBy: this.setCompositePrincipals({
        managementAccount: this.managementAccount,
        cfnServicePrincipal: true,
      }),
      roleName: managementRoleName,
    });
    this.setAssumeSelfPermissions(managementDeploymentRole, managementRoleName);
    managementDeploymentRole.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
    );
    // Override logical Id
    const cfnManagementDeploymentRole = managementDeploymentRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnManagementDeploymentRole.overrideLogicalId('ManagementDeploymentRole');
    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/ManagementDeploymentRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Custom resource provider framework-role created by cdk.',
      },
    ]);
    return managementDeploymentRole;
  }

  createBucketCmk(props: { accountId: string; deploymentRoles: string[] }) {
    const conditions = this.setBootstrapResourceConditions(this.props.organizationConfig.enable, props.deploymentRoles);
    const principals = this.setBootstrapResourcePrincipals(this.props.organizationConfig.enable);
    const s3Key = new cdk.aws_kms.Key(this, 'AssetEncryptionKey', {
      alias: `${this.props.prefixes.kmsAlias}/kms/cdk/key`,
      description: 'Key used to encrypt centralized CDK assets',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Allow management account access
    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Management Actions',
        principals: [new cdk.aws_iam.AccountPrincipal(props.accountId)],
        actions: [
          'kms:Create*',
          'kms:Describe*',
          'kms:Enable*',
          'kms:List*',
          'kms:Put*',
          'kms:Update*',
          'kms:Revoke*',
          'kms:Disable*',
          'kms:Get*',
          'kms:Delete*',
          'kms:ScheduleKeyDeletion',
          'kms:CancelKeyDeletion',
          'kms:GenerateDataKey',
          'kms:TagResource',
          'kms:UntagResource',
        ],
        resources: ['*'],
      }),
    );

    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow S3 to use the encryption key`,
        // Use AnyPrincipal for scalability with large organizations (1000s of accounts)
        // Access is restricted by ViaService and organization conditions below
        // amazonq-ignore-next-line
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `s3.${cdk.Stack.of(this).region}.amazonaws.com`,
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow org to perform encryption',
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
        resources: ['*'],
        conditions,
        principals,
      }),
    );
    return s3Key;
  }

  createAssetBucket(props: { kmsKey: cdk.aws_kms.Key; deploymentRoles: string[] }) {
    const lifecycleRules: cdk.aws_s3.LifecycleRule[] = [
      {
        id: 'CleanupOldVersions',
        enabled: true,
        noncurrentVersionExpiration: cdk.Duration.days(365),
      },
    ];

    const assetBucket = new cdk.aws_s3.Bucket(this, 'StagingBucket', {
      accessControl: cdk.aws_s3.BucketAccessControl.PRIVATE,
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: this.assetBucketName,
      encryption: cdk.aws_s3.BucketEncryption.KMS,
      encryptionKey: props.kmsKey,
      lifecycleRules: lifecycleRules,
      objectOwnership: cdk.aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: true,
    });
    const principals = this.setBootstrapResourcePrincipals(this.props.organizationConfig.enable);
    const conditions = this.setBootstrapResourceConditions(this.props.organizationConfig.enable, props.deploymentRoles);

    assetBucket.grantReadWrite(new cdk.aws_iam.ServicePrincipal('cloudformation.amazonaws.com'));
    assetBucket.grantReadWrite(new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'));

    assetBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'cdk-read-write-access',
        effect: cdk.aws_iam.Effect.ALLOW,
        resources: [assetBucket.arnForObjects('*'), assetBucket.bucketArn],
        actions: ['s3:*'],
        principals,
        conditions,
      }),
    );

    assetBucket.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'deny-insecure-connections',
        effect: cdk.aws_iam.Effect.DENY,
        actions: ['s3:*'],
        resources: [assetBucket.arnForObjects('*')],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        conditions: {
          Bool: {
            'aws:SecureTransport': 'false',
          },
        },
      }),
    );

    //Override logical Id
    const cfnAssetBucket = assetBucket.node.defaultChild as cdk.aws_s3.CfnBucket;
    cfnAssetBucket.overrideLogicalId('StagingBucket');

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/StagingBucket/Resource`, [
      {
        id: 'AwsSolutions-S1',
        reason: 'StagingBucket has server access logs disabled until the task for access logging completed.',
      },
    ]);

    // AwsSolutions-S10: The S3 Bucket does not require requests to use SSL.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/StagingBucket/Resource`, [
      {
        id: 'AwsSolutions-S10',
        reason: 'StagingBucket denies insecure requests via the bucket policy.',
      },
    ]);

    return assetBucket;
  }

  getAssetBucketDomainName() {
    return `cdk-${this.qualifier}-assets-${this.managementAccount}-${this.region}.s3.${this.region}.amazonaws.com`;
  }
  getAssetBucketName() {
    return `cdk-${this.qualifier}-assets-${this.managementAccount}-${this.region}`;
  }
  getWorkloadBucketName(accountId: string) {
    return `cdk-${this.qualifier}-assets-${accountId}-${this.region}`;
  }

  setBootstrapResourceConditions(isOrgsEnabled: boolean, deploymentRoles: string[]) {
    const roleArns = [
      `arn:${cdk.Stack.of(this).partition}:iam::*:role/cdk-${this.qualifier}*`,
      `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.globalConfig.managementAccountAccessRole}`,
    ];
    for (const role of deploymentRoles) {
      if (role.includes('Management-Deployment-Role')) {
        roleArns.push(`arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${role}`);
      } else {
        roleArns.push(`arn:${cdk.Stack.of(this).partition}:iam::*:role/${role}`);
      }
    }
    const conditions: { [key: string]: unknown } = {
      ArnLike: {
        'aws:PrincipalARN': roleArns,
      },
    };
    if (isOrgsEnabled) {
      conditions['StringEquals'] = {
        'aws:PrincipalOrgID': this.organizationId,
      };
    }
    return conditions;
  }
  setBootstrapResourcePrincipals(isOrgsEnabled: boolean) {
    let principals = [new cdk.aws_iam.AnyPrincipal()];
    if (!isOrgsEnabled) {
      if (!this.props.accountsConfig.accountIds) {
        this.logger.error(`Could not load account ids.`);
        throw new Error(`Configuration validation failed at runtime.`);
      }
      principals = this.props.accountsConfig.accountIds?.map(
        accountId => new cdk.aws_iam.AccountPrincipal(accountId.accountId),
      );
    }
    return principals;
  }
  setCompositePrincipals(props: { managementAccount: string; cfnServicePrincipal?: boolean }) {
    const principals: IPrincipal[] = [new cdk.aws_iam.AccountPrincipal(props.managementAccount)];
    if (cdk.Stack.of(this).account !== props.managementAccount) {
      principals.push(
        new cdk.aws_iam.ArnPrincipal(
          `arn:${cdk.Stack.of(this).partition}:iam::${cdk.Stack.of(this).account}:role/${
            this.props.globalConfig.managementAccountAccessRole
          }`,
        ),
      );
    }

    if (props.cfnServicePrincipal) {
      principals.push(new cdk.aws_iam.ServicePrincipal('cloudformation.amazonaws.com'));
    }

    return new cdk.aws_iam.CompositePrincipal(...principals);
  }

  setAssumeSelfPermissions(role: cdk.aws_iam.Role, roleName: string) {
    role.assumeRolePolicy?.addStatements(
      new cdk.aws_iam.PolicyStatement({
        effect: cdk.aws_iam.Effect.ALLOW,
        principals: [new cdk.aws_iam.AccountRootPrincipal()],
        actions: ['sts:AssumeRole'],
        conditions: {
          StringEquals: {
            'AWS:PrincipalArn': `arn:${cdk.Stack.of(this).partition}:iam::${
              cdk.Stack.of(this).account
            }:role/${roleName}`,
          },
        },
      }),
    );
  }
}

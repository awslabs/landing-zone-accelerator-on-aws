/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class BootstrapStack extends AcceleratorStack {
  readonly qualifier: string;
  readonly managementAccount: string;
  readonly organizationId: string;
  readonly s3KmsKeyOutputValue: string;
  constructor(scope: Construct, id: string, props: AcceleratorStackProps, bootstrapQualifier?: string) {
    super(scope, id, props);
    this.qualifier = bootstrapQualifier ?? 'accel';
    this.managementAccount = props.accountsConfig.getManagementAccountId();
    // Workaround to get organization Id without using Organization construct, which requires custom resource.
    this.organizationId = props.organizationConfig.enable
      ? props.organizationConfig.organizationalUnitIds![0].arn!.split('/')[1]
      : '';

    const partition = cdk.Stack.of(this).partition;
    const assetBucketName = this.getAssetBucketName();
    if (!this.account || !this.region) {
      throw new Error('Must pass account and region to the bootstrap stack');
    }

    // Create Cfn Parameters
    // These parameters are required to exist due to how cdk creates a change set when bootstrapping
    new cdk.CfnParameter(this, 'CloudFormationExecutionPolicies');
    new cdk.CfnParameter(this, 'ContainerAssetsRepositoryName', { default: '' });
    new cdk.CfnParameter(this, 'FileAssetsBucketKmsKeyId', { default: '' });
    new cdk.CfnParameter(this, 'FileAssetsBucketName', { default: '' });
    new cdk.CfnParameter(this, 'PublicAccessBlockConfiguration');
    new cdk.CfnParameter(this, 'Qualifier');
    new cdk.CfnParameter(this, 'TrustedAccounts');
    new cdk.CfnParameter(this, 'TrustedAccountsForLookup');

    if (this.account === this.managementAccount) {
      Logger.info(`[accelerator-bootstrap] Creating bucket for region ${this.region} in account ${this.account}`);

      const s3KmsKey = this.createBucketCmk({ managementAccountId: this.managementAccount, partition: partition });
      this.s3KmsKeyOutputValue = s3KmsKey.keyArn;
      this.createAssetBucket({
        bucketName: assetBucketName,
        kmsKey: s3KmsKey,
        accessRoleNames: [this.qualifier, this.props.globalConfig.managementAccountAccessRole],
        partition,
      });
    } else {
      this.s3KmsKeyOutputValue = '-';
    }

    // Create SSM Parameter for CDK Bootstrap Version
    const cdkBootstrapVersionParam = new cdk.aws_ssm.StringParameter(this, 'CdkBootstrapVersion', {
      parameterName: `/cdk-bootstrap/${this.qualifier}/version`,
      stringValue: '14',
    });
    // Override logical Id
    const cfnCdkBootstrapVersionParam = cdkBootstrapVersionParam.node.defaultChild as cdk.aws_ssm.CfnParameter;
    cfnCdkBootstrapVersionParam.overrideLogicalId('CdkBootstrapVersion');

    // Create file publishing role

    const filePublishingRole = new cdk.aws_iam.Role(this, 'FilePublishingRole', {
      assumedBy: new cdk.aws_iam.AccountPrincipal(this.managementAccount),
      roleName: `cdk-${this.qualifier}-file-publishing-role-${this.account}-${this.region}`,
    });

    const filePublishingRoleDefaultPolicy = new cdk.aws_iam.Policy(this, 'FilePublishingRoleDefaultPolicy', {
      policyName: `cdk-${this.qualifier}-file-publishing-role-default-policy-${this.account}-${this.region}`,
      roles: [filePublishingRole],
      document: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            actions: [
              's3:GetObject*',
              's3:GetBucket*',
              's3:GetEncryptionConfiguration',
              's3:List*',
              's3:DeleteObject*',
              's3:PutObject*',
              's3:Abort*',
            ],
            resources: [`arn:${partition}:s3:::${assetBucketName}`, `arn:${partition}:s3:::${assetBucketName}/*`],
            effect: cdk.aws_iam.Effect.ALLOW,
          }),
          new cdk.aws_iam.PolicyStatement({
            actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
            resources: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
          }),
        ],
      }),
    });
    // Override logical ids
    const cfnFilePublishingRole = filePublishingRole.node.defaultChild as cdk.aws_iam.CfnRole;
    const cfnFilePublishingRoleDefaultPolicy = filePublishingRoleDefaultPolicy.node
      .defaultChild as cdk.aws_iam.CfnPolicy;

    cfnFilePublishingRole.overrideLogicalId('FilePublishingRole');
    cfnFilePublishingRoleDefaultPolicy.overrideLogicalId('FilePublishingRoleDefaultPolicy');

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/FilePublishingRoleDefaultPolicy/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Allows only specific policy.',
      },
    ]);

    // Create image publishing role

    const imagePublishingRole = new cdk.aws_iam.Role(this, 'ImagePublishingRole', {
      assumedBy: new cdk.aws_iam.AccountPrincipal(this.managementAccount),
      roleName: `cdk-${this.qualifier}-image-publishing-role-${this.account}-${this.region}`,
    });

    const imagePublishingRoleDefaultPolicy = new cdk.aws_iam.Policy(this, 'ImagePublishingRoleDefaultPolicy', {
      policyName: `cdk-${this.qualifier}-image-publishing-role-default-policy-${this.account}-${this.region}`,
      roles: [imagePublishingRole],
      document: new cdk.aws_iam.PolicyDocument({
        statements: [
          new cdk.aws_iam.PolicyStatement({
            actions: [
              'ecr:PutImage',
              'ecr:InitiateLayerUpload',
              'ecr:UploadLayerPart',
              'ecr:CompleteLayerUpload',
              'ecr:BatchCheckLayerAvailability',
              'ecr:DescribeRepositories',
              'ecr:DescribeImages',
              'ecr:BatchGetImage',
              'ecr:GetDownloadUrlForLayer',
            ],
            resources: [`arn:${partition}:ecr:${this.region}:${this.account}:repository/${this.getEcrRepoName()}`],
            effect: cdk.aws_iam.Effect.ALLOW,
          }),
          new cdk.aws_iam.PolicyStatement({
            actions: ['ecr:GetAuthorizationToken'],
            resources: ['*'],
            effect: cdk.aws_iam.Effect.ALLOW,
          }),
        ],
      }),
    });
    // Override logical ids
    const cfnImagePublishingRole = imagePublishingRole.node.defaultChild as cdk.aws_iam.CfnRole;
    const cfnImagePublishingRoleDefaultPolicy = imagePublishingRoleDefaultPolicy.node
      .defaultChild as cdk.aws_iam.CfnPolicy;

    cfnImagePublishingRole.overrideLogicalId('ImagePublishingRole');
    cfnImagePublishingRoleDefaultPolicy.overrideLogicalId('ImagePublishingRoleDefaultPolicy');

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/ImagePublishingRoleDefaultPolicy/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Allows only specific policy.',
      },
    ]);

    // Create lookup role
    const lookupRole = new cdk.aws_iam.Role(this, 'LookupRole', {
      assumedBy: new cdk.aws_iam.AccountPrincipal(this.managementAccount),
      roleName: `cdk-${this.qualifier}-lookup-role-${this.account}-${this.region}`,
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess')],
      inlinePolicies: {
        LookupRolePolicy: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              sid: 'DontReadSecrets',
              effect: cdk.aws_iam.Effect.DENY,
              actions: ['kms:Decrypt'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    lookupRole.addManagedPolicy(cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'));
    // Override logical ids
    const cfnLookupRole = lookupRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnLookupRole.overrideLogicalId('LookupRole');

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/LookupRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Custom resource provider framework-role created by cdk.',
      },
    ]);

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/LookupRole/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Allows only specific policy.',
      },
    ]);

    // Create cloudformation execution role
    const cloudFormationExecutionRole = new cdk.aws_iam.Role(this, 'CloudFormationExecutionRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('cloudformation.amazonaws.com'),
      roleName: `cdk-${this.qualifier}-cfn-exec-role-${this.account}-${this.region}`,
    });
    cloudFormationExecutionRole.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'),
    );
    // Override logical Id
    const cfnCloudFormationExecutionRole = cloudFormationExecutionRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnCloudFormationExecutionRole.overrideLogicalId('CloudFormationExecutionRole');

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/CloudFormationExecutionRole/Resource`, [
      {
        id: 'AwsSolutions-IAM4',
        reason: 'AWS Custom resource provider framework-role created by cdk.',
      },
    ]);

    // Create deployment role
    const deploymentActionRole = new cdk.aws_iam.Role(this, 'DeploymentActionRole', {
      assumedBy: new cdk.aws_iam.AccountPrincipal(this.managementAccount),
      roleName: `cdk-${this.qualifier}-deploy-role-${this.account}-${this.region}`,
      inlinePolicies: {
        default: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              sid: 'CloudFormationPermissions',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'cloudformation:CreateChangeSet',
                'cloudformation:DeleteChangeSet',
                'cloudformation:DescribeChangeSet',
                'cloudformation:DescribeStacks',
                'cloudformation:ExecuteChangeSet',
                'cloudformation:CreateStack',
                'cloudformation:UpdateStack',
              ],
              resources: ['*'],
            }),
            new cdk.aws_iam.PolicyStatement({
              sid: 'PipelineCrossAccountArtifactsBucket',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['s3:GetObject*', 's3:GetBucket*', 's3:List*', 's3:Abort*', 's3:DeleteObject*', 's3:PutObject*'],
              resources: [`arn:${partition}:s3:::${assetBucketName}`, `arn:${partition}:s3:::${assetBucketName}/*`],
            }),

            new cdk.aws_iam.PolicyStatement({
              sid: 'PipelineCrossAccountArtifactsKey',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
              resources: ['*'],
              conditions: {
                StringEquals: {
                  'kms:ViaService': `s3.${this.region}.amazonaws.com`,
                },
              },
            }),
            new cdk.aws_iam.PolicyStatement({
              sid: 'CliPermissions',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['iam:PassRole'],
              resources: [cloudFormationExecutionRole.roleArn],
            }),
            new cdk.aws_iam.PolicyStatement({
              sid: 'CfnPermissions',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: [
                'cloudformation:DescribeStackEvents',
                'cloudformation:GetTemplate',
                'cloudformation:DeleteStack',
                'cloudformation:UpdateTerminationProtection',
                'sts:GetCallerIdentity',
              ],
              resources: ['*'],
            }),
            new cdk.aws_iam.PolicyStatement({
              sid: 'CliStagingBucket',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['s3:GetObject*', 's3:GetBucket*', 's3:List*'],
              resources: [`arn:${partition}:s3:::${assetBucketName}`, `arn:${partition}:s3:::${assetBucketName}/*`],
            }),
            new cdk.aws_iam.PolicyStatement({
              sid: 'ReadVersion',
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:GetParameter'],
              resources: [
                `arn:${partition}:ssm:${this.region}:${this.account}:parameter${cdkBootstrapVersionParam.parameterName}`,
              ],
            }),
          ],
        }),
      },
    });
    // Override logical Id
    const cfnDeploymentActionRole = deploymentActionRole.node.defaultChild as cdk.aws_iam.CfnRole;
    cfnDeploymentActionRole.overrideLogicalId('DeploymentActionRole');

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/DeploymentActionRole/Resource`, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'Allows only specific policy.',
      },
    ]);

    // Create ECR repository
    const containerAssetRepo = new cdk.aws_ecr.Repository(this, 'ContainerAssetRepo', {
      imageTagMutability: cdk.aws_ecr.TagMutability.IMMUTABLE,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      repositoryName: this.getEcrRepoName(),
    });
    containerAssetRepo.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'LambdaECRImageRetrievalPolicy-insecure-connections',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'],
        principals: [new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com')],
        conditions: {
          StringLike: {
            'aws:sourceArn': `arn:${partition}:lambda:${this.region}:${this.account}:function:*`,
          },
        },
      }),
    );

    //Override logical Id
    const cfnContainerAssetRepo = containerAssetRepo.node.defaultChild as cdk.aws_ecr.CfnRepository;
    cfnContainerAssetRepo.overrideLogicalId('ContainerAssetsRepository');

    // Outputs
    new cdk.CfnOutput(this, 'BootstrapVersion', {
      value: '14',
      description: 'The version of the bootstrap resources that are currently mastered in this stack',
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.getAssetBucketName(),
      description: 'The name of the S3 bucket owned by the CDK toolkit stack',
    });

    new cdk.CfnOutput(this, 'BucketDomainName', {
      value: this.getAssetBucketDomainName(),
      description: 'The domain name of the S3 bucket owned by the CDK toolkit stack',
    });

    new cdk.CfnOutput(this, 'FileAssetKeyArn', {
      value: this.s3KmsKeyOutputValue,
      description: 'The ARN of the KMS key used to encrypt the asset bucket ',
      exportName: `CdkBootstrap-${this.qualifier}-FileAssetKeyArn`,
    });

    new cdk.CfnOutput(this, 'ImageRepositoryName', {
      value: this.getEcrRepoName(),
      description: 'The name of the ECR repository which hosts docker image assets ',
    });
  }

  createBucketCmk(props: { managementAccountId: string; partition: string }) {
    const s3Key = new cdk.aws_kms.Key(this, 'AssetEncryptionKey', {
      alias: 'accelerator/kms/cdk/key',
      description: 'Key used to encrypt centralized CDK assets',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Allow management account access
    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Management Actions',
        principals: [new cdk.aws_iam.AccountPrincipal(props.managementAccountId)],
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
        ],
        resources: ['*'],
      }),
    );

    s3Key.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: `Allow S3 to use the encryption key`,
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
        principals: [new cdk.aws_iam.AnyPrincipal()],
        actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
          ArnLike: {
            'aws:PrincipalARN': `arn:${props.partition}:iam::*:role/AWSAccelerator-*`,
          },
        },
      }),
    );
    return s3Key;
  }

  createAssetBucket(props: {
    bucketName: string;
    kmsKey: cdk.aws_kms.Key;
    accessRoleNames: string[];
    partition: string;
  }) {
    const assetBucket = new cdk.aws_s3.Bucket(this, 'StagingBucket', {
      encryption: cdk.aws_s3.BucketEncryption.KMS,
      encryptionKey: props.kmsKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
      bucketName: props.bucketName,
      versioned: true,
      objectOwnership: cdk.aws_s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
    });

    assetBucket.grantReadWrite(this.getOrgPrincipals(this.organizationId));
    assetBucket.grantReadWrite(new cdk.aws_iam.ServicePrincipal('cloudformation.amazonaws.com'));
    assetBucket.grantReadWrite(new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'));

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
  getEcrRepoName() {
    return `cdk-${this.qualifier}-container-assets-${this.account}-${this.region}`;
  }
}

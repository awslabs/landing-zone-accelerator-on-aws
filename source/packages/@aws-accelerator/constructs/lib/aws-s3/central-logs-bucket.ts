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
import { Construct } from 'constructs';
import { Bucket, BucketEncryptionType } from '@aws-accelerator/constructs';
import { GlobalConfig } from '@aws-accelerator/config';
import { S3LifeCycleRule } from './bucket';
import { BucketPrefixProps } from './bucket-prefix';
import { AwsPrincipalAccessesType, BucketAccessType, isRegionalServicePrincipal } from '@aws-accelerator/utils';

export interface CentralLogsBucketProps {
  s3BucketName: string;
  kmsAliasName: string;
  kmsDescription: string;
  principalOrgIdCondition: { [key: string]: string | string[] };
  orgPrincipals: cdk.aws_iam.IPrincipal;
  serverAccessLogsBucket: cdk.aws_s3.IBucket;
  s3LifeCycleRules?: S3LifeCycleRule[];
  /**
   * @optional
   * A list of AWS principals and access type the bucket to grant
   * principal should be a valid AWS resource principal like for AWS MacieSession it
   * should be macie.amazonaws.com accessType should be any of these possible
   * values BucketAccessType.READONLY, BucketAccessType.WRITEONLY, & and
   * BucketAccessType.READWRITE
   */
  awsPrincipalAccesses?: AwsPrincipalAccessesType[];
  bucketPrefixProps?: BucketPrefixProps;
  globalConfig?: GlobalConfig;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
  /**
   * Accelerator central log bucket cross account ssm parameter access role name
   */
  readonly crossAccountAccessRoleName: string;
  /**
   * Accelerator central log bucket cmk arn ssm parameter name
   */
  readonly cmkArnSsmParameterName: string;
  /**
   * Accelerator management account access role.
   */
  readonly managementAccountAccessRole: string;
}

/**
 * Class to initialize Policy
 */
export class CentralLogsBucket extends Construct {
  private readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: CentralLogsBucketProps) {
    super(scope, id);

    const awsPrincipalAccesses = props.awsPrincipalAccesses ?? [];

    // Derive the SourceOrgID condition value from principalOrgIdCondition
    const sourceOrgId = props.principalOrgIdCondition['aws:PrincipalOrgID'];

    // Create Central Logs Bucket
    // Note: awsPrincipalAccesses are NOT passed to the Bucket construct here because
    // the Bucket construct uses CDK grant methods (grantRead/grantWrite/grantReadWrite)
    // which do not support IAM conditions. Instead, explicit bucket policy statements
    // with aws:SourceOrgID conditions are added below for each security service principal.
    this.bucket = new Bucket(this, 'Resource', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: props.s3BucketName,
      kmsAliasName: props.kmsAliasName,
      kmsDescription: props.kmsDescription,
      serverAccessLogsBucket: props.serverAccessLogsBucket,
      s3LifeCycleRules: props.s3LifeCycleRules,
      bucketPrefixProps: props.bucketPrefixProps,
      nagSuppressionPrefix: `${id}/Resource`,
    });

    this.bucket.getKey().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Enable IAM User Permissions',
        principals: [new cdk.aws_iam.AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );

    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        principals: [
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('ssm.amazonaws.com'),
        ],
        actions: ['s3:PutObject'],
        resources: [this.bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            's3:x-amz-acl': 'bucket-owner-full-control',
            ...(props.principalOrgIdCondition['aws:PrincipalOrgID']
              ? { 'aws:SourceOrgID': props.principalOrgIdCondition['aws:PrincipalOrgID'] }
              : {}),
          },
        },
      }),
    );

    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        principals: [
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
        ],
        actions: ['s3:GetBucketAcl', 's3:ListBucket'],
        resources: [this.bucket.getS3Bucket().bucketArn],
        conditions: {
          ...(props.principalOrgIdCondition['aws:PrincipalOrgID']
            ? { StringEquals: { 'aws:SourceOrgID': props.principalOrgIdCondition['aws:PrincipalOrgID'] } }
            : {}),
        },
      }),
    );

    this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow S3 use of the key',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:GenerateRandom',
          'kms:GetKeyPolicy',
          'kms:GetKeyRotationStatus',
          'kms:ListAliases',
          'kms:ListGrants',
          'kms:ListKeyPolicies',
          'kms:ListKeys',
          'kms:ListResourceTags',
          'kms:ListRetirableGrants',
          'kms:ReEncryptFrom',
          'kms:ReEncryptTo',
        ],
        principals: [new cdk.aws_iam.ServicePrincipal('s3.amazonaws.com')],
        resources: ['*'],
      }),
    );

    this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow AWS Services to encrypt and describe logs',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyPair',
          'kms:GenerateDataKeyPairWithoutPlaintext',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:ReEncryptFrom',
          'kms:ReEncryptTo',
        ],
        principals: [
          new cdk.aws_iam.ServicePrincipal('config.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('delivery.logs.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('ssm.amazonaws.com'),
        ],
        resources: ['*'],
      }),
    );

    // Allow bucket encryption key for given aws principals
    awsPrincipalAccesses
      .filter(item => item.accessType !== BucketAccessType.NO_ACCESS)
      .filter(item => !isRegionalServicePrincipal(item.principal))
      .forEach(item => {
        this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow ${item.name} service to use the encryption key`,
            principals: [new cdk.aws_iam.ServicePrincipal(item.principal)],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
            resources: ['*'],
          }),
        );
      });

    // Add condition-based KMS statements for regional service principals grouped by service
    const regionalByService = new Map<string, string[]>();
    awsPrincipalAccesses
      .filter(item => item.accessType !== BucketAccessType.NO_ACCESS)
      .filter(item => isRegionalServicePrincipal(item.principal))
      .forEach(item => {
        const serviceName = item.principal.split('.')[0];
        const existing = regionalByService.get(serviceName) ?? [];
        existing.push(item.principal);
        regionalByService.set(serviceName, existing);
      });

    for (const [serviceName, principals] of regionalByService) {
      this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow ${serviceName} regional services to use the encryption key`,
          principals: [new cdk.aws_iam.StarPrincipal()],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
          resources: ['*'],
          conditions: { StringEquals: { 'aws:PrincipalServiceName': principals } },
        }),
      );
    }

    // Add explicit S3 bucket policy for security service principals with aws:SourceOrgID condition.
    // These are handled here instead of in the Bucket construct because CDK grant methods
    // (grantRead/grantWrite/grantReadWrite) do not support IAM conditions.
    // Non-regional (global) service principals: a direct Service principal is valid. Opt-in
    // region principals (e.g. macie.<region>.amazonaws.com) are handled separately below because
    // CloudFormation/S3 reject a direct regional Service principal when the opt-in region is not
    // activated in the account (issue #4918).
    awsPrincipalAccesses
      .filter(item => item.accessType !== BucketAccessType.NO_ACCESS && item.name !== 'SessionManager')
      .filter(item => !isRegionalServicePrincipal(item.principal))
      .forEach(item => {
        const actions: string[] = [];
        if (item.accessType === BucketAccessType.READONLY || item.accessType === BucketAccessType.READWRITE) {
          actions.push('s3:GetObject*', 's3:GetBucket*', 's3:List*');
        }
        if (item.accessType === BucketAccessType.WRITEONLY || item.accessType === BucketAccessType.READWRITE) {
          actions.push(
            's3:PutObject',
            's3:PutObjectLegalHold',
            's3:PutObjectRetention',
            's3:PutObjectTagging',
            's3:PutObjectVersionTagging',
            's3:Abort*',
            's3:DeleteObject*',
          );
        }
        this.bucket.getS3Bucket().addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow ${item.name} service access`,
            principals: [new cdk.aws_iam.ServicePrincipal(item.principal)],
            actions,
            resources: [this.bucket.getS3Bucket().bucketArn, this.bucket.getS3Bucket().arnForObjects('*')],
            conditions: {
              ...(sourceOrgId ? { StringEquals: { 'aws:SourceOrgID': sourceOrgId } } : {}),
            },
          }),
        );
      });

    // Opt-in region service principals grouped by service. A direct Service principal for a
    // non-activated opt-in region fails policy validation, so mirror the KMS block above and
    // Bucket.addConsolidatedRegionalAccess: one StarPrincipal statement per service scoped by
    // aws:PrincipalServiceName (and aws:SourceOrgID when set). Issue #4918.
    const s3RegionalActionsByService = new Map<string, Set<string>>();
    const s3RegionalPrincipalsByService = new Map<string, string[]>();
    awsPrincipalAccesses
      .filter(item => item.accessType !== BucketAccessType.NO_ACCESS && item.name !== 'SessionManager')
      .filter(item => isRegionalServicePrincipal(item.principal))
      .forEach(item => {
        const serviceName = item.principal.split('.')[0];
        const actions = s3RegionalActionsByService.get(serviceName) ?? new Set<string>();
        if (item.accessType === BucketAccessType.READONLY || item.accessType === BucketAccessType.READWRITE) {
          ['s3:GetObject*', 's3:GetBucket*', 's3:List*'].forEach(action => actions.add(action));
        }
        if (item.accessType === BucketAccessType.WRITEONLY || item.accessType === BucketAccessType.READWRITE) {
          [
            's3:PutObject',
            's3:PutObjectLegalHold',
            's3:PutObjectRetention',
            's3:PutObjectTagging',
            's3:PutObjectVersionTagging',
            's3:Abort*',
            's3:DeleteObject*',
          ].forEach(action => actions.add(action));
        }
        s3RegionalActionsByService.set(serviceName, actions);

        const principals = s3RegionalPrincipalsByService.get(serviceName) ?? [];
        principals.push(item.principal);
        s3RegionalPrincipalsByService.set(serviceName, principals);
      });

    for (const [serviceName, principals] of s3RegionalPrincipalsByService) {
      this.bucket.getS3Bucket().addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow ${serviceName} regional services access`,
          principals: [new cdk.aws_iam.StarPrincipal()],
          actions: [...(s3RegionalActionsByService.get(serviceName) ?? new Set<string>())],
          resources: [this.bucket.getS3Bucket().bucketArn, this.bucket.getS3Bucket().arnForObjects('*')],
          conditions: {
            StringEquals: {
              'aws:PrincipalServiceName': principals,
              ...(sourceOrgId ? { 'aws:SourceOrgID': sourceOrgId } : {}),
            },
          },
        }),
      );
    }

    props.awsPrincipalAccesses?.forEach(item => {
      if (item.name === 'SessionManager') {
        this.bucket.getS3Bucket().addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'Allow Organization principals to put objects',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:PutObjectAcl', 's3:PutObject'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            resources: [`${this.bucket.getS3Bucket().bucketArn}/*`],
            conditions: {
              StringEquals: {
                ...props.principalOrgIdCondition,
              },
              ArnLike: {
                'aws:PrincipalARN': [
                  `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}-*`,
                  `arn:${cdk.Stack.of(this).partition}:iam::*:role/cdk-accel-*`,
                  `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.managementAccountAccessRole}`,
                ],
              },
            },
          }),
        );

        this.bucket.getS3Bucket().addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'Allow Organization principals to get encryption context and acl',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetEncryptionConfiguration', 's3:GetBucketAcl'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            resources: [`${this.bucket.getS3Bucket().bucketArn}`],
            conditions: {
              StringEquals: {
                ...props.principalOrgIdCondition,
              },
            },
          }),
        );
      }
    });

    // Grant organization principals to use the bucket
    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization principals to use the bucket',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['s3:GetBucketLocation', 's3:GetBucketAcl', 's3:PutObject', 's3:GetObject', 's3:ListBucket'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: [this.bucket.getS3Bucket().bucketArn, `${this.bucket.getS3Bucket().bucketArn}/*`],
        conditions: {
          StringEquals: {
            ...props.principalOrgIdCondition,
          },
          ArnLike: {
            'aws:PrincipalARN': [
              `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}-*`,
              `arn:${cdk.Stack.of(this).partition}:iam::*:role/cdk-accel-*`,
              `arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.managementAccountAccessRole}`,
            ],
          },
        },
      }),
    );

    // Allow bucket to be used by other buckets in organization for replication
    this.bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization use of the bucket for replication',
        actions: [
          's3:List*',
          's3:GetBucketVersioning',
          's3:PutBucketVersioning',
          's3:ReplicateDelete',
          's3:ReplicateObject',
          's3:ObjectOwnerOverrideToBucketOwner',
        ],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: [this.bucket.getS3Bucket().bucketArn, this.bucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            ...props.principalOrgIdCondition,
          },
        },
      }),
    );

    this.bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization use of the key',
        actions: [
          'kms:Decrypt',
          'kms:DescribeKey',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:GenerateDataKeyPair',
          'kms:GenerateDataKeyPairWithoutPlaintext',
          'kms:GenerateDataKeyWithoutPlaintext',
          'kms:ReEncryptFrom',
          'kms:ReEncryptTo',
          'kms:ListAliases',
        ],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringEquals: {
            ...props.principalOrgIdCondition,
          },
        },
      }),
    );

    const centralLogBucketKmsKeyArnSsmParameter = new cdk.aws_ssm.StringParameter(
      this,
      'SsmParamCentralAccountBucketKMSArn',
      {
        parameterName: props.cmkArnSsmParameterName,
        stringValue: this.bucket.getKey().keyArn,
      },
    );
    // const roleArns = [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}*`];
    // SSM parameter access IAM Role for
    new cdk.aws_iam.Role(this, 'CrossAccountCentralBucketKMSArnSsmParamAccessRole', {
      roleName: props.crossAccountAccessRoleName,
      assumedBy: props.orgPrincipals,
      // assumedBy: new cdk.aws_iam.AnyPrincipal().withConditions({
      //   StringEquals: {
      //     ...props.principalOrgIdCondition,
      //   },
      //   ArnLike: {
      //     'aws:PrincipalArn': roleArns,
      //   },
      // }),
      inlinePolicies: {
        default: new cdk.aws_iam.PolicyDocument({
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:GetParameters', 'ssm:GetParameter'],
              resources: [centralLogBucketKmsKeyArnSsmParameter.parameterArn],
              conditions: {
                ArnLike: {
                  'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}-*`],
                },
              },
            }),
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              actions: ['ssm:DescribeParameters'],
              resources: ['*'],
              conditions: {
                ArnLike: {
                  'aws:PrincipalARN': [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.acceleratorPrefix}-*`],
                },
              },
            }),
          ],
        }),
      },
    });
  }

  public getS3Bucket(): Bucket {
    return this.bucket;
  }
}

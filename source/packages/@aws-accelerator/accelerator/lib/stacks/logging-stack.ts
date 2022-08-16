/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { AcceleratorElbRootAccounts } from '../accelerator';

import {
  Bucket,
  BucketEncryptionType,
  CentralLogsBucket,
  KeyLookup,
  Organization,
  S3PublicAccessBlock,
} from '@aws-accelerator/constructs';

import { LifecycleRule } from '@aws-accelerator/constructs/lib/aws-s3/bucket';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { Logger } from '../logger';

export class LoggingStack extends AcceleratorStack {
  private cloudwatchKey: cdk.aws_kms.IKey;
  private organizationId: string | undefined;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const centralLogsBucketName = `aws-accelerator-central-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
      props.globalConfig.homeRegion
    }`;

    this.setOrganizationId();

    //
    // Create S3 Key in all account
    this.createS3Key();

    // create kms key for CloudWatch logs
    // the CloudWatch key for the management account
    // in the home region is created in the prepare stack
    if (
      cdk.Stack.of(this).account === props.accountsConfig.getManagementAccountId() &&
      (cdk.Stack.of(this).region === this.props.globalConfig.homeRegion ||
        cdk.Stack.of(this).region === this.props.globalRegion)
    ) {
      this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
        this,
        'AcceleratorGetCloudWatchKey',
        cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          AcceleratorStack.CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
        ),
      );
    } else {
      this.cloudwatchKey = new cdk.aws_kms.Key(this, 'AcceleratorCloudWatchKey', {
        alias: AcceleratorStack.CLOUDWATCH_LOG_KEY_ALIAS,
        description: AcceleratorStack.CLOUDWATCH_LOG_KEY_DESCRIPTION,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      this.cloudwatchKey.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow Cloudwatch logs to use the encryption key`,
          principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
          actions: ['kms:Encrypt*', 'kms:Decrypt*', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:Describe*'],
          resources: ['*'],
          conditions: {
            ArnLike: {
              'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${cdk.Stack.of(this).region}:*:log-group:*`,
            },
          },
        }),
      );

      new cdk.aws_ssm.StringParameter(this, 'AcceleratorCloudWatchKmsArnParameter', {
        parameterName: '/accelerator/kms/cloudwatch/key-arn',
        stringValue: this.cloudwatchKey.keyArn,
      });
    }

    //
    // Block Public Access; S3 is global, only need to call in home region. This is done in the
    // logging-stack instead of the security-stack since initial buckets are created in this stack.
    //
    if (
      cdk.Stack.of(this).region === props.globalConfig.homeRegion &&
      !this.isAccountExcluded(props.securityConfig.centralSecurityServices.s3PublicAccessBlock.excludeAccounts ?? [])
    ) {
      if (props.securityConfig.centralSecurityServices.s3PublicAccessBlock.enable) {
        new S3PublicAccessBlock(this, 'S3PublicAccessBlock', {
          blockPublicAcls: true,
          blockPublicPolicy: true,
          ignorePublicAcls: true,
          restrictPublicBuckets: true,
          accountId: cdk.Stack.of(this).account,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }

    const lifecycleRules: LifecycleRule[] = [];
    for (const lifecycleRule of props.globalConfig.logging.accessLogBucket?.lifecycleRules ?? []) {
      const noncurrentVersionTransitions = [];
      for (const noncurrentVersionTransition of lifecycleRule.noncurrentVersionTransitions) {
        noncurrentVersionTransitions.push({
          storageClass: noncurrentVersionTransition.storageClass,
          transitionAfter: noncurrentVersionTransition.transitionAfter,
        });
      }
      const transitions = [];
      for (const transition of lifecycleRule.transitions) {
        transitions.push({
          storageClass: transition.storageClass,
          transitionAfter: transition.transitionAfter,
        });
      }
      const rule: LifecycleRule = {
        abortIncompleteMultipartUploadAfter: lifecycleRule.abortIncompleteMultipartUpload,
        enabled: lifecycleRule.enabled,
        expiration: lifecycleRule.expiration,
        expiredObjectDeleteMarker: lifecycleRule.expiredObjectDeleteMarker,
        id: lifecycleRule.id,
        noncurrentVersionExpiration: lifecycleRule.noncurrentVersionExpiration,
        noncurrentVersionTransitions,
        transitions,
      };
      lifecycleRules.push(rule);
    }

    //
    // Create S3 Bucket for Access Logs - this is required
    //
    const serverAccessLogsBucket = new Bucket(this, 'AccessLogsBucket', {
      encryptionType: BucketEncryptionType.SSE_S3, // Server access logging does not support SSE-KMS
      s3BucketName: `aws-accelerator-s3-access-logs-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      lifecycleRules,
    });

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/AccessLogsBucket/Resource/Resource`, [
      {
        id: 'AwsSolutions-S1',
        reason: 'AccessLogsBucket has server access logs disabled till the task for access logging completed.',
      },
    ]);

    serverAccessLogsBucket.getS3Bucket().addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'Allow write access for logging service principal',
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject'],
        principals: [new iam.ServicePrincipal('logging.s3.amazonaws.com')],
        resources: [serverAccessLogsBucket.getS3Bucket().arnForObjects('*')],
        conditions: {
          StringEquals: {
            'aws:SourceAccount': cdk.Stack.of(this).account,
          },
        },
      }),
    );

    // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
    NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/AccessLogsBucket/Resource/Resource`, [
      {
        id: 'AwsSolutions-S1',
        reason: 'AccessLogsBucket has server access logs disabled till the task for access logging completed.',
      },
    ]);

    //
    // Create Central Logs Bucket - This is done only in the home region of the log-archive account.
    // This is the destination bucket for all logs such as AWS CloudTrail, AWS Config, and VPC Flow
    // Logs. Addition logs can also be sent to this bucket through AWS CloudWatch Logs, such as
    // application logs, OS logs, or server logs.
    //
    //
    let centralLogsBucket: CentralLogsBucket | undefined;
    if (
      cdk.Stack.of(this).region === props.globalConfig.homeRegion &&
      cdk.Stack.of(this).account === props.accountsConfig.getLogArchiveAccountId()
    ) {
      const lifecycleRules: LifecycleRule[] = [];
      for (const lifecycleRule of props.globalConfig.logging.accessLogBucket?.lifecycleRules ?? []) {
        const noncurrentVersionTransitions = [];
        for (const noncurrentVersionTransition of lifecycleRule.noncurrentVersionTransitions) {
          noncurrentVersionTransitions.push({
            storageClass: noncurrentVersionTransition.storageClass,
            transitionAfter: noncurrentVersionTransition.transitionAfter,
          });
        }
        const transitions = [];
        for (const transition of lifecycleRule.transitions) {
          transitions.push({
            storageClass: transition.storageClass,
            transitionAfter: transition.transitionAfter,
          });
        }
        const rule: LifecycleRule = {
          abortIncompleteMultipartUploadAfter: lifecycleRule.abortIncompleteMultipartUpload,
          enabled: lifecycleRule.enabled,
          expiration: lifecycleRule.expiration,
          expiredObjectDeleteMarker: lifecycleRule.expiredObjectDeleteMarker,
          id: lifecycleRule.id,
          noncurrentVersionExpiration: lifecycleRule.noncurrentVersionExpiration,
          noncurrentVersionTransitions,
          transitions,
        };
        lifecycleRules.push(rule);
      }

      centralLogsBucket = new CentralLogsBucket(this, 'CentralLogsBucket', {
        s3BucketName: centralLogsBucketName,
        serverAccessLogsBucket: serverAccessLogsBucket,
        kmsAliasName: 'alias/accelerator/central-logs/s3',
        kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
        organizationId: this.organizationId,
        lifecycleRules,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/CentralLogsBucket/CrossAccountCentralBucketKMSArnSsmParamAccessRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Central logs bucket arn SSM parameter needs access from other accounts',
          },
        ],
      );
    }

    //
    // When home region central log bucket will be present to get key arn, custom resource will not be needed to get key arn from ssm parameter
    let centralLogBucketKey: cdk.aws_kms.IKey | undefined;
    if (centralLogsBucket) {
      centralLogBucketKey = centralLogsBucket.getS3Bucket().getKey();
    } else {
      centralLogBucketKey = new KeyLookup(this, 'AcceleratorCentralLogsBucketKey', {
        accountId: props.accountsConfig.getLogArchiveAccountId(),
        keyRegion: props.globalConfig.homeRegion,
        roleName: CentralLogsBucket.CROSS_ACCOUNT_SSM_PARAMETER_ACCESS_ROLE_NAME,
        keyArnParameterName: CentralLogsBucket.KEY_ARN_PARAMETER_NAME,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      }).getKey();
    }

    const replicationProps: BucketReplicationProps = {
      destination: {
        bucketName: centralLogsBucketName,
        accountId: props.accountsConfig.getLogArchiveAccountId(),
        keyArn: centralLogBucketKey!.keyArn,
      },
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    };

    /**
     * Create S3 Bucket for ELB Access Logs, this is created in log archive account
     * For ELB to write access logs bucket is needed to have SSE-S3 server-side encryption
     */
    if (cdk.Stack.of(this).account === props.accountsConfig.getLogArchiveAccountId()) {
      const elbAccessLogsBucket = new Bucket(this, 'ElbAccessLogsBucket', {
        encryptionType: BucketEncryptionType.SSE_S3, // Server access logging does not support SSE-KMS
        s3BucketName: `aws-accelerator-elb-access-logs-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
      });

      const policies = [
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow get acl access for SSM principal',
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetBucketAcl'],
          principals: [new iam.ServicePrincipal('ssm.amazonaws.com')],
          resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}`],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow write access for ELB Account principal',
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject'],
          principals: [new iam.AccountPrincipal(AcceleratorElbRootAccounts[cdk.Stack.of(this).region])],
          resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}/*`],
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow write access for delivery logging service principal',
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject'],
          principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}/*`],
          conditions: {
            StringEquals: {
              's3:x-amz-acl': 'bucket-owner-full-control',
            },
          },
        }),
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow read bucket ACL access for delivery logging service principal',
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetBucketAcl'],
          principals: [new iam.ServicePrincipal('delivery.logs.amazonaws.com')],
          resources: [`${elbAccessLogsBucket.getS3Bucket().bucketArn}`],
        }),
      ];

      policies.forEach(item => {
        elbAccessLogsBucket.getS3Bucket().addToResourcePolicy(item);
      });

      if (this.organizationId) {
        elbAccessLogsBucket.getS3Bucket().addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: 'Allow Organization principals to use of the bucket',
            effect: cdk.aws_iam.Effect.ALLOW,
            actions: ['s3:GetBucketLocation', 's3:PutObject'],
            principals: [new cdk.aws_iam.AnyPrincipal()],
            resources: [
              `${elbAccessLogsBucket.getS3Bucket().bucketArn}`,
              `${elbAccessLogsBucket.getS3Bucket().bucketArn}/*`,
            ],
            conditions: {
              StringEquals: {
                'aws:PrincipalOrgID': this.organizationId,
              },
            },
          }),
        );
      }

      // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/ElbAccessLogsBucket/Resource/Resource`, [
        {
          id: 'AwsSolutions-S1',
          reason: 'ElbAccessLogsBucket has server access logs disabled till the task for access logging completed.',
        },
      ]);
    }

    //
    // Create Central Logs Bucket - This is done only in the home region of the log-archive account.
    // This is the destination bucket for all logs such as AWS CloudTrail, AWS Config, and VPC Flow
    // Logs. Addition logs can also be sent to this bucket through AWS CloudWatch Logs, such as
    // application logs, OS logs, or server logs.
    //
    //
    if (
      cdk.Stack.of(this).region === props.globalConfig.homeRegion &&
      cdk.Stack.of(this).account === props.accountsConfig.getLogArchiveAccountId()
    ) {
      new CentralLogsBucket(this, 'CentralLogsBucket', {
        s3BucketName: `aws-accelerator-central-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
          props.globalConfig.homeRegion
        }`,
        serverAccessLogsBucket: serverAccessLogsBucket,
        kmsAliasName: 'alias/accelerator/central-logs/s3',
        kmsDescription: 'AWS Accelerator Central Logs Bucket CMK',
        organizationId,
        lifecycleRules,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/CentralLogsBucket/CrossAccountCentralBucketKMSArnSsmParamAccessRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Central logs bucket arn SSM parameter needs access from other accounts',
          },
        ],
      );
    }

    if (props.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable) {
      // create service linked role for autoscaling
      // if ebs default encryption enabled and using a customer master key
      new iam.CfnServiceLinkedRole(this, 'AutoScalingServiceLinkedRole', {
        awsServiceName: 'autoscaling.amazonaws.com',
        description:
          'Default Service-Linked Role enables access to AWS Services and Resources used or managed by Auto Scaling',
      });
    }
  }

  private setOrganizationId() {
    if (this.props.organizationConfig.enable) {
      this.organizationId = new Organization(this, 'Organization').id;
    }
  }

  /**
   * Function to create S3 Key
   */
  private createS3Key() {
    //
    // Crete S3 key in every account except audit account,
    // this is required for SSM automation to get right KMS key to encrypt unencrypted bucket
    if (cdk.Stack.of(this).account !== this.props.accountsConfig.getAuditAccountId()) {
      Logger.debug(`[Logging-stack] Create S3 Key`);
      const s3Key = new cdk.aws_kms.Key(this, 'Accelerator3Key', {
        alias: AcceleratorStack.S3_KEY_ALIAS,
        description: AcceleratorStack.S3_KEY_DESCRIPTION,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      s3Key.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: `Allow S3 to use the encryption key`,
          principals: [new cdk.aws_iam.AnyPrincipal()],
          actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey', 'kms:Describe*'],
          resources: ['*'],
          conditions: {
            StringEquals: {
              'kms:ViaService': `s3.${cdk.Stack.of(this).region}.amazonaws.com`,
              'aws:PrincipalOrgId': `${this.organizationId}`,
            },
          },
        }),
      );

      new cdk.aws_ssm.StringParameter(this, 'AcceleratorS3KmsArnParameter', {
        parameterName: AcceleratorStack.S3_KEY_ARN_PARAMETER_NAME,
        stringValue: s3Key.keyArn,
      });
    }
  }
}

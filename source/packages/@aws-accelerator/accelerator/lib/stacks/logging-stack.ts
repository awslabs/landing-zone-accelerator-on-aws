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
  SsmSessionManagerSettings,
} from '@aws-accelerator/constructs';

import { LifecycleRule } from '@aws-accelerator/constructs/lib/aws-s3/bucket';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';

export class LoggingStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const key = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    let organizationId: string | undefined = undefined;
    if (props.organizationConfig.enable) {
      const organization = new Organization(this, 'Organization');
      organizationId = organization.id;
    }

    //
    // Lifecycle rule object creation
    //
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
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
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

      if (organizationId) {
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
                'aws:PrincipalOrgID': organizationId,
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

    if (
      props.globalConfig.logging.sessionManager.sendToCloudWatchLogs ||
      props.globalConfig.logging.sessionManager.sendToS3
    ) {
      let centralLogBucket: cdk.aws_s3.IBucket | undefined;
      if (props.globalConfig.logging.sessionManager.sendToS3) {
        centralLogBucket = cdk.aws_s3.Bucket.fromBucketName(
          this,
          'AcceleratorLogsBucket',
          `aws-accelerator-s3-access-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
            cdk.Stack.of(this).region
          }`,
        );
      }

      // Set up Session Manager Logging
      if (
        !this.isAccountExcluded(props.globalConfig.logging.sessionManager.excludeAccounts ?? []) ||
        !this.isRegionExcluded(props.globalConfig.logging.sessionManager.excludeRegions ?? [])
      ) {
        new SsmSessionManagerSettings(this, 'SsmSessionManagerSettings', {
          s3BucketName: centralLogBucket ? centralLogBucket.bucketName : undefined,
          s3KeyPrefix: `AWSSessionManager/${cdk.Aws.ACCOUNT_ID}`,
          s3BucketKeyArn: centralLogBucket ? key.keyArn : undefined,
          sendToCloudWatchLogs: props.globalConfig.logging.sessionManager.sendToCloudWatchLogs,
          sendToS3: props.globalConfig.logging.sessionManager.sendToS3,
          cloudWatchEncryptionEnabled:
            props.partition !== 'aws-us-gov' && props.globalConfig.logging.sessionManager.sendToCloudWatchLogs,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/SsmSessionManagerSettings/SessionManagerEC2Policy/Resource`,
          [
            {
              id: 'AwsSolutions-IAM5',
              reason:
                'Policy needed access to all S3 objects for the account to put objects into the access log bucket',
            },
          ],
        );

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies.
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(
          this,
          `${this.stackName}/SsmSessionManagerSettings/SessionManagerEC2Role/Resource`,
          [
            {
              id: 'AwsSolutions-IAM4',
              reason: 'Create an IAM managed Policy for users to be able to use Session Manager with KMS encryption',
            },
          ],
        );
      }
    }
  }
}

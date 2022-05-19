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
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { pascalCase } from 'pascal-case';
import * as path from 'path';
import { S3ServerAccessLogsBucketNamePrefix } from '../accelerator';

import { Region } from '@aws-accelerator/config';
import {
  Bucket,
  BucketEncryptionType,
  Document,
  GuardDutyDetectorConfig,
  GuardDutyExportConfigDestinationTypes,
  GuardDutyMembers,
  KeyLookup,
  MacieMembers,
  Organization,
  SecurityHubMembers,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';
import { LifecycleRule } from '@aws-accelerator/constructs/lib/aws-s3/bucket';

export class SecurityAuditStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const key = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    const organizationId = props.organizationConfig.enable ? new Organization(this, 'Organization').id : '';

    //
    // Macie configuration
    //
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.macie.enable: ${props.securityConfig.centralSecurityServices.macie.enable}`,
    );

    if (props.securityConfig.centralSecurityServices.macie.enable) {
      Logger.info(
        `[security-audit-stack] Creating macie export config bucket - aws-accelerator-securitymacie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      );
      const lifecycleRules: LifecycleRule[] = [];
      for (const lifecycleRule of props.securityConfig.centralSecurityServices.macie.lifecycleRules) {
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

      const S3ServerAccessLogsBucketNamePrefix = 'aws-accelerator-s3-access-logs';
      const bucket = new Bucket(this, 'AwsMacieExportConfigBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `aws-accelerator-org-macie-disc-repo-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsKey: key,
        serverAccessLogsBucketName: `${S3ServerAccessLogsBucketNamePrefix}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        lifecycleRules,
      });

      new cdk.aws_ssm.StringParameter(this, 'SsmParamOrganizationMacieExportConfigBucketName', {
        parameterName: '/accelerator/organization/security/macie/discovery-repository/bucket-name',
        stringValue: bucket.getS3Bucket().bucketName,
      });

      // Grant macie access to the bucket
      bucket.getS3Bucket().grantReadWrite(new cdk.aws_iam.ServicePrincipal('macie.amazonaws.com'));

      // Grant organization principals to use the bucket
      bucket.getS3Bucket().addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Organization principals to use of the bucket',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['s3:GetBucketLocation', 's3:PutObject'],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: [bucket.getS3Bucket().bucketArn, `${bucket.getS3Bucket().bucketArn}/*`],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': organizationId,
            },
          },
        }),
      );

      // We also tag the bucket to record the fact that it has access for macie principal.
      cdk.Tags.of(bucket).add('aws-cdk:auto-macie-access-bucket', 'true');

      if (
        props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        Logger.info('[security-audit-stack] Adding Macie');

        new MacieMembers(this, 'MacieMembers', {
          adminAccountId: cdk.Stack.of(this).account,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }

    //
    // GuardDuty configuration
    //
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.guardduty.enable: ${props.securityConfig.centralSecurityServices.guardduty.enable}`,
    );

    if (props.securityConfig.centralSecurityServices.guardduty.enable) {
      const lifecycleRules: LifecycleRule[] = [];
      for (const lifecycleRule of props.securityConfig.centralSecurityServices.guardduty.lifecycleRules) {
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

      const bucket = new Bucket(this, 'GuardDutyPublishingDestinationBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `aws-accelerator-org-gduty-pub-dest-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsKey: key,
        serverAccessLogsBucketName: `${S3ServerAccessLogsBucketNamePrefix}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        lifecycleRules,
      });

      // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/GuardDutyPublishingDestinationBucket/Resource/Resource`,
        [
          {
            id: 'AwsSolutions-S1',
            reason:
              'GuardDutyPublishingDestinationBucket has server access logs disabled till the task for access logging completed.',
          },
        ],
      );

      new cdk.aws_ssm.StringParameter(this, 'SsmParamOrganizationGuardDutyPublishingDestinationBucketArn', {
        parameterName: '/accelerator/organization/security/guardduty/publishing-destination/bucket-arn',
        stringValue: bucket.getS3Bucket().bucketArn,
      });

      // Grant guardduty access to the bucket
      bucket.getS3Bucket().grantReadWrite(new cdk.aws_iam.ServicePrincipal('guardduty.amazonaws.com'));

      // Grant organization principals to use the bucket
      bucket.getS3Bucket().addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Organization principals to use of the bucket',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['s3:GetBucketLocation', 's3:PutObject'],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: [bucket.getS3Bucket().bucketArn, `${bucket.getS3Bucket().bucketArn}/*`],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': organizationId,
            },
          },
        }),
      );

      // We also tag the bucket to record the fact that it has access for guardduty principal.
      cdk.Tags.of(bucket).add('aws-cdk:auto-guardduty-access-bucket', 'true');

      if (
        props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        Logger.info('[security-audit-stack] Adding GuardDuty ');

        const guardDutyMembers = new GuardDutyMembers(this, 'GuardDutyMembers', {
          enableS3Protection: props.securityConfig.centralSecurityServices.guardduty.s3Protection.enable,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        new GuardDutyDetectorConfig(this, 'GuardDutyDetectorConfig', {
          isExportConfigEnable:
            props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.enable &&
            !props.securityConfig.centralSecurityServices.guardduty.s3Protection.excludeRegions!.includes(
              cdk.Stack.of(this).region as Region,
            ),
          exportDestination: GuardDutyExportConfigDestinationTypes.S3,
          exportFrequency: props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.exportFrequency,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        }).node.addDependency(guardDutyMembers);
      }
    }

    //
    // SecurityHub configuration
    //
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.securityHub.enable: ${props.securityConfig.centralSecurityServices.securityHub.enable}`,
    );
    if (
      props.securityConfig.centralSecurityServices.securityHub.enable &&
      props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      Logger.info('[security-audit-stack] Adding SecurityHub ');

      new SecurityHubMembers(this, 'SecurityHubMembers', {
        kmsKey: key,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }

    //
    // SSM Automation Docs
    //
    Logger.info(`[security-audit-stack] Adding SSM Automation Docs`);
    if (
      props.securityConfig.centralSecurityServices.ssmAutomation.excludeRegions === undefined ||
      props.securityConfig.centralSecurityServices.ssmAutomation.excludeRegions.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      //
      for (const documentSetItem of props.securityConfig.centralSecurityServices.ssmAutomation.documentSets ?? []) {
        // Create list of accounts to share with
        const accountIds: string[] = this.getAccountIdsFromShareTarget(documentSetItem.shareTargets);

        for (const documentItem of documentSetItem.documents ?? []) {
          Logger.info(`[security-audit-stack] Adding ${documentItem.name}`);

          // Read in the document which should be properly formatted
          const buffer = fs.readFileSync(path.join(props.configDirPath, documentItem.template), 'utf8');

          let content;
          if (documentItem.template.endsWith('.json')) {
            content = JSON.parse(buffer);
          } else {
            content = yaml.load(buffer);
          }

          // Create the document
          new Document(this, pascalCase(documentItem.name), {
            name: documentItem.name,
            content,
            documentType: 'Automation',
            sharedWithAccountIds: accountIds,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });
        }
      }
    }

    //
    // IAM Access Analyzer (Does not have a native service enabler)
    //
    Logger.debug(`[security-audit-stack] accessAnalyzer.enable: ${props.securityConfig.accessAnalyzer.enable}`);
    if (props.securityConfig.accessAnalyzer.enable && props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      Logger.info('[security-audit-stack] Adding IAM Access Analyzer ');
      new cdk.aws_accessanalyzer.CfnAnalyzer(this, 'AccessAnalyzer', {
        type: 'ORGANIZATION',
      });
    }

    //
    // SNS Notification Topics and Subscriptions
    //
    Logger.info(`[security-audit-stack] Create SNS Topics and Subscriptions`);

    // // Create CMK for topic
    // // TODO: replace this with the single Accelerator key
    // const topicCmk = new cdk.aws_kms.Key(this, 'TopicCmk', {
    //   enableKeyRotation: true,
    //   description: 'AWS Accelerator SNS Topic CMK',
    // });
    // topicCmk.addAlias('accelerator/sns/topic');
    // topicCmk.addToResourcePolicy(
    //   new cdk.aws_iam.PolicyStatement({
    //     sid: 'Allow Organization use of the key',
    //     actions: [
    //       'kms:Decrypt',
    //       'kms:DescribeKey',
    //       'kms:Encrypt',
    //       'kms:GenerateDataKey',
    //       'kms:GenerateDataKeyPair',
    //       'kms:GenerateDataKeyPairWithoutPlaintext',
    //       'kms:GenerateDataKeyWithoutPlaintext',
    //       'kms:ReEncryptFrom',
    //       'kms:ReEncryptTo',
    //     ],
    //     principals: [new cdk.aws_iam.AnyPrincipal()],
    //     resources: ['*'],
    //     conditions: {
    //       StringEquals: {
    //         'aws:PrincipalOrgID': organizationId,
    //       },
    //     },
    //   }),
    // );
    // topicCmk.addToResourcePolicy(
    //   new cdk.aws_iam.PolicyStatement({
    //     sid: 'Allow AWS Services to encrypt and describe logs',
    //     actions: [
    //       'kms:Decrypt',
    //       'kms:DescribeKey',
    //       'kms:Encrypt',
    //       'kms:GenerateDataKey',
    //       'kms:GenerateDataKeyPair',
    //       'kms:GenerateDataKeyPairWithoutPlaintext',
    //       'kms:GenerateDataKeyWithoutPlaintext',
    //       'kms:ReEncryptFrom',
    //       'kms:ReEncryptTo',
    //     ],
    //     principals: [
    //       new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com'),
    //       new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
    //     ],
    //     resources: ['*'],
    //   }),
    // );

    // Loop through all the subscription entries
    for (const snsSubscriptionItem of props.securityConfig.centralSecurityServices.snsSubscriptions ?? []) {
      Logger.info(`[security-audit-stack] Create SNS Topic: ${snsSubscriptionItem.level}`);
      const topic = new cdk.aws_sns.Topic(this, `${pascalCase(snsSubscriptionItem.level)}SnsTopic`, {
        displayName: `AWS Accelerator - ${snsSubscriptionItem.level} Notifications`,
        topicName: `aws-accelerator-${snsSubscriptionItem.level}Notifications`,
        masterKey: key,
      });

      // Allowing Publish from CloudWatch Service form any account
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com'),
      });

      // Allowing Publish from Lambda Service form any account
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      });

      // Allowing Publish from Organization
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.OrganizationPrincipal(organizationId),
      });

      topic.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Organization list topic',
          actions: ['sns:ListSubscriptionsByTopic', 'sns:ListTagsForResource', 'sns:GetTopicAttributes'],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: [topic.topicArn],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': organizationId,
            },
          },
        }),
      );

      Logger.info(`[security-audit-stack] Create SNS Subscription: ${snsSubscriptionItem.email}`);
      topic.addSubscription(new cdk.aws_sns_subscriptions.EmailSubscription(snsSubscriptionItem.email));
    }
    Logger.info('[security-audit-stack] Completed stack synthesis');
  }
}

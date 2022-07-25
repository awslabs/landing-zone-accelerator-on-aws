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
  AuditManagerDefaultReportsDestination,
  AuditManagerDefaultReportsDestinationTypes,
  GuardDutyMembers,
  DetectiveGraphConfig,
  DetectiveMembers,
  KeyLookup,
  MacieMembers,
  Organization,
  SecurityHubMembers,
  SecurityHubRegionAggregation,
} from '@aws-accelerator/constructs';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';
import { LifecycleRule } from '@aws-accelerator/constructs/lib/aws-s3/bucket';
import { SnsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class SecurityAuditStack extends AcceleratorStack {
  private readonly key: cdk.aws_kms.Key;
  private organizationId: string;
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.key = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    this.organizationId = props.organizationConfig.enable ? new Organization(this, 'Organization').id : '';

    //
    // Macie configuration
    //
    this.configureMacie();

    //
    // GuardDuty configuration
    //
    this.configureGuardDuty();

    //
    // Audit Manager configuration
    //
    this.configureAuditManager();

    // Detective configuration
    //
    this.configureDetectiveGraph();

    //
    // SecurityHub configuration
    //
    this.configureSecurityHub();

    //
    // SSM Automation Docs
    //
    this.configureSsmAutomation();

    //
    // IAM Access Analyzer (Does not have a native service enabler)
    //
    this.configureAccessAnalyzer();

    //
    // SNS Notification Topics and Subscriptions
    //
    this.configureSnsSubscriptions();

    // create lambda function to forward
    // control tower notifications to the management account
    this.configureControlTowerNotificationForwarding();

    Logger.info('[security-audit-stack] Completed stack synthesis');
  }

  /**
   * Function to configure Macie
   */
  private configureMacie() {
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.macie.enable: ${this.props.securityConfig.centralSecurityServices.macie.enable}`,
    );
    if (this.props.securityConfig.centralSecurityServices.macie.enable) {
      Logger.info(
        `[security-audit-stack] Creating macie export config bucket - aws-accelerator-securitymacie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      );
      const lifecycleRules: LifecycleRule[] = [];
      for (const lifecycleRule of this.props.securityConfig.centralSecurityServices.macie.lifecycleRules ?? []) {
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

      const bucket = new Bucket(this, 'AwsMacieExportConfigBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `aws-accelerator-org-macie-disc-repo-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsKey: this.key,
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
              'aws:PrincipalOrgID': this.organizationId,
            },
          },
        }),
      );

      // We also tag the bucket to record the fact that it has access for macie principal.
      cdk.Tags.of(bucket).add('aws-cdk:auto-macie-access-bucket', 'true');

      if (
        this.props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        Logger.info('[security-audit-stack] Adding Macie');

        new MacieMembers(this, 'MacieMembers', {
          adminAccountId: cdk.Stack.of(this).account,
          kmsKey: this.key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
  }

  /**
   * Function to configure GuardDuty
   */
  private configureGuardDuty() {
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.guardduty.enable: ${this.props.securityConfig.centralSecurityServices.guardduty.enable}`,
    );

    if (this.props.securityConfig.centralSecurityServices.guardduty.enable) {
      const lifecycleRules: LifecycleRule[] = [];
      for (const lifecycleRule of this.props.securityConfig.centralSecurityServices.guardduty.lifecycleRules ?? []) {
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
        kmsKey: this.key,
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
              'aws:PrincipalOrgID': this.organizationId,
            },
          },
        }),
      );

      // We also tag the bucket to record the fact that it has access for guardduty principal.
      cdk.Tags.of(bucket).add('aws-cdk:auto-guardduty-access-bucket', 'true');

      if (
        this.props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        Logger.info('[security-audit-stack] Adding GuardDuty ');

        const guardDutyMembers = new GuardDutyMembers(this, 'GuardDutyMembers', {
          enableS3Protection: this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.enable,
          kmsKey: this.key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });

        new GuardDutyDetectorConfig(this, 'GuardDutyDetectorConfig', {
          isExportConfigEnable:
            this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.enable &&
            !this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.excludeRegions!.includes(
              cdk.Stack.of(this).region as Region,
            ),
          exportDestination: GuardDutyExportConfigDestinationTypes.S3,
          exportFrequency:
            this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.exportFrequency,
          kmsKey: this.key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        }).node.addDependency(guardDutyMembers);
      }
    }
  }

  /**
   * Function to configure Audit manager
   */
  private configureAuditManager() {
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.auditManager?.enable: ${this.props.securityConfig.centralSecurityServices.auditManager?.enable}`,
    );

    if (this.props.securityConfig.centralSecurityServices.auditManager?.enable) {
      Logger.info('[security-audit-stack] Adding Audit Manager ');

      const lifecycleRules: LifecycleRule[] = [];
      for (const lifecycleRule of this.props.securityConfig.centralSecurityServices.auditManager?.lifecycleRules ??
        []) {
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

      const bucket = new Bucket(this, 'AuditManagerPublishingDestinationBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `aws-accelerator-audmgr-pub-dest-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsKey: this.key,
        serverAccessLogsBucketName: `${S3ServerAccessLogsBucketNamePrefix}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        lifecycleRules,
      });

      // AwsSolutions-S1: The S3 Bucket has server access logs disabled.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `${this.stackName}/AuditManagerPublishingDestinationBucket/Resource/Resource`,
        [
          {
            id: 'AwsSolutions-S1',
            reason:
              'AuditManagerPublishingDestinationBucket has server access logs disabled till the task for access logging completed.',
          },
        ],
      );

      new cdk.aws_ssm.StringParameter(this, 'SsmParamOrganizationAuditManagerPublishingDestinationBucketArn', {
        parameterName: '/accelerator/organization/security/auditManager/publishing-destination/bucket-arn',
        stringValue: bucket.getS3Bucket().bucketArn,
      });

      // Grant audit manager access to the bucket
      bucket.getS3Bucket().grantReadWrite(new cdk.aws_iam.ServicePrincipal('auditmanager.amazonaws.com'));

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
              'aws:PrincipalOrgID': this.organizationId,
            },
          },
        }),
      );

      // We also tag the bucket to record the fact that it has access for guardduty principal.
      cdk.Tags.of(bucket).add('aws-cdk:auto-auditManager-access-bucket', 'true');

      if (this.props.securityConfig.centralSecurityServices.auditManager?.defaultReportsConfiguration.enable) {
        new AuditManagerDefaultReportsDestination(this, 'AuditManagerDefaultReportsDestination', {
          defaultReportsDestinationType: AuditManagerDefaultReportsDestinationTypes.S3,
          kmsKey: this.key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          bucket: 's3://'.concat(bucket.getS3Bucket().bucketName),
        });
      }
    }
  }

  /**
   * Function to configure DetectiveGraph
   */
  private configureDetectiveGraph() {
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.detective?.enable: ${this.props.securityConfig.centralSecurityServices.detective?.enable}`,
    );

    if (this.props.securityConfig.centralSecurityServices.detective?.enable) {
      if (
        this.props.securityConfig.centralSecurityServices.detective?.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        Logger.info('[security-audit-stack] Adding Detective ');

        const detectiveMembers = new DetectiveMembers(this, 'DetectiveMembers', {
          kmsKey: this.key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });

        new DetectiveGraphConfig(this, 'DetectiveGraphConfig', {
          kmsKey: this.key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        }).node.addDependency(detectiveMembers);
      }
    }
  }

  /**
   * Function to configure SecurityHub
   */
  private configureSecurityHub() {
    Logger.debug(
      `[security-audit-stack] centralSecurityServices.securityHub.enable: ${this.props.securityConfig.centralSecurityServices.securityHub.enable}`,
    );
    if (
      this.props.securityConfig.centralSecurityServices.securityHub.enable &&
      this.props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      Logger.info('[security-audit-stack] Adding SecurityHub ');

      new SecurityHubMembers(this, 'SecurityHubMembers', {
        kmsKey: this.key,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });

      Logger.debug(
        `[security-audit-stack] centralSecurityServices.securityHub.regionAggregation: ${this.props.securityConfig.centralSecurityServices.securityHub.regionAggregation}`,
      );
      if (
        this.props.securityConfig.centralSecurityServices.securityHub.enable &&
        this.props.securityConfig.centralSecurityServices.securityHub.regionAggregation &&
        this.props.globalConfig.homeRegion == cdk.Stack.of(this).region
      ) {
        Logger.info('[security-audit-stack] Enabling region aggregation for SecurityHub in the Home Region');

        new SecurityHubRegionAggregation(this, 'SecurityHubRegionAggregation', {
          kmsKey: this.key,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
    }
  }

  /**
   * Configure SSM Automation
   */
  private configureSsmAutomation() {
    //
    // SSM Automation Docs
    //
    Logger.info(`[security-audit-stack] Adding SSM Automation Docs`);
    if (
      this.props.securityConfig.centralSecurityServices.ssmAutomation.excludeRegions === undefined ||
      this.props.securityConfig.centralSecurityServices.ssmAutomation.excludeRegions.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      //
      for (const documentSetItem of this.props.securityConfig.centralSecurityServices.ssmAutomation.documentSets ??
        []) {
        // Create list of accounts to share with
        const accountIds: string[] = this.getAccountIdsFromShareTarget(documentSetItem.shareTargets);

        for (const documentItem of documentSetItem.documents ?? []) {
          Logger.info(`[security-audit-stack] Adding ${documentItem.name}`);

          // Read in the document which should be properly formatted
          const buffer = fs.readFileSync(path.join(this.props.configDirPath, documentItem.template), 'utf8');

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
            kmsKey: this.key,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
        }
      }
    }
  }

  /**
   * Function to configure Access Analyzer
   */
  private configureAccessAnalyzer() {
    Logger.debug(`[security-audit-stack] accessAnalyzer.enable: ${this.props.securityConfig.accessAnalyzer.enable}`);
    if (
      this.props.securityConfig.accessAnalyzer.enable &&
      this.props.globalConfig.homeRegion === cdk.Stack.of(this).region
    ) {
      Logger.info('[security-audit-stack] Adding IAM Access Analyzer ');
      new cdk.aws_accessanalyzer.CfnAnalyzer(this, 'AccessAnalyzer', {
        type: 'ORGANIZATION',
      });
    }
  }

  /**
   * Function to configure SNS subscriptions
   */
  private configureSnsSubscriptions() {
    Logger.info(`[security-audit-stack] Create SNS Topics and Subscriptions`);

    // Loop through all the subscription entries
    for (const snsSubscriptionItem of this.props.securityConfig.centralSecurityServices.snsSubscriptions ?? []) {
      Logger.info(`[security-audit-stack] Create SNS Topic: ${snsSubscriptionItem.level}`);
      const topic = new cdk.aws_sns.Topic(this, `${pascalCase(snsSubscriptionItem.level)}SnsTopic`, {
        displayName: `AWS Accelerator - ${snsSubscriptionItem.level} Notifications`,
        topicName: `aws-accelerator-${snsSubscriptionItem.level}Notifications`,
        masterKey: this.key,
      });

      // Allowing Publish from CloudWatch Service from any account
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com'),
      });

      // Allowing Publish from Lambda Service from any account
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
      });

      // Allowing Publish from Organization
      topic.grantPublish({
        grantPrincipal: new cdk.aws_iam.OrganizationPrincipal(this.organizationId),
      });

      topic.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Organization list topic',
          actions: ['sns:ListSubscriptionsByTopic', 'sns:ListTagsForResource', 'sns:GetTopicAttributes'],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: [topic.topicArn],
          conditions: {
            StringEquals: {
              'aws:PrincipalOrgID': this.organizationId,
            },
          },
        }),
      );

      Logger.info(`[security-audit-stack] Create SNS Subscription: ${snsSubscriptionItem.email}`);
      topic.addSubscription(new cdk.aws_sns_subscriptions.EmailSubscription(snsSubscriptionItem.email));
    }
  }

  /**
   * Function to configure Control Tower notification forwarding
   */
  private configureControlTowerNotificationForwarding() {
    if (
      this.props.globalConfig.controlTower.enable &&
      cdk.Stack.of(this).region == this.props.globalConfig.homeRegion
    ) {
      const mgmtAccountSnsTopicArn = `arn:${cdk.Stack.of(this).partition}:sns:${
        cdk.Stack.of(this).region
      }:${this.props.accountsConfig.getManagementAccountId()}:AWSAccelerator-ControlTowerNotification`;
      const controlTowerNotificationsForwarderFunction = new cdk.aws_lambda.Function(
        this,
        'ControlTowerNotificationsForwarderFunction',
        {
          code: cdk.aws_lambda.Code.fromAsset(
            path.join(__dirname, '../lambdas/control-tower-notifications-forwarder/dist'),
          ),
          runtime: cdk.aws_lambda.Runtime.NODEJS_14_X,
          handler: 'index.handler',
          description: 'Lambda function to forward ControlTower notifications to management account',
          timeout: cdk.Duration.minutes(2),
          environment: {
            SNS_TOPIC_ARN: mgmtAccountSnsTopicArn,
          },
        },
      );
      controlTowerNotificationsForwarderFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'sns',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['sns:Publish'],
          resources: [mgmtAccountSnsTopicArn],
        }),
      );

      controlTowerNotificationsForwarderFunction.addToRolePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'kms',
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['kms:DescribeKey', 'kms:GenerateDataKey', 'kms:Decrypt', 'kms:Encrypt'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:kms:${
              cdk.Stack.of(this).region
            }:${this.props.accountsConfig.getManagementAccountId()}:key/*`,
          ],
        }),
      );

      const existingControlTowerSNSTopic = cdk.aws_sns.Topic.fromTopicArn(
        this,
        'ControlTowerSNSTopic',
        `arn:${cdk.Stack.of(this).partition}:sns:${cdk.Stack.of(this).region}:${
          cdk.Stack.of(this).account
        }:aws-controltower-AggregateSecurityNotifications`,
      );

      controlTowerNotificationsForwarderFunction.addEventSource(new SnsEventSource(existingControlTowerSNSTopic));
    }

    // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/ControlTowerNotificationsForwarderFunction/ServiceRole/Resource`,
      [
        {
          id: 'AwsSolutions-IAM4',
          reason: 'AWS Custom resource provider lambda role created by cdk.',
        },
      ],
    );

    // AwsSolutions-IAM5: TThe IAM entity contains wildcard permissions
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `${this.stackName}/ControlTowerNotificationsForwarderFunction/ServiceRole/DefaultPolicy/Resource`,
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Require access to all keys in management account',
        },
      ],
    );
  }
}

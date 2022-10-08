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

import { Region } from '@aws-accelerator/config';
import {
  Bucket,
  BucketEncryptionType,
  BucketReplicationProps,
  CentralLogsBucket,
  Document,
  GuardDutyDetectorConfig,
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
import { SnsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class SecurityAuditStack extends AcceleratorStack {
  private readonly s3Key: cdk.aws_kms.Key;
  private readonly cloudwatchKey: cdk.aws_kms.IKey;
  private readonly centralLogsBucketKey: cdk.aws_kms.Key;
  private readonly organizationId: string;
  private readonly replicationProps: BucketReplicationProps;
  private readonly centralLogsBucketName: string;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.centralLogsBucketName = `${
      AcceleratorStack.ACCELERATOR_CENTRAL_LOGS_BUCKET_NAME_PREFIX
    }-${props.accountsConfig.getLogArchiveAccountId()}-${props.globalConfig.homeRegion}`;

    this.s3Key = new KeyLookup(this, 'AcceleratorS3Key', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.ACCELERATOR_CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: AcceleratorStack.ACCELERATOR_S3_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        AcceleratorStack.ACCELERATOR_CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME,
      ),
    );

    this.centralLogsBucketKey = new KeyLookup(this, 'CentralLogsBucketKey', {
      accountId: props.accountsConfig.getLogArchiveAccountId(),
      keyRegion: props.globalConfig.homeRegion,
      roleName: CentralLogsBucket.CROSS_ACCOUNT_SSM_PARAMETER_ACCESS_ROLE_NAME,
      keyArnParameterName: CentralLogsBucket.KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    this.replicationProps = {
      destination: {
        bucketName: this.centralLogsBucketName,
        accountId: props.accountsConfig.getLogArchiveAccountId(),
        keyArn: this.centralLogsBucketKey.keyArn,
      },
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    };

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
    this.configureDetective();

    //
    // SecurityHub configuration
    //
    this.configureSecurityHub();

    //
    // SSM Automation Docs
    //
    this.configureSsmDocuments();

    //
    // IAM Access Analyzer (Does not have a native service enabler)
    //
    this.configureIamAnalyzer();

    //
    // SNS Notification Topics and Subscriptions
    //
    this.configureSnsNotifications();

    //
    // create lambda function to forward
    // control tower notifications to the management account
    //
    this.configureControlTowerNotification();

    //
    // CloudTrail Logs Bucket Creation
    //
    this.createCloudTrailLogsBucket();

    Logger.info('[security-audit-stack] Completed stack synthesis');
  }

  private createCloudTrailLogsBucket() {
    Logger.info(`[security-audit-stack] CloudTrail Logging S3 Bucket`);

    const bucket = new Bucket(this, 'AcceleratorCloudTrailBucket', {
      encryptionType: BucketEncryptionType.SSE_KMS,
      s3BucketName: `${AcceleratorStack.ACCELERATOR_CLOUDTRAIL_BUCKET_NAME_PREFIX}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      kmsKey: this.s3Key,
      serverAccessLogsBucketName: `${AcceleratorStack.ACCELERATOR_S3_ACCESS_LOGS_BUCKET_NAME_PREFIX}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      s3LifeCycleRules: this.getS3LifeCycleRules(this.props.globalConfig.logging.cloudtrail.lifecycleRules),
      replicationProps: this.replicationProps,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamOrganizationCloudTrailLogBucketName', {
      parameterName: AcceleratorStack.ACCELERATOR_CLOUDTRAIL_BUCKET_NAME_PARAMETER_NAME,
      stringValue: bucket.getS3Bucket().bucketName,
    });

    // Grant cloudtrail access to the bucket
    bucket.getS3Bucket().grantReadWrite(new cdk.aws_iam.ServicePrincipal('cloudtrail.amazonaws.com'));

    // Grant organization principals to use the bucket
    bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization principals to use of the bucket',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['s3:GetBucketLocation', 's3:PutObject', 's3:PutObjectAcl'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: [bucket.getS3Bucket().bucketArn, `${bucket.getS3Bucket().bucketArn}/*`],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    bucket.getS3Bucket().addToResourcePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Allow Organization principals to get encryption context',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['s3:GetEncryptionConfiguration'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: [`${bucket.getS3Bucket().bucketArn}`],
        conditions: {
          StringEquals: {
            ...this.getPrincipalOrgIdCondition(this.organizationId),
          },
        },
      }),
    );

    // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
    NagSuppressions.addResourceSuppressionsByPath(
      this,
      `/${this.stackName}/AcceleratorCloudTrailBucket/AcceleratorCloudTrailBucketReplication/` +
        pascalCase(this.centralLogsBucketName) +
        '-ReplicationRole/DefaultPolicy/Resource',
      [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'Allows only specific policy.',
        },
      ],
    );
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
        `[security-audit-stack] Creating macie export config bucket - aws-accelerator-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      );

      if (
        this.props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        Logger.info('[security-audit-stack] Adding Macie');

        new MacieMembers(this, 'MacieMembers', {
          adminAccountId: cdk.Stack.of(this).account,
          kmsKey: this.cloudwatchKey,
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
      if (
        this.props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        Logger.info('[security-audit-stack] Enabling GuardDuty for all existing accounts');

        const guardDutyMembers = new GuardDutyMembers(this, 'GuardDutyMembers', {
          enableS3Protection: this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.enable,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });

        if (
          this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.excludeRegions!.indexOf(
            cdk.Stack.of(this).region as Region,
          ) === -1
        ) {
          new GuardDutyDetectorConfig(this, 'GuardDutyDetectorConfig', {
            exportFrequency:
              this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.exportFrequency ??
              'FIFTEEN_MINUTES',
            enableS3Protection: this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.enable,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          }).node.addDependency(guardDutyMembers);
        }
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

      const bucket = new Bucket(this, 'AuditManagerPublishingDestinationBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `${AcceleratorStack.ACCELERATOR_AUDIT_MANAGER_BUCKET_NAME_PREFIX}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsKey: this.s3Key,
        serverAccessLogsBucketName: `${AcceleratorStack.ACCELERATOR_S3_ACCESS_LOGS_BUCKET_NAME_PREFIX}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        s3LifeCycleRules: this.getS3LifeCycleRules(
          this.props.securityConfig.centralSecurityServices.auditManager?.lifecycleRules,
        ),
        replicationProps: this.replicationProps,
      });

      cdk.Tags.of(bucket).add(`aws-cdk:auto-audit-manager-access-bucket`, 'true');

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

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/AuditManagerPublishingDestinationBucket/AuditManagerPublishingDestinationBucketReplication/` +
          pascalCase(this.centralLogsBucketName) +
          '-ReplicationRole/DefaultPolicy/Resource',
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Allows only specific policy.',
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
              ...this.getPrincipalOrgIdCondition(this.organizationId),
            },
          },
        }),
      );

      // We also tag the bucket to record the fact that it has access for guardduty principal.
      cdk.Tags.of(bucket).add('aws-cdk:auto-auditManager-access-bucket', 'true');

      if (this.props.securityConfig.centralSecurityServices.auditManager?.defaultReportsConfiguration.enable) {
        new AuditManagerDefaultReportsDestination(this, 'AuditManagerDefaultReportsDestination', {
          defaultReportsDestinationType: AuditManagerDefaultReportsDestinationTypes.S3,
          bucketKmsKey: this.s3Key,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          bucket: `s3://'${bucket.getS3Bucket().bucketName}/audit-manager/${cdk.Stack.of(this).account}/`,
        });
      }
    }
  }

  /**
   * Function to Configure Detective
   */
  private configureDetective() {
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
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });

        new DetectiveGraphConfig(this, 'DetectiveGraphConfig', {
          kmsKey: this.cloudwatchKey,
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
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }

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
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }
  }

  /**
   * Function to configure SSM documents
   */
  private configureSsmDocuments() {
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
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
          });
        }
      }
    }
  }

  /**
   * Function to configure IAM Analyzer
   */
  private configureIamAnalyzer() {
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
   * Function to configure SNS Notifications
   */
  private configureSnsNotifications() {
    Logger.info(`[security-audit-stack] Create SNS Topics and Subscriptions`);

    //
    // Create KMS Key for SNS topic when there are SNS topics are to be created
    let snsKey: cdk.aws_kms.Key | undefined;
    if (this.props.securityConfig.centralSecurityServices.snsSubscriptions ?? [].length > 0) {
      snsKey = new cdk.aws_kms.Key(this, 'AcceleratorSnsKey', {
        alias: AcceleratorStack.ACCELERATOR_SNS_KEY_ALIAS,
        description: AcceleratorStack.ACCELERATOR_SNS_KEY_DESCRIPTION,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    }

    // Loop through all the subscription entries
    for (const snsSubscriptionItem of this.props.securityConfig.centralSecurityServices.snsSubscriptions ?? []) {
      Logger.info(`[security-audit-stack] Create SNS Topic: ${snsSubscriptionItem.level}`);
      const topic = new cdk.aws_sns.Topic(this, `${pascalCase(snsSubscriptionItem.level)}SnsTopic`, {
        displayName: `AWS Accelerator - ${snsSubscriptionItem.level} Notifications`,
        topicName: `aws-accelerator-${snsSubscriptionItem.level}Notifications`,
        masterKey: snsKey,
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
        grantPrincipal: this.getOrgPrincipals(this.organizationId),
      });

      topic.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Organization list topic',
          actions: ['sns:ListSubscriptionsByTopic', 'sns:ListTagsForResource', 'sns:GetTopicAttributes'],
          principals: [new cdk.aws_iam.AnyPrincipal()],
          resources: [topic.topicArn],
          conditions: {
            StringEquals: {
              ...this.getPrincipalOrgIdCondition(this.organizationId),
            },
          },
        }),
      );

      Logger.info(`[security-audit-stack] Create SNS Subscription: ${snsSubscriptionItem.email}`);
      topic.addSubscription(new cdk.aws_sns_subscriptions.EmailSubscription(snsSubscriptionItem.email));
    }
  }

  /**
   * Function to configure CT notification
   */
  private configureControlTowerNotification() {
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

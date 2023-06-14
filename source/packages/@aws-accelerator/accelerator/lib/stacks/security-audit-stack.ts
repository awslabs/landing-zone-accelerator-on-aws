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
  Document,
  GuardDutyDetectorConfig,
  AuditManagerDefaultReportsDestination,
  AuditManagerDefaultReportsDestinationTypes,
  GuardDutyMembers,
  DetectiveGraphConfig,
  DetectiveMembers,
  KeyLookup,
  MacieMembers,
  SecurityHubMembers,
  SecurityHubRegionAggregation,
} from '@aws-accelerator/constructs';

import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { SnsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class SecurityAuditStack extends AcceleratorStack {
  private readonly s3Key: cdk.aws_kms.Key;
  private readonly cloudwatchKey: cdk.aws_kms.IKey;
  private readonly centralLogsBucketKey: cdk.aws_kms.Key;
  private readonly replicationProps: BucketReplicationProps;
  private readonly centralLogsBucketName: string;

  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    this.centralLogsBucketName = `${
      this.acceleratorResourceNames.bucketPrefixes.centralLogs
    }-${props.accountsConfig.getLogArchiveAccountId()}-${props.centralizedLoggingRegion}`;

    this.s3Key = new KeyLookup(this, 'AcceleratorS3Key', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: this.acceleratorResourceNames.roles.crossAccountCmkArnSsmParameterAccess,
      keyArnParameterName: this.acceleratorResourceNames.parameters.s3CmkArn,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      acceleratorPrefix: props.prefixes.accelerator,
    }).getKey();

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.acceleratorResourceNames.parameters.cloudWatchLogCmkArn,
      ),
    );

    this.centralLogsBucketKey = new KeyLookup(this, 'CentralLogsBucketKey', {
      accountId: props.accountsConfig.getLogArchiveAccountId(),
      keyRegion: props.centralizedLoggingRegion,
      roleName: this.acceleratorResourceNames.roles.crossAccountCentralLogBucketCmkArnSsmParameterAccess,
      keyArnParameterName: this.acceleratorResourceNames.parameters.centralLogBucketCmkArn,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      acceleratorPrefix: props.prefixes.accelerator,
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
    // Create SSM Parameters
    //
    this.createSsmParameters();

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Function to configure Macie
   */
  private configureMacie() {
    this.logger.debug(
      `centralSecurityServices.macie.enable: ${this.props.securityConfig.centralSecurityServices.macie.enable}`,
    );

    if (this.props.securityConfig.centralSecurityServices.macie.enable) {
      this.logger.info(
        `Creating macie export config bucket - ${this.props.prefixes.bucketName}-macie-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
      );

      if (
        this.props.securityConfig.centralSecurityServices.macie.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        this.logger.info('Adding Macie');

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
    this.logger.debug(
      `centralSecurityServices.guardduty.enable: ${this.props.securityConfig.centralSecurityServices.guardduty.enable}`,
    );

    if (this.props.securityConfig.centralSecurityServices.guardduty.enable) {
      if (
        this.props.securityConfig.centralSecurityServices.guardduty.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        this.logger.info('Enabling GuardDuty for all existing accounts');

        const guardDutyMembers = new GuardDutyMembers(this, 'GuardDutyMembers', {
          enableS3Protection: this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.enable,
          enableEksProtection:
            this.props.securityConfig.centralSecurityServices.guardduty.eksProtection?.enable ?? false,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        });

        if (
          this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.excludeRegions.indexOf(
            cdk.Stack.of(this).region as Region,
          ) === -1
        ) {
          new GuardDutyDetectorConfig(this, 'GuardDutyDetectorConfig', {
            exportFrequency:
              this.props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.exportFrequency ??
              'FIFTEEN_MINUTES',
            enableS3Protection: this.props.securityConfig.centralSecurityServices.guardduty.s3Protection.enable,
            enableEksProtection:
              this.props.securityConfig.centralSecurityServices.guardduty.eksProtection?.enable ?? false,
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
    this.logger.debug(
      `centralSecurityServices.auditManager?.enable: ${this.props.securityConfig.centralSecurityServices.auditManager?.enable}`,
    );

    if (this.props.securityConfig.centralSecurityServices.auditManager?.enable) {
      this.logger.info('Adding Audit Manager ');

      const bucket = new Bucket(this, 'AuditManagerPublishingDestinationBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.auditManager}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsKey: this.s3Key,
        serverAccessLogsBucketName: `${this.acceleratorResourceNames.bucketPrefixes.s3AccessLogs}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
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

      this.ssmParameters.push({
        logicalId: 'SsmParamOrganizationAuditManagerPublishingDestinationBucketArn',
        parameterName: `${this.props.prefixes.ssmParamName}/organization/security/auditManager/publishing-destination/bucket-arn`,
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
    this.logger.debug(
      `centralSecurityServices.detective?.enable: ${this.props.securityConfig.centralSecurityServices.detective?.enable}`,
    );

    if (this.props.securityConfig.centralSecurityServices.detective?.enable) {
      if (
        this.props.securityConfig.centralSecurityServices.detective?.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) === -1
      ) {
        this.logger.info('Adding Detective ');

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
    this.logger.debug(
      `centralSecurityServices.securityHub.enable: ${this.props.securityConfig.centralSecurityServices.securityHub.enable}`,
    );
    if (
      this.props.securityConfig.centralSecurityServices.securityHub.enable &&
      this.props.securityConfig.centralSecurityServices.securityHub.excludeRegions.indexOf(
        cdk.Stack.of(this).region as Region,
      ) === -1
    ) {
      this.logger.info('Adding SecurityHub ');

      new SecurityHubMembers(this, 'SecurityHubMembers', {
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });
    }

    this.logger.debug(
      `centralSecurityServices.securityHub.regionAggregation: ${this.props.securityConfig.centralSecurityServices.securityHub.regionAggregation}`,
    );
    if (
      this.props.securityConfig.centralSecurityServices.securityHub.enable &&
      this.props.securityConfig.centralSecurityServices.securityHub.regionAggregation &&
      this.props.globalConfig.homeRegion == cdk.Stack.of(this).region
    ) {
      this.logger.info('Enabling region aggregation for SecurityHub in the Home Region');

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
    this.logger.info(`Adding SSM Automation Docs`);
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
          this.logger.info(`Adding ${documentItem.name}`);

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
    this.logger.debug(`accessAnalyzer.enable: ${this.props.securityConfig.accessAnalyzer.enable}`);
    if (
      this.props.securityConfig.accessAnalyzer.enable &&
      this.props.globalConfig.homeRegion === cdk.Stack.of(this).region
    ) {
      this.logger.info('Adding IAM Access Analyzer ');
      new cdk.aws_accessanalyzer.CfnAnalyzer(this, 'AccessAnalyzer', {
        type: 'ORGANIZATION',
      });
    }
  }

  /**
   * Function to configure SNS Notifications
   */
  private configureSnsNotifications() {
    this.logger.info(`Create SNS Topics and Subscriptions`);

    //
    // Create KMS Key for SNS topic when there are SNS topics are to be created
    let snsKey: cdk.aws_kms.Key | undefined;
    if (this.props.securityConfig.centralSecurityServices.snsSubscriptions ?? [].length > 0) {
      snsKey = new cdk.aws_kms.Key(this, 'AcceleratorSnsKey', {
        alias: this.acceleratorResourceNames.customerManagedKeys.sns.alias,
        description: this.acceleratorResourceNames.customerManagedKeys.sns.description,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      if (this.props.organizationConfig.enable) {
        snsKey.addToResourcePolicy(
          new cdk.aws_iam.PolicyStatement({
            sid: `Allow Accelerator Role to use the encryption key`,
            principals: [new cdk.aws_iam.AnyPrincipal()],
            actions: ['kms:Encrypt', 'kms:Decrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*', 'kms:DescribeKey'],
            resources: ['*'],
            conditions: {
              StringEquals: {
                ...this.getPrincipalOrgIdCondition(this.organizationId),
              },
              ArnLike: {
                'aws:PrincipalARN': [
                  `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-*`,
                ],
              },
            },
          }),
        );
      }
    }

    // Loop through all the subscription entries
    for (const snsSubscriptionItem of this.props.securityConfig.centralSecurityServices.snsSubscriptions ?? []) {
      this.logger.info(`Create SNS Topic: ${snsSubscriptionItem.level}`);
      const topic = new cdk.aws_sns.Topic(this, `${pascalCase(snsSubscriptionItem.level)}SnsTopic`, {
        displayName: `AWS Accelerator - ${snsSubscriptionItem.level} Notifications`,
        topicName: `${this.props.prefixes.snsTopicName}-${snsSubscriptionItem.level}Notifications`,
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

      this.logger.info(`Create SNS Subscription: ${snsSubscriptionItem.email}`);
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
      }:${this.props.accountsConfig.getManagementAccountId()}:${
        this.props.prefixes.snsTopicName
      }-ControlTowerNotification`;
      const controlTowerNotificationsForwarderFunction = new cdk.aws_lambda.Function(
        this,
        'ControlTowerNotificationsForwarderFunction',
        {
          code: cdk.aws_lambda.Code.fromAsset(
            path.join(__dirname, '../lambdas/control-tower-notifications-forwarder/dist'),
          ),
          runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
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

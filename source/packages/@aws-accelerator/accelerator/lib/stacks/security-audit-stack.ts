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

import { Region } from '@aws-accelerator/config';
import {
  GuardDutyDetectorConfig,
  GuardDutyExportConfigDestinationTypes,
  GuardDutyMembers,
  MacieMembers,
  SecurityHubMembers,
  Organization,
  Bucket,
  BucketEncryptionType,
} from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { pascalCase } from 'pascal-case';
import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class SecurityAuditStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    const organization = new Organization(this, 'Organization');
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
      const bucket = new Bucket(this, 'AwsMacieExportConfigBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `aws-accelerator-org-macie-disc-repo-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsAliasName: 'alias/accelerator/organization/macie/discovery-repository/s3',
        kmsDescription: 'AWS Accelerator Macie Repository for sensitive data discovery results Bucket CMK',
      });

      const bucketNameSsmParameter = new cdk.aws_ssm.StringParameter(
        this,
        'SsmParamOrganizationMacieExportConfigBucketName',
        {
          parameterName: '/accelerator/organization/security/macie/discovery-repository/bucket-name',
          stringValue: bucket.getS3Bucket().bucketName,
        },
      );

      const bucketKmsKeyArnSsmParameter = new cdk.aws_ssm.StringParameter(
        this,
        'SsmParamOrganizationMacieExportConfigBucketKmsKeyArn',
        {
          parameterName: '/accelerator/organization/security/macie/discovery-repository/bucket-kms-key-arn',
          stringValue: bucket.getS3Bucket().encryptionKey!.keyArn,
        },
      );

      // SSM parameter access IAM Role for
      new cdk.aws_iam.Role(this, 'CrossAccountMacieSsmParamAccessRole', {
        roleName: `AWSAccelerator-CrossAccountMacieSsmParamAccessRole-${cdk.Stack.of(this).region}`,
        assumedBy: new cdk.aws_iam.OrganizationPrincipal(organization.id),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                resources: [bucketNameSsmParameter.parameterArn, bucketKmsKeyArnSsmParameter.parameterArn],
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:DescribeParameters'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });

      // cfn_nag: Suppress warning related to the accelerator security macie export config S3 bucket
      const cfnBucket = bucket.node.defaultChild?.node.defaultChild as cdk.aws_s3.CfnBucket;
      cfnBucket.cfnOptions.metadata = {
        cfn_nag: {
          rules_to_suppress: [
            {
              id: 'W35',
              reason:
                'S3 Bucket access logging is not enabled for the accelerator security macie export config bucket.',
            },
          ],
        },
      };

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
              'aws:PrincipalOrgID': organization.id,
            },
          },
        }),
      );

      bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow macie to use of the key',
          effect: cdk.aws_iam.Effect.ALLOW,
          principals: [new cdk.aws_iam.ServicePrincipal('macie.amazonaws.com')],
          actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
          resources: ['*'],
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
          region: cdk.Stack.of(this).region,
          adminAccountId: cdk.Stack.of(this).account,
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
      const bucket = new Bucket(this, 'GuardDutyPublishingDestinationBucket', {
        encryptionType: BucketEncryptionType.SSE_KMS,
        s3BucketName: `aws-accelerator-org-gduty-pub-dest-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        kmsAliasName: 'alias/accelerator/organization/guardduty/publishing-destination/s3',
        kmsDescription: 'AWS Accelerator GuardDuty Publishing Destination Bucket CMK',
      });

      const bucketArnSsmParameter = new cdk.aws_ssm.StringParameter(
        this,
        'SsmParamOrganizationGuardDutyPublishingDestinationBucketArn',
        {
          parameterName: '/accelerator/organization/security/guardduty/publishing-destination/bucket-arn',
          stringValue: bucket.getS3Bucket().bucketArn,
        },
      );

      const bucketKmsKeyArnSsmParameter = new cdk.aws_ssm.StringParameter(
        this,
        'SsmParamOrganizationGuardDutyPublishingDestinationBucketKmsKeyArn',
        {
          parameterName: '/accelerator/organization/security/guardduty/publishing-destination/bucket-kms-key-arn',
          stringValue: bucket.getS3Bucket().encryptionKey!.keyArn,
        },
      );

      // SSM parameter access IAM Role for
      new cdk.aws_iam.Role(this, 'CrossAccountGuardDutySsmParamAccessRole', {
        roleName: `AWSAccelerator-CrossAccountGuardDutySsmParamAccessRole-${cdk.Stack.of(this).region}`,
        assumedBy: new cdk.aws_iam.OrganizationPrincipal(organization.id),
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:GetParameters', 'ssm:GetParameter'],
                resources: [bucketKmsKeyArnSsmParameter.parameterArn, bucketArnSsmParameter.parameterArn],
              }),
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ssm:DescribeParameters'],
                resources: ['*'],
              }),
            ],
          }),
        },
      });

      // cfn_nag: Suppress warning related to the accelerator security guardduty publish destination bucket
      const cfnBucket = bucket.node.defaultChild?.node.defaultChild as cdk.aws_s3.CfnBucket;
      cfnBucket.cfnOptions.metadata = {
        cfn_nag: {
          rules_to_suppress: [
            {
              id: 'W35',
              reason:
                'S3 Bucket access logging is not enabled for the accelerator security guardduty publish destination bucket.',
            },
          ],
        },
      };

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
              'aws:PrincipalOrgID': organization.id,
            },
          },
        }),
      );

      bucket.getS3Bucket().encryptionKey?.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow guardduty to use of the key',
          effect: cdk.aws_iam.Effect.ALLOW,
          principals: [new cdk.aws_iam.ServicePrincipal('guardduty.amazonaws.com')],
          actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:Encrypt', 'kms:ReEncrypt*', 'kms:GenerateDataKey*'],
          resources: ['*'],
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
          region: cdk.Stack.of(this).region,
          enableS3Protection: props.securityConfig.centralSecurityServices.guardduty.s3Protection.enable,
        });

        new GuardDutyDetectorConfig(this, 'GuardDutyDetectorConfig', {
          region: cdk.Stack.of(this).region,
          isExportConfigEnable:
            props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.enable &&
            !props.securityConfig.centralSecurityServices.guardduty.s3Protection.excludeRegions!.includes(
              cdk.Stack.of(this).region as Region,
            ),
          exportDestination: GuardDutyExportConfigDestinationTypes.S3,
          exportFrequency: props.securityConfig.centralSecurityServices.guardduty.exportConfiguration.exportFrequency,
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
        region: cdk.Stack.of(this).region,
      });
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

    // Create CMK for topic
    // TODO: replace this with the single Accelerator key
    const topicCmk = new cdk.aws_kms.Key(this, 'TopicCmk', {
      enableKeyRotation: true,
      description: 'AWS Accelerator SNS Topic CMK',
    });
    topicCmk.addAlias('accelerator/sns/topic');
    topicCmk.addToResourcePolicy(
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
        ],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': organization.id,
          },
        },
      }),
    );
    topicCmk.addToResourcePolicy(
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
          new cdk.aws_iam.ServicePrincipal('cloudwatch.amazonaws.com'),
          new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
        ],
        resources: ['*'],
      }),
    );

    // Loop through all the subscription entries
    for (const snsSubscriptionItem of props.securityConfig.centralSecurityServices.snsSubscriptions ?? []) {
      Logger.info(`[security-audit-stack] Create SNS Topic: ${snsSubscriptionItem.level}`);
      const topic = new cdk.aws_sns.Topic(this, `${pascalCase(snsSubscriptionItem.level)}SnsTopic`, {
        displayName: `AWS Accelerator - ${snsSubscriptionItem.level} Notifications`,
        topicName: `aws-accelerator-${snsSubscriptionItem.level}Notifications`,
        masterKey: topicCmk,
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
        grantPrincipal: new cdk.aws_iam.OrganizationPrincipal(organization.id),
      });

      Logger.info(`[security-audit-stack] Create SNS Subscription: ${snsSubscriptionItem.email}`);
      topic.addSubscription(new cdk.aws_sns_subscriptions.EmailSubscription(snsSubscriptionItem.email));
    }
  }
}

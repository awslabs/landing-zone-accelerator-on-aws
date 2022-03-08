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
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

import { Region } from '@aws-accelerator/config';
import {
  Bucket,
  BucketEncryptionType,
  BudgetDefinition,
  EnableAwsServiceAccess,
  EnableSharingWithAwsOrganization,
  GuardDutyOrganizationAdminAccount,
  MacieOrganizationAdminAccount,
  RegisterDelegatedAdministrator,
  ReportDefinition,
  SecurityHubOrganizationAdminAccount,
} from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export interface OrganizationsStackProps extends AcceleratorStackProps {
  configDirPath: string;
}

/**
 * The Organizations stack is executed in all enabled regions in the
 * Organizations Management (Root) account
 */
export class OrganizationsStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: OrganizationsStackProps) {
    super(scope, id, props);

    Logger.debug(`[organizations-stack] homeRegion: ${props.globalConfig.homeRegion}`);

    //
    // Global Organizations actions, only execute in the home region
    //
    if (props.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      //
      // Configure Organizations Trail
      //
      Logger.debug(`[organizations-stack] logging.cloudtrail.enable: ${props.globalConfig.logging.cloudtrail.enable}`);
      Logger.debug(
        `[organizations-stack] logging.cloudtrail.organizationTrail: ${props.globalConfig.logging.cloudtrail.organizationTrail}`,
      );

      if (props.globalConfig.logging.cloudtrail.enable && props.globalConfig.logging.cloudtrail.organizationTrail) {
        Logger.info('[organizations-stack] Adding Organizations CloudTrail');

        const enableCloudtrailServiceAccess = new EnableAwsServiceAccess(this, 'EnableOrganizationsCloudTrail', {
          servicePrincipal: 'cloudtrail.amazonaws.com',
        });

        const cloudTrailCloudWatchCmk = new kms.Key(this, 'CloudTrailCloudWatchCmk', {
          enableKeyRotation: true,
          description: 'CloudTrail Log Group CMK',
          alias: 'accelerator/organizations-cloudtrail/log-group/',
        });
        cloudTrailCloudWatchCmk.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'Allow Account use of the key',
            actions: ['kms:*'],
            principals: [new iam.AccountRootPrincipal()],
            resources: ['*'],
          }),
        );
        cloudTrailCloudWatchCmk.addToResourcePolicy(
          new iam.PolicyStatement({
            sid: 'Allow logs use of the key',
            actions: ['kms:*'],
            principals: [new iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
            resources: ['*'],
            conditions: {
              ArnEquals: {
                'kms:EncryptionContext:aws:logs:arn': `arn:${cdk.Stack.of(this).partition}:logs:${
                  cdk.Stack.of(this).region
                }:${cdk.Stack.of(this).account}:*`,
              },
            },
          }),
        );

        const cloudTrailCloudWatchCmkLogGroup = new logs.LogGroup(this, 'CloudTrailCloudWatchLogGroup', {
          retention: logs.RetentionDays.ONE_YEAR,
          encryptionKey: cloudTrailCloudWatchCmk,
          logGroupName: 'aws-accelerator-cloudtrail-logs',
        });

        const organizationsTrail = new cdk_extensions.Trail(this, 'OrganizationsCloudTrail', {
          bucket: s3.Bucket.fromBucketName(
            this,
            'CentralLogsBucket',
            `aws-accelerator-central-logs-${props.accountsConfig.getLogArchiveAccountId()}-${
              cdk.Stack.of(this).region
            }`,
          ),
          cloudWatchLogGroup: cloudTrailCloudWatchCmkLogGroup,
          cloudWatchLogsRetention: logs.RetentionDays.ONE_MONTH,
          enableFileValidation: true,
          encryptionKey: kms.Key.fromKeyArn(
            this,
            'CentralLogsCmk',
            `arn:${cdk.Stack.of(this).partition}:kms:${
              cdk.Stack.of(this).region
            }:${props.accountsConfig.getLogArchiveAccountId()}:alias/accelerator/central-logs/s3`,
          ),
          includeGlobalServiceEvents: true,
          isMultiRegionTrail: true,
          isOrganizationTrail: true,
          managementEvents: cloudtrail.ReadWriteType.ALL,
          sendToCloudWatchLogs: true,
          trailName: 'AWSAccelerator-Organizations-CloudTrail',
        });

        organizationsTrail.addEventSelector(cloudtrail.DataResourceType.S3_OBJECT, [
          `arn:${cdk.Stack.of(this).partition}:s3:::`,
        ]);
        organizationsTrail.addEventSelector(cloudtrail.DataResourceType.LAMBDA_FUNCTION, [
          `arn:${cdk.Stack.of(this).partition}:lambda`,
        ]);

        organizationsTrail.node.addDependency(enableCloudtrailServiceAccess);
      }

      //
      // Enable Cost and Usage Reports
      //
      if (props.globalConfig.reports?.costAndUsageReport) {
        Logger.info('[organizations-stack] Adding Cost and Usage Reports');

        const reportBucket = new Bucket(this, 'ReportBucket', {
          encryptionType: BucketEncryptionType.SSE_S3, // CUR does not support KMS CMK
          s3BucketName: `aws-accelerator-cur-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          serverAccessLogsBucket: s3.Bucket.fromBucketName(
            this,
            'ReportBucketAccessLogs',
            `aws-accelerator-s3-access-logs-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          ),
        });

        new ReportDefinition(this, 'ReportDefinition', {
          compression: props.globalConfig.reports.costAndUsageReport.compression,
          format: props.globalConfig.reports.costAndUsageReport.format,
          refreshClosedReports: props.globalConfig.reports.costAndUsageReport.refreshClosedReports,
          reportName: props.globalConfig.reports.costAndUsageReport.reportName,
          reportVersioning: props.globalConfig.reports.costAndUsageReport.reportVersioning,
          s3Bucket: reportBucket.getS3Bucket(),
          s3Prefix: props.globalConfig.reports.costAndUsageReport.s3Prefix,
          s3Region: cdk.Stack.of(this).region,
          timeUnit: props.globalConfig.reports.costAndUsageReport.timeUnit,
          additionalArtifacts: props.globalConfig.reports.costAndUsageReport.additionalArtifacts,
          additionalSchemaElements: props.globalConfig.reports.costAndUsageReport.additionalSchemaElements,
        });
      }
      //
      // Enable Budget Reports
      //
      if (props.globalConfig.reports?.budgets) {
        Logger.info('[organizations-stack] Adding Budget Reports');

        new BudgetDefinition(this, 'BudgetDefinition', {
          budgetType: props.globalConfig.reports.budgets.budgetType,
          timeUnit: props.globalConfig.reports.budgets.timeUnit,
          amount: props.globalConfig.reports.budgets.amount,
          budgetName: props.globalConfig.reports.budgets.budgetName,
          includeOtherSubscription: props.globalConfig.reports.budgets.includeOtherSubscription,
          includeRecurring: props.globalConfig.reports.budgets.includeRecurring,
          includeSubscription: props.globalConfig.reports.budgets.includeSubscription,
          includeSupport: props.globalConfig.reports.budgets.includeSupport,
          includeTax: props.globalConfig.reports.budgets.includeTax,
          includeUpfront: props.globalConfig.reports.budgets.includeUpfront,
          includeCredit: props.globalConfig.reports.budgets.includeCredit,
          includeDiscount: props.globalConfig.reports.budgets.includeDiscount,
          includeRefund: props.globalConfig.reports.budgets.includeRefund,
          useBlended: props.globalConfig.reports.budgets.useBlended,
          useAmortized: props.globalConfig.reports.budgets.useAmortized,
          address: props.globalConfig.reports.budgets.address,
          subscriptionType: props.globalConfig.reports.budgets.subscriptionType,
          unit: props.globalConfig.reports.budgets.unit,
          threshold: props.globalConfig.reports.budgets.notification.threshold,
          comparisonOperator: props.globalConfig.reports.budgets.notification.comparisonOperator,
          thresholdType: props.globalConfig.reports.budgets.notification.thresholdType,
          notificationType: props.globalConfig.reports.budgets.notification.notificationType,
        });
      }
      //
      // IAM Access Analyzer (Does not have a native service enabler)
      //
      if (props.securityConfig.accessAnalyzer.enable) {
        Logger.debug('[organizations-stack] Enable Service Access for access-analyzer.amazonaws.com');

        const role = new iam.CfnServiceLinkedRole(this, 'AccessAnalyzerServiceLinkedRole', {
          awsServiceName: 'access-analyzer.amazonaws.com',
        });

        const enableAccessAnalyzer = new EnableAwsServiceAccess(this, 'EnableAccessAnalyzer', {
          servicePrincipal: 'access-analyzer.amazonaws.com',
        });

        enableAccessAnalyzer.node.addDependency(role);

        const registerDelegatedAdministratorAccessAnalyzer = new RegisterDelegatedAdministrator(
          this,
          'RegisterDelegatedAdministratorAccessAnalyzer',
          {
            accountId: props.accountsConfig.getAuditAccountId(),
            servicePrincipal: 'access-analyzer.amazonaws.com',
          },
        );

        registerDelegatedAdministratorAccessAnalyzer.node.addDependency(enableAccessAnalyzer);
      }

      //
      // Enable RAM organization sharing
      //
      new EnableSharingWithAwsOrganization(this, 'EnableSharingWithAwsOrganization');
    }

    // Security Services delegated admin account configuration
    // Global decoration for security services
    const delegatedAdminAccount = props.securityConfig.centralSecurityServices.delegatedAdminAccount;
    const adminAccountId = props.accountsConfig.getAccountId(delegatedAdminAccount);

    // Macie Configuration
    if (props.securityConfig.centralSecurityServices.macie.enable) {
      if (
        props.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts macie admin account delegation to the account with email ${
            props.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] Macie Admin Account ID is ${adminAccountId}`);
        new MacieOrganizationAdminAccount(this, 'MacieOrganizationAdminAccount', {
          region: cdk.Stack.of(this).region,
          adminAccountId: adminAccountId,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in macie excluded list so ignoring this region for ${
            props.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }

    //GuardDuty Config
    if (props.securityConfig.centralSecurityServices.guardduty.enable) {
      if (
        props.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts guardduty admin account delegation to the account with email ${
            props.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] Guardduty Admin Account ID is ${adminAccountId}`);
        new GuardDutyOrganizationAdminAccount(this, 'GuardDutyEnableOrganizationAdminAccount', {
          region: cdk.Stack.of(this).region,
          adminAccountId: adminAccountId,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in guardduty excluded list so ignoring this region for ${
            props.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }

    //SecurityHub Config
    if (props.securityConfig.centralSecurityServices.securityHub.enable) {
      if (
        props.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts SecurityHub admin account delegation to the account with email ${
            props.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] SecurityHub Admin Account ID is ${adminAccountId}`);
        new SecurityHubOrganizationAdminAccount(this, 'SecurityHubOrganizationAdminAccount', {
          region: cdk.Stack.of(this).region,
          adminAccountId: adminAccountId,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in SecurityHub excluded list so ignoring this region for ${
            props.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }

    //
    // Configure Trusted Services and Delegated Management Accounts
    //
    //
  }
}

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
import * as cloudtrail from 'aws-cdk-lib/aws-cloudtrail';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { pascalCase } from 'pascal-case';
import * as path from 'path';

import { Region } from '@aws-accelerator/config';
import {
  Bucket,
  BucketEncryptionType,
  BudgetDefinition,
  EnableAwsServiceAccess,
  EnablePolicyType,
  EnableSharingWithAwsOrganization,
  GuardDutyOrganizationAdminAccount,
  KeyLookup,
  MacieOrganizationAdminAccount,
  Policy,
  PolicyAttachment,
  PolicyType,
  PolicyTypeEnum,
  RegisterDelegatedAdministrator,
  ReportDefinition,
  SecurityHubOrganizationAdminAccount,
} from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
import { KeyStack } from './key-stack';
import { S3ServerAccessLogsBucketNamePrefix } from '../accelerator';
import { LifecycleRule } from '@aws-accelerator/constructs/lib/aws-s3/bucket';

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

    const key = new KeyLookup(this, 'AcceleratorKeyLookup', {
      accountId: props.accountsConfig.getAuditAccountId(),
      roleName: KeyStack.CROSS_ACCOUNT_ACCESS_ROLE_NAME,
      keyArnParameterName: KeyStack.ACCELERATOR_KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

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
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
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
          retention: props.globalConfig.cloudwatchLogRetentionInDays,
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
          cloudWatchLogsRetention: logs.RetentionDays.TEN_YEARS,
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
      // Enable Backup Policy
      //
      if (props.organizationConfig.backupPolicies.length > 0) {
        Logger.info(`[organizations-stack] Adding Backup Policies`);

        const role = new cdk.aws_iam.Role(this, 'BackupRole', {
          roleName: 'Backup-Role',
          assumedBy: new cdk.aws_iam.ServicePrincipal('backup.amazonaws.com'),
        });

        const managedBackupPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSBackupServiceRolePolicyForBackup',
        );
        role.addManagedPolicy(managedBackupPolicy);

        // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
        // rule suppression with evidence for this permission.
        NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/BackupRole/Resource`, [
          {
            id: 'AwsSolutions-IAM4',
            reason:
              'BackupRole needs service-role/AWSBackupServiceRolePolicyForBackup managed policy to manage backup vault',
          },
        ]);

        const vault = new cdk.aws_backup.BackupVault(this, 'BackupVault', {
          backupVaultName: 'BackupVault',
        });

        vault.node.addDependency(role);

        new EnablePolicyType(this, 'enablePolicyBackup', {
          policyType: PolicyTypeEnum.BACKUP_POLICY,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        for (const backupPolicies of props.organizationConfig.backupPolicies ?? []) {
          for (const orgUnit of backupPolicies.deploymentTargets.organizationalUnits) {
            const policy = new Policy(this, backupPolicies.name, {
              description: backupPolicies.description,
              name: backupPolicies.name,
              path: path.join(props.configDirPath, backupPolicies.policy),
              type: PolicyType.BACKUP_POLICY,
              kmsKey: key,
              logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
              acceleratorPrefix: 'AWSAccelerator',
              managementAccountAccessRole: props.globalConfig.managementAccountAccessRole,
            });

            policy.node.addDependency(vault);

            new PolicyAttachment(this, pascalCase(`Attach_${backupPolicies.name}_${orgUnit}`), {
              policyId: policy.id,
              targetId: props.organizationConfig.getOrganizationalUnitId(orgUnit),
              type: PolicyType.BACKUP_POLICY,
              kmsKey: key,
              logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
            });
          }
        }
      }

      //
      // Enable Cost and Usage Reports
      //
      if (props.globalConfig.reports?.costAndUsageReport) {
        Logger.info('[organizations-stack] Adding Cost and Usage Reports');

        const lifecycleRules: LifecycleRule[] = [];
        for (const lifecycleRule of props.globalConfig.logging.accessLogBucket.lifecycleRules) {
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

        const reportBucket = new Bucket(this, 'ReportBucket', {
          encryptionType: BucketEncryptionType.SSE_S3, // CUR does not support KMS CMK
          s3BucketName: `aws-accelerator-cur-${cdk.Stack.of(this).account}-${cdk.Stack.of(this).region}`,
          serverAccessLogsBucketName: `${S3ServerAccessLogsBucketNamePrefix}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
          lifecycleRules,
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
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
      //
      // Enable Budget Reports
      //
      if (props.globalConfig.reports?.budgets) {
        Logger.info('[organizations-stack] Adding Budget Reports');

        new BudgetDefinition(this, 'BudgetDefinition', {
          budgets: props.globalConfig.reports.budgets,
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
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });

        enableAccessAnalyzer.node.addDependency(role);

        const registerDelegatedAdministratorAccessAnalyzer = new RegisterDelegatedAdministrator(
          this,
          'RegisterDelegatedAdministratorAccessAnalyzer',
          {
            accountId: props.accountsConfig.getAuditAccountId(),
            servicePrincipal: 'access-analyzer.amazonaws.com',
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          },
        );

        registerDelegatedAdministratorAccessAnalyzer.node.addDependency(enableAccessAnalyzer);
      }

      //
      // Enable RAM organization sharing
      //
      if (props.organizationConfig.enable) {
        new EnableSharingWithAwsOrganization(this, 'EnableSharingWithAwsOrganization', {
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
        });
      }
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
          adminAccountId: adminAccountId,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
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
          adminAccountId: adminAccountId,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          kmsKey: key,
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
          adminAccountId: adminAccountId,
          kmsKey: key,
          logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
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
    // Tagging Policies Config
    //
    if (props.organizationConfig.taggingPolicies.length > 0) {
      Logger.info(`[organizations-stack] Adding Tagging Policies`);
      const tagPolicy = new EnablePolicyType(this, 'enablePolicyTypeTag', {
        policyType: PolicyTypeEnum.TAG_POLICY,
        kmsKey: key,
        logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
      });
      for (const taggingPolicy of props.organizationConfig.taggingPolicies ?? []) {
        for (const orgUnit of taggingPolicy.deploymentTargets.organizationalUnits) {
          const policy = new Policy(this, taggingPolicy.name, {
            description: taggingPolicy.description,
            name: taggingPolicy.name,
            path: path.join(props.configDirPath, taggingPolicy.policy),
            type: PolicyType.TAG_POLICY,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
            acceleratorPrefix: 'AWSAccelerator',
            managementAccountAccessRole: props.globalConfig.managementAccountAccessRole,
          });

          policy.node.addDependency(tagPolicy);

          new PolicyAttachment(this, pascalCase(`Attach_${taggingPolicy.name}_${orgUnit}`), {
            policyId: policy.id,
            targetId: props.organizationConfig.getOrganizationalUnitId(orgUnit),
            type: PolicyType.TAG_POLICY,
            kmsKey: key,
            logRetentionInDays: props.globalConfig.cloudwatchLogRetentionInDays,
          });
        }
      }
    }
    //
    // Configure Trusted Services and Delegated Management Accounts
    //
    //
    Logger.info('[organizations-stack] Completed stack synthesis');
  }
}

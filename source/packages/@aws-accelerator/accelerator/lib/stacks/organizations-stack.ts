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
import { pascalCase } from 'pascal-case';
import * as path from 'path';

import { Region } from '@aws-accelerator/config';
import {
  AuditManagerOrganizationAdminAccount,
  Bucket,
  BucketEncryptionType,
  BucketReplicationProps,
  CentralLogsBucket,
  DetectiveOrganizationAdminAccount,
  EnableAwsServiceAccess,
  EnablePolicyType,
  EnableSharingWithAwsOrganization,
  GuardDutyOrganizationAdminAccount,
  IpamOrganizationAdminAccount,
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
import { LifecycleRule } from '@aws-accelerator/constructs/lib/aws-s3/bucket';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

import { S3ServerAccessLogsBucketNamePrefix } from '../accelerator';
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
  private cloudwatchKey: cdk.aws_kms.Key;
  private centralLogBucketKey: cdk.aws_kms.Key;
  private centralLogBucketReplicationProps: BucketReplicationProps;
  private logRetention: number;
  private stackProperties: AcceleratorStackProps;

  constructor(scope: Construct, id: string, props: OrganizationsStackProps) {
    super(scope, id, props);

    Logger.debug(`[organizations-stack] homeRegion: ${props.globalConfig.homeRegion}`);
    // Set private properties
    this.stackProperties = props;
    this.logRetention = this.stackProperties.globalConfig.cloudwatchLogRetentionInDays;

    this.cloudwatchKey = cdk.aws_kms.Key.fromKeyArn(
      this,
      'AcceleratorGetCloudWatchKey',
      cdk.aws_ssm.StringParameter.valueForStringParameter(this, AcceleratorStack.CLOUDWATCH_LOG_KEY_ARN_PARAMETER_NAME),
    ) as cdk.aws_kms.Key;

    this.centralLogBucketKey = new KeyLookup(this, 'AcceleratorCentralLogBucketKeyLookup', {
      accountId: this.stackProperties.accountsConfig.getLogArchiveAccountId(),
      keyRegion: this.stackProperties.globalConfig.homeRegion,
      roleName: CentralLogsBucket.CROSS_ACCOUNT_SSM_PARAMETER_ACCESS_ROLE_NAME,
      keyArnParameterName: CentralLogsBucket.KEY_ARN_PARAMETER_NAME,
      logRetentionInDays: this.stackProperties.globalConfig.cloudwatchLogRetentionInDays,
    }).getKey();

    this.centralLogBucketReplicationProps = {
      destination: {
        bucketName: `aws-accelerator-central-logs-${this.stackProperties.accountsConfig.getLogArchiveAccountId()}-${
          this.stackProperties.globalConfig.homeRegion
        }`,
        accountId: this.stackProperties.accountsConfig.getLogArchiveAccountId(),
        keyArn: this.centralLogBucketKey.keyArn,
      },
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.stackProperties.globalConfig.cloudwatchLogRetentionInDays,
    };

    //
    // Global Organizations actions, only execute in the home region
    //
    if (this.stackProperties.globalConfig.homeRegion === cdk.Stack.of(this).region) {
      //
      // Organizational CloudTrail
      //
      this.configureOrganizationCloudTrail();

      //
      // Enable Backup Policy
      //
      this.addBackupPolicies();

      //
      // Enable Cost and Usage Reports
      //
      this.addCostAndUsageReport();

      //
      // IAM Access Analyzer (Does not have a native service enabler)
      //
      this.enableIamAccessAnalyzer();

      //
      // Enable RAM organization sharing
      //
      this.enableRamOrganizationSharing();

      //
      // Enable IPAM delegated administrator
      //
      this.enableIpamDelegatedAdminAccount();
    }

    // Security Services delegated admin account configuration
    // Global decoration for security services
    const delegatedAdminAccount = props.securityConfig.centralSecurityServices.delegatedAdminAccount;
    const securityAdminAccountId = props.accountsConfig.getAccountId(delegatedAdminAccount);

    // Macie Configuration
    this.enableMacieDelegatedAdminAccount(securityAdminAccountId);

    //GuardDuty Config
    this.enableGuardDutyDelegatedAdminAccount(securityAdminAccountId);

    //Audit Manager Config
    this.enableAuditManagerDelegatedAdminAccount(securityAdminAccountId);

    //Detective Config
    this.enableDetectiveDelegatedAdminAccount(securityAdminAccountId);

    //SecurityHub Config
    this.enableSecurityHubDelegatedAdminAccount(securityAdminAccountId);

    //
    // Tagging Policies Config
    //
    this.addTaggingPolicies();

    //
    // Configure Trusted Services and Delegated Management Accounts
    //
    //
    Logger.info('[organizations-stack] Completed stack synthesis');
  }

  /**
   * Function to add backup policies
   */
  private addBackupPolicies() {
    if (this.stackProperties.organizationConfig.backupPolicies.length > 0) {
      Logger.info(`[organizations-stack] Adding Backup Policies`);

      const role = new cdk.aws_iam.Role(this, 'BackupRole', {
        roleName: 'Backup-Role',
        assumedBy: new cdk.aws_iam.ServicePrincipal('backup.amazonaws.com'),
      });

      const managedBackupPolicy = cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSBackupServiceRolePolicyForBackup',
      );
      role.addManagedPolicy(managedBackupPolicy);

      const backupKey = new cdk.aws_kms.Key(this, 'AcceleratorBackupKey', {
        alias: AcceleratorStack.AWS_BACKUP_KEY_ALIAS,
        description: AcceleratorStack.AWS_BACKUP_KEY_DESCRIPTION,
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });

      // AwsSolutions-IAM4: The IAM user, role, or group uses AWS managed policies
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/BackupRole/Resource`, [
        {
          id: 'AwsSolutions-IAM4',
          reason:
            'BackupRole needs service-role/AWSBackupServiceRolePolicyForBackup managed policy to manage backup vault',
        },
      ]);

      // Added enable value to allow customer to use default key or management key.
      // Additionally, when creating the BackupVault if redeployed then a new name will be required.
      if (this.stackProperties.organizationConfig.backupVault?.enableManagementKey) {
        new cdk.aws_backup.BackupVault(
          this,
          `AcceleratorManagementBackupVault${this.stackProperties.organizationConfig.backupVault.name}`,
          {
            backupVaultName: `AcceleratorManagement${this.stackProperties.organizationConfig.backupVault.name}`,
            encryptionKey: backupKey,
          },
        );
      } else {
        new cdk.aws_backup.BackupVault(this, `AcceleratorBackupVaultDefault`, {
          backupVaultName: `AcceleratorBackupVaultDefault`,
        });
      }

      new EnablePolicyType(this, 'enableManagementKeyPolicyBackup', {
        policyType: PolicyTypeEnum.BACKUP_POLICY,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });

      for (const backupPolicies of this.stackProperties.organizationConfig.backupPolicies ?? []) {
        for (const orgUnit of backupPolicies.deploymentTargets.organizationalUnits) {
          const policy = new Policy(this, backupPolicies.name, {
            description: backupPolicies.description,
            name: backupPolicies.name,
            path: path.join(this.stackProperties.configDirPath, backupPolicies.policy),
            type: PolicyType.BACKUP_POLICY,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.logRetention,
            acceleratorPrefix: 'AWSAccelerator',
            managementAccountAccessRole: this.stackProperties.globalConfig.managementAccountAccessRole,
          });

          new PolicyAttachment(this, pascalCase(`Attach_${backupPolicies.name}_${orgUnit}`), {
            policyId: policy.id,
            targetId: this.stackProperties.organizationConfig.getOrganizationalUnitId(orgUnit),
            type: PolicyType.BACKUP_POLICY,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.logRetention,
          });
        }
      }
    }
  }

  /**
   * Function to add Cost and Usage Report
   */
  private addCostAndUsageReport() {
    if (this.stackProperties.globalConfig.reports?.costAndUsageReport) {
      Logger.info('[organizations-stack] Adding Cost and Usage Reports');

      const lifecycleRules: LifecycleRule[] = [];
      for (const lifecycleRule of this.stackProperties.globalConfig.reports.costAndUsageReport.lifecycleRules ?? []) {
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
        replicationProps: this.centralLogBucketReplicationProps,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/ReportBucket/ReportBucketReplication/` +
          pascalCase(
            `aws-accelerator-central-logs-${this.stackProperties.accountsConfig.getLogArchiveAccountId()}-${
              this.stackProperties.globalConfig.homeRegion
            }`,
          ) +
          '-ReplicationRole/DefaultPolicy/Resource',
        [
          {
            id: 'AwsSolutions-IAM5',
            reason: 'Allows only specific policy.',
          },
        ],
      );

      new ReportDefinition(this, 'ReportDefinition', {
        compression: this.stackProperties.globalConfig.reports.costAndUsageReport.compression,
        format: this.stackProperties.globalConfig.reports.costAndUsageReport.format,
        refreshClosedReports: this.stackProperties.globalConfig.reports.costAndUsageReport.refreshClosedReports,
        reportName: this.stackProperties.globalConfig.reports.costAndUsageReport.reportName,
        reportVersioning: this.stackProperties.globalConfig.reports.costAndUsageReport.reportVersioning,
        s3Bucket: reportBucket.getS3Bucket(),
        s3Prefix: `${this.stackProperties.globalConfig.reports.costAndUsageReport.s3Prefix}/${
          cdk.Stack.of(this).account
        }/`,
        s3Region: cdk.Stack.of(this).region,
        timeUnit: this.stackProperties.globalConfig.reports.costAndUsageReport.timeUnit,
        additionalArtifacts: this.stackProperties.globalConfig.reports.costAndUsageReport.additionalArtifacts,
        additionalSchemaElements: this.stackProperties.globalConfig.reports.costAndUsageReport.additionalSchemaElements,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
    }
  }

  /**
   * Function to Enable Service Access for access-analyzer.amazonaws.com'
   */
  private enableIamAccessAnalyzer() {
    if (this.stackProperties.securityConfig.accessAnalyzer.enable) {
      Logger.debug('[organizations-stack] Enable Service Access for access-analyzer.amazonaws.com');

      const enableAccessAnalyzer = new EnableAwsServiceAccess(this, 'EnableAccessAnalyzer', {
        servicePrincipal: 'access-analyzer.amazonaws.com',
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });

      const registerDelegatedAdministratorAccessAnalyzer = new RegisterDelegatedAdministrator(
        this,
        'RegisterDelegatedAdministratorAccessAnalyzer',
        {
          accountId: this.stackProperties.accountsConfig.getAuditAccountId(),
          servicePrincipal: 'access-analyzer.amazonaws.com',
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        },
      );

      registerDelegatedAdministratorAccessAnalyzer.node.addDependency(enableAccessAnalyzer);
    }
  }

  /**
   * Function to enable RAM organization sharing
   */
  private enableRamOrganizationSharing() {
    if (this.stackProperties.organizationConfig.enable) {
      new EnableSharingWithAwsOrganization(this, 'EnableSharingWithAwsOrganization', {
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
    }
  }

  /**
   * Function to enable IPAM delegated admin account
   */
  private enableIpamDelegatedAdminAccount() {
    if (this.stackProperties.networkConfig.centralNetworkServices?.ipams) {
      // Get delegated admin account
      const networkAdminAccountId = this.stackProperties.accountsConfig.getAccountId(
        this.stackProperties.networkConfig.centralNetworkServices!.delegatedAdminAccount,
      );

      // Create delegated admin if the account ID is not the management account
      if (networkAdminAccountId !== cdk.Stack.of(this).account) {
        Logger.info(`[organizations-stack] Enabling IPAM delegated administrator for account ${networkAdminAccountId}`);

        new IpamOrganizationAdminAccount(this, 'IpamAdminAccount', {
          accountId: networkAdminAccountId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
      }
    }
  }

  /**
   * Function to enable Macie delegated admin account
   * @param adminAccountId
   */
  private enableMacieDelegatedAdminAccount(adminAccountId: string) {
    if (this.stackProperties.securityConfig.centralSecurityServices.macie.enable) {
      if (
        this.stackProperties.securityConfig.centralSecurityServices.macie.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts macie admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] Macie Admin Account ID is ${adminAccountId}`);
        new MacieOrganizationAdminAccount(this, 'MacieOrganizationAdminAccount', {
          adminAccountId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in macie excluded list so ignoring this region for ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }
  }
  /**
   * Function to enable GuardDuty delegated admin account
   * @param adminAccountId
   */
  private enableGuardDutyDelegatedAdminAccount(adminAccountId: string) {
    if (this.stackProperties.securityConfig.centralSecurityServices.guardduty.enable) {
      if (
        this.stackProperties.securityConfig.centralSecurityServices.guardduty.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts guardduty admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] Guardduty Admin Account ID is ${adminAccountId}`);
        new GuardDutyOrganizationAdminAccount(this, 'GuardDutyEnableOrganizationAdminAccount', {
          adminAccountId,
          logRetentionInDays: this.logRetention,
          kmsKey: this.cloudwatchKey,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in guardduty excluded list so ignoring this region for ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }
  }

  /**
   * Function to enable AuditManager delegated admin account
   * @param adminAccountId
   */
  private enableAuditManagerDelegatedAdminAccount(adminAccountId: string) {
    if (this.stackProperties.securityConfig.centralSecurityServices.auditManager?.enable) {
      if (
        this.stackProperties.securityConfig.centralSecurityServices.auditManager?.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts audit manager admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] AuditManager Admin Account ID is ${adminAccountId}`);
        new AuditManagerOrganizationAdminAccount(this, 'AuditManagerEnableOrganizationAdminAccount', {
          adminAccountId,
          logRetentionInDays: this.logRetention,
          kmsKey: this.cloudwatchKey,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in auditmanager excluded list so ignoring this region for ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }
  }

  /**
   * Function to enable Detective delegated admin account
   * @param adminAccountId
   */
  private enableDetectiveDelegatedAdminAccount(adminAccountId: string) {
    if (this.stackProperties.securityConfig.centralSecurityServices.detective?.enable) {
      if (
        this.stackProperties.securityConfig.centralSecurityServices.detective?.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts detective admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] Detective Admin Account ID is ${adminAccountId}`);
        new DetectiveOrganizationAdminAccount(this, 'DetectiveOrganizationAdminAccount', {
          adminAccountId,
          logRetentionInDays: this.logRetention,
          kmsKey: this.cloudwatchKey,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in detective excluded list so ignoring this region for ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }
  }
  /**
   * Function to enable SecurityHub delegated admin account
   * @param adminAccountId
   */
  private enableSecurityHubDelegatedAdminAccount(adminAccountId: string) {
    if (this.stackProperties.securityConfig.centralSecurityServices.securityHub.enable) {
      if (
        this.stackProperties.securityConfig.centralSecurityServices.securityHub.excludeRegions!.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        Logger.debug(
          `[organizations-stack] Starts SecurityHub admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        Logger.debug(`[organizations-stack] SecurityHub Admin Account ID is ${adminAccountId}`);
        new SecurityHubOrganizationAdminAccount(this, 'SecurityHubOrganizationAdminAccount', {
          adminAccountId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
      } else {
        Logger.debug(
          `[organizations-stack] ${
            cdk.Stack.of(this).region
          } region was in SecurityHub excluded list so ignoring this region for ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account`,
        );
      }
    }
  }

  /**
   * Function to add Tagging policies
   */
  private addTaggingPolicies() {
    if (this.stackProperties.organizationConfig.taggingPolicies.length > 0) {
      Logger.info(`[organizations-stack] Adding Tagging Policies`);
      const tagPolicy = new EnablePolicyType(this, 'enablePolicyTypeTag', {
        policyType: PolicyTypeEnum.TAG_POLICY,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
      for (const taggingPolicy of this.stackProperties.organizationConfig.taggingPolicies ?? []) {
        for (const orgUnit of taggingPolicy.deploymentTargets.organizationalUnits) {
          const policy = new Policy(this, taggingPolicy.name, {
            description: taggingPolicy.description,
            name: taggingPolicy.name,
            path: path.join(this.stackProperties.configDirPath, taggingPolicy.policy),
            type: PolicyType.TAG_POLICY,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.logRetention,
            acceleratorPrefix: 'AWSAccelerator',
            managementAccountAccessRole: this.stackProperties.globalConfig.managementAccountAccessRole,
          });

          policy.node.addDependency(tagPolicy);

          new PolicyAttachment(this, pascalCase(`Attach_${taggingPolicy.name}_${orgUnit}`), {
            policyId: policy.id,
            targetId: this.stackProperties.organizationConfig.getOrganizationalUnitId(orgUnit),
            type: PolicyType.TAG_POLICY,
            kmsKey: this.cloudwatchKey,
            logRetentionInDays: this.logRetention,
          });
        }
      }
    }
  }

  private configureOrganizationCloudTrail() {
    Logger.debug(
      `[organizations-stack] logging.cloudtrail.enable: ${this.stackProperties.globalConfig.logging.cloudtrail.enable}`,
    );
    Logger.debug(
      `[organizations-stack] logging.cloudtrail.organizationTrail: ${this.stackProperties.globalConfig.logging.cloudtrail.organizationTrail}`,
    );

    let enableCloudtrailServiceAccess: EnableAwsServiceAccess;
    if (this.stackProperties.globalConfig.logging.cloudtrail.enable) {
      Logger.info('[organizations-stack] Enable CloudTrail Service Access');
      enableCloudtrailServiceAccess = new EnableAwsServiceAccess(this, 'EnableOrganizationsCloudTrail', {
        servicePrincipal: 'cloudtrail.amazonaws.com',
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
    }

    if (this.stackProperties.globalConfig.logging.cloudtrail.organizationTrail) {
      Logger.info('[organizations-stack] Adding Organizations CloudTrail');

      const cloudTrailCloudWatchCmk = new cdk.aws_kms.Key(this, 'CloudTrailCloudWatchCmk', {
        enableKeyRotation: true,
        description: 'CloudTrail Log Group CMK',
        alias: 'accelerator/organizations-cloudtrail/log-group/',
      });
      cloudTrailCloudWatchCmk.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow Account use of the key',
          actions: ['kms:*'],
          principals: [new cdk.aws_iam.AccountRootPrincipal()],
          resources: ['*'],
        }),
      );
      cloudTrailCloudWatchCmk.addToResourcePolicy(
        new cdk.aws_iam.PolicyStatement({
          sid: 'Allow logs use of the key',
          actions: ['kms:*'],
          principals: [new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.amazonaws.com`)],
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

      const cloudTrailCloudWatchCmkLogGroup = new cdk.aws_logs.LogGroup(this, 'CloudTrailCloudWatchLogGroup', {
        retention: this.stackProperties.globalConfig.cloudwatchLogRetentionInDays,
        encryptionKey: cloudTrailCloudWatchCmk,
        logGroupName: 'aws-accelerator-cloudtrail-logs',
      });

      let managementEventType = cdk.aws_cloudtrail.ReadWriteType.ALL;
      if (!this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.managementEvents) {
        managementEventType = cdk.aws_cloudtrail.ReadWriteType.NONE;
      }
      const organizationsTrail = new cdk_extensions.Trail(this, 'OrganizationsCloudTrail', {
        bucket: cdk.aws_s3.Bucket.fromBucketName(
          this,
          'CentralLogsBucket',
          `aws-accelerator-central-logs-${this.stackProperties.accountsConfig.getLogArchiveAccountId()}-${
            cdk.Stack.of(this).region
          }`,
        ),
        s3KeyPrefix: 'cloudtrail-organization',
        cloudWatchLogGroup: cloudTrailCloudWatchCmkLogGroup,
        cloudWatchLogsRetention: cdk.aws_logs.RetentionDays.TEN_YEARS,
        enableFileValidation: true,
        encryptionKey: this.centralLogBucketKey,
        includeGlobalServiceEvents:
          this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.globalServiceEvents ?? true,
        isMultiRegionTrail:
          this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.multiRegionTrail ?? true,
        isOrganizationTrail: true,
        apiCallRateInsight:
          this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.apiCallRateInsight ?? false,
        apiErrorRateInsight:
          this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.apiErrorRateInsight ?? false,
        managementEvents: managementEventType,
        sendToCloudWatchLogs:
          this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.sendToCloudWatchLogs ?? true,
        trailName: 'AWSAccelerator-Organizations-CloudTrail',
      });

      if (this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.s3DataEvents ?? true) {
        organizationsTrail.addEventSelector(cdk.aws_cloudtrail.DataResourceType.S3_OBJECT, [
          `arn:${cdk.Stack.of(this).partition}:s3:::`,
        ]);
      }

      if (this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings?.lambdaDataEvents ?? true) {
        organizationsTrail.addEventSelector(cdk.aws_cloudtrail.DataResourceType.LAMBDA_FUNCTION, [
          `arn:${cdk.Stack.of(this).partition}:lambda`,
        ]);
      }

      organizationsTrail.node.addDependency(enableCloudtrailServiceAccess!);
    }
  }
}

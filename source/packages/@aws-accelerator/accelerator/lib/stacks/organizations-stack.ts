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

import { IdentityCenterAssignmentConfig, IdentityCenterPermissionSetConfig, Region } from '@aws-accelerator/config';
import {
  AuditManagerOrganizationAdminAccount,
  Bucket,
  BucketEncryptionType,
  BucketReplicationProps,
  DetectiveOrganizationAdminAccount,
  EnableAwsServiceAccess,
  EnablePolicyType,
  EnableSharingWithAwsOrganization,
  FMSOrganizationAdminAccount,
  GuardDutyOrganizationAdminAccount,
  IpamOrganizationAdminAccount,
  MacieOrganizationAdminAccount,
  Policy,
  PolicyAttachment,
  PolicyType,
  PolicyTypeEnum,
  RegisterDelegatedAdministrator,
  ReportDefinition,
  SecurityHubOrganizationAdminAccount,
  IdentityCenterOrganizationAdminAccount,
} from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

import { AcceleratorKeyType, AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';
export interface OrganizationsStackProps extends AcceleratorStackProps {
  configDirPath: string;
}

/**
 * The Organizations stack is executed in all enabled regions in the
 * Organizations Management (Root) account
 */
export class OrganizationsStack extends AcceleratorStack {
  private cloudwatchKey!: cdk.aws_kms.Key;
  private centralLogsBucketKey!: cdk.aws_kms.Key;
  private bucketReplicationProps!: BucketReplicationProps;
  private logRetention!: number;
  private stackProperties!: AcceleratorStackProps;

  constructor(scope: Construct, id: string, props: OrganizationsStackProps) {
    super(scope, id, props);

    // Only deploy resources in this stack if organizations is enabled
    if (!props.organizationConfig.enable) {
      return;
    }

    // Security Services delegated admin account configuration
    // Global decoration for security services
    const delegatedAdminAccount = props.securityConfig.centralSecurityServices.delegatedAdminAccount;
    const securityAdminAccountId = props.accountsConfig.getAccountId(delegatedAdminAccount);

    this.logger.debug(`homeRegion: ${props.globalConfig.homeRegion}`);
    // Set private properties
    this.stackProperties = props;
    this.logRetention = this.stackProperties.globalConfig.cloudwatchLogRetentionInDays;

    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);

    this.centralLogsBucketKey = this.getAcceleratorKey(AcceleratorKeyType.CENTRAL_LOG_BUCKET, this.cloudwatchKey);

    this.bucketReplicationProps = {
      destination: {
        bucketName: `${
          this.acceleratorResourceNames.bucketPrefixes.centralLogs
        }-${this.stackProperties.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`,
        accountId: this.stackProperties.accountsConfig.getLogArchiveAccountId(),
        keyArn: this.centralLogsBucketKey.keyArn,
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
      // Enable Service Catalog
      //
      this.enableServiceCatalog();

      //
      // Enable IPAM delegated administrator
      //
      this.enableIpamDelegatedAdminAccount();

      //
      // Enable FMS Delegated Admin Account
      //
      this.enableFMSDelegatedAdminAccount();

      //IdentityCenter Config
      this.enableIdentityCenterDelegatedAdminAccount(securityAdminAccountId);

      //Enable Config Recorder Delegated Admin
      this.enableConfigRecorderDelegatedAdminAccount();
    }

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
    // Add nag suppressions by path
    //
    this.addResourceSuppressionsByPath(this.nagSuppressionInputs);

    this.logger.info('Completed stack synthesis');
  }

  /**
   * Function to add backup policies
   */
  private addBackupPolicies() {
    if (this.stackProperties.organizationConfig.backupPolicies.length > 0) {
      this.logger.info(`Adding Backup Policies`);

      const enablePolicyTypeBackup = new EnablePolicyType(this, 'enablePolicyTypeBackup', {
        policyType: PolicyTypeEnum.BACKUP_POLICY,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });

      for (const backupPolicies of this.stackProperties.organizationConfig.backupPolicies ?? []) {
        const policy = new Policy(this, backupPolicies.name, {
          description: backupPolicies.description,
          name: backupPolicies.name,
          partition: this.props.partition,
          path: this.generatePolicyReplacements(
            path.join(this.stackProperties.configDirPath, backupPolicies.policy),
            true,
            this.organizationId,
          ),
          type: PolicyType.BACKUP_POLICY,
          acceleratorPrefix: this.props.prefixes.accelerator,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });

        policy.node.addDependency(enablePolicyTypeBackup);

        for (const orgUnit of backupPolicies.deploymentTargets.organizationalUnits) {
          const backupPolicyAttachment = new PolicyAttachment(
            this,
            pascalCase(`Attach_${backupPolicies.name}_${orgUnit}`),
            {
              policyId: policy.id,
              targetId: this.stackProperties.organizationConfig.getOrganizationalUnitId(orgUnit),
              type: PolicyType.BACKUP_POLICY,
              configPolicyNames: this.getScpNamesForTarget(orgUnit, 'ou'),
              acceleratorPrefix: this.props.prefixes.accelerator,
              kmsKey: this.cloudwatchKey,
              logRetentionInDays: this.logRetention,
            },
          );

          backupPolicyAttachment.node.addDependency(policy);
        }
      }
    }
  }

  /**
   * Function to add Cost and Usage Report
   */
  private addCostAndUsageReport() {
    if (this.stackProperties.globalConfig.reports?.costAndUsageReport) {
      this.logger.info('Adding Cost and Usage Reports');

      const reportBucket = new Bucket(this, 'ReportBucket', {
        encryptionType: BucketEncryptionType.SSE_S3, // CUR does not support KMS CMK
        s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.costUsage}-${cdk.Stack.of(this).account}-${
          cdk.Stack.of(this).region
        }`,
        serverAccessLogsBucketName: `${this.acceleratorResourceNames.bucketPrefixes.s3AccessLogs}-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`,
        s3LifeCycleRules: this.getS3LifeCycleRules(
          this.stackProperties.globalConfig.reports.costAndUsageReport.lifecycleRules,
        ),
        replicationProps: this.bucketReplicationProps,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this,
        `/${this.stackName}/ReportBucket/ReportBucketReplication/` +
          pascalCase(
            `${
              this.acceleratorResourceNames.bucketPrefixes.centralLogs
            }-${this.stackProperties.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`,
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
        partition: this.props.partition,
      });
    }
  }

  /**
   * Function to Enable Service Access for access-analyzer.amazonaws.com'
   */
  private enableIamAccessAnalyzer() {
    if (this.stackProperties.securityConfig.accessAnalyzer.enable) {
      this.logger.debug('Enable Service Access for access-analyzer.amazonaws.com');

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
  //
  // Enable Service Catalog
  //
  private enableServiceCatalog() {
    if (this.props.customizationsConfig?.customizations?.serviceCatalogPortfolios?.length > 0) {
      new EnableAwsServiceAccess(this, 'EnableOrganizationsServiceCatalog', {
        servicePrincipal: 'servicecatalog.amazonaws.com',
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
        this.stackProperties.networkConfig.centralNetworkServices.delegatedAdminAccount,
      );

      // Create delegated admin if the account ID is not the management account
      if (networkAdminAccountId !== cdk.Stack.of(this).account) {
        this.logger.info(`Enabling IPAM delegated administrator for account ${networkAdminAccountId}`);

        new IpamOrganizationAdminAccount(this, 'IpamAdminAccount', {
          accountId: networkAdminAccountId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
      }
    }
  }

  /**
   * Function to enable FMS delegated admin account
   */
  private enableFMSDelegatedAdminAccount() {
    const fmsConfig = this.stackProperties.networkConfig.firewallManagerService;
    if (
      fmsConfig &&
      cdk.Stack.of(this).region === this.stackProperties.globalConfig.homeRegion &&
      this.props.organizationConfig.enable &&
      this.serviceLinkedRoleSupportedPartitionList.includes(this.props.partition)
    ) {
      const fmsServiceLinkedRole = this.createAwsFirewallManagerServiceLinkedRole(
        this.cloudwatchKey,
        cdk.aws_kms.Key.fromKeyArn(
          this,
          'AcceleratorGetLambdaKey',
          cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.acceleratorResourceNames.parameters.lambdaCmkArn,
          ),
        ) as cdk.aws_kms.Key,
      );

      if (fmsServiceLinkedRole) {
        const adminAccountName = fmsConfig.delegatedAdminAccount;
        const adminAccountId = this.stackProperties.accountsConfig.getAccountId(adminAccountName);
        const createFmsDelegatedAdmin = new FMSOrganizationAdminAccount(this, 'FMSOrganizationAdminAccount', {
          adminAccountId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
          assumeRole: this.stackProperties.globalConfig.managementAccountAccessRole,
        });
        // Add dependency to prevent race condition between delegated admin and service linked role
        createFmsDelegatedAdmin.node.addDependency(fmsServiceLinkedRole);
      }
    }
  }

  /**
   * Function to enable Config Recorder delegated admin account
   */
  private enableConfigRecorderDelegatedAdminAccount() {
    if (
      this.stackProperties.securityConfig.awsConfig.aggregation?.enable &&
      this.stackProperties.securityConfig.awsConfig.aggregation.delegatedAdminAccount &&
      !this.stackProperties.globalConfig.controlTower.enable &&
      this.stackProperties.organizationConfig.enable
    ) {
      this.logger.debug('enableConfigRecorderDelegateAdminAccount');
      const enableConfigServiceAccess = new EnableAwsServiceAccess(this, 'EnableConfigAccess', {
        servicePrincipal: 'config.amazonaws.com',
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });

      const registerConfigDelegatedAdministrator = new RegisterDelegatedAdministrator(
        this,
        'RegisterConfigDelegatedAdministrator',
        {
          accountId: this.stackProperties.accountsConfig.getAccountId(
            this.stackProperties.securityConfig.awsConfig.aggregation.delegatedAdminAccount,
          ),
          servicePrincipal: 'config.amazonaws.com',
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        },
      );

      registerConfigDelegatedAdministrator.node.addDependency(enableConfigServiceAccess);
    }
  }

  /**
   * Function to enable Macie delegated admin account
   * @param adminAccountId
   */
  private enableMacieDelegatedAdminAccount(adminAccountId: string) {
    if (this.stackProperties.securityConfig.centralSecurityServices.macie.enable) {
      if (
        this.stackProperties.securityConfig.centralSecurityServices.macie.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        this.logger.debug(
          `Starts macie admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        this.logger.debug(`Macie Admin Account ID is ${adminAccountId}`);
        new MacieOrganizationAdminAccount(this, 'MacieOrganizationAdminAccount', {
          adminAccountId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
      } else {
        this.logger.debug(
          `${cdk.Stack.of(this).region} region was in macie excluded list so ignoring this region for ${
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
        this.stackProperties.securityConfig.centralSecurityServices.guardduty.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        this.logger.debug(
          `Starts guardduty admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        this.logger.debug(`Guardduty Admin Account ID is ${adminAccountId}`);
        new GuardDutyOrganizationAdminAccount(this, 'GuardDutyEnableOrganizationAdminAccount', {
          adminAccountId,
          logRetentionInDays: this.logRetention,
          kmsKey: this.cloudwatchKey,
        });
      } else {
        this.logger.debug(
          `${cdk.Stack.of(this).region} region was in guardduty excluded list so ignoring this region for ${
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
        this.stackProperties.securityConfig.centralSecurityServices.auditManager?.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        this.logger.debug(
          `Starts audit manager admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        this.logger.debug(`AuditManager Admin Account ID is ${adminAccountId}`);
        new AuditManagerOrganizationAdminAccount(this, 'AuditManagerEnableOrganizationAdminAccount', {
          adminAccountId,
          logRetentionInDays: this.logRetention,
          kmsKey: this.cloudwatchKey,
        });
      } else {
        this.logger.debug(
          `${cdk.Stack.of(this).region} region was in auditmanager excluded list so ignoring this region for ${
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
        this.stackProperties.securityConfig.centralSecurityServices.detective?.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        this.logger.debug(
          `Starts detective admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        this.logger.debug(`Detective Admin Account ID is ${adminAccountId}`);
        new DetectiveOrganizationAdminAccount(this, 'DetectiveOrganizationAdminAccount', {
          adminAccountId,
          logRetentionInDays: this.logRetention,
          kmsKey: this.cloudwatchKey,
        });
      } else {
        this.logger.debug(
          `${cdk.Stack.of(this).region} region was in detective excluded list so ignoring this region for ${
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
        this.stackProperties.securityConfig.centralSecurityServices.securityHub.excludeRegions.indexOf(
          cdk.Stack.of(this).region as Region,
        ) == -1
      ) {
        this.logger.debug(
          `Starts SecurityHub admin account delegation to the account with email ${
            this.stackProperties.accountsConfig.getAuditAccount().email
          } account in ${cdk.Stack.of(this).region} region`,
        );

        this.logger.debug(`SecurityHub Admin Account ID is ${adminAccountId}`);
        new SecurityHubOrganizationAdminAccount(this, 'SecurityHubOrganizationAdminAccount', {
          adminAccountId,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
      } else {
        this.logger.debug(
          `${cdk.Stack.of(this).region} region was in SecurityHub excluded list so ignoring this region for ${
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
      this.logger.info(`Adding Tagging Policies`);
      const enablePolicyTypeTag = new EnablePolicyType(this, 'enablePolicyTypeTag', {
        policyType: PolicyTypeEnum.TAG_POLICY,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.logRetention,
      });
      for (const taggingPolicy of this.stackProperties.organizationConfig.taggingPolicies ?? []) {
        const policy = new Policy(this, `${taggingPolicy.name}`, {
          description: taggingPolicy.description,
          name: `${taggingPolicy.name}`,
          partition: this.props.partition,
          path: this.generatePolicyReplacements(
            path.join(this.stackProperties.configDirPath, taggingPolicy.policy),
            true,
            this.organizationId,
          ),
          type: PolicyType.TAG_POLICY,
          acceleratorPrefix: this.props.prefixes.accelerator,
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.logRetention,
        });
        policy.node.addDependency(enablePolicyTypeTag);
        for (const orgUnit of taggingPolicy.deploymentTargets.organizationalUnits ?? []) {
          const tagPolicyAttachment = new PolicyAttachment(
            this,
            pascalCase(`Attach_${taggingPolicy.name}_${orgUnit}`),
            {
              policyId: policy.id,
              targetId: this.stackProperties.organizationConfig.getOrganizationalUnitId(orgUnit),
              type: PolicyType.TAG_POLICY,
              configPolicyNames: this.getScpNamesForTarget(orgUnit, 'ou'),
              acceleratorPrefix: this.props.prefixes.accelerator,
              kmsKey: this.cloudwatchKey,
              logRetentionInDays: this.logRetention,
            },
          );
          tagPolicyAttachment.node.addDependency(policy);
        }
      }
    }
  }

  /**
   * Custom resource to check if Identity Center Delegated Administrator
   * needs to be updated.
   * @param adminAccountId
   */
  private enableIdentityCenterDelegatedAdminAccount(adminAccountId: string) {
    let lzaManagedPermissionSets: IdentityCenterPermissionSetConfig[] = [];
    let lzaManagedAssignments: IdentityCenterAssignmentConfig[] = [];
    let assignmentList: { [x: string]: string[] }[] = [];
    let delegatedAdminAccountId = adminAccountId;

    const identityCenterDelgatedAdminOverrideId = this.props.iamConfig.identityCenter?.delegatedAdminAccount;
    if (identityCenterDelgatedAdminOverrideId) {
      delegatedAdminAccountId = this.props.accountsConfig.getAccountId(identityCenterDelgatedAdminOverrideId);
    }

    if (this.props.iamConfig.identityCenter?.identityCenterPermissionSets) {
      lzaManagedPermissionSets = this.props.iamConfig.identityCenter.identityCenterPermissionSets;
    }

    if (this.props.iamConfig.identityCenter?.identityCenterAssignments) {
      lzaManagedAssignments = this.props.iamConfig.identityCenter.identityCenterAssignments;
      assignmentList = lzaManagedAssignments.map(assignment => ({
        [assignment.permissionSetName]: this.getAccountIdsFromDeploymentTarget(assignment.deploymentTargets),
      }));
    }

    if (this.props.partition === 'aws' || this.props.partition === 'aws-us-gov') {
      new IdentityCenterOrganizationAdminAccount(this, `IdentityCenterAdmin`, {
        adminAccountId: delegatedAdminAccountId,
        lzaManagedPermissionSets: lzaManagedPermissionSets,
        lzaManagedAssignments: assignmentList,
      });
      this.logger.info(`Delegated Admin account for Identity Center is: ${delegatedAdminAccountId}`);
    }
  }

  private configureOrganizationCloudTrail() {
    this.logger.debug(`logging.cloudtrail.enable: ${this.stackProperties.globalConfig.logging.cloudtrail.enable}`);
    this.logger.debug(
      `logging.cloudtrail.organizationTrail: ${this.stackProperties.globalConfig.logging.cloudtrail.organizationTrail}`,
    );

    if (
      !this.stackProperties.globalConfig.logging.cloudtrail.enable ||
      !this.stackProperties.globalConfig.logging.cloudtrail.organizationTrail
    ) {
      return;
    }

    this.logger.info('Enable CloudTrail Service Access');
    const enableCloudtrailServiceAccess = new EnableAwsServiceAccess(this, 'EnableOrganizationsCloudTrail', {
      servicePrincipal: 'cloudtrail.amazonaws.com',
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.logRetention,
    });

    this.logger.info('Adding Organizations CloudTrail');

    const cloudTrailCloudWatchCmk = new cdk.aws_kms.Key(this, 'CloudTrailCloudWatchCmk', {
      enableKeyRotation: true,
      description: this.acceleratorResourceNames.customerManagedKeys.orgTrailLog.description,
      alias: this.acceleratorResourceNames.customerManagedKeys.orgTrailLog.alias,
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
        principals: [
          new cdk.aws_iam.ServicePrincipal(`logs.${cdk.Stack.of(this).region}.${cdk.Stack.of(this).urlSuffix}`),
        ],
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
      logGroupName: `${this.props.prefixes.trailLogName}-cloudtrail-logs`,
    });

    let managementEventType = cdk.aws_cloudtrail.ReadWriteType.ALL;
    if (this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings !== undefined) {
      if (this.stackProperties.globalConfig.logging.cloudtrail.organizationTrailSettings.managementEvents === false) {
        managementEventType = cdk.aws_cloudtrail.ReadWriteType.NONE;
      }
    }
    const organizationsTrail = new cdk_extensions.Trail(this, 'OrganizationsCloudTrail', {
      bucket: cdk.aws_s3.Bucket.fromBucketName(
        this,
        'CentralLogsBucket',
        `${
          this.acceleratorResourceNames.bucketPrefixes.centralLogs
        }-${this.stackProperties.accountsConfig.getLogArchiveAccountId()}-${this.props.centralizedLoggingRegion}`,
      ),
      s3KeyPrefix: 'cloudtrail-organization',
      cloudWatchLogGroup: cloudTrailCloudWatchCmkLogGroup,
      cloudWatchLogsRetention: cdk.aws_logs.RetentionDays.TEN_YEARS,
      enableFileValidation: true,
      encryptionKey: this.centralLogsBucketKey,
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
      trailName: `${this.props.prefixes.accelerator}-Organizations-CloudTrail`,
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

    organizationsTrail.node.addDependency(enableCloudtrailServiceAccess);
  }
}

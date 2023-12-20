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
  IdentityCenterInstance,
  IdentityCenterOrganizationAdminAccount,
  PutSsmParameter,
} from '@aws-accelerator/constructs';
import * as cdk_extensions from '@aws-cdk-extensions/cdk-extensions';

import {
  AcceleratorKeyType,
  AcceleratorStack,
  AcceleratorStackProps,
  NagSuppressionRuleIds,
} from './accelerator-stack';

export interface OrganizationsStackProps extends AcceleratorStackProps {
  configDirPath: string;
}

/**
 * The Organizations stack is executed in all enabled regions in the
 * Organizations Management (Root) account
 */
export class OrganizationsStack extends AcceleratorStack {
  /**
   * KMS Key used to encrypt custom resource CloudWatch environment variables, when undefined default AWS managed key will be used
   */
  private cloudwatchKey: cdk.aws_kms.IKey | undefined;
  private centralLogsBucketKey: cdk.aws_kms.IKey;
  private bucketReplicationProps: BucketReplicationProps;
  private logRetention: number;
  private stackProperties: AcceleratorStackProps;

  /**
   * KMS Key used to encrypt custom resource Lambda environment variables, when undefined default AWS managed key will be used
   */
  private lambdaKey: cdk.aws_kms.IKey | undefined;

  constructor(scope: Construct, id: string, props: OrganizationsStackProps) {
    super(scope, id, props);

    // Set private properties
    this.stackProperties = props;
    this.logRetention = this.stackProperties.globalConfig.cloudwatchLogRetentionInDays;
    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);
    this.lambdaKey = this.getAcceleratorKey(AcceleratorKeyType.LAMBDA_KEY);
    this.centralLogsBucketKey = this.getCentralLogsBucketKey(this.cloudwatchKey);
    this.bucketReplicationProps = {
      destination: {
        bucketName: this.centralLogsBucketName,
        accountId: this.stackProperties.accountsConfig.getLogArchiveAccountId(),
        keyArn: this.centralLogsBucketKey.keyArn,
      },
      kmsKey: this.cloudwatchKey,
      logRetentionInDays: this.stackProperties.globalConfig.cloudwatchLogRetentionInDays,
      useExistingRoles: this.props.useExistingRoles ?? false,
      acceleratorPrefix: this.props.prefixes.accelerator,
    };

    // Only deploy resources in this stack if organizations is enabled
    if (!props.organizationConfig.enable) {
      return;
    }

    // Security Services delegated admin account configuration
    // Global decoration for security services
    const delegatedAdminAccount = props.securityConfig.centralSecurityServices.delegatedAdminAccount;
    const securityAdminAccountId = props.accountsConfig.getAccountId(delegatedAdminAccount);

    this.logger.debug(`homeRegion: ${props.globalConfig.homeRegion}`);

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
      this.enableFMSDelegatedAdminAccount({ cloudwatch: this.cloudwatchKey, lambda: this.lambdaKey });

      //IdentityCenter Config
      this.enableIdentityCenterDelegatedAdminAccount(securityAdminAccountId);

      //Enable Config Recorder Delegated Admin
      this.enableConfigRecorderDelegatedAdminAccount();

      // Enable Control Tower controls
      this.enableControlTowerControls();
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
    // Create NagSuppressions
    //
    this.addResourceSuppressionsByPath();

    //
    // Configure Trusted Services and Delegated Management Accounts
    //
    //
    this.logger.info('Completed stack synthesis');
  }

  /**
   * Function to enable Control Tower Controls
   * Only optional controls are supported (both Strongly Recommended and Elective)
   * https://docs.aws.amazon.com/controltower/latest/userguide/optional-controls.html
   */
  private enableControlTowerControls() {
    if (
      this.stackProperties.globalConfig.controlTower.enable &&
      this.stackProperties.globalConfig.controlTower?.controls?.length > 0
    ) {
      this.logger.info(`Enabling Control Tower Controls`);

      for (const control of this.stackProperties.globalConfig.controlTower.controls ?? []) {
        this.logger.info(`Control ${control.identifier} status: ${control.enable}`);

        if (control.enable) {
          for (const orgUnit of control.deploymentTargets.organizationalUnits) {
            const orgUnitArn = this.stackProperties.organizationConfig.getOrganizationalUnitArn(orgUnit);
            const controlArn = `arn:${this.props.partition}:controltower:${this.region}::control/${control.identifier}`;

            new cdk.aws_controltower.CfnEnabledControl(this, pascalCase(`${control.identifier}-${orgUnit}`), {
              controlIdentifier: controlArn,
              targetIdentifier: orgUnitArn,
            });
          }
        }
      }
    }
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
    if (this.stackProperties.globalConfig.reports?.costAndUsageReport && this.props.partition != 'aws-us-gov') {
      this.logger.info('Adding Cost and Usage Reports');

      const serverAccessLogsBucketName = this.getServerAccessLogsBucketName();

      const reportBucket = new Bucket(this, 'ReportBucket', {
        encryptionType: BucketEncryptionType.SSE_S3, // CUR does not support KMS CMK
        s3BucketName: `${this.acceleratorResourceNames.bucketPrefixes.costUsage}-${cdk.Stack.of(this).account}-${
          cdk.Stack.of(this).region
        }`,
        serverAccessLogsBucketName,
        s3LifeCycleRules: this.getS3LifeCycleRules(
          this.stackProperties.globalConfig.reports.costAndUsageReport.lifecycleRules,
        ),
        replicationProps: this.bucketReplicationProps,
      });

      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      this.nagSuppressionInputs.push({
        id: NagSuppressionRuleIds.IAM5,
        details: [
          {
            path:
              `/${this.stackName}/ReportBucket/ReportBucketReplication/` +
              pascalCase(this.centralLogsBucketName) +
              '-ReplicationRole/DefaultPolicy/Resource',
            reason: 'Allows only specific policy.',
          },
        ],
      });

      if (!serverAccessLogsBucketName) {
        // AwsSolutions-S1: The S3 Bucket has server access logs disabled
        this.nagSuppressionInputs.push({
          id: NagSuppressionRuleIds.S1,
          details: [
            {
              path: `/${this.stackName}/ReportBucket/Resource/Resource`,
              reason: 'Due to configuration settings, server access logs have been disabled.',
            },
          ],
        });
      }

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
  private enableFMSDelegatedAdminAccount(key: { cloudwatch?: cdk.aws_kms.IKey; lambda?: cdk.aws_kms.IKey }) {
    const fmsConfig = this.stackProperties.networkConfig.firewallManagerService;
    if (
      fmsConfig &&
      cdk.Stack.of(this).region === this.stackProperties.globalConfig.homeRegion &&
      this.props.organizationConfig.enable &&
      (this.props.partition === 'aws' || this.props.partition === 'aws-us-gov' || this.props.partition === 'aws-cn')
    ) {
      const fmsServiceLinkedRole = this.createAwsFirewallManagerServiceLinkedRole({
        cloudwatch: key.cloudwatch,
        lambda: key.lambda,
      });

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

    let identityCenterOrganizationAdminAccount: IdentityCenterOrganizationAdminAccount | undefined;
    if (this.props.partition === 'aws' || this.props.partition === 'aws-us-gov') {
      identityCenterOrganizationAdminAccount = new IdentityCenterOrganizationAdminAccount(this, `IdentityCenterAdmin`, {
        adminAccountId: delegatedAdminAccountId,
        lzaManagedPermissionSets: lzaManagedPermissionSets,
        lzaManagedAssignments: assignmentList,
      });
      this.logger.info(`Delegated Admin account for Identity Center is: ${delegatedAdminAccountId}`);
    }

    // Create Identity Center Id ssm parameter
    this.createIdentityCenterIdSsmParameter(identityCenterOrganizationAdminAccount);
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
      bucket: cdk.aws_s3.Bucket.fromBucketName(this, 'CentralLogsBucket', this.centralLogsBucketName),
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

  /**
   * Function to create SSM parameter to store Identity Center ID
   * SSM parameter will be created in Management account and Identity Center delegated admin account, if delegated admin account is different from management account
   * @param identityCenterOrganizationAdminAccount
   * @returns
   */
  private createIdentityCenterIdSsmParameter(
    identityCenterOrganizationAdminAccount: IdentityCenterOrganizationAdminAccount | undefined,
  ): void {
    if (this.props.iamConfig.identityCenter) {
      const delegatedAdminAccountId = this.props.iamConfig.identityCenter.delegatedAdminAccount
        ? this.props.accountsConfig.getAccountId(this.props.iamConfig.identityCenter.delegatedAdminAccount)
        : this.props.accountsConfig.getAccountId(
            this.props.securityConfig.centralSecurityServices.delegatedAdminAccount,
          );

      const identityCenterInstance = new IdentityCenterInstance(this, 'IdentityCenterInstance', {
        customResourceLambdaEnvironmentEncryptionKmsKey: this.lambdaKey!,
        customResourceLambdaCloudWatchLogKmsKey: this.cloudwatchKey,
        customResourceLambdaLogRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
      });

      if (identityCenterOrganizationAdminAccount) {
        identityCenterInstance.node.addDependency(identityCenterOrganizationAdminAccount);
      }

      const targetAccountIds: string[] = [this.props.accountsConfig.getManagementAccountId()];

      if (this.props.accountsConfig.getManagementAccountId() !== delegatedAdminAccountId) {
        targetAccountIds.push(delegatedAdminAccountId);
      }

      // Put Identity Center instance arn and instance store id SSM parameters
      new PutSsmParameter(this, pascalCase(`${this.props.iamConfig.identityCenter.name}InstanceMetadataParameters`), {
        accountIds: targetAccountIds,
        region: cdk.Stack.of(this).region,
        roleName: this.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        parameters: [
          {
            name: this.acceleratorResourceNames.parameters.identityCenterInstanceArn,
            value: identityCenterInstance.instanceArn,
          },
          {
            name: this.acceleratorResourceNames.parameters.identityStoreId,
            value: identityCenterInstance.instanceStoreId,
          },
        ],
        invokingAccountId: cdk.Stack.of(this).account,
        acceleratorPrefix: this.props.prefixes.accelerator,
      });
    }
  }
}

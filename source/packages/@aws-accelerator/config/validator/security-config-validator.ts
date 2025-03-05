/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import fs from 'fs';
import path from 'path';
import * as t from '../lib/common';
import { AccountsConfig } from '../lib/accounts-config';
import { DeploymentTargets } from '../lib/common';
import {
  IAlarmSetConfig,
  IAwsConfig,
  IAwsConfigRuleSet,
  IDocumentConfig,
  ISecurityConfig,
} from '../lib/models/security-config';
import { GlobalConfig } from '../lib/global-config';
import { OrganizationConfig } from '../lib/organization-config';
import { ReplacementsConfig } from '../lib/replacements-config';
import {
  AwsConfigRuleSet,
  EbsDefaultVolumeEncryptionConfig,
  SecurityConfig,
  IsPublicSsmDoc,
  ConfigRule,
  GuardDutyConfig,
  SecurityHubConfig,
} from '../lib/security-config';
import { CommonValidatorFunctions } from './common/common-validator-functions';

const RESERVED_STATIC_PARAMETER_FOR_RESOURCE_POLICY = 'ATTACHED_RESOURCE_ARN';

export class SecurityConfigValidator {
  constructor(
    values: SecurityConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    organizationConfig: OrganizationConfig,
    replacementsConfig: ReplacementsConfig | undefined,
    configDir: string,
  ) {
    const errors: string[] = [];
    const ouIdNames: string[] = ['Root'];

    const logger = createLogger(['security-config-validator']);

    logger.info(`${SecurityConfig.FILENAME} file validation started`);

    // SSM Document validations
    const ssmDocuments = this.getSsmDocuments(values);

    // Get list of OU ID names from organization config file
    ouIdNames.push(...this.getOuIdNames(organizationConfig));

    // Get list of Account names from account config file
    const accountNames = this.getAccountNames(accountsConfig);

    // Validate SSM document name
    this.validateSsmDocumentTargetTypes(ssmDocuments, errors);

    // Validate SSM document name
    this.validateSsmDocumentNames(ssmDocuments, errors);

    // Validate presence of SSM document files
    this.validateSsmDocumentFiles(configDir, ssmDocuments, errors);

    // Validate KMS key policy files
    this.validateKeyPolicyFiles(values, configDir, errors);

    // Create list of custom CMKs, any services to be validated against key list from keyManagementService
    const keyNames: string[] = [values.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey!];

    // Validate custom CMK names
    this.validateCustomKeyName(values, keyNames, errors);

    // Validate EBS default encryption configuration
    this.validateEbsEncryptionConfiguration(values.centralSecurityServices.ebsDefaultVolumeEncryption, errors);

    // Validate GuardDuty configuration
    this.validateGuardDutyConfiguration(values.centralSecurityServices.guardduty, errors);
    // Validate SecurityHub configuration
    this.validateSecurityHubConfiguration(values.centralSecurityServices.securityHub, errors);

    // Validate delegated admin account
    // Validate deployment targets against organization config file
    // validate deployment target OUs for security services
    this.validateDelegatedAdminAccount(values, accountsConfig, errors);
    this.validateDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateDeploymentTargetAccountNames(values, accountNames, errors);
    this.validateConfigRuleDeploymentTargetsInConfigDeploymentTargets(values, accountsConfig, globalConfig, errors);
    this.validateConfigDeloymentTargetsInSecurityHubDeploymentTargets(values, accountsConfig, globalConfig, errors);
    this.validateSecurityHubStandardDeloymentTargetsInSecurityHubDeloymentTargets(
      values,
      accountsConfig,
      globalConfig,
      errors,
    );
    this.validateSecurityHubAndConfig(values, globalConfig.controlTower.enable, errors);
    // Validate expiration for Macie and GuardDuty Lifecycle Rules
    this.macieLifecycleRules(values, errors);
    this.guarddutyLifecycleRules(values, errors);
    // Validate Config rule assets
    for (const ruleSet of values.awsConfig.ruleSets ?? []) {
      this.validateConfigRuleAssets(configDir, ruleSet, errors);
      this.validateConfigRuleRemediationAccountNames(ruleSet, accountNames, errors);
      this.validateConfigRuleRemediationAssumeRoleFile(configDir, ruleSet, errors);
      this.validateConfigRuleRemediationTargetAssets(configDir, ruleSet, ssmDocuments, errors);
    }
    this.validateConfigRuleNames(values.awsConfig, accountsConfig, globalConfig, errors);

    // Validate SNS Topics for CloudWatch Alarms
    const snsTopicNames = this.getSnsTopicNames(globalConfig);
    for (const alarm of values.cloudWatch.alarmSets ?? []) {
      this.validateSnsTopics(globalConfig, alarm, snsTopicNames, errors);
    }

    this.validateSecurityHubNotifications(
      snsTopicNames,
      values.centralSecurityServices.securityHub.snsTopicName ?? undefined,
      values.centralSecurityServices.securityHub.notificationLevel ?? undefined,
      errors,
    );

    this.validateAwsConfigAggregation(globalConfig, accountNames, values, errors);

    this.validateAwsCloudWatchLogGroups(values, errors);
    this.validateAwsCloudWatchLogGroupsRetention(values, errors);
    this.validateResourcePolicyEnforcementConfig(values, ouIdNames, accountNames, errors);
    this.validateResourcePolicyParameters(configDir, values, replacementsConfig, errors);

    this.validateConfigRuleCmkDependency(values, globalConfig, accountsConfig, errors);

    if (errors.length) {
      throw new Error(`${SecurityConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
  }

  public hasDuplicates(arr: string[]): boolean {
    return new Set(arr).size !== arr.length;
  }

  /**
   * Prepare list of OU ids from organization config file
   * @param organizationConfig
   * @returns
   */
  private getOuIdNames(organizationConfig: OrganizationConfig): string[] {
    const ouIdNames: string[] = [];
    if (organizationConfig.enable) {
      for (const organizationalUnit of organizationConfig.organizationalUnits ?? []) {
        ouIdNames.push(organizationalUnit.name);
      }
    }
    return ouIdNames;
  }

  /**
   * Prepare list of Account names from account config file
   * @param accountsConfig
   * @returns
   */
  private getAccountNames(accountsConfig: AccountsConfig): string[] {
    const accountNames: string[] = [];

    for (const accountItem of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
      accountNames.push(accountItem.name);
    }
    return accountNames;
  }

  /**
   * Prepare list of SNS Topic names from the global config file
   * @param configDir
   */
  private getSnsTopicNames(globalConfig: GlobalConfig): string[] {
    return globalConfig.getSnsTopicNames();
  }

  /**
   * Validate delegated admin account name
   *
   * @param values
   * @param accountNames
   * @param errors
   */
  private validateDelegatedAdminAccount(values: SecurityConfig, accountsConfig: AccountsConfig, errors: string[]) {
    if (values.centralSecurityServices.delegatedAdminAccount !== accountsConfig.getAuditAccount().name) {
      errors.push(
        `The delegated administrator account specified in security-config.yaml is not valid. The solution requires using the Audit account (exactly as defined in accounts-config.yaml) as the delegated administrator for central security services. Account name is case sensitive.`,
      );
    }
  }

  /**
   * Validate S3 lifecycle expiration to be smaller than noncurrentVersionExpiration
   */
  private macieLifecycleRules(values: ISecurityConfig, errors: string[]) {
    for (const lifecycleRule of values.centralSecurityServices?.macie?.lifecycleRules ?? []) {
      if (lifecycleRule.expiration && !lifecycleRule.noncurrentVersionExpiration) {
        errors.push('You must supply a value for noncurrentVersionExpiration. Macie.');
      }
      if (!lifecycleRule.abortIncompleteMultipartUpload) {
        errors.push('You must supply a value for abortIncompleteMultipartUpload. Macie');
      }
      if (lifecycleRule.expiration && lifecycleRule.expiredObjectDeleteMarker) {
        errors.push('You may not configure expiredObjectDeleteMarker with expiration. Macie');
      }
    }
  }

  /**
   * Validate S3 lifecycle expiration to be smaller than noncurrentVersionExpiration
   */
  private guarddutyLifecycleRules(values: ISecurityConfig, errors: string[]) {
    for (const lifecycleRule of values.centralSecurityServices?.guardduty?.lifecycleRules ?? []) {
      if (lifecycleRule.expiration && !lifecycleRule.noncurrentVersionExpiration) {
        errors.push('You must supply a value for noncurrentVersionExpiration. GuardDuty');
      }
      if (!lifecycleRule.abortIncompleteMultipartUpload) {
        errors.push('You must supply a value for abortIncompleteMultipartUpload. GuardDuty');
      }
      if (lifecycleRule.expiration && lifecycleRule.expiredObjectDeleteMarker) {
        errors.push('You may not configure expiredObjectDeleteMarker with expiration. GuardDuty');
      }
    }
  }

  /**
   * Function to get SSM document names
   * @param values
   * @returns
   */
  private getSsmDocuments(
    values: SecurityConfig,
  ): { name: string; template: string; targetType: string | undefined }[] {
    const ssmDocuments: { name: string; template: string; targetType: string | undefined }[] = [];

    // SSM Document validations
    for (const documentSet of values.centralSecurityServices.ssmAutomation.documentSets) {
      for (const document of documentSet.documents ?? []) {
        ssmDocuments.push(document);
      }
    }
    return ssmDocuments;
  }

  /**
   * Function to validate SSM document files existence
   * @param configDir
   */
  private validateSsmDocumentFiles(
    configDir: string,
    ssmDocuments: { name: string; template: string }[],
    errors: string[],
  ) {
    // Validate presence of SSM document files
    for (const ssmDocument of ssmDocuments) {
      if (!fs.existsSync(path.join(configDir, ssmDocument.template))) {
        errors.push(`SSM document ${ssmDocument.name} template file ${ssmDocument.template} not found !!!`);
      }
    }
  }

  /**
   * Function to validate KMS key policy files existence
   * @param values
   * @param configDir
   * @param errors
   */
  private validateKeyPolicyFiles(values: SecurityConfig, configDir: string, errors: string[]) {
    // Validate presence of KMS policy files
    if (!values.keyManagementService) {
      return;
    }
    for (const key of values.keyManagementService.keySets) {
      if (key.policy) {
        if (!fs.existsSync(path.join(configDir, key.policy))) {
          errors.push(`KMS Key ${key.name} policy file ${key.policy} not found !!!`);
        }
      }
    }
  }

  /**
   * Function to validate custom key existence in key list of keyManagementService
   */
  private validateCustomKeyName(values: SecurityConfig, keyNames: string[], errors: string[]) {
    // Validate presence of KMS policy files
    for (const keyName of keyNames) {
      if (keyName) {
        if (!values.keyManagementService) {
          errors.push(`Custom CMK object keyManagementService not defined, CMK ${keyName} can not be used !!!`);
          return;
        }
        if (!values.keyManagementService.keySets.find(item => item.name === keyName)) {
          errors.push(
            `Custom CMK  ${keyName} is not part of keyManagementService key list [${
              values.keyManagementService.keySets.flatMap(item => item.name) ?? []
            }] !!!`,
          );
        }
      }
    }
  }

  /**
   * Validate GuardDuty configuration
   * @param guardDutyConfig GuardDutyConfig
   * @param errors string[]
   */
  private validateGuardDutyConfiguration(guardDutyConfig: GuardDutyConfig, errors: string[]) {
    if (guardDutyConfig.excludeRegions && guardDutyConfig.deploymentTargets) {
      errors.push(
        `GuardDuty configuration cannot include both "deploymentTargets" and "excludeRegions" properties. Please use only one.`,
      );
    }

    if (
      guardDutyConfig.deploymentTargets &&
      !guardDutyConfig.deploymentTargets.organizationalUnits?.includes('Root') &&
      (guardDutyConfig.autoEnableOrgMembers === undefined || guardDutyConfig.autoEnableOrgMembers)
    ) {
      errors.push(
        `"autoEnableOrgMembers" should be set to "false" when using "deploymentTargets" property in guardDuty configuration`,
      );
    }
  }

  /**
   * Validate SecurityHub configuration
   * @param securityHubConfig SecurityHubConfig
   * @param errors string[]
   */
  private validateSecurityHubConfiguration(securityHubConfig: SecurityHubConfig, errors: string[]) {
    if (securityHubConfig.excludeRegions && securityHubConfig.deploymentTargets) {
      errors.push(
        `securityHub configuration cannot include both "deploymentTargets" and "excludeRegions" properties. Please use only one.`,
      );
    }

    if (
      securityHubConfig.deploymentTargets &&
      !securityHubConfig.deploymentTargets.organizationalUnits?.includes('Root') &&
      (securityHubConfig.autoEnableOrgMembers === undefined || securityHubConfig.autoEnableOrgMembers)
    ) {
      errors.push(
        `"autoEnableOrgMembers" should be set to "false" when using "deploymentTargets" property in securityHub configuration`,
      );
    }
  }

  /**
   * Validate EBS default volume encryption configuration
   * @param ebsEncryptionConfig EbsDefaultVolumeEncryptionConfig
   * @param errors string[]
   */
  private validateEbsEncryptionConfiguration(ebsEncryptionConfig: EbsDefaultVolumeEncryptionConfig, errors: string[]) {
    if (ebsEncryptionConfig.excludeRegions && ebsEncryptionConfig.deploymentTargets) {
      errors.push(
        `EBS default volume configuration cannot include both deploymentTargets and excludeRegions properties. Please use only one.`,
      );
    }
  }

  /**
   * Function to validate AWS CloudWatch Log Groups configuration
   */
  private validateAwsCloudWatchLogGroups(values: SecurityConfig, errors: string[]) {
    const logGroupNames: string[] = [];
    for (const logGroupItem of values.cloudWatch.logGroups ?? []) {
      logGroupNames.push(logGroupItem.logGroupName);
      const kmsKeyArn = logGroupItem.encryption?.kmsKeyArn;
      const kmsKeyName = logGroupItem.encryption?.kmsKeyName;
      const lzaKey = logGroupItem.encryption?.useLzaManagedKey;
      if ((kmsKeyArn && kmsKeyName) || (kmsKeyArn && lzaKey) || (kmsKeyName && lzaKey)) {
        errors.push(
          `The Log Group ${logGroupItem.logGroupName} is specifying more than one encryption parameter. Please specify one of kmsKeyArn, kmsKeyName, or lzaKey.`,
        );
      }
      if (logGroupItem.encryption?.kmsKeyName) {
        if (!values.keyManagementService.keySets?.find(item => item.name === logGroupItem.encryption?.kmsKeyName)) {
          errors.push(
            `The KMS Key Name ${logGroupItem.encryption?.kmsKeyName} provided in the config for ${logGroupItem.logGroupName} does not exist.`,
          );
        }
      }
    }
    if (this.hasDuplicates(logGroupNames)) {
      errors.push(
        `Duplicate CloudWatch Log Groups names exist. Log Group names must be unique. Log Group names in file: ${logGroupNames}`,
      );
    }
  }

  /**
   * Function to validate AWS CloudWatch Log Groups retention values
   */
  private validateAwsCloudWatchLogGroupsRetention(values: SecurityConfig, errors: string[]) {
    const validRetentionValues = [
      1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653,
    ];
    for (const logGroupItem of values.cloudWatch.logGroups ?? []) {
      if (validRetentionValues.indexOf(logGroupItem.logRetentionInDays) === -1) {
        errors.push(
          `${logGroupItem.logGroupName} has a retention value of ${logGroupItem.logRetentionInDays}. Valid values for retention are: ${validRetentionValues}`,
        );
      }
    }
  }

  /**
   * Function to validate existence of Config deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateConfigDeploymentTargetAccounts(values: ISecurityConfig, accountNames: string[], errors: string[]) {
    for (const account of values.awsConfig.deploymentTargets?.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for AWS Config does not exists in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of custom config rule deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateConfigRuleDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const ruleSet of values.awsConfig.ruleSets ?? []) {
      for (const account of ruleSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for AWS Config rules does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of Config Recorder and Delivery Channel in accounts where RuleSets are getting deployed
   * @param values
   * @param accountsConfig
   * @param globalConfig
   * @param errors
   */
  private validateConfigRuleDeploymentTargetsInConfigDeploymentTargets(
    values: ISecurityConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    errors: string[],
  ) {
    const configDeploymentTargets = values.awsConfig.deploymentTargets;

    if (!configDeploymentTargets || configDeploymentTargets?.organizationalUnits?.includes('Root')) return;

    const configAccounts = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
      accountsConfig,
      configDeploymentTargets as DeploymentTargets,
    );
    const configRegions = CommonValidatorFunctions.getRegionsFromDeploymentTargets(
      configDeploymentTargets as DeploymentTargets,
      globalConfig,
    );
    let configRuleSetAccounts: string[] = [];
    let configRuleSetRegions: t.Region[] = [];

    for (const ruleSet of values.awsConfig.ruleSets ?? []) {
      configRuleSetAccounts.push(
        ...CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
          accountsConfig,
          ruleSet.deploymentTargets as DeploymentTargets,
        ),
      );
      configRuleSetRegions.push(
        ...CommonValidatorFunctions.getRegionsFromDeploymentTargets(
          ruleSet.deploymentTargets as DeploymentTargets,
          globalConfig,
        ),
      );
    }

    configRuleSetAccounts = [...new Set(configRuleSetAccounts)];
    configRuleSetRegions = [...new Set(configRuleSetRegions)];

    for (const account of configRuleSetAccounts) {
      if (!configAccounts.includes(account)) {
        errors.push(
          `awsConfig RuleSets deployment target account: "${account}" not present in deployment targets for awsConfig : "${configAccounts}".`,
        );
      }
    }

    for (const region of configRuleSetRegions) {
      if (!configRegions.includes(region)) {
        errors.push(
          `awsConfig RuleSets deployment target region: "${region}" not present in deployment targets for awsConfig : "${configRegions}".`,
        );
      }
    }
  }

  /**
   * Function to validate SecurityHub Standard deploymentTargets in SecurityHub deploymentTargets
   * @param values
   * @param accountsConfig
   * @param globalConfig
   * @param errors
   */
  private validateSecurityHubStandardDeloymentTargetsInSecurityHubDeloymentTargets(
    values: ISecurityConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    errors: string[],
  ) {
    const securityHubDeploymentTargets = values.centralSecurityServices.securityHub.deploymentTargets;
    const securityHubStandards = values.centralSecurityServices.securityHub.standards;

    if (!securityHubDeploymentTargets || securityHubDeploymentTargets?.organizationalUnits?.includes('Root')) return;

    const securityHubAccounts = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
      accountsConfig,
      securityHubDeploymentTargets as DeploymentTargets,
    );
    const securityHubRegions = CommonValidatorFunctions.getRegionsFromDeploymentTargets(
      securityHubDeploymentTargets as DeploymentTargets,
      globalConfig,
    );
    let securityHubStandardAccounts: string[] = [];
    let securityHubStandardRegions: t.Region[] = [];

    for (const securityHubStandard of securityHubStandards ?? []) {
      if (securityHubStandard.deploymentTargets) {
        securityHubStandardAccounts.push(
          ...CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
            accountsConfig,
            securityHubStandard.deploymentTargets as DeploymentTargets,
          ),
        );
        securityHubStandardRegions.push(
          ...CommonValidatorFunctions.getRegionsFromDeploymentTargets(
            securityHubStandard.deploymentTargets as DeploymentTargets,
            globalConfig,
          ),
        );
      } else if (!securityHubStandard.deploymentTargets) {
        errors.push(
          `securityHub standard (${securityHubStandard.name}) "deploymentTargets" is required when "deploymentTargets" for securityHub is defined`,
        );
      }
    }

    securityHubStandardAccounts = [...new Set(securityHubStandardAccounts)];
    securityHubStandardRegions = [...new Set(securityHubStandardRegions)];

    for (const account of securityHubStandardAccounts) {
      if (!securityHubAccounts.includes(account)) {
        errors.push(
          `securityHub standard deployment target account: "${account}" not present in deployment targets for securityHub : "${securityHubAccounts}".`,
        );
      }
    }

    for (const region of securityHubStandardRegions) {
      if (!securityHubRegions.includes(region)) {
        errors.push(
          `securityHub standard deployment target region: "${region}" not present in deployment targets for securityHub : "${securityHubRegions}".`,
        );
      }
    }
  }

  /**
   * Function to validate securityHub and awsConfig deploymentTargets
   * SecurityHub requires awsConfig to be enabled
   * @param values
   * @param accountsConfig
   * @param globalConfig
   * @param errors
   */
  private validateConfigDeloymentTargetsInSecurityHubDeploymentTargets(
    values: ISecurityConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    errors: string[],
  ) {
    const awsConfig = values.awsConfig;
    const securityHub = values.centralSecurityServices.securityHub;

    if (
      !awsConfig.enableConfigurationRecorder ||
      !awsConfig.deploymentTargets ||
      awsConfig.deploymentTargets.organizationalUnits?.includes('Root') ||
      !securityHub.enable
    )
      return;

    if (!securityHub.deploymentTargets) {
      errors.push(
        `Provide securityHub "deploymentTargets" when "deploymentTargets" for awsConfig is provided. awsConfig must be enabled for all "deploymentTargets" utilizing securityHub`,
      );
    } else if (securityHub.deploymentTargets) {
      const securityHubAccounts = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
        accountsConfig,
        securityHub.deploymentTargets as DeploymentTargets,
      );
      const securityHubRegions = CommonValidatorFunctions.getRegionsFromDeploymentTargets(
        securityHub.deploymentTargets as DeploymentTargets,
        globalConfig,
      );
      const awsConfigAccounts = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
        accountsConfig,
        awsConfig.deploymentTargets as DeploymentTargets,
      );
      const awsConfigRegions = CommonValidatorFunctions.getRegionsFromDeploymentTargets(
        awsConfig.deploymentTargets as DeploymentTargets,
        globalConfig,
      );

      for (const account of securityHubAccounts) {
        if (!awsConfigAccounts.includes(account)) {
          errors.push(
            `securityHub "deploymentTargets" account: "${account}" not present in "deploymentTargets" for awsConfig : "${awsConfigAccounts}". awsConfig must be enabled for all accounts utilizing securityHub.`,
          );
        }
      }

      for (const region of securityHubRegions) {
        if (!awsConfigRegions.includes(region)) {
          errors.push(
            `securityHub deploymentTargets region: "${region}" not present in deploymentTargets for awsConfig : "${awsConfigRegions}". awsConfig must be enabled for all regions utilizing securityHub.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate securityHub and awsConfig
   * SecurityHub requires awsConfig to be enabled
   * @param values
   * @param accountsConfig
   * @param globalConfig
   * @param errors
   */
  private validateSecurityHubAndConfig(values: ISecurityConfig, controlTower: boolean, errors: string[]) {
    const awsConfig = values.awsConfig;
    const securityHub = values.centralSecurityServices.securityHub;

    if (securityHub.enable && !awsConfig.enableConfigurationRecorder && !controlTower) {
      errors.push(`securityHub requires awsConfig to be enabled.`);
    }
  }

  /**
   * Function to validate existence of CloudWatch Metrics deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateCloudWatchMetricsDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const metricSet of values.cloudWatch.metricSets ?? []) {
      if (metricSet.deploymentTargets) {
        for (const account of metricSet.deploymentTargets.accounts ?? []) {
          if (accountNames.indexOf(account) === -1) {
            errors.push(
              `Deployment target account ${account} for CloudWatch Metrics does not exists in accounts-config.yaml file.`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate existence of CloudWatch Alarms deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateCloudWatchAlarmsDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const alarmSet of values.cloudWatch.alarmSets ?? []) {
      for (const account of alarmSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for CloudWatch Alarms does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of CloudWatch LogGroups deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateCloudWatchLogGroupsDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const logGroupSet of values.cloudWatch.logGroups ?? []) {
      for (const account of logGroupSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for CloudWatch LogGroups does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }
  /**
   * Function to validate existence of SSM documents deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateSsmDocumentsDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const documentSet of values.centralSecurityServices.ssmAutomation.documentSets ?? []) {
      for (const account of documentSet.shareTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for SSM automation does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }
  /**
   * Function to validate existence of KMS key deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateKmsKeyConfigDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const keySet of values.keyManagementService?.keySets ?? []) {
      for (const account of keySet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for KMS key ${keySet.name} does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Validate deployment target accounts for EBS default volume encryption
   * @param values SecurityConfig
   * @param ouIdNames string[]
   * @param errors string[]
   */
  private validateEbsEncryptionDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const account of values.centralSecurityServices.ebsDefaultVolumeEncryption.deploymentTargets?.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for EBS default volume encryption does not exist in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Validate deployment target accounts for GuardDuty
   * @param values SecurityConfig
   * @param accountNames string[]
   * @param errors string[]
   */
  private validateGuardDutyDeploymentTargetAccounts(values: ISecurityConfig, accountNames: string[], errors: string[]) {
    for (const account of values.centralSecurityServices.guardduty.deploymentTargets?.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(`Deployment target account ${account} for GuardDuty does not exist in accounts-config.yaml file.`);
      }
    }
  }

  /**
   * Validate deployment target accounts for SecurityHub
   * @param values SecurityConfig
   * @param accountNames string[]
   * @param errors string[]
   */
  private validateSecurityHubDeploymentTargetAccounts(
    values: ISecurityConfig,
    accountNames: string[],
    errors: string[],
  ) {
    for (const account of values.centralSecurityServices.securityHub.deploymentTargets?.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for securityHub does not exist in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate Deployment targets account name for security services
   * @param values
   */
  private validateDeploymentTargetAccountNames(values: ISecurityConfig, accountNames: string[], errors: string[]) {
    this.validateConfigDeploymentTargetAccounts(values, accountNames, errors);
    this.validateConfigRuleDeploymentTargetAccounts(values, accountNames, errors);
    this.validateCloudWatchMetricsDeploymentTargetAccounts(values, accountNames, errors);
    this.validateCloudWatchAlarmsDeploymentTargetAccounts(values, accountNames, errors);
    this.validateSsmDocumentsDeploymentTargetAccounts(values, accountNames, errors);
    this.validateCloudWatchLogGroupsDeploymentTargetAccounts(values, accountNames, errors);
    this.validateKmsKeyConfigDeploymentTargetAccounts(values, accountNames, errors);
    this.validateEbsEncryptionDeploymentTargetAccounts(values, accountNames, errors);
    this.validateGuardDutyDeploymentTargetAccounts(values, accountNames, errors);
    this.validateSecurityHubDeploymentTargetAccounts(values, accountNames, errors);
  }

  /**
   * Function to validate existence of Config deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateConfigDeploymentTargetOUs(values: ISecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const ou of values.awsConfig.deploymentTargets?.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(
          `Deployment target OU ${ou} for AWS Config rules does not exists in organization-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of custom config rule deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateConfigRuleDeploymentTargetOUs(values: ISecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const ruleSet of values.awsConfig.ruleSets ?? []) {
      for (const ou of ruleSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for AWS Config rules does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of CloudWatch Metrics deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateCloudWatchMetricsDeploymentTargetOUs(values: ISecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const metricSet of values.cloudWatch.metricSets ?? []) {
      if (metricSet.deploymentTargets) {
        for (const ou of metricSet.deploymentTargets.organizationalUnits ?? []) {
          if (ouIdNames.indexOf(ou) === -1) {
            errors.push(
              `Deployment target OU ${ou} for CloudWatch metrics does not exists in organization-config.yaml file.`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate existence of CloudWatch Alarms deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateCloudWatchAlarmsDeploymentTargetOUs(values: ISecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const alarmSet of values.cloudWatch.alarmSets ?? []) {
      for (const ou of alarmSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for CloudWatch alarms does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of SSM document deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateSsmDocumentDeploymentTargetOUs(values: ISecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const documentSet of values.centralSecurityServices.ssmAutomation.documentSets ?? []) {
      for (const ou of documentSet.shareTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for SSM documents does not exists in organization-config.yaml file.`);
        }
      }
    }
  }

  /**
   * Function to validate existence of Key Management Service Config deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateKmsKeyConfigDeploymentTargetOUs(values: ISecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const keySet of values.keyManagementService?.keySets ?? []) {
      for (const ou of keySet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for KMS key ${keySet.name} does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Validate deployment target OUs for EBS default volume encryption
   * @param values SecurityConfig
   * @param ouIdNames string[]
   * @param errors string[]
   */
  private validateEbsEncryptionDeploymentTargetOUs(values: SecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const ou of values.centralSecurityServices.ebsDefaultVolumeEncryption.deploymentTargets?.organizationalUnits ??
      []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(
          `Deployment target OU ${ou} for EBS default volume encryption does not exist in organization-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Validate deployment target OUs for GuardDuty
   * @param values SecurityConfig
   * @param ouIdNames string[]
   * @param errors string[]
   */
  private validateGuardDutyDeploymentTargetOUs(values: SecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const ou of values.centralSecurityServices.guardduty.deploymentTargets?.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(`Deployment target OU ${ou} for GuardDuty does not exist in organization-config.yaml file.`);
      }
    }
  }

  /**
   * Validate deployment target OUs for SecurityHub
   * @param values SecurityConfig
   * @param ouIdNames string[]
   * @param errors string[]
   */
  private validateSecurityHubDeploymentTargetOUs(values: SecurityConfig, ouIdNames: string[], errors: string[]) {
    for (const ou of values.centralSecurityServices.securityHub.deploymentTargets?.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(`Deployment target OU ${ou} for securityHub does not exist in organization-config.yaml file.`);
      }
    }
  }

  /**
   * Function to validate Deployment targets OU name for security services
   * @param values
   */
  private validateDeploymentTargetOUs(values: SecurityConfig, ouIdNames: string[], errors: string[]) {
    this.validateSsmDocumentDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateCloudWatchAlarmsDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateCloudWatchMetricsDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateConfigDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateConfigRuleDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateKmsKeyConfigDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateEbsEncryptionDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateGuardDutyDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateSecurityHubDeploymentTargetOUs(values, ouIdNames, errors);
  }

  /**
   * Function to validate existence of custom config rule assets such as lambda zip file and role policy file
   * @param configDir
   * @param ruleSet
   */
  private validateConfigRuleAssets(configDir: string, ruleSet: IAwsConfigRuleSet, errors: string[]) {
    for (const rule of ruleSet.rules) {
      if (rule.type === 'Custom' && rule.customRule) {
        // Validate presence of custom rule lambda function zip file
        if (!fs.existsSync(path.join(configDir, rule.customRule.lambda.sourceFilePath))) {
          errors.push(
            `Custom rule: ${rule.name} lambda function file ${rule.customRule.lambda.sourceFilePath} not found`,
          );
        }
        // Validate presence of custom rule lambda function role policy file
        if (!fs.existsSync(path.join(configDir, rule.customRule.lambda.rolePolicyFile))) {
          errors.push(
            `Custom rule: ${rule.name} lambda function role policy file ${rule.customRule.lambda.rolePolicyFile} not found`,
          );
        }
      }
    }
  }

  /**
   * Function to validate if AWS Config Rule names are unique to the environments they're deployed to respectively.
   * @param ruleSet
   * @param helpers
   */
  private validateConfigRuleNames(
    configItem: IAwsConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    errors: string[],
  ) {
    const configRuleMap: { name: string; environments: string[] }[] = [];
    const configRuleNames: string[] = [];
    const duplicateNames: string[] = [];

    for (const ruleSetItem of configItem.ruleSets ?? []) {
      for (const ruleItem of ruleSetItem.rules ?? []) {
        configRuleMap.push({
          name: ruleItem.name,
          environments: CommonValidatorFunctions.getEnvironmentsFromDeploymentTargets(
            accountsConfig,
            ruleSetItem.deploymentTargets as DeploymentTargets,
            globalConfig,
          ),
        });
      }
    }

    configRuleMap.forEach(configRule => configRuleNames.push(configRule.name));
    for (const ruleName of configRuleNames) {
      const deploymentTargetRules = configRuleMap.filter(rule => rule.name === ruleName);
      const resultMap = deploymentTargetRules.map(rule => rule.environments);
      if (this.hasDuplicates(resultMap.flat())) {
        duplicateNames.push(ruleName);
      }
    }
    if (duplicateNames.length > 0) {
      errors.push(
        `Duplicate AWS Config rules name exist with the same name and must be unique when deployed to the same account and region. Config rules in file: ${configRuleNames}`,
      );
    }
  }

  /**
   * Validate Config rule remediation account name
   * @param ruleSet
   * @param accountNames
   * @param errors
   */
  private validateConfigRuleRemediationAccountNames(
    ruleSet: AwsConfigRuleSet,
    accountNames: string[],
    errors: string[],
  ) {
    for (const rule of ruleSet.rules) {
      if (rule.remediation?.targetAccountName && !accountNames.includes(rule.remediation.targetAccountName)) {
        errors.push(
          `Rule: ${rule.name}, remediation target account ${rule.remediation.targetAccountName} does not exist in accounts-config.yaml`,
        );
      }
    }
  }

  /**
   * Function to validate existence of config rule remediation assume role definition file
   * @param configDir
   * @param ruleSet
   */
  private validateConfigRuleRemediationAssumeRoleFile(configDir: string, ruleSet: IAwsConfigRuleSet, errors: string[]) {
    for (const rule of ruleSet.rules) {
      if (rule.remediation) {
        // Validate presence of rule remediation assume role definition file
        if (!fs.existsSync(path.join(configDir, rule.remediation.rolePolicyFile))) {
          errors.push(
            `Rule: ${rule.name}, remediation assume role definition file ${rule.remediation.rolePolicyFile} not found`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of config rule remediation target assets such as SSM document and lambda zip file
   * @param configDir
   * @param ruleSet
   */
  private validateConfigRuleRemediationTargetAssets(
    configDir: string,
    ruleSet: IAwsConfigRuleSet,
    ssmDocuments: { name: string; template: string }[],
    errors: string[],
  ) {
    for (const rule of ruleSet.rules) {
      if (rule.remediation) {
        if (!IsPublicSsmDoc(rule.remediation.targetId)) {
          // Validate presence of SSM document before used as remediation target
          if (!ssmDocuments.find(item => item.name === rule.remediation?.targetId)) {
            errors.push(
              `Rule: ${rule.name}, remediation target SSM document ${rule.remediation?.targetId} not found in ssm automation document lists`,
            );
            // Validate presence of custom rule's remediation SSM document invoke lambda function zip file
            if (rule.remediation.targetDocumentLambda) {
              if (!fs.existsSync(path.join(configDir, rule.remediation.targetDocumentLambda.sourceFilePath))) {
                errors.push(
                  `Rule: ${rule.name}, remediation target SSM document lambda function file ${rule.remediation.targetDocumentLambda.sourceFilePath} not found`,
                );
              }
            }
          }
        }
      }
    }
  }

  private validateSsmDocumentTargetTypes(ssmDocuments: IDocumentConfig[], errors: string[]) {
    // check if document target type falls under the regex specified by API for SSM CreateDocument
    // ref: https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_CreateDocument.html#systemsmanager-CreateDocument-request-TargetType
    const ssmDocumentTargetTypeRegex = /^\/[\w.\-:/]*$/;
    for (const document of ssmDocuments) {
      if (document.targetType) {
        if (!ssmDocumentTargetTypeRegex.test(document.targetType)) {
          errors.push(
            `SSM document: ${document.name} has does not conform with regular expression for TargetType in CreateDocument API call`,
          );
        } else {
          // check if document target length is over 200
          if (document.targetType.length > 200) {
            errors.push(
              `SSM document: ${document.name} has TargetType length over 200, please reduce the length of TargetType`,
            );
          }
        }
      }
    }
  }
  /**
   *
   */
  private validateSsmDocumentNames(ssmDocuments: IDocumentConfig[], errors: string[]) {
    // check if document name falls under the regex specified by API for SSM CreateDocument
    // ref: https://docs.aws.amazon.com/systems-manager/latest/APIReference/API_CreateDocument.html#systemsmanager-CreateDocument-request-Name
    const ssmDocumentNameRegex = /^[a-zA-Z0-9_\-.:/]{3,128}$/;
    for (const document of ssmDocuments) {
      if (!ssmDocumentNameRegex.test(document.name)) {
        errors.push(
          `SSM document: ${document.name} has does not conform with regular expression for Name in CreateDocument API call`,
        );
      }
    }
  }

  /**
   * Function to validate that sns topic references are correct
   * @param globalConfig
   * @param alarmSet
   * @param snsTopicNames
   * @param errors
   */
  private validateSnsTopics(
    globalConfig: GlobalConfig,
    alarmSet: IAlarmSetConfig,
    snsTopicNames: string[],
    errors: string[],
  ) {
    for (const alarm of alarmSet.alarms) {
      if (alarm.snsTopicName && alarm.snsAlertLevel) {
        errors.push(`Alarm: ${alarm.alarmName} is configured for both snsAlertLevel (Deprecated) and snsTopicName`);
      }

      if (globalConfig.snsTopics && !alarm.snsTopicName) {
        errors.push(
          `Alarm: ${alarm.alarmName} does not have the property snsTopicName set and global config has snsTopics configured.`,
        );
      }
      if (alarm.snsTopicName && !snsTopicNames.find(item => item === alarm.snsTopicName)) {
        errors.push(
          `Alarm: ${alarm.alarmName} is configured to use snsTopicName ${alarm.snsTopicName} and the topic is not configured in the global config.`,
        );
      }
    }
  }

  private validateSecurityHubNotifications(
    snsTopicNames: string[],
    snsTopicName: string | undefined,
    notificationLevel: string | undefined,
    errors: string[],
  ) {
    if (snsTopicName && !notificationLevel) {
      errors.push(`securityHub is configured with a snsTopicName and does not have a notificationLevel`);
    }
    if (!snsTopicName && notificationLevel) {
      errors.push(`securityHub is configured with a notificationLevel and does not have a snsTopicName`);
    }
    if (notificationLevel) {
      switch (notificationLevel) {
        case 'CRITICAL':
          break;
        case 'HIGH':
          break;
        case 'MEDIUM':
          break;
        case 'LOW':
          break;
        case 'INFORMATIONAL':
          break;
        default:
          errors.push(
            `securityHub has been configured with a notificationLevel of ${notificationLevel}. This is not a valid value.`,
          );
      }
    }
    // validate topic exists in global config
    if (snsTopicName && !snsTopicNames.find(item => item === snsTopicName)) {
      errors.push(
        `securityHub is configured to use snsTopicName ${snsTopicName} and the topic is not configured in the global config.`,
      );
    }
  }

  private validateAwsConfigAggregation(
    globalConfig: GlobalConfig,
    accountNames: string[],
    values: ISecurityConfig,
    errors: string[],
  ) {
    if (values.awsConfig.aggregation && globalConfig.controlTower.enable) {
      errors.push(`Control Tower is enabled.  Config aggregation cannot be managed by AWS LZA`);
    }

    if (
      values.awsConfig.aggregation &&
      values.awsConfig.aggregation.delegatedAdminAccount &&
      accountNames.indexOf(values.awsConfig.aggregation?.delegatedAdminAccount) === -1
    ) {
      errors.push(
        `Delegated admin account '${values.awsConfig.aggregation?.delegatedAdminAccount}' provided for config aggregation does not exist in the accounts-config.yaml file.`,
      );
    }
  }

  private validateResourcePolicyEnforcementConfig(
    securityConfig: SecurityConfig,
    ouIdNames: string[],
    accountNames: string[],
    errors: string[],
  ) {
    if (!securityConfig.resourcePolicyEnforcement) return;
    const resourcePolicyEnforcementConfig = securityConfig.resourcePolicyEnforcement;
    for (const resourcePolicy of resourcePolicyEnforcementConfig.policySets) {
      for (const ou of resourcePolicy.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for Data Perimeter AWS Config rules does not exists in organization-config.yaml file.`,
          );
        }
      }

      for (const account of resourcePolicy.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for Data Perimeter AWS Config rules does not exists in accounts-config.yaml file.`,
          );
        }
      }

      if (resourcePolicy.inputParameters?.['SourceAccount']) {
        const sourceAccount = resourcePolicy.inputParameters['SourceAccount'];
        const accountIdRegex = /^\d{12}$/;
        if (sourceAccount !== 'ALL' && sourceAccount.split(',').find(accountId => !accountIdRegex.test(accountId))) {
          errors.push(
            `parameter 'SourceAccount' in data perimeter can only be 'ALL' or list of valid account ID (12 digits) separated by ','`,
          );
        }
      }
    }
  }

  /**
   * Function to validate if static parameter in resource policy templates is defined in replacements config
   * @param configDir
   * @param securityConfig
   * @param replacementConfig
   * @param errors
   */
  private validateResourcePolicyParameters(
    configDir: string,
    securityConfig: SecurityConfig,
    replacementConfig: ReplacementsConfig | undefined,
    errors: string[],
  ) {
    const policyFilePaths = new Set<string>();
    for (const policySet of securityConfig.resourcePolicyEnforcement?.policySets || []) {
      policySet.resourcePolicies.map(rp => policyFilePaths.add(rp.document));
    }
    CommonValidatorFunctions.validateStaticParameters(
      replacementConfig,
      configDir,
      [...policyFilePaths],
      new Set([RESERVED_STATIC_PARAMETER_FOR_RESOURCE_POLICY]),
      errors,
    );
  }

  /**
   * Function to validate AWS Config rules do not use solution defined CMK when global config s3 encryption was disabled.
   * @param securityConfig
   * @param globalConfig
   * @param accountConfig
   * @param errors
   * @returns
   */
  private validateConfigRuleCmkDependency(
    securityConfig: SecurityConfig,
    globalConfig: GlobalConfig,
    accountConfig: AccountsConfig,
    errors: string[],
  ) {
    if (!globalConfig.s3?.encryption?.deploymentTargets) {
      if (globalConfig.s3?.encryption?.createCMK === false) {
        for (const ruleSet of securityConfig.awsConfig.ruleSets) {
          for (const rule of ruleSet.rules) {
            if (this.isConfigRuleCmkDependent(rule)) {
              errors.push(
                `There is a parameter in the security-config.yaml file that refers to the solution created KMS encryption replacement ACCEL_LOOKUP::KMS for the remediation Lambda function for AWS Config rule ${rule.name}, however, global-config.yaml disables the creation of CMK.`,
              );
            }
          }
        }
      }
      return;
    }

    for (const ruleSet of securityConfig.awsConfig.ruleSets) {
      for (const rule of ruleSet.rules) {
        let remediationDeploymentTargets: DeploymentTargets;
        if (this.isConfigRuleCmkDependent(rule)) {
          if (rule.remediation.excludeRegions) {
            remediationDeploymentTargets = {
              accounts: ruleSet.deploymentTargets.accounts ?? [],
              organizationalUnits: ruleSet.deploymentTargets.organizationalUnits ?? [],
              excludedRegions: rule.remediation.excludeRegions ?? [],
              excludedAccounts: ruleSet.deploymentTargets.excludedAccounts ?? [],
            };
          } else {
            remediationDeploymentTargets = ruleSet.deploymentTargets;
          }
          const ruleEnvFromDeploymentTarget = CommonValidatorFunctions.getEnvironmentsFromDeploymentTargets(
            accountConfig,
            remediationDeploymentTargets,
            globalConfig,
          );
          const s3EncryptionEnvFromDeploymentTarget = CommonValidatorFunctions.getEnvironmentsFromDeploymentTargets(
            accountConfig,
            globalConfig.s3.encryption.deploymentTargets,
            globalConfig,
          );

          const compareDeploymentEnvironments = CommonValidatorFunctions.compareDeploymentEnvironments(
            ruleEnvFromDeploymentTarget,
            s3EncryptionEnvFromDeploymentTarget,
          );

          if (!compareDeploymentEnvironments.match) {
            errors.push(
              `There is a parameter in the security-config.yaml file that refers to the solution created KMS encryption replacement ACCEL_LOOKUP::KMS for the remediation Lambda function for AWS Config rule ${rule.name}, however, global-config.yaml disables the creation of CMK.`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to check if given config rule uses solution deployed CMK replacement
   * @param rule
   * @returns
   */
  private isConfigRuleCmkDependent(rule: ConfigRule): ConfigRule | undefined {
    for (const parameter of rule.remediation?.parameters ?? []) {
      for (const [value] of Object.entries(parameter)) {
        if (parameter[value] === '${ACCEL_LOOKUP::KMS}') {
          return rule;
        }
      }
    }

    return undefined;
  }
}

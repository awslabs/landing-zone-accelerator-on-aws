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

import { createLogger } from '@aws-accelerator/utils';
import fs from 'fs';
import path from 'path';
import { AccountsConfig } from '../lib/accounts-config';
import * as t from '../lib/common-types';
import { GlobalConfig } from '../lib/global-config';
import { OrganizationConfig } from '../lib/organization-config';
import { AwsConfigRuleSet, SecurityConfig, SecurityConfigTypes } from '../lib/security-config';

export class SecurityConfigValidator {
  constructor(
    values: SecurityConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    organizationConfig: OrganizationConfig,
    configDir: string,
  ) {
    const errors: string[] = [];
    const ouIdNames: string[] = ['Root'];

    const logger = createLogger(['security-config-validator']);

    logger.info(`${SecurityConfig.FILENAME} file validation started`);
    //
    // SSM Document validations
    const ssmDocuments = this.getSsmDocuments(values);
    //
    // Get list of OU ID names from organization config file
    ouIdNames.push(...this.getOuIdNames(organizationConfig));

    //
    // Get list of Account names from account config file
    const accountNames = this.getAccountNames(accountsConfig);

    // Validate presence of SSM document files
    this.validateSsmDocumentFiles(configDir, ssmDocuments, errors);

    // Validate KMS key policy files
    this.validateKeyPolicyFiles(values, configDir, errors);

    //
    // Create list of custom CMKs, any services to be validated against key list from keyManagementService
    const keyNames: string[] = [values.centralSecurityServices.ebsDefaultVolumeEncryption.kmsKey!];

    // Validate custom CMK names
    this.validateCustomKeyName(values, keyNames, errors);

    //
    // Validate delegated admin account
    // Validate deployment targets against organization config file
    // validate deployment target OUs for security services
    this.validateDelegatedAdminAccount(values, accountNames, errors);
    this.validateDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateDeploymentTargetAccountNames(values, accountNames, errors);

    // Validate expiration for Macie and GuardDuty Lifecycle Rules
    this.macieLifecycleRules(values, errors);
    this.guarddutyLifecycleRules(values, errors);

    //
    // Validate Config rule assets
    for (const ruleSet of values.awsConfig.ruleSets ?? []) {
      this.validateConfigRuleAssets(configDir, ruleSet, errors);
      this.validateConfigRuleRemediationAccountNames(ruleSet, accountNames, errors);
      this.validateConfigRuleRemediationAssumeRoleFile(configDir, ruleSet, errors);
      this.validateConfigRuleRemediationTargetAssets(configDir, ruleSet, ssmDocuments, errors);
    }

    //
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
    for (const organizationalUnit of organizationConfig.organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
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
  private validateDelegatedAdminAccount(values: SecurityConfig, accountNames: string[], errors: string[]) {
    if (!accountNames.includes(values.centralSecurityServices.delegatedAdminAccount)) {
      errors.push(
        `Delegated admin account ${values.centralSecurityServices.delegatedAdminAccount} does not exist in accounts-config.yaml`,
      );
    }
  }

  /**
   * Validate S3 lifecycle expiration to be smaller than noncurrentVersionExpiration
   */
  private macieLifecycleRules(values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>, errors: string[]) {
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
  private guarddutyLifecycleRules(values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>, errors: string[]) {
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
  private getSsmDocuments(values: SecurityConfig): { name: string; template: string }[] {
    const ssmDocuments: { name: string; template: string }[] = [];

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
   * Function to validate existence of custom config rule deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateConfigRuleDeploymentTargetAccounts(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
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
   * Function to validate existence of CloudWatch Metrics deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateCloudWatchMetricsDeploymentTargetAccounts(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const metricSet of values.cloudWatch.metricSets ?? []) {
      for (const account of metricSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for CloudWatch Metrics does not exists in accounts-config.yaml file.`,
          );
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
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
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
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
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
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
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
   * Function to validate Deployment targets account name for security services
   * @param values
   */
  private validateDeploymentTargetAccountNames(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    this.validateConfigRuleDeploymentTargetAccounts(values, accountNames, errors);
    this.validateCloudWatchMetricsDeploymentTargetAccounts(values, accountNames, errors);
    this.validateCloudWatchAlarmsDeploymentTargetAccounts(values, accountNames, errors);
    this.validateSsmDocumentsDeploymentTargetAccounts(values, accountNames, errors);
    this.validateCloudWatchLogGroupsDeploymentTargetAccounts(values, accountNames, errors);
  }

  /**
   * Function to validate existence of custom config rule deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateConfigRuleDeploymentTargetOUs(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
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
  private validateCloudWatchMetricsDeploymentTargetOUs(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const metricSet of values.cloudWatch.metricSets ?? []) {
      for (const ou of metricSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for CloudWatch metrics does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of CloudWatch Alarms deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateCloudWatchAlarmsDeploymentTargetOUs(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
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
  private validateSsmDocumentDeploymentTargetOUs(
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const documentSet of values.centralSecurityServices.ssmAutomation.documentSets ?? []) {
      for (const ou of documentSet.shareTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for SSM documents does not exists in organization-config.yaml file.`);
        }
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
    this.validateConfigRuleDeploymentTargetOUs(values, ouIdNames, errors);
  }

  /**
   * Function to validate existence of custom config rule assets such as lambda zip file and role policy file
   * @param configDir
   * @param ruleSet
   */
  private validateConfigRuleAssets(
    configDir: string,
    ruleSet: t.TypeOf<typeof SecurityConfigTypes.awsConfigRuleSet>,
    errors: string[],
  ) {
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
  private validateConfigRuleRemediationAssumeRoleFile(
    configDir: string,
    ruleSet: t.TypeOf<typeof SecurityConfigTypes.awsConfigRuleSet>,
    errors: string[],
  ) {
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
    ruleSet: t.TypeOf<typeof SecurityConfigTypes.awsConfigRuleSet>,
    ssmDocuments: { name: string; template: string }[],
    errors: string[],
  ) {
    for (const rule of ruleSet.rules) {
      if (rule.remediation) {
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

  /**
   * Function to validate that sns topic references are correct
   * @param globalConfig
   * @param alarmSet
   * @param snsTopicNames
   * @param errors
   */
  private validateSnsTopics(
    globalConfig: GlobalConfig,
    alarmSet: t.TypeOf<typeof SecurityConfigTypes.alarmSetConfig>,
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
      errors.push(`SecurityHub is configured with a snsTopicName and does not have a notificationLevel`);
    }
    if (!snsTopicName && notificationLevel) {
      errors.push(`SecurityHub is configured with a notificationLevel and does not have a snsTopicName`);
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
            `SecurityHub has been configured with a notificationLevel of ${notificationLevel}. This is not a valid value.`,
          );
      }
    }
    // validate topic exists in global config
    if (snsTopicName && !snsTopicNames.find(item => item === snsTopicName)) {
      errors.push(
        `SecurityHub is configured to use snsTopicName ${snsTopicName} and the topic is not configured in the global config.`,
      );
    }
  }

  private validateAwsConfigAggregation(
    globalConfig: GlobalConfig,
    accountNames: string[],
    values: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
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
}

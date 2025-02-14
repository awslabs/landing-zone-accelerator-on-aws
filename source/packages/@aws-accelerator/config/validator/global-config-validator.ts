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
import * as emailValidator from 'email-validator';
import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { AccountsConfig } from '../lib/accounts-config';
import { GlobalConfig, CloudWatchKinesisConfig, CloudWatchFirehoseLamdaProcessorConfig } from '../lib/global-config';
import { IamConfig } from '../lib/iam-config';
import { SecurityConfig } from '../lib/security-config';
import { OrganizationConfig } from '../lib/organization-config';
import { CommonValidatorFunctions } from './common/common-validator-functions';
import { DeploymentTargets, Region } from '../lib/common';
import { StreamMode } from '@aws-sdk/client-kinesis';

export class GlobalConfigValidator {
  constructor(
    values: GlobalConfig,
    accountsConfig: AccountsConfig,
    iamConfig: IamConfig,
    organizationConfig: OrganizationConfig,
    securityConfig: SecurityConfig,
    configDir: string,
    regionByRegionDeployOrder?: string,
  ) {
    const ouIdNames: string[] = ['Root'];

    const errors: string[] = [];

    const logger = createLogger(['global-config-validator']);

    logger.info(`${GlobalConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    //
    ouIdNames.push(...this.getOuIdNames(organizationConfig));
    //
    // Get array of account names from accounts config file
    //
    const accountNames = this.getAccountNames(accountsConfig);
    //
    // Validate logging account name
    //
    this.validateLoggingAccountName(values, accountNames, errors);
    //
    // Validate CentralLogs bucket region name
    //
    this.validateCentralLogsBucketRegionName(values, errors);
    //
    // Validate budget deployment target OU
    //
    this.validateBudgetDeploymentTargetOUs(values, ouIdNames, errors);
    //
    // budget subscribers address validation
    //
    this.validateBudgetSubscriberAddress(values, errors);
    //
    // budget notification email validation
    //
    this.validateBudgetNotificationEmailIds(values, errors);

    //
    // Validate CentralLogs bucket policies.
    //
    this.validateImportedCentralLogsBucketPolicies(configDir, values, errors);
    //
    // Validate CentralLogs bucket encryption policies.
    //
    this.validateImportedCentralLogsBucketKmsPolicies(configDir, values, errors);
    //
    // lifecycle rule expiration validation
    //
    this.validateLifecycleRuleExpirationForCentralLogBucket(values, errors);
    this.validateLifecycleRuleExpirationForAccessLogBucket(values, errors);
    this.validateLifecycleRuleExpirationForReports(values, errors);
    //
    // Validate Imported ELB logs bucket resource policies
    //
    this.validateImportedElbLogsBucketPolicies(configDir, values, errors);
    //
    // Validate Imported Access logs bucket resource policies
    //
    this.validateImportedAccessLogsBucketPolicies(configDir, values, errors);
    //
    // Validate configuration of Imported Assets bucket
    //
    this.validateImportedAssetBucketConfig(configDir, accountsConfig, values, errors);
    //
    // validate cloudwatch logging
    //
    this.validateCloudWatch(values, configDir, ouIdNames, accountNames, errors);
    //
    // cloudtrail settings validation
    //
    this.validateCloudTrailSettings(values, errors);
    //
    // snsTopics settings validation
    //
    this.validateSnsTopics(values, logger, errors);
    //
    // central log bucket resource policy attachment validation
    //
    this.validateCentralLogsS3ResourcePolicyFileExists(configDir, values, errors);
    this.validateCentralLogsKmsResourcePolicyFileExists(configDir, values, errors);
    //
    // sessionManager settings validation
    //
    this.validateSessionManager(values, iamConfig, errors);
    //
    // metadata validation
    //
    this.validateAcceleratorMetadata(values, accountNames, errors);
    //
    // cdkOptions validation
    //
    this.validateCdkOptions(values, errors);
    //
    // Validate AWS ControlTower configuration
    //
    this.validateControlTowerConfiguration(values, organizationConfig, errors);
    //
    // Service Limit Quotas validation
    //
    this.validateServiceLimitQuotas(values, errors);
    //
    // AWS Backup validation
    //
    this.validateAwsBackup(configDir, values, errors);

    //
    // Max concurrency validation
    //
    this.validateMaxConcurrency(values, errors);

    //
    // Validate deployment targets
    //
    this.validateDeploymentTargetAccountNames(values, accountNames, errors);
    this.validateDeploymentTargetOUs(values, ouIdNames, errors);

    //
    // bucket policy validation
    //
    if (securityConfig.centralSecurityServices.s3PublicAccessBlock.enable) {
      this.validateAccessLogsS3Policy(configDir, values, errors);
      this.validateCentralLogsS3Policy(configDir, values, errors);
      this.validateElbLogsS3Policy(configDir, values, errors);
    }

    //
    // Validate AccessLogs bucket configuration
    //
    this.validateAccessLogsBucketConfigDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateAccessLogsBucketConfigDeploymentTargetAccounts(values, accountNames, errors);

    //
    // Validate S3 configuration
    //
    this.validateS3ConfigDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateS3ConfigDeploymentTargetAccounts(values, accountNames, errors);

    //
    // Validate File Extensions
    //
    this.validateFileExtensions(values);

    //
    // Validate region by region deploy order doesn't conflict with enabledRegions
    //
    this.validateRegionByRegionDeployOrderMatchesEnabledRegionsConfiguration(values, regionByRegionDeployOrder, errors);

    //
    // Validate event bus policy configuration
    //
    this.validateEventBusPolicyConfiguration(values, configDir, errors);

    //
    // Validate Kinesis configuration
    //
    this.validateKinesisConfiguration(values.logging.cloudwatchLogs?.kinesis, errors);

    //
    // Validate Firehose Lambda processor configuration
    //
    this.validateFirehoseLambdaProcessorConfiguration(values.logging.cloudwatchLogs?.firehose?.lambdaProcessor, errors);

    if (errors.length) {
      throw new Error(`${GlobalConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
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
   * Function to validate existence of budget deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateBudgetDeploymentTargetOUs(values: GlobalConfig, ouIdNames: string[], errors: string[]) {
    for (const budget of values.reports?.budgets ?? []) {
      for (const ou of budget.deploymentTargets?.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for budget ${budget.name} does not exist in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of logging target account name
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateLoggingAccountName(values: GlobalConfig, accountNames: string[], errors: string[]) {
    if (accountNames.indexOf(values.logging.account) === -1) {
      errors.push(
        `Deployment target account ${values.logging.account} for logging does not exist in accounts-config.yaml file.`,
      );
    }
  }

  /**
   * Function to validate existence of central logs bucket region in enabled region list
   * CentralLogs bucket region name must part of pipeline enabled region
   * @param values
   * @param errors
   */
  private validateCentralLogsBucketRegionName(values: GlobalConfig, errors: string[]) {
    if (values.logging.centralizedLoggingRegion) {
      for (const region of values.enabledRegions) {
        if (region === values.logging.centralizedLoggingRegion) {
          return;
        }
      }
      errors.push(
        `CentralLogs bucket region name ${
          values.logging.centralizedLoggingRegion
        } not part of pipeline enabled regions [${values.enabledRegions.toString()}].`,
      );
    }
  }

  /**
   * Function to validate budget subscriber address
   * @param values
   */
  private validateBudgetSubscriberAddress(values: GlobalConfig, errors: string[]) {
    for (const budget of values.reports?.budgets ?? []) {
      for (const notification of budget.notifications ?? []) {
        if (notification.address && notification.recipients) {
          errors.push(`Cannot specify an address and a list of recipients for budget ${budget.name}.`);
        } else if (!notification.address && !notification.recipients) {
          errors.push(`Provide either an address or a list of recipients for budget ${budget.name}.`);
        }
      }
    }
  }

  /**
   * Function to validate budget notification email address
   * @param values
   */
  private validateBudgetNotificationEmailIds(values: GlobalConfig, errors: string[]) {
    for (const budget of values.reports?.budgets ?? []) {
      for (const notification of budget.notifications ?? []) {
        if (notification.subscriptionType === 'EMAIL') {
          if (Array.isArray(notification.recipients)) {
            for (const recipient of notification.recipients) {
              if (!emailValidator.validate(recipient)) {
                errors.push(`Invalid report notification email ${recipient}.`);
              }
            }
          } else if (!emailValidator.validate(notification.address!)) {
            errors.push(`Invalid report notification email ${notification.address!}.`);
          }
        } else if (notification.subscriptionType === 'SNS') {
          const snsGetArnRegex = new RegExp('^arn:.*:sns:.*:(.*):(.*)$');
          if (Array.isArray(notification.recipients)) {
            for (const recipient of notification.recipients) {
              if (!snsGetArnRegex.test(recipient)) {
                errors.push(`The following SNS Topic Arn is malformatted: ${recipient}.`);
              }
              if (notification.recipients.length > 1) {
                errors.push(
                  `SNS subscription type can have only one SNS topic as a recipient: ${notification.recipients}.`,
                );
              }
            }
          } else if (!snsGetArnRegex.test(notification.address!)) {
            errors.push(`The following SNS Topic Arn is malformatted: ${notification.address}.`);
          }
        }
      }
    }
  }

  /**
   * Function to validate S3 lifecycle rules for Cost Reporting
   * @param values
   */
  private validateLifecycleRuleExpirationForReports(values: GlobalConfig, errors: string[]) {
    const ruleNames: string[] = [];
    for (const lifecycleRule of values.reports?.costAndUsageReport?.lifecycleRules ?? []) {
      if (ruleNames.includes(lifecycleRule.id)) {
        errors.push('LifeCycle rule ids must be unique.');
      }
      ruleNames.push(lifecycleRule.id);
      if (lifecycleRule.expiration && !lifecycleRule.noncurrentVersionExpiration) {
        errors.push('You must supply a value for noncurrentVersionExpiration. Cost Reporting');
      }
      if (!lifecycleRule.abortIncompleteMultipartUpload) {
        errors.push('You must supply a value for abortIncompleteMultipartUpload. Cost Reporting');
      }
      if (lifecycleRule.expiration && lifecycleRule.expiredObjectDeleteMarker) {
        errors.push('You may not configure expiredObjectDeleteMarker with expiration. Cost Reporting');
      }
    }
  }

  /**
   * Function to validate imported AccessLogs bucket policies
   * @param configDir string
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateImportedAccessLogsBucketPolicies(configDir: string, values: GlobalConfig, errors: string[]) {
    if (!values.logging.accessLogBucket) {
      return;
    }

    const accessLogBucketItem = values.logging.accessLogBucket;
    const importedBucketItem = accessLogBucketItem.importedBucket;

    if (importedBucketItem && accessLogBucketItem.customPolicyOverrides?.policy) {
      if (!fs.existsSync(path.join(configDir, accessLogBucketItem.customPolicyOverrides?.policy))) {
        errors.push(
          `AccessLogs bucket custom policy overrides file ${accessLogBucketItem.customPolicyOverrides?.policy} not found !!!`,
        );
      }

      if (importedBucketItem.applyAcceleratorManagedBucketPolicy) {
        errors.push(
          `Imported AccessLogs bucket with customPolicyOverrides.policy can not have applyAcceleratorManagedPolicy set to true.`,
        );
      }
      if (accessLogBucketItem.s3ResourcePolicyAttachments) {
        errors.push(
          `Imported AccessLogs bucket with customPolicyOverrides.policy can not have s3ResourcePolicyAttachments.`,
        );
      }
    }

    for (const s3ResourcePolicyAttachment of accessLogBucketItem.s3ResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, s3ResourcePolicyAttachment.policy))) {
        errors.push(
          `AccessLogs bucket resource policy attachment file ${s3ResourcePolicyAttachment.policy} not found !!!`,
        );
      }
    }
  }

  /**
   * Function to validate imported Assets bucket config
   * @param configDir string
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateImportedAssetBucketConfig(
    configDir: string,
    accountsConfig: AccountsConfig,
    values: GlobalConfig,
    errors: string[],
  ) {
    this.validateImportedAssetBucketPolicies(configDir, values, errors);
    this.validateImportedAssetBucketKmsPolicies(configDir, values, errors);
    this.validateCmkExistsInManagementAccount(accountsConfig, values, errors);
  }
  /**
   * Function to validate imported Assets S3 bucket policies
   * @param configDir string
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateImportedAssetBucketPolicies(configDir: string, values: GlobalConfig, errors: string[]) {
    if (!values.logging.assetBucket) {
      return;
    }
    const assetBucketItem = values.logging.assetBucket!;
    const importedBucketItem = assetBucketItem.importedBucket;

    if (importedBucketItem && assetBucketItem.customPolicyOverrides?.s3Policy) {
      if (!fs.existsSync(path.join(configDir, assetBucketItem.customPolicyOverrides?.s3Policy))) {
        errors.push(
          `Assets bucket custom policy overrides file ${assetBucketItem.customPolicyOverrides?.s3Policy} not found !!!`,
        );
      }

      if (importedBucketItem.applyAcceleratorManagedBucketPolicy) {
        errors.push(
          `Imported Assets bucket with customPolicyOverrides.policy can not have applyAcceleratorManagedPolicy set to true.`,
        );
      }
      if (assetBucketItem.s3ResourcePolicyAttachments) {
        errors.push(
          `Imported AccessLogs bucket with customPolicyOverrides.policy can not have s3ResourcePolicyAttachments.`,
        );
      }
    }

    for (const s3ResourcePolicyAttachment of assetBucketItem.s3ResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, s3ResourcePolicyAttachment.policy))) {
        errors.push(
          `AccessLogs bucket resource policy attachment file ${s3ResourcePolicyAttachment.policy} not found !!!`,
        );
      }
    }
  }

  /**
   * Function to validate imported CentralLogs bucket kms policies
   * @param configDir string
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateImportedAssetBucketKmsPolicies(configDir: string, values: GlobalConfig, errors: string[]) {
    if (!values.logging.assetBucket) {
      return;
    }

    const assetBucketItem = values.logging.assetBucket;
    const importedBucketItem = assetBucketItem.importedBucket;

    if (!importedBucketItem) {
      return;
    }

    const createAcceleratorManagedKey = importedBucketItem.createAcceleratorManagedKey ?? false;

    if (assetBucketItem.customPolicyOverrides?.kmsPolicy) {
      if (!fs.existsSync(path.join(configDir, assetBucketItem.customPolicyOverrides.kmsPolicy))) {
        errors.push(
          `Assets bucket encryption custom policy overrides file ${assetBucketItem.customPolicyOverrides.kmsPolicy} not found !!!`,
        );
      }

      if (assetBucketItem.kmsResourcePolicyAttachments) {
        errors.push(
          `Imported Assets bucket with customPolicyOverrides.kmsPolicy can not have policy attachments through centralLogBucketItem.kmsResourcePolicyAttachments.`,
        );
      }
    }

    if (!createAcceleratorManagedKey && assetBucketItem.kmsResourcePolicyAttachments) {
      errors.push(
        `Imported Assets bucket with createAcceleratorManagedKey set to false can not have policy attachments through centralLogBucketItem.kmsResourcePolicyAttachments. Accelerator will not be able to attach policies for the bucket key not created by solution.`,
      );
    }

    for (const kmsResourcePolicyAttachment of assetBucketItem.kmsResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, kmsResourcePolicyAttachment.policy))) {
        errors.push(
          `Assets bucket encryption policy attachment file ${kmsResourcePolicyAttachment.policy} not found !!!`,
        );
      }
    }
  }

  /**
   * Function to validate if S3 CMK exists in Management Account when using an imported Asset S3 Bucket
   * @param accountsConfig {@link AccountsConfig}
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateCmkExistsInManagementAccount(accountsConfig: AccountsConfig, values: GlobalConfig, errors: string[]) {
    if (values.s3?.encryption?.createCMK) {
      if (values.logging.assetBucket?.importedBucket?.createAcceleratorManagedKey) {
        const cmkDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
          accountsConfig,
          values.s3?.encryption?.deploymentTargets as DeploymentTargets,
        );
        const managementAccountInTargets = cmkDeploymentTargetSets.find(item => item === 'Management');
        const homeRegionInTargets = !values.s3?.encryption?.deploymentTargets?.excludedRegions.find(
          item => item === values.homeRegion,
        );
        if (!managementAccountInTargets || !homeRegionInTargets) {
          errors.push(
            `Imported Assets bucket with createAcceleratorManagedKey being set to true has to have the CDK deployed to the Management account in the home region.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate imported ElbLogs bucket policies
   * @param configDir string
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateImportedElbLogsBucketPolicies(configDir: string, values: GlobalConfig, errors: string[]) {
    if (!values.logging.elbLogBucket) {
      return;
    }

    const elbLogBucketItem = values.logging.elbLogBucket;
    const importedBucketItem = elbLogBucketItem.importedBucket;

    if (importedBucketItem && elbLogBucketItem.customPolicyOverrides?.policy) {
      if (!fs.existsSync(path.join(configDir, elbLogBucketItem.customPolicyOverrides?.policy))) {
        errors.push(
          `ElbLogs bucket custom policy overrides file ${elbLogBucketItem.customPolicyOverrides?.policy} not found !!!`,
        );
      }

      if (importedBucketItem.applyAcceleratorManagedBucketPolicy) {
        errors.push(
          `Imported ElbLogs bucket with customPolicyOverrides.policy can not have applyAcceleratorManagedPolicy set to true.`,
        );
      }
      if (elbLogBucketItem.s3ResourcePolicyAttachments) {
        errors.push(
          `Imported ElbLogs bucket with customPolicyOverrides.policy can not have s3ResourcePolicyAttachments.`,
        );
      }
    }

    for (const s3ResourcePolicyAttachment of elbLogBucketItem.s3ResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, s3ResourcePolicyAttachment.policy))) {
        errors.push(
          `ElbLogs bucket resource policy attachment file ${s3ResourcePolicyAttachment.policy} not found !!!`,
        );
      }
    }
  }

  /**
   * Function to validate imported CentralLogs bucket policies
   * @param configDir string
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateImportedCentralLogsBucketPolicies(configDir: string, values: GlobalConfig, errors: string[]) {
    if (!values.logging.centralLogBucket) {
      return;
    }

    const centralLogBucketItem = values.logging.centralLogBucket;
    const importedBucketItem = centralLogBucketItem.importedBucket;

    if (importedBucketItem && centralLogBucketItem.customPolicyOverrides?.s3Policy) {
      if (!fs.existsSync(path.join(configDir, centralLogBucketItem.customPolicyOverrides.s3Policy))) {
        errors.push(
          `CentralLogs bucket custom policy overrides file ${centralLogBucketItem.customPolicyOverrides.s3Policy} not found !!!`,
        );
      }

      if (importedBucketItem.applyAcceleratorManagedBucketPolicy) {
        errors.push(
          `Imported CentralLogs bucket with customPolicyOverrides.s3Policy can not have applyAcceleratorManagedPolicy set to true.`,
        );
      }
      if (centralLogBucketItem.s3ResourcePolicyAttachments) {
        errors.push(
          `Imported CentralLogs bucket with customPolicyOverrides.s3Policy can not have s3ResourcePolicyAttachments.`,
        );
      }
    }

    for (const s3ResourcePolicyAttachment of centralLogBucketItem.s3ResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, s3ResourcePolicyAttachment.policy))) {
        errors.push(
          `CentralLogs bucket resource policy attachment file ${s3ResourcePolicyAttachment.policy} not found !!!`,
        );
      }
    }
  }

  /**
   * Function to validate imported CentralLogs bucket kms policies
   * @param configDir string
   * @param values {@link GlobalConfig}
   * @param errors string[]
   * @returns
   */
  private validateImportedCentralLogsBucketKmsPolicies(configDir: string, values: GlobalConfig, errors: string[]) {
    if (!values.logging.centralLogBucket) {
      return;
    }

    const centralLogBucketItem = values.logging.centralLogBucket;
    const importedBucketItem = centralLogBucketItem.importedBucket;

    if (!importedBucketItem) {
      return;
    }

    const createAcceleratorManagedKey = importedBucketItem.createAcceleratorManagedKey ?? false;

    if (centralLogBucketItem.customPolicyOverrides?.kmsPolicy) {
      if (!fs.existsSync(path.join(configDir, centralLogBucketItem.customPolicyOverrides.kmsPolicy))) {
        errors.push(
          `CentralLogs bucket encryption custom policy overrides file ${centralLogBucketItem.customPolicyOverrides.kmsPolicy} not found !!!`,
        );
      }

      if (centralLogBucketItem.kmsResourcePolicyAttachments) {
        errors.push(
          `Imported CentralLogs bucket with customPolicyOverrides.kmsPolicy can not have policy attachments through centralLogBucketItem.kmsResourcePolicyAttachments.`,
        );
      }
    }

    if (!createAcceleratorManagedKey && centralLogBucketItem.kmsResourcePolicyAttachments) {
      errors.push(
        `Imported CentralLogs bucket with createAcceleratorManagedKey set to false can not have policy attachments through centralLogBucketItem.kmsResourcePolicyAttachments. Accelerator will not be able to attach policies for the bucket key not created by solution.`,
      );
    }

    for (const kmsResourcePolicyAttachment of centralLogBucketItem.kmsResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, kmsResourcePolicyAttachment.policy))) {
        errors.push(
          `CentralLogs bucket encryption policy attachment file ${kmsResourcePolicyAttachment.policy} not found !!!`,
        );
      }
    }
  }

  /**
   * Function to validate S3 lifecycle rules Central Log Bucket
   * @param values
   */
  private validateLifecycleRuleExpirationForCentralLogBucket(values: GlobalConfig, errors: string[]) {
    const ruleNames: string[] = [];
    for (const lifecycleRule of values.logging.centralLogBucket?.lifecycleRules ?? []) {
      if (ruleNames.includes(lifecycleRule.id)) {
        errors.push('LifeCycle rule ids must be unique.');
      }
      ruleNames.push(lifecycleRule.id);

      if (lifecycleRule.expiration && !lifecycleRule.noncurrentVersionExpiration) {
        errors.push('You must supply a value for noncurrentVersionExpiration. Central Log Bucket');
      }
      if (!lifecycleRule.abortIncompleteMultipartUpload) {
        errors.push('You must supply a value for abortIncompleteMultipartUpload. Central Log Bucket');
      }
      if (lifecycleRule.expiration && lifecycleRule.expiredObjectDeleteMarker) {
        errors.push('You may not configure expiredObjectDeleteMarker with expiration. Central Log Bucket');
      }
    }
  }

  private validateLifecycleRuleExpirationForAccessLogBucket(values: GlobalConfig, errors: string[]) {
    const ruleNames: string[] = [];
    for (const lifecycleRule of values.logging.accessLogBucket?.lifecycleRules ?? []) {
      if (ruleNames.includes(lifecycleRule.id)) {
        errors.push('LifeCycle rule ids must be unique.');
      }
      ruleNames.push(lifecycleRule.id);

      if (lifecycleRule.expiration && !lifecycleRule.noncurrentVersionExpiration) {
        errors.push('You must supply a value for noncurrentVersionExpiration. S3 Access Log Bucket');
      }
      if (!lifecycleRule.abortIncompleteMultipartUpload) {
        errors.push('You must supply a value for abortIncompleteMultipartUpload. S3 Access Log Bucket');
      }
      if (lifecycleRule.expiration && lifecycleRule.expiredObjectDeleteMarker) {
        errors.push('You may not configure expiredObjectDeleteMarker with expiration. S3 Access Log Bucket');
      }
    }
  }

  /**
   * Validate CloudWatch Logs replication
   */
  private validateCloudWatch(
    values: GlobalConfig,
    configDir: string,
    ouIdNames: string[],
    accountNames: string[],
    errors: string[],
  ) {
    if (values.logging.cloudwatchLogs?.enable ?? true) {
      if (values.logging.cloudwatchLogs?.dynamicPartitioning) {
        //
        // validate cloudwatch logging dynamic partition
        //
        this.validateCloudWatchDynamicPartition(values, configDir, errors);
      }
      if (values.logging.cloudwatchLogs?.exclusions) {
        //
        // validate cloudwatch logs exclusion config
        //
        this.validateCloudWatchExclusions(values, ouIdNames, accountNames, errors);
      }
    }
  }

  /**
   * Validate Cloudwatch logs exclusion inputs
   */
  private validateCloudWatchExclusions(
    values: GlobalConfig,
    ouIdNames: string[],
    accountNames: string[],
    errors: string[],
  ) {
    for (const exclusion of values.logging.cloudwatchLogs?.exclusions ?? []) {
      // check if users input array of Organization Units is valid
      this.validateCloudWatchExclusionsTargets(exclusion.organizationalUnits ?? [], ouIdNames, errors);
      // check if users input array of accounts is valid
      this.validateCloudWatchExclusionsTargets(exclusion.accounts ?? [], accountNames, errors);
      // check if OU is root and excludeAll is provided
      const foundRoot = exclusion.organizationalUnits?.find(ou => {
        return ou === 'Root';
      });
      if (foundRoot && exclusion.excludeAll === true) {
        errors.push(`CloudWatch exclusion found root OU with excludeAll instead set enable: false cloudwatchLogs.`);
      }

      // if logGroupNames are provided then ensure OUs or accounts are provided
      const ouLength = exclusion.organizationalUnits?.length ?? 0;
      const accountLength = exclusion.accounts?.length ?? 0;
      if (exclusion.logGroupNames && ouLength === 0 && accountLength === 0) {
        errors.push(
          `CloudWatch exclusion logGroupNames (${exclusion.logGroupNames.join(
            ',',
          )}) are provided but no account or OU specified.`,
        );
      }

      // if excludeAll is provided then ensure OU or accounts are provided
      if (exclusion.excludeAll === true && ouLength === 0 && accountLength === 0) {
        errors.push(`CloudWatch exclusion excludeAll was specified but no account or OU specified.`);
      }

      // either specify logGroupNames or excludeAll
      if (exclusion.excludeAll === undefined && exclusion.logGroupNames === undefined) {
        errors.push(`CloudWatch exclusion either specify excludeAll or logGroupNames.`);
      }
    }
  }

  private validateCloudWatchExclusionsTargets(inputList: string[], globalList: string[], errors: string[]) {
    for (const input of inputList) {
      // from the input list pick each element,
      // if OU or account name is in global config pass
      // else bubble up the error
      if (!globalList.includes(input)) {
        errors.push(`CloudWatch exclusions invalid value ${input} provided. Current values: ${globalList.join(',')}.`);
      }
    }
  }

  /**
   * Function to validate CloudWatch Logs Dynamic Partition and enforce format, key-value provided
   * @param values
   */
  private validateCloudWatchDynamicPartition(values: GlobalConfig, configDir: string, errors: string[]) {
    const exampleString = JSON.stringify([
      {
        logGroupPattern: '/AWSAccelerator-SecurityHub',
        s3Prefix: 'security-hub',
      },
    ]);

    const errorMessage = `Please make dynamic partition in json array with key as logGroupPattern and s3Prefix. Here is an example: ${exampleString}`;

    if (values.logging.cloudwatchLogs?.dynamicPartitioning) {
      //read the file in
      const dynamicPartitionValue = fs.readFileSync(
        path.join(configDir, values.logging.cloudwatchLogs?.dynamicPartitioning),
        'utf-8',
      );
      if (JSON.parse(dynamicPartitionValue)) {
        this.checkForArray(JSON.parse(dynamicPartitionValue), errorMessage, errors);
      } else {
        errors.push(`Not valid Json for Dynamic Partition in CloudWatch logs. ${errorMessage}`);
      }
    }
  }

  private validateSnsTopics(values: GlobalConfig, logger: winston.Logger, errors: string[]) {
    if (values.snsTopics) {
      for (const snsTopic of values.snsTopics.topics ?? []) {
        logger.info(`email count: ${snsTopic.emailAddresses.length}`);
        if (snsTopic.emailAddresses.length < 1) {
          errors.push(`Must be at least one email address for the snsTopic named ${snsTopic.name}`);
        }
      }
    }
  }

  private validateSessionManager(values: GlobalConfig, iamConfig: IamConfig, errors: string[]) {
    const iamRoleNames: string[] = [];
    for (const roleSet of iamConfig.roleSets) {
      for (const role of roleSet.roles) {
        iamRoleNames.push(role.name);
      }
    }
    for (const iamRoleName of values.logging.sessionManager.attachPolicyToIamRoles ?? []) {
      if (!iamRoleNames.find(item => item === iamRoleName)) {
        errors.push(
          `Could not find the role named ${iamRoleName} in the IAM config file. Role was used in the Session Manager configuration.`,
        );
      }
    }
  }

  /**
   * Validate s3 resource policy file existence
   * @param configDir
   * @param values
   * @returns
   */
  private validateCentralLogsS3ResourcePolicyFileExists(configDir: string, values: GlobalConfig, errors: string[]) {
    for (const policy of values.logging.centralLogBucket?.s3ResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, policy.policy))) {
        errors.push(`Policy definition file ${policy.policy} not found !!!`);
      }
    }
  }

  /**
   * Validate s3 resource policy file existence
   * @param configDir
   * @param values
   * @returns
   */
  private validateCentralLogsKmsResourcePolicyFileExists(configDir: string, values: GlobalConfig, errors: string[]) {
    for (const policy of values.logging.centralLogBucket?.kmsResourcePolicyAttachments ?? []) {
      if (!fs.existsSync(path.join(configDir, policy.policy))) {
        errors.push(`Policy definition file ${policy.policy} not found !!!`);
      }
    }
  }

  /**
   * Validate Access Log S3 bucket policy for AWS Principal if block public access is enabled.
   * @param configDir
   * @param values
   * @returns
   */
  private validateAccessLogsS3Policy(configDir: string, values: GlobalConfig, errors: string[]) {
    for (const s3ResourcePolicyAttachment of values.logging.accessLogBucket?.s3ResourcePolicyAttachments ?? []) {
      const principalValue = fs.readFileSync(path.join(configDir, s3ResourcePolicyAttachment.policy), 'utf-8');
      const tempValue = JSON.parse(principalValue);
      for (const item of tempValue.Statement ?? []) {
        if (
          item.Effect === 'Allow' &&
          (item.Principal.AWS === '*' || item.Principal === '*') &&
          !item.Condition.StringEquals?.['aws:PrincipalOrgID']
        ) {
          errors.push(
            `Adding policy will make the Access Log S3 Bucket public and conflicts with the Block Public Access setting.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of S3 configuration deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateS3ConfigDeploymentTargetAccounts(values: GlobalConfig, accountNames: string[], errors: string[]) {
    if (!values.s3?.encryption?.deploymentTargets) {
      return;
    }
    for (const account of values.s3.encryption.deploymentTargets.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for S3 encryption configuration does not exists in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of S3 bucket config deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateS3ConfigDeploymentTargetOUs(values: GlobalConfig, ouIdNames: string[], errors: string[]) {
    if (!values.s3?.encryption?.deploymentTargets) {
      return;
    }
    for (const ou of values.s3.encryption.deploymentTargets.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(
          `Deployment target OU ${ou} for S3 encryption configuration does not exist in organization-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of AccessLogs bucket configuration deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateAccessLogsBucketConfigDeploymentTargetAccounts(
    values: GlobalConfig,
    accountNames: string[],
    errors: string[],
  ) {
    if (!values.logging.accessLogBucket?.deploymentTargets) {
      return;
    }
    for (const account of values.logging.accessLogBucket.deploymentTargets.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for AccessLogs bucket encryption configuration does not exists in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of AccessLogs bucket config deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateAccessLogsBucketConfigDeploymentTargetOUs(
    values: GlobalConfig,
    ouIdNames: string[],
    errors: string[],
  ) {
    if (!values.logging.accessLogBucket?.deploymentTargets) {
      return;
    }
    for (const ou of values.logging.accessLogBucket.deploymentTargets.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(
          `Deployment target OU ${ou} for AccessLogs bucket configuration does not exist in organization-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Validate Central S3 bucket policy for AWS Principal if block public access is enabled.
   * @param configDir
   * @param values
   * @returns
   */
  private validateCentralLogsS3Policy(configDir: string, values: GlobalConfig, errors: string[]) {
    for (const s3ResourcePolicyAttachment of values.logging.centralLogBucket?.s3ResourcePolicyAttachments ?? []) {
      const principalValue = fs.readFileSync(path.join(configDir, s3ResourcePolicyAttachment.policy), 'utf-8');
      const tempValue = JSON.parse(principalValue);
      for (const item of tempValue.Statement ?? []) {
        if (
          item.Effect === 'Allow' &&
          (item.Principal.AWS === '*' || item.Principal === '*') &&
          !item.Condition.StringEquals?.['aws:PrincipalOrgID']
        ) {
          errors.push(
            `Adding policy will make the Central S3 Bucket public and conflicts with the Block Public Access setting.`,
          );
        }
      }
    }
  }

  /**
   * Validate ELB Log S3 bucket policy for AWS Principal if block public access is enabled.
   * @param configDir
   * @param values
   * @returns
   */
  private validateElbLogsS3Policy(configDir: string, values: GlobalConfig, errors: string[]) {
    for (const s3ResourcePolicyAttachment of values.logging.elbLogBucket?.s3ResourcePolicyAttachments ?? []) {
      const principalValue = fs.readFileSync(path.join(configDir, s3ResourcePolicyAttachment.policy), 'utf-8');
      const tempValue = JSON.parse(principalValue);
      for (const item of tempValue.Statement ?? []) {
        if (
          item.Effect === 'Allow' &&
          (item.Principal.AWS === '*' || item.Principal === '*') &&
          !item.Condition.StringEquals?.['aws:PrincipalOrgID']
        ) {
          errors.push(
            `Adding policy will make the ELB Log S3 Bucket public and conflicts with the Block Public Access setting.`,
          );
        }
      }
    }
  }

  // Check if input is valid array and proceed to check schema
  private checkForArray(inputStr: string, errorMessage: string, errors: string[]) {
    if (Array.isArray(inputStr)) {
      this.checkSchema(inputStr, errorMessage, errors);
    } else {
      errors.push(`Provided file is not a JSON array. ${errorMessage}`);
    }
  }

  // check schema of each json input. Even if one is wrong abort, report bad item and provide example.
  private checkSchema(inputStr: string, errorMessage: string, errors: string[]) {
    for (const eachItem of inputStr) {
      if (!this.isDynamicLogType(eachItem)) {
        errors.push(`Key value ${JSON.stringify(eachItem)} is incorrect. ${errorMessage}`);
      }
    }
  }

  // Validate this value with a custom type guard
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isDynamicLogType(o: any): o is { logGroupPattern: string; s3Prefix: string } {
    return 'logGroupPattern' in o && 's3Prefix' in o;
  }

  /* Function to validate CloudTrail configuration
   * If multiRegion is enabled then globalServiceEvents
   * must be enabled as well
   */
  private validateCloudTrailSettings(values: GlobalConfig, errors: string[]) {
    if (
      values.logging.cloudtrail.organizationTrail &&
      values.logging.cloudtrail.organizationTrailSettings?.multiRegionTrail &&
      !values.logging.cloudtrail.organizationTrailSettings.globalServiceEvents
    ) {
      errors.push(
        `The organization CloudTrail setting multiRegionTrail is enabled, the globalServiceEvents must be enabled as well`,
      );
    }
    for (const accountTrail of values.logging.cloudtrail.accountTrails ?? []) {
      if (accountTrail.settings.multiRegionTrail && !accountTrail.settings.globalServiceEvents) {
        errors.push(
          `The account CloudTrail with the name ${accountTrail.name} setting multiRegionTrail is enabled, the globalServiceEvents must be enabled as well`,
        );
      }
    }
  }

  private validateAcceleratorMetadata(values: GlobalConfig, accountNames: string[], errors: string[]) {
    if (!values.acceleratorMetadata) {
      return;
    }
    if (!accountNames.find(account => account === values.acceleratorMetadata?.account)) {
      errors.push(
        `The account with the name ${values.acceleratorMetadata.account} defined in acceleratorMetadata does not exist in the accounts config`,
      );
    }
  }

  /* Function to validate cdkOptions configuration
   * We currently have two valid settings to enable centralizing CDK buckets: cdkOptions.centralizeBuckets and centralizeCdkBuckets
   * We want to ensure users only specify one before centralizeCdkBuckets is no longer supported.
   */
  private validateCdkOptions(values: GlobalConfig, errors: string[]) {
    if (values?.cdkOptions && values?.centralizeCdkBuckets) {
      errors.push(
        `Cannot specify values for both cdkOptions and centralizeCdkBuckets. Please delete centralizeCdkBuckets and use cdkOptions`,
      );
    }

    if (!values?.cdkOptions?.centralizeBuckets && values?.cdkOptions?.useManagementAccessRole) {
      errors.push(`cdkOptions.centralizeBuckets must be set to true to enable cdkOptions.useManagementAccessRole`);
    }

    if (!values?.cdkOptions?.centralizeBuckets && values?.cdkOptions?.customDeploymentRole) {
      errors.push(`cdkOptions.centralizeBuckets must be set to true to enable cdkOptions.customDeploymentRole`);
    }
  }

  /**
   * Function to validate AWS ControlTower configuration
   * @param values {@link GlobalConfig}
   * @param organizationConfig {@link OrganizationConfig}
   * @param errors string[]
   */
  private validateControlTowerConfiguration(
    values: GlobalConfig,
    organizationConfig: OrganizationConfig,
    errors: string[],
  ) {
    if (values.controlTower.enable && !organizationConfig.enable) {
      errors.push(
        'The AWS ControlTower cannot be enabled when the Organization enable property is set to false in organization-config.yaml file.',
      );
    }

    if (!values.controlTower.enable && values.controlTower.landingZone) {
      errors.push(
        'The AWS ControlTower LandingZone configuration cannot be provided when the ControlTower enable property is set to false',
      );
    }

    if (values.controlTower.landingZone && !organizationConfig.enable) {
      errors.push(
        'The AWS ControlTower LandingZone configuration cannot be provided when the Organization enable property is set to false in organization-config.yaml file.',
      );
    }
    this.validateControlTowerControls(values, errors);
  }

  private validateControlTowerControls(values: GlobalConfig, errors: string[]) {
    for (const control of values.controlTower.controls ?? []) {
      // Check control identifier starts with AW-GR
      if (!control.identifier.startsWith('AWS-GR')) {
        errors.push(
          `Invalid Control Tower control ${control.identifier}, only strongly recommended or elective Control Tower controls are supported`,
        );
      }

      // Check deploymentTargets does not contain accounts
      if (control.deploymentTargets?.accounts?.length > 0) {
        errors.push(
          `Control Tower controls can only be deployed to Organizational Units. Please remove all account deployment targets from ${control.identifier}`,
        );
      }
    }
  }

  private validateServiceLimitQuotas(values: GlobalConfig, errors: string[]) {
    const globalServices = ['account', 'cloudfront', 'iam', 'organizations', 'route53'];
    for (const limit of values.limits ?? []) {
      // Check for global services and us-east-1 or us-gov-west-1 enabled
      if (
        globalServices.includes(limit.serviceCode) &&
        !values.enabledRegions.includes('us-east-1') &&
        !values.enabledRegions.includes('us-gov-west-1')
      ) {
        errors.push(
          `Service limit increase requested for ${limit.serviceCode}, but global region not included in enabledRegions. Please add the global region for your partition to request service limit increases for global services.`,
        );
      }
    }
  }

  private validateAwsBackup(configDir: string, values: GlobalConfig, errors: string[]) {
    for (const vault of values.backup?.vaults ?? []) {
      if (vault?.policy) {
        if (!fs.existsSync(path.join(configDir, vault.policy))) {
          errors.push(`Policy definition file for Backup Vault ${vault.name} not found !!!`);
        }
      }
    }
  }

  /**
   * validateMaxConcurrency
   */
  private validateMaxConcurrency(values: GlobalConfig, errors: string[]) {
    const maxConcurrentStacks = values.acceleratorSettings?.maxConcurrentStacks ?? 250;
    if (maxConcurrentStacks > 250) {
      errors.push(
        `Provided acceleratorSettings.maxConcurrentStacks: ${values.acceleratorSettings!
          .maxConcurrentStacks!} it cannot be greater than 250 `,
      );
    }
  }

  /**
   * Function to validate Deployment targets account name for security services
   * @param values
   */
  private validateDeploymentTargetAccountNames(values: GlobalConfig, accountNames: string[], errors: string[]) {
    this.validateLambdaEncryptionConfigDeploymentTargetAccounts(values, accountNames, errors);
    this.validateCloudWatchLogsEncryptionConfigDeploymentTargetAccounts(values, accountNames, errors);
    this.validateDefaultEventBusDeploymentTargetAccounts(values, accountNames, errors);
  }

  /**
   * Function to validate Deployment targets OU name for security services
   * @param values
   */
  private validateDeploymentTargetOUs(values: GlobalConfig, ouIdNames: string[], errors: string[]) {
    this.validateLambdaEncryptionConfigDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateCloudWatchLogsEncryptionDeploymentTargetOUs(values, ouIdNames, errors);
    this.validateDefaultEventBusDeploymentTargetOUs(values, ouIdNames, errors);
  }

  /**
   * Function to validate existence of Lambda encryption configuration deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateLambdaEncryptionConfigDeploymentTargetOUs(
    values: GlobalConfig,
    ouIdNames: string[],
    errors: string[],
  ) {
    if (!values.lambda?.encryption) {
      return;
    }

    for (const ou of values.lambda.encryption.deploymentTargets?.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(
          `Deployment target OU ${ou} for lambda encryption configuration does not exists in organization-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of Lambda encryption configuration deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateLambdaEncryptionConfigDeploymentTargetAccounts(
    values: GlobalConfig,
    accountNames: string[],
    errors: string[],
  ) {
    if (!values.lambda?.encryption) {
      return;
    }
    for (const account of values.lambda.encryption?.deploymentTargets?.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for Lambda encryption configuration does not exists in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of CloudWatch log group encryption configuration deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateCloudWatchLogsEncryptionConfigDeploymentTargetAccounts(
    values: GlobalConfig,
    accountNames: string[],
    errors: string[],
  ) {
    if (!values.logging.cloudwatchLogs?.encryption) {
      return;
    }
    for (const account of values.logging.cloudwatchLogs.encryption.deploymentTargets?.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for CloudWatch logs encryption configuration does not exists in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of CloudWatch encryption deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateCloudWatchLogsEncryptionDeploymentTargetOUs(
    values: GlobalConfig,
    ouIdNames: string[],
    errors: string[],
  ) {
    if (!values.logging.cloudwatchLogs?.encryption) {
      return;
    }
    for (const ou of values.logging.cloudwatchLogs.encryption.deploymentTargets?.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(
          `Deployment target OU ${ou} for CloudWatch logs encryption does not exist in organization-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate file extensions for firehose
   * @param values
   */
  private validateFileExtensions(values: GlobalConfig) {
    if (!values.logging.cloudwatchLogs?.firehose?.fileExtension) {
      return;
    }
    const fileExtension = values.logging.cloudwatchLogs?.firehose?.fileExtension;
    if (fileExtension.startsWith('.')) {
      const logger = createLogger(['global-config-validator-file-extension']);
      logger.warn(`Found file extension ${fileExtension} that starts with a dot.`);
    }
  }

  /**
   * Function to validate that if region by region deployment is activated that
   * the deploy order is correctly setup.
   */
  private validateRegionByRegionDeployOrderMatchesEnabledRegionsConfiguration(
    values: GlobalConfig,
    regionByRegionDeployOrder: string | undefined,
    errors: string[],
  ) {
    if (!regionByRegionDeployOrder?.trim()) {
      return;
    }
    const deployOrder = regionByRegionDeployOrder.split(',').map(region => region.trim());
    // Ensure region from deploy order exists in enabledRegions
    for (const deployOrderRegion of deployOrder) {
      if (!values.enabledRegions.includes(deployOrderRegion as Region)) {
        errors.push(`Region ${deployOrderRegion} is not part of enabled regions.`);
      }
    }

    // Ensure that each enabled region is listed in the region by region deploy order
    for (const enabledRegion of values.enabledRegions) {
      if (!deployOrder.includes(enabledRegion)) {
        errors.push(`Region ${enabledRegion} is missing in the region by region deploy order.`);
      }
    }
  }

  /**
   * Function to validate existence of default event bus configuration
   * @param values
   */
  private validateEventBusPolicyConfiguration(values: GlobalConfig, configDir: string, errors: string[]) {
    if (!values.defaultEventBus) {
      return;
    }

    if (values.defaultEventBus.policy) {
      if (!fs.existsSync(path.join(configDir, values.defaultEventBus.policy))) {
        errors.push(`Default event bus policy file ${values.defaultEventBus.policy} not found !!!`);
      }
    }
  }
  /**
   * Function to validate existence of default event bus deployment target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateDefaultEventBusDeploymentTargetAccounts(
    values: GlobalConfig,
    accountNames: string[],
    errors: string[],
  ) {
    if (!values.defaultEventBus) {
      return;
    }
    for (const account of values.defaultEventBus.deploymentTargets?.accounts ?? []) {
      if (accountNames.indexOf(account) === -1) {
        errors.push(
          `Deployment target account ${account} for default event bus configuration does not exists in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of default event bus deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateDefaultEventBusDeploymentTargetOUs(values: GlobalConfig, ouIdNames: string[], errors: string[]) {
    if (!values.defaultEventBus) {
      return;
    }
    for (const ou of values.defaultEventBus.deploymentTargets?.organizationalUnits ?? []) {
      if (ouIdNames.indexOf(ou) === -1) {
        errors.push(
          `Deployment target OU ${ou} for default event bus configuration does not exist in organization-config.yaml file.`,
        );
      }
    }
  }
  /**
   * Function to validate existence of default kinesis configuration
   * @param values
   */
  private validateKinesisConfiguration(kinesisConfig: CloudWatchKinesisConfig | undefined, errors: string[]) {
    // nothing is specified use defaults
    if (!kinesisConfig) {
      return;
    }

    if (kinesisConfig) {
      // check shard count for stream when streaming mode is provisioned or undefined
      if (
        // if no shards are specified then allocate 1 shard
        (kinesisConfig.shardCount ?? 1) < 1 &&
        // if no streaming mode is specified then assume its in provisioned mode
        (kinesisConfig.streamingMode ?? StreamMode.PROVISIONED) === StreamMode.PROVISIONED
      ) {
        errors.push(
          `Specified globalConfig.logging.cloudwatch.kinesis.shardCount less than 1 when streaming mode is provisioned`,
        );
      }
      // check if retention is between 24 and 8760 and is an integer
      const retention = kinesisConfig.retention ?? 24; // Default to 24 if undefined
      if (!Number.isInteger(retention) || retention < 24 || retention > 8760) {
        errors.push(
          `Retention must be an integer between 24 and 8760 hours. Specified value at globalConfig.logging.cloudwatch.kinesis.retention : ${retention}`,
        );
      }
    }
  }
  /**
   * Function to validate existence of default firehose lambda processor configuration
   * @param values
   */
  private validateFirehoseLambdaProcessorConfiguration(
    lambdaProcessor: CloudWatchFirehoseLamdaProcessorConfig | undefined,
    errors: string[],
  ) {
    if (lambdaProcessor) {
      // check buffer size and buffer interval
      // if no buffer size is provided assume default of 0.2
      const bufferSize = lambdaProcessor.bufferSize ?? 0.2;
      // if no buffer interval is provided assume default of 60
      const bufferInterval = lambdaProcessor.bufferInterval ?? 60;
      if (bufferSize < 0.2 || bufferSize > 3) {
        errors.push(
          `Specified globalConfig.logging.cloudwatch.firehose.lambdaProcessor.bufferSize: ${bufferSize}. It should be between 0.2 and 3.`,
        );
      }
      if (bufferInterval < 60 || bufferInterval > 900) {
        errors.push(
          `Specified globalConfig.logging.cloudwatch.firehose.lambdaProcessor.bufferInterval: ${bufferInterval}. It should be between 60 and 900.`,
        );
      }
    }
  }
}

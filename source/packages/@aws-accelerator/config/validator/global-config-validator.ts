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
import * as emailValidator from 'email-validator';
import fs from 'fs';
import path from 'path';
import winston from 'winston';
import { AccountsConfig } from '../lib/accounts-config';
import { GlobalConfig } from '../lib/global-config';
import { IamConfig } from '../lib/iam-config';
import { OrganizationConfig } from '../lib/organization-config';

export class GlobalConfigValidator {
  constructor(
    values: GlobalConfig,
    accountsConfig: AccountsConfig,
    iamConfig: IamConfig,
    organizationConfig: OrganizationConfig,
    configDir: string,
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
    // budget notification email validation
    //
    this.validateBudgetNotificationEmailIds(values, errors);
    //
    // lifecycle rule expiration validation
    //
    this.validateLifecycleRuleExpirationForCentralLogBucket(values, errors);
    this.validateLifecycleRuleExpirationForAccessLogBucket(values, errors);
    this.validateLifecycleRuleExpirationForReports(values, errors);
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
   * Function to validate budget notification email address
   * @param values
   */
  private validateBudgetNotificationEmailIds(values: GlobalConfig, errors: string[]) {
    for (const budget of values.reports?.budgets ?? []) {
      for (const notification of budget.notifications ?? []) {
        if (!emailValidator.validate(notification.address!)) {
          errors.push(`Invalid report notification email ${notification.address!}.`);
        }
      }
    }
  }

  /**
   * Function to validate S3 lifecycle rules for Cost Reporting
   * @param values
   */
  private validateLifecycleRuleExpirationForReports(values: GlobalConfig, errors: string[]) {
    for (const lifecycleRule of values.reports?.costAndUsageReport?.lifecycleRules ?? []) {
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
   * Function to validate S3 lifecycle rules Central Log Bucket
   * @param values
   */
  private validateLifecycleRuleExpirationForCentralLogBucket(values: GlobalConfig, errors: string[]) {
    for (const lifecycleRule of values.logging.centralLogBucket?.lifecycleRules ?? []) {
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
    for (const lifecycleRule of values.logging.centralLogBucket?.lifecycleRules ?? []) {
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
  }
}

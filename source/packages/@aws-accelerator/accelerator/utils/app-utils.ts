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

import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import fs from 'fs';
import path from 'path';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';

export interface AcceleratorContext {
  /**
   * The AWS partition
   */
  partition: string;
  /**
   * The directory containing the accelerator configuration files
   */
  configDirPath?: string;
  /**
   * The pipeline stage
   *
   * @see {@link AcceleratorStage}
   */
  stage?: string;
  /**
   * The AWS account ID
   */
  account?: string;
  /**
   * The AWS region name
   */
  region?: string;
}

export interface AcceleratorResourcePrefixes {
  /**
   * Accelerator prefix
   */
  accelerator: string;
  /**
   * Accelerator bucket name prefix
   */
  bucketName: string;
  /**
   * Accelerator database name prefix
   */
  databaseName: string;
  /**
   * Accelerator KMS key alias prefix
   */
  kmsAlias: string;
  /**
   * Accelerator config repository name prefix
   */
  repoName: string;
  /**
   * Accelerator Secrets Manager secret name prefix
   */
  secretName: string;
  /**
   * Accelerator SNS topic name prefix
   */
  snsTopicName: string;
  /**
   * Accelerator SSM parameter name prefix
   */
  ssmParamName: string;
  /**
   * Accelerator CloudTrail log name prefix
   */
  trailLogName: string;
}

export interface AcceleratorEnvironment {
  /**
   * Audit (Security-Tooling) account email address
   */
  auditAccountEmail: string;
  /**
   * Accelerator configuration repository name
   */
  configRepositoryName: string;
  /**
   * Accelerator configuration repository branch name
   *
   * @default 'main'
   */
  configRepositoryBranchName: string;
  /**
   * Whether or not Control Tower is enabled in the accelerator environment
   */
  controlTowerEnabled: string;
  /**
   * Whether or not to enable the manual approval pipeline stage
   *
   * @default true
   */
  enableApprovalStage: boolean;
  /**
   * Whether or not to enable single account mode
   */
  enableSingleAccountMode: boolean;
  /**
   * Log Archive account email address
   */
  logArchiveAccountEmail: string;
  /**
   * Management account email address
   */
  managementAccountEmail: string;
  /**
   * Source code repository branch name
   */
  sourceBranchName: string;
  /**
   * Source code repository location
   *
   * @default 'github'
   */
  sourceRepository: string;
  /**
   * Source code repository name
   *
   * @default 'landing-zone-accelerator-on-aws'
   */
  sourceRepositoryName: string;
  /**
   * Source code repository owner
   *
   * @default 'awslabs'
   */
  sourceRepositoryOwner: string;
  /**
   * Use a configuration repository that already exists
   */
  useExistingConfigRepo: boolean;
  /**
   * Notification email list for manual approval stage
   */
  approvalStageNotifyEmailList?: string;
  /**
   * Configuration git commit ID
   */
  configCommitId?: string;
  /**
   * AWS account ID for management account
   */
  managementAccountId?: string;
  /**
   * Management account assume role name
   */
  managementAccountRoleName?: string;
  /**
   * Cross-account assume role name
   */
  managementCrossAccountRoleName?: string;
  /**
   * Accelerator qualifier
   */
  qualifier?: string;
}

/**
 * Get accelerator app context from CLI input
 * @param app
 * @returns
 */
export function getContext(app: cdk.App): AcceleratorContext {
  const partition = app.node.tryGetContext('partition');

  if (!partition) {
    throw new Error('Partition value must be specified in app context');
  }

  return {
    partition,
    configDirPath: app.node.tryGetContext('config-dir'),
    stage: app.node.tryGetContext('stage'),
    account: app.node.tryGetContext('account'),
    region: app.node.tryGetContext('region'),
  };
}

/**
 * Set accelerator resource prefixes based on provided input
 * from installer stack parameters
 * @param prefix
 * @returns
 */
export function setResourcePrefixes(prefix: string): AcceleratorResourcePrefixes {
  return prefix === 'AWSAccelerator'
    ? {
        accelerator: prefix,
        bucketName: 'aws-accelerator',
        databaseName: 'aws-accelerator',
        kmsAlias: 'alias/accelerator',
        repoName: 'aws-accelerator',
        secretName: '/accelerator',
        snsTopicName: 'aws-accelerator',
        ssmParamName: '/accelerator',
        trailLogName: 'aws-accelerator',
      }
    : {
        accelerator: prefix,
        bucketName: prefix.toLocaleLowerCase(),
        databaseName: prefix.toLocaleLowerCase(),
        kmsAlias: `alias/${prefix}`,
        repoName: prefix,
        secretName: prefix,
        snsTopicName: prefix,
        ssmParamName: `/${prefix}`,
        trailLogName: prefix,
      };
}

/**
 * Set config repository name based on provided input
 * from installer stack parameters
 * @param repoNamePrefix
 * @param useExisting
 * @param existingRepoName
 * @param existingBranchName
 * @param qualifier
 * @returns
 */
function setConfigRepoName(
  repoNamePrefix: string,
  useExistingConfigRepo?: string,
  existingRepoName?: string,
  existingBranchName?: string,
  qualifier?: string,
): string {
  if (useExistingConfigRepo === 'Yes' && (!existingRepoName || !existingBranchName)) {
    throw new Error(
      'Attempting to deploy pipeline stage(s) and environment variables are not set [EXISTING_CONFIG_REPOSITORY_NAME, EXISTING_CONFIG_REPOSITORY_BRANCH_NAME], when USE_EXISTING_CONFIG_REPO environment is set to Yes',
    );
  }

  let configRepositoryName = `${repoNamePrefix}-config`;
  if (useExistingConfigRepo === 'Yes') {
    configRepositoryName = existingRepoName!;
  } else {
    if (qualifier) {
      configRepositoryName = `${qualifier}-config`;
    }
  }
  return configRepositoryName;
}

/**
 * Set accelerator environment variables
 * @param env
 * @param resourcePrefixes
 * @returns
 */
export function setAcceleratorEnvironment(
  env: NodeJS.ProcessEnv,
  resourcePrefixes: AcceleratorResourcePrefixes,
  stage?: string,
): AcceleratorEnvironment {
  // Check for mandatory environment variables in PIPELINE stage
  checkMandatoryEnvVariables(env, stage);

  // Set config repo name
  const configRepositoryName = setConfigRepoName(
    resourcePrefixes.repoName,
    env['USE_EXISTING_CONFIG_REPO'],
    env['EXISTING_CONFIG_REPOSITORY_NAME'],
    env['EXISTING_CONFIG_REPOSITORY_BRANCH_NAME'],
    env['ACCELERATOR_QUALIFIER'],
  );

  return {
    auditAccountEmail: env['AUDIT_ACCOUNT_EMAIL'] ?? '',
    configRepositoryName,
    configRepositoryBranchName: env['EXISTING_CONFIG_REPOSITORY_BRANCH_NAME'] ?? 'main',
    controlTowerEnabled: env['CONTROL_TOWER_ENABLED'] ?? '',
    enableApprovalStage: env['ACCELERATOR_ENABLE_APPROVAL_STAGE']
      ? env['ACCELERATOR_ENABLE_APPROVAL_STAGE'] === 'Yes'
      : true,
    enableSingleAccountMode: env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true',
    logArchiveAccountEmail: env['LOG_ARCHIVE_ACCOUNT_EMAIL'] ?? '',
    managementAccountEmail: env['MANAGEMENT_ACCOUNT_EMAIL'] ?? '',
    sourceBranchName: env['ACCELERATOR_REPOSITORY_BRANCH_NAME'] ?? '',
    sourceRepository: env['ACCELERATOR_REPOSITORY_SOURCE'] ?? 'github',
    sourceRepositoryName: env['ACCELERATOR_REPOSITORY_NAME'] ?? 'landing-zone-accelerator-on-aws',
    sourceRepositoryOwner: env['ACCELERATOR_REPOSITORY_OWNER'] ?? 'awslabs',
    useExistingConfigRepo: env['USE_EXISTING_CONFIG_REPO'] === 'Yes',
    approvalStageNotifyEmailList: env['APPROVAL_STAGE_NOTIFY_EMAIL_LIST'],
    configCommitId: env['CONFIG_COMMIT_ID'],
    managementAccountId: env['MANAGEMENT_ACCOUNT_ID'],
    managementAccountRoleName: env['MANAGEMENT_ACCOUNT_ROLE_NAME'],
    managementCrossAccountRoleName: env['MANAGEMENT_CROSS_ACCOUNT_ROLE_NAME'],
    qualifier: env['ACCELERATOR_QUALIFIER'],
  };
}

/**
 * Checks for mandatory environment variables based on accelerator stage and throws
 * an error if any are missing
 * @param env
 * @param stage
 */
function checkMandatoryEnvVariables(env: NodeJS.ProcessEnv, stage?: string) {
  const missingVariables: string[] = [];

  if (stage === AcceleratorStage.PIPELINE) {
    const mandatoryVariables = [
      'AUDIT_ACCOUNT_EMAIL',
      'CONTROL_TOWER_ENABLED',
      'LOG_ARCHIVE_ACCOUNT_EMAIL',
      'MANAGEMENT_ACCOUNT_EMAIL',
      'ACCELERATOR_REPOSITORY_BRANCH_NAME',
    ];

    for (const variable of mandatoryVariables) {
      if (!env[variable]) {
        missingVariables.push(variable);
      }
    }
  }
  // Throw error if any mandatory variables are missing
  if (missingVariables.length > 0) {
    throw new Error(`Missing mandatory environment variables: ${missingVariables.join(', ')}`);
  }
}

/**
 * Set stack properties for accelerator stacks
 * @param context
 * @param acceleratorEnv
 * @param prefixes
 * @param globalRegion
 * @returns
 */
export function setAcceleratorStackProps(
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  prefixes: AcceleratorResourcePrefixes,
  globalRegion: string,
): AcceleratorStackProps | undefined {
  if (!context.configDirPath) {
    return;
  }

  const globalConfig = GlobalConfig.load(context.configDirPath);
  let customizationsConfig: CustomizationsConfig;

  // Create empty customizationsConfig if optional configuration file does not exist
  if (fs.existsSync(path.join(context.configDirPath, 'customizations-config.yaml'))) {
    customizationsConfig = CustomizationsConfig.load(context.configDirPath);
  } else {
    customizationsConfig = new CustomizationsConfig();
  }

  return {
    configDirPath: context.configDirPath,
    accountsConfig: AccountsConfig.load(context.configDirPath),
    customizationsConfig,
    globalConfig,
    iamConfig: IamConfig.load(context.configDirPath),
    networkConfig: NetworkConfig.load(context.configDirPath),
    organizationConfig: OrganizationConfig.load(context.configDirPath),
    securityConfig: SecurityConfig.load(context.configDirPath),
    partition: context.partition,
    globalRegion,
    centralizedLoggingRegion: globalConfig.logging.centralizedLoggingRegion ?? globalConfig.homeRegion,
    prefixes,
    ...acceleratorEnv,
  };
}

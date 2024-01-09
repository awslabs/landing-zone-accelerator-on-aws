/**
 *  Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs';
import * as os from 'os';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import { STSClient, AssumeRoleCommand, AssumeRoleCommandInput, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

import { createLogger, throttlingBackOff } from '@aws-accelerator/utils';

import * as t from './common-types';
import { AccountsConfig } from './accounts-config';
import { ReplacementsConfig } from './replacements-config';
import { OrganizationConfig } from './organization-config';

const logger = createLogger(['global-config']);
/**
 * Global configuration items.
 */
export abstract class GlobalConfigTypes {
  static readonly controlTowerControlConfig = t.interface({
    identifier: t.nonEmptyString,
    enable: t.boolean,
    deploymentTargets: t.deploymentTargets,
  });

  static readonly controlTowerConfig = t.interface({
    enable: t.boolean,
    controls: t.optional(t.array(this.controlTowerControlConfig)),
  });

  static readonly s3EncryptionConfig = t.type({
    createCMK: t.boolean,
    deploymentTargets: t.optional(t.deploymentTargets),
  });

  static readonly s3GlobalConfig = t.type({
    encryption: t.optional(this.s3EncryptionConfig),
  });

  static readonly serviceEncryptionConfig = t.type({
    useCMK: t.boolean,
    deploymentTargets: t.optional(t.deploymentTargets),
  });

  static readonly cloudTrailSettingsConfig = t.interface({
    multiRegionTrail: t.boolean,
    globalServiceEvents: t.boolean,
    managementEvents: t.boolean,
    s3DataEvents: t.boolean,
    lambdaDataEvents: t.boolean,
    sendToCloudWatchLogs: t.boolean,
    apiErrorRateInsight: t.boolean,
    apiCallRateInsight: t.boolean,
  });

  static readonly accountCloudTrailConfig = t.interface({
    name: t.string,
    regions: t.array(t.nonEmptyString),
    deploymentTargets: t.deploymentTargets,
    settings: this.cloudTrailSettingsConfig,
  });

  static readonly cloudTrailConfig = t.interface({
    enable: t.boolean,
    organizationTrail: t.boolean,
    organizationTrailSettings: t.optional(this.cloudTrailSettingsConfig),
    accountTrails: t.optional(t.array(this.accountCloudTrailConfig)),
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
  });

  static readonly centralizeCdkBucketsConfig = t.interface({
    enable: t.boolean,
  });

  static readonly cdkOptionsConfig = t.interface({
    centralizeBuckets: t.boolean,
    useManagementAccessRole: t.optional(t.boolean),
    customDeploymentRole: t.optional(t.string),
    forceBootstrap: t.optional(t.boolean),
    skipStaticValidation: t.optional(t.boolean),
  });

  static readonly externalLandingZoneResourcesConfig = t.interface({
    importExternalLandingZoneResources: t.boolean,
    mappingFileBucket: t.optional(t.string),
    acceleratorPrefix: t.nonEmptyString,
    acceleratorName: t.nonEmptyString,
  });

  static readonly sessionManagerConfig = t.interface({
    sendToCloudWatchLogs: t.boolean,
    sendToS3: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    excludeAccounts: t.optional(t.array(t.string)),
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
    attachPolicyToIamRoles: t.optional(t.array(t.string)),
  });

  static readonly assetBucketConfig = t.interface({
    s3ResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
    kmsResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
    importedBucket: t.optional(t.importedCustomerManagedEncryptionKeyBucketConfig),
    customPolicyOverrides: t.optional(t.customS3ResourceAndKmsPolicyOverridesConfig),
  });

  static readonly accessLogBucketConfig = t.interface({
    enable: t.optional(t.boolean),
    deploymentTargets: t.optional(t.deploymentTargets),
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
    s3ResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
    importedBucket: t.optional(t.importedS3ManagedEncryptionKeyBucketConfig),
    customPolicyOverrides: t.optional(t.customS3ResourcePolicyOverridesConfig),
  });

  static readonly centralLogBucketConfig = t.interface({
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
    s3ResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
    kmsResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
    importedBucket: t.optional(t.importedCustomerManagedEncryptionKeyBucketConfig),
    customPolicyOverrides: t.optional(t.customS3ResourceAndKmsPolicyOverridesConfig),
  });

  static readonly elbLogBucketConfig = t.interface({
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
    s3ResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
    importedBucket: t.optional(t.importedS3ManagedEncryptionKeyBucketConfig),
    customPolicyOverrides: t.optional(t.customS3ResourcePolicyOverridesConfig),
  });

  static readonly cloudWatchLogsExclusionConfig = t.interface({
    organizationalUnits: t.optional(t.array(t.nonEmptyString)),
    regions: t.optional(t.array(t.region)),
    accounts: t.optional(t.array(t.nonEmptyString)),
    excludeAll: t.optional(t.boolean),
    logGroupNames: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly cloudwatchLogsConfig = t.interface({
    dynamicPartitioning: t.optional(t.nonEmptyString),
    enable: t.optional(t.boolean),
    encryption: t.optional(this.serviceEncryptionConfig),
    exclusions: t.optional(t.array(GlobalConfigTypes.cloudWatchLogsExclusionConfig)),
    replaceLogDestinationArn: t.optional(t.nonEmptyString),
  });

  static readonly loggingConfig = t.interface({
    account: t.nonEmptyString,
    centralizedLoggingRegion: t.optional(t.nonEmptyString),
    cloudtrail: GlobalConfigTypes.cloudTrailConfig,
    sessionManager: GlobalConfigTypes.sessionManagerConfig,
    accessLogBucket: t.optional(GlobalConfigTypes.accessLogBucketConfig),
    assetBucket: t.optional(GlobalConfigTypes.assetBucketConfig),
    centralLogBucket: t.optional(GlobalConfigTypes.centralLogBucketConfig),
    elbLogBucket: t.optional(GlobalConfigTypes.elbLogBucketConfig),
    cloudwatchLogs: t.optional(GlobalConfigTypes.cloudwatchLogsConfig),
  });

  static readonly artifactTypeEnum = t.enums('ArtifactType', ['REDSHIFT', 'QUICKSIGHT', 'ATHENA']);

  static readonly costAndUsageReportConfig = t.interface({
    additionalSchemaElements: t.optional(t.array(t.nonEmptyString)),
    compression: t.enums('CompressionType', ['ZIP', 'GZIP', 'Parquet']),
    format: t.enums('FormatType', ['textORcsv', 'Parquet']),
    reportName: t.nonEmptyString,
    s3Prefix: t.nonEmptyString,
    timeUnit: t.enums('TimeCoverageType', ['HOURLY', 'DAILY', 'MONTHLY']),
    additionalArtifacts: t.optional(t.array(this.artifactTypeEnum)),
    refreshClosedReports: t.boolean,
    reportVersioning: t.enums('VersioningType', ['CREATE_NEW_REPORT', 'OVERWRITE_REPORT']),
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
  });

  static readonly notificationConfig = t.interface({
    type: t.enums('NotificationType', ['ACTUAL', 'FORECASTED']),
    thresholdType: t.enums('ThresholdType', ['PERCENTAGE', 'ABSOLUTE_VALUE']),
    comparisonOperator: t.enums('ComparisonType', ['GREATER_THAN', 'LESS_THAN', 'EQUAL_TO']),
    threshold: t.optional(t.number),
    address: t.optional(t.nonEmptyString),
    recipients: t.optional(t.array(t.nonEmptyString)),
    subscriptionType: t.enums('SubscriptionType', ['EMAIL', 'SNS']),
  });

  static readonly budgetConfig = t.interface({
    amount: t.number,
    name: t.nonEmptyString,
    type: t.enums('NotificationType', [
      'USAGE',
      'COST',
      'RI_UTILIZATION',
      'RI_COVERAGE',
      'SAVINGS_PLANS_UTILIZATION',
      'SAVINGS_PLANS_COVERAGE',
    ]),
    timeUnit: t.enums('TimeUnitType', ['DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']),
    includeUpfront: t.optional(t.boolean),
    includeTax: t.optional(t.boolean),
    includeSupport: t.optional(t.boolean),
    includeSubscription: t.optional(t.boolean),
    includeRecurring: t.optional(t.boolean),
    includeOtherSubscription: t.optional(t.boolean),
    includeCredit: t.optional(t.boolean),
    includeDiscount: t.optional(t.boolean),
    includeRefund: t.optional(t.boolean),
    useAmortized: t.optional(t.boolean),
    useBlended: t.optional(t.boolean),
    unit: t.optional(t.nonEmptyString),
    notifications: t.optional(t.array(this.notificationConfig)),
    deploymentTargets: t.optional(t.deploymentTargets),
  });

  static readonly serviceQuotaLimitsConfig = t.interface({
    serviceCode: t.string,
    quotaCode: t.string,
    desiredValue: t.number,
    deploymentTargets: t.deploymentTargets,
    regions: t.optional(t.array(t.region)),
  });

  static readonly reportConfig = t.interface({
    costAndUsageReport: t.optional(this.costAndUsageReportConfig),
    budgets: t.optional(t.array(this.budgetConfig)),
  });

  static readonly vaultConfig = t.interface({
    name: t.nonEmptyString,
    deploymentTargets: t.deploymentTargets,
    policy: t.optional(t.nonEmptyString),
  });

  static readonly backupConfig = t.interface({
    vaults: t.array(this.vaultConfig),
  });

  static readonly snsTopicConfig = t.interface({
    name: t.nonEmptyString,
    emailAddresses: t.array(t.nonEmptyString),
  });

  static readonly snsConfig = t.interface({
    deploymentTargets: t.optional(t.deploymentTargets),
    topics: t.optional(t.array(this.snsTopicConfig)),
  });

  static readonly ssmInventoryConfig = t.interface({
    enable: t.boolean,
    deploymentTargets: t.deploymentTargets,
  });

  static readonly ssmParameterConfig = t.interface({
    name: t.nonEmptyString,
    path: t.nonEmptyString,
    value: t.nonEmptyString,
  });

  static readonly ssmParametersConfig = t.interface({
    parameters: t.array(this.ssmParameterConfig),
    deploymentTargets: t.deploymentTargets,
  });

  static readonly acceleratorMetadataConfig = t.interface({
    enable: t.boolean,
    account: t.string,
    readOnlyAccessRoleArns: t.optional(t.array(t.string)),
  });
  static readonly acceleratorSettingsConfig = t.interface({
    maxConcurrentStacks: t.optional(t.number),
  });

  static readonly lambdaConfig = t.type({
    encryption: t.optional(this.serviceEncryptionConfig),
  });

  static readonly globalConfig = t.interface({
    homeRegion: t.nonEmptyString,
    enabledRegions: t.array(t.region),
    managementAccountAccessRole: t.nonEmptyString,
    cloudwatchLogRetentionInDays: t.number,
    terminationProtection: t.optional(t.boolean),
    controlTower: GlobalConfigTypes.controlTowerConfig,
    centralizeCdkBuckets: t.optional(GlobalConfigTypes.centralizeCdkBucketsConfig), //Deprecated
    cdkOptions: t.optional(GlobalConfigTypes.cdkOptionsConfig),
    externalLandingZoneResources: t.optional(GlobalConfigTypes.externalLandingZoneResourcesConfig),
    logging: GlobalConfigTypes.loggingConfig,
    reports: t.optional(GlobalConfigTypes.reportConfig),
    backup: t.optional(GlobalConfigTypes.backupConfig),
    snsTopics: t.optional(GlobalConfigTypes.snsConfig),
    ssmInventory: t.optional(GlobalConfigTypes.ssmInventoryConfig),
    tags: t.optional(t.array(t.tag)),
    ssmParameters: t.optional(t.array(GlobalConfigTypes.ssmParametersConfig)),
    limits: t.optional(t.array(this.serviceQuotaLimitsConfig)),
    acceleratorMetadata: t.optional(GlobalConfigTypes.acceleratorMetadataConfig),
    acceleratorSettings: t.optional(GlobalConfigTypes.acceleratorSettingsConfig),
    lambda: t.optional(GlobalConfigTypes.lambdaConfig),
    s3: t.optional(this.s3GlobalConfig),
  });
}

/**
 * *{@link GlobalConfig} / {@link ControlTowerConfig}*
 *
 * AWS ControlTower configuration
 *
 * @example
 * ```
 * controlTower:
 *   enable: true
 * ```
 */
export class ControlTowerConfig implements t.TypeOf<typeof GlobalConfigTypes.controlTowerConfig> {
  /**
   * Indicates whether AWS ControlTower enabled.
   *
   * When control tower is enabled, accelerator makes sure account configuration file have three mandatory AWS CT accounts.
   * In AWS Control Tower, three shared accounts in your landing zone are provisioned automatically during setup: the management account,
   * the log archive account, and the audit account.
   */
  readonly enable: boolean = true;
  /**
   * A list of Control Tower controls to enable.
   *
   * Only Strongly recommended and Elective controls are permitted, with the exception of the Region deny guardrail. Please see this page for more information: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-controltower-enabledcontrol.html
   */
  readonly controls: ControlTowerControlConfig[] = [];
}

/**
 * {@link GlobalConfig} / {@link ControlTowerConfig} / {@link ControlTowerControlConfig}
 * Control Tower controls
 *
 * @see ControlTowerControlConfig
 *
 * This allows you to enable Strongly Recommended or Elective Controls
 * https://docs.aws.amazon.com/controltower/latest/userguide/optional-controls.html
 *
 * @remarks AWS Control Tower is limited to 10 concurrent operations, where enabling a control for one Organizational Unit constitutes a single operation.
 * To avoid throttling, please enable controls in batches of 10 or fewer each pipeline run. Keep in mind other Control Tower operations may use up some of the available quota.
 *
 * @example
 * controlTowerControls:
 *   - identifier: AWS-GR_RESTRICT_ROOT_USER_ACCESS_KEYS
 *     enable: true
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 */
export abstract class ControlTowerControlConfig
  implements t.TypeOf<typeof GlobalConfigTypes.controlTowerControlConfig>
{
  /**
   * Control Tower control identifier, for Strongly Recommended or Elective controls this should start with AWS-GR
   */
  readonly identifier: string = '';
  /**
   * Control enabled
   */
  readonly enable: boolean = true;
  /**
   * Control Tower control deployment targets, controls can only be deployed to Organizational Units
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
 * *{@link GlobalConfig} / {@link externalLandingZoneResourcesConfig}*
 *
 * External Landing Zone Resources Config
 *
 * @example
 * ```
 * externalLandingZoneResourcesConfig:
 *   importExternalLandingZoneResources: true
 * ```
 */

/**
 * *{@link GlobalConfig} / {@link ServiceEncryptionConfig}*
 *
 * AWS service encryption configuration settings
 *
 * @example
 * ```
 *  encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export class ServiceEncryptionConfig implements t.TypeOf<typeof GlobalConfigTypes.serviceEncryptionConfig> {
  /**
   * Flag indicates whether Accelerator deployed AWS Service will use AWS KMS CMK for encryption or Service managed KMS.
   *
   * @remarks
   * When set to `true`, the solution will create AWS KMS CMK which will be used by the service for encryption. Example, when flag set to `true` for AWS Lambda service, the solution will create AWS KMS CMK to encrypt lambda function environment variables, otherwise AWS managed key will be used for environment variables encryption.
   *
   * @default false
   */
  readonly useCMK: boolean = false;
  /**
   * To control target environments (AWS Account and Region) for the given `useCMK` setting, you may optionally specify deployment targets.
   * Leaving `deploymentTargets` undefined will apply `useCMK` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link S3GlobalConfig} / {@link S3EncryptionConfig}*
 *
 * AWS S3 encryption configuration settings
 *
 * @example
 * ```
 *  encryption:
 *    createCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export class S3EncryptionConfig implements t.TypeOf<typeof GlobalConfigTypes.s3EncryptionConfig> {
  /**
   * Flag indicates whether solution will create CMK for S3 bucket encryption.
   *
   * @remarks
   * When set to `true`, the solution will create AWS KMS CMK which will be used by the S3 for server-side encryption.
   *
   * @default true
   */
  readonly createCMK: boolean = true;
  /**
   * To control target environments (AWS Account and Region) for the given `createCMK` setting, you may optionally specify deployment targets.
   * Leaving `deploymentTargets` undefined will apply `createCMK` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link S3GlobalConfig}*
 *
 * AWS S3 global encryption configuration settings
 *
 * @example
 * ```
 *  encryption:
 *    createCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export class S3GlobalConfig implements t.TypeOf<typeof GlobalConfigTypes.s3GlobalConfig> {
  /**
   * S3 encryption configuration.
   *
   * @remarks
   * Please use the following configuration to disable AWS KMS CMK for AWS S3 bucket encryption.
   * In the absence of this property, the solution will deploy the AWS KMS CMK in every environment (AWS Account and Region).
   * The solution will disregard this property and create CMKs to encrypt the installer bucket, pipeline bucket, and solution deployed CentralLogs bucket,
   * because AWS KMS CMK is always used to encrypt installer buckets, pipeline buckets, and solution deployed CentralLogs buckets.
   *
   * @example
   * ```
   * s3:
   *   encryption:
   *     createCMK: false
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Root
   * ```
   * @default undefined
   */
  readonly encryption: S3EncryptionConfig | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link lambdaConfig}*
 *
 * Lambda Function configuration settings
 *
 * @example
 * ```
 *   encryption:
 *    useCMK: true
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export class LambdaConfig implements t.TypeOf<typeof GlobalConfigTypes.lambdaConfig> {
  /**
   * Encryption setting for AWS Lambda environment variables.
   *
   * @remarks
   *  For more information please refer {@link ServiceEncryptionConfig}
   */
  readonly encryption: ServiceEncryptionConfig | undefined = undefined;
}

export class externalLandingZoneResourcesConfig
  implements t.TypeOf<typeof GlobalConfigTypes.externalLandingZoneResourcesConfig>
{
  /**
   *
   *
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly importExternalLandingZoneResources = false;

  readonly mappingFileBucket = '';

  readonly acceleratorPrefix = 'ASEA';
  readonly acceleratorName = 'ASEA';

  templateMap: t.AseaStackInfo[] = [];
  resourceList: t.AseaResourceMapping[] = [];
  /**
   * List of accountIds deployed using external Accelerator
   */
  accountsDeployedExternally: string[] = [];
  /**
   * SSM Parameter mapping for resource types managed in both accelerators
   */
  resourceParameters: { [key: string]: { [key: string]: string } } = {};
}

/**
 * *{@link GlobalConfig} / {@link centralizeCdkBucketsConfig}*
 *
 * AWS CDK Centralization configuration
 * ***Deprecated***
 * Replaced by cdkOptions in global config
 *
 * @example
 * ```
 * centralizeCdkBuckets:
 *   enable: true
 * ```
 */
export class centralizeCdkBucketsConfig implements t.TypeOf<typeof GlobalConfigTypes.centralizeCdkBucketsConfig> {
  /**
   * ***Deprecated***
   * Replaced by cdkOptions in global config.
   *
   * Indicates whether CDK stacks in workload accounts will utilize S3 buckets in the management account rather than within the account.
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly enable = true;
}

/**
 * *{@link GlobalConfig} / {@link cdkOptionsConfig}*
 *
 * AWS CDK options configuration. This lets you customize the operation of the CDK within LZA, specifically:
 *
 * centralizeBuckets: Enabling this option modifies the CDK bootstrap process to utilize a single S3 bucket per region located in the management account for CDK assets generated by LZA. Otherwise, CDK will create a new S3 bucket in every account and every region supported by LZA.
 * useManagementAccessRole: Enabling this option modifies CDK operations to use the IAM role specified in the `managementAccountAccessRole` option in `global-config.yaml` rather than the default roles created by CDK. Default CDK roles will still be created, but will remain unused. Any stacks previously deployed by LZA will retain their [associated execution role](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html). For more information on these roles, please see [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-contract).
 *
 * @example
 * ```
 * cdkOptions:
 *   centralizeBuckets: true
 *   useManagementAccessRole: true
 * ```
 */

export class cdkOptionsConfig implements t.TypeOf<typeof GlobalConfigTypes.cdkOptionsConfig> {
  /**
   * Indicates whether CDK stacks in workload accounts will utilize S3 buckets in the management account rather than within the account.
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly centralizeBuckets = true;
  /**
   * Indicates whether CDK operations use the IAM role specified in the `managementAccountAccessRole` option in `global-config.yaml` rather than the default roles created by CDK.
   *
   * The roles created and leveraged by CDK by default can be found [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-contract).
   */
  readonly useManagementAccessRole = true;
  /**
   * Creates a deployment role in all accounts in the home region with the name specified in the parameter. This role is used by the LZA for all CDK deployment tasks.
   */
  readonly customDeploymentRole = undefined;
  /**
   * Forces the Accelerator to deploy the bootstrapping stack and circumvent the ssm parameter check. This option is needed when adding or removing a custom deployment role
   */
  readonly forceBootstrap = undefined;
  /**
   * Determines if the LZA pipeline will skip the static config validation step during the pipeline's Build phase. This can be helpful in cases where the config-validator incorrectly throws errors for a valid configuration.
   */
  readonly skipStaticValidation = undefined;
}
/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudTrailConfig} / ({@link AccountCloudTrailConfig}) / {@link CloudTrailSettingsConfig}*
 *
 * AWS CloudTrail Settings configuration
 *
 * @example
 * ```
 * multiRegionTrail: true
 * globalServiceEvents: true
 * managementEvents: true
 * s3DataEvents: true
 * lambdaDataEvents: true
 * sendToCloudWatchLogs: true
 * apiErrorRateInsight: false
 * apiCallRateInsight: false
 * ```
 */
export class CloudTrailSettingsConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudTrailSettingsConfig> {
  /**
   * Whether or not this trail delivers log files from all regions in the account.
   */
  multiRegionTrail = true;
  /**
   * For global services such as AWS Identity and Access Management (IAM), AWS STS, Amazon CloudFront,
   * and Route 53, events are delivered to any trail that includes global services,
   *  and are logged as occurring in US East Region.
   */
  globalServiceEvents = true;
  /**
   * Management events provide insight into management operations that are
   * on resources in your AWS account. These are also known as control plane operations.
   * Management events can also include non-API events that occur in your account.
   * For example, when a user logs in to your account, CloudTrail logs the ConsoleLogin event.
   * Enabling will set ReadWriteType.ALL
   */
  managementEvents = true;
  /**
   * Adds an S3 Data Event Selector for filtering events that match S3 operations.
   * These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   */
  s3DataEvents = true;
  /**
   * Adds an Lambda Data Event Selector for filtering events that match Lambda operations.
   * These events provide insight into the resource operations performed on or within a resource.
   * These are also known as data plane operations.
   */
  lambdaDataEvents = true;
  /**
   * If CloudTrail pushes logs to CloudWatch Logs in addition to S3.  CloudWatch Logs
   * will also be replicated to S3.
   */
  sendToCloudWatchLogs = true;
  /**
   * Will enable CloudTrail Insights and enable the API Error Rate Insight
   */
  readonly apiErrorRateInsight = false;
  /**
   * Will enable CloudTrail Insights and enable the API Call Rate Insight
   */
  readonly apiCallRateInsight = false;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudTrailConfig} / {@link AccountCloudTrailConfig}*
 *
 * Account CloudTrail config
 *
 * @example
 * ```
 * - name: AWSAccelerator-Account-CloudTrail
 *   regions:
 *     - us-east-1
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   settings:
 *     multiRegionTrail: true
 *     globalServiceEvents: true
 *     managementEvents: true
 *     s3DataEvents: true
 *     lambdaDataEvents: true
 *     sendToCloudWatchLogs: true
 *     apiErrorRateInsight: false
 *     apiCallRateInsight: false
 * ```
 */
export class AccountCloudTrailConfig implements t.TypeOf<typeof GlobalConfigTypes.accountCloudTrailConfig> {
  /**
   * Name that will be used to create the CloudTrail.
   */
  readonly name = 'AWSAccelerator-Account-CloudTrail';
  /**
   * Region(s) that this account trail will be deployed in.
   */
  readonly regions: string[] = [];
  /**
   * Which OU's or Accounts the trail will be deployed to
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * Settings for the CloudTrail log
   */
  readonly settings = new CloudTrailSettingsConfig();
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudTrailConfig} / {@link AccountCloudTrailConfig}*
 *
 * AWS Cloudtrail configuration
 *
 * @example
 * ```
 * cloudtrail:
 *   enable: true
 *   organizationTrail: true
 *   organizationTrailSettings:
 *     multiRegionTrail: true
 *     globalServiceEvents: true
 *     managementEvents: true
 *     s3DataEvents: true
 *     lambdaDataEvents: true
 *     sendToCloudWatchLogs: true
 *     apiErrorRateInsight: false
 *     apiCallRateInsight: false
 *   accountTrails: []
 *   lifecycleRules: []
 * ```
 */
export class CloudTrailConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudTrailConfig> {
  /**
   * Indicates whether AWS Cloudtrail enabled.
   *
   * Cloudtrail a service that helps you enable governance, compliance, and operational and risk auditing of your AWS account.
   * This setting does not create any trails.  You will also need to either and organization trail
   * or setup account level trails.
   */
  readonly enable = false;
  /**
   * Indicates whether AWS OrganizationTrail enabled.
   *
   * When OrganizationTrail and cloudtrail is enabled accelerator will enable trusted access designates CloudTrail as a trusted service in your organization.
   * A trusted service can query the organization's structure and create service-linked roles in the organization's accounts.
   */
  readonly organizationTrail = false;
  /**
   * Optional configuration of the organization trail.  OrganizationTrail must be enabled
   * in order to use these settings
   */
  readonly organizationTrailSettings = new CloudTrailSettingsConfig();
  /**
   * Optional configuration of account level CloudTrails. Can be used with or without
   * an Organization Trail
   */
  readonly accountTrails: AccountCloudTrailConfig[] = [];
  /**
   * Optional S3 Log Bucket Lifecycle rules
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link ServiceQuotaLimitsConfig}*
 *
 * AWS Service Quotas configuration
 */
export class ServiceQuotaLimitsConfig implements t.TypeOf<typeof GlobalConfigTypes.serviceQuotaLimitsConfig> {
  /**
   * Indicates which service Service Quota is changing the limit for.
   */
  readonly serviceCode = '';
  /**
   * Indicates the code for the service as these are tied to the account.
   *
   */
  readonly quotaCode = '';
  /**
   * Value associated with the limit change.
   */
  readonly desiredValue = 2000;
  /**
   * List of AWS Account names to be included in the Service Quota changes
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * (Optional) Region(s) where this service quota increase will be requested. Service Quota increases will be requested in the home region only if this property is not defined.
   */
  readonly regions: t.Region[] | undefined = undefined;
}

/**
 * AWS SessionManager configuration
 *
 * @example
 * ```
 * sessionManager:
 *   sendToCloudWatchLogs: true
 *   sendToS3: true
 *   excludeRegions: []
 *   excludeAccounts: []
 *   lifecycleRules: []
 *   attachPolicyToIamRoles:
 *     - EC2-Default-SSM-AD-Role
 * ```
 */
export class SessionManagerConfig implements t.TypeOf<typeof GlobalConfigTypes.sessionManagerConfig> {
  /**
   * Indicates whether sending SessionManager logs to CloudWatchLogs enabled.
   */
  readonly sendToCloudWatchLogs = false;
  /**
   * Indicates whether sending SessionManager logs to S3 enabled.
   *
   * When this flag is on, accelerator will send session manager logs to Central log bucket in LogArchive account.
   */
  readonly sendToS3 = false;
  /**
   * List of AWS Region names to be excluded from configuring SessionManager configuration
   */
  readonly excludeRegions: t.Region[] = [];
  /**
   * List of AWS Account names to be excluded from configuring SessionManager configuration
   */
  readonly excludeAccounts: string[] = [];
  /**
   * S3 Lifecycle rule for log storage
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
  /**
   * List of IAM EC2 roles that the Session Manager
   * access policy should be attached to
   */
  readonly attachPolicyToIamRoles = [];
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link AccessLogBucketConfig}*
 *
 * Accelerator global S3 access logging configuration
 *
 * @example
 * ```
 * accessLogBucket:
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   lifecycleRules:
 *     - enabled: true
 *       id: AccessLifecycle-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *     - enabled: true
 *       id: AccessLifecycle-02
 *       abortIncompleteMultipartUpload: 14
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *   importedBucket:
 *     name: existing-access-log-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 */
export class AccessLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.accessLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   */
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
  /**
   * Flag indicating S3 access logging bucket is enable by solution.
   *
   * @remarks
   * When this property is undefined solution will create S3 access log bucket. You can use `deploymentTargets` to control target accounts and regions for the given `accessLogBucket` configuration.
   * In the solution, this property will be ignored and S3 Access log buckets will be created for the installer bucket,
   * pipeline bucket, solution deployed CentralLogs bucket, and solution deployed Assets bucket, since these buckets always have server access logging enabled.
   */
  readonly enable: boolean | undefined = undefined;
  /**
   * To control target environments (AWS Account and Region) for the given `accessLogBucket` setting, you may optionally specify deployment targets.
   * Leaving `deploymentTargets` undefined will apply `useCMK` setting to all accounts and enabled regions.
   */
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing AccessLogs bucket.
   *
   * Use the following configuration to imported AccessLogs bucket, manage bucket resource policy through solution.
   * ```
   * importedBucket:
   *    name: existing-access-log-bucket
   *    applyAcceleratorManagedBucketPolicy: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket: t.ImportedS3ManagedEncryptionKeyBucketConfig | undefined = undefined;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy.
   * Bucket resource policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   *
   * Use the following configuration to apply custom bucket resource policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides: t.CustomS3ResourcePolicyOverridesConfig | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CentralLogBucketConfig}*
 *
 * Accelerator global S3 central logging configuration
 *
 * @example
 * ```
 * centralLogBucket:
 *   applyAcceleratorManagedPolicy: true
 *   lifecycleRules:
 *     - enabled: true
 *       id: CentralLifecycleRule-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *     - enabled: true
 *       id: CentralLifecycleRule-02
 *       abortIncompleteMultipartUpload: 14
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   kmsResourcePolicyAttachments:
 *     - policy: kms-policies/policy1.json
 *   importedBucket:
 *     name: central-log-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 *     createAcceleratorManagedKey: false
 * ```
 */
export class CentralLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.centralLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   * Configure additional resource policy attachments
   */
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket encryption key policy.
   * This property can not be used when customPolicyOverrides.kmsPolicy property has value.
   * When imported CentralLogs bucket used with createAcceleratorManagedKey set to false, this property can not have any value.
   */
  readonly kmsResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;

  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing CentralLogs bucket.
   *
   * Use the following configuration to imported CentralLogs bucket, manage bucket resource policy and kms policy through solution.
   * ```
   * importedBucket:
   *    name: existing-central-log-bucket
   *    applyAcceleratorManagedBucketPolicy: true
   *    createAcceleratorManagedKey: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket: t.ImportedCustomerManagedEncryptionKeyBucketConfig | undefined = undefined;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy and KMS key policy.
   * Bucket resource policy and kms key policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   * When customPolicyOverrides.kmsPolicy defined kmsResourcePolicyAttachments property can not be defined.
   *
   *
   * Use the following configuration to apply custom bucket resource policy and KMS policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   *   kmsPolicy: kms/full-central-logs-bucket-key-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides: t.CustomS3ResourceAndKmsPolicyOverridesConfig | undefined = undefined;
}
/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link AssetBucketConfig}*
 *
 * Accelerator global S3 asset bucket configuration
 *
 * @example
 * ```
 * assetBucket:
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   importedBucket:
 *     name: aws-accelerator-assets
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 */
export class AssetBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.assetBucketConfig> {
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket encryption key policy.
   * This property can not be used when customPolicyOverrides.kmsPolicy property has value.
   * When imported CentralLogs bucket used with createAcceleratorManagedKey set to false, this property can not have any value.
   */
  readonly kmsResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing Assets bucket.
   *
   * Use the following configuration to imported Assets bucket, manage bucket resource policy and apply bucket encryption through the solution.
   * ```
   * importedBucket:
   *    name: aws-assets
   *    applyAcceleratorManagedBucketPolicy: true
   *    createAcceleratorManagedKey: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket: t.ImportedCustomerManagedEncryptionKeyBucketConfig | undefined = undefined;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy.
   * Bucket resource policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   *
   * Use the following configuration to apply custom bucket resource policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   *   kmsPolicy: kms/full-central-logs-bucket-key-policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides: t.CustomS3ResourceAndKmsPolicyOverridesConfig | undefined = undefined;
}
/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link ElbLogBucketConfig}*
 *
 * Accelerator global S3 elb logging configuration
 *
 * @example
 * ```
 * elbLogBucket:
 *   applyAcceleratorManagedPolicy: true
 *   lifecycleRules:
 *     - enabled: true
 *       id: ElbLifecycleRule-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *     - enabled: true
 *       id: ElbLifecycleRule-02
 *       abortIncompleteMultipartUpload: 14
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   importedBucket:
 *     name: elb-logs-bucket
 *     applyAcceleratorManagedBucketPolicy: true
 * ```
 */
export class ElbLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.elbLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   * Configure additional resource policy attachments
   */
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
  /**
   * JSON policy files.
   *
   * @remarks
   * Policy statements from these files will be added to the bucket resource policy.
   * This property can not be used when customPolicyOverrides.s3Policy property has value.
   *
   * Note: When Block Public Access is enabled for S3 on the AWS account, you can't specify a policy that would make
   * the S3 Bucket public.
   */
  readonly s3ResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
  /**
   * Imported bucket configuration.
   *
   * @remarks
   * Use this configuration when accelerator will import existing ElbLogs bucket.
   *
   * Use the following configuration to imported ElbLogs bucket, manage bucket resource policy through solution.
   * ```
   * importedBucket:
   *    name: existing-elb-log-bucket
   *    applyAcceleratorManagedBucketPolicy: true
   * ```
   *
   * @default
   * undefined
   */
  readonly importedBucket: t.ImportedS3ManagedEncryptionKeyBucketConfig | undefined = undefined;
  /**
   * Custom policy overrides configuration.
   *
   * @remarks
   * Use this configuration to provide JSON string policy file for bucket resource policy.
   * Bucket resource policy will be over written by content of this file, so when using these option policy files must contain complete policy document.
   * When customPolicyOverrides.s3Policy defined importedBucket.applyAcceleratorManagedBucketPolicy can not be set to true also s3ResourcePolicyAttachments property can not be defined.
   *
   * Use the following configuration to apply custom bucket resource policy overrides through policy JSON file.
   * ```
   * customPolicyOverrides:
   *   s3Policy: path/to/policy.json
   * ```
   *
   * @default
   * undefined
   */
  readonly customPolicyOverrides: t.CustomS3ResourcePolicyOverridesConfig | undefined = undefined;
}
/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudWatchLogsConfig}/ {@link CloudWatchLogsExclusionConfig}*
 *
 * Accelerator global CloudWatch Logs exclusion configuration
 *
 * @example
 * ```
 * organizationalUnits:
 *  - Sandbox
 * regions:
 *  - us-west-1
 *  - us-west-2
 * accounts:
 *  - WorkloadAccount1
 * excludeAll: true
 * logGroupNames:
 *  - 'test/*'
 *  - '/appA/*'
 *
 * ```
 */
export class CloudWatchLogsExclusionConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudWatchLogsExclusionConfig> {
  /**
   * List of OUs that the exclusion will apply to
   */
  readonly organizationalUnits: string[] | undefined = undefined;
  /**
   * List of regions where the exclusion will be applied to. If no value is supplied, exclusion is applied to all enabled regions.
   */
  readonly regions: t.Region[] | undefined = undefined;
  /**
   * List of accounts where the exclusion will be applied to
   */
  readonly accounts: string[] | undefined = undefined;
  /**
   * Exclude replication on all logs. By default this is set to false.
   *
   * @remarks
   * If undefined, this is set to false. When set to true, it disables replication on entire OU or account for that region.
   * Setting OU as `Root` with no region specified and making this true will fail validation since that usage is redundant.
   * Instead use the {@link CloudWatchLogsConfig | enable} parameter in cloudwatch log config which will disable replication across all accounts in all regions.
   */
  readonly excludeAll: boolean | undefined = undefined;
  /**
   * List of log groups names where the exclusion will be applied to
   *
   * @remarks
   * Wild cards are supported. These log group names are added in the eventbridge payload which triggers lambda. If `excludeAll` is used then all logGroups are excluded and this parameter is not used.
   */
  readonly logGroupNames: string[] | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudWatchLogsConfig}*
 *
 * Accelerator global CloudWatch Logs logging configuration
 *
 * @remarks
 * You can decide to use AWS KMS CMK or server-side encryption for the log data at rest. When this `encryption` property is undefined, the solution will deploy AWS KMS CMK to encrypt AWS CloudWatch log data at rest.
 * You can use `deploymentTargets` to control target accounts and regions for the given `useCMK` configuration.
 * please see [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/data-protection.html) or [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/encrypt-log-data-kms.html) for more information.
 *
 * @example
 * ```
 * cloudwatchLogs:
 *   dynamicPartitioning: path/to/filter.json
 *   # default is true, if undefined this is set to true
 *   # if set to false, no replication is performed which is useful in test or temporary environments
 *   enable: true
 *   encryption:
 *     useCMK: true
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *   replaceLogDestinationArn: arn:aws:logs:us-east-1:111111111111:destination:ReplaceDestination
 *   exclusions:
 *    # in these OUs do not do log replication
 *    - organizationalUnits:
 *        - Research
 *        - ProofOfConcept
 *      excludeAll: true
 *    # in these accounts exclude pattern testApp
 *    - accounts:
 *        - WorkloadAccount1
 *        - WorkloadAccount1
 *      logGroupNames:
 *        - testApp*
 *    # in these accounts exclude logs in specific regions
 *    - accounts:
 *        - WorkloadAccount1
 *        - WorkloadAccount1
 *      regions:
 *        - us-west-2
 *        - eu-west-1
 *      logGroupNames:
 *        - pattern1*
 * ```
 *
 */
export class CloudWatchLogsConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudwatchLogsConfig> {
  /**
   * Declaration of Dynamic Partition for Kinesis Firehose.
   *
   * @remarks
   * Kinesis firehose Dynamic Partition allows streaming Cloudwatch logs data to be assigned to a specific prefix. The input provided here is the path to log filter JSON file array. More details in the link: https://docs.aws.amazon.com/solutions/latest/landing-zone-accelerator-on-aws/centralized-logging.html
   * Each item in the array is of the format
   * ```
   * { "logGroupPattern": "LogGroupName", "s3Prefix": "s3-prefix" }
   * ```
   * The logs end up in central logs bucket under prefix CloudWatchLogs.
   * In the above example, the log group with `LogGroupName` will stream to `s3://<central-logs-bucket>/CloudWatchLogs/s3-prefix/`
   *
   * It is possible to use `*` for grouping log groups into same prefix. So, in the example below:
   * ```
   * [{ "logGroupPattern": "Application*", "s3Prefix": "app" }]
   * ```
   * The above will take log groups with name `ApplicationA`, `ApplicationB`, `ApplicationC` into s3 prefix `app`.
   * Please make sure that `logGroupPattern` do not conflict each other as the logs are streamed to one destination and not replicated.
   * For example, extending the above example to below
   * ```
   * [{ "logGroupPattern": "Application*", "s3Prefix": "app" }, { "logGroupPattern": "App*", "s3Prefix": "apple" }]
   * ```
   * In the above case, logs from `ApplicationA` can either end up in `app` or `apple`. They will not be replicated to both prefixes.
   *
   *  For more information on Kinesis Firehose dynamic partitioning limits please refer to::
   * https://docs.aws.amazon.com/firehose/latest/dev/limits.html
   *
   *
   */
  readonly dynamicPartitioning: string | undefined = undefined;
  /**
   * Enable or disable CloudWatch replication
   */
  readonly enable: boolean | undefined = undefined;
  /**
   * Encryption setting for AWS CloudWatch log group data.
   *
   * @remarks
   *  For more information please refer {@link ServiceEncryptionConfig}
   */
  readonly encryption: ServiceEncryptionConfig | undefined = undefined;
  /**
   * Exclude Log Groups during replication
   */
  readonly exclusions: CloudWatchLogsExclusionConfig[] | undefined = undefined;
  /**
   * Customer defined log subscription filter destination arn, that is associated with with the existing log group.
   * Accelerator solution needs to disassociate this destination before configuring solution defined subscription filter destination.
   *
   * @default
   * undefined
   *
   * @remarks
   * When no value provided, accelerator solution will not attempt to remove existing customer defined log subscription filter destination.
   * When existing log group(s) have two subscription filter destinations defined, and none of that is solution configured subscription filter destination,
   * then solution will fail to configure log replication for such log groups and as a result pipeline will fail.
   */
  readonly replaceLogDestinationArn: string | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig}*
 *
 * Global logging configuration
 *
 * @example
 * ```
 * logging:
 *   account: LogArchive
 *   centralizedLoggingRegion: us-east-1
 *   cloudtrail:
 *     enable: false
 *     organizationTrail: false
 *   sessionManager:
 *     sendToCloudWatchLogs: false
 *     sendToS3: true
 * ```
 */
export class LoggingConfig implements t.TypeOf<typeof GlobalConfigTypes.loggingConfig> {
  /**
   * Accelerator logging account name.
   * Accelerator use LogArchive account for global logging.
   * This account maintains consolidated logs.
   */
  readonly account = 'LogArchive';
  /**
   * Accelerator central logs bucket region name.
   * Accelerator use CentralLogs bucket to store various log files, Accelerator created buckets and CWL replicates to CentralLogs bucket.
   * CentralLogs bucket region is optional, when not provided this bucket will be created in Accelerator home region.
   */
  readonly centralizedLoggingRegion: undefined | string = undefined;
  /**
   * CloudTrail logging configuration
   */
  readonly cloudtrail: CloudTrailConfig = new CloudTrailConfig();
  /**
   * SessionManager logging configuration
   */
  readonly sessionManager: SessionManagerConfig = new SessionManagerConfig();
  /**
   * Declaration of a (S3 Bucket) configuration.
   */
  readonly assetBucket: AssetBucketConfig | undefined = undefined;
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly accessLogBucket: AccessLogBucketConfig | undefined = undefined;
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly centralLogBucket: CentralLogBucketConfig | undefined = undefined;
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly elbLogBucket: ElbLogBucketConfig | undefined = undefined;
  /**
   * CloudWatch Logging configuration.
   */
  readonly cloudwatchLogs: CloudWatchLogsConfig | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link ReportConfig} / {@link CostAndUsageReportConfig}*
 *
 * CostAndUsageReport configuration
 *
 * @example
 * ```
 * costAndUsageReport:
 *     compression: Parquet
 *     format: Parquet
 *     reportName: accelerator-cur
 *     s3Prefix: cur
 *     timeUnit: DAILY
 *     refreshClosedReports: true
 *     reportVersioning: CREATE_NEW_REPORT
 *     lifecycleRules:
 *     - enabled: true
 *       id: CostAndUsageBucketLifecycleRule-01
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: false
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 *     - enabled: true
 *       id: CostAndUsageBucketLifecycleRule-02
 *       abortIncompleteMultipartUpload: 14
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       prefix: PREFIX
 * ```
 */
export class CostAndUsageReportConfig implements t.TypeOf<typeof GlobalConfigTypes.costAndUsageReportConfig> {
  /**
   * A list of strings that indicate additional content that Amazon Web Services includes in the report, such as individual resource IDs.
   */
  readonly additionalSchemaElements = [''];
  /**
   * The compression format that Amazon Web Services uses for the report.
   */
  readonly compression = '';
  /**
   * The format that Amazon Web Services saves the report in.
   */
  readonly format = '';
  /**
   * The name of the report that you want to create. The name must be unique, is case sensitive, and can't include spaces.
   */
  readonly reportName = '';
  /**
   * The prefix that Amazon Web Services adds to the report name when Amazon Web Services delivers the report. Your prefix can't include spaces.
   */
  readonly s3Prefix = '';
  /**
   * The granularity of the line items in the report.
   */
  readonly timeUnit = '';
  /**
   * A list of manifests that you want Amazon Web Services to create for this report.
   */
  readonly additionalArtifacts = undefined;
  /**
   * Whether you want Amazon Web Services to update your reports after they have been finalized if Amazon Web Services detects charges related to previous months. These charges can include refunds, credits, or support fees.
   */
  readonly refreshClosedReports = true;
  /**
   * Whether you want Amazon Web Services to overwrite the previous version of each report or to deliver the report in addition to the previous versions.
   */
  readonly reportVersioning = '';
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   */
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link ReportConfig} / {@link BudgetReportConfig}*
 *
 * BudgetReport configuration
 *
 * @example
 * ```
 * budgets:
 *     - name: accel-budget
 *       timeUnit: MONTHLY
 *       type: COST
 *       amount: 2000
 *       includeUpfront: true
 *       includeTax: true
 *       includeSupport: true
 *       includeSubscription: true
 *       includeRecurring: true
 *       includeOtherSubscription: true
 *       includeDiscount: true
 *       includeCredit: false
 *       includeRefund: false
 *       useBlended: false
 *       useAmortized: false
 *       unit: USD
 *       notifications:
 *       - type: ACTUAL
 *         thresholdType: PERCENTAGE
 *         threshold: 90
 *         comparisonOperator: GREATER_THAN
 *         subscriptionType: EMAIL
 *         recipients:
 *          - myemail+pa1-budg@example.com
 *          - myemail+pa2-budg@example.com
 * ```
 */
export class BudgetReportConfig implements t.TypeOf<typeof GlobalConfigTypes.budgetConfig> {
  /**
   * The cost or usage amount that's associated with a budget forecast, actual spend, or budget threshold.
   *
   * @default 2000
   */
  readonly amount = 2000;
  /**
   * The name of a budget. The value must be unique within an account. BudgetName can't include : and \ characters. If you don't include value for BudgetName in the template, Billing and Cost Management assigns your budget a randomly generated name.
   */
  readonly name = '';
  /**
   * The length of time until a budget resets the actual and forecasted spend. DAILY is available only for RI_UTILIZATION and RI_COVERAGE budgets.
   */
  readonly timeUnit = '';
  /**
   * Specifies whether this budget tracks costs, usage, RI utilization, RI coverage, Savings Plans utilization, or Savings Plans coverage.
   */
  readonly type = '';
  /**
   * Specifies whether a budget includes upfront RI costs.
   *
   * @default true
   */
  readonly includeUpfront = true;
  /**
   * Specifies whether a budget includes taxes.
   *
   * @default true
   */
  readonly includeTax = true;
  /**
   * Specifies whether a budget includes support subscription fees.
   *
   * @default true
   */
  readonly includeSupport = true;
  /**
   * Specifies whether a budget includes non-RI subscription costs.
   *
   * @default true
   */
  readonly includeOtherSubscription = true;
  /**
   * Specifies whether a budget includes subscriptions.
   *
   * @default true
   */
  readonly includeSubscription = true;
  /**
   * Specifies whether a budget includes recurring fees such as monthly RI fees.
   *
   * @default true
   */
  readonly includeRecurring = true;
  /**
   * Specifies whether a budget includes discounts.
   *
   * @default true
   */
  readonly includeDiscount = true;
  /**
   * Specifies whether a budget includes refunds.
   *
   * @default true
   */
  readonly includeRefund = false;
  /**
   * Specifies whether a budget includes credits.
   *
   * @default true
   */
  readonly includeCredit = false;
  /**
   * Specifies whether a budget uses the amortized rate.
   *
   * @default false
   */
  readonly useAmortized = false;
  /**
   * Specifies whether a budget uses a blended rate.
   *
   * @default false
   */
  readonly useBlended = false;
  /**
   * The type of notification that AWS sends to a subscriber.
   *
   * An enum value that specifies the target subscription type either EMAIL or SNS
   */
  readonly subscriptionType = '';
  /**
   * The unit of measurement that's used for the budget forecast, actual spend, or budget threshold, such as USD or GBP.
   */
  readonly unit = '';
  /**
   * The type of threshold for a notification. For ABSOLUTE_VALUE thresholds,
   * AWS notifies you when you go over or are forecasted to go over your total cost threshold.
   * For PERCENTAGE thresholds, AWS notifies you when you go over or are forecasted to go over a certain percentage of your forecasted spend. For example,
   * if you have a budget for 200 dollars and you have a PERCENTAGE threshold of 80%, AWS notifies you when you go over 160 dollars.
   */
  /**
   * The comparison that's used for the notification that's associated with a budget.
   */
  readonly notifications: NotificationConfig[] | undefined = [new NotificationConfig()];
  /**
   * List of OU's and accounts to be configured for Budgets configuration
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
 * *{@link GlobalConfig} / {@link ReportConfig} / {@link BudgetReportConfig} / {@link NotificationConfig}*
 *
 * Notification configuration
 *
 * @example
 * ```
 * notifications:
 *  - type: ACTUAL
 *    thresholdType: PERCENTAGE
 *    threshold: 90
 *    comparisonOperator: GREATER_THAN
 *    subscriptionType: EMAIL
 *    recipients:
 *     - myemail+pa1-budg@example.com
 *     - myemail+pa2-budg@example.com
 * ```
 */
export class NotificationConfig implements t.TypeOf<typeof GlobalConfigTypes.notificationConfig> {
  /**
   * The comparison that's used for the notification that's associated with a budget.
   */
  readonly type: 'ACTUAL' | 'FORECASTED' = 'ACTUAL';
  /**
   * The type of threshold for a notification.For ABSOLUTE_VALUE thresholds,
   * AWS notifies you when you go over or are forecasted to go over your total cost threshold.
   * For PERCENTAGE thresholds, AWS notifies you when you go over or are forecasted to go over a certain percentage of your forecasted spend.
   * For example,if you have a budget for 200 dollars and you have a PERCENTAGE threshold of 80%, AWS notifies you when you go over 160 dollars.
   */
  readonly thresholdType: 'PERCENTAGE' | 'ABSOLUTE_VALUE' = 'PERCENTAGE';
  /**
   * The type of threshold associate with a notification.
   */
  readonly threshold: number = 90;
  /**
   * The comparison that's used for this notification.
   */
  readonly comparisonOperator: 'GREATER_THAN' | 'LESS_THAN' | 'EQUAL_TO' = 'GREATER_THAN';
  /**
   * The type of notification that AWS sends to a subscriber.
   */
  readonly subscriptionType: 'EMAIL' | 'SNS' = 'EMAIL';
  /**
   * The address that AWS sends budget notifications to, either an SNS topic or an email.
   *
   * @deprecated
   * This is a temporary property and it has been deprecated.
   * Please use recipients property to specify address for budget notifications.
   */
  readonly address: string | undefined = '';
  /**
   * The recipients list that AWS sends budget notifications to, either an SNS topic or an email.
   */
  readonly recipients: string[] | undefined = [];
}

/**
 * {@link GlobalConfig} / {@link ReportConfig}
 *
 * Accelerator report configuration
 */
export class ReportConfig implements t.TypeOf<typeof GlobalConfigTypes.reportConfig> {
  /**
   * Cost and usage report configuration
   *
   * If you want to create cost and usage report with daily granularity of the line items in the report, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * costAndUsageReport:
   *     compression: Parquet
   *     format: Parquet
   *     reportName: accelerator-cur
   *     s3Prefix: cur
   *     timeUnit: DAILY
   *     refreshClosedReports: true
   *     reportVersioning: CREATE_NEW_REPORT
   *     lifecycleRules:
   *     - enabled: true
   *       id: CostAndUsageBucketLifecycleRule-01
   *       abortIncompleteMultipartUpload: 14
   *       expiration: 3563
   *       expiredObjectDeleteMarker: false
   *       noncurrentVersionExpiration: 3653
   *       noncurrentVersionTransitions:
   *         - storageClass: GLACIER
   *           transitionAfter: 365
   *       transitions:
   *         - storageClass: GLACIER
   *           transitionAfter: 365
   *       prefix: PREFIX
   *     - enabled: true
   *       id: CostAndUsageBucketLifecycleRule-02
   *       abortIncompleteMultipartUpload: 14
   *       expiredObjectDeleteMarker: true
   *       noncurrentVersionExpiration: 3653
   *       noncurrentVersionTransitions:
   *         - storageClass: GLACIER
   *           transitionAfter: 365
   *       transitions:
   *         - storageClass: GLACIER
   *           transitionAfter: 365
   *       prefix: PREFIX
   * ```
   */
  readonly costAndUsageReport = new CostAndUsageReportConfig();
  /**
   * Budget report configuration
   *
   * If you want to create budget report with monthly granularity of the line items in the report and other default parameters , you need to provide below value for this parameter.
   *
   * @example
   * ```
   * budgets:
   *     - name: accel-budget
   *       timeUnit: MONTHLY
   *       type: COST
   *       amount: 2000
   *       includeUpfront: true
   *       includeTax: true
   *       includeSupport: true
   *       includeSubscription: true
   *       includeRecurring: true
   *       includeOtherSubscription: true
   *       includeDiscount: true
   *       includeCredit: false
   *       includeRefund: false
   *       useBlended: false
   *       useAmortized: false
   *       unit: USD
   *       notifications:
   *       - type: ACTUAL
   *         thresholdType: PERCENTAGE
   *         threshold: 90
   *         comparisonOperator: GREATER_THAN
   *         subscriptionType: EMAIL
   *         address: myemail+pa-budg@example.com
   * ```
   */
  readonly budgets: BudgetReportConfig[] = [];
}

/**
 * *{@link GlobalConfig} / {@link BackupConfig} / {@link VaultConfig}*
 *
 * AWS Backup vault configuration
 *
 * @example
 * ```
 * - name: BackupVault
 *   deploymentTargets:
 *     organizationalUnits:
 *      - Root
 *   policy: policies/backup-vault-policy.json
 * ```
 */
export class VaultConfig implements t.TypeOf<typeof GlobalConfigTypes.vaultConfig> {
  /**
   * Name that will be used to create the vault.
   */
  readonly name = 'BackupVault';

  /**
   * Which OU's or Accounts the vault will be deployed to
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();

  /**
   * The path to a JSON file defining Backup Vault access policy
   */
  readonly policy: string = '';
}

/**
 * *{@link GlobalConfig} / {@link BackupConfig}*
 *
 * AWS Backup configuration
 *
 * @example
 * ```
 * backup:
 *   vaults:
 *     - name: BackupVault
 *       deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export class BackupConfig implements t.TypeOf<typeof GlobalConfigTypes.backupConfig> {
  /**
   * List of AWS Backup Vaults
   */
  readonly vaults: VaultConfig[] = [];
}

/**
 *
 * *{@link GlobalConfig} / {@link SnsConfig} / {@link SnsTopicConfig}*
 *
 * SNS Topics Configuration
 *
 * To send CloudWatch Alarms and SecurityHub notifications
 * you will need to configure at least one SNS Topic
 * For SecurityHub notification you will need
 * to set the deployment target to Root in order
 * to receive notifications from all accounts
 *
 * @example
 * ```
 * snsTopics:
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Root
 *   topics:
 *     - name: Security
 *       emailAddresses:
 *         - SecurityNotifications@example.com
 * ```
 */
export class SnsTopicConfig implements t.TypeOf<typeof GlobalConfigTypes.snsTopicConfig> {
  /**
   * *{@link GlobalConfig} / {@link SnsTopicConfig} / {@link TopicConfig}*
   *
   * SNS Topic Config
   *
   * @example
   * ```
   * - name: Security
   *   emailAddresses:
   *     - SecurityNotifications@example.com
   * ```
   */
  /**
   * List of SNS Topics definition
   */

  /**
   * SNS Topic Name
   */
  readonly name = 'Security';

  /**
   * List of email address for notification
   */
  readonly emailAddresses = [];
}

/**
 * *{@link GlobalConfig} / {@link SnsConfig}*
 */
export class SnsConfig implements t.TypeOf<typeof GlobalConfigTypes.snsConfig> {
  /**
   * Deployment targets for SNS topics
   * SNS Topics will always be deployed to the Log Archive account
   * email subscriptions will be in the Log Archive account
   * All other accounts and regions will forward to the Logging account
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * List of SNS Topics
   */
  readonly topics: SnsTopicConfig[] = [];
}

/**
 * *{@link GlobalConfig} / {@link AcceleratorMetadataConfig}*
 *
 * @example
 * ```
 * acceleratorMetadataConfig:
 *   enable: true
 *   account: Logging
 *   readOnlyAccessRoleArns:
 *     - arn:aws:iam::111111111111:role/test-access-role
 * ```
 */

export class AcceleratorMetadataConfig implements t.TypeOf<typeof GlobalConfigTypes.acceleratorMetadataConfig> {
  /**
   * Accelerator Metadata
   * Creates a new bucket in the log archive account to retrieve metadata for the accelerator environment
   */

  /**
   * Enable Accelerator Metadata
   */
  readonly enable = false;
  readonly account = '';
  readonly readOnlyAccessRoleArns: string[] = [];
}

/**
 * *{@link GlobalConfig} / {@link AcceleratorSettingsConfig}*
 *
 * @example
 *
 * Accelerator Settings Configuration
 * Allows setting additional properties for accelerator
 *
 * @example
 * ```
 * acceleratorSettings:
 *  maxConcurrentStacks: 250
 * ```
 *
 */

export class AcceleratorSettingsConfig implements t.TypeOf<typeof GlobalConfigTypes.acceleratorSettingsConfig> {
  /**
   * Accelerator Settings
   */

  /**
   * Set maximum number of concurrent stacks that can be processed at a time while transpiling the application.
   * If no value is specified it defaults to 250
   */
  readonly maxConcurrentStacks: number | undefined = undefined;
}
/**
 * *{@link GlobalConfig} / {@link SsmInventoryConfig}*
 *
 * @example
 * ```
 * ssmInventoryConfig:
 *   enable: true
 *   deploymentTargets:
 *     organizationalUnits:
 *       - Infrastructure
 * ```
 *
 */

export class SsmInventoryConfig implements t.TypeOf<typeof GlobalConfigTypes.ssmInventoryConfig> {
  /**
   * Enable SSM Inventory
   */
  readonly enable = false;
  /**
   * Configure the Deployment Targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
 * *{@link GlobalConfig} / {@link ssmParametersConfig}*
 *
 * @example
 * ```
 * ssmParameters:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *     parameters:
 *       - name: MyWorkloadParameter
 *         path: /my/custom/path/variable
 *         value: 'MySSMParameterValue'
 * ```
 *
 */

export class SsmParametersConfig implements t.TypeOf<typeof GlobalConfigTypes.ssmParametersConfig> {
  /**
   * A list of SSM parameters to create
   */
  readonly parameters: SsmParameterConfig[] = [];
  /**
   * Configure the Deployment Targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
 * *{@link GlobalConfig} / {@link ssmParametersConfig} / {@link ssmParameterConfig}*
 *
 * @example
 * ```
 * ssmParameters:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Workloads
 *     parameters:
 *       - name: WorkloadsSsmParameter
 *         path: /my/custom/path/variable
 *         value: 'MySSMParameterValue'
 * ```
 *
 */

export class SsmParameterConfig implements t.TypeOf<typeof GlobalConfigTypes.ssmParameterConfig> {
  /**
   * The friendly name of the SSM Parameter, this is used to generate the CloudFormation Logical Id.
   */
  readonly name = '';
  /**
   * The path or name used when creating SSM Parameter.
   */
  readonly path = '';
  /**
   * The value of the SSM Parameter
   */
  readonly value = '';
}

/**
 * Accelerator global configuration
 */
export class GlobalConfig implements t.TypeOf<typeof GlobalConfigTypes.globalConfig> {
  /**
   * Global configuration file name, this file must be present in accelerator config repository
   */
  static readonly FILENAME = 'global-config.yaml';

  /**
   * Accelerator home region name. The region where accelerator pipeline deployed.
   *
   * To use us-east-1 as home region for the accelerator, you need to provide below value for this parameter.
   * Note: Variable HOME_REGION created for future usage of home region in the file
   *
   * @example
   * ```
   * homeRegion: &HOME_REGION us-east-1
   * ```
   */
  readonly homeRegion: string = '';
  /**
   * List of AWS Region names where accelerator will be deployed. Home region must be part of this list.
   *
   * To add us-west-2 along with home region for accelerator deployment, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * enabledRegions:
   *   - *HOME_REGION
   *   - us-west-2
   * ```
   */
  readonly enabledRegions: t.Region[] = [];

  /**
   * This role trusts the management account, allowing users in the management
   * account to assume the role, as permitted by the management account
   * administrator. The role has administrator permissions in the new member
   * account.
   *
   * Examples:
   * - AWSControlTowerExecution
   * - OrganizationAccountAccessRole
   */
  readonly managementAccountAccessRole: string = '';

  /**
   * Global {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CloudWatchLogsConcepts.html | CloudWatch Logs retention in days} configuration.
   *
   * @remarks
   * This retention setting will be applied to all CloudWatch log groups created by the accelerator.
   * Additionally, this retention setting will be applied to any CloudWatch log groups that already exist
   * in the target environment if the log group's retention setting is LOWER than this configured value.
   *
   */
  readonly cloudwatchLogRetentionInDays = 3653;

  /**
   * ***Deprecated***
   *
   * NOTICE: The configuration of CDK buckets is being moved
   * to cdkOptions in the Global Config. This block is deprecated and
   * will be removed in a future release
   * @see {@link cdkOptionsConfig}
   *
   * To indicate workload accounts should utilize the cdk-assets S3 buckets in the management account, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * centralizeCdkBuckets:
   *   enable: true
   * ```
   */
  readonly centralizeCdkBuckets: centralizeCdkBucketsConfig | undefined = undefined;

  /**
   * AWS CDK options configuration. This lets you customize the operation of the CDK within LZA, specifically:
   *
   * centralizeBuckets: Enabling this option modifies the CDK bootstrap process to utilize a single S3 bucket per region located in the management account for CDK assets generated by LZA. Otherwise, CDK will create a new S3 bucket in every account and every region supported by LZA.
   * useManagementAccessRole: Enabling this option modifies CDK operations to use the IAM role specified in the `managementAccountAccessRole` option in `global-config.yaml` rather than the default roles created by CDK. Default CDK roles will still be created, but will remain unused. Any stacks previously deployed by LZA will retain their [associated execution role](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-iam-servicerole.html). For more information on these roles, please see [here](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html#bootstrapping-contract).
   *
   * @example
   * ```
   * cdkOptions:
   *   centralizeBuckets: true
   *   useManagementAccessRole: true
   * ```
   */
  readonly cdkOptions = new cdkOptionsConfig();

  /**
   * Whether to enable termination protection for this stack.
   */
  readonly terminationProtection = true;

  /**
   * ExternalLandingZoneResourcesConfig.
   *
   * centralizeBuckets: Enabling this option modifies the CDK bootstrap process to utilize a single S3 bucket per region located in the management account for CDK assets generated by LZA. Otherwise, CDK will create a new S3 bucket in every account and every region supported by LZA.
   *
   * @example
   * ```
   * externalLandingZoneResources:
   *   importExternalLandingZoneResources: false
   * ```
   */
  readonly externalLandingZoneResources: externalLandingZoneResourcesConfig | undefined = undefined;

  /**
   * AWS ControlTower configuration
   *
   * To indicate environment has control tower enabled, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * controlTower:
   *   enable: true
   * ```
   */
  readonly controlTower: ControlTowerConfig = new ControlTowerConfig();
  /**
   * Accelerator logging configuration
   *
   * To enable organization trail and session manager logs sending to S3, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * logging:
   *   account: LogArchive
   *   cloudtrail:
   *     enable: false
   *     organizationTrail: false
   *     cloudtrailInsights:
   *       apiErrorRateInsight: true
   *       apiCallRateInsight: true
   *   sessionManager:
   *     sendToCloudWatchLogs: false
   *     sendToS3: true
   *   cloudwatchLogs:
   *     dynamicPartitioning: logging/dynamic-partition.json
   * ```
   */
  readonly logging: LoggingConfig = new LoggingConfig();

  /**
   * Report configuration
   *
   * To enable budget report along with cost and usage report, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * reports:
   *   costAndUsageReport:
   *     compression: Parquet
   *     format: Parquet
   *     reportName: accelerator-cur
   *     s3Prefix: cur
   *     timeUnit: DAILY
   *     refreshClosedReports: true
   *     reportVersioning: CREATE_NEW_REPORT
   *   budgets:
   *     - name: accel-budget
   *       timeUnit: MONTHLY
   *       type: COST
   *       amount: 2000
   *       includeUpfront: true
   *       includeTax: true
   *       includeSupport: true
   *       includeSubscription: true
   *       includeRecurring: true
   *       includeOtherSubscription: true
   *       includeDiscount: true
   *       includeCredit: false
   *       includeRefund: false
   *       useBlended: false
   *       useAmortized: false
   *       unit: USD
   *       notifications:
   *       - type: ACTUAL
   *         thresholdType: PERCENTAGE
   *         threshold: 90
   *         comparisonOperator: GREATER_THAN
   *         subscriptionType: EMAIL
   *         address: myemail+pa-budg@example.com
   * ```
   */
  readonly reports: ReportConfig | undefined = undefined;

  /**
   * AWS Service Quota - Limit configuration
   *
   * To enable limits within service quota, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * limits:
   *   - serviceCode: lambda
   *     quotaCode: L-2ACBD22F
   *     desiredValue: 2000
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Infrastructure
   * ```
   */
  readonly limits: ServiceQuotaLimitsConfig[] | undefined = undefined;

  /**
   * SSM parameter configurations
   *
   * Create SSM parameters through the LZA. Parameters can be deployed to Organizational Units or Accounts using deploymentTargets
   *
   * @example
   * ```
   * ssmParameters:
   *   - deploymentTargets:
   *       organizationalUnits:
   *         - Workloads
   *     parameters:
   *       - name: WorkloadParameter
   *         path: /my/custom/path/variable
   *         value: 'MySSMParameterValue'
   * ```
   */
  readonly ssmParameters: SsmParametersConfig[] | undefined;

  /**
   * Backup Vaults Configuration
   *
   * To generate vaults, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * backup:
   *   vaults:
   *     - name: MyBackUpVault
   *       deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   */
  readonly backup: BackupConfig | undefined = undefined;

  /**
   * SNS Topics Configuration
   *
   * To send CloudWatch Alarms and SecurityHub notifications
   * you will need to configure at least one SNS Topic
   * For SecurityHub notification you will need
   * to set the deployment target to Root in order
   * to receive notifications from all accounts
   *
   * @example
   * ```
   * snsTopics:
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Root
   *   topics:
   *     - name: Security
   *       emailAddresses:
   *         - SecurityNotifications@example.com
   * ```
   */
  readonly snsTopics: SnsConfig | undefined = undefined;

  /**
   * SSM Inventory Configuration
   *
   * [EC2 prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/sysman-inventory-walk.html)
   * [Connectivity prerequisites](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-prereqs.html)
   *
   * @example
   * ```
   * ssmInventory:
   *   enable: true
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Infrastructure
   * ```
   *
   */
  readonly ssmInventory: SsmInventoryConfig | undefined = undefined;

  /**
   * Custom Tags for all resources created by Landing Zone Accelerator that can be tagged.
   *
   * @example
   * ```
   * tags:
   *   - key: Environment
   *     value: Dev
   *   - key: ResourceOwner
   *     value: AcmeApp
   *   - key: CostCenter
   *     value: '123'
   * ```
   **/
  readonly tags: t.Tag[] = [];

  /**
   * Accelerator Metadata Configuration
   * Creates a bucket in the logging account to enable accelerator metadata collection
   *
   * @example
   * ```
   * acceleratorMetadata:
   *   enable: true
   *   account: Logging
   * ```
   *
   */
  readonly acceleratorMetadata: AcceleratorMetadataConfig | undefined = undefined;

  /**
   * Accelerator Settings Configuration
   * Allows setting additional properties for accelerator
   *
   * @example
   * ```
   * acceleratorSettings:
   *  maxConcurrentStacks: 250
   * ```
   *
   */
  readonly acceleratorSettings: AcceleratorSettingsConfig | undefined = undefined;

  /**
   * SSM IAM Role Parameters to be loaded for session manager policy attachments
   */

  iamRoleSsmParameters: { account: string; region: string; parametersByPath: { [key: string]: string } }[] = [];

  /**
   * AWS Lambda Function environment variables encryption configuration options.
   *
   * @remarks
   * You can decide to use AWS KMS CMK or AWS managed key for Lambda function environment variables encryption. When this property is undefined, the solution will deploy AWS KMS CMK to encrypt function environment variables.
   * You can use `deploymentTargets` to control target accounts and regions for the given `useCMK` configuration.
   *
   *  For more information please see [here](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-encryption)
   *
   * @example
   * ```
   * lambda:
   *   encryption:
   *    useCMK: true
   *    deploymentTargets:
   *      organizationalUnits:
   *        - Root
   * ```
   */
  readonly lambda: LambdaConfig | undefined = undefined;

  /**
   * AWS S3 global configuration options.
   *
   * @remarks
   * You can decide to create AWS KMS CMK for AWS S3 server side encryption.  When this property is undefined, the solution will deploy AWS KMS CMK to encrypt AWS S3 bucket.
   * You can use `deploymentTargets` to control target accounts and regions for the given `createCMK` configuration.
   * This configuration is not applicable to LogArchive's central logging region, because the solution deployed CentralLogs bucket always encrypted with AWS KMS CMK.
   *
   *  For more information please see [here](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html)
   *
   * @example
   * ```
   * s3:
   *   createCMK: true
   *   deploymentTargets:
   *     organizationalUnits:
   *       - Root
   * ```
   */
  readonly s3: S3GlobalConfig | undefined = undefined;

  /**
   *
   * @param props
   * @param values
   * @param configDir
   * @param validateConfig
   */

  constructor(
    props: {
      homeRegion: string;
      controlTower: { enable: boolean };
      managementAccountAccessRole: string;
    },
    values?: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
  ) {
    if (values) {
      Object.assign(this, values);
    } else {
      this.homeRegion = props.homeRegion;
      this.enabledRegions = [props.homeRegion as t.Region];
      this.controlTower = { ...props.controlTower, controls: [] };
      this.managementAccountAccessRole = props.managementAccountAccessRole;
    }
  }

  public getSnsTopicNames(): string[] {
    return this.snsTopics?.topics.flatMap(item => item.name) ?? [];
  }

  /**
   * Load from file in given directory
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string, replacementsConfig?: ReplacementsConfig): GlobalConfig {
    const initialBuffer = fs.readFileSync(path.join(dir, GlobalConfig.FILENAME), 'utf8');
    const buffer = replacementsConfig ? replacementsConfig.preProcessBuffer(initialBuffer) : initialBuffer;
    const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(buffer));

    const homeRegion = values.homeRegion;
    const controlTower = values.controlTower;
    const managementAccountAccessRole = values.managementAccountAccessRole;

    return new GlobalConfig(
      {
        homeRegion,
        controlTower,
        managementAccountAccessRole,
      },
      values,
    );
  }

  /**
   * Loads the file raw with default replacements placeholders just to get
   * the management account access role. This is required to get the Role name
   * that can be assumed to load the replacements, so cannot be done using the
   * normal loading method. This is abstracted away so that this method of
   * loading is not accidentally used to partially load config files.
   */
  static loadRawGlobalConfig(dir: string): GlobalConfig {
    const accountsConfig = AccountsConfig.load(dir);
    const orgConfig = OrganizationConfig.load(dir);
    let replacementsConfig: ReplacementsConfig;

    if (fs.existsSync(path.join(dir, ReplacementsConfig.FILENAME))) {
      replacementsConfig = ReplacementsConfig.load(dir, accountsConfig, true);
    } else {
      replacementsConfig = new ReplacementsConfig();
    }

    replacementsConfig.loadReplacementValues({}, orgConfig.enable);
    return GlobalConfig.load(dir, replacementsConfig);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): GlobalConfig | undefined {
    try {
      const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(content));
      return new GlobalConfig(values);
    } catch (e) {
      logger.error('Error parsing input, global config undefined');
      logger.error(`${e}`);
      throw new Error('Could not load global configuration');
    }
  }

  public async saveAseaResourceMapping(resources: t.AseaResourceMapping[]) {
    if (
      !this.externalLandingZoneResources?.importExternalLandingZoneResources ||
      !this.externalLandingZoneResources.mappingFileBucket
    ) {
      throw new Error(
        `saveAseaResourceMapping can only be called when importExternalLandingZoneResources set as true and mappingFileBucket is provided`,
      );
    }
    const s3Client = new AWS.S3({ region: this.homeRegion });
    await s3Client
      .putObject({
        Bucket: this.externalLandingZoneResources.mappingFileBucket,
        Key: 'aseaResources.json',
        Body: JSON.stringify(resources),
        ServerSideEncryption: 'AES256',
      })
      .promise();
  }

  public async loadExternalMapping(loadFromCache: boolean) {
    if (!this.externalLandingZoneResources?.importExternalLandingZoneResources) return;
    this.externalLandingZoneResources.accountsDeployedExternally = [];
    const tempDirPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'asea-assets'));
    const aseaMappingPath = path.join(tempDirPath, 'aseaMapping.json');
    const aseaResourceListPath = path.join(tempDirPath, 'aseaResources.json');
    if (!this.externalLandingZoneResources) {
      return;
    }
    if (loadFromCache && fs.existsSync(aseaMappingPath)) {
      const mapping = this.readJsonFromDisk(aseaMappingPath);
      this.externalLandingZoneResources.templateMap = await this.setTemplateMap(mapping);
      this.externalLandingZoneResources.resourceList = this.readJsonFromDisk(aseaResourceListPath);
    } else {
      const s3Client = new AWS.S3({ region: this.homeRegion });
      const mapping = await this.loadExternalMappingFromS3(s3Client);
      this.externalLandingZoneResources.templateMap = await this.setTemplateMap(mapping);
      this.externalLandingZoneResources.resourceList =
        (await this.readJsonFromExternalS3<t.AseaResourceMapping[]>('aseaResources.json', s3Client)) || [];
      fs.writeFileSync(aseaMappingPath, JSON.stringify(mapping, null, 2));
      fs.writeFileSync(aseaResourceListPath, JSON.stringify(this.externalLandingZoneResources.resourceList, null, 2));
    }
    return;
  }

  async loadLzaResources(partition: string, prefix: string) {
    if (!this.externalLandingZoneResources?.importExternalLandingZoneResources) return;
    if (!this.externalLandingZoneResources.resourceParameters) {
      this.externalLandingZoneResources.resourceParameters = {};
    }
    const lzaResourcesPromises = [];
    for (const region of this.enabledRegions) {
      lzaResourcesPromises.push(
        this.loadRegionLzaResources(
          region,
          partition,
          prefix,
          this.externalLandingZoneResources?.accountsDeployedExternally || [],
        ),
      );
    }
    await Promise.all(lzaResourcesPromises);
  }
  public async loadIAMRoleSSMParameters(
    region: string,
    partition: string,
    prefix: string,
    accounts: string[],
    managementAccountId: string,
    isOrgEnabled: boolean,
  ) {
    const ssmPath = `${prefix}/iam/role/`;
    const promises = [];
    const ssmParameters = [];
    if (isOrgEnabled) {
      return;
    }
    for (const account of accounts) {
      promises.push(this.loadIAMRoleSSMParametersByEnv(ssmPath, account, region, partition, managementAccountId));
      if (promises.length > 800) {
        const resolvedPromises = await Promise.all(promises);
        ssmParameters.push(...resolvedPromises);
        promises.length = 0;
      }
    }
    const resolvedPromises = await Promise.all(promises);
    ssmParameters.push(...resolvedPromises);
    promises.length = 0;

    this.iamRoleSsmParameters = ssmParameters;
  }

  private async loadIAMRoleSSMParametersByEnv(
    ssmPath: string,
    account: string,
    region: string,
    partition: string,
    managementAccountId: string,
  ): Promise<{
    account: string;
    region: string;
    parametersByPath: {
      [key: string]: string;
    };
  }> {
    let ssmClient = new SSMClient({ region });
    if (account !== managementAccountId) {
      const crossAccountCredentials = await this.getCrossAccountCredentials(
        account,
        region,
        partition,
        this.managementAccountAccessRole,
      );
      if (!crossAccountCredentials) {
        return {
          account,
          region,
          parametersByPath: {},
        };
      }
      ssmClient = this.getCrossAccountSsmClient(region, crossAccountCredentials);
    }
    const parametersByPath = await this.getParametersByPath(ssmPath, ssmClient);
    return {
      account,
      region,
      parametersByPath,
    };
  }
  private async loadRegionLzaResources(
    region: string,
    partition: string,
    prefix: string,
    accounts: string[],
  ): Promise<void> {
    const getSsmPath = (resourceType: t.AseaResourceTypePaths) => `${prefix}${resourceType}`;
    if (!this.externalLandingZoneResources?.importExternalLandingZoneResources) return;
    for (const accountId of accounts) {
      const crossAccountCredentials = await this.getCrossAccountCredentials(
        accountId,
        region,
        partition,
        this.managementAccountAccessRole,
      );

      if (!crossAccountCredentials) {
        return;
      }
      const ssmClient = await this.getCrossAccountSsmClient(region, crossAccountCredentials);
      // Get Resources which are there in both external Accelerator and LZA
      // Can load only resources which are maintained in both
      // Loading all to avoid reading SSM Params multiple times
      // Can also use DynamoDB for resource status instead of SSM Parameters,
      // But with DynamoDB knowing resource creation status in CloudFormation is difficult
      const ssmPromises = [
        this.getParametersByPath(getSsmPath(t.AseaResourceTypePaths.IAM), ssmClient),
        this.getParametersByPath(getSsmPath(t.AseaResourceTypePaths.VPC), ssmClient),
        this.getParametersByPath(getSsmPath(t.AseaResourceTypePaths.TRANSIT_GATEWAY), ssmClient),
        this.getParametersByPath(getSsmPath(t.AseaResourceTypePaths.VPC_PEERING), ssmClient),
        this.getParametersByPath(getSsmPath(t.AseaResourceTypePaths.NETWORK_FIREWALL), ssmClient),
      ];
      const ssmResults = await Promise.all(ssmPromises);
      this.externalLandingZoneResources.resourceParameters[`${accountId}-${region}`] = ssmResults.reduce(
        (resources, result) => {
          return { ...resources, ...result };
        },
        {},
      );
    }
  }

  private async getParametersByPath(path: string, ssmClient: SSMClient) {
    const parameters: { [key: string]: string } = {};
    try {
      let nextToken: string | undefined = undefined;
      do {
        const parametersOutput = await throttlingBackOff(() =>
          ssmClient.send(
            new GetParametersByPathCommand({
              Path: path,
              MaxResults: 10,
              NextToken: nextToken,
              Recursive: true,
            }),
          ),
        );
        nextToken = parametersOutput.NextToken;
        parametersOutput.Parameters?.forEach(parameter => (parameters[parameter.Name!] = parameter.Value!));
      } while (nextToken);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      logger.error(`Failed to retrieve parameter path for path ${path}`);
      throw new Error(err);
    }
    return parameters;
  }

  private async loadExternalMappingFromS3(s3Client?: AWS.S3) {
    if (
      this.externalLandingZoneResources?.importExternalLandingZoneResources &&
      this.externalLandingZoneResources.mappingFileBucket
    ) {
      if (!s3Client) {
        s3Client = new AWS.S3({ region: this.homeRegion });
      }
      const mappingFile = await s3Client
        .getObject({
          Bucket: this.externalLandingZoneResources.mappingFileBucket,
          Key: 'mapping.json',
        })
        .promise();
      if (!mappingFile.Body) {
        logger.error(
          `Could not load mapping file from path s3://${this.externalLandingZoneResources.mappingFileBucket}/mapping.json`,
        );
        throw new Error('Runtime error');
      }

      return JSON.parse(mappingFile.Body.toString());
    }
  }

  private async readJsonFromExternalS3<T>(objectKey: string, s3Client?: AWS.S3): Promise<T | undefined> {
    if (
      !this.externalLandingZoneResources?.importExternalLandingZoneResources ||
      !this.externalLandingZoneResources.mappingFileBucket
    ) {
      throw new Error(
        `readJsonFromExternalS3 can only be called when importExternalLandingZoneResources set as true and mappingFileBucket is provided`,
      );
    }
    if (!s3Client) {
      s3Client = new AWS.S3({ region: this.homeRegion });
    }
    try {
      const response = await s3Client
        .getObject({
          Bucket: this.externalLandingZoneResources.mappingFileBucket,
          Key: objectKey,
        })
        .promise();
      if (!response.Body) {
        logger.error(
          `Could not load mapping file from path s3://${this.externalLandingZoneResources.mappingFileBucket}/${objectKey}`,
        );
        return;
      }
      return JSON.parse(response.Body.toString());
    } catch (e) {
      if ((e as AWS.AWSError).code === 'NoSuchKey') return;
      throw e;
    }
  }

  private readJsonFromDisk(mappingFilePath: string) {
    const mappingFile = fs.readFileSync(mappingFilePath).toString();
    return JSON.parse(mappingFile);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async setTemplateMap(mappingJson: any): Promise<t.AseaStackInfo[]> {
    const aseaStacks: t.AseaStackInfo[] = [];
    for (const account of mappingJson) {
      this.externalLandingZoneResources?.accountsDeployedExternally.push(account.accountId);
      for (const stack of account.stacksAndResourceMapList) {
        const phaseIdentifierIndex = stack.stackName.indexOf('Phase') + 5;
        let phase = stack.stackName[phaseIdentifierIndex];
        if (phase === '-') {
          phase = -1;
        }
        phase = Number(phase);
        const tempDirPath = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'asea-templates-'));
        const templatePath = path.join(tempDirPath, `${stack.stackName}.json`);
        // Delete outputs from template. IMPORT_ASEA_RESOURCES stage will write required information into SSM Parameter Store.
        // delete stack.template.Outputs;
        await fs.promises.writeFile(templatePath, JSON.stringify(stack.template, null, 2));
        aseaStacks.push({
          accountId: account.accountId,
          accountKey: account.accountKey,
          region: stack.region,
          stackName: stack.stackName,
          resources: stack.resourceMap as t.CfnResourceType[],
          templatePath,
          phase,
          /**
           * ASEA creates Nested stacks only for Phase1 and Phase2 and "stack.stackName.substring(phaseIdentifierIndex)" doesn't include accountName in it.
           * It is safe to use string include to check if stack is nestedStack or not.
           * Other option is to check for resource type in "Resources.physicalResourceId" using stackName
           */
          nestedStack: stack.stackName.substring(phaseIdentifierIndex).includes('NestedStack'),
        });
      }
    }
    return aseaStacks;
  }

  private async getCrossAccountCredentials(
    accountId: string,
    region: string,
    partition: string,
    managementAccountAccessRole: string,
    sessionName = 'acceleratorResourceMapping',
  ): Promise<AssumeRoleCommandOutput | undefined> {
    const stsClient = new STSClient({ region: region });
    const stsParams: AssumeRoleCommandInput = {
      RoleArn: `arn:${partition}:iam::${accountId}:role/${managementAccountAccessRole}`,
      RoleSessionName: sessionName,
      DurationSeconds: 900,
    };
    let assumeRoleCredential: AssumeRoleCommandOutput | undefined = undefined;
    try {
      assumeRoleCredential = await throttlingBackOff(() => stsClient.send(new AssumeRoleCommand(stsParams)));
      if (assumeRoleCredential) {
        return assumeRoleCredential;
      } else {
        throw new Error(
          `Error assuming role ${managementAccountAccessRole} in account ${accountId} for bootstrap checks`,
        );
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e.name === 'AccessDenied') {
        logger.warn(e.name + ': ' + e.message);
        logger.warn(`${stsParams.RoleArn} NOT FOUND in ${accountId} account`);
        return undefined;
      }

      logger.error(JSON.stringify(e));
      throw new Error(e.message);
    }
  }

  private getCrossAccountSsmClient(region: string, assumeRoleCredential: AssumeRoleCommandOutput) {
    return new SSMClient({
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
        sessionToken: assumeRoleCredential.Credentials?.SessionToken,
      },
      region: region,
    });
  }
}

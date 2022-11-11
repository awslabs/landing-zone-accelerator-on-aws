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

import * as emailValidator from 'email-validator';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as t from './common-types';

import { OrganizationConfig } from './organization-config';
import { AccountsConfig } from './accounts-config';

/**
 * Global configuration items.
 */
export abstract class GlobalConfigTypes {
  static readonly controlTowerConfig = t.interface({
    enable: t.boolean,
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

  static readonly sessionManagerConfig = t.interface({
    sendToCloudWatchLogs: t.boolean,
    sendToS3: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    excludeAccounts: t.optional(t.array(t.string)),
    lifecycleRules: t.optional(t.array(t.lifecycleRuleConfig)),
  });

  static readonly accessLogBucketConfig = t.interface({
    lifecycleRules: t.array(t.lifecycleRuleConfig),
  });

  static readonly centralLogBucketConfig = t.interface({
    lifecycleRules: t.array(t.lifecycleRuleConfig),
  });

  static readonly cloudwatchLogsConfig = t.interface({
    dynamicPartitioning: t.nonEmptyString,
  });

  static readonly loggingConfig = t.interface({
    account: t.nonEmptyString,
    cloudtrail: GlobalConfigTypes.cloudTrailConfig,
    sessionManager: GlobalConfigTypes.sessionManagerConfig,
    accessLogBucket: t.optional(GlobalConfigTypes.accessLogBucketConfig),
    centralLogBucket: t.optional(GlobalConfigTypes.centralLogBucketConfig),
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

  static readonly reportConfig = t.interface({
    costAndUsageReport: t.optional(this.costAndUsageReportConfig),
    budgets: t.optional(t.array(this.budgetConfig)),
  });

  static readonly vaultConfig = t.interface({
    name: t.nonEmptyString,
    deploymentTargets: t.deploymentTargets,
  });

  static readonly backupConfig = t.interface({
    vaults: t.array(this.vaultConfig),
  });

  static readonly globalConfig = t.interface({
    homeRegion: t.nonEmptyString,
    enabledRegions: t.array(t.region),
    managementAccountAccessRole: t.nonEmptyString,
    cloudwatchLogRetentionInDays: t.number,
    terminationProtection: t.optional(t.boolean),
    controlTower: GlobalConfigTypes.controlTowerConfig,
    centralizeCdkBuckets: t.optional(GlobalConfigTypes.centralizeCdkBucketsConfig),
    logging: GlobalConfigTypes.loggingConfig,
    reports: t.optional(GlobalConfigTypes.reportConfig),
    backup: t.optional(GlobalConfigTypes.backupConfig),
  });
}

/**
 * AWS ControlTower configuration
 */
export class ControlTowerConfig implements t.TypeOf<typeof GlobalConfigTypes.controlTowerConfig> {
  /**
   * Indicates whether AWS ControlTower enabled.
   *
   * When control tower is enabled, accelerator makes sure account configuration file have three mandatory AWS CT accounts.
   * In AWS Control Tower, three shared accounts in your landing zone are provisioned automatically during setup: the management account,
   * the log archive account, and the audit account.
   */
  readonly enable = true;
}

/**
 * AWS CDK Centralization configuration
 */
export class centralizeCdkBucketsConfig implements t.TypeOf<typeof GlobalConfigTypes.centralizeCdkBucketsConfig> {
  /**
   * Indicates whether CDK stacks in workload accounts will utilzie S3 buckets in the management account rather than within the account.
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly enable = true;
}

/**
 * AWS CloudTrail Settings configuration
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
   * If CloudTrail pushes logs to CloudWatch Logs in addition to S3.
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
 * AWS Cloudtrail configuration
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
 * AWS SessionManager configuration
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
  readonly excludeRegions = [];
  /**
   * List of AWS Account names to be excluded from configuring SessionManager configuration
   */
  readonly excludeAccounts = [];
  /**
   * S3 Lifecycle rule for log storage
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
}

/**
 * Accelerator global logging configuration
 */
export class AccessLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.accessLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
}
export class CentralLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.centralLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
}

/**
 * Accelerator global CloudWatch Logs logging configuration
 */
export class CloudWatchLogsConfig implements t.TypeOf<typeof GlobalConfigTypes.cloudwatchLogsConfig> {
  /**
   * Declaration of Dynamic Partition for Kinesis Firehose.
   */
  readonly dynamicPartitioning: string = '';
}

export class LoggingConfig implements t.TypeOf<typeof GlobalConfigTypes.loggingConfig> {
  /**
   * Accelerator logging account name.
   * Accelerator use LogArchive account for global logging.
   * This account maintains consolidated logs.
   */
  readonly account = 'LogArchive';
  /**
   * CloudTrail logging configuration
   */
  readonly cloudtrail: CloudTrailConfig = new CloudTrailConfig();
  /**
   * SessionManager logging configuration
   */
  readonly sessionManager: SessionManagerConfig = new SessionManagerConfig();
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly accessLogBucket: AccessLogBucketConfig | undefined = undefined;
  /**
   * Declaration of a (S3 Bucket) Lifecycle rule configuration.
   */
  readonly centralLogBucket: CentralLogBucketConfig | undefined = undefined;
  /**
   * CloudWatch Logging configuration.
   */
  readonly cloudwatchLogs: CloudWatchLogsConfig | undefined = undefined;
}

/**
 * CostAndUsageReport configuration
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
 * BudgetReport configuration
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
  readonly notifications = [
    {
      type: '',
      thresholdType: '',
      comparisonOperator: '',
      threshold: 90,
      address: '',
      subscriptionType: '',
    },
  ];
  /**
   * List of OU's and accounts to be configured for Budgets configuration
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
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
   *       storageClass: DEEP_ARCHIVE
   *       enabled: true
   *       multiPart: 1
   *       expiration: 1825
   *       deleteMarker: false
   *       nonCurrentExpiration: 366
   *       transitionAfter: 365
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
   *       notification:
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

export class VaultConfig implements t.TypeOf<typeof GlobalConfigTypes.vaultConfig> {
  /**
   * Name that will be used to create the vault.
   */
  readonly name = 'BackupVault';

  /**
   * Which OU's or Accounts the vault will be deployed to
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class BackupConfig implements t.TypeOf<typeof GlobalConfigTypes.backupConfig> {
  /**
   * List of AWS Backup Vaults
   */
  readonly vaults: VaultConfig[] = [];
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
  readonly managementAccountAccessRole = 'AWSControlTowerExecution';

  /**
   * CloudWatchLogs retention in days, accelerator's custom resource lambda function logs retention period is configured based on this value.
   */
  readonly cloudwatchLogRetentionInDays = 3653;

  /**
   * To indicate workload accounts should utilize the cdk-assets S3 buckets in the managemenet account, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * centralizeCdkBuckets:
   *   enable: true
   * ```
   */
  readonly centralizeCdkBuckets = new centralizeCdkBucketsConfig();

  /**
   * Whether to enable termination protection for this stack.
   */
  readonly terminationProtection = true;

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
   *       notification:
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
   *
   * @param props
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(
    props: {
      homeRegion: string;
    },
    values?: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    configDir?: string,
    validateConfig?: boolean,
  ) {
    const errors: string[] = [];
    const ouIdNames: string[] = ['Root'];
    const accountNames: string[] = [];

    if (values) {
      Object.assign(this, values);

      //
      // Validation
      if (configDir && validateConfig) {
        //
        // Get list of OU ID names from organization config file
        this.getOuIdNames(configDir, ouIdNames);

        //
        // Get list of Account names from account config file
        this.getAccountNames(configDir, accountNames);
        //
        // Validate logging account name
        //
        this.validateLoggingAccountName(values, accountNames, errors);
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
        this.validateLifecycleRuleExpiration(values, errors);
        //
        // validate cloudwatch logging
        //
        this.validateCloudWatchDynamicPartition(values, configDir, errors);
        // cloudtrail settings validation
        //
        this.validateCloudTrailSettings(values, errors);
      }
    } else {
      this.homeRegion = props.homeRegion;
      this.enabledRegions = [props.homeRegion as t.Region];
    }

    if (errors.length) {
      throw new Error(`${GlobalConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
    }
  }

  /**
   * Prepare list of OU ids from organization config file
   * @param configDir
   */
  private getOuIdNames(configDir: string, ouIdNames: string[]) {
    for (const organizationalUnit of OrganizationConfig.load(configDir).organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
    }
  }

  /**
   * Prepare list of Account names from account config file
   * @param configDir
   */
  private getAccountNames(configDir: string, accountNames: string[]) {
    for (const accountItem of [
      ...AccountsConfig.load(configDir).mandatoryAccounts,
      ...AccountsConfig.load(configDir).workloadAccounts,
    ]) {
      accountNames.push(accountItem.name);
    }
  }

  /**
   * Function to validate existence of budget deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateBudgetDeploymentTargetOUs(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const budget of values.reports?.budgets ?? []) {
      for (const ou of budget.deploymentTargets?.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for budget ${budget.name} does not exists in organization-config.yaml file.`,
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
  private validateLoggingAccountName(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    if (accountNames.indexOf(values.logging.account) === -1) {
      errors.push(
        `Deployment target account ${values.logging.account} for logging does not exists in accounts-config.yaml file.`,
      );
    }
  }

  /**
   * Function to validate budget notification email address
   * @param values
   */
  private validateBudgetNotificationEmailIds(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    errors: string[],
  ) {
    for (const budget of values.reports?.budgets ?? []) {
      for (const notification of budget.notifications ?? []) {
        if (!emailValidator.validate(notification.address!)) {
          errors.push(`Invalid report notification email ${notification.address!}.`);
        }
      }
    }
  }

  /**
   * Function to validate S3 lifecycle expiration to be smaller than noncurrentVersionExpiration
   * @param values
   */
  private validateLifecycleRuleExpiration(values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>, errors: string[]) {
    for (const lifecycleRule of values.reports?.costAndUsageReport?.lifecycleRules ?? []) {
      if (lifecycleRule.noncurrentVersionExpiration! <= lifecycleRule.expiration!) {
        errors.push('The nonCurrentVersionExpiration value must be greater than that of the expiration value.');
      }
    }
  }

  /**
   * Function to validate CloudWatch Logs Dynamic Partition and enforce format, key-value provided
   * @param values
   */
  private validateCloudWatchDynamicPartition(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    configDir: string,
    errors: string[],
  ) {
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
      } else {
        console.log('Dynamic Partition is valid.');
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
  private validateCloudTrailSettings(values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>, errors: string[]) {
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

  /**
   * Load from file in given directory
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string, validateConfig?: boolean): GlobalConfig {
    const buffer = fs.readFileSync(path.join(dir, GlobalConfig.FILENAME), 'utf8');
    const values = t.parse(GlobalConfigTypes.globalConfig, yaml.load(buffer));

    const homeRegion = values.homeRegion;

    return new GlobalConfig(
      {
        homeRegion,
      },
      values,
      dir,
      validateConfig,
    );
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
      console.log('[global-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}

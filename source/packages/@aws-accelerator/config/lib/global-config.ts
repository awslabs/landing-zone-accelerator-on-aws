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

import { createLogger } from '@aws-accelerator/utils';

import { AccountsConfig } from './accounts-config';
import * as t from './common-types';
import { IamConfig } from './iam-config';
import { OrganizationConfig } from './organization-config';

const logger = createLogger(['global-config']);
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
    attachPolicyToIamRoles: t.optional(t.array(t.string)),
  });

  static readonly accessLogBucketConfig = t.interface({
    lifecycleRules: t.array(t.lifecycleRuleConfig),
  });

  static readonly centralLogBucketConfig = t.interface({
    lifecycleRules: t.array(t.lifecycleRuleConfig),
    s3ResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
    kmsResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
  });

  static readonly elbLogBucketConfig = t.interface({
    lifecycleRules: t.array(t.lifecycleRuleConfig),
    s3ResourcePolicyAttachments: t.optional(t.array(t.resourcePolicyStatement)),
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
    exclusions: t.optional(t.array(GlobalConfigTypes.cloudWatchLogsExclusionConfig)),
  });

  static readonly loggingConfig = t.interface({
    account: t.nonEmptyString,
    centralizedLoggingRegion: t.optional(t.nonEmptyString),
    cloudtrail: GlobalConfigTypes.cloudTrailConfig,
    sessionManager: GlobalConfigTypes.sessionManagerConfig,
    accessLogBucket: t.optional(GlobalConfigTypes.accessLogBucketConfig),
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

  static readonly acceleratorMetadataConfig = t.interface({
    enable: t.boolean,
    account: t.string,
    readOnlyAccessRoleArns: t.optional(t.array(t.string)),
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
    snsTopics: t.optional(GlobalConfigTypes.snsConfig),
    ssmInventory: t.optional(GlobalConfigTypes.ssmInventoryConfig),
    limits: t.optional(t.array(this.serviceQuotaLimitsConfig)),
    acceleratorMetadata: t.optional(GlobalConfigTypes.acceleratorMetadataConfig),
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
}

/**
 * *{@link GlobalConfig} / {@link centralizeCdkBucketsConfig}*
 *
 * AWS CDK Centralization configuration
 *
 * @example
 * ```
 * centralizeCdkBuckets:
 *   enable: true
 * ```
 */
export class centralizeCdkBucketsConfig implements t.TypeOf<typeof GlobalConfigTypes.centralizeCdkBucketsConfig> {
  /**
   * Indicates whether CDK stacks in workload accounts will utilize S3 buckets in the management account rather than within the account.
   *
   * When the accelerator deploys resources using the AWS CDK, assets are first built and stored in S3. By default, the S3 bucket is
   * located within the deployment target account.
   */
  readonly enable = true;
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
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link SessionManagerConfig}*
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
  readonly excludeRegions = [];
  /**
   * List of AWS Account names to be excluded from configuring SessionManager configuration
   */
  readonly excludeAccounts = [];
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
 *   lifecycleRules:
 *     - enabled: true
 *       id: AccessLifecycle
 *       abortIncompleteMultipartUpload: 15
 *       expiration: 3563
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 * ```
 */
export class AccessLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.accessLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CentralLogBucketConfig}*
 *
 * Accelerator global S3 central logging configuration
 *
 * @example
 * ```
 * centralLogBucket:
 *   lifecycleRules:
 *     - enabled: true
 *       id: CentralLifecycle
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 *   s3KmsPolicyAttachments:
 *     - policy: kms-policies/policy1.json
 * ```
 */
export class CentralLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.centralLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   * Configure additional resource policy attachments
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
  readonly s3ResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
  readonly kmsResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link ElbLogBucketConfig}*
 *
 * Accelerator global S3 elb logging configuration
 *
 * @example
 * ```
 * elbLogBucket:
 *   lifecycleRules:
 *     - enabled: true
 *       id: ElbLifecycle
 *       abortIncompleteMultipartUpload: 14
 *       expiration: 3563
 *       expiredObjectDeleteMarker: true
 *       noncurrentVersionExpiration: 3653
 *       noncurrentVersionTransitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *       transitions:
 *         - storageClass: GLACIER
 *           transitionAfter: 365
 *   s3ResourcePolicyAttachments:
 *     - policy: s3-policies/policy1.json
 * ```
 */
export class ElbLogBucketConfig implements t.TypeOf<typeof GlobalConfigTypes.elbLogBucketConfig> {
  /**
   * Declaration of (S3 Bucket) Lifecycle rules.
   * Configure additional resource policy attachments
   */
  readonly lifecycleRules: t.LifeCycleRule[] = [];
  readonly s3ResourcePolicyAttachments: t.ResourcePolicyStatement[] | undefined = undefined;
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
   * Exclude replication on all logs. By default this is set to true.
   *
   * @remarks
   * If undefined, this is set to true. When set to false, it disables replication on entire OU or account for that region. Setting OU as `Root` with no region specified and making this false will fail validation since that usage is redundant. Instead use the {@link CloudWatchLogsConfig | enable} parameter in cloudwatch log config which will disable replication across all accounts in all regions.
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
 * @example
 * ```
 * cloudwatchLogs:
 *   dynamicPartitioning: path/to/filter.json
 *   # default is true, if undefined this is set to true
 *   # if set to false, no replication is performed which is useful in test or temporary environments
 *   enable: true
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
   */
  readonly dynamicPartitioning: string | undefined = undefined;
  /**
   * Enable or disable CloudWatch replication
   */
  readonly enable: boolean | undefined = undefined;
  /**
   * Exclude Log Groups during replication
   */
  readonly exclusions: CloudWatchLogsExclusionConfig[] | undefined = undefined;
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
 *       storageClass: DEEP_ARCHIVE
 *       enabled: true
 *       multiPart: 1
 *       expiration: 1825
 *       deleteMarker: false
 *       nonCurrentExpiration: 366
 *       transitionAfter: 365
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
 *       notification:
 *       - type: ACTUAL
 *         thresholdType: PERCENTAGE
 *         threshold: 90
 *         comparisonOperator: GREATER_THAN
 *         subscriptionType: EMAIL
 *         address: myemail+pa-budg@example.com
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

/**
 * *{@link GlobalConfig} / {@link BackupConfig} / {@link VaultConfig}*
 *
 * Backup vault configuration
 *
 * @example
 * ```
 * - name: BackupVault
 *   deploymentTargets:
 *     organizationalUnits:
 *      - Root
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
   * CloudWatchLogs retention in days, accelerator's custom resource lambda function logs retention period is configured based on this value.
   */
  readonly cloudwatchLogRetentionInDays = 3653;

  /**
   * To indicate workload accounts should utilize the cdk-assets S3 buckets in the management account, you need to provide below value for this parameter.
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
   * AWS Service Quota - Limit configuration
   *
   * To enable limits within service quota, you need to provide below value for this parameter.
   *
   * @example
   * ```
   * limits:
   *     - serviceCode: lambda
   *       quotaCode: L-2ACBD22F
   *       value: 2000
   *       deploymentTargets:
   *           - organizationalUnits: root
   *             accounts:
   */
  readonly limits: ServiceQuotaLimitsConfig[] | undefined = undefined;

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

        // cloudtrail settings validation
        //
        this.validateCloudTrailSettings(values, errors);
        // snsTopics settings validation
        //
        this.validateSnsTopics(values, errors);
        // central log bucket resource policy attachment validation
        this.validateCentralLogsS3ResourcePolicyFileExists(configDir, values, errors);
        this.validateCentralLogsKmsResourcePolicyFileExists(configDir, values, errors);
        // sessionManager settings validation
        //
        this.validateSessionManager(values, configDir, errors);
        //
        //metadata validation
        this.validateAcceleratorMetadata(values, accountNames, errors);
      }
    } else {
      this.homeRegion = props.homeRegion;
      this.enabledRegions = [props.homeRegion as t.Region];
      this.controlTower = props.controlTower;
      this.managementAccountAccessRole = props.managementAccountAccessRole;
    }

    if (errors.length) {
      logger.error(`${GlobalConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
      throw new Error('configuration validation failed.');
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
   * Function to validate existence of central logs bucket region in enabled region list
   * CentralLogs bucket region name must part of pipeline enabled region
   * @param values
   * @param errors
   */
  private validateCentralLogsBucketRegionName(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    errors: string[],
  ) {
    if (values.logging.centralizedLoggingRegion) {
      for (const region of this.enabledRegions) {
        if (region === values.logging.centralizedLoggingRegion) {
          return;
        }
      }
      errors.push(
        `CentralLogs bucket region name ${
          values.logging.centralizedLoggingRegion
        } not part of pipeline enabled regions [${this.enabledRegions.toString()}].`,
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
   * Function to validate S3 lifecycle rules for Cost Reporting
   * @param values
   */
  private validateLifecycleRuleExpirationForReports(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    errors: string[],
  ) {
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
  private validateLifecycleRuleExpirationForCentralLogBucket(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    errors: string[],
  ) {
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

  private validateLifecycleRuleExpirationForAccessLogBucket(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    errors: string[],
  ) {
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
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
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
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
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

  private validateSnsTopics(values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>, errors: string[]) {
    if (values.snsTopics) {
      for (const snsTopic of values.snsTopics.topics ?? []) {
        logger.info(`email count: ${snsTopic.emailAddresses.length}`);
        if (snsTopic.emailAddresses.length < 1) {
          errors.push(`Must be at least one email address for the snsTopic named ${snsTopic.name}`);
        }
      }
    }
  }

  private validateSessionManager(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    configDir: string,
    errors: string[],
  ) {
    const iamConfig = IamConfig.load(configDir);
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
  private validateCentralLogsS3ResourcePolicyFileExists(
    configDir: string,
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    errors: string[],
  ) {
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
  private validateCentralLogsKmsResourcePolicyFileExists(
    configDir: string,
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    errors: string[],
  ) {
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

  private validateAcceleratorMetadata(
    values: t.TypeOf<typeof GlobalConfigTypes.globalConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    if (!values.acceleratorMetadata) {
      return;
    }
    if (!accountNames.find(account => account === values.acceleratorMetadata?.account)) {
      errors.push(
        `The account with the name ${values.acceleratorMetadata.account} defined in acceleratorMetadata does not exist in the accounts config`,
      );
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
  static load(dir: string, validateConfig?: boolean): GlobalConfig {
    const buffer = fs.readFileSync(path.join(dir, GlobalConfig.FILENAME), 'utf8');
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
      logger.error('Error parsing input, global config undefined');
      logger.error(`${e}`);
      throw new Error('Could not load global configuration');
    }
  }
}

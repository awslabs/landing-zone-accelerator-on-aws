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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import { AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { StreamMode } from '@aws-sdk/client-kinesis';

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { directoryExists, fileExists, getCrossAccountCredentials } from '@aws-accelerator/utils/lib/common-functions';

import * as t from './common';
import * as i from './models/global-config';

import { AccountsConfig } from './accounts-config';
import { ReplacementsConfig } from './replacements-config';
import { OrganizationConfig } from './organization-config';

const logger = createLogger(['global-config']);

export class externalLandingZoneResourcesConfig implements i.IExternalLandingZoneResourcesConfig {
  readonly importExternalLandingZoneResources = false;
  readonly mappingFileBucket = '';
  readonly acceleratorPrefix = 'ASEA';
  readonly acceleratorName = 'ASEA';

  templateMap: t.ASEAMappings = {};
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

export class centralizeCdkBucketsConfig implements i.ICentralizeCdkBucketsConfig {
  readonly enable = true;
}

export class StackRefactor implements i.IStackRefactor {
  readonly networkVpcStack: boolean = false;
}

export class cdkOptionsConfig implements i.ICdkOptionsConfig {
  readonly centralizeBuckets = true;
  readonly useManagementAccessRole = true;
  readonly customDeploymentRole = undefined;
  readonly forceBootstrap = undefined;
  /**
   * Determines if the LZA pipeline will skip the static config validation step during the pipeline's Build phase. This can be helpful in cases where the config-validator incorrectly throws errors for a valid configuration.
   */
  readonly skipStaticValidation = undefined;
  readonly stackRefactor: StackRefactor | undefined = undefined;
}

export class CloudTrailSettingsConfig implements i.ICloudTrailSettingsConfig {
  multiRegionTrail = true;
  globalServiceEvents = true;
  managementEvents = true;
  s3DataEvents = true;
  lambdaDataEvents = true;
  sendToCloudWatchLogs = true;
  readonly apiErrorRateInsight = false;
  readonly apiCallRateInsight = false;
}

export class AccountCloudTrailConfig implements i.IAccountCloudTrailConfig {
  readonly name = 'AWSAccelerator-Account-CloudTrail';
  readonly regions: string[] = [];
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly settings = new CloudTrailSettingsConfig();
}

/**
 * {@link GlobalConfig} / {@link ControlTowerConfig} / {@link ControlTowerLandingZoneConfig} / {@link ControlTowerLandingZoneLoggingConfig}
 *
 * @description
 * AWS Control Tower Landing Zone logging configuration
 *
 * @remarks
 * This allows you to manage logging options for the landing zone.
 * In the log configuration section, you can configure the retention time of the Amazon S3 log archive bucket, and the retention time of the logs for access to the bucket.
 *
 * Please use the following configuration to configure AWS Control Tower Landing Zone logging configuration, with organization-level AWS CloudTrail configuration.
 * @example
 * ```
 *   logging:
 *     loggingBucketRetentionDays: 365
 *     accessLoggingBucketRetentionDays: 3650
 *     organizationTrail: true
 * ```
 */
export class ControlTowerLandingZoneLoggingConfig implements i.IControlTowerLandingZoneLoggingConfig {
  /**
   * Retention time of the Amazon S3 log archive bucket
   *
   * @default
   * 365
   */
  readonly loggingBucketRetentionDays: number = 365;
  /**
   * Retention time of the logs for access to the bucket.
   *
   * @default
   * 3650
   */
  readonly accessLoggingBucketRetentionDays: number = 3650;
  /**
   * Flag indicates Organizational-level AWS CloudTrail configuration is configured or not.
   *
   * @remarks
   * It is important to note that the CloudTrail configured by AWS Control Tower at the organization level is different from the CloudTrail deployed by the solution. In the event that AWS Control Tower and Solution defined CloudTrail are enabled, two cloud trails will be created.
   * @default
   * true
   */
  readonly organizationTrail: boolean = true;
}

/**
 * {@link GlobalConfig} / {@link ControlTowerConfig} / {@link ControlTowerLandingZoneConfig} / {@link ControlTowerLandingZoneSecurityConfig}
 *
 * @description
 * AWS Control Tower Landing Zone security configuration
 *
 * @remarks
 * This allows you to manage security options for the landing zone.
 *
 * The following AWS Control Tower Landing Zone security example configuration sets up AWS account access with IAM Identity Center.
 * @example
 * ```
 *   security:
 *     enableIdentityCenterAccess: true
 * ```
 */
export class ControlTowerLandingZoneSecurityConfig implements i.IControlTowerLandingZoneSecurityConfig {
  /**
   * Flag indicates AWS account access option.
   *
   * @remarks
   * When this property is to true, AWS Control Tower sets up AWS account access with IAM Identity Center. Otherwise, please use self-managed AWS account access with IAM Identity Center or another method.
   *
   * @default
   * true
   */
  readonly enableIdentityCenterAccess: boolean = true;
}

/**
 * {@link GlobalConfig} / {@link ControlTowerConfig} / {@link ControlTowerLandingZoneConfig}
 *
 * @description
 * AWS Control Tower Landing Zone configuration
 *
 * @remarks
 *  This allows you to manage AWS Control Tower Landing Zone configuration.
 *
 * Please use the following configuration to configure AWS Control Tower Landing Zone.
 * @example
 * ```
 * landingZone:
 *   version: '3.3'
 *   logging:
 *     loggingBucketRetentionDays: 365
 *     accessLoggingBucketRetentionDays: 3650
 *     organizationTrail: true
 *   security:
 *     enableIdentityCenterAccess: true
 * ```
 */
export class ControlTowerLandingZoneConfig implements i.IControlTowerLandingZoneConfig {
  /**
   * The landing zone version, for example, 3.3.
   *
   * @remarks
   * Most AWS Control Tower Landing Zone operation needs the version to latest available version.
   * The AWS Control Tower Landing Zone will be updated or reset when it drifts or when any configuration changes have been made in global-config.
   * When the value of this property is set to the latest available version, AWS Control Tower Landing Zone can be updated or reset.
   * The solution will fail if this property version is not set to the latest available version.
   * If you wish to update or reset the AWS Control Tower Landing Zone, you will need to update this property to match the latest available version.
   *
   */
  readonly version: string = '3.3';
  /**
   * AWS Control Tower Landing Zone logging configuration
   *
   * @see {@link ControlTowerLandingZoneLoggingConfig} for more information.
   */
  readonly logging: ControlTowerLandingZoneLoggingConfig = new ControlTowerLandingZoneLoggingConfig();
  /**
   * AWS Control Tower Landing Zone security configuration
   *
   * @see {@link ControlTowerLandingZoneSecurityConfig} for more information.
   */
  readonly security: ControlTowerLandingZoneSecurityConfig = new ControlTowerLandingZoneSecurityConfig();
}

export abstract class ControlTowerControlConfig implements i.IControlTowerControlConfig {
  readonly identifier: string = '';
  readonly enable: boolean = true;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly regions: t.Region[] | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link ControlTowerConfig}*
 *
 * AWS Control Tower Landing Zone configuration.
 *
 * Please use the following configuration to configure AWS Control Tower Landing Zone.
 * @example
 * ```
 * controlTower:
 *   enable: true
 *   landingZone:
 *     version: '3.3'
 *     logging:
 *       loggingBucketRetentionDays: 365
 *       accessLoggingBucketRetentionDays: 3650
 *       organizationTrail: true
 *     security:
 *       enableIdentityCenterAccess: true
 * ```
 */
export class ControlTowerConfig implements i.IControlTowerConfig {
  /**
   * Indicates whether AWS Control Tower enabled.
   *
   * When control tower is enabled, accelerator makes sure account configuration file have three mandatory AWS CT accounts.
   * In AWS Control Tower, three shared accounts in your landing zone are provisioned automatically during setup: the management account,
   * the log archive account, and the audit account.
   */
  readonly enable: boolean = true;
  /**
   * A list of Control Tower controls to enable.
   *
   * Only Strongly recommended and Elective controls are permitted, with the exception of the Region deny guardrail. Please see this [page](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-controltower-enabledcontrol.html) for more information.
   *
   * @see {@link ControlTowerControlConfig} for more information.
   */
  readonly controls: ControlTowerControlConfig[] = [];
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @see {@link ControlTowerLandingZoneConfig} for more information.
   */
  readonly landingZone: ControlTowerLandingZoneConfig | undefined = undefined;
}

export class ServiceEncryptionConfig implements i.IServiceEncryptionConfig {
  readonly useCMK: boolean = false;
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudWatchLogsConfig}/ {@link CloudWatchDataProtectionConfig}/ {@link CloudWatchManagedDataProtectionIdentifierConfig}*
 *
 * @description
 * AWS CloudWatch log data protection configuration
 *
 * @remarks
 * Currently, only the [`Credentials`](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types-credentials.html) category is supported.
 *
 * @example
 * ```
 *   categories:
 *     - Credentials
 * ```
 */
export class CloudWatchManagedDataProtectionIdentifierConfig
  implements i.ICloudWatchManagedDataProtectionIdentifierConfig
{
  /**
   * CloudWatch Logs managed data identifiers configuration.
   *
   * @remarks
   * The solution supports only identifiers associated with the `Credentials` category, you can find more information about `Credentials` category [here](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/protect-sensitive-log-data-types-credentials.html)
   *
   * @default Credentials
   */
  readonly categories: `${t.CloudWatchLogDataProtectionCategories}`[] = ['Credentials'];
}

/**
 * *{@link GlobalConfig} / {@link LoggingConfig} / {@link CloudWatchLogsConfig}/ {@link CloudWatchDataProtectionConfig}*
 *
 * @description
 * AWS CloudWatch log data protection configuration
 *
 * @example
 * ```
 *  dataProtection:
 *    managedDataIdentifiers:
 *      categories:
 *        - Credentials
 *    deploymentTargets:
 *      organizationalUnits:
 *        - Root
 * ```
 */
export class CloudWatchDataProtectionConfig implements i.ICloudWatchDataProtectionConfig {
  /**
   * CloudWatch Logs managed data identifiers configuration.
   *
   * @remarks
   * Please review [CloudWatch Logs managed data identifiers for sensitive data types](https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL-managed-data-identifiers.html) for more information.
   *
   * @default Credentials
   */
  readonly managedDataIdentifiers: CloudWatchManagedDataProtectionIdentifierConfig =
    new CloudWatchManagedDataProtectionIdentifierConfig();

  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
  /**
   * (OPTIONAL) Indicates whether existing CloudWatch Log data protection policy configuration can be overwritten.
   *
   * @default false
   */
  readonly overrideExisting: boolean | undefined = undefined;
}

export class S3EncryptionConfig implements i.IS3EncryptionConfig {
  readonly createCMK: boolean = true;
  readonly deploymentTargets: t.DeploymentTargets | undefined = undefined;
}

export class S3GlobalConfig implements i.IS3GlobalConfig {
  readonly encryption?: S3EncryptionConfig | undefined = undefined;
}

export class LambdaConfig implements i.ILambdaConfig {
  readonly encryption: ServiceEncryptionConfig | undefined = undefined;
}

export class SqsConfig implements i.ISqsConfig {
  readonly encryption: ServiceEncryptionConfig | undefined = undefined;
}

export class CloudTrailConfig implements i.ICloudTrailConfig {
  readonly enable = false;
  readonly organizationTrail = false;
  readonly organizationTrailSettings = new CloudTrailSettingsConfig();
  readonly accountTrails: AccountCloudTrailConfig[] = [];
  readonly lifecycleRules: t.LifeCycleRule[] = [];
}

export class ServiceQuotaLimitsConfig implements i.IServiceQuotaLimitsConfig {
  readonly serviceCode = '';
  readonly quotaCode = '';
  readonly desiredValue = 2000;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly regions?: t.Region[];
}

export class SessionManagerConfig implements i.ISessionManagerConfig {
  readonly sendToCloudWatchLogs = false;
  readonly sendToS3 = false;
  readonly excludeRegions: t.Region[] = [];
  readonly excludeAccounts: string[] = [];
  readonly lifecycleRules: t.LifeCycleRule[] = [];
  readonly attachPolicyToIamRoles = [];
}

export class AccessLogBucketConfig implements i.IAccessLogBucketConfig {
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
  readonly enable: boolean | undefined = undefined;
  readonly deploymentTargets?: t.DeploymentTargets | undefined = undefined;
  readonly s3ResourcePolicyAttachments: t.IResourcePolicyStatement[] | undefined = undefined;
  readonly importedBucket: t.IImportedS3ManagedEncryptionKeyBucketConfig | undefined = undefined;
  readonly customPolicyOverrides: t.ICustomS3ResourcePolicyOverridesConfig | undefined = undefined;
}

export class CentralLogBucketConfig implements i.ICentralLogBucketConfig {
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
  readonly s3ResourcePolicyAttachments: t.IResourcePolicyStatement[] | undefined = undefined;
  readonly kmsResourcePolicyAttachments: t.IResourcePolicyStatement[] | undefined = undefined;
  readonly importedBucket: t.ImportedCustomerManagedEncryptionKeyBucketConfig | undefined = undefined;
  readonly customPolicyOverrides: t.CustomS3ResourceAndKmsPolicyOverridesConfig | undefined = undefined;
}

export class AssetBucketConfig implements i.IAssetBucketConfig {
  readonly s3ResourcePolicyAttachments: t.IResourcePolicyStatement[] | undefined = undefined;
  readonly kmsResourcePolicyAttachments: t.IResourcePolicyStatement[] | undefined = undefined;
  readonly importedBucket: t.IImportedCustomerManagedEncryptionKeyBucketConfig | undefined = undefined;
  readonly customPolicyOverrides?: t.CustomS3ResourceAndKmsPolicyOverridesConfig | undefined = undefined;
}

export class ElbLogBucketConfig implements i.IElbLogBucketConfig {
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
  readonly s3ResourcePolicyAttachments: t.IResourcePolicyStatement[] | undefined = undefined;
  readonly importedBucket: t.ImportedS3ManagedEncryptionKeyBucketConfig | undefined = undefined;
  readonly customPolicyOverrides: t.CustomS3ResourcePolicyOverridesConfig | undefined = undefined;
}

export class CloudWatchLogsExclusionConfig implements i.ICloudWatchLogsExclusionConfig {
  readonly organizationalUnits: string[] | undefined = undefined;
  readonly regions: t.Region[] | undefined = undefined;
  readonly accounts: string[] | undefined = undefined;
  readonly excludeAll: boolean | undefined = undefined;
  readonly logGroupNames: string[] | undefined = undefined;
}

export class CloudWatchFirehoseLamdaProcessorConfig implements i.ICloudWatchFirehoseLambdaProcessorConfig {
  readonly retries: number | undefined = undefined;
  readonly bufferInterval: number | undefined = undefined;
  readonly bufferSize: number | undefined = undefined;
}
export class CloudWatchFirehoseConfig implements i.ICloudWatchFirehoseConfig {
  readonly fileExtension: string | undefined = undefined;
  readonly lambdaProcessor?: CloudWatchFirehoseLamdaProcessorConfig | undefined = undefined;
}

export class CloudWatchKinesisConfig implements i.ICloudWatchKinesisConfig {
  readonly streamingMode: StreamMode = StreamMode.PROVISIONED;
  readonly shardCount: number | undefined = undefined;
  readonly retention: number | undefined = undefined;
}
export class CloudWatchSubscriptionConfig implements i.ICloudWatchSubscriptionConfig {
  readonly type: 'ACCOUNT' | 'LOG_GROUP' = 'LOG_GROUP';
  readonly selectionCriteria: string | undefined = undefined;
  readonly overrideExisting?: boolean | undefined;
  readonly filterPattern?: string | undefined;
}

export class CloudWatchLogsConfig implements i.ICloudWatchLogsConfig {
  readonly dynamicPartitioning: string | undefined = undefined;
  readonly dynamicPartitioningByAccountId: boolean | undefined = undefined;
  readonly enable: boolean | undefined = undefined;
  readonly encryption: ServiceEncryptionConfig | undefined = undefined;
  readonly exclusions: CloudWatchLogsExclusionConfig[] | undefined = undefined;
  readonly replaceLogDestinationArn: string | undefined = undefined;
  readonly dataProtection: CloudWatchDataProtectionConfig | undefined = undefined;
  readonly firehose: CloudWatchFirehoseConfig | undefined = undefined;
  readonly subscription: CloudWatchSubscriptionConfig | undefined = undefined;
  readonly kinesis: CloudWatchKinesisConfig | undefined = undefined;
}

export class LoggingConfig implements i.ILoggingConfig {
  readonly account = 'LogArchive';
  readonly centralizedLoggingRegion: undefined | string = undefined;
  readonly cloudtrail: CloudTrailConfig = new CloudTrailConfig();
  readonly sessionManager: SessionManagerConfig = new SessionManagerConfig();
  readonly assetBucket: AssetBucketConfig | undefined = undefined;
  readonly accessLogBucket: AccessLogBucketConfig | undefined = undefined;
  readonly centralLogBucket: CentralLogBucketConfig | undefined = undefined;
  readonly elbLogBucket: ElbLogBucketConfig | undefined = undefined;
  readonly cloudwatchLogs: CloudWatchLogsConfig | undefined = undefined;
}

export class CostAndUsageReportConfig implements i.ICostAndUsageReportConfig {
  readonly additionalSchemaElements = [''];
  readonly compression = '';
  readonly format = '';
  readonly reportName = '';
  readonly s3Prefix = '';
  readonly timeUnit = '';
  readonly additionalArtifacts = undefined;
  readonly refreshClosedReports = true;
  readonly reportVersioning = '';
  readonly lifecycleRules: t.LifeCycleRule[] | undefined = undefined;
}

export class BudgetReportConfig implements i.IBudgetReportConfig {
  readonly amount = 2000;
  readonly name = '';
  readonly timeUnit = '';
  readonly type = '';
  readonly includeUpfront = true;
  readonly includeTax = true;
  readonly includeSupport = true;
  readonly includeOtherSubscription = true;
  readonly includeSubscription = true;
  readonly includeRecurring = true;
  readonly includeDiscount = true;
  readonly includeRefund = false;
  readonly includeCredit = false;
  readonly useAmortized = false;
  readonly useBlended = false;
  readonly subscriptionType = '';
  readonly unit = '';
  readonly notifications: NotificationConfig[] | undefined = [new NotificationConfig()];
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class NotificationConfig implements i.INotificationConfig {
  readonly type: t.NotificationType = 'ACTUAL';
  readonly thresholdType: t.ThresholdType = 'PERCENTAGE';
  readonly threshold: number = 90;
  readonly comparisonOperator: t.ComparisonOperator = 'GREATER_THAN';
  readonly subscriptionType: t.SubscriptionType = 'EMAIL';
  readonly address: string | undefined = '';
  readonly recipients: string[] | undefined = [];
}

export class ReportConfig implements i.IReportConfig {
  readonly costAndUsageReport = new CostAndUsageReportConfig();
  readonly budgets: BudgetReportConfig[] = [];
}

export class VaultConfig implements i.IVaultConfig {
  readonly name = 'BackupVault';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly policy: string = '';
}

export class BackupConfig implements i.IBackupConfig {
  readonly vaults: VaultConfig[] = [];
}

export class SnsTopicConfig implements i.ISnsTopicConfig {
  readonly name = 'Security';
  readonly emailAddresses = [];
}

export class SnsConfig implements i.ISnsConfig {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly topics: SnsTopicConfig[] = [];
}

export class AcceleratorMetadataConfig implements i.IAcceleratorMetadataConfig {
  readonly enable = false;
  readonly account = '';
  readonly readOnlyAccessRoleArns: string[] = [];
}

export class AcceleratorSettingsConfig implements i.IAcceleratorSettingsConfig {
  readonly maxConcurrentStacks: number | undefined = undefined;
}

export class SsmInventoryConfig implements i.ISsmInventoryConfig {
  readonly enable = false;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class SsmParametersConfig implements i.ISsmParametersConfig {
  readonly parameters: SsmParameterConfig[] = [];
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class DefaultEventBusConfig implements i.IDefaultEventBusConfig {
  readonly policy: string = '';
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

export class SsmParameterConfig implements i.ISsmParameterConfig {
  readonly name = '';
  readonly path = '';
  readonly value = '';
}

export class GlobalConfig implements i.IGlobalConfig {
  /**
   * Global configuration file name, this file must be present in accelerator config repository
   */
  static readonly FILENAME = 'global-config.yaml';
  readonly homeRegion: string = '';
  readonly enabledRegions: t.Region[] = [];
  readonly managementAccountAccessRole: string = '';
  readonly cloudwatchLogRetentionInDays = 3653;
  readonly centralizeCdkBuckets: centralizeCdkBucketsConfig | undefined = undefined;
  readonly cdkOptions = new cdkOptionsConfig();
  readonly terminationProtection = true;
  readonly enableOptInRegions = false;
  readonly externalLandingZoneResources: externalLandingZoneResourcesConfig | undefined = undefined;
  readonly controlTower: ControlTowerConfig = new ControlTowerConfig();
  readonly logging: LoggingConfig = new LoggingConfig();
  readonly reports: ReportConfig | undefined = undefined;
  readonly limits: ServiceQuotaLimitsConfig[] | undefined = undefined;
  readonly ssmParameters: SsmParametersConfig[] | undefined;
  readonly backup: BackupConfig | undefined = undefined;
  readonly snsTopics: SnsConfig | undefined = undefined;
  readonly ssmInventory: SsmInventoryConfig | undefined = undefined;
  readonly tags: t.Tag[] = [];
  readonly acceleratorMetadata: AcceleratorMetadataConfig | undefined = undefined;
  readonly acceleratorSettings: AcceleratorSettingsConfig | undefined = undefined;
  readonly lambda: LambdaConfig | undefined = undefined;
  readonly s3: S3GlobalConfig | undefined = undefined;
  readonly defaultEventBus: DefaultEventBusConfig | undefined = undefined;
  readonly sqs: SqsConfig | undefined = undefined;

  /**
   * SSM IAM Role Parameters to be loaded for session manager policy attachments
   */

  iamRoleSsmParameters: { account: string; region: string; parametersByPath: { [key: string]: string } }[] = [];

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
      controlTower: { enable: boolean; landingZone?: ControlTowerLandingZoneConfig };
      managementAccountAccessRole: string;
    },
    values?: i.IGlobalConfig,
  ) {
    if (values) {
      Object.assign(this, values);
    } else {
      this.homeRegion = props.homeRegion;
      this.enabledRegions = [props.homeRegion as t.Region];
      this.controlTower = {
        enable: props.controlTower.enable,
        landingZone: props.controlTower.landingZone,
        controls: [],
      };
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
    const values = t.parseGlobalConfig(yaml.load(buffer));

    const homeRegion = values.homeRegion;
    const controlTower = values.controlTower;
    const managementAccountAccessRole = values.managementAccountAccessRole;

    return new GlobalConfig(
      {
        homeRegion,
        controlTower: { enable: controlTower.enable, landingZone: controlTower.landingZone },
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
      const values = t.parseGlobalConfig(yaml.load(content));
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
    const resourcesPath = path.join('asea-assets', 'new', 'aseaResources.json');
    await fs.promises.writeFile(resourcesPath, JSON.stringify(resources, null, 2));
  }

  public async loadExternalMapping(accountsConfig: AccountsConfig) {
    if (!this.externalLandingZoneResources?.importExternalLandingZoneResources) {
      return;
    }
    if (!this.externalLandingZoneResources.mappingFileBucket) {
      throw new Error(
        `externalLandingZoneResources/mappingFileBucket is required when importExternalLandingZoneResources is set to true`,
      );
    }
    this.externalLandingZoneResources.accountsDeployedExternally = [];
    const aseaAssetPath = 'asea-assets';
    await fs.promises.mkdir(aseaAssetPath, { recursive: true });

    if (!directoryExists('asea-assets')) {
      throw new Error(`Could not create temp directory ${aseaAssetPath} for asea assets`);
    }
    const s3Client = new AWS.S3({ region: this.homeRegion });
    const mappingFile = await this.downloadFile({
      relativePath: 'mapping.json',
      tempDirectory: aseaAssetPath,
      bucket: this.externalLandingZoneResources.mappingFileBucket,
      s3Client,
    });
    const resourceListFile = await this.downloadFile({
      relativePath: 'aseaResources.json',
      tempDirectory: aseaAssetPath,
      bucket: this.externalLandingZoneResources.mappingFileBucket,
      s3Client,
    });

    const mapping = (await this.readJsonFromDisk(mappingFile)) as t.ASEAMappings;
    this.externalLandingZoneResources.resourceList = await this.readJsonFromDisk(resourceListFile);
    await this.downloadASEAStacksAndResources({
      s3Client,
      mappingBucket: this.externalLandingZoneResources.mappingFileBucket,
      tempDirectory: aseaAssetPath,
      mapping,
    });
    this.externalLandingZoneResources.templateMap = mapping;
    const accounts = Object.keys(mapping).map(key => mapping[key].accountId);
    const uniqueAccountsFromMapping = [...new Set(accounts)];
    const uniqueNonSuspendedAccounts = await this.findUniqueNonSuspendedAccounts(
      accountsConfig,
      uniqueAccountsFromMapping,
    );

    this.externalLandingZoneResources.accountsDeployedExternally = uniqueNonSuspendedAccounts;
  }

  // Function to filter out suspended accounts and non-ASEA created accounts
  private async findUniqueNonSuspendedAccounts(
    accountsConfig: AccountsConfig,
    uniqueAccountsFromMapping: string[],
  ): Promise<string[]> {
    let uniqueNonSuspendedAccounts: string[] = [];
    let nonSuspendedAccounts: string[] = [];
    const accountIds = accountsConfig.accountIds;
    const uniqueAccountsEmails: string[] = [
      ...accountsConfig.workloadAccounts.map(({ email }) => email.toLowerCase()),
      ...accountsConfig.mandatoryAccounts.map(({ email }) => email.toLowerCase()),
    ];

    if (accountIds) {
      // From Accounts Config, only get accounts which are ACTIVE (not suspended) and defined in accounts-config.yaml
      nonSuspendedAccounts = accountIds
        .filter(account => account.status === 'ACTIVE' && uniqueAccountsEmails.includes(account.email.toLowerCase()))
        .map(account => account.accountId);

      // Compare and make sure list is both in resource mapping and an active account in Accounts Config
      // This will also filter out accounts created by LZA natively and not ASEA
      uniqueNonSuspendedAccounts = nonSuspendedAccounts.filter(nonSuspendedAccount =>
        uniqueAccountsFromMapping.includes(nonSuspendedAccount),
      );
    }
    return uniqueNonSuspendedAccounts;
  }

  private async downloadASEAStacksAndResources(props: {
    s3Client: AWS.S3;
    mappingBucket: string;
    tempDirectory: string;
    mapping: t.ASEAMappings;
  }): Promise<string[]> {
    const downloads: Promise<string>[] = [];
    Object.keys(props.mapping).forEach(key => {
      downloads.push(
        this.downloadFile({
          bucket: props.mappingBucket,
          s3Client: props.s3Client,
          relativePath: props.mapping[key].templatePath,
          tempDirectory: props.tempDirectory,
        }),
      );
      downloads.push(
        this.downloadFile({
          bucket: props.mappingBucket,
          s3Client: props.s3Client,
          relativePath: props.mapping[key].resourcePath,
          tempDirectory: props.tempDirectory,
        }),
      );
      const nestedStacks = props.mapping[key].nestedStacks;
      if (nestedStacks) {
        Object.keys(nestedStacks).forEach(nestedStackKey => {
          downloads.push(
            this.downloadFile({
              bucket: props.mappingBucket,
              s3Client: props.s3Client,
              relativePath: nestedStacks[nestedStackKey].templatePath,
              tempDirectory: props.tempDirectory,
            }),
          );
          downloads.push(
            this.downloadFile({
              bucket: props.mappingBucket,
              s3Client: props.s3Client,
              relativePath: nestedStacks[nestedStackKey].resourcePath,
              tempDirectory: props.tempDirectory,
            }),
          );
        });
      }
    });

    return Promise.all(downloads);
  }

  private async downloadFile(props: { relativePath: string; tempDirectory: string; bucket: string; s3Client: AWS.S3 }) {
    const filePath = path.join(props.tempDirectory, props.relativePath);
    const directory = filePath.split('/').slice(0, -1).join('/');
    if (!(await fileExists(filePath))) {
      const s3Object = await this.getS3Object({
        bucket: props.bucket,
        objectKey: props.relativePath,
        s3Client: props.s3Client,
      });
      await fs.promises.mkdir(directory, { recursive: true });
      if (filePath === 'asea-assets/aseaResources.json' && !s3Object?.body) {
        await fs.promises.writeFile(filePath, s3Object?.body || '[]');
      } else {
        await fs.promises.writeFile(filePath, s3Object?.body || '');
      }
    }

    return filePath;
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
      const crossAccountCredentials = await getCrossAccountCredentials(
        account,
        region,
        partition,
        this.managementAccountAccessRole,
        'acceleratorResourceMapping',
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
      const crossAccountCredentials = await getCrossAccountCredentials(
        accountId,
        region,
        partition,
        this.managementAccountAccessRole,
        'acceleratorResourceMapping',
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

  private async getS3Object(props: {
    bucket: string;
    objectKey: string;
    s3Client?: AWS.S3;
  }): Promise<{ body: string; path: string } | undefined> {
    let s3Client = props.s3Client;
    if (!s3Client) {
      s3Client = new AWS.S3({ region: this.homeRegion });
    }
    try {
      const response = await s3Client
        .getObject({
          Bucket: props.bucket,
          Key: props.objectKey,
        })
        .promise();
      if (!response.Body) {
        logger.error(`Could not load file from path s3://${props.bucket}/${props.objectKey}`);
        return;
      }
      return { body: response.Body.toString(), path: props.objectKey };
    } catch (e) {
      if ((e as AWS.AWSError).code === 'NoSuchKey') return;
      throw e;
    }
  }

  private async readJsonFromDisk(mappingFilePath: string) {
    const mappingFile = (await fs.readFileSync(mappingFilePath)).toString();
    return JSON.parse(mappingFile);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public loadJsonFromDisk(filePath: string): any {
    try {
      const file = fs.readFileSync(filePath).toString();
      return JSON.parse(file);
    } catch (e) {
      logger.error(`Failed to load file ${filePath}`);
      throw e;
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

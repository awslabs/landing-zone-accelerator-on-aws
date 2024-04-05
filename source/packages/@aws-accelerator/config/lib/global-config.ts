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
import * as os from 'os';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as AWS from 'aws-sdk';
import { STSClient, AssumeRoleCommand, AssumeRoleCommandInput, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

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

export class centralizeCdkBucketsConfig implements i.ICentralizeCdkBucketsConfig {
  readonly enable = true;
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

export class CloudWatchLogsConfig implements i.ICloudWatchLogsConfig {
  readonly dynamicPartitioning: string | undefined = undefined;
  readonly enable: boolean | undefined = undefined;
  readonly encryption: ServiceEncryptionConfig | undefined = undefined;
  readonly exclusions: CloudWatchLogsExclusionConfig[] | undefined = undefined;
  readonly replaceLogDestinationArn: string | undefined = undefined;
  readonly dataProtection: CloudWatchDataProtectionConfig | undefined = undefined;
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

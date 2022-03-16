import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class SecurityConfigTypes {
  static readonly snsSubscriptionConfig = t.interface({
    level: t.nonEmptyString,
    email: t.nonEmptyString,
  });

  static readonly s3PublicAccessBlockConfig = t.interface({
    excludeAccounts: t.optional(t.array(t.string)),
  });

  static readonly macieConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    policyFindingsPublishingFrequency: t.enums('FrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
    publishSensitiveDataFindings: t.boolean,
  });

  static readonly guardDutyS3ProtectionConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
  });

  static readonly guardDutyExportFindingsConfig = t.interface({
    enable: t.boolean,
    destinationType: t.enums('DestinationType', ['S3']),
    exportFrequency: t.enums('ExportFrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
  });

  static readonly guardDutyConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    s3Protection: this.guardDutyS3ProtectionConfig,
    exportConfiguration: this.guardDutyExportFindingsConfig,
  });

  static readonly securityHubStandardConfig = t.interface({
    name: t.enums('ExportFrequencyType', [
      'AWS Foundational Security Best Practices v1.0.0',
      'CIS AWS Foundations Benchmark v1.2.0',
      'PCI DSS v3.2.1',
    ]),
    enable: t.boolean,
    controlsToDisable: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly securityHubConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    standards: t.array(this.securityHubStandardConfig),
  });

  static readonly ebsDefaultVolumeEncryptionConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
  });

  static readonly centralSecurityServicesConfig = t.interface({
    delegatedAdminAccount: t.nonEmptyString,
    ebsDefaultVolumeEncryption: SecurityConfigTypes.ebsDefaultVolumeEncryptionConfig,
    s3PublicAccessBlock: SecurityConfigTypes.s3PublicAccessBlockConfig,
    macie: SecurityConfigTypes.macieConfig,
    guardduty: SecurityConfigTypes.guardDutyConfig,
    securityHub: SecurityConfigTypes.securityHubConfig,
  });

  static readonly accessAnalyzerConfig = t.interface({
    enable: t.boolean,
  });

  static readonly iamPasswordPolicyConfig = t.interface({
    allowUsersToChangePassword: t.boolean,
    hardExpiry: t.boolean,
    requireUppercaseCharacters: t.boolean,
    requireLowercaseCharacters: t.boolean,
    requireSymbols: t.boolean,
    requireNumbers: t.boolean,
    minimumPasswordLength: t.number,
    passwordReusePrevention: t.number,
    maxPasswordAge: t.number,
  });

  static readonly customRoleLambdaType = t.interface({
    sourceFilePath: t.nonEmptyString,
    handler: t.nonEmptyString,
    runtime: t.nonEmptyString,
    rolePolicyFile: t.nonEmptyString,
    inputParameters: t.optional(t.dictionary(t.nonEmptyString, t.nonEmptyString)),
  });

  static readonly triggeringResourceType = t.interface({
    lookupType: t.enums('ResourceLookupType', ['ResourceId', 'Tag', 'ResourceTypes']),
    lookupKey: t.nonEmptyString,
    lookupValue: t.array(t.nonEmptyString),
  });

  static readonly customConfigRule = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    lambda: this.customRoleLambdaType,
    periodic: t.optional(t.boolean),
    maximumExecutionFrequency: t.optional(
      t.enums('ExecutionFrequency', ['One_Hour', 'Three_Hours', 'Six_Hours', 'Twelve_Hours', 'TwentyFour_Hours']),
    ),
    configurationChanges: t.optional(t.boolean),
    triggeringResources: this.triggeringResourceType,
  });

  static readonly customConfigRuleSet = t.interface({
    deploymentTargets: t.deploymentTargets,
    rules: t.array(this.customConfigRule),
  });

  static readonly configRule = t.interface({
    name: t.nonEmptyString,
    identifier: t.nonEmptyString,
    inputParameters: t.optional(t.dictionary(t.nonEmptyString, t.nonEmptyString)),
    complianceResourceTypes: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly awsConfigRuleSet = t.interface({
    deploymentTargets: t.deploymentTargets,
    rules: t.array(this.configRule),
  });

  static readonly awsConfig = t.interface({
    enableConfigurationRecorder: t.boolean,
    enableDeliveryChannel: t.boolean,
    ruleSets: t.array(this.awsConfigRuleSet),
    customRuleSets: t.optional(t.array(this.customConfigRuleSet)),
  });

  static readonly metricConfig = t.interface({
    filterName: t.nonEmptyString,
    logGroupName: t.nonEmptyString,
    filterPattern: t.nonEmptyString,
    metricNamespace: t.nonEmptyString,
    metricName: t.nonEmptyString,
    metricValue: t.nonEmptyString,
  });

  static readonly metricSetConfig = t.interface({
    regions: t.optional(t.array(t.nonEmptyString)),
    deploymentTargets: t.deploymentTargets,
    metrics: t.array(this.metricConfig),
  });

  static readonly alarmConfig = t.interface({
    alarmName: t.nonEmptyString,
    alarmDescription: t.nonEmptyString,
    snsAlertLevel: t.nonEmptyString,
    metricName: t.nonEmptyString,
    namespace: t.nonEmptyString,
    comparisonOperator: t.nonEmptyString,
    evaluationPeriods: t.number,
    period: t.number,
    statistic: t.nonEmptyString,
    threshold: t.number,
    treatMissingData: t.nonEmptyString,
  });

  static readonly alarmSetConfig = t.interface({
    regions: t.optional(t.array(t.nonEmptyString)),
    deploymentTargets: t.deploymentTargets,
    alarms: t.array(this.alarmConfig),
  });

  static readonly cloudWatchConfig = t.interface({
    metricSets: t.array(this.metricSetConfig),
    alarmSets: t.array(this.alarmSetConfig),
  });

  static readonly securityConfig = t.interface({
    centralSecurityServices: this.centralSecurityServicesConfig,
    accessAnalyzer: this.accessAnalyzerConfig,
    iamPasswordPolicy: this.iamPasswordPolicyConfig,
    awsConfig: this.awsConfig,
    cloudWatch: this.cloudWatchConfig,
  });
}

export class S3PublicAccessBlockConfig implements t.TypeOf<typeof SecurityConfigTypes.s3PublicAccessBlockConfig> {
  readonly excludeAccounts: string[] = [];
}

export class MacieConfig implements t.TypeOf<typeof SecurityConfigTypes.macieConfig> {
  readonly enable = true;
  readonly excludeRegions: t.Region[] = [];
  readonly policyFindingsPublishingFrequency = 'FIFTEEN_MINUTES';
  readonly publishSensitiveDataFindings = true;
}

export class GuardDutyS3ProtectionConfig implements t.TypeOf<typeof SecurityConfigTypes.guardDutyS3ProtectionConfig> {
  readonly enable = true;
  readonly excludeRegions: t.Region[] = [];
}

export class GuardDutyExportFindingsConfig
  implements t.TypeOf<typeof SecurityConfigTypes.guardDutyExportFindingsConfig>
{
  readonly enable = true;
  readonly destinationType = 'S3';
  readonly exportFrequency = 'FIFTEEN_MINUTES';
}

export class GuardDutyConfig implements t.TypeOf<typeof SecurityConfigTypes.guardDutyConfig> {
  readonly enable = true;
  readonly excludeRegions: t.Region[] = [];
  readonly s3Protection: GuardDutyS3ProtectionConfig = new GuardDutyS3ProtectionConfig();
  readonly exportConfiguration: GuardDutyExportFindingsConfig = new GuardDutyExportFindingsConfig();
}
export class SecurityHubStandardConfig implements t.TypeOf<typeof SecurityConfigTypes.securityHubStandardConfig> {
  readonly name = '';
  readonly enable = true;
  readonly controlsToDisable: string[] = [];
}

export class SecurityHubConfig implements t.TypeOf<typeof SecurityConfigTypes.securityHubConfig> {
  readonly enable = true;
  readonly excludeRegions: t.Region[] = [];
  readonly standards: SecurityHubStandardConfig[] = [];
}

export class SnsSubscriptionConfig implements t.TypeOf<typeof SecurityConfigTypes.snsSubscriptionConfig> {
  readonly level: string = '';
  readonly email: string = '';
}

export class ebsDefaultVolumeEncryptionConfig
  implements t.TypeOf<typeof SecurityConfigTypes.ebsDefaultVolumeEncryptionConfig>
{
  readonly enable = true;
  readonly excludeRegions: t.Region[] = [];
}

export class CentralSecurityServicesConfig
  implements t.TypeOf<typeof SecurityConfigTypes.centralSecurityServicesConfig>
{
  readonly delegatedAdminAccount = 'Audit';
  readonly ebsDefaultVolumeEncryption: ebsDefaultVolumeEncryptionConfig = new ebsDefaultVolumeEncryptionConfig();
  readonly s3PublicAccessBlock: S3PublicAccessBlockConfig = new S3PublicAccessBlockConfig();
  readonly snsSubscriptions: SnsSubscriptionConfig[] = [];
  readonly macie: MacieConfig = new MacieConfig();
  readonly guardduty: GuardDutyConfig = new GuardDutyConfig();
  readonly securityHub: SecurityHubConfig = new SecurityHubConfig();
}

export class AccessAnalyzerConfig implements t.TypeOf<typeof SecurityConfigTypes.accessAnalyzerConfig> {
  readonly enable = true;
}

export class IamPasswordPolicyConfig implements t.TypeOf<typeof SecurityConfigTypes.iamPasswordPolicyConfig> {
  readonly allowUsersToChangePassword = true;
  readonly hardExpiry = false;
  readonly requireUppercaseCharacters = true;
  readonly requireLowercaseCharacters = true;
  readonly requireSymbols = true;
  readonly requireNumbers = true;
  readonly minimumPasswordLength = 14;
  readonly passwordReusePrevention = 24;
  readonly maxPasswordAge = 90;
}

export class ConfigRule implements t.TypeOf<typeof SecurityConfigTypes.configRule> {
  readonly name = '';
  readonly identifier = '';
  readonly inputParameters = {};
  readonly complianceResourceTypes: string[] = [];
}

export class AwsConfigRuleSet implements t.TypeOf<typeof SecurityConfigTypes.awsConfigRuleSet> {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly rules: ConfigRule[] = [];
}

export class CustomConfigRule implements t.TypeOf<typeof SecurityConfigTypes.customConfigRule> {
  readonly name = '';
  readonly description = '';
  readonly lambda = { sourceFilePath: '', handler: '', runtime: '', rolePolicyFile: '', inputParameters: {} };
  readonly periodic = true;
  readonly maximumExecutionFrequency = 'Six_Hours';
  readonly configurationChanges = true;
  readonly triggeringResources = { lookupType: '', lookupKey: '', lookupValue: [] };
}

export class CustomConfigRuleSet implements t.TypeOf<typeof SecurityConfigTypes.customConfigRuleSet> {
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly rules: CustomConfigRule[] = [];
}

export class AwsConfig implements t.TypeOf<typeof SecurityConfigTypes.awsConfig> {
  readonly enableConfigurationRecorder = true;
  readonly enableDeliveryChannel = true;
  readonly ruleSets: AwsConfigRuleSet[] = [];
  readonly customRuleSets: CustomConfigRuleSet[] = [];
}

export class MetricConfig implements t.TypeOf<typeof SecurityConfigTypes.metricConfig> {
  readonly filterName: string = '';
  readonly logGroupName: string = '';
  readonly filterPattern: string = '';
  readonly metricNamespace: string = '';
  readonly metricName: string = '';
  readonly metricValue: string = '';
  readonly treatMissingData: string | undefined = undefined;
}

export class MetricSetConfig implements t.TypeOf<typeof SecurityConfigTypes.metricSetConfig> {
  readonly regions: string[] | undefined = undefined;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly metrics: MetricConfig[] = [];
}

export class AlarmConfig implements t.TypeOf<typeof SecurityConfigTypes.alarmConfig> {
  readonly alarmName: string = '';
  readonly alarmDescription: string = '';
  readonly snsAlertLevel: string = '';
  readonly metricName: string = '';
  readonly namespace: string = '';
  readonly comparisonOperator: string = '';
  readonly evaluationPeriods: number = 1;
  readonly period: number = 300;
  readonly statistic: string = '';
  readonly threshold: number = 1;
  readonly treatMissingData: string = '';
}

export class AlarmSetConfig implements t.TypeOf<typeof SecurityConfigTypes.alarmSetConfig> {
  readonly regions: string[] | undefined = undefined;
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly alarms: AlarmConfig[] = [];
}

export class CloudWatchConfig implements t.TypeOf<typeof SecurityConfigTypes.cloudWatchConfig> {
  readonly metricSets: MetricSetConfig[] = [];
  readonly alarmSets: AlarmSetConfig[] = [];
}

export class SecurityConfig implements t.TypeOf<typeof SecurityConfigTypes.securityConfig> {
  static readonly FILENAME = 'security-config.yaml';

  readonly centralSecurityServices: CentralSecurityServicesConfig = new CentralSecurityServicesConfig();
  readonly accessAnalyzer: AccessAnalyzerConfig = new AccessAnalyzerConfig();
  readonly iamPasswordPolicy: IamPasswordPolicyConfig = new IamPasswordPolicyConfig();
  readonly awsConfig: AwsConfig = new AwsConfig();
  readonly cloudWatch: CloudWatchConfig = new CloudWatchConfig();

  constructor(values?: t.TypeOf<typeof SecurityConfigTypes.securityConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Return delegated-admin-account name
   */
  public getDelegatedAccountName(): string {
    return this.centralSecurityServices.delegatedAdminAccount;
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): SecurityConfig {
    const buffer = fs.readFileSync(path.join(dir, SecurityConfig.FILENAME), 'utf8');
    const values = t.parse(SecurityConfigTypes.securityConfig, yaml.load(buffer));
    return new SecurityConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): SecurityConfig | undefined {
    try {
      const values = t.parse(SecurityConfigTypes.securityConfig, yaml.load(content));
      return new SecurityConfig(values);
    } catch (e) {
      console.log('[security-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}

import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export class SecurityConfigTypes {
  /**
   * MacieConfig Interface
   */
  static readonly macieConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    policyFindingsPublishingFrequency: t.enums('FrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
    publishSensitiveDataFindings: t.boolean,
  });

  /**
   * GuardDutyS3Protection Interface
   */
  static readonly guardDutyS3ProtectionConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
  });

  /**
   * GuardDutyExportFindingsConfig Interface
   */
  static readonly guardDutyExportFindingsConfig = t.interface({
    enable: t.boolean,
    destinationType: t.enums('DestinationType', ['S3']),
    exportFrequency: t.enums('ExportFrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
  });

  /**
   * GuardDutyConfig Interface
   */
  static readonly guardDutyConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    s3Protection: SecurityConfigTypes.guardDutyS3ProtectionConfig,
    exportConfiguration: SecurityConfigTypes.guardDutyExportFindingsConfig,
  });

  /**
   * SecurityHubStandardConfig Interface
   */
  static readonly securityHubStandardConfig = t.interface({
    name: t.enums('ExportFrequencyType', [
      'AWS Foundational Security Best Practices v1.0.0',
      'CIS AWS Foundations Benchmark v1.2.0',
      'PCI DSS v3.2.1',
    ]),
    enable: t.boolean,
    controlsToDisable: t.optional(t.array(t.nonEmptyString)),
  });

  /**
   * SecurityHubConfig Interface
   */
  static readonly securityHubConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.region)),
    standards: t.array(SecurityConfigTypes.securityHubStandardConfig),
  });

  /**
   * AccessAnalyzer Interface
   */
  static readonly accessAnalyzerConfig = t.interface({
    enable: t.boolean,
  });

  /**
   * SecurityConfig Interface
   */
  static readonly centralSecurityServicesConfig = t.interface({
    delegatedAdminAccount: t.nonEmptyString,
    macie: SecurityConfigTypes.macieConfig,
    guardduty: SecurityConfigTypes.guardDutyConfig,
    securityHub: SecurityConfigTypes.securityHubConfig,
    accessAnalyzer: SecurityConfigTypes.accessAnalyzerConfig,
  });

  static readonly configRule = t.interface({
    name: t.nonEmptyString,
    identifier: t.nonEmptyString,
    inputParameters: t.optional(t.dictionary(t.nonEmptyString, t.nonEmptyString)),
    complianceResourceTypes: t.optional(t.array(t.nonEmptyString)),
  });

  static readonly awsConfigRuleSet = t.interface({
    deploymentTargets: t.deploymentTargets,
    rules: t.array(SecurityConfigTypes.configRule),
  });

  static readonly awsConfig = t.interface({
    enableConfigurationRecorder: t.boolean,
    enableDeliveryChannel: t.boolean,
    ruleSets: t.array(SecurityConfigTypes.awsConfigRuleSet),
  });

  static readonly securityConfig = t.interface({
    centralSecurityServices: SecurityConfigTypes.centralSecurityServicesConfig,
    awsConfig: SecurityConfigTypes.awsConfig,
  });
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

export class AccessAnalyzerConfig implements t.TypeOf<typeof SecurityConfigTypes.accessAnalyzerConfig> {
  readonly enable = true;
}

export class CentralSecurityServicesConfig
  implements t.TypeOf<typeof SecurityConfigTypes.centralSecurityServicesConfig>
{
  readonly delegatedAdminAccount = 'Audit';
  readonly macie: MacieConfig = new MacieConfig();
  readonly guardduty: GuardDutyConfig = new GuardDutyConfig();
  readonly securityHub: SecurityHubConfig = new SecurityHubConfig();
  readonly accessAnalyzer: AccessAnalyzerConfig = new AccessAnalyzerConfig();
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

export class AwsConfig implements t.TypeOf<typeof SecurityConfigTypes.awsConfig> {
  readonly enableConfigurationRecorder = true;
  readonly enableDeliveryChannel = true;
  readonly ruleSets: AwsConfigRuleSet[] = [];
}

export class SecurityConfig implements t.TypeOf<typeof SecurityConfigTypes.securityConfig> {
  static readonly FILENAME = 'security-config.yaml';

  readonly centralSecurityServices: CentralSecurityServicesConfig = new CentralSecurityServicesConfig();
  readonly awsConfig: AwsConfig = new AwsConfig();

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
}

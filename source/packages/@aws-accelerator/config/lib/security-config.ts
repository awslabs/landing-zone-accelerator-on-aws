import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export abstract class SecurityConfigTypes {
  /**
   * MacieConfig Interface
   */
  static readonly MacieConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.nonEmptyString)),
    policyFindingsPublishingFrequency: t.enums('FrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
    publishSensitiveDataFindings: t.boolean,
  });

  /**
   * GuardDutyS3Protection Interface
   */
  static readonly GuardDutyS3ProtectionConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.nonEmptyString)),
  });

  /**
   * GuardDutyExportFindingsConfig Interface
   */
  static readonly GuardDutyExportFindingsConfig = t.interface({
    enable: t.boolean,
    destinationType: t.enums('DestinationType', ['S3']),
    exportFrequency: t.enums('ExportFrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
  });

  /**
   * GuardDutyConfig Interface
   */
  static readonly GuardDutyConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.nonEmptyString)),
    s3Protection: SecurityConfigTypes.GuardDutyS3ProtectionConfig,
    exportConfiguration: SecurityConfigTypes.GuardDutyExportFindingsConfig,
  });

  /**
   * SecurityHubStandardConfig Interface
   */
  static readonly SecurityHubStandardConfig = t.interface({
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
  static readonly SecurityHubConfig = t.interface({
    enable: t.boolean,
    excludeRegions: t.optional(t.array(t.nonEmptyString)),
    standards: t.array(SecurityConfigTypes.SecurityHubStandardConfig),
  });

  /**
   * SecurityConfig Interface
   */
  static readonly SecurityConfig = t.interface({
    delegatedAdminAccount: t.nonEmptyString,
    macie: SecurityConfigTypes.MacieConfig,
    guardduty: SecurityConfigTypes.GuardDutyConfig,
    securityHub: SecurityConfigTypes.SecurityHubConfig,
  });

  static readonly ConfigRule = t.interface({
    name: t.nonEmptyString,
    identifier: t.nonEmptyString,
    inputParameters: t.optional(t.dictionary(t.nonEmptyString, t.nonEmptyString)),
    'compliance-resource-types': t.optional(t.array(t.nonEmptyString)),
  });

  static readonly ConfigRuleSet = t.interface({
    excludeRegions: t.optional(t.array(t.nonEmptyString)),
    excludeAccounts: t.optional(t.array(t.nonEmptyString)),
    organizationalUnits: t.optional(t.array(t.nonEmptyString)),
    accounts: t.optional(t.array(t.nonEmptyString)),
    rules: t.array(SecurityConfigTypes.ConfigRule),
  });

  static readonly Config = t.interface({
    enableConfigurationRecorder: t.boolean,
    enableDeliveryChannel: t.boolean,
    ruleSets: t.array(SecurityConfigTypes.ConfigRuleSet),
  });
}

export const SecurityConfigType = t.interface({
  centralSecurityServices: SecurityConfigTypes.SecurityConfig,
  awsConfig: SecurityConfigTypes.Config,
});

export class SecurityConfig implements t.TypeOf<typeof SecurityConfigType> {
  static readonly FILENAME = 'security-config.yaml';

  readonly centralSecurityServices: t.TypeOf<typeof SecurityConfigTypes.SecurityConfig> = {
    delegatedAdminAccount: 'audit',
    macie: {
      enable: true,
      excludeRegions: [],
      policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
      publishSensitiveDataFindings: true,
    },
    guardduty: {
      enable: true,
      excludeRegions: [],
      s3Protection: {
        enable: true,
        excludeRegions: [],
      },
      exportConfiguration: {
        enable: true,
        destinationType: 'S3',
        exportFrequency: 'FIFTEEN_MINUTES',
      },
    },
    securityHub: {
      enable: true,
      excludeRegions: [],
      standards: [
        {
          name: 'AWS Foundational Security Best Practices v1.0.0',
          enable: true,
          controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
        },
        {
          name: 'PCI DSS v3.2.1',
          enable: true,
          controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
        },
      ],
    },
  };

  readonly awsConfig: t.TypeOf<typeof SecurityConfigTypes.Config> = {
    enableConfigurationRecorder: true,
    enableDeliveryChannel: true,
    ruleSets: [],
  };

  constructor(values?: t.TypeOf<typeof SecurityConfigType>) {
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
    const values = t.parse(SecurityConfigType, yaml.load(buffer));
    return new SecurityConfig(values);
  }
}

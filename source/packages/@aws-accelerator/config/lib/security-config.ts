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
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'policy-findings-publishing-frequency': t.enums('FrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
    'publish-sensitive-data-findings': t.boolean,
  });

  /**
   * GuardDutyS3Protection Interface
   */
  static readonly GuardDutyS3ProtectionConfig = t.interface({
    enable: t.boolean,
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
  });

  /**
   * GuardDutyExportFindingsConfig Interface
   */
  static readonly GuardDutyExportFindingsConfig = t.interface({
    enable: t.boolean,
    'destination-type': t.enums('DestinationType', ['S3']),
    'export-frequency': t.enums('ExportFrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
  });

  /**
   * GuardDutyConfig Interface
   */
  static readonly GuardDutyConfig = t.interface({
    enable: t.boolean,
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    's3-protection': SecurityConfigTypes.GuardDutyS3ProtectionConfig,
    'export-configuration': SecurityConfigTypes.GuardDutyExportFindingsConfig,
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
    'controls-to-disable': t.optional(t.array(t.nonEmptyString)),
  });

  /**
   * SecurityHubConfig Interface
   */
  static readonly SecurityHubConfig = t.interface({
    enable: t.boolean,
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    standards: t.array(SecurityConfigTypes.SecurityHubStandardConfig),
  });

  /**
   * SecurityConfig Interface
   */
  static readonly SecurityConfig = t.interface({
    'delegated-admin-account': t.nonEmptyString,
    macie: SecurityConfigTypes.MacieConfig,
    guardduty: SecurityConfigTypes.GuardDutyConfig,
    'security-hub': SecurityConfigTypes.SecurityHubConfig,
  });

  static readonly ConfigRule = t.interface({
    name: t.nonEmptyString,
    identifier: t.nonEmptyString,
    'input-parameters': t.optional(t.dictionary(t.nonEmptyString, t.nonEmptyString)),
    'compliance-resource-types': t.optional(t.array(t.nonEmptyString)),
  });

  static readonly ConfigRuleSet = t.interface({
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'exclude-accounts': t.optional(t.array(t.nonEmptyString)),
    'organizational-units': t.optional(t.array(t.nonEmptyString)),
    accounts: t.optional(t.array(t.nonEmptyString)),
    rules: t.array(SecurityConfigTypes.ConfigRule),
  });

  static readonly Config = t.interface({
    'enable-configuration-recorder': t.boolean,
    'enable-delivery-channel': t.boolean,
    'rule-sets': t.array(SecurityConfigTypes.ConfigRuleSet),
  });
}

export const SecurityConfigType = t.interface({
  'central-security-services': SecurityConfigTypes.SecurityConfig,
  'aws-config': SecurityConfigTypes.Config,
});

export class SecurityConfig implements t.TypeOf<typeof SecurityConfigType> {
  static readonly FILENAME = 'security-config.yaml';

  readonly 'central-security-services': t.TypeOf<typeof SecurityConfigTypes.SecurityConfig> = {
    'delegated-admin-account': 'audit',
    macie: {
      enable: true,
      'exclude-regions': [],
      'policy-findings-publishing-frequency': 'FIFTEEN_MINUTES',
      'publish-sensitive-data-findings': true,
    },
    guardduty: {
      enable: true,
      'exclude-regions': [],
      's3-protection': {
        enable: true,
        'exclude-regions': [],
      },
      'export-configuration': {
        enable: true,
        'destination-type': 'S3',
        'export-frequency': 'FIFTEEN_MINUTES',
      },
    },
    'security-hub': {
      enable: true,
      'exclude-regions': [],
      standards: [
        {
          name: 'AWS Foundational Security Best Practices v1.0.0',
          enable: true,
          'controls-to-disable': ['IAM.1', 'EC2.10', 'Lambda.4'],
        },
        {
          name: 'PCI DSS v3.2.1',
          enable: true,
          'controls-to-disable': ['IAM.1', 'EC2.10', 'Lambda.4'],
        },
      ],
    },
  };

  readonly 'aws-config': t.TypeOf<typeof SecurityConfigTypes.Config> = {
    'enable-configuration-recorder': true,
    'enable-delivery-channel': true,
    'rule-sets': [],
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
    return this['central-security-services']['delegated-admin-account'];
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

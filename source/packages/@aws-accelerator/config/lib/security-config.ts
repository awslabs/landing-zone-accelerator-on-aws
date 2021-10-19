import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export abstract class SecurityConfigTypes {
  /**
   * MacieSession Configuration
   */
  static readonly MacieConfig = t.interface({
    enable: t.boolean,
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'policy-findings-publishing-frequency': t.enums('FrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
    'publish-sensitive-data-findings': t.boolean,
  });

  /**
   * GuardDutyS3Protection
   */
  static readonly GuardDutyS3ProtectionConfig = t.interface({
    enable: t.boolean,
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
  });

  /**
   * GuardDutyS3Protection
   */
  static readonly GuardDutyExportFindingsConfig = t.interface({
    enable: t.boolean,
    'destination-type': t.enums('DestinationType', ['S3']),
    'export-frequency': t.enums('ExportFrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
  });

  /**
   * GuardDuty Configuration
   */
  static readonly GuardDutyConfig = t.interface({
    enable: t.boolean,
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    's3-protection': SecurityConfigTypes.GuardDutyS3ProtectionConfig,
    'export-configuration': SecurityConfigTypes.GuardDutyExportFindingsConfig,
  });

  /**
   *
   */
  static readonly SecurityConfig = t.interface({
    'delegated-admin-account': t.nonEmptyString,
    macie: SecurityConfigTypes.MacieConfig,
    guardduty: SecurityConfigTypes.GuardDutyConfig,
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
        'exclude-regions': ['us-west-2'],
      },
      'export-configuration': {
        enable: true,
        'destination-type': 'S3',
        'export-frequency': 'FIFTEEN_MINUTES',
      },
    },
  };

  readonly 'aws-config': t.TypeOf<typeof SecurityConfigTypes.Config> = {
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

import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export abstract class SecurityConfigTypes {
  /**
   *
   */
  static readonly MacieConfig = t.interface({
    enable: t.boolean,
    'delegated-admin-account': t.nonEmptyString,
    'exclude-regions': t.optional(t.array(t.nonEmptyString)),
    'policy-findings-publishing-frequency': t.enums('FrequencyType', ['FIFTEEN_MINUTES', 'ONE_HOUR', 'SIX_HOURS']),
    'publish-sensitive-data-findings': t.boolean,
  });

  /**
   *
   */
  static readonly SecurityConfig = t.interface({
    macie: SecurityConfigTypes.MacieConfig,
  });
}

export const SecurityConfigType = t.interface({
  'central-security-services': SecurityConfigTypes.SecurityConfig,
});

export class SecurityConfig implements t.TypeOf<typeof SecurityConfigType> {
  static readonly FILENAME = 'security-config.yaml';

  readonly 'central-security-services': t.TypeOf<typeof SecurityConfigTypes.SecurityConfig> = {
    macie: {
      enable: true,
      'delegated-admin-account': 'audit',
      'exclude-regions': [],
      'policy-findings-publishing-frequency': 'FIFTEEN_MINUTES',
      'publish-sensitive-data-findings': true,
    },
  };

  constructor(values?: t.TypeOf<typeof SecurityConfigType>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Return excluded Regions
   */
  public getExcludeRegions(): string[] | undefined {
    return this['central-security-services'].macie['exclude-regions'];
  }

  /**
   * Return delegated-admin-account name
   */
  public getDelegatedAccountName(): string {
    return this['central-security-services'].macie['delegated-admin-account'];
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

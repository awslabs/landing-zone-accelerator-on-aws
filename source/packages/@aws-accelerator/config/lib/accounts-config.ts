/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * AWS Organizations configuration items.
 */
export class AccountsConfigTypes {
  /**
   *
   */
  static readonly accountConfig = t.interface({
    name: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    email: t.nonEmptyString,
    organizationalUnit: t.nonEmptyString,
  });

  static readonly accountsConfig = t.interface({
    mandatoryAccounts: t.array(this.accountConfig),
    workloadAccounts: t.array(this.accountConfig),
  });
}

export class AccountConfig implements t.TypeOf<typeof AccountsConfigTypes.accountConfig> {
  readonly name: string = '';
  readonly description: string = '';
  readonly email: string = '';
  readonly organizationalUnit: string = '';
}
/**
 *
 */
export class AccountsConfig implements t.TypeOf<typeof AccountsConfigTypes.accountsConfig> {
  static readonly FILENAME = 'accounts-config.yaml';

  readonly mandatoryAccounts: AccountConfig[] = [
    {
      name: 'Management',
      description: 'The management (primary) account',
      email: '<management-account>@example.com <----- UPDATE EMAIL ADDRESS',
      organizationalUnit: 'Root',
    },
    {
      name: 'Log Archive',
      description: 'The log archive account',
      email: '<log-archive>@example.com  <----- UPDATE EMAIL ADDRESS',
      organizationalUnit: 'Security',
    },
    {
      name: 'Audit',
      description: 'The security audit account (also referred to as the audit account)',
      email: '<audit>@example.com  <----- UPDATE EMAIL ADDRESS',
      organizationalUnit: 'Security',
    },
  ];

  readonly workloadAccounts: AccountConfig[] = [];

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof AccountsConfigTypes.accountsConfig>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  public getEmail(name: string): string {
    const value = [...this.mandatoryAccounts, ...this.workloadAccounts].find(value => value.name == name);
    if (value) {
      return value.email;
    }

    throw new Error(`Account email not found for ${name}`);
  }

  public containsAccount(name: string): boolean {
    const value = [...this.mandatoryAccounts, ...this.workloadAccounts].find(value => value.name == name);
    if (value) {
      return true;
    }

    return false;
  }

  public getManagementAccount(): AccountConfig {
    const value = this.mandatoryAccounts.find(value => value.name == 'Management');
    if (value) {
      return value;
    }
    throw new Error(`Management account not defined`);
  }

  public getLogArchiveAccount(): AccountConfig {
    const value = this.mandatoryAccounts.find(value => value.name == 'Log Archive');
    if (value) {
      return value;
    }
    throw new Error(`Log Archive account not defined`);
  }

  public getAuditAccount(): AccountConfig {
    const value = this.mandatoryAccounts.find(value => value.name == 'Audit');
    if (value) {
      return value;
    }
    throw new Error(`Audit account not defined`);
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): AccountsConfig {
    const buffer = fs.readFileSync(path.join(dir, AccountsConfig.FILENAME), 'utf8');
    const values = t.parse(AccountsConfigTypes.accountsConfig, yaml.load(buffer));
    return new AccountsConfig(values);
  }
}

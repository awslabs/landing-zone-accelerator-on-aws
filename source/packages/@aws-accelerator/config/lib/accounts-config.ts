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
export abstract class AccountsConfigTypes {
  /**
   *
   */
  static readonly Account = t.interface({
    'account-name': t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    email: t.nonEmptyString,
    'organizational-unit': t.nonEmptyString,
  });

  static readonly MandatoryAccounts = t.interface({
    management: AccountsConfigTypes.Account,
    'log-archive': AccountsConfigTypes.Account,
    audit: AccountsConfigTypes.Account,
  });

  static readonly WorkloadAccounts = t.record(t.nonEmptyString, this.Account);
}

/**
 * @see AccountsConfig
 */
export const AccountsConfigType = t.interface({
  'mandatory-accounts': AccountsConfigTypes.MandatoryAccounts,
  'workload-accounts': AccountsConfigTypes.WorkloadAccounts,
});

/**
 *
 */
export class AccountsConfig implements t.TypeOf<typeof AccountsConfigType> {
  static readonly FILENAME = 'accounts-config.yaml';

  /**
   *
   */
  readonly 'mandatory-accounts': t.TypeOf<typeof AccountsConfigTypes.MandatoryAccounts> = {
    management: {
      'account-name': '',
      description: '',
      email: '',
      'organizational-unit': '',
    },
    'log-archive': {
      'account-name': '',
      description: '',
      email: '',
      'organizational-unit': '',
    },
    audit: {
      'account-name': '',
      description: '',
      email: '',
      'organizational-unit': '',
    },
  };

  /**
   *
   */
  readonly 'workload-accounts': t.TypeOf<typeof AccountsConfigTypes.WorkloadAccounts> = {};

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof AccountsConfigType>) {
    if (values) {
      Object.assign(this, values);
    }
  }

  /**
   * Returns the email address associated to the provided account.
   *
   * @param account
   * @returns
   */
  public getEmail(account: string): string {
    let value = Object.entries(this['mandatory-accounts']).find(entry => entry[0] == account);
    if (value) {
      return value[1].email;
    }
    value = Object.entries(this['workload-accounts']).find(entry => entry[0] == account);
    if (value) {
      return value[1].email;
    }
    throw new Error(`Account email not found for ${account}`);
  }

  /**
   * Returns true if an account is defined in the config with the specified email
   *
   * @param email
   * @returns true if found, false otherwise
   */
  public containsEmail(email: string | unknown): boolean {
    if (Object.entries(this['mandatory-accounts']).find(account => account[1].email === email)) {
      return true;
    }
    if (Object.entries(this['workload-accounts']).find(account => account[1].email === email)) {
      return true;
    }
    return false;
  }

  /**
   *
   * @param dir
   * @returns
   */
  static load(dir: string): AccountsConfig {
    const buffer = fs.readFileSync(path.join(dir, AccountsConfig.FILENAME), 'utf8');
    const values = t.parse(AccountsConfigType, yaml.load(buffer));
    return new AccountsConfig(values);
  }
}

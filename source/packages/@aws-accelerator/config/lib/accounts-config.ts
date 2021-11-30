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
    accountName: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    email: t.nonEmptyString,
    organizationalUnit: t.nonEmptyString,
  });

  static readonly MandatoryAccounts = t.interface({
    management: AccountsConfigTypes.Account,
    logArchive: AccountsConfigTypes.Account,
    audit: AccountsConfigTypes.Account,
  });

  static readonly WorkloadAccounts = t.record(t.nonEmptyString, this.Account);
}

/**
 * @see AccountsConfig
 */
export const AccountsConfigType = t.interface({
  mandatoryAccounts: AccountsConfigTypes.MandatoryAccounts,
  workloadAccounts: AccountsConfigTypes.WorkloadAccounts,
});

/**
 *
 */
export class AccountsConfig implements t.TypeOf<typeof AccountsConfigType> {
  static readonly FILENAME = 'accounts-config.yaml';

  /**
   *
   */
  readonly mandatoryAccounts: t.TypeOf<typeof AccountsConfigTypes.MandatoryAccounts> = {
    management: {
      accountName: '',
      description: '',
      email: '',
      organizationalUnit: '',
    },
    logArchive: {
      accountName: '',
      description: '',
      email: '',
      organizationalUnit: '',
    },
    audit: {
      accountName: '',
      description: '',
      email: '',
      organizationalUnit: '',
    },
  };

  /**
   *
   */
  readonly workloadAccounts: t.TypeOf<typeof AccountsConfigTypes.WorkloadAccounts> = {};

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
    let value = Object.entries(this.mandatoryAccounts).find(entry => entry[0] == account);
    if (value) {
      return value[1].email;
    }
    value = Object.entries(this.workloadAccounts).find(entry => entry[0] == account);
    if (value) {
      return value[1].email;
    }
    throw new Error(`Account email not found for ${account}`);
  }

  /**
   * Returns the name of the account.
   *
   * @param account
   * @returns
   */
  public accountExists(account: string): boolean {
    let value = Object.entries(this.mandatoryAccounts).find(entry => entry[0] == account);
    if (value) {
      return true;
    }
    value = Object.entries(this.workloadAccounts).find(entry => entry[0] == account);
    if (value) {
      return true;
    }
    throw new Error(`${account} Account not found`);
  }

  /**
   * Returns true if an account is defined in the config with the specified email
   *
   * @param email
   * @returns true if found, false otherwise
   */
  public containsEmail(email: string | unknown): boolean {
    if (Object.entries(this.mandatoryAccounts).find(account => account[1].email === email)) {
      return true;
    }
    if (Object.entries(this.workloadAccounts).find(account => account[1].email === email)) {
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

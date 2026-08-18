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

import { createLogger } from '@aws-accelerator/utils';
import { AccountsConfig } from '../lib/accounts-config';
import { CustomizationsConfig } from '../lib/customizations-config';
import { GlobalConfig } from '../lib/global-config';
import { IamConfig } from '../lib/iam-config';
import { NetworkConfig } from '../lib/network-config';
import { OrganizationConfig } from '../lib/organization-config';
import { SecurityConfig } from '../lib/security-config';
import { getValidAccountNameSet } from './common/common-validator-functions';

/**
 * Field names whose string values reference an account by name in
 * accounts-config.yaml. Singular fields contain one name; plural fields
 * contain a list. Excluded-account fields use the same name space.
 */
const SINGULAR_ACCOUNT_FIELDS = new Set<string>([
  'account',
  'delegatedAdminAccount',
  'ownerAccount',
  'targetAccountName',
]);
const ACCOUNT_LIST_FIELDS = new Set<string>(['accounts', 'excludedAccounts', 'excludeAccounts', 'sharedAccounts']);

/**
 * Field names whose values are populated at runtime with raw account IDs
 * (not user-authored account names). Skip walking into them so we don't
 * report false positives.
 */
const RUNTIME_ACCOUNT_ID_FIELDS = new Set<string>(['iamRoleSsmParameters', 'accountIds']);

/**
 * Validator that flags references to accounts that are not declared in
 * accounts-config.yaml. The most common cause is moving an account into
 * an ignored OU (which forces removal from accounts-config.yaml) without
 * removing the leftover references in the other config files. The runtime
 * error in that scenario is "Account name not found for <name>" with no
 * pointer to the config file or path; this validator surfaces a precise
 * <file>:<path> location for each dangling reference at synth time.
 */
export class AccountReferenceValidator {
  private readonly accountsConfig: AccountsConfig;
  private readonly globalConfig?: GlobalConfig;
  private readonly iamConfig?: IamConfig;
  private readonly networkConfig?: NetworkConfig;
  private readonly securityConfig?: SecurityConfig;
  private readonly customizationsConfig?: CustomizationsConfig;
  private readonly organizationConfig?: OrganizationConfig;
  private readonly logger = createLogger(['account-reference-validator']);

  constructor(
    accountsConfig: AccountsConfig,
    globalConfig?: GlobalConfig,
    iamConfig?: IamConfig,
    networkConfig?: NetworkConfig,
    securityConfig?: SecurityConfig,
    customizationsConfig?: CustomizationsConfig,
    organizationConfig?: OrganizationConfig,
  ) {
    this.accountsConfig = accountsConfig;
    this.globalConfig = globalConfig;
    this.iamConfig = iamConfig;
    this.networkConfig = networkConfig;
    this.securityConfig = securityConfig;
    this.customizationsConfig = customizationsConfig;
    this.organizationConfig = organizationConfig;
  }

  public validate(): void {
    this.logger.info('Validating account references across config files');

    const validNames = getValidAccountNameSet(this.accountsConfig);
    const errors: string[] = [];

    if (this.globalConfig) {
      this.walk(this.globalConfig, GlobalConfig.FILENAME, validNames, errors);
    }
    if (this.iamConfig) {
      this.walk(this.iamConfig, IamConfig.FILENAME, validNames, errors);
    }
    if (this.networkConfig) {
      this.walk(this.networkConfig, NetworkConfig.FILENAME, validNames, errors);
    }
    if (this.securityConfig) {
      this.walk(this.securityConfig, SecurityConfig.FILENAME, validNames, errors);
    }
    if (this.customizationsConfig) {
      this.walk(this.customizationsConfig, CustomizationsConfig.FILENAME, validNames, errors);
    }
    if (this.organizationConfig) {
      this.walk(this.organizationConfig, OrganizationConfig.FILENAME, validNames, errors);
    }

    if (errors.length) {
      throw new Error(
        `Account reference validation found ${errors.length} dangling reference(s):\n${errors.join('\n')}`,
      );
    }
  }

  /**
   * Depth-first walk of a config object. Whenever we encounter a key whose
   * name matches one of the known account-reference fields, validate the
   * value(s) against `validNames`.
   */
  private walk(
    node: unknown,
    fileLabel: string,
    validNames: Set<string>,
    errors: string[],
    pathSegments: string[] = [],
  ) {
    if (node === null || node === undefined) return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => this.walk(item, fileLabel, validNames, errors, [...pathSegments, `[${index}]`]));
      return;
    }

    if (typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (RUNTIME_ACCOUNT_ID_FIELDS.has(key)) continue;

      const childPath = [...pathSegments, key];

      if (SINGULAR_ACCOUNT_FIELDS.has(key) && typeof value === 'string' && value.length > 0) {
        this.checkName(value, validNames, fileLabel, childPath, errors);
      } else if (ACCOUNT_LIST_FIELDS.has(key) && Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'string' && item.length > 0) {
            this.checkName(item, validNames, fileLabel, [...childPath, `[${index}]`], errors);
          }
        });
      } else {
        this.walk(value, fileLabel, validNames, errors, childPath);
      }
    }
  }

  private checkName(
    name: string,
    validNames: Set<string>,
    fileLabel: string,
    pathSegments: string[],
    errors: string[],
  ) {
    if (validNames.has(name)) return;
    const path = formatPath(pathSegments);
    errors.push(
      `${fileLabel}: ${path}: account "${name}" is not defined in ${AccountsConfig.FILENAME}. ` +
        `If this account was moved to an ignored OU, also remove all references to it from ${fileLabel}.`,
    );
  }
}

/**
 * Format ['vpcs', '[2]', 'account'] as 'vpcs[2].account'.
 */
function formatPath(segments: string[]): string {
  return segments.reduce((acc, segment) => {
    if (segment.startsWith('[')) return acc + segment;
    return acc.length === 0 ? segment : `${acc}.${segment}`;
  }, '');
}

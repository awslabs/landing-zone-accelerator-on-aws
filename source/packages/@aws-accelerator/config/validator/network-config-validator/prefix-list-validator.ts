/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { NetworkConfig } from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate customer-managed prefix lists
 */
export class PrefixListValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate prefix list names
    //
    this.validatePrefixListNames(values, helpers, errors);
    //
    // Validate prefix list account names
    //
    this.validatePrefixListAccountNames(values, helpers, errors);
    //
    // Validate entries
    //
    this.validatePrefixListEntries(values, helpers, errors);
  }

  /**
   * Validate prefix list names
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePrefixListNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const listNames: string[] = [];
    values.prefixLists?.forEach(list => listNames.push(list.name));

    if (helpers.hasDuplicates(listNames)) {
      errors.push(
        `Duplicate prefix list names exist. Prefix list names must be unique. Prefix list names in file: ${listNames}`,
      );
    }
  }

  /**
   * Validate prefix list account names
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePrefixListAccountNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.prefixLists?.forEach(list => {
      if (list.accounts && list.deploymentTargets) {
        errors.push(`Cannot define both accounts and deploymentTargets for prefixList ${list.name}`);
        return;
      }
      const deploymentTargetAccounts = [];
      if (list.accounts) {
        deploymentTargetAccounts.push(...list.accounts);
      }
      if (list.deploymentTargets?.accounts) {
        deploymentTargetAccounts.push(...list.deploymentTargets.accounts);
      }
      deploymentTargetAccounts.forEach(account => {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Target account ${account} for prefix list ${list.name} does not exist in accounts-config.yaml file`,
          );
        }
      });
      if (list.deploymentTargets?.organizationalUnits) {
        list.deploymentTargets.organizationalUnits.forEach(ou => {
          if (!helpers.ouExists(ou)) {
            errors.push(`Target OU ${ou} for prefix list ${list.name} does not exist in accounts-config.yaml file`);
          }
        });
      }
    });
  }

  /**
   * Validate prefix list entries
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePrefixListEntries(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.prefixLists?.forEach(list => {
      // Validate number of entries
      if (list.entries.length > list.maxEntries) {
        errors.push(
          `[Prefix list ${list.name}]: maximum number of entries exceeded. Number of entries defined: ${list.entries.length} Max entries allowed: ${list.maxEntries}`,
        );
      }
      // Validate CIDR ranges
      list.entries.forEach(entry => {
        if (!helpers.isValidIpv4Cidr(entry)) {
          errors.push(`[Prefix list ${list.name}]: entry "${entry}" is invalid. Value must be a valid IPv4 CIDR range`);
        }
      });
    });
  }
}

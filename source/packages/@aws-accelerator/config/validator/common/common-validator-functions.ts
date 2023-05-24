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
import { AccountsConfig } from '../../lib/accounts-config';
import * as t from '../../lib/common-types';

/**
 * Class for common helper functions
 */
export class CommonValidatorFunctions {
  /**
   * Get account names for a deployment target object
   * @param targets
   * @returns
   */
  public static getAccountNamesFromTarget(
    accountsConfig: AccountsConfig,
    deploymentTargets: t.DeploymentTargets,
  ): string[] {
    const accountNames: string[] = [];

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          accountNames.push(account.name);
        }
      } else {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          if (ou === account.organizationalUnit) {
            accountNames.push(account.name);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      accountNames.push(account);
    }

    const filterAccountNames = accountNames.filter(item => !deploymentTargets.excludedAccounts?.includes(item));

    return [...new Set(filterAccountNames)];
  }
}

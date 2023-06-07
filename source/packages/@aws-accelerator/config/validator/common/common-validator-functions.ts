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
import { GlobalConfig } from '../../lib/global-config';

/**
 * Class for common helper functions
 */
export class CommonValidatorFunctions {
  /**
   * Get account names for a deployment target object
   * @param targets
   * @returns
   */
  public static getAccountNamesFromDeploymentTargets(
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

  /**
   * Function that will retrieve the regions from the deploymentTargets object that is passed in.
   * @param target {@link t.DeploymentTargets}
   * @param globalConfig {@link globalConfig}
   * @returns
   */
  public static getRegionsFromDeploymentTarget(target: t.DeploymentTargets, global: GlobalConfig): t.Region[] {
    const enabledRegions: t.Region[] = global.enabledRegions;
    if (target.excludedRegions) {
      return enabledRegions.filter(region => !target.excludedRegions.includes(region));
    }

    return enabledRegions;
  }

  /**
   * Function receives input of the account and region from the deploymentTargets, and provides a combined list
   * of environments with the format of account-region (e.g. Dev-us-east-1)
   * @param accountsConfig {@link AccountsConfig}
   * @param target {@link t.DeploymentTargets}
   * @param global
   * @returns
   */
  public static getEnvironmentsFromDeploymentTarget(
    accountsConfig: AccountsConfig,
    target: t.DeploymentTargets,
    globalConfig: GlobalConfig,
  ): string[] {
    const environments: string[] = [];
    const enabledRegions = CommonValidatorFunctions.getRegionsFromDeploymentTarget(target, globalConfig);
    const accountConfigs = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(accountsConfig, target);

    for (const accountConfig of accountConfigs) {
      for (const enableRegion of enabledRegions) {
        environments.push(accountConfig + '-' + enableRegion);
      }
    }
    return environments;
  }
}

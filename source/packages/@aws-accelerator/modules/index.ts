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

import {
  AcceleratorModuleDetailsType,
  AcceleratorModuleNames,
  GroupedPromisesType,
  RunnerParametersType,
  PromiseItemType,
  AcceleratorModuleRunnerParametersType,
  AcceleratorModuleStageDetails,
} from './lib/libraries/lza';

import { AccountsConfig } from '@aws-accelerator/config/lib/accounts-config';
import { IAssumeRoleCredential } from '../../@aws-lza/common/resources';
import { ControlTowerLandingZoneConfig, GlobalConfig } from '@aws-accelerator/config/lib/global-config';
import path from 'path';
import { createLogger } from '../../@aws-lza/common/logger';
import { setResourcePrefixes } from '../accelerator/utils/app-utils';
import { getAcceleratorModuleRunnerParameters, getManagementAccountCredentials } from './lib/functions';

/**
 * ModuleRunner abstract class to execute accelerator modules.
 *
 * @description
 * `execute` function of this class orchestrate Accelerator module execution as per given order.
 */
export abstract class ModuleRunner {
  private static readonly logger = createLogger([path.parse(path.basename(__filename)).name]);
  /**
   * Function to execute module specific handler
   * @param params {@link RunnerParametersType}
   * @returns status string
   */
  public static async execute(params: RunnerParametersType): Promise<string> {
    const filteredModuleItems = AcceleratorModuleStageDetails.filter(item => item.stage.name === params.stage);

    if (filteredModuleItems.length === 0) {
      return `No modules found for "${params.stage}" stage`;
    }

    if (filteredModuleItems.length > 1) {
      throw new Error(
        `Internal error - duplicate entries found for stage ${params.stage} in AcceleratorModuleStageDetails`,
      );
    }

    const sortedModuleItems = [...filteredModuleItems[0].modules].sort((a, b) => a.runOrder - b.runOrder);

    if (sortedModuleItems.length === 0) {
      return `No modules found for "${params.stage}" stage`;
    }

    //
    // Get Resource prefixes
    //
    const resourcePrefixes = setResourcePrefixes(params.prefix);

    //
    // Get Management account credentials
    //
    const managementAccountCredentials = await getManagementAccountCredentials(
      params.partition,
      params.region,
      params.solutionId,
    );

    //
    // Get accelerator module runner parameters
    const acceleratorModuleRunnerParameters = await getAcceleratorModuleRunnerParameters(
      params.configDirPath,
      params.partition,
      resourcePrefixes,
      params.solutionId,
      managementAccountCredentials,
    );

    const statuses: string[] = [];
    const promiseItems: PromiseItemType[] = [];

    for (const sortedModuleItem of sortedModuleItems) {
      promiseItems.push({
        order: sortedModuleItem.runOrder,
        promise: () => ModuleRunner.executeModule(sortedModuleItem, params, acceleratorModuleRunnerParameters),
      });
    }

    await ModuleRunner.executePromises(promiseItems)
      .then(results => {
        statuses.push(...results);
      })
      .catch(error => {
        ModuleRunner.logger.error(error);
        throw error;
      });

    return statuses.join('\n');
  }

  /**
   * Function to execute promises
   * @param promiseItems {@link PromiseItemType}
   * @returns status string
   */
  private static async executePromises(promiseItems: PromiseItemType[]): Promise<string[]> {
    const statuses: string[] = [];
    const groupByPromiseItems = ModuleRunner.groupByPromiseItems(promiseItems);

    for (const groupByPromiseItem of groupByPromiseItems) {
      const promises = Array.isArray(groupByPromiseItem.promises)
        ? groupByPromiseItem.promises
        : [groupByPromiseItem.promises];
      statuses.push(...(await Promise.all(promises.map(promise => promise()))));
    }

    return statuses;
  }

  /**
   * Function to group promises by order
   * @param promiseItems {@link PromiseItemType}
   * @returns {@link GroupedPromisesType}
   */
  private static groupByPromiseItems(promiseItems: PromiseItemType[]): GroupedPromisesType[] {
    const groupedMap = promiseItems.reduce((map, { order, promise }) => {
      if (!map.has(order)) {
        map.set(order, []);
      }
      map.get(order)!.push(promise);
      return map;
    }, new Map<number, Array<() => Promise<string>>>());

    return Array.from(groupedMap, ([order, promises]) => ({
      order,
      promises: promises.length === 1 ? promises[0] : promises,
    }));
  }

  /**
   * Function to execute module specific handler
   * @param moduleItem {@link AcceleratorModuleDetailsType}
   * @param configItem {@link RunnerParametersType}
   * @param moduleRunnerParameters {@link AcceleratorModuleRunnerParametersType}
   * @returns status string
   */
  private static async executeModule(
    moduleItem: AcceleratorModuleDetailsType,
    runnerParameters: RunnerParametersType,
    moduleRunnerParameters: AcceleratorModuleRunnerParametersType,
  ): Promise<string> {
    switch (moduleItem.name) {
      case AcceleratorModuleNames.CONTROL_TOWER:
        return await ModuleRunner.executeControlTowerModule(
          moduleItem,
          runnerParameters,
          moduleRunnerParameters.configs.accountsConfig,
          moduleRunnerParameters.configs.globalConfig,
          moduleRunnerParameters.configs.globalConfig.controlTower.landingZone,
          moduleRunnerParameters.managementAccountCredentials,
        );
      case AcceleratorModuleNames.AWS_ORGANIZATIONS:
        return await moduleItem.handler(moduleItem.name);
      case AcceleratorModuleNames.NETWORK:
        return await moduleItem.handler(moduleItem.name);
      case AcceleratorModuleNames.SECURITY:
        return await moduleItem.handler(moduleItem.name);
      default:
        throw new Error(`Unknown Module ${moduleItem.name}`);
    }
  }

  /**
   * Function to execute Control Tower module specific handler
   * @param moduleRunnerParameters {@link ModuleRunnerParametersType}
   * @param moduleItem {@link AcceleratorModuleDetailsType}
   * @param accountsConfig {@link AccountsConfig}
   * @param globalConfig {@link GlobalConfig}
   * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfig}
   * @param managementAccountCredentials {@link IAssumeRoleCredential}
   * @returns status string
   */
  private static async executeControlTowerModule(
    moduleItem: AcceleratorModuleDetailsType,
    runnerParameters: RunnerParametersType,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    landingZoneConfiguration?: ControlTowerLandingZoneConfig,
    managementAccountCredentials?: IAssumeRoleCredential,
  ): Promise<string> {
    if (!landingZoneConfiguration) {
      return `Module ${moduleItem.name} execution skipped, No configuration found for Control Tower Landing zone`;
    }

    const param = {
      moduleName: moduleItem.name,
      operation: 'create',
      partition: runnerParameters.prefix,
      homeRegion: globalConfig.homeRegion,
      useExistingRole: runnerParameters.useExistingRole,
      solutionId: runnerParameters.solutionId,
      managementAccountCredentials,
      dryRun: runnerParameters.dryRun,
      configuration: {
        version: landingZoneConfiguration.version,
        enabledRegions: globalConfig.enabledRegions,
        logging: {
          organizationTrail: landingZoneConfiguration.logging.organizationTrail,
          retention: {
            loggingBucket: landingZoneConfiguration.logging.loggingBucketRetentionDays,
            accessLoggingBucket: landingZoneConfiguration.logging.accessLoggingBucketRetentionDays,
          },
        },
        security: landingZoneConfiguration.security,
        sharedAccounts: {
          management: {
            name: accountsConfig.getManagementAccount().name,
            email: accountsConfig.getManagementAccount().email,
          },
          audit: {
            name: accountsConfig.getAuditAccount().name,
            email: accountsConfig.getAuditAccount().email,
          },
          logging: {
            name: accountsConfig.getLogArchiveAccount().name,
            email: accountsConfig.getLogArchiveAccount().email,
          },
        },
      },
    };

    return await moduleItem.handler(param);
  }
}

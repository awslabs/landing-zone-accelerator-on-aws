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
  RunnerParametersType,
  PromiseItemType,
  AcceleratorModuleRunnerParametersType,
  AcceleratorModuleStageDetailsType,
  GroupedStagesByRunOrderType,
  GroupedPromisesByRunOrderType,
} from './models/types';
import path from 'path';
import { createLogger } from '../../@aws-lza/common/logger';
import { setResourcePrefixes } from '../accelerator/utils/app-utils';
import { getAcceleratorModuleRunnerParameters, getManagementAccountCredentials } from './lib/functions';
import { AcceleratorModuleStageDetails } from './models/constants';

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
    if (AcceleratorModuleStageDetails.length === 0) {
      throw new Error(`No modules found in AcceleratorModuleStageDetails`);
    }

    if (params.stage) {
      ModuleRunner.logger.info(`Executing stage "${params.stage}" modules`);
      return await ModuleRunner.executeStageDependentModules(params);
    }

    return await ModuleRunner.executeAllStageModules(params);
  }

  /**
   * Function to get module runner parameters
   * @param params {@link RunnerParametersType}
   * @returns parameters {@link AcceleratorModuleRunnerParametersType}
   */
  private static async getModuleRunnerParameters(
    params: RunnerParametersType,
  ): Promise<AcceleratorModuleRunnerParametersType> {
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
    //
    return await getAcceleratorModuleRunnerParameters(
      params.configDirPath,
      params.partition,
      resourcePrefixes,
      params.solutionId,
      managementAccountCredentials,
    );
  }

  /**
   * Function to execute all stage specific modules handler
   *
   * @description
   * This function will be executed when runner was executed without stage. This will orchestrate execution of all modules according to pipeline execution order.
   * @param runnerParameters {@link RunnerParametersType}
   * @returns status string
   */
  private static async executeAllStageModules(runnerParameters: RunnerParametersType): Promise<string> {
    ModuleRunner.logger.info(`Executing all modules since stage is undefined`);
    const statuses: string[] = [];

    const sortedStageItems = AcceleratorModuleStageDetails.sort((a, b) => a.stage.runOrder - b.stage.runOrder);

    const acceleratorModuleRunnerParameters = await ModuleRunner.getModuleRunnerParameters(runnerParameters);

    const groupedStageItems = ModuleRunner.groupStagesByRunOrder(sortedStageItems);

    for (const groupedStageItem of groupedStageItems) {
      const promiseItems: PromiseItemType[] = [];
      for (const stageItem of groupedStageItem.stages) {
        ModuleRunner.logger.info(`Preparing to execute modules of stage "${stageItem.stage.name}"`);
        const sortedModuleItems = [...stageItem.modules].sort((a, b) => a.runOrder - b.runOrder);
        if (sortedModuleItems.length === 0) {
          ModuleRunner.logger.info(`No modules found for "${stageItem.stage.name}" stage`);
        }

        for (const sortedModuleItem of sortedModuleItems) {
          ModuleRunner.logger.info(`Execution started for module "${sortedModuleItem.name}"`);
          promiseItems.push({
            runOrder: sortedModuleItem.runOrder,
            promise: () =>
              sortedModuleItem.handler({
                moduleItem: sortedModuleItem,
                runnerParameters,
                moduleRunnerParameters: acceleratorModuleRunnerParameters,
              }),
          });
        }
      }

      statuses.push(...(await ModuleRunner.executePromises(promiseItems)));

      promiseItems.splice(0);
    }

    return statuses.join('\n');
  }

  /**
   * Function to execute stage specific modules handler
   * @param params {@link RunnerParametersType}
   * @returns status string
   */
  private static async executeStageDependentModules(params: RunnerParametersType): Promise<string> {
    const stageModuleItems = AcceleratorModuleStageDetails.filter(item => item.stage.name === params.stage);

    if (stageModuleItems.length === 0) {
      return `No modules found for "${params.stage}" stage`;
    }

    if (stageModuleItems.length > 1) {
      throw new Error(
        `Internal error - duplicate entries found for stage ${params.stage} in AcceleratorModuleStageDetails`,
      );
    }

    const sortedModuleItems = [...stageModuleItems[0].modules].sort((a, b) => a.runOrder - b.runOrder);

    if (sortedModuleItems.length === 0) {
      return `No modules found for "${params.stage}" stage`;
    }

    const acceleratorModuleRunnerParameters = await ModuleRunner.getModuleRunnerParameters(params);

    const statuses: string[] = [];
    const promiseItems: PromiseItemType[] = [];

    for (const sortedModuleItem of sortedModuleItems) {
      promiseItems.push({
        runOrder: sortedModuleItem.runOrder,
        promise: () =>
          sortedModuleItem.handler({
            moduleItem: sortedModuleItem,
            runnerParameters: params,
            moduleRunnerParameters: acceleratorModuleRunnerParameters,
          }),
      });
    }

    statuses.push(...(await ModuleRunner.executePromises(promiseItems)));

    return statuses.join('\n');
  }

  /**
   * Function to execute promises
   * @param promiseItems {@link PromiseItemType}
   * @returns status string
   */
  private static async executePromises(promiseItems: PromiseItemType[]): Promise<string[]> {
    const statuses: string[] = [];
    const groupedPromiseItems = ModuleRunner.groupPromisesByRunOrder(promiseItems);

    for (const groupByPromiseItem of groupedPromiseItems) {
      const promises = Array.isArray(groupByPromiseItem.promises)
        ? groupByPromiseItem.promises
        : [groupByPromiseItem.promises];
      statuses.push(...(await Promise.all(promises.map(promise => promise()))));
    }

    return statuses;
  }

  /**
   * Function to group stages by order
   * @param stageItems {@link AcceleratorModuleStageDetailsType}
   * @returns {@link GroupedStagesByRunOrderType}
   */
  private static groupStagesByRunOrder(stageItems: AcceleratorModuleStageDetailsType[]): GroupedStagesByRunOrderType[] {
    const groupedMap = stageItems.reduce((acc, curr) => {
      const runOrder = curr.stage.runOrder;
      if (!acc.has(runOrder)) {
        acc.set(runOrder, []);
      }
      acc.get(runOrder)!.push(curr);
      return acc;
    }, new Map<number, AcceleratorModuleStageDetailsType[]>());

    const result: GroupedStagesByRunOrderType[] = Array.from(groupedMap.entries()).map(([runOrder, stages]) => ({
      order: runOrder,
      stages: stages,
    }));

    return result.sort((a, b) => a.order - b.order);
  }

  /**
   * Function to group promises by order
   * @param promiseItems {@link PromiseItemType}
   * @returns {@link GroupedPromisesByRunOrderType}
   */
  private static groupPromisesByRunOrder(promiseItems: PromiseItemType[]): GroupedPromisesByRunOrderType[] {
    const groupedMap = promiseItems.reduce((map, { runOrder, promise }) => {
      if (!map.has(runOrder)) {
        map.set(runOrder, []);
      }
      map.get(runOrder)!.push(promise);
      return map;
    }, new Map<number, Array<() => Promise<string>>>());

    return Array.from(groupedMap, ([order, promises]) => ({
      order,
      promises: promises.length === 1 ? promises[0] : promises,
    }));
  }
}

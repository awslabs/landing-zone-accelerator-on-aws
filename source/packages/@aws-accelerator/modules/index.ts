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
import { createLogger, MODULE_EXCEPTIONS } from '../../@aws-lza/index';
import { setResourcePrefixes } from '../accelerator/utils/app-utils';
import {
  getAcceleratorModuleRunnerParameters,
  getCentralLoggingResources,
  getManagementAccountCredentials,
  isModuleExecutionSkippedByEnvironment,
} from './lib/functions';
import { AcceleratorModuleStageDetails } from './models/constants';
import { ModuleExecutionPhase } from './models/enums';

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
          if (
            !acceleratorModuleRunnerParameters.logging.bucketKeyArn ||
            !acceleratorModuleRunnerParameters.logging.bucketName
          ) {
            const centralLoggingResources = await getCentralLoggingResources(
              runnerParameters.partition,
              runnerParameters.solutionId,
              acceleratorModuleRunnerParameters.logging.centralizedRegion,
              acceleratorModuleRunnerParameters.acceleratorResourceNames,
              acceleratorModuleRunnerParameters.configs.globalConfig,
              acceleratorModuleRunnerParameters.configs.accountsConfig,
              {
                name: stageItem.stage.name,
                runOrder: ModuleRunner.getStageRunOrder(stageItem.stage.name),
                module: { name: sortedModuleItem.name, executionPhase: sortedModuleItem.executionPhase },
              },
              acceleratorModuleRunnerParameters.managementAccountCredentials,
            );

            if (centralLoggingResources) {
              acceleratorModuleRunnerParameters.logging.bucketName = centralLoggingResources.bucketName;
              acceleratorModuleRunnerParameters.logging.bucketKeyArn = centralLoggingResources.keyArn;
            }
          }
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
    const synthPhase = process.env['CDK_OPTIONS'] === 'bootstrap';
    const stageModuleItems = AcceleratorModuleStageDetails.filter(item => item.stage.name === params.stage);

    if (stageModuleItems.length === 0) {
      return `No modules found for "${params.stage}" stage`;
    }

    if (stageModuleItems.length > 1) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT} - duplicate entries found for stage ${params.stage} in AcceleratorModuleStageDetails`,
      );
    }

    const sortedModuleItems = [...stageModuleItems[0].modules].sort((a, b) => a.runOrder - b.runOrder);

    if (sortedModuleItems.length === 0) {
      return `No modules found for "${params.stage}" stage`;
    }

    const acceleratorModuleRunnerParameters = await ModuleRunner.getModuleRunnerParameters(params);

    const statuses: string[] = [];
    const promiseItems: PromiseItemType[] = [];

    ModuleRunner.logger.info(`Executing modules for stage "${params.stage}"`);
    for (const sortedModuleItem of sortedModuleItems) {
      const isMatchingPhase =
        (synthPhase && sortedModuleItem.executionPhase === ModuleExecutionPhase.SYNTH) ||
        (!synthPhase && sortedModuleItem.executionPhase === ModuleExecutionPhase.DEPLOY);

      if (!isMatchingPhase) {
        ModuleRunner.logger.info(
          `Skipping module "${sortedModuleItem.name}" as it is not part of ${
            synthPhase ? ModuleExecutionPhase.SYNTH : ModuleExecutionPhase.DEPLOY
          } phase`,
        );
        continue;
      }

      if (!isModuleExecutionSkippedByEnvironment(sortedModuleItem.name)) {
        ModuleRunner.logger.info(`Module "${sortedModuleItem.name}" added for execution.`);
        const stageName = params.stage!;
        if (
          !acceleratorModuleRunnerParameters.logging.bucketKeyArn ||
          !acceleratorModuleRunnerParameters.logging.bucketName
        ) {
          const centralLoggingResources = await getCentralLoggingResources(
            params.partition,
            params.solutionId,
            acceleratorModuleRunnerParameters.logging.centralizedRegion,
            acceleratorModuleRunnerParameters.acceleratorResourceNames,
            acceleratorModuleRunnerParameters.configs.globalConfig,
            acceleratorModuleRunnerParameters.configs.accountsConfig,
            {
              name: stageName,
              runOrder: ModuleRunner.getStageRunOrder(stageName),
              module: { name: sortedModuleItem.name, executionPhase: sortedModuleItem.executionPhase },
            },
            acceleratorModuleRunnerParameters.managementAccountCredentials,
          );

          if (centralLoggingResources) {
            acceleratorModuleRunnerParameters.logging.bucketName = centralLoggingResources.bucketName;
            acceleratorModuleRunnerParameters.logging.bucketKeyArn = centralLoggingResources.keyArn;
          }
        }
        promiseItems.push({
          runOrder: synthPhase ? 1 : sortedModuleItem.runOrder,
          promise: () =>
            sortedModuleItem.handler({
              moduleItem: sortedModuleItem,
              runnerParameters: params,
              moduleRunnerParameters: acceleratorModuleRunnerParameters,
            }),
        });
      }
    }

    if (promiseItems.length === 0) {
      return `No modules found for "${params.stage}" stage`;
    }

    ModuleRunner.logger.info(`Execution started for modules of stage "${params.stage}"`);
    statuses.push(...(await ModuleRunner.executePromises(promiseItems)));
    ModuleRunner.logger.info(`Execution completed for modules of stage "${params.stage}"`);

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

  /**
   * Function to get stage run order
   * @param stageName string
   * @returns
   */
  private static getStageRunOrder(stageName: string): number {
    const stageItem = AcceleratorModuleStageDetails.find(
      (stage: AcceleratorModuleStageDetailsType) => stage.stage.name === stageName,
    );

    if (!stageItem) {
      this.logger.error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${stageName} not found in AcceleratorModuleStageDetails.`,
      );
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${stageName} not found in AcceleratorModuleStageDetails.`,
      );
    }

    return stageItem.stage.runOrder;
  }
}

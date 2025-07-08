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

import path from 'path';
import { ModuleParams } from '../../../models/types';
import { IStackPolicyHandlerParameter, createStackPolicy, createStatusLogger } from '../../../../../@aws-lza/index';
import { createLogger } from '@aws-accelerator/utils';
import { AcceleratorModuleStages } from '../../../models/enums';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

export const MESSAGES = {
  SKIP_NO_POLICY: 'Stack Policy not set. Skipping module execution',
  SKIP_PREPARE: `Stack Policy will be enabled in ${AcceleratorModuleStages.FINALIZE} stage, skipping in ${AcceleratorModuleStages.PREPARE} stage.`,
  SKIP_FINALIZE: `Stack Policy was disabled in ${AcceleratorModuleStages.PREPARE} stage, skipping in ${AcceleratorModuleStages.FINALIZE} stage.`,
};

const OPERATION_NAME = 'create-stack-policy';

export abstract class CreateStackPolicyModule {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

  public static async execute(params: ModuleParams): Promise<string> {
    const stage = params.stage ?? params.runnerParameters.stage;
    statusLogger.info(
      `Module ${params.moduleItem.name} execution started in stage ${stage} on ${new Date().toISOString()}`,
    );

    if (!params.moduleRunnerParameters.configs.globalConfig.stackPolicy) {
      statusLogger.info(MESSAGES.SKIP_NO_POLICY);
      return MESSAGES.SKIP_NO_POLICY;
    }

    if (stage !== AcceleratorModuleStages.PREPARE && stage !== AcceleratorModuleStages.FINALIZE) {
      CreateStackPolicyModule.logger.error(
        `Stack Policy cant be executed for stage ${stage}. Skipping module execution.`,
      );
      throw new Error(`Stack Policy cant be executed for stage ${stage}. Skipping module execution.`);
    }

    if (
      stage === AcceleratorModuleStages.PREPARE &&
      params.moduleRunnerParameters.configs.globalConfig.stackPolicy.enable
    ) {
      statusLogger.info(MESSAGES.SKIP_PREPARE);
      return MESSAGES.SKIP_PREPARE;
    }

    if (
      stage === AcceleratorModuleStages.FINALIZE &&
      !params.moduleRunnerParameters.configs.globalConfig.stackPolicy.enable
    ) {
      statusLogger.info(MESSAGES.SKIP_FINALIZE);
      return MESSAGES.SKIP_FINALIZE;
    }

    const ignoredOus = params.moduleRunnerParameters.configs.organizationConfig.getIgnoredOus();
    const accountIds = params.moduleRunnerParameters.configs.accountsConfig.getActiveAccountIds(ignoredOus);
    const credentials = params.moduleRunnerParameters.managementAccountCredentials;

    CreateStackPolicyModule.logger.debug(`Active accounts for stack policy: ${accountIds.join(', ')}`);

    const props: IStackPolicyHandlerParameter = {
      enabled: params.moduleRunnerParameters.configs.globalConfig.stackPolicy.enable,
      regions: params.moduleRunnerParameters.configs.globalConfig.enabledRegions ?? [],
      managementAccountAccessRole: params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole,
      protectedTypes: params.moduleRunnerParameters.configs.globalConfig.stackPolicy.protectedTypes ?? [],
      region: params.moduleRunnerParameters.globalRegion,
      partition: params.runnerParameters.partition,
      dryRun: params.runnerParameters.dryRun,
      solutionId: params.runnerParameters.solutionId,
      credentials,
      useExistingRole: params.runnerParameters.useExistingRoles,
      acceleratorPrefix: params.moduleRunnerParameters.resourcePrefixes.accelerator,
      accountIds,
      operation: OPERATION_NAME,
      moduleName: params.moduleItem.name,
    };

    return createStackPolicy(props);
  }
}

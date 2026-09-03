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
import { createStatusLogger } from '../../../../../@aws-lza/common/logger';
import { getRunnerTargetRegions } from '../../functions';
import { getCredentials, processModulePromises } from '../../../../../@aws-lza/common/functions';
import { ModuleParams } from '../../../models/types';
import {
  manageSecurityHubAutomationRules,
  ISecurityHubManageAutomationRulesParameter,
} from '../../../../../@aws-lza/index';
import { createLogger } from '@aws-accelerator/utils';

const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

export const MESSAGES = {
  SKIP_NO_SECURITY_HUB: 'Security Hub is not enabled. Skipping module execution',
  SKIP_NO_AUTOMATION_RULES: 'Security Hub automation rules are not configured. Skipping module execution',
};

const OPERATION_NAME = 'manage-automation-rules';

/**
 * Module class to manage AWS Security Hub Automation Rules
 *
 * @description
 * This module manages Security Hub automation rules that automatically update findings based on specified criteria.
 * Automation rules help streamline security operations by automatically suppressing, updating, or enriching findings.
 */
export abstract class ManageAutomationRulesModule {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to execute Security Hub automation rules management
   *
   * @param params {@link ModuleParams}
   * @param stage Optional stage parameter
   * @returns Status message
   * @throws Error if one or more target regions failed to manage automation rules; the message carries every region's status
   */
  public static async execute(params: ModuleParams): Promise<string> {
    if (!params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.securityHub.enable) {
      statusLogger.info(MESSAGES.SKIP_NO_SECURITY_HUB);
      return MESSAGES.SKIP_NO_SECURITY_HUB;
    }

    const automationRulesConfig =
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.securityHub.automationRules;
    if (!automationRulesConfig || automationRulesConfig.length === 0) {
      statusLogger.info(MESSAGES.SKIP_NO_AUTOMATION_RULES);
      return MESSAGES.SKIP_NO_AUTOMATION_RULES;
    }

    statusLogger.info(`Module ${params.moduleItem.name} execution started`);

    const delegatedAdminAccountId: string = params.moduleRunnerParameters.configs.accountsConfig.getAccountId(
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.delegatedAdminAccount,
    );

    const runnerTargetRegions: string[] = getRunnerTargetRegions(
      params.moduleRunnerParameters.configs.globalConfig.enabledRegions,
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.securityHub.excludeRegions,
    );

    const delegatedAdminAccountCredentials = await getCredentials({
      accountId: delegatedAdminAccountId,
      region: params.moduleRunnerParameters.configs.globalConfig.homeRegion,
      solutionId: params.runnerParameters.solutionId,
      partition: params.runnerParameters.partition,
      assumeRoleName: params.moduleRunnerParameters.accountAccessRoleName,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
    });

    const statuses: string[] = [];
    const promises: Promise<string>[] = [];
    let failedRegionCount = 0;

    // Execute automation rules management for each target region in parallel
    for (const region of runnerTargetRegions) {
      promises.push(
        (async () => {
          try {
            const props: ISecurityHubManageAutomationRulesParameter = {
              configuration: {
                automationRules: automationRulesConfig.filter(rule => !(rule.excludeRegions ?? []).includes(region)),
              },
              region,
              partition: params.runnerParameters.partition,
              dryRun: params.runnerParameters.dryRun,
              solutionId: params.runnerParameters.solutionId,
              credentials: delegatedAdminAccountCredentials,
              operation: OPERATION_NAME,
              moduleName: params.moduleItem.name,
            };

            const result = await manageSecurityHubAutomationRules(props);
            ManageAutomationRulesModule.logger.info(
              `Successfully managed automation rules in region ${region}: ${result}`,
            );
            return `[Region: ${region}] ${result}`;
          } catch (error) {
            const errorMessage = `Failed to manage automation rules in region ${region}: ${error instanceof Error ? error.message : String(error)}`;
            ManageAutomationRulesModule.logger.error(errorMessage);
            failedRegionCount++;
            return `[Region: ${region}] ${errorMessage}`;
          }
        })(),
      );
    }

    await processModulePromises(
      params.moduleItem.name,
      promises,
      statuses,
      params.runnerParameters.maxConcurrentExecution,
    );

    const results = statuses.join('\n');

    if (failedRegionCount > 0) {
      const failureMessage = `Module ${params.moduleItem.name} failed to manage automation rules in ${failedRegionCount} of ${runnerTargetRegions.length} region(s): ${results}`;
      statusLogger.error(failureMessage);
      throw new Error(failureMessage);
    }

    statusLogger.info(`Module ${params.moduleItem.name} execution completed, results: ${results}`);

    return results;
  }
}

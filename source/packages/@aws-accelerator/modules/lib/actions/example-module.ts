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
import { createLogger } from '../../../../@aws-lza/common/logger';
import { getRunnerTargetRegions } from '../functions';
import { DeploymentTargets } from '@aws-accelerator/config/lib/common';
import { ListMembersCommand, SecurityHubClient } from '@aws-sdk/client-securityhub';
import { throttlingBackOff } from '../../../../@aws-lza/common/throttle';
import { getCredentials } from '../../../../@aws-lza/common/functions';
import { IAssumeRoleCredential } from '../../../../@aws-lza/common/resources';
import { ModuleParams } from '../../models/types';

/**
 * Abstract class to provide example of any module with cross account access
 *
 * @description
 * This is a boiler plate code to create baseline for any new module integration with Accelerator pipeline
 */
export abstract class ExampleModule {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to invoke example module
   *
   * @description
   * This is a boiler plate code to create baseline for any new module integration with Accelerator pipeline
   * Here it is using SecurityHub service integration
   * @param params {@link ModuleParams}
   * @returns status string
   */
  public static async execute(params: ModuleParams, stage?: string): Promise<string> {
    ExampleModule.logger.info(
      `Module ${params.moduleItem.name} execution started on ${ExampleModule.formatDate(new Date())}`,
    );

    if (!params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.securityHub.enable) {
      const status = `Security Hub is not enabled. Skipping module execution`;
      ExampleModule.logger.info(status);
      return status;
    }

    ExampleModule.logger.info(`Security Hub is enabled. Accelerator will configure AWS Security Hub`);

    const statuses: string[] = [];

    statuses.push(await ExampleModule.executeDelegatedAdminAction(params, stage));

    statuses.push(await ExampleModule.executeCreateMembersAction(params, stage));

    ExampleModule.logger.info(
      `Module ${params.moduleItem.name} execution completed on ${ExampleModule.formatDate(new Date())}`,
    );

    return statuses.join('\n');
  }

  /**
   * Function to execute delegated admin action for Example module
   * @param params {@link ModuleParams}
   * @returns status string
   */
  private static async executeDelegatedAdminAction(params: ModuleParams, stage?: string): Promise<string> {
    const statuses: string[] = [];
    const promises: Promise<string>[] = [];

    const managementAccountName: string =
      params.moduleRunnerParameters.configs.accountsConfig.getManagementAccount().name;

    const runnerTargetRegions: string[] = getRunnerTargetRegions(
      params.moduleRunnerParameters.configs.globalConfig.enabledRegions,
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.securityHub.excludeRegions,
    );

    for (const runnerTargetRegion of runnerTargetRegions) {
      promises.push(
        ExampleModule.sleepAndReturn(
          `[Stage:${stage}/Module:${
            params.moduleItem.name
          }/Action:DelegatedAdmin/Account:${managementAccountName}/Region:${runnerTargetRegion}]:StartTime:${ExampleModule.formatDate(
            new Date(),
          )} -> To set delegated admin account to ${
            params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.delegatedAdminAccount
          }`,
        ),
      );
    }

    if (promises.length > 0) {
      statuses.push(...(await Promise.all(promises)));
    }

    return statuses.join('\n');
  }

  /**
   * Function to execute CreateMembers action for example nodule
   * @param params {@link ModuleParams}
   * @returns status string
   */
  private static async executeCreateMembersAction(params: ModuleParams, stage?: string): Promise<string> {
    const statuses: string[] = [];
    const promises: Promise<string>[] = [];

    const delegatedAdminAccountName: string =
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.delegatedAdminAccount;

    const delegatedAdminAccountId: string = params.moduleRunnerParameters.configs.accountsConfig.getAccountId(
      params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.delegatedAdminAccount,
    );

    const memberAccountIds: string[] =
      params.moduleRunnerParameters.configs.accountsConfig.getAccountIdsFromDeploymentTarget(
        params.moduleRunnerParameters.configs.securityConfig.centralSecurityServices.securityHub
          .deploymentTargets as DeploymentTargets,
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
      assumeRoleName: params.moduleRunnerParameters.configs.globalConfig.managementAccountAccessRole,
    });

    for (const runnerTargetRegion of runnerTargetRegions) {
      promises.push(
        ExampleModule.mockAction(
          delegatedAdminAccountName,
          runnerTargetRegion,
          delegatedAdminAccountCredentials!,
          `[Stage:${stage}/Module:${
            params.moduleItem.name
          }/Action:CreateMembers/Account:${delegatedAdminAccountName}/Region:${runnerTargetRegion}]:StartTime:${ExampleModule.formatDate(
            new Date(),
          )} -> To add member account for account id ${memberAccountIds.join(',')}`,
        ),
      );
    }

    if (promises.length > 0) {
      statuses.push(...(await Promise.all(promises)));
    }

    return statuses.join('\n');
  }

  /**
   * Function to format date
   * @param date {@link Date}
   * @returns string
   */
  private static formatDate(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, 23);
  }

  /**
   * Function to perform async operation for example module
   *
   * @description
   * This is a boiler plate code to create baseline for any new module integration with Accelerator pipeline
   * Here it is using SecurityHub service SDK to perform cross account operation
   * @param accountName string
   * @param region string
   * @param credentials {@link IAssumeRoleCredential}
   * @param message string
   * @returns status string
   */
  private static async mockAction(
    accountName: string,
    region: string,
    credentials: IAssumeRoleCredential,
    message: string,
  ): Promise<string> {
    const client = new SecurityHubClient({ region, credentials });
    const response = await throttlingBackOff(() => client.send(new ListMembersCommand({})));

    ExampleModule.logger.info(`From ${accountName} account region ${region}, current member accounts are`);
    for (const member of response.Members ?? []) {
      ExampleModule.logger.info(`Account id:${member.AccountId} -> Status: ${member.MemberStatus}\n`);
    }

    return new Promise(resolve => {
      setTimeout(() => {
        resolve(`${message}`);
      }, 2000);
    });
  }

  /**
   * Function to sleep and return to perform async operation for example module
   * @param message string
   * @returns status string
   */
  private static async sleepAndReturn(message: string): Promise<string> {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(`${message}`);
      }, 2000);
    });
  }
}

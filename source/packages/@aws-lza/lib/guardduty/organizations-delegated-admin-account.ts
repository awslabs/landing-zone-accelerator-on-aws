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
  BadRequestException,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  GuardDutyClient,
} from '@aws-sdk/client-guardduty';

import path from 'node:path';
import { createLogger } from '../common/logger';
import { getOrganizationAdminAccountId } from './functions';
import { executeApi, waitUntil } from '../common/utility';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Abstract class for managing Amazon GuardDuty delegated administrator accounts
 */
export abstract class OrganizationsDelegatedAdminAccount {
  /**
   * Disables a delegated administrator account for GuardDuty organization management
   * @param client - GuardDuty client instance
   * @param dryRun - Whether to perform dry run without making changes
   * @param delegatedAdminAccountId - Account ID to disable as delegated admin
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when admin account is disabled
   */
  public static async disableOrganizationAdminAccount(
    client: GuardDutyClient,
    dryRun: boolean,
    delegatedAdminAccountId: string,
    logPrefix: string,
  ): Promise<void> {
    const commandName = 'DisableOrganizationAdminAccountCommand';
    const parameters = { AdminAccountId: delegatedAdminAccountId };
    if (dryRun) {
      logger.dryRun(commandName, parameters, logPrefix);
      return;
    }

    try {
      await executeApi(
        commandName,
        parameters,
        () => client.send(new DisableOrganizationAdminAccountCommand(parameters)),
        logger,
        logPrefix,
      );
    } catch (error: unknown) {
      if (
        error instanceof BadRequestException &&
        error.message?.includes('delegated administrator account has not been enabled')
      ) {
        logger.info(`Delegated admin is no longer registered, skipping organization admin disable.`, logPrefix);
        return;
      }
      throw error;
    }

    logger.info(
      `Waiting for confirmation that ${delegatedAdminAccountId} was removed as GuardDuty Organization Admin.`,
      logPrefix,
    );
    await waitUntil(
      async () => {
        return (await getOrganizationAdminAccountId(client, logPrefix)) !== delegatedAdminAccountId;
      },
      `Could not get confirmation that ${delegatedAdminAccountId} was removed as GuardDuty Organization Admin`,
      logger,
      logPrefix,
    );
  }

  /**
   * Enables a delegated administrator account for GuardDuty organization managements
   * @param client - GuardDuty client instance
   * @param dryRun - Whether to perform dry run without making changes
   * @param delegatedAdminAccountId - Account ID to enable as delegated admin
   * @param logPrefix - Prefix for logging messages
   * @returns Promise the resolves when the admin account is enabled
   */
  public static async enableOrganizationAdminAccount(
    client: GuardDutyClient,
    dryRun: boolean,
    delegatedAdminAccountId: string,
    logPrefix: string,
  ): Promise<void> {
    logger.info(`Setting GuardDuty Organization Admin Account to ${delegatedAdminAccountId}`, logPrefix);

    const commandName = 'EnableOrganizationAdminAccountCommand';
    const parameters = { AdminAccountId: delegatedAdminAccountId };
    if (dryRun) {
      logger.dryRun(commandName, parameters, logPrefix);
      return;
    }
    await executeApi(
      commandName,
      parameters,
      () => client.send(new EnableOrganizationAdminAccountCommand(parameters)),
      logger,
      logPrefix,
    );
    logger.info(
      `Waiting for confirmation that ${delegatedAdminAccountId} was added as GuardDuty Organization Admin.`,
      logPrefix,
    );
    await waitUntil(
      async () => {
        return (await getOrganizationAdminAccountId(client, logPrefix)) === delegatedAdminAccountId;
      },
      `Could not get confirmation that ${delegatedAdminAccountId} was added as GuardDuty Organization Admin`,
      logger,
      logPrefix,
    );
  }
}

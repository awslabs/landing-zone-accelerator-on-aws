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

/**
 * @fileoverview Amazon Macie Core Functions - Basic Macie service operations
 *
 * Provides core Amazon Macie service operations including enabling, disabling,
 * status checking, and administrative account management. These functions handle
 * the fundamental Macie API operations with proper error handling and validation.
 *
 * Key capabilities:
 * - Macie service enablement and disablement
 * - Service status validation and monitoring
 * - Organization admin account listing
 * - Asynchronous operation completion waiting
 * - Comprehensive error handling for Macie operations
 */

import {
  AccessDeniedException,
  AdminAccount,
  DisableMacieCommand,
  EnableMacieCommand,
  GetMacieSessionCommand,
  Macie2Client,
  MacieStatus,
  paginateListOrganizationAdminAccounts,
} from '@aws-sdk/client-macie2';
import { executeApi, waitUntil } from '../common/utility';

import path from 'path';
import { createLogger } from '../common/logger';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Enables Amazon Macie service in the current account and region
 * @param client - Macie2 client instance
 * @param dryRun - Whether to perform dry run without making changes
 * @param logPrefix - Prefix for logging messages
 * @returns Promise that resolves when Macie is enabled
 */
export async function enableMacie(client: Macie2Client, dryRun: boolean, logPrefix: string): Promise<void> {
  const commandName = 'EnableMacieCommand';
  const parameters = { status: MacieStatus.ENABLED };
  if (dryRun) {
    logger.dryRun(commandName, parameters, logPrefix);
    return;
  }

  await executeApi(commandName, parameters, () => client.send(new EnableMacieCommand(parameters)), logger, logPrefix);

  logger.info(`Waiting for Macie to be enabled`, logPrefix);

  waitUntil(() => {
    return isMacieEnabled(client, logPrefix);
  }, 'Could not get confirmation that macie was enabled');
}

/**
 * Checks if Amazon Macie is enabled in the current account and region
 * @param client - Macie2 client instance
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to true if Macie is enabled
 */
export async function isMacieEnabled(client: Macie2Client, logPrefix: string): Promise<boolean> {
  try {
    const response = await executeApi(
      'GetMacieSessionCommand',
      {},
      () => client.send(new GetMacieSessionCommand({})),
      logger,
      logPrefix,
      [AccessDeniedException],
    );
    return response.status === MacieStatus.ENABLED;
  } catch (error: unknown) {
    // When Macie is not enabled, throws an AccessDeniedException
    if (error instanceof AccessDeniedException) {
      return false;
    }
    throw error;
  }
}

/**
 * Disables Amazon Macie service in the current account and region
 * @param client - Macie2 client instance
 * @param dryRun - Whether to perform dry run without making changes
 * @param logPrefix - Prefix for logging messages
 * @returns Promise that resolves when Macie is disabled
 */
export async function disableMacie(client: Macie2Client, dryRun: boolean, logPrefix: string): Promise<void> {
  const commandName = 'DisableMacieCommand';
  const parameters = {};
  if (dryRun) {
    logger.dryRun(commandName, parameters, logPrefix);
    return;
  }

  await executeApi(commandName, parameters, () => client.send(new DisableMacieCommand(parameters)), logger, logPrefix);
}

/**
 * Lists all organization admin accounts for Amazon Macie
 * @param client - Macie2 client instance
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to array of admin accounts
 */
export async function listAdminAccounts(client: Macie2Client, logPrefix: string): Promise<AdminAccount[]> {
  const adminAccounts: AdminAccount[] = [];
  const commandName = 'paginateListOrganizationAdminAccounts';
  const parameters = {};
  logger.commandExecution(commandName, parameters, logPrefix);
  const paginator = paginateListOrganizationAdminAccounts({ client }, {});
  for await (const page of paginator) {
    for (const account of page.adminAccounts ?? []) {
      adminAccounts.push(account);
    }
  }
  logger.commandSuccess(commandName, parameters, logPrefix);
  return adminAccounts;
}

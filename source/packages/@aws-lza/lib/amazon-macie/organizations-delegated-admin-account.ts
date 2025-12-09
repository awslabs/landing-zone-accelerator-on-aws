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
 * @fileoverview Amazon Macie Delegated Administrator Management - Organization admin account operations
 *
 * Provides comprehensive management of delegated administrator accounts for Amazon Macie
 * in AWS Organizations. Handles the lifecycle of delegated admin accounts including
 * enablement, disablement, and status validation with proper error handling.
 *
 * Key capabilities:
 * - Delegated administrator account enablement and disablement
 * - Admin account status validation and monitoring
 * - Organization admin account discovery and management
 * - Asynchronous operation completion waiting
 * - Comprehensive error handling for admin operations
 */

import path from 'path';
import {
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  Macie2Client,
  MacieStatus,
} from '@aws-sdk/client-macie2';
import { executeApi, waitUntil } from '../common/utility';
import { MODULE_EXCEPTIONS } from '../common/types';

import { listAdminAccounts } from './functions';
import { createLogger } from '../common/logger';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Abstract class for managing Amazon Macie delegated administrator accounts
 */
export abstract class OrganizationsDelegatedAdminAccount {
  /**
   * Disables a delegated administrator account for Macie organization management
   * @param client - Macie2 client instance
   * @param dryRun - Whether to perform dry run without making changes
   * @param delegatedAdminAccountId - Account ID to disable as delegated admin
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when admin account is disabled
   */
  public static async disableOrganizationAdminAccount(
    client: Macie2Client,
    dryRun: boolean,
    delegatedAdminAccountId: string,
    logPrefix: string,
  ): Promise<void> {
    const commandName = 'DisableOrganizationAdminAccountCommand';
    const parameters = { adminAccountId: delegatedAdminAccountId };
    if (dryRun) {
      logger.dryRun(commandName, parameters, logPrefix);
      return;
    }
    await executeApi(
      commandName,
      parameters,
      () => client.send(new DisableOrganizationAdminAccountCommand(parameters)),
      logger,
      logPrefix,
    );

    logger.info(
      `Waiting for confirmation that ${delegatedAdminAccountId} was removed as Macie Organization Admin.`,
      logPrefix,
    );
    await waitUntil(async () => {
      const accounts = await listAdminAccounts(client, logPrefix);
      for (const account of accounts) {
        if (account.status === MacieStatus.ENABLED || account.accountId === delegatedAdminAccountId) {
          return false;
        }
      }
      return true;
    }, `Could not get confirmation that ${delegatedAdminAccountId} was removed as Macie Organization Admin`);
  }

  /**
   * Enables a delegated administrator account for Macie organization management
   * @param client - Macie2 client instance
   * @param dryRun - Whether to perform dry run without making changes
   * @param delegatedAdminAccountId - Account ID to enable as delegated admin
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when admin account is enabled
   */
  public static async enableOrganizationAdminAccount(
    client: Macie2Client,
    dryRun: boolean,
    delegatedAdminAccountId: string,
    logPrefix: string,
  ): Promise<void> {
    logger.info(`Setting Macie Organization Admin Account to ${delegatedAdminAccountId}`, logPrefix);

    const commandName = 'EnableOrganizationAdminAccountCommand';
    const parameters = { adminAccountId: delegatedAdminAccountId };

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
      `Waiting for confirmation that Macie Organization Admin was set to ${delegatedAdminAccountId}`,
      logPrefix,
    );
    await waitUntil(async () => {
      return (
        (await OrganizationsDelegatedAdminAccount.getOrganizationAdminAccountId(client, logPrefix)) ===
        delegatedAdminAccountId
      );
    }, `Could not get confirmation that Macie Organization admin was set to ${delegatedAdminAccountId}`);
  }

  /**
   * Retrieves the current organization admin account ID for Macie
   * @param client - Macie2 client instance
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to admin account ID or undefined if none set
   * @throws Error if multiple enabled admin accounts are found
   */
  public static async getOrganizationAdminAccountId(
    client: Macie2Client,
    logPrefix: string,
  ): Promise<string | undefined> {
    const adminAccounts = await listAdminAccounts(client, logPrefix);
    const enabledAccounts = adminAccounts
      .filter(account => account.status === MacieStatus.ENABLED)
      .map(account => account.accountId)
      .filter((id): id is string => id !== undefined);
    if (enabledAccounts.length > 1) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListOrganizationAdminAccountsCommand returned more than one enabled admin account`,
      );
    }
    if (enabledAccounts.length === 0) {
      return undefined;
    }
    return enabledAccounts[0];
  }
}

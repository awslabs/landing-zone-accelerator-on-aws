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
 * @fileoverview Amazon Macie Member Management - Organization member account operations
 *
 * Provides comprehensive member account management for Amazon Macie in AWS Organizations.
 * Handles member account creation, deletion, association, and organization-wide auto-enablement
 * configuration with proper state management and error handling.
 *
 * Key capabilities:
 * - Organization member account enablement and disablement
 * - Member account lifecycle management (create, delete, associate)
 * - Organization auto-enablement configuration
 * - Member relationship status handling
 * - Bulk member operations with proper sequencing
 */

import path from 'path';
import {
  AccessDeniedException,
  CreateMemberCommand,
  DeleteMemberCommand,
  DescribeOrganizationConfigurationCommand,
  DisassociateMemberCommand,
  Macie2Client,
  Member,
  paginateListMembers,
  RelationshipStatus,
  UpdateOrganizationConfigurationCommand,
} from '@aws-sdk/client-macie2';
import { Account } from '@aws-sdk/client-organizations';
import { createLogger } from '../common/logger';
import { executeApi } from '../common/utility';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Abstract class for managing Amazon Macie member accounts in AWS Organizations
 */
export abstract class MacieMembers {
  /**
   * Enables Macie for all organization accounts and configures auto-enablement
   * @param client - Macie2 client instance
   * @param organizationAccounts - List of organization accounts to enable
   * @param adminAccountId - Administrator account ID
   * @param dryRun - Whether to perform dry run without making changes
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when all accounts are enabled
   */
  public static async enable(
    client: Macie2Client,
    organizationAccounts: Account[],
    adminAccountId: string,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<void> {
    const existingMembers = await this.listMembers(client, logPrefix, dryRun);

    for (const account of organizationAccounts) {
      if (!account.Id || account.Id === adminAccountId) continue;

      const existingMember = existingMembers.find(member => member.accountId === account.Id);

      if (existingMember?.relationshipStatus === RelationshipStatus.Removed) {
        if (dryRun) {
          logger.dryRun('DeleteMemberCommand', { id: account.Id }, logPrefix);
        } else {
          await executeApi(
            'DeleteMemberCommand',
            { id: account.Id },
            () => client.send(new DeleteMemberCommand({ id: account.Id })),
            logger,
            logPrefix,
          );
        }
      }

      if (!existingMember || existingMember.relationshipStatus === RelationshipStatus.Removed) {
        if (dryRun) {
          logger.dryRun('CreateMemberCommand', { accountId: account.Id, email: account.Email }, logPrefix);
        } else {
          await executeApi(
            'CreateMemberCommand',
            { accountId: account.Id, email: account.Email },
            () =>
              client.send(
                new CreateMemberCommand({
                  account: { accountId: account.Id!, email: account.Email! },
                }),
              ),
            logger,
            logPrefix,
          );
        }
      }
    }

    const autoEnabled = await this.isOrganizationAutoEnabled(client, logPrefix);
    if (!autoEnabled) {
      if (dryRun) {
        logger.dryRun('UpdateOrganizationConfigurationCommand', { autoEnable: true }, logPrefix);
      } else {
        await executeApi(
          'UpdateOrganizationConfigurationCommand',
          { autoEnable: true },
          () => client.send(new UpdateOrganizationConfigurationCommand({ autoEnable: true })),
          logger,
          logPrefix,
        );
      }
    }
  }

  /**
   * Disables Macie for all organization members and disables auto-enablement
   * @param client - Macie2 client instance
   * @param organizationAccounts - List of organization accounts
   * @param adminAccountId - Administrator account ID
   * @param dryRun - Whether to perform dry run without making changes
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when all members are disabled
   */
  public static async disable(
    client: Macie2Client,
    organizationAccounts: Account[],
    adminAccountId: string,
    dryRun: boolean,
    logPrefix: string,
  ): Promise<void> {
    const existingMembers = await this.listMembers(client, logPrefix, dryRun);
    const orgAccountCount = organizationAccounts.filter(acc => acc.Id !== adminAccountId).length;
    const existingMemberCount = existingMembers.filter(member => member.accountId !== adminAccountId).length;

    logger.info(
      `Found ${existingMemberCount} existing Macie members and ${orgAccountCount} organization accounts (excluding admin). All ${existingMemberCount} members will be removed.`,
      logPrefix,
    );

    for (const member of existingMembers) {
      if (!member.accountId || member.accountId === adminAccountId) continue;

      if (dryRun) {
        logger.dryRun('DisassociateMemberCommand', { id: member.accountId }, logPrefix);
        logger.dryRun('DeleteMemberCommand', { id: member.accountId }, logPrefix);
      } else {
        await executeApi(
          'DisassociateMemberCommand',
          { id: member.accountId },
          () => client.send(new DisassociateMemberCommand({ id: member.accountId })),
          logger,
          logPrefix,
        );

        await executeApi(
          'DeleteMemberCommand',
          { id: member.accountId },
          () => client.send(new DeleteMemberCommand({ id: member.accountId })),
          logger,
          logPrefix,
        );
      }
    }

    const autoEnabled = await this.isOrganizationAutoEnabled(client, logPrefix);
    if (autoEnabled) {
      if (dryRun) {
        logger.dryRun('UpdateOrganizationConfigurationCommand', { autoEnable: false }, logPrefix);
      } else {
        await executeApi(
          'UpdateOrganizationConfigurationCommand',
          { autoEnable: false },
          () => client.send(new UpdateOrganizationConfigurationCommand({ autoEnable: false })),
          logger,
          logPrefix,
        );
      }
    }
  }

  /**
   * Lists all Macie members including associated and disassociated accounts
   * @param client - Macie2 client instance
   * @param logPrefix - Prefix for logging messages
   * @param dryRun - Whether this is a dry run operation
   * @returns Promise resolving to array of member accounts
   */
  private static async listMembers(client: Macie2Client, logPrefix: string, dryRun: boolean): Promise<Member[]> {
    const members: Member[] = [];
    const commandName = 'paginateListMembers';
    const parameters = { onlyAssociated: 'false' };

    if (dryRun) {
      logger.dryRun(commandName, parameters, logPrefix);
      return members;
    }

    logger.commandExecution(commandName, parameters, logPrefix);
    const paginator = paginateListMembers({ client }, { onlyAssociated: 'false' });
    for await (const page of paginator) {
      for (const member of page.members ?? []) {
        members.push(member);
      }
    }
    logger.commandSuccess(commandName, parameters, logPrefix);

    return members;
  }

  /**
   * Checks if organization auto-enablement is configured for Macie
   * @param client - Macie2 client instance
   * @param logPrefix - Prefix for logging messages
   * @returns Promise resolving to true if auto-enablement is active
   */
  private static async isOrganizationAutoEnabled(client: Macie2Client, logPrefix: string): Promise<boolean> {
    try {
      const response = await executeApi(
        'DescribeOrganizationConfigurationCommand',
        {},
        () => client.send(new DescribeOrganizationConfigurationCommand({})),
        logger,
        logPrefix,
        [AccessDeniedException],
      );
      return response.autoEnable ?? false;
    } catch (error: unknown) {
      if (error instanceof AccessDeniedException) {
        return false;
      }
      throw error;
    }
  }
}

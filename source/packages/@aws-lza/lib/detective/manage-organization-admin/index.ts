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
import { delay, generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';
import { createLogger } from '../../../common/logger';
import { AcceleratorModuleName } from '../../../common/resources';
import {
  IDetectiveManageOrganizationAdminConfiguration,
  IDetectiveManageOrganizationAdminModule,
  IDetectiveManageOrganizationAdminParameter,
} from '../../../interfaces/detective/manage-organization-admin';
import {
  Administrator,
  DetectiveClient,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  ListOrganizationAdminAccountsCommand,
  ListOrganizationAdminAccountsCommandOutput,
} from '@aws-sdk/client-detective';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { throttlingBackOff } from '../../../common/throttle';

/**
 * DetectiveManageOrganizationAdminModule manages AWS Detective organization administrator accounts.
 *
 * This module provides functionality to enable or disable AWS Detective organization admin accounts
 * within an AWS Organizations environment. It handles the configuration of delegated administrator
 * accounts for AWS Detective service at the organization level.
 *
 * @implements {IDetectiveManageOrganizationAdminModule}
 */
export class DetectiveManageOrganizationAdminModule implements IDetectiveManageOrganizationAdminModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Main handler method for managing Detective organization admin accounts.
   *
   * @param props {@link IDetectiveManageOrganizationAdminParameter}
   * @returns Promise resolving to a status message describing the operation result
   * @throws {Error} When invalid input is provided or AWS API calls fail
   */
  public async handler(props: IDetectiveManageOrganizationAdminParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_DETECTIVE, props);
    const region = props.region;
    const client = new DetectiveClient({
      region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const currentAdminAccountId = await this.getOrganizationAdmin(client);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        props.configuration,
        currentAdminAccountId,
      );
    }

    return this.setRequestedConfiguration(client, props.configuration, currentAdminAccountId);
  }

  /**
   * Sets the requested Detective organization admin configuration.
   *
   * This method handles both enabling and disabling Detective organization admin accounts
   * based on the provided configuration.
   *
   * @param client - Configured AWS Detective client instance
   * @param config {@link IDetectiveManageOrganizationAdminConfiguration}}
   * @param currentAdminAccountId - Currently configured admin account ID, if any
   * @returns Promise resolving to a status message or immediate status message
   * @throws {Error} When attempting to set multiple admin accounts or remove wrong account
   */
  setRequestedConfiguration(
    client: DetectiveClient,
    config: IDetectiveManageOrganizationAdminConfiguration,
    currentAdminAccountId: string | undefined,
  ): string | PromiseLike<string> {
    if (config.enable) {
      if (currentAdminAccountId === config.accountId) {
        return `Account ${config.accountId} is already the Detective Organization Admin`;
      }
      if (currentAdminAccountId && currentAdminAccountId !== config.accountId) {
        throw new Error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with ID ${currentAdminAccountId} is already set as the Detective Organization Admin, cannot additionally assign ${config.accountId}`,
        );
      }
      return this.enableOrganizationAdminAccount(client, config.accountId);
    } else {
      if (!currentAdminAccountId) {
        return `There is no Organization Admin currently set, so AWS Account with ID ${config.accountId} was not removed`;
      }
      if (currentAdminAccountId !== config.accountId) {
        throw new Error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${config.accountId} as Detective Organization Admin because the current Admin is AWS Account with ID ${currentAdminAccountId}`,
        );
      }
      return this.disableOrganizationAdminAccount(client, config.accountId);
    }
  }

  /**
   * Generates a dry-run response message without performing actual operations.
   *
   * This method simulates the operation and returns a message describing what would
   * happen if the operation were to be executed.
   *
   * @param moduleName - Name of the module for logging purposes
   * @param operation - The operation type being simulated
   * @param config {@link IDetectiveManageOrganizationAdminConfiguration}
   * @param currentAdminAccountId - Currently configured admin account ID, if any
   * @returns Formatted dry-run response message
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    config: IDetectiveManageOrganizationAdminConfiguration,
    currentAdminAccountId?: string,
  ): string {
    if (config.enable) {
      if (currentAdminAccountId === config.accountId) {
        return generateDryRunResponse(
          moduleName,
          operation,
          `Account ${config.accountId} is already the Detective Organization Admin`,
        );
      }
      if (currentAdminAccountId && currentAdminAccountId !== config.accountId) {
        return generateDryRunResponse(
          moduleName,
          operation,
          `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the Detective Organization Admin account is already set to ${currentAdminAccountId}, cannot additionally assign ${config.accountId}`,
        );
      }
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will enable Detective Organization Admin account ${config.accountId}`,
      );
    } else {
      if (!currentAdminAccountId) {
        return generateDryRunResponse(
          moduleName,
          operation,
          `There is no Organization Admin currently set, so AWS Account ${config.accountId} will not need to be removed`,
        );
      }
      if (currentAdminAccountId !== config.accountId) {
        return generateDryRunResponse(
          moduleName,
          operation,
          `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because Detecive Organization Admin is set to ${currentAdminAccountId}, which differs from the expected ${config.accountId}`,
        );
      }
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will disable Detective Organization Admin account ${config.accountId}`,
      );
    }
  }

  /**
   * Retrieves the current Detective organization administrator account ID.
   *
   * This method queries AWS Detective to find the currently configured organization
   * administrator account and ensures only one exists.
   *
   * @param detectiveClient - Configured AWS Detective client instance
   * @returns Promise resolving to the admin account ID if one exists, undefined otherwise
   * @throws {Error} When multiple admin accounts are found (unexpected state)
   */
  private async getOrganizationAdmin(detectiveClient: DetectiveClient): Promise<string | undefined> {
    const adminAccounts: Administrator[] = [];
    let nextToken: string | undefined = undefined;
    do {
      const page: ListOrganizationAdminAccountsCommandOutput = await detectiveClient.send(
        new ListOrganizationAdminAccountsCommand({ NextToken: nextToken }),
      );
      for (const account of page.Administrators ?? []) {
        adminAccounts.push(account);
      }
      nextToken = page.NextToken;
    } while (nextToken);
    if (adminAccounts.length === 0) {
      return undefined;
    }
    if (adminAccounts.length > 1) {
      throw new Error('Multiple admin accounts for Detective in organization');
    }

    return adminAccounts[0].AccountId;
  }

  /**
   * Enables an AWS account as the Detective organization administrator.
   *
   * This method sets the specified AWS account as the Detective organization admin
   * with retry logic to handle service-linked role creation delays. It implements
   * exponential backoff for transient failures.
   *
   * @param client - Configured AWS Detective client instance
   * @param adminAccountId - AWS account ID to be enabled as organization admin
   * @returns Promise resolving to success message
   * @throws {Error} When the operation fails after all retry attempts or for non-retryable errors
   */
  private async enableOrganizationAdminAccount(client: DetectiveClient, adminAccountId: string): Promise<string> {
    const maxRetries = 5;
    const retryDelayMinutes = 1;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await throttlingBackOff(() =>
          client.send(new EnableOrganizationAdminAccountCommand({ AccountId: adminAccountId })),
        );
        break; // Success, exit retry loop
      } catch (error: unknown) {
        if (error instanceof Error) {
          // Check if this is the service-linked role creation error
          if (error.message.includes('service linked role cannot be created') && attempt < maxRetries) {
            await delay(retryDelayMinutes);
            continue; // Retry
          }
        }

        // If it's the last attempt or not a service-linked role error, throw the error
        throw error;
      }
    }

    return `Successfully set detective organization admin to account ${adminAccountId}.`;
  }

  /**
   * Disables an AWS account as the Detective organization administrator.
   *
   * This method removes the specified AWS account from the Detective organization
   * admin role.
   *
   * @param client - Configured AWS Detective client instance
   * @param adminAccountId - AWS account ID to be disabled as organization admin
   * @returns Promise resolving to success message
   * @throws {Error} When the AWS API call fails
   */
  private async disableOrganizationAdminAccount(client: DetectiveClient, adminAccountId: string): Promise<string> {
    try {
      await throttlingBackOff(() =>
        client.send(new DisableOrganizationAdminAccountCommand({ AccountId: adminAccountId })),
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `There was an "${error.message}" error when disabling detective organization admin account ${adminAccountId}`,
        );
      }
      throw error;
    }

    return `Successfully disabled detective organization admin account ${adminAccountId}.`;
  }
}

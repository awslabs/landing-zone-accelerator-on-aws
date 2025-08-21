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
  ISecurityHubManageOrganizationAdminConfiguration,
  ISecurityHubManageOrganizationAdminModule,
  ISecurityHubManageOrganizationAdminParameter,
} from '../../../interfaces/security-hub/manage-organization-admin';
import {
  AdminAccount,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  EnableSecurityHubCommand,
  paginateListOrganizationAdminAccounts,
  ResourceConflictException,
  SecurityHubClient,
} from '@aws-sdk/client-securityhub';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { throttlingBackOff } from '../../../common/throttle';

/**
 * SecurityHubManageOrganizationAdminModule class to manage AWS Security Hub Organization Admin
 */
export class SecurityHubManageOrganizationAdminModule implements ISecurityHubManageOrganizationAdminModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to manage Security Hub Organization Admin
   *
   * @param props {@link ISecurityHubManageOrganizationAdminParameter}
   * @returns Status message
   */
  public async handler(props: ISecurityHubManageOrganizationAdminParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_SECURITY_HUB, props);
    const client = new SecurityHubClient({
      region: props.region,
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
   * Function to simulate module operations
   *
   * @param moduleName Name of the module for logging
   * @param operation Operation type to simulate (enable/disable)
   * @param config {@link ISecurityHubManageOrganizationAdminConfiguration}
   * @param currentAdminAccountId Currently configured admin account ID, if it exists
   * @returns Dry-run response message
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    config: ISecurityHubManageOrganizationAdminConfiguration,
    currentAdminAccountId?: string,
  ): string {
    if (config.enable) {
      if (currentAdminAccountId === config.accountId) {
        return generateDryRunResponse(
          moduleName,
          operation,
          `AWS Account with ID ${config.accountId} is already the Security Hub Organization Admin`,
        );
      }
      if (currentAdminAccountId && currentAdminAccountId !== config.accountId) {
        return generateDryRunResponse(
          moduleName,
          operation,
          `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the Security Hub Organization Admin account is already set to ${currentAdminAccountId}, cannot additionally assign ${config.accountId}`,
        );
      }
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account with ID ${config.accountId} will be set as the Security Hub Organization Admin`,
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
          `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because Security Hub Organization Admin is set to ${currentAdminAccountId}, which differs from the expected ${config.accountId}`,
        );
      }
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will disable Security Hub Organization Admin account ${config.accountId}`,
      );
    }
  }

  /**
   * Function to set the requested Security Hub organization admin configuration
   *
   * @param client {@link SecurityHubClient}
   * @param config {@link ISecurityHubManageOrganizationAdminConfiguration}
   * @param currentAdminAccountId Currently configured admin account ID, if it exists
   */
  setRequestedConfiguration(
    client: SecurityHubClient,
    config: ISecurityHubManageOrganizationAdminConfiguration,
    currentAdminAccountId: string | undefined,
  ): string | PromiseLike<string> {
    if (config.enable) {
      if (currentAdminAccountId === config.accountId) {
        return `Account ${config.accountId} is already the Security Hub Organization Admin`;
      }
      if (currentAdminAccountId && currentAdminAccountId !== config.accountId) {
        throw new Error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Security Hub delegated admin is already set to ${currentAdminAccountId}, cannot additionally assign account ${config.accountId}`,
        );
      }
      return this.enableOrganizationAdminAccount(client, config.accountId);
    } else {
      if (!currentAdminAccountId) {
        return `There is no Security Hub Organization Admin currently set, so AWS Account with ID ${config.accountId} was not removed`;
      }
      if (currentAdminAccountId !== config.accountId) {
        throw new Error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${config.accountId} as Security Hub Organization Admin because the current Admin is AWS Account with ID ${currentAdminAccountId}`,
        );
      }
      return this.disableOrganizationAdminAccount(client, config.accountId);
    }
  }

  /**
   * Function to retrieve the current organization admin, if it exists
   *
   * @param client {@link SecurityHubClient}
   * @returns String if the organization admin exists, otherwise undefined
   */
  private async getOrganizationAdmin(client: SecurityHubClient): Promise<string | undefined> {
    const adminAccounts: AdminAccount[] = [];

    const paginator = paginateListOrganizationAdminAccounts({ client }, {});

    for await (const page of paginator) {
      if (page.AdminAccounts) {
        adminAccounts.push(...page.AdminAccounts);
      }
    }

    if (adminAccounts.length === 0) {
      return undefined;
    }
    if (adminAccounts.length > 1) {
      throw new Error('Multiple admin accounts for Security Hub in organization');
    }
    if (adminAccounts.length === 1 && adminAccounts[0].Status === 'DISABLE_IN_PROGRESS') {
      throw new Error(`Admin account ${adminAccounts[0].AccountId} is in ${adminAccounts[0].Status}`);
    }

    return adminAccounts[0].AccountId;
  }

  /**
   * Function to enable Security Hub
   *
   * @param client {@link SecurityHubClient}
   */
  private async enableSecurityHub(client: SecurityHubClient): Promise<void> {
    try {
      await throttlingBackOff(() => client.send(new EnableSecurityHubCommand({})));
    } catch (error: unknown) {
      if (error instanceof ResourceConflictException) {
        this.logger.warn(error.name + ': ' + error.message);
        return;
      }
      throw new Error(`Security Hub enable issue error message - ${error}`);
    }
  }

  private async enableOrganizationAdminAccount(client: SecurityHubClient, adminAccountId: string): Promise<string> {
    await this.enableSecurityHub(client);

    const maxRetries = 5;
    const retryDelayMinutes = 1;

    let retries = 0;
    while (retries <= maxRetries) {
      await delay(retryDelayMinutes);
      try {
        await throttlingBackOff(() =>
          client.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
        );
        break; // Success
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(
            `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${error.message}" error when setting the Security Hub Organization Admin account to ${adminAccountId}`,
          );
          retries = retries + 1;
        }
      }
    }

    return `Successfully set Security Hub Organization Admin to account ${adminAccountId}`;
  }

  /**
   * Function to disable the organization admin account
   * @param client {@link SecurityHubClient}
   * @param adminAccountId currently configured admin account id
   * @returns status message
   */
  private async disableOrganizationAdminAccount(client: SecurityHubClient, adminAccountId: string): Promise<string> {
    try {
      await throttlingBackOff(() =>
        client.send(new DisableOrganizationAdminAccountCommand({ AdminAccountId: adminAccountId })),
      );
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(
          `There was an "${error.message}" error when disabling Security Hub organization admin account ${adminAccountId}`,
        );
      }
      throw error;
    }

    return `Successfully disabled Security Hub organization admin account ${adminAccountId}`;
  }
}

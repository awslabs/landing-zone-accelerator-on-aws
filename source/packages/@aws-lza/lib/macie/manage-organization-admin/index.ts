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
  IMacieManageOrganizationAdminConfiguration,
  IMacieManageOrganizationAdminModule,
  IMacieManageOrganizationAdminParameter,
} from '../../../interfaces/macie/manage-organization-admin';
import {
  AccessDeniedException,
  AdminAccount,
  DisableOrganizationAdminAccountCommand,
  EnableMacieCommand,
  EnableOrganizationAdminAccountCommand,
  GetMacieSessionCommand,
  Macie2Client,
  MacieStatus,
  paginateListOrganizationAdminAccounts,
} from '@aws-sdk/client-macie2';
import { delay, generateDryRunResponse, getModuleDefaultParameters, setRetryStrategy } from '../../../common/functions';
import { AcceleratorModuleName } from '../../../common/resources';
import { throttlingBackOff } from '../../../common/throttle';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { createLogger } from '../../../common/logger';
import path from 'path';
import assert from 'assert';

/**
 * MacieManageOrganizationAdminModule class to manage Macie Organization Admin
 */
export class MacieManageOrganizationAdminModule implements IMacieManageOrganizationAdminModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to manage Macie Organization Admin
   *
   * @param props {@link IMacieManageOrganizationAdminParameter}
   * @returns status string
   */
  public async handler(props: IMacieManageOrganizationAdminParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_MACIE, props);
    const client = new Macie2Client({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });
    const isEnabled = await this.isMacieEnabled(client);
    const currentAdmin = isEnabled ? await this.getOrganizationAdmin(client) : undefined;

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        props.configuration,
        isEnabled,
        currentAdmin,
      );
    }
    if (!isEnabled) {
      await this.enableMacie(client);
    }
    return this.setRequestedConfiguration(client, props.configuration, currentAdmin);
  }

  /**
   * Function to get display for dry run
   * @param moduleName string
   * @param operation string
   * @param props {@link IMacieManageOrganizationAdminConfiguration}
   * @param macieIsEnabled boolean
   * @param currentAdmin string | undefined
   * @returns status string
   */
  getDryRunResponse(
    moduleName: string,
    operation: string,
    props: IMacieManageOrganizationAdminConfiguration,
    macieIsEnabled: boolean,
    currentAdmin?: string,
  ): string {
    if (props.enable && !currentAdmin) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account with ID ${props.accountId} will be set as the Macie Organization Admin`,
      );
    }
    if (props.enable && currentAdmin !== props.accountId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the Macie Organization Administrator is already set to ${currentAdmin}, cannot additionally assign ${props.accountId}`,
      );
    }
    if (props.enable && currentAdmin === props.accountId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account with ID ${props.accountId} is already the Macie Organization Administrator`,
      );
    }
    if (!props.enable && !macieIsEnabled) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Macie is not enabled, so there is no Organization Admin currently set, so AWS Account with ID ${props.accountId} will not need to be removed`,
      );
    }
    if (!props.enable && !currentAdmin) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `There is no Organization Admin currently set, so AWS Account with ID ${props.accountId} will not need to be removed`,
      );
    }
    if (!props.enable && currentAdmin !== props.accountId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because AWS Account with ID ${currentAdmin} is currently set as the Macie Organization Admin, which differs from the expected account ${props.accountId}`,
      );
    }
    assert(!props.enable && currentAdmin === props.accountId);
    return generateDryRunResponse(
      moduleName,
      operation,
      `AWS Account with ID ${props.accountId} will be removed as Macie Organization Administrator`,
    );
  }

  /**
   * Function to set the requested configuration given the current macie state
   *
   * @param client {@link Macie2Client}
   * @param config {@link IMacieManageOrganizationAdminConfiguration}
   * @param macieIsEnabled boolean
   * @param currentAdmin string | null
   * @returns status string
   */
  async setRequestedConfiguration(
    client: Macie2Client,
    config: IMacieManageOrganizationAdminConfiguration,
    currentAdmin?: string,
  ): Promise<string> {
    if (config.enable && !currentAdmin) {
      return await this.setOrganizationAdminAccount(client, config.accountId);
    }
    if (config.enable && currentAdmin !== config.accountId) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with ID ${currentAdmin} is already set as the Macie Organization Admin, cannot additionally assign ${config.accountId}`,
      );
    }
    if (config.enable && currentAdmin === config.accountId) {
      return `AWS Account with ID ${config.accountId} is already the Macie Organization Admin`;
    }
    if (!config.enable && !currentAdmin) {
      return `There is no Organization Admin currently set, so AWS Account with ID ${config.accountId} was not removed`;
    }
    if (!config.enable && currentAdmin !== config.accountId) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${config.accountId} as Macie Organization Admin because the current Admin is AWS Account with ID ${currentAdmin}`,
      );
    }
    assert(!config.enable && currentAdmin === config.accountId);
    return await this.removeOrganizationAdminAccount(client, config.accountId);
  }

  /**
   * Function to determine if macie is enabled for the current account's organization
   * @param client {@link Macie2Client}
   * @returns boolean true if macie is set up and enabled
   */
  private async isMacieEnabled(client: Macie2Client): Promise<boolean> {
    try {
      const response = await throttlingBackOff(() => client.send(new GetMacieSessionCommand({})));
      return response.status === MacieStatus.ENABLED;
    } catch (e: unknown) {
      // When Macie is not enabled, throws an AccessDeniedException
      if (e instanceof AccessDeniedException) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Function to enable macie
   *
   * @param client {@link Macie2Client}
   */
  async enableMacie(client: Macie2Client) {
    await client.send(
      new EnableMacieCommand({
        status: MacieStatus.ENABLED,
      }),
    );

    this.waitUntil(() => {
      return this.isMacieEnabled(client);
    }, 'Could not get confirmation that macie was enabled');
  }

  /**
   * Function to all admin accounts, enabled and disabling
   * @param client {@link Macie2Client}
   * @returns list of admin accounts
   */
  private async listAdminAccounts(client: Macie2Client): Promise<AdminAccount[]> {
    const adminAccounts: AdminAccount[] = [];

    const paginator = paginateListOrganizationAdminAccounts({ client }, {});
    try {
      for await (const page of paginator) {
        for (const account of page.adminAccounts ?? []) {
          adminAccounts.push(account);
        }
      }
    } catch (e: unknown) {
      if (e instanceof AccessDeniedException) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Could not run ListOrganizationAdminAccountsCommand because you must be a user of the management account`,
        );
      }
      throw e;
    }
    return adminAccounts;
  }

  /**
   * Function to get the current organization admin, if one exists
   * @param client {@link Macie2Client}
   * @returns string if there is one currently enabled organization admin, otherwise null
   */
  private async getOrganizationAdmin(client: Macie2Client): Promise<string | undefined> {
    const adminAccounts = await this.listAdminAccounts(client);
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

  /**
   * Function to try to set the organization admin account
   * @param client {@link Macie2Client}
   * @param account which account should be set as the organization admin
   * @returns status message
   */
  async setOrganizationAdminAccount(client: Macie2Client, account: string): Promise<string> {
    try {
      await throttlingBackOff(() =>
        client.send(new EnableOrganizationAdminAccountCommand({ adminAccountId: account })),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when setting the Macie Organization Admin to ${account}`,
        );
      }
      throw e;
    }

    await this.waitUntil(async () => {
      return (await this.getOrganizationAdmin(client)) === account;
    }, `Could not get confirmation that Macie Organization admin was set to ${account}`);

    return `Successfully set Macie Organization Admin to AWS Account with ID ${account}`;
  }

  /**
   * Function to try to remove the organization admin account
   * @param client {@link Macie2Client}
   * @param account which account should be removed from being the organization admin
   * @returns status message
   */
  async removeOrganizationAdminAccount(client: Macie2Client, account: string): Promise<string> {
    try {
      await throttlingBackOff(() =>
        client.send(new DisableOrganizationAdminAccountCommand({ adminAccountId: account })),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when removing ${account} as organization admin`,
        );
      }
      throw e;
    }

    await this.waitUntil(async () => {
      const toDisable = account;
      const accounts = await this.listAdminAccounts(client);
      for (const account of accounts) {
        if (account.status === MacieStatus.ENABLED || account.accountId === toDisable) {
          return false;
        }
      }
      return true;
    }, `Could not get confirmation that ${account} was removed as Macie Organization Admin`);
    return `Successfully removed AWS Account with ID ${account} as Macie Organization Admin`;
  }

  private async waitUntil(predicate: () => Promise<boolean>, error: string) {
    const retryLimit = 5;
    let retryCount = 0;
    const queryIntervalMinutes = 1;
    while (!(await predicate())) {
      await delay(queryIntervalMinutes);
      retryCount += 1;
      if (retryCount > retryLimit) {
        throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${error}`);
      }
    }
  }
}

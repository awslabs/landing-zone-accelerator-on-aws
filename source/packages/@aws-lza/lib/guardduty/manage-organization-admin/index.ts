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
  IGuardDutyManageOrganizationAdminConfiguration,
  IGuardDutyManageOrganizationAdminModule,
  IGuardDutyManageOrganizationAdminParameter,
} from '../../../interfaces/aws-guardduty/manage-organization-admin';
import {
  AdminAccount,
  CreateDetectorCommand,
  DisableOrganizationAdminAccountCommand,
  EnableOrganizationAdminAccountCommand,
  GetDetectorCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  ListOrganizationAdminAccountsCommand,
  DetectorStatus,
} from '@aws-sdk/client-guardduty';
import {
  generateDryRunResponse,
  getModuleDefaultParameters,
  setRetryStrategy,
  waitUntil,
} from '../../../common/functions';
import { AcceleratorModuleName } from '../../../common/resources';
import { throttlingBackOff } from '../../../common/throttle';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { createLogger } from '../../../common/logger';
import path from 'path';
import assert from 'assert';

/**
 * GuardDutyManageOrganizationAdminModule class to manage GuardDuty Organization Admin
 */
export class GuardDutyManageOrganizationAdminModule implements IGuardDutyManageOrganizationAdminModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to manage GuardDuty Organization Admin
   *
   * @param props {@link IGuardDutyManageOrganizationAdminParameter}
   * @returns status string
   */
  public async handler(props: IGuardDutyManageOrganizationAdminParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_GUARDDUTY, props);
    const client = new GuardDutyClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });
    const isEnabled = await this.isGuardDutyEnabled(client);
    const currentAdmin = await this.getOrganizationAdminAccount(client);

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
      await this.enableGuardDuty(client);
    }
    return this.setRequestedConfiguration(client, props.configuration, currentAdmin);
  }

  /**
   * Function to get display for dry run
   * @param moduleName string
   * @param operation string
   * @param props {@link IGuardDutyManageOrganizationAdminConfiguration}
   * @param guardDutyIsEnabled boolean
   * @param currentAdmin string | undefined
   * @returns status string
   */
  getDryRunResponse(
    moduleName: string,
    operation: string,
    props: IGuardDutyManageOrganizationAdminConfiguration,
    guardDutyIsEnabled: boolean,
    currentAdmin?: string,
  ): string {
    if (props.enable && !currentAdmin) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account with ID ${props.accountId} will be set as the GuardDuty Organization Admin`,
      );
    }
    if (props.enable && currentAdmin !== props.accountId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because the GuardDuty Organization Administrator is already set to ${currentAdmin}, cannot additionally assign ${props.accountId}`,
      );
    }
    if (props.enable && currentAdmin === props.accountId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account with ID ${props.accountId} is already the GuardDuty Organization Administrator`,
      );
    }
    if (!props.enable && !guardDutyIsEnabled) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `GuardDuty is not enabled, so there is no Organization Admin currently set, so AWS Account with ID ${props.accountId} will not need to be removed`,
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
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT} because AWS Account with ID ${currentAdmin} is currently set as the GuardDuty Organization Admin, which differs from the expected account ${props.accountId}`,
      );
    }
    assert(!props.enable && currentAdmin === props.accountId);
    return generateDryRunResponse(
      moduleName,
      operation,
      `AWS Account with ID ${props.accountId} will be removed as GuardDuty Organization Administrator`,
    );
  }

  /**
   * Function to set the requested configuration given the current GuardDuty state
   *
   * @param client {@link GuardDutyClient}
   * @param config {@link IGuardDutyManageOrganizationAdminConfiguration}
   * @param currentAdmin string | undefined
   * @returns status string
   */
  async setRequestedConfiguration(
    client: GuardDutyClient,
    config: IGuardDutyManageOrganizationAdminConfiguration,
    currentAdmin?: string,
  ): Promise<string> {
    if (config.enable && !currentAdmin) {
      return await this.setOrganizationAdminAccount(client, config.accountId);
    }
    if (config.enable && currentAdmin !== config.accountId) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: GuardDuty delegated admin is already set to ${currentAdmin} account, cannot assign another delegated account ${config.accountId}. Please remove ${currentAdmin} as a delegated administrator and rerun the pipeline.`,
      );
    }
    if (config.enable && currentAdmin === config.accountId) {
      return `AWS Account with ID ${config.accountId} is already the GuardDuty Organization Admin`;
    }
    if (!config.enable && !currentAdmin) {
      return `There is no Organization Admin currently set, so AWS Account with ID ${config.accountId} was not removed`;
    }
    if (!config.enable && currentAdmin !== config.accountId) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Could not remove Account with ID ${config.accountId} as GuardDuty Organization Admin because the current Admin is AWS Account with ID ${currentAdmin}`,
      );
    }
    assert(!config.enable && currentAdmin === config.accountId);
    return await this.removeOrganizationAdminAccount(client, config.accountId);
  }

  /**
   * Function to get detector details for the current account
   * @param client {@link GuardDutyClient}
   * @returns detector details including ID and status, or undefined if no detector exists
   */
  private async getDetectors(client: GuardDutyClient): Promise<{ detectorId: string; status: string } | undefined> {
    try {
      const response = await throttlingBackOff(() => client.send(new ListDetectorsCommand({})));
      if (response.DetectorIds && response.DetectorIds.length > 0) {
        // Safely access the first detector ID
        const detectorId = response.DetectorIds[0];

        // Only proceed if detectorId is defined
        if (detectorId) {
          const detectorResponse = await throttlingBackOff(() =>
            client.send(new GetDetectorCommand({ DetectorId: detectorId })),
          );
          return {
            detectorId: detectorId,
            status: detectorResponse.Status || 'UNKNOWN',
          };
        }
      }
      return undefined;
    } catch (e: unknown) {
      // Log the error and return undefined if any unexpected error occurs
      this.logger.error('Error getting GuardDuty detectors:', e);
      return undefined;
    }
  }

  /**
   * Function to determine if GuardDuty is enabled for the current account
   * @param client {@link GuardDutyClient}
   * @returns boolean true if GuardDuty is enabled
   */
  private async isGuardDutyEnabled(client: GuardDutyClient): Promise<boolean> {
    try {
      const detector = await this.getDetectors(client);
      return detector?.status === DetectorStatus.ENABLED;
    } catch (e: unknown) {
      // Log the error and return false if any unexpected error occurs
      this.logger.error('Error checking GuardDuty status:', e);
      return false;
    }
  }

  /**
   * Function to enable GuardDuty
   *
   * @param client {@link GuardDutyClient}
   */
  async enableGuardDuty(client: GuardDutyClient) {
    await throttlingBackOff(() =>
      client.send(
        new CreateDetectorCommand({
          Enable: true,
        }),
      ),
    );

    await waitUntil(() => {
      return this.isGuardDutyEnabled(client);
    }, 'Could not get confirmation that GuardDuty was enabled, create detector operation might have failed, check detector status');
  }

  /**
   * Function to list all admin accounts with proper pagination
   * @param client {@link GuardDutyClient}
   * @returns list of admin accounts
   */
  private async listAdminAccounts(client: GuardDutyClient): Promise<AdminAccount[]> {
    const adminAccounts: AdminAccount[] = [];
    let nextToken: string | undefined = undefined;

    do {
      const response = await throttlingBackOff(() =>
        client.send(new ListOrganizationAdminAccountsCommand({ NextToken: nextToken })),
      );
      for (const account of response.AdminAccounts ?? []) {
        adminAccounts.push(account);
      }
      nextToken = response.NextToken;
    } while (nextToken);

    return adminAccounts;
  }

  /**
   * Function to get the current organization admin, if one exists
   * @param client {@link GuardDutyClient}
   * @returns string if there is one currently enabled organization admin, otherwise undefined
   */
  private async getOrganizationAdminAccount(client: GuardDutyClient): Promise<string | undefined> {
    const adminAccounts = await this.listAdminAccounts(client);

    if (adminAccounts.length === 0) {
      return undefined;
    }

    if (adminAccounts.length > 1) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Multiple admin accounts for GuardDuty in organization`);
    }

    const adminAccount = adminAccounts[0];

    // Check for DISABLE_IN_PROGRESS status
    if (adminAccount.AdminStatus === 'DISABLE_IN_PROGRESS') {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Admin account ${adminAccount.AdminAccountId} is in ${adminAccount.AdminStatus}`,
      );
    }

    // Only return account ID if status is ENABLED
    if (adminAccount.AdminStatus === 'ENABLED') {
      return adminAccount.AdminAccountId;
    }

    return undefined;
  }

  /**
   * Function to set the organization admin account with enhanced retry logic
   * @param client {@link GuardDutyClient}
   * @param account which account should be set as the organization admin
   * @returns status message
   */
  async setOrganizationAdminAccount(client: GuardDutyClient, account: string): Promise<string> {
    await throttlingBackOff(() => client.send(new EnableOrganizationAdminAccountCommand({ AdminAccountId: account })));

    await waitUntil(async () => {
      return (await this.getOrganizationAdminAccount(client)) === account;
    }, `Could not get confirmation that GuardDuty Organization admin was set to ${account}`);

    return `Successfully set GuardDuty Organization Admin to AWS Account with ID ${account}`;
  }

  /**
   * Function to remove the organization admin account
   * @param client {@link GuardDutyClient}
   * @param account which account should be removed from being the organization admin
   * @returns status message
   */
  async removeOrganizationAdminAccount(client: GuardDutyClient, account: string): Promise<string> {
    await throttlingBackOff(() => client.send(new DisableOrganizationAdminAccountCommand({ AdminAccountId: account })));

    await waitUntil(async () => {
      const currentAdmin = await this.getOrganizationAdminAccount(client);
      return currentAdmin === undefined; // Check that no admin exists
    }, `Could not get confirmation that ${account} was removed as GuardDuty Organization Admin`);

    return `Successfully removed AWS Account with ID ${account} as GuardDuty Organization Admin`;
  }
}

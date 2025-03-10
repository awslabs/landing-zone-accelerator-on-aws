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
  IAMClient,
  ListAccountAliasesCommand,
  CreateAccountAliasCommand,
  DeleteAccountAliasCommand,
  EntityAlreadyExistsException,
} from '@aws-sdk/client-iam';
import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import { getCredentials, getManagementAccountCredentials, isAccountSuspended } from '../../common/functions';

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import { AcceleratorModule } from '../accelerator-module';
import { AssumeRoleCredentialType, ModuleOptionsType } from '../../common/resources';
import { AccountsConfig, OrganizationConfig, GlobalConfig } from '@aws-accelerator/config';
import * as winston from 'winston';
import path from 'path';
import { OrganizationsClient } from '@aws-sdk/client-organizations';

/**
 * AccountAlias class to manage Account Alias operations
 */
export class AccountAlias implements AcceleratorModule {
  private readonly logger: winston.Logger = createLogger([path.parse(path.basename(__filename)).name]);
  /**
   * Handler function to manage Account Aliases
   *
   * @remarks
   * The following activities are performed by this function for each account
   * - Check if a new account alias is needed
   * - Delete existing account alias if one exists
   * - Create new account alias
   *
   * @param module string
   * @param props {@link ModuleOptionsType}
   * @returns status string
   */
  public async handler(module: string, props: ModuleOptionsType): Promise<string> {
    const statuses: string[] = [];
    const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
      ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
      : false;
    const globalConfig = GlobalConfig.load(props.configDirPath);
    const globalRegion = getGlobalRegion(props.partition);

    const managementCredentials = await getManagementAccountCredentials(
      props.partition,
      globalRegion,
      props.solutionId,
    );

    // Get accounts from accounts config
    const orgsEnabled = OrganizationConfig.loadRawOrganizationsConfig(props.configDirPath).enable;
    const accountsConfig = AccountsConfig.load(props.configDirPath);
    await accountsConfig.loadAccountIds(
      props.partition,
      enableSingleAccountMode,
      orgsEnabled,
      accountsConfig,
      managementCredentials as AWS.Credentials,
    );
    const accounts = accountsConfig.getAccounts(enableSingleAccountMode);

    const organizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: managementCredentials,
    });

    for (const account of accounts) {
      if (!account.accountAlias) {
        continue;
      }
      const accountId = accountsConfig.getAccountId(account.name);
      if (await isAccountSuspended(organizationsClient, accountId)) {
        this.logger.warn(`Account "${account.name}" suspended`);
        continue;
      }
      let credentials = managementCredentials;

      if (account.name !== AccountsConfig.MANAGEMENT_ACCOUNT) {
        credentials = await getCredentials({
          accountId: accountId,
          region: globalRegion,
          solutionId: props.solutionId,
          partition: props.partition,
          assumeRoleName: globalConfig.managementAccountAccessRole,
        });
      }

      await this.manageAccountAlias(
        account.name,
        account.accountAlias,
        props.solutionId,
        globalRegion,
        statuses,
        credentials,
      );
    }

    if (statuses.length === 0) {
      statuses.push(`No account aliases in configuration.`);
    }
    return `Module "${module}" completed with following status.\n${statuses.join('\n')}`;
  }

  /**
   * Function to manage the account alias of an account
   * @param accountName string
   * @param accountAlias string
   * @param solutionId string
   * @param region string
   * @param statuses string[]
   * @param credentials {@link AssumeRoleCredentialType} | undefined
   */
  private async manageAccountAlias(
    accountName: string,
    accountAlias: string,
    solutionId: string,
    region: string,
    statuses: string[],
    credentials?: AssumeRoleCredentialType,
  ): Promise<void> {
    const client = new IAMClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    // Get current account alias
    const listAliasResponse = await throttlingBackOff(() => client.send(new ListAccountAliasesCommand({})));

    // There can never be more than one account alias https://docs.aws.amazon.com/IAM/latest/APIReference/API_ListAccountAliases.html#API_ListAccountAliases_ResponseElements
    const currentAlias = listAliasResponse.AccountAliases?.[0];

    // If current alias matches desired alias, no action needed
    if (currentAlias === accountAlias) {
      const message = `Account alias "${accountAlias}" is already set for account "${accountName}".`;
      this.logger.info(message);
      statuses.push(message);
      return;
    }

    // Delete existing alias if one exists
    if (currentAlias) {
      await this.deleteAccountAlias(client, currentAlias);
      statuses.push(`Successfully deleted existing account alias "${currentAlias}".`);
    }

    // Create new alias
    try {
      await this.createAccountAlias(client, accountAlias);
      const message = `Account alias "${accountAlias}" successfully set for account "${accountName}".`;
      this.logger.info(message);
      statuses.push(message);
    } catch (e: unknown) {
      if (e instanceof EntityAlreadyExistsException) {
        const message = `Alias "${accountAlias}" is already taken by another AWS account. Aliases must be unique across all AWS accounts globally.`;
        this.logger.error(message);
        statuses.push(message);
        if (currentAlias) {
          await this.createAccountAlias(client, currentAlias);
          const message = `Reverted to previous account alias "${currentAlias}" for account "${accountName}".`;
          this.logger.info(message);
          statuses.push(message);
        }
      } else {
        throw e;
      }
    }
  }

  /**
   * Function to create account alias
   * @param client IAMClient
   * @param alias string
   */
  private async createAccountAlias(client: IAMClient, alias: string): Promise<void> {
    await throttlingBackOff(() =>
      client.send(
        new CreateAccountAliasCommand({
          AccountAlias: alias,
        }),
      ),
    );
  }

  /**
   * Function to delete account alias
   * @param client IAMClient
   * @param alias string
   */
  private async deleteAccountAlias(client: IAMClient, alias: string): Promise<void> {
    await throttlingBackOff(() =>
      client.send(
        new DeleteAccountAliasCommand({
          AccountAlias: alias,
        }),
      ),
    );
  }
}

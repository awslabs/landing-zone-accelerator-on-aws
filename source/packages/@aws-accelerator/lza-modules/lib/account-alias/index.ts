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
  ListAccountAliasesCommandOutput,
} from '@aws-sdk/client-iam';
import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import { getAccountAliasesFromConfig, getManagementAccountCredentials } from '../../common/functions';

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import { AcceleratorModule } from '../accelerator-module';
import { ModuleOptionsType } from '../../common/resources';
import { AccountsConfig, AccountConfig, GlobalConfig } from '@aws-accelerator/config';
import * as winston from 'winston';
import path from 'path';

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
    // Get accounts from accounts config
    const accountsConfig = AccountsConfig.load(props.configDirPath);
    const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
      ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
      : false;

    const accounts = accountsConfig.getAccounts(enableSingleAccountMode);

    const accountAliases = await getAccountAliasesFromConfig(accountsConfig, enableSingleAccountMode);
    if (accountAliases.length! > 0) {
      return `No aliases in accounts config, module "${module}" execution skipped`;
    }

    const globalRegion = getGlobalRegion(props.partition);

    const globalConfig = GlobalConfig.load(props.configDirPath);
    const managementAccountCredentials = await getManagementAccountCredentials(
      props.partition,
      globalConfig.homeRegion,
      props.solutionId,
    );

    const iamClient = new IAMClient({
      region: globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: managementAccountCredentials,
    });

    accounts.forEach(account => {
      if (!account.accountAlias) {
        this.logger.info(`Account alias not configured for account ${account.name}`);
      } else {
        try {
          this.manageAccountAlias(iamClient, account, statuses);
        } catch (e) {
          this.logger.error(`Error while managing account alias for account ${account.name}`);
          this.logger.error(e);
          throw e;
        }
      }
    });

    return `Module "${module}" completed with following status.\n ${statuses.join('\n')}`;
  }

  /**
   * Function to manage the account alias of an account
   * @param iamClient {@link IAMClient}
   * @param account {@link AccountConfig}
   * @param statuses string[]
   */
  private async manageAccountAlias(iamClient: IAMClient, account: AccountConfig, statuses: string[]): Promise<void> {
    const localStatuses: string[] = [];

    // Get current account alias
    let listAliasResponse: ListAccountAliasesCommandOutput;
    try {
      listAliasResponse = await throttlingBackOff(() => iamClient.send(new ListAccountAliasesCommand({})));
    } catch (error) {
      throw new Error(`Failed to list account aliases: ${error}`);
    }

    // There can never be more than one account alias https://docs.aws.amazon.com/IAM/latest/APIReference/API_ListAccountAliases.html#API_ListAccountAliases_ResponseElements
    const currentAlias = listAliasResponse.AccountAliases?.[0];

    // If current alias matches desired alias, no action needed
    if (currentAlias === account.accountAlias) {
      this.logger.info(`Account alias "${account.accountAlias}" already set`);
      return;
    }

    // Delete existing alias if one exists
    if (currentAlias) {
      try {
        await throttlingBackOff(() =>
          iamClient.send(
            new DeleteAccountAliasCommand({
              AccountAlias: currentAlias,
            }),
          ),
        );
        localStatuses.push(`Successfully deleted existing account alias "${currentAlias}"`);
      } catch (error) {
        throw new Error(`Failed to delete existing alias "${currentAlias}": ${error}`);
      }
    }

    // Create new alias
    try {
      await throttlingBackOff(() =>
        iamClient.send(
          new CreateAccountAliasCommand({
            AccountAlias: account.accountAlias,
          }),
        ),
      );
      localStatuses.push(`Account alias "${account.accountAlias}" successfully set for account "${account.name}".`);
    } catch (error) {
      this.logger.error(`Account "${account.name}" may be left without an alias`);
      throw new Error(`Failed to create new alias "${account.accountAlias}": ${error}`);
    }

    statuses.push(...localStatuses);
  }
}

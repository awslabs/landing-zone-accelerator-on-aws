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
  IMoveAccountsBatchConfiguration,
  IMoveAccountsBatchHandlerParameter,
  IMoveAccountsBatchModule,
} from '../../../interfaces/aws-organizations/move-account';

import { MODULE_EXCEPTIONS } from '../../../common/enums';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import * as emailValidator from 'email-validator';
import {
  generateDryRunResponse,
  getAccountDetailsFromOrganizationsByEmail,
  getAccountId,
  getModuleDefaultParameters,
  getOrganizationAccounts,
  getOrganizationalUnitIdByPath,
  getOrganizationRootId,
  processModulePromises,
  setRetryStrategy,
} from '../../../common/functions';

import {
  Account,
  ChildNotFoundException,
  ListParentsCommand,
  ListParentsCommandOutput,
  MoveAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { AcceleratorModuleName } from '../../../common/resources';

type CurrentAndDestinationAccountOuType = { accountItem?: Account; currentOuId?: string; destinationOuId?: string };
/**
 * A class to move AWS Accounts batch to AWS Organizations Organizational Unit.
 *
 * @description
 * This class performs following:
 *  - If Account already part of destination AWS Organizations Organizational Unit, skip invitation process.
 *  - Move the Account into destination AWS Organizations Organizational Unit
 */
export class MoveAccountsBatchModule implements IMoveAccountsBatchModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to invite Account into AWS Organizations
   *
   * @param props {@link IMoveAccountsBatchHandlerParameter}
   * @returns string
   */
  public async handler(props: IMoveAccountsBatchHandlerParameter): Promise<string> {
    if (props.configuration.accounts.length === 0) {
      return `No accounts provided to move between Organizational Units.`;
    }

    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IMoveAccountsBatchHandlerParameter}
   * @returns string
   */
  private async manageModule(props: IMoveAccountsBatchHandlerParameter): Promise<string> {
    //
    // Get Invalid configuration input
    //
    const invalidEmailIds = this.getInvalidConfiguration(props.configuration);

    //
    // Get default configuration
    //
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_ORGANIZATIONS, props);

    const client = new OrganizationsClient({
      region: props.globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const accountsDetailWithOuId = await this.getAccountsDetailWithOuId(client, props);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(defaultProps.moduleName, props, invalidEmailIds, accountsDetailWithOuId);
    }

    if (invalidEmailIds.length > 0) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid account email "${invalidEmailIds.join(',')}".`);
    }

    this.validateAccountAndOuDetails(accountsDetailWithOuId);

    const accountsToMove = this.getAccountsToMove(accountsDetailWithOuId);
    const accountsWithSameCurrentAndDestinationOu =
      this.getAccountsWithSameCurrentAndDestinationOu(accountsDetailWithOuId);

    const statuses: string[] = [];
    const promises: Promise<string>[] = [];
    for (const account of accountsToMove) {
      promises.push(this.moveAccountToDestinationOu(client, account));
    }

    if (promises.length > 0) {
      await processModulePromises(defaultProps.moduleName, promises, statuses, props.maxConcurrentExecution);
    }

    if (accountsWithSameCurrentAndDestinationOu.length > 0) {
      statuses.push(
        `Total ${accountsWithSameCurrentAndDestinationOu.length} AWS Account(s) already part of their destination AWS Organizations Organizational Unit, accelerator skipped the Account move process.`,
      );
    }

    return statuses.join('\n');
  }

  /**
   * Function to get account details with current and destination Organizational unit.
   *
   * @param client {@link OrganizationsClient}
   * @param props {@link IMoveAccountsBatchHandlerParameter}
   * @returns {@link CurrentAndDestinationAccountOuType[]}
   */
  private async getAccountsDetailWithOuId(
    client: OrganizationsClient,
    props: IMoveAccountsBatchHandlerParameter,
  ): Promise<CurrentAndDestinationAccountOuType[]> {
    const accountsDetailWithOuId: CurrentAndDestinationAccountOuType[] = [];
    const organizationAccounts = await getOrganizationAccounts(client);

    const rootId = await getOrganizationRootId(client);

    for (const account of props.configuration.accounts) {
      const destinationOuId = await getOrganizationalUnitIdByPath(client, account.destinationOu, rootId);
      const accountDetailsFromOrganizationsByEmail = await getAccountDetailsFromOrganizationsByEmail(
        client,
        account.email,
        organizationAccounts,
      );

      accountDetailsFromOrganizationsByEmail?.Id === undefined
        ? accountsDetailWithOuId.push({
            accountItem: accountDetailsFromOrganizationsByEmail,
            destinationOuId,
          })
        : accountsDetailWithOuId.push({
            accountItem: accountDetailsFromOrganizationsByEmail,
            currentOuId: await this.getCurrentOrganizationalUnitForAccount(
              client,
              accountDetailsFromOrganizationsByEmail,
            ),
            destinationOuId,
          });
    }

    return accountsDetailWithOuId;
  }

  /**
   * Function to get current organizational unit for the account
   * @param client {@link OrganizationsClient}
   * @param accountItem {@link Account}
   * @returns string | undefined
   */
  private async getCurrentOrganizationalUnitForAccount(
    client: OrganizationsClient,
    accountItem: Account,
  ): Promise<string | undefined> {
    let response: ListParentsCommandOutput;
    try {
      response = await throttlingBackOff(() =>
        client.send(
          new ListParentsCommand({
            ChildId: accountItem.Id,
          }),
        ),
      );
    } catch (e: unknown) {
      if (e instanceof ChildNotFoundException) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account "${accountItem.Email}" does not have parent OU or the account is not part of AWS Organizations, because ListParentsCommand api raised ChildNotFoundException.`,
        );
        return undefined;
      }
      if (e instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when listing parents for account "${accountItem.Email}".`,
        );
      }
      throw e;
    }

    if (!response.Parents) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api returned undefined Parents object for account "${accountItem.Email}"`,
      );
    }

    if (response.Parents.length > 1) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api returned multiple Parents for account "${accountItem.Email}"`,
      );
    }

    if (response.Parents.length === 0) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did returned empty array for Parents object for account "${accountItem.Email}"`,
      );
    }

    if (!response.Parents[0].Id) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned Id property of Parents object for account "${accountItem.Email}"`,
      );
    }

    return response.Parents[0].Id;
  }

  /**
   * Function to move account to destination organizational unit
   * @param client {@link OrganizationsClient}
   * @param account {@link CurrentAndDestinationAccountOuType}
   * @returns string
   */
  private async moveAccountToDestinationOu(
    client: OrganizationsClient,
    account: CurrentAndDestinationAccountOuType,
  ): Promise<string> {
    const accountEmail = account.accountItem!.Email!;
    const sourceParentId = account.currentOuId!;
    const destinationParentId = account.destinationOuId!;
    const accountId = await getAccountId(client, accountEmail);
    try {
      await throttlingBackOff(() =>
        client.send(
          new MoveAccountCommand({
            AccountId: accountId,
            DestinationParentId: destinationParentId,
            SourceParentId: sourceParentId,
          }),
        ),
      );

      return `AWS Account with email "${accountEmail}" successfully moved from "${sourceParentId}" OU to "${destinationParentId}" OU.`;
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when moving account "${accountEmail}" to OU "${destinationParentId}".`,
        );
      }
      throw e;
    }
  }

  private getAccountsToMove(
    accountsDetailWithOuId: CurrentAndDestinationAccountOuType[],
  ): CurrentAndDestinationAccountOuType[] {
    // Check for accounts that need to be moved
    const accountsToMove = accountsDetailWithOuId.filter(
      item => item.accountItem && item.currentOuId && item.destinationOuId && item.currentOuId !== item.destinationOuId,
    );

    return accountsToMove;
  }

  private getAccountsWithSameCurrentAndDestinationOu(
    accountsDetailWithOuId: CurrentAndDestinationAccountOuType[],
  ): CurrentAndDestinationAccountOuType[] {
    // Check for accounts that don't need to be moved (already in correct OU)
    const accountsWithSameCurrentAndDestinationOu = accountsDetailWithOuId.filter(
      item => item.currentOuId && item.destinationOuId && item.currentOuId === item.destinationOuId,
    );

    return accountsWithSameCurrentAndDestinationOu;
  }

  /**
   * Function to get dry run response
   * @param moduleName string
   * @param operation {@link IMoveAccountsBatchHandlerParameter}
   * @param accountsDetailWithOuId {@link CurrentAndDestinationAccountOuType}[]
   * @returns string
   */
  private getDryRunResponse(
    moduleName: string,
    props: IMoveAccountsBatchHandlerParameter,
    invalidEmailIds: string[],
    accountsDetailWithOuId: CurrentAndDestinationAccountOuType[],
  ): string {
    let responseMessage = `Accelerator couldn't determine the status`;

    const accountsWithUndefinedAccountItemAndDestinationOu = accountsDetailWithOuId.filter(
      item => !item.destinationOuId && !item.accountItem,
    );

    const accountsWithUndefinedDestinationOu = accountsDetailWithOuId.filter(
      item => !item.destinationOuId && item.accountItem,
    );

    if (invalidEmailIds.length > 0) {
      responseMessage = `Will experience ${
        MODULE_EXCEPTIONS.INVALID_INPUT
      }: because, Invalid email id(s) provided for one or more accounts to be moved. Invalid email id(s) "${invalidEmailIds.join(
        ',',
      )}"`;
    } else if (accountsWithUndefinedAccountItemAndDestinationOu.length > 0) {
      responseMessage = `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, there are Account(s) for which could not retrieve destination ou and account details.`;
    } else if (accountsWithUndefinedDestinationOu.length > 0) {
      const emails = accountsWithUndefinedDestinationOu
        .map(item => item.accountItem!.Email)
        .filter(Boolean)
        .join(',');

      responseMessage = `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, Invalid destination organizational unit provided for account(s) with email ${emails}.`;
    } else {
      const accountsWithUndefinedAccountItem = accountsDetailWithOuId.filter(
        item => !item.accountItem && item.destinationOuId,
      );
      if (accountsWithUndefinedAccountItem.length > 0) {
        responseMessage = `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, there are Account(s) not part of AWS Organizations, could not retrieve account details.`;
      } else {
        const accountsWithUndefinedCurrentOu = accountsDetailWithOuId.filter(
          item => item.accountItem && !item.currentOuId,
        );
        if (accountsWithUndefinedCurrentOu.length > 0) {
          responseMessage = `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) without valid parent OU or the account not part of AWS Organizations.`;
        } else {
          const accountsToMove = this.getAccountsToMove(accountsDetailWithOuId);
          const accountsWithSameCurrentAndDestinationOu =
            this.getAccountsWithSameCurrentAndDestinationOu(accountsDetailWithOuId);

          // All accounts are already in correct destination
          if (accountsToMove.length === 0 && accountsWithSameCurrentAndDestinationOu.length > 0) {
            responseMessage = `All AWS Accounts are already part of their destination AWS Organizations Organizational Units, accelerator will skip the Account move process.`;
          }
          // All accounts need to be moved
          else if (accountsToMove.length > 0 && accountsWithSameCurrentAndDestinationOu.length === 0) {
            responseMessage = `All AWS Accounts will be moved to their destination AWS Organizations Organizational Units.`;
          }
          // Some accounts need to be moved, some don't
          else if (accountsToMove.length > 0 && accountsWithSameCurrentAndDestinationOu.length > 0) {
            const moveCount = accountsToMove.length;
            const skipCount = accountsWithSameCurrentAndDestinationOu.length;

            responseMessage = `${moveCount} AWS Account(s) will be moved to their destination AWS Organizations Organizational Units, and ${skipCount} AWS Account(s) will be skipped as they are already in their destination Organizational Units.`;
          }
        }
      }
    }

    return generateDryRunResponse(moduleName, props.operation, responseMessage);
  }

  /**
   * Function to validate each accounts before initiating move account process
   * @param accountsDetailWithOuId {@link CurrentAndDestinationAccountOuType}[]
   * @returns string
   */
  private validateAccountAndOuDetails(accountsDetailWithOuId: CurrentAndDestinationAccountOuType[]): void {
    const errors: string[] = [];

    const accountsWithUndefinedAccountItemAndDestinationOu = accountsDetailWithOuId.filter(
      item => !item.accountItem && !item.destinationOuId,
    );
    if (accountsWithUndefinedAccountItemAndDestinationOu.length > 0) {
      errors.push(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) for which could not retrieve destination ou and account details.`,
      );
    } else {
      const accountsWithUndefinedDestinationOu = accountsDetailWithOuId.filter(
        item => !item.destinationOuId && item.accountItem,
      );
      if (accountsWithUndefinedDestinationOu.length > 0) {
        const emails = accountsWithUndefinedDestinationOu
          .map(item => item.accountItem!.Email)
          .filter(Boolean)
          .join(',');

        errors.push(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid destination organizational unit provided for account(s) with email "${emails}".`,
        );
      }

      const accountsWithUndefinedAccountItem = accountsDetailWithOuId.filter(
        item => !item.accountItem && item.destinationOuId,
      );
      if (accountsWithUndefinedAccountItem.length > 0) {
        errors.push(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) not part of AWS Organizations, could not retrieve account details.`,
        );
      }

      const accountsWithUndefinedCurrentOu = accountsDetailWithOuId.filter(
        item => item.accountItem && !item.currentOuId,
      );
      if (accountsWithUndefinedCurrentOu.length > 0) {
        errors.push(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: There are Account(s) without valid parent OU or the account not part of AWS Organizations.`,
        );
      }
    }

    if (errors.length > 0) {
      throw new Error(errors.join(' '));
    }
  }

  /**
   * Function to provide list of invalid account email to be moved
   * @param configuration {@link IMoveAccountsBatchConfiguration}
   * @returns
   */
  private getInvalidConfiguration(configuration: IMoveAccountsBatchConfiguration): string[] {
    const invalidEmailIds: string[] = [];
    for (const account of configuration.accounts) {
      if (!emailValidator.validate(account.email)) {
        this.logger.error(`Invalid email id "${account.email}" provided for the account to be moved.`);
        invalidEmailIds.push(account.email);
      }
    }
    return invalidEmailIds;
  }
}

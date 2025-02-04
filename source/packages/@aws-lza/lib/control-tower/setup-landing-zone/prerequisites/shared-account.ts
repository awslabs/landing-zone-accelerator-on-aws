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

import {
  CreateAccountCommand,
  CreateAccountStatus,
  CreateAccountState,
  DescribeCreateAccountStatusCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

import { delay, setRetryStrategy } from '../../../../common/functions';
import { IAssumeRoleCredential } from '../../../../common/resources';
import { createLogger } from '../../../../common/logger';
import { throttlingBackOff } from '../../../../common/throttle';
import { ISharedAccountDetails } from '../resources';

type AccountCreationStatusType = { name: string; status: string; reason: string; id?: string };

/**
 * SharedAccount abstract class to create AWS Control Tower Landing Zone shared accounts
 *
 * @remarks
 * This class will create shared AWS accounts.
 *
 */
export abstract class SharedAccount {
  private static logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to create shared account
   * @param client {@link OrganizationsClient}
   * @param accountDetails {@link ISharedAccountDetails}
   * @returns status {@link AccountCreationStatusType}
   */
  private static async createAccount(
    client: OrganizationsClient,
    accountDetails: ISharedAccountDetails,
  ): Promise<AccountCreationStatusType> {
    const response = await throttlingBackOff(() =>
      client.send(
        new CreateAccountCommand({
          Email: accountDetails.email,
          AccountName: accountDetails.name,
        }),
      ),
    );

    if (!response.CreateAccountStatus) {
      throw new Error(
        `Internal error: account creation failed, CreateAccountCommand didn't return CreateAccountStatus object for ${accountDetails.name} account`,
      );
    }

    SharedAccount.logger.info(
      `Shared account ${accountDetails.name} creation started, request id is ${response.CreateAccountStatus.Id}.`,
    );

    if (response.CreateAccountStatus.State === CreateAccountState.FAILED) {
      return {
        name: response.CreateAccountStatus.AccountName!,
        status: response.CreateAccountStatus.State!,
        id: response.CreateAccountStatus.AccountId!,
        reason: `${response.CreateAccountStatus.AccountName!} creation is currently in ${response.CreateAccountStatus
          .State!} state with ${response.CreateAccountStatus.FailureReason} error`,
      };
    }

    return await SharedAccount.waitUntilAccountCreationCompletes(client, response.CreateAccountStatus!);
  }

  /**
   * Function to check account creation completion and wait till account creation completes
   * @param client {@link CreateAccountStatus}
   * @param createAccountStatus {@link CreateAccountStatus}
   * @returns creationStatus {@link SharedAccountCreationStatusType}
   */
  private static async waitUntilAccountCreationCompletes(
    client: OrganizationsClient,
    createAccountStatus: CreateAccountStatus,
  ): Promise<AccountCreationStatusType> {
    let createAccountState = createAccountStatus.State!;
    let createAccountRequestId = createAccountStatus.Id!;
    const queryIntervalInMinutes = 1;

    while (createAccountState === CreateAccountState.IN_PROGRESS) {
      SharedAccount.logger.warn(
        `Shared account ${createAccountStatus.AccountName} creation is currently in ${createAccountState}.state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked.`,
      );
      await delay(queryIntervalInMinutes);
      const response = await throttlingBackOff(() =>
        client.send(
          new DescribeCreateAccountStatusCommand({
            CreateAccountRequestId: createAccountRequestId,
          }),
        ),
      );
      if (!response.CreateAccountStatus) {
        throw new Error(
          `Internal error: account creation failed, DescribeCreateAccountStatusCommand didn't return CreateAccountStatus object for ${createAccountStatus.AccountName} account`,
        );
      }

      createAccountRequestId = createAccountStatus.Id!;
      createAccountState = response.CreateAccountStatus.State!;

      if (createAccountState === CreateAccountState.FAILED) {
        return {
          name: createAccountStatus.AccountName!,
          status: createAccountState,
          id: response.CreateAccountStatus.AccountId!,
          reason: `${createAccountStatus.AccountName} creation is currently in ${createAccountState} state with ${response.CreateAccountStatus.FailureReason} error`,
        };
      }
    }

    SharedAccount.logger.info(`Shared account ${createAccountStatus.AccountName} creation completed successfully.`);
    return {
      name: createAccountStatus.AccountName!,
      status: createAccountState,
      id: createAccountStatus.AccountId!,
      reason: `${createAccountStatus.AccountName} creation successful`,
    };
  }

  /**
   * Function to create AWS Control Tower Landing Zone shared accounts (LogArchive and Audit)
   * @param logArchiveAccountItem {@link ISharedAccountDetails}
   * @param auditAccountItem {@link ISharedAccountDetails}
   * @param globalRegion string
   * @param solutionId string | undefined
   * @param credentials {@link IAssumeRoleCredential} | undefined
   */
  public static async createAccounts(
    logArchiveAccountItem: ISharedAccountDetails,
    auditAccountItem: ISharedAccountDetails,
    globalRegion: string,
    solutionId?: string,
    credentials?: IAssumeRoleCredential,
  ): Promise<void> {
    const client: OrganizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: credentials,
    });

    const errors: string[] = [];
    const promises: Promise<AccountCreationStatusType>[] = [];

    promises.push(SharedAccount.createAccount(client, logArchiveAccountItem));
    promises.push(SharedAccount.createAccount(client, auditAccountItem));

    const accountCreationStatuses = await Promise.all(promises);

    for (const accountCreationStatus of accountCreationStatuses) {
      if (accountCreationStatus.status === CreateAccountState.FAILED) {
        errors.push(accountCreationStatus.reason);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Shared account creation failure !!! ${errors.join('. ')}`);
    }
  }
}

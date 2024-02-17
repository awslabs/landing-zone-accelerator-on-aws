import {
  CreateAccountCommand,
  CreateAccountStatus,
  CreateAccountState,
  DescribeCreateAccountStatusCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

import * as winston from 'winston';
import { createLogger, setRetryStrategy, throttlingBackOff } from '@aws-accelerator/utils';
import { AccountsConfig } from '@aws-accelerator/config';
import path from 'path';

import { delay } from '../utils/resources';

type AccountDetailsType = { name: string; email: string };

type AccountCreationStatusType = { name: string; status: string; reason: string; id?: string };

/**
 * SharedAccount abstract class to create AWS Control Tower Landing Zone shared accounts
 *
 * @remarks
 * This class will create shared AWS accounts.
 *
 */
export abstract class SharedAccount {
  private static logger: winston.Logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Function to get shared account details form account configuration file
   * @param configDirPath string
   * @returns accounts {@link AccountDetailsType}[]
   */
  private static getSharedAccountsDetails(configDirPath: string): AccountDetailsType[] {
    const accountsConfig = AccountsConfig.load(configDirPath);
    const sharedAccounts: AccountDetailsType[] = [];

    for (const mandatoryAccount of accountsConfig.mandatoryAccounts) {
      if (mandatoryAccount.name !== 'Management') {
        sharedAccounts.push({ name: mandatoryAccount.name, email: mandatoryAccount.email });
      }
    }

    if (sharedAccounts.length !== 2) {
      throw new Error(`accounts-config.yaml file do not have both shared account (LogArchive and Audit) details.`);
    }

    return sharedAccounts;
  }

  /**
   * Function to create shared account
   * @param client {@link OrganizationsClient}
   * @param accountDetails {@link AccountDetailsType}
   * @returns status {@link AccountCreationStatusType}
   */
  private static async createAccount(
    client: OrganizationsClient,
    accountDetails: AccountDetailsType,
  ): Promise<AccountCreationStatusType> {
    const response = await throttlingBackOff(() =>
      client.send(
        new CreateAccountCommand({
          Email: accountDetails.email,
          AccountName: accountDetails.name,
        }),
      ),
    );

    SharedAccount.logger.info(
      `Shared account ${accountDetails.name} creation started, request id is ${response.CreateAccountStatus!.Id}.`,
    );

    if (response.CreateAccountStatus?.State === CreateAccountState.FAILED) {
      return {
        name: response.CreateAccountStatus.AccountName!,
        status: response.CreateAccountStatus.State!,
        id: response.CreateAccountStatus.AccountId!,
        reason: `${response.CreateAccountStatus.AccountName!} creation is currently in ${response.CreateAccountStatus
          .State!} state with ${response.CreateAccountStatus.FailureReason} error`,
      };
    }

    return await SharedAccount.waitTillAccountCreationCompletes(client, response.CreateAccountStatus!);
  }

  /**
   * Function to check account creation completion and wait till account creation completes
   * @param client {@link CreateAccountStatus}
   * @param createAccountStatus {@link CreateAccountStatus}
   * @returns creationStatus {@link SharedAccountCreationStatusType}
   */
  private static async waitTillAccountCreationCompletes(
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
      createAccountRequestId = createAccountStatus.Id!;
      createAccountState = response.CreateAccountStatus!.State!;

      if (createAccountState === CreateAccountState.FAILED) {
        return {
          name: createAccountStatus.AccountName!,
          status: createAccountState,
          id: response.CreateAccountStatus!.AccountId!,
          reason: `${createAccountStatus.AccountName} creation is currently in ${createAccountState} state with ${response.CreateAccountStatus?.FailureReason} error`,
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
   * @param configDirPath string
   * @param globalRegion string
   * @param solutionId string
   */
  public static async createAccounts(configDirPath: string, globalRegion: string, solutionId: string): Promise<void> {
    const client: OrganizationsClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    });

    const accountCreationStatuses: AccountCreationStatusType[] = [];
    const errors: string[] = [];

    const sharedAccountsDetails = SharedAccount.getSharedAccountsDetails(configDirPath);

    for (const sharedAccountsDetail of sharedAccountsDetails) {
      const accountCreationStatus = await SharedAccount.createAccount(client, sharedAccountsDetail);
      accountCreationStatuses.push(accountCreationStatus);
      if (accountCreationStatus.status === CreateAccountState.FAILED) {
        errors.push(accountCreationStatus.reason);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Shared account creation failure !!! ${errors.join('. ')}`);
    }
  }
}

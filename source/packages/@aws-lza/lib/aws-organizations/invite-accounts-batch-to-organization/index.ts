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
  IInviteAccountsBatchToOrganizationConfiguration,
  IInviteAccountsBatchToOrganizationHandlerParameter,
  IInviteAccountsBatchToOrganizationModule,
  IInviteAccountToOrganizationConfiguration,
} from '../../../interfaces/aws-organizations/invite-account-to-organization';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import * as emailValidator from 'email-validator';
import {
  delay,
  generateDryRunResponse,
  getAccountDetailsFromOrganizationsByEmail,
  getCredentials,
  getModuleDefaultParameters,
  getOrganizationAccounts,
  processModulePromises,
  setRetryStrategy,
} from '../../../common/functions';

import {
  AcceptHandshakeCommand,
  Account,
  CancelHandshakeCommand,
  HandshakePartyType,
  HandshakeState,
  InviteAccountToOrganizationCommand,
  InviteAccountToOrganizationCommandOutput,
  ListHandshakesForAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { AcceleratorModuleName } from '../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../common/enums';

/**
 * A class to invite AWS Accounts batch to AWS Organizations.
 *
 * @description
 * This class performs following:
 *  - If Account already part of AWS Organizations, skip invitation process.
 *  - Invite Account into AWS Organizations
 *  - Accept the invitation from the account invited
 */
export class InviteAccountsBatchToOrganizationModule implements IInviteAccountsBatchToOrganizationModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to invite Account into AWS Organizations
   *
   * @param props {@link IInviteAccountsBatchToOrganizationHandlerParameter}
   * @returns string
   */
  public async handler(props: IInviteAccountsBatchToOrganizationHandlerParameter): Promise<string> {
    if (props.configuration.accounts.length === 0) {
      return `No accounts provided to invite to AWS Organizations.`;
    }
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IInviteAccountsBatchToOrganizationHandlerParameter}
   * @returns string
   */
  private async manageModule(props: IInviteAccountsBatchToOrganizationHandlerParameter): Promise<string> {
    //
    // Get Invalid configuration input
    //
    const invalidEmailIds = this.getInvalidConfigurationInput(props.configuration);

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

    const existingOrganizationAccounts = await this.getExistingOrganizationAccounts(client, props);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        props.configuration,
        invalidEmailIds,
        existingOrganizationAccounts,
      );
    }

    if (invalidEmailIds.length > 0) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid account email "${invalidEmailIds.join(',')}".`);
    }

    if (existingOrganizationAccounts.length === props.configuration.accounts.length) {
      return `All provided AWS Accounts are already part of AWS Organizations, accelerator skipped the Account invitation process.`;
    }

    const statuses: string[] = [];
    const promises: Promise<string>[] = [];
    let registeredCount = 0;
    for (const account of props.configuration.accounts) {
      const isRegistered = existingOrganizationAccounts.some(orgAccount => orgAccount.Email === account.email);
      if (!isRegistered) {
        promises.push(this.inviteAccountToOrganizations(client, account, props, defaultProps.globalRegion));
      } else {
        registeredCount++;
      }
    }

    if (promises.length > 0) {
      await processModulePromises(defaultProps.moduleName, promises, statuses, props.maxConcurrentExecution);
    }

    if (registeredCount > 0) {
      statuses.push(
        `Total ${registeredCount} AWS Account(s) already part of AWS Organizations, accelerator skipped the Account invitation process.`,
      );
    }

    return statuses.join('\n');
  }

  /**
   * Function to get account details from Organizations.
   *
   * @description
   * This function return input accounts are already part of AWS Organizations
   * @param client {@link OrganizationsClient}
   * @param props {@link IInviteAccountsBatchToOrganizationHandlerParameter}
   * @returns {@link Account[]}
   */
  private async getExistingOrganizationAccounts(
    client: OrganizationsClient,
    props: IInviteAccountsBatchToOrganizationHandlerParameter,
  ): Promise<Account[]> {
    const organizationAccounts = await getOrganizationAccounts(client);
    const existingOrganizationAccounts: Account[] = [];

    for (const account of props.configuration.accounts) {
      const accountDetailsFromOrganizationsByEmail = await getAccountDetailsFromOrganizationsByEmail(
        client,
        account.email,
        organizationAccounts,
      );
      if (accountDetailsFromOrganizationsByEmail) {
        existingOrganizationAccounts.push(accountDetailsFromOrganizationsByEmail);
      }
    }
    return existingOrganizationAccounts;
  }

  /**
   * Function to invite Account into AWS Organizations
   * @param client {@link OrganizationsClient}
   * @param account {@link IInviteAccountToOrganizationConfiguration}
   * @param props {@link IInviteAccountsBatchToOrganizationHandlerParameter}
   * @param globalRegion string
   * @returns status
   */
  private async inviteAccountToOrganizations(
    client: OrganizationsClient,
    account: IInviteAccountToOrganizationConfiguration,
    props: IInviteAccountsBatchToOrganizationHandlerParameter,
    globalRegion: string,
  ): Promise<string> {
    let response: InviteAccountToOrganizationCommandOutput;
    try {
      this.logger.info(`Inviting account with email address "${account.email}" to AWS Organizations.`);
      response = await throttlingBackOff(() =>
        client.send(
          new InviteAccountToOrganizationCommand({
            Target: { Type: HandshakePartyType.EMAIL, Id: account.email },
            Tags: account.tags,
          }),
        ),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.warn(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when inviting account with email address "${account.email}".`,
        );
      }
      throw e;
    }

    if (!response.Handshake) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${account.email}" InviteAccountToOrganizationCommand api did not return Handshake object.`,
      );
    }

    if (!response.Handshake.Id) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${account.email}" InviteAccountToOrganizationCommand api did not return Handshake object Id property.`,
      );
    }

    const handshakeId = response.Handshake.Id;
    try {
      return await this.acceptAccountInvitationToOrganization(handshakeId, account, globalRegion, props);
    } catch (e: unknown) {
      await throttlingBackOff(() => client.send(new CancelHandshakeCommand({ HandshakeId: handshakeId })));
      throw e;
    }
  }

  /**
   * Function to accept account invitation
   * @param handshakeId string
   * @param account {@link IInviteAccountToOrganizationConfiguration}
   * @param globalRegion string
   * @param props {@link IInviteAccountsBatchToOrganizationHandlerParameter}
   * @returns string
   */
  private async acceptAccountInvitationToOrganization(
    handshakeId: string,
    account: IInviteAccountToOrganizationConfiguration,
    globalRegion: string,
    props: IInviteAccountsBatchToOrganizationHandlerParameter,
  ): Promise<string> {
    const credentials = await getCredentials({
      accountId: account.accountId,
      region: globalRegion,
      solutionId: props.solutionId,
      partition: props.partition,
      assumeRoleName: account.accountAccessRoleName,
      sessionName: 'AcceleratorAcceptInviteAssumeRole',
      credentials: props.credentials,
    });

    const accepterClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    this.logger.info(`Accepting AWS Account with email "${account.email}" invite to the AWS Organizations.`);
    const response = await throttlingBackOff(() =>
      accepterClient.send(new AcceptHandshakeCommand({ HandshakeId: handshakeId })),
    );

    if (!response.Handshake) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${account.email}" AcceptHandshakeCommand api did not return any Handshake response, please investigate the account invitation.`,
      );
    }

    if (!response.Handshake.Id) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${account.email}" AcceptHandshakeCommand api did not return any Id property of Handshake object, please investigate the account invitation.`,
      );
    }

    if (response.Handshake.State === HandshakeState.ACCEPTED) {
      return `Invitation to AWS Organizations for AWS Account with email "${account.email}" completed successfully.`;
    }

    return this.waitUntilAccountInvitationAccepted(accepterClient, response.Handshake.Id, account);
  }

  /**
   * Function to get account invitation status
   * @param client {@link OrganizationsClient}
   * @param handshakeId string
   * @param account {@link IInviteAccountToOrganizationConfiguration}
   * @returns string
   */
  private async getAccountHandshakeStatus(
    client: OrganizationsClient,
    handshakeId: string,
    account: IInviteAccountToOrganizationConfiguration,
  ): Promise<string> {
    const response = await throttlingBackOff(() =>
      client.send(new ListHandshakesForAccountCommand({ Filter: { ActionType: 'INVITE' } })),
    );

    if (!response.Handshakes) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${account.email}" ListHandshakesForAccountCommand api did not return Handshakes object, please investigate the account invitation.`,
      );
    }

    const handshakeResponse = response.Handshakes.find(item => item.Id === handshakeId);

    if (!handshakeResponse) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${account.email}" ListHandshakesForAccountCommand api could not find handshake information with handshake id "${handshakeId}", please investigate the account invitation.`,
      );
    }

    if (!handshakeResponse.State) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${account.email}" ListHandshakesForAccountCommand api could not find handshake status with handshake id "${handshakeId}", please investigate the account invitation.`,
      );
    }

    return handshakeResponse.State;
  }

  /**
   * Function to wait until account invitation is accepted
   * @param client {@link OrganizationsClient}
   * @param handshakeId string
   * @param account {@link}
   * @returns string
   */
  private async waitUntilAccountInvitationAccepted(
    client: OrganizationsClient,
    handshakeId: string,
    account: IInviteAccountToOrganizationConfiguration,
  ): Promise<string> {
    const queryIntervalInMinutes = 1;
    const timeoutInMinutes = 10;
    let elapsedInMinutes = 0;
    let status = await this.getAccountHandshakeStatus(client, handshakeId, account);

    while (status !== HandshakeState.ACCEPTED) {
      await delay(queryIntervalInMinutes);
      status = await this.getAccountHandshakeStatus(client, handshakeId, account);

      if (
        status === HandshakeState.CANCELED ||
        status === HandshakeState.DECLINED ||
        status === HandshakeState.EXPIRED
      ) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${account.email}" invitation status is "${status}", please investigate the account invitation.`,
        );
      }

      elapsedInMinutes = elapsedInMinutes + queryIntervalInMinutes;
      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${account.email}" invitation acceptance operation took more than ${timeoutInMinutes} minutes, operation failed, please review AWS Account with email "${account.email}" and complete acceptance of invitation.`,
        );
      }
      this.logger.info(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: The AWS Account with email "${account.email}" invite acceptance with handshake identifier "${handshakeId}" is currently in "${status}" state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked. Elapsed time ${elapsedInMinutes} minutes.`,
      );
    }

    return `Invitation to AWS Organizations for AWS Account with email "${account.email}" completed successfully.`;
  }

  /**
   * Function to get dry run response
   * @param moduleName string
   * @param operation string
   * @param configuration {@link IInviteAccountsBatchToOrganizationConfiguration}
   * @param invalidEmailIds string[]
   * @param existingOrganizationAccounts {@link Account}[]
   * @returns string
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    configuration: IInviteAccountsBatchToOrganizationConfiguration,
    invalidEmailIds: string[],
    existingOrganizationAccounts: Account[],
  ): string {
    if (invalidEmailIds.length > 0) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${
          MODULE_EXCEPTIONS.INVALID_INPUT
        }. Reason Invalid email id(s) provided for one or more accounts to be invited. Invalid email id(s) "${invalidEmailIds.join(
          ',',
        )}"`,
      );
    }

    const inputAccountLength = configuration.accounts.length;
    const newAccounts = configuration.accounts.filter(
      account =>
        !existingOrganizationAccounts.find(
          existingOrganizationAccount => existingOrganizationAccount.Email === account.email,
        ),
    );

    if (inputAccountLength === existingOrganizationAccounts.length) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account(s) with email "${existingOrganizationAccounts.map(
          account => account.Email,
        )}" already part of AWS Organizations, accelerator will skip the Account invitation process.`,
      );
    }

    if (inputAccountLength > existingOrganizationAccounts.length && existingOrganizationAccounts.length > 0) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account(s) with email "${newAccounts.map(
          account => account.email,
        )}" will be invited into AWS Organizations.\nTotal ${
          existingOrganizationAccounts.length
        } AWS Account(s) already part of AWS Organizations, accelerator skipped the Account invitation process.`,
      );
    }

    return generateDryRunResponse(
      moduleName,
      operation,
      `AWS Account(s) with email "${configuration.accounts.map(
        account => account.email,
      )}" will be invited into AWS Organizations.`,
    );
  }

  /**
   * Function to provide list of invalid account email to be invited to AWS Organizations
   * @param configuration {@link IInviteAccountsBatchToOrganizationConfiguration}
   * @returns
   */
  private getInvalidConfigurationInput(configuration: IInviteAccountsBatchToOrganizationConfiguration): string[] {
    const invalidEmailIds: string[] = [];
    for (const account of configuration.accounts) {
      if (!emailValidator.validate(account.email)) {
        this.logger.error(`Invalid email id "${account.email}" provided for the account to be invited.`);
        invalidEmailIds.push(account.email);
      }
    }
    return invalidEmailIds;
  }
}

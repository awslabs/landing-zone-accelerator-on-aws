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
  IInviteAccountToOrganizationConfiguration,
  IInviteAccountToOrganizationHandlerParameter,
  IInviteAccountToOrganizationModule,
} from '../../../interfaces/aws-organizations/invite-account-to-organization';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import * as emailValidator from 'email-validator';
import {
  delay,
  generateDryRunResponse,
  getAccountDetailsFromOrganizations,
  getCredentials,
  getModuleDefaultParameters,
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
 * A class to invite AWS Account to AWS Organizations.
 *
 * @description
 * This class performs following:
 *  - If Account already part of AWS Organizations, skip invitation process.
 *  - Invite Account into AWS Organizations
 *  - Accept the invitation from the account invited
 */
export class InviteAccountToOrganizationModule implements IInviteAccountToOrganizationModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to invite Account into AWS Organizations
   *
   * @param props {@link IInviteAccountToOrganizationHandlerParameter}
   * @returns string
   */
  public async handler(props: IInviteAccountToOrganizationHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IInviteAccountToOrganizationHandlerParameter}
   * @returns string
   */
  private async manageModule(props: IInviteAccountToOrganizationHandlerParameter): Promise<string> {
    //
    // Validate configuration input
    //
    const configurationValid = this.isConfigurationValid(props.configuration);

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

    const accountDetailsFromOrganizations = await getAccountDetailsFromOrganizations(client, props.configuration.email);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        props.configuration,
        configurationValid,
        accountDetailsFromOrganizations,
      );
    }

    if (!configurationValid) {
      throw new Error(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid account email "${props.configuration.email}".`);
    }

    if (accountDetailsFromOrganizations) {
      return `AWS Account with email "${props.configuration.email}" already part of AWS Organizations, accelerator skipped the Account invitation process.`;
    }

    return await this.inviteAccountToOrganizations(client, props, defaultProps.globalRegion);
  }

  /**
   * Function to invite Account into AWS Organizations
   * @param client {@link OrganizationsClient}
   * @param props {@link IInviteAccountToOrganizationHandlerParameter}
   * @param globalRegion string
   * @returns status
   */
  private async inviteAccountToOrganizations(
    client: OrganizationsClient,
    props: IInviteAccountToOrganizationHandlerParameter,
    globalRegion: string,
  ): Promise<string> {
    let response: InviteAccountToOrganizationCommandOutput;
    try {
      this.logger.info(`Inviting account with email address "${props.configuration.email}" to AWS Organizations.`);
      response = await throttlingBackOff(() =>
        client.send(
          new InviteAccountToOrganizationCommand({
            Target: { Type: HandshakePartyType.EMAIL, Id: props.configuration.email },
            Tags: props.configuration.tags,
          }),
        ),
      );
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.warn(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when inviting account with email address "${props.configuration.email}".`,
        );
      }
      throw e;
    }

    if (!response.Handshake) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${props.configuration.email}" InviteAccountToOrganizationCommand api did not return Handshake object.`,
      );
    }

    if (!response.Handshake.Id) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${props.configuration.email}" InviteAccountToOrganizationCommand api did not return Handshake object Id property.`,
      );
    }

    const handshakeId = response.Handshake.Id;
    try {
      return await this.acceptAccountInvitationToOrganization(handshakeId, globalRegion, props);
    } catch (e: unknown) {
      await throttlingBackOff(() => client.send(new CancelHandshakeCommand({ HandshakeId: handshakeId })));
      throw e;
    }
  }

  /**
   * Function to accept account invitation
   * @param handshakeId string
   * @param globalRegion string
   * @param props {@link IInviteAccountToOrganizationHandlerParameter}
   * @returns string
   */
  private async acceptAccountInvitationToOrganization(
    handshakeId: string,
    globalRegion: string,
    props: IInviteAccountToOrganizationHandlerParameter,
  ): Promise<string> {
    const credentials = await getCredentials({
      accountId: props.configuration.accountId,
      region: globalRegion,
      solutionId: props.solutionId,
      partition: props.partition,
      assumeRoleName: props.configuration.accountAccessRoleName,
      sessionName: 'AcceleratorAcceptInviteAssumeRole',
      credentials: props.credentials,
    });

    const accepterClient = new OrganizationsClient({
      region: globalRegion,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    this.logger.info(
      `Accepting AWS Account with email "${props.configuration.email}" invite to the AWS Organizations.`,
    );
    const response = await throttlingBackOff(() =>
      accepterClient.send(new AcceptHandshakeCommand({ HandshakeId: handshakeId })),
    );

    if (!response.Handshake) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${props.configuration.email}" AcceptHandshakeCommand api did not return any Handshake response, please investigate the account invitation.`,
      );
    }

    if (!response.Handshake.Id) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${props.configuration.email}" AcceptHandshakeCommand api did not return any Id property of Handshake object, please investigate the account invitation.`,
      );
    }

    if (response.Handshake.State === HandshakeState.ACCEPTED) {
      return `Invitation to AWS Organizations for AWS Account with email "${props.configuration.email}" completed successfully.`;
    }

    return this.waitUntilAccountInvitationAccepted(accepterClient, response.Handshake.Id, props);
  }

  /**
   * Function to get account invitation status
   * @param client {@link OrganizationsClient}
   * @param handshakeId string
   * @param props {@link IInviteAccountToOrganizationHandlerParameter}
   * @returns string
   */
  private async getAccountHandshakeStatus(
    client: OrganizationsClient,
    handshakeId: string,
    props: IInviteAccountToOrganizationHandlerParameter,
  ): Promise<string> {
    const response = await throttlingBackOff(() =>
      client.send(new ListHandshakesForAccountCommand({ Filter: { ActionType: 'INVITE' } })),
    );

    if (!response.Handshakes) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${props.configuration.email}" ListHandshakesForAccountCommand api did not return Handshakes object, please investigate the account invitation.`,
      );
    }

    const handshakeResponse = response.Handshakes.find(item => item.Id === handshakeId);

    if (!handshakeResponse) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${props.configuration.email}" ListHandshakesForAccountCommand api could not find handshake information with handshake id "${handshakeId}", please investigate the account invitation.`,
      );
    }

    if (!handshakeResponse.State) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${props.configuration.email}" ListHandshakesForAccountCommand api could not find handshake status with handshake id "${handshakeId}", please investigate the account invitation.`,
      );
    }

    return handshakeResponse.State;
  }

  /**
   * Function to wait until account invitation is accepted
   * @param client {@link OrganizationsClient}
   * @param handshakeId string
   * @param props {@link IInviteAccountToOrganizationHandlerParameter}
   * @returns string
   */
  private async waitUntilAccountInvitationAccepted(
    client: OrganizationsClient,
    handshakeId: string,
    props: IInviteAccountToOrganizationHandlerParameter,
  ): Promise<string> {
    const queryIntervalInMinutes = 1;
    const timeoutInMinutes = 10;
    let elapsedInMinutes = 0;
    let status = await this.getAccountHandshakeStatus(client, handshakeId, props);

    while (status !== HandshakeState.ACCEPTED) {
      await delay(queryIntervalInMinutes);
      status = await this.getAccountHandshakeStatus(client, handshakeId, props);

      if (
        status === HandshakeState.CANCELED ||
        status === HandshakeState.DECLINED ||
        status === HandshakeState.EXPIRED
      ) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${props.configuration.email}" invitation status is "${status}", please investigate the account invitation.`,
        );
      }

      elapsedInMinutes = elapsedInMinutes + queryIntervalInMinutes;
      if (elapsedInMinutes >= timeoutInMinutes) {
        throw new Error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${props.configuration.email}" invitation acceptance operation took more than ${timeoutInMinutes} minutes, operation failed, please review AWS Account with email "${props.configuration.email}" and complete acceptance of invitation.`,
        );
      }
      this.logger.info(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: The AWS Account with email "${props.configuration.email}" invite acceptance with handshake identifier "${handshakeId}" is currently in "${status}" state. After ${queryIntervalInMinutes} minutes delay, the status will be rechecked. Elapsed time ${elapsedInMinutes} minutes.`,
      );
    }

    return `Invitation to AWS Organizations for AWS Account with email "${props.configuration.email}" completed successfully.`;
  }

  /**
   * Function to get dry run response
   * @param moduleName string
   * @param operation string
   * @param configuration {@link IInviteAccountToOrganizationConfiguration}
   * @param configurationValid boolean
   * @param accountDetailsFromOrganizations Account | undefined
   * @returns string
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    configuration: IInviteAccountToOrganizationConfiguration,
    configurationValid: boolean,
    accountDetailsFromOrganizations?: Account,
  ): string {
    if (!configurationValid) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason Invalid email id "${configuration.email}" provided for the account to be invited.`,
      );
    }

    if (accountDetailsFromOrganizations) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account with email "${configuration.email}" already part of AWS Organizations, accelerator will skip the Account invitation process.`,
      );
    }

    return generateDryRunResponse(
      moduleName,
      operation,
      `AWS Account with email "${configuration.email}" is not part of AWS Organizations, accelerator will invite the account into organizations.`,
    );
  }

  /**
   * Function to validate configuration input
   * @param configuration {@link IInviteAccountToOrganizationConfiguration}
   * @returns boolean
   */
  private isConfigurationValid(configuration: IInviteAccountToOrganizationConfiguration): boolean {
    return emailValidator.validate(configuration.email);
  }
}

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
  IMoveAccountConfiguration,
  IMoveAccountHandlerParameter,
  IMoveAccountModule,
} from '../../../interfaces/aws-organizations/move-account';

import { MODULE_EXCEPTIONS } from '../../../common/enums';

import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import {
  generateDryRunResponse,
  getAccountDetailsFromOrganizations,
  getAccountId,
  getModuleDefaultParameters,
  getOrganizationalUnitIdByPath,
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

/**
 * A class to move AWS Account to AWS Organizations Organizational Unit.
 *
 * @description
 * This class performs following:
 *  - If Account already part of destination AWS Organizations Organizational Unit, skip invitation process.
 *  - Move the Account into destination AWS Organizations Organizational Unit
 */
export class MoveAccountModule implements IMoveAccountModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to invite Account into AWS Organizations
   *
   * @param props {@link IMoveAccountHandlerParameter}
   * @returns string
   */
  public async handler(props: IMoveAccountHandlerParameter): Promise<string> {
    return await this.manageModule(props);
  }

  /**
   * Module manager function
   * @param props {@link IMoveAccountHandlerParameter}
   * @returns string
   */
  private async manageModule(props: IMoveAccountHandlerParameter): Promise<string> {
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

    const destinationParentId = await getOrganizationalUnitIdByPath(client, props.configuration.destinationOu);

    const currentOrganizationalUnitForAccount =
      accountDetailsFromOrganizations?.Id === undefined
        ? undefined
        : await this.getCurrentOrganizationalUnitForAccount(client, props, accountDetailsFromOrganizations.Id);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        props.configuration,
        accountDetailsFromOrganizations,
        destinationParentId,
        currentOrganizationalUnitForAccount,
      );
    }

    if (!destinationParentId) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Organizational Unit path "${props.configuration.destinationOu}" not found.`,
      );
    }

    if (!accountDetailsFromOrganizations) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with email "${props.configuration.email}" is not part of AWS Organizations.`,
      );
    }

    if (!currentOrganizationalUnitForAccount) {
      throw new Error(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with email "${props.configuration.email}" does not have parent OU or the account is not part of AWS Organizations.`,
      );
    }

    if (currentOrganizationalUnitForAccount !== destinationParentId) {
      return await this.moveAccountToDestinationOu(
        client,
        props,
        currentOrganizationalUnitForAccount,
        destinationParentId,
      );
    }

    return `AWS Account with email "${props.configuration.email}" already part of AWS Organizations Organizational Unit "${props.configuration.destinationOu}", accelerator skipped the Account move process.`;
  }

  /**
   * Function to get current organizational unit for the account
   * @param client {@link OrganizationsClient}
   * @param props {@link IMoveAccountHandlerParameter}
   * @param accountId string
   * @returns string | undefined
   */
  private async getCurrentOrganizationalUnitForAccount(
    client: OrganizationsClient,
    props: IMoveAccountHandlerParameter,
    accountId: string,
  ): Promise<string | undefined> {
    let response: ListParentsCommandOutput;
    try {
      response = await throttlingBackOff(() =>
        client.send(
          new ListParentsCommand({
            ChildId: accountId,
          }),
        ),
      );
    } catch (e: unknown) {
      if (e instanceof ChildNotFoundException) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account "${props.configuration.email}" does not have parent OU or the account is not part of AWS Organizations, because ListParentsCommand api raised ChildNotFoundException.`,
        );
        return undefined;
      }
      if (e instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when listing parents for account "${props.configuration.email}".`,
        );
      }
      throw e;
    }

    if (!response.Parents) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned Parents object for account "${props.configuration.email}"`,
      );
    }

    if (response.Parents.length > 1) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api returned multiple Parents for account "${props.configuration.email}"`,
      );
    }

    if (response.Parents.length === 0) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned any Parents for account "${props.configuration.email}"`,
      );
    }

    if (!response.Parents[0].Id) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned Id property of Parents object for account "${props.configuration.email}"`,
      );
    }

    return response.Parents[0].Id;
  }

  /**
   * Function to move account to destination organizational unit
   * @param client {@link OrganizationsClient}
   * @param props {@link IMoveAccountHandlerParameter}
   * @param sourceParentId string
   * @param destinationParentId string
   * @returns string
   */
  private async moveAccountToDestinationOu(
    client: OrganizationsClient,
    props: IMoveAccountHandlerParameter,
    sourceParentId: string,
    destinationParentId: string,
  ): Promise<string> {
    const accountId = await getAccountId(client, props.configuration.email);
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

      return `AWS Account with email "${props.configuration.email}" successfully moved from "${sourceParentId}" OU to "${destinationParentId}" OU.`;
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: There was an "${e.message}" error when moving account "${props.configuration.email}" to OU "${destinationParentId}".`,
        );
      }
      throw e;
    }
  }

  /**
   * Function to get dry run response
   * @param moduleName string
   * @param operation string
   * @param configuration {@link IMoveAccountConfiguration}
   * @param accountDetailsFromOrganizations {@link Account} | undefined
   * @parma destinationParentId string | undefined
   * @param currentOrganizationalUnitForAccount string | undefined
   * @returns string
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    configuration: IMoveAccountConfiguration,
    accountDetailsFromOrganizations?: Account,
    destinationParentId?: string,
    currentOrganizationalUnitForAccount?: string,
  ): string {
    if (!destinationParentId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, Invalid destination ou: "${configuration.destinationOu}" provided for the account with email ${configuration.email}.`,
      );
    }

    if (!accountDetailsFromOrganizations) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, account with email "${configuration.email}" not part of AWS Organizations.`,
      );
    }

    if (!currentOrganizationalUnitForAccount) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, account with "${configuration.email}" does not have parent OU or the account is not part of AWS Organizations.`,
      );
    }

    if (currentOrganizationalUnitForAccount === destinationParentId) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `AWS Account with email "${configuration.email}" already part of AWS Organizations Organizational Unit "${configuration.destinationOu}", accelerator will skip the Account move process.`,
      );
    }

    return generateDryRunResponse(
      moduleName,
      operation,
      `AWS Account with email "${configuration.email}" is part of AWS Organizations Organizational Unit (OU) "${currentOrganizationalUnitForAccount}", accelerator will move the account into "${destinationParentId}" OU.`,
    );
  }
}

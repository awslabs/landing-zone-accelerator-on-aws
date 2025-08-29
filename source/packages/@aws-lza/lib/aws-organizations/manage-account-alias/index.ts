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
  IManageAccountAliasHandlerParameter,
  IManageAccountAliasModule,
} from '../../../interfaces/aws-organizations/manage-account-alias';
import { createLogger } from '../../../common/logger';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { throttlingBackOff } from '../../../common/throttle';
import path from 'path';
import { AcceleratorModuleName } from '../../../common/resources';
import {
  EntityAlreadyExistsException,
  IAMClient,
  ListAccountAliasesCommand,
  CreateAccountAliasCommand,
  DeleteAccountAliasCommand,
} from '@aws-sdk/client-iam';
import { setRetryStrategy, generateDryRunResponse, getModuleDefaultParameters } from '../../../common/functions';

/**
 * ManageAccountAlias class to manage AWS account alias operations
 */
export class ManageAccountAlias implements IManageAccountAliasModule {
  private readonly logger = createLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Handler function to manage AWS account alias
   *
   * The following activities are performed by this function:
   * - Validate the alias format against AWS requirements
   * - Return early with validation errors for both dry run and live execution
   * - Check if the desired alias is already set
   * - Delete existing alias if one exists and differs from desired
   * - Create new account alias
   * - Handle conflicts when alias is globally taken by another account
   *
   * @param props - Handler parameters containing alias configuration and credentials
   * @returns Promise resolving to array of status messages describing operations performed
   */
  async handler(props: IManageAccountAliasHandlerParameter): Promise<string> {
    const defaultProps = getModuleDefaultParameters(AcceleratorModuleName.AWS_ORGANIZATIONS, props);
    const validationResult = this.validateAlias(props.configuration.alias);

    const client = new IAMClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const currentAlias = await this.getCurrentAlias(client);

    if (defaultProps.dryRun) {
      return this.getDryRunResponse(
        defaultProps.moduleName,
        props.operation,
        props.configuration.alias,
        currentAlias,
        validationResult.errorStatus,
      );
    }

    if (!validationResult.isValid && validationResult.errorStatus) {
      return validationResult.errorStatus;
    }

    const statuses: string[] = [];
    await this.manageAccountAlias(props, statuses, client, currentAlias);
    return statuses.join('\n');
  }

  /**
   * Validates AWS account alias format against AWS requirements
   *
   * @param alias - Account alias to validate
   * @returns Validation result object with isValid flag and optional error status
   */
  private validateAlias(alias: string): { isValid: boolean; errorStatus?: string } {
    const regex = new RegExp('^[a-z0-9]([a-z0-9]|-(?!-)){1,61}[a-z0-9]$');
    if (!regex.test(alias)) {
      const errorStatus = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid alias format "${alias}" - must be 3-63 chars, lowercase alphanumeric with hyphens, no consecutive hyphens`;
      this.logger.error(`Invalid alias format "${alias}"`);
      return { isValid: false, errorStatus };
    }
    return { isValid: true };
  }

  /**
   * Generates dry run response showing what operations would be performed
   *
   *
   * @param moduleName - Module name for dry run response
   * @param operation - Operation name for dry run response
   * @param desiredAlias - Desired alias (already validated)
   * @param currentAlias - Current account alias or undefined if none exists
   * @returns Dry run status message describing planned operations
   */
  private getDryRunResponse(
    moduleName: string,
    operation: string,
    desiredAlias: string,
    currentAlias?: string,
    validationErrorStatus?: string,
  ): string {
    if (validationErrorStatus) {
      return generateDryRunResponse(moduleName, operation, `Will experience ${validationErrorStatus}`);
    }
    if (currentAlias === desiredAlias) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Account alias "${desiredAlias}" is already set for this account`,
      );
    }
    if (currentAlias) {
      return generateDryRunResponse(
        moduleName,
        operation,
        `Will delete existing account alias "${currentAlias}" and set new alias "${desiredAlias}"`,
      );
    }
    return generateDryRunResponse(
      moduleName,
      operation,
      `Will set account alias "${desiredAlias}" (no existing alias)`,
    );
  }

  /**
   * Manages the complete account alias lifecycle for a single account
   *
   * Orchestrates the process of checking current alias, deleting if necessary,
   * and creating the new alias with proper error handling and rollback.
   *
   * @param props - Handler parameters containing alias configuration, credentials, and other settings
   * @param statuses - Array to collect operation status messages
   * @param client - Pre-configured IAM client
   * @param currentAlias - Current account alias or undefined if none exists
   */
  private async manageAccountAlias(
    props: IManageAccountAliasHandlerParameter,
    statuses: string[],
    client: IAMClient,
    currentAlias?: string,
  ): Promise<void> {
    if (this.isAliasAlreadySet(props.configuration.alias, statuses, currentAlias)) {
      return;
    }

    // Delete existing alias if one exists
    if (currentAlias) {
      await this.deleteAccountAlias(client, currentAlias);
      statuses.push(`Successfully deleted existing account alias "${currentAlias}"`);
    }

    // Create new alias
    try {
      await this.createAccountAlias(client, props.configuration.alias);
      const message = `Account alias "${props.configuration.alias}" successfully set.`;
      this.logger.info(message);
      statuses.push(message);
    } catch (error: unknown) {
      if (error instanceof EntityAlreadyExistsException) {
        const message = `Alias "${props.configuration.alias}" is already taken by another AWS account. Aliases must be unique across all AWS accounts globally.`;
        this.logger.error(message);
        statuses.push(message);
        // Attempt rollback to previous alias if one existed
        await this.handleAliasRollback(client, statuses, currentAlias);
      } else {
        this.logger.error(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to create alias "${props.configuration.alias}": ${error}`,
        );
        await this.handleAliasRollback(client, statuses, currentAlias);
        throw error;
      }
    }
  }

  /**
   * Retrieves the current account alias from AWS
   *
   * @param client - Configured IAM client
   * @returns Promise resolving to current alias or undefined if none exists
   */
  private async getCurrentAlias(client: IAMClient): Promise<string | undefined> {
    const response = await throttlingBackOff(() => client.send(new ListAccountAliasesCommand({})));
    return response.AccountAliases?.[0];
  }

  /**
   * Checks if the desired alias is already set for the account
   *
   * @param currentAlias - Current account alias or undefined if none
   * @param desiredAlias - Desired account alias to check against
   * @param statuses - Array to collect status messages
   * @returns True if alias is already set, false otherwise
   */
  private isAliasAlreadySet(desiredAlias: string, statuses: string[], currentAlias?: string): boolean {
    if (currentAlias === desiredAlias) {
      const message = `Account alias "${desiredAlias}" is already set for this account`;
      this.logger.info(message);
      statuses.push(message);
      return true;
    }
    return false;
  }

  /**
   * Creates an account alias using the IAM API
   *
   * @param client - Configured IAM client
   * @param alias - Account alias to create
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
   * Deletes an account alias using the IAM API
   *
   * @param client - Configured IAM client
   * @param currentAlias - Account alias to delete
   * @throws Error if deletion fails
   */
  private async deleteAccountAlias(client: IAMClient, currentAlias: string): Promise<void> {
    try {
      await throttlingBackOff(() =>
        client.send(
          new DeleteAccountAliasCommand({
            AccountAlias: currentAlias,
          }),
        ),
      );
    } catch (error) {
      this.logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to delete alias "${currentAlias}": ${error}`);
      throw error;
    }
  }

  /**
   * Handles rollback to previous account alias when new alias creation fails
   *
   * This function attempts to restore the account to its previous alias state when
   * the desired alias cannot be created due to global uniqueness conflicts.
   *
   * @param client - Configured IAM client for AWS operations
   * @param statuses - Array to collect operation status messages
   * @param previousAlias - The previous alias to restore, or undefined if none existed
   */
  private async handleAliasRollback(client: IAMClient, statuses: string[], previousAlias?: string): Promise<void> {
    if (!previousAlias) {
      return;
    }

    try {
      await this.createAccountAlias(client, previousAlias);
      const message = `Reverted to previous account alias "${previousAlias}"`;
      this.logger.info(message);
      statuses.push(message);
    } catch (error) {
      const message = `Failed to revert to previous alias "${previousAlias}". Account left without alias.`;
      this.logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${message}: ${error}`);
      statuses.push(message);
    }
  }
}

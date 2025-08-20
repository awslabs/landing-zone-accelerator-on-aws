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

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { STSClient } from '@aws-sdk/client-sts';
import {
  IGetSsmParametersValueHandlerParameter,
  IGetSsmParametersValueConfiguration,
  ISsmParameterValue,
  IGetSsmParametersValueModule,
} from '../../../interfaces/aws-ssm/get-parameters';
import { createLogger } from '../../../common/logger';
import { throttlingBackOff } from '../../../common/throttle';
import { setRetryStrategy, getCredentials, getCurrentAccountDetails } from '../../../common/functions';
import { MODULE_EXCEPTIONS } from '../../../common/enums';
import { IAssumeRoleCredential } from '../../../common/resources';

/**
 * SsmGetParameterModule retrieves AWS Systems Manager parameter values.
 *
 * This module provides functionality to retrieve SSM parameter values in batch
 * with support for cross-account access.
 */
export class GetSsmParametersValueModule implements IGetSsmParametersValueModule {
  private readonly logger = createLogger(['ssm-get-parameter']);

  /**
   * Main handler method for retrieving SSM parameters
   *
   * Validates all initial parameter configurations first, then processes only valid ones.
   * Invalid parameters have their validation errors collected but skip API calls.
   * All errors (validation and API) are thrown together at the end.
   *
   * @param props {@link IGetSsmParametersHandlerParameter}
   * @returns Promise resolving to an array of parameter responses for valid parameters
   * @throws {Error} When validation fails or AWS API calls fail
   */
  async handler(props: IGetSsmParametersValueHandlerParameter): Promise<ISsmParameterValue[]> {
    const results: ISsmParameterValue[] = [];
    const errors: string[] = [];

    // Separate parameters with valid and invalid initial configuration
    const validParameters: IGetSsmParametersValueConfiguration[] = [];

    for (const parameter of props.configuration) {
      const validationError = this.validateParameterConfiguration(parameter);
      if (validationError) {
        errors.push(validationError);
      } else {
        validParameters.push(parameter);
      }
    }

    // Only make API calls if we have valid parameters to process
    if (validParameters.length > 0) {
      const stsClient = new STSClient({
        region: props.region,
        customUserAgent: props.solutionId,
        retryStrategy: setRetryStrategy(),
        credentials: props.credentials,
      });

      const { accountId: currentAccountId, roleArn: currentRoleArn } = await getCurrentAccountDetails(stsClient);

      const batches = this.groupParametersByClient(validParameters, props.region);
      await this.processBatches(batches, currentAccountId, currentRoleArn, props, results, errors);
    }

    // Throw all errors at once, if any
    if (errors.length > 0) {
      this.logger.error(`Failed to process SSM parameters - ${errors.join('; ')}`);
      throw new Error(errors.join('; '));
    }

    return results;
  }

  /**
   * Validates a single parameter configuration for cross-account access requirements
   *
   * @param parameter - Parameter configuration to validate
   * @returns Error message string if validation fails, undefined if valid
   */
  private validateParameterConfiguration(parameter: IGetSsmParametersValueConfiguration): string | undefined {
    if (!parameter.name) {
      return `${MODULE_EXCEPTIONS.INVALID_INPUT}: Parameter name is required;`;
    }
    return undefined;
  }

  /**
   * Extracts and validates account ID from a role ARN
   *
   * @param roleArn - role ARN to extract account ID from
   * @param parameterName - Parameter name for error context
   * @param errors - Array to collect processing errors
   * @returns Account ID if valid, undefined if invalid
   */
  private extractAccountIdFromArn(roleArn: string, parameterName: string, errors: string[]): string | undefined {
    const parts = roleArn.split(':');

    // Checks role ARN format or if accountId is empty
    if (parts.length < 6 || !parts[4]) {
      errors.push(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Parameter "${parameterName}" - Invalid ARN format: ${roleArn}`);
      return undefined;
    }

    const accountId = parts[4]; // Where accountId is found in the arn

    // Validates accountID
    if (!/^\d{12}$/.test(accountId)) {
      errors.push(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Parameter "${parameterName}" - Invalid account ID in ARN: ${accountId}`,
      );
      return undefined;
    }

    return accountId;
  }

  /**
   * Groups parameters by client requirements for efficient SSM client reuse
   *
   * Creates batches of parameters that can share the same SSM client based on assumeRoleArn
   *
   * @param parameters - Array of validated parameter configurations to group
   * @param currentAccountId - Default account ID for parameters without assumeRoleArn
   * @param errors - Array to collect processing errors
   * @returns Map of client batches keyed by assumeRoleArn
   */
  private groupParametersByClient(
    parameters: IGetSsmParametersValueConfiguration[],
    defaultRegion: string,
  ): Map<string, { parameters: IGetSsmParametersValueConfiguration[]; region: string; assumeRoleArn?: string }> {
    const batches = new Map();

    for (const parameter of parameters) {
      const region = parameter.region ?? defaultRegion;
      // Group parameters by region and credentials for client reuse
      const clientKey = `${region}-${parameter.assumeRoleArn ?? 'default'}`;

      // Check if batch for this clientKey exists already
      if (!batches.has(clientKey)) {
        // Create new batch if new clientKey
        batches.set(clientKey, { parameters: [], region, assumeRoleArn: parameter.assumeRoleArn });
      }
      // Add parameter to existing batch for this clientKey
      batches.get(clientKey).parameters.push(parameter);
    }

    return batches;
  }

  /**
   * Processes parameter batches with reused SSM clients
   *
   * Creates one SSM client per batch and reuses it for all parameters in that batch.
   * This minimizes client creation overhead and improves memory efficiency when
   * processing large numbers of parameters.
   *
   * @param batches - Map of parameter batches grouped by client requirements
   * @param currentRoleArn - Current role ARN for validation against assumeRoleArn
   * @param props - Handler parameters containing region, credentials, and other config
   * @param results - Array to collect successful parameter responses
   * @param errors - Array to collect processing errors
   */
  private async processBatches(
    batches: Map<string, { parameters: IGetSsmParametersValueConfiguration[]; region: string; assumeRoleArn?: string }>,
    currentAccountId: string,
    currentRoleArn: string,
    props: IGetSsmParametersValueHandlerParameter,
    results: ISsmParameterValue[],
    errors: string[],
  ): Promise<void> {
    for (const batch of batches.values()) {
      let accountId = currentAccountId;

      // Extract accountId from assumeRoleArn, if arn is provided
      if (batch.assumeRoleArn) {
        const extractedAccountId = this.extractAccountIdFromArn(batch.assumeRoleArn, batch.parameters[0].name, errors);
        if (!extractedAccountId) continue;
        accountId = extractedAccountId;
      }

      const client = await this.createSSMClient(
        accountId,
        batch.region,
        errors,
        batch.parameters[0].name,
        currentRoleArn,
        batch.assumeRoleArn,
        props.solutionId,
        props.credentials,
      );

      if (!client) continue;

      for (const parameter of batch.parameters) {
        const result = await this.getParameter(client, parameter, errors);
        if (result) results.push(result);
      }
    }
  }

  /**
   * Retrieves a single SSM parameter using an existing client
   *
   * Makes an API call to retrieve the parameter value using a pre-configured
   * SSM client. Handles parameter not found as expected behavior and collects
   * other errors for batch reporting.
   *
   * @param client - Pre-configured SSM client to use for the API call
   * @param parameter - Parameter configuration to retrieve
   * @param errors - Array to collect processing errors
   * @returns Promise resolving to parameter response or undefined if error
   */
  private async getParameter(
    client: SSMClient,
    parameter: IGetSsmParametersValueConfiguration,
    errors: string[],
  ): Promise<ISsmParameterValue | undefined> {
    try {
      const response = await throttlingBackOff(() => client.send(new GetParameterCommand({ Name: parameter.name })));
      const { Name: name, Value: value } = response.Parameter ?? {};

      if (name && value) {
        return { name, value, exists: true };
      }

      errors.push(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Parameter "${parameter.name}" - GetParameterCommand returned parameter without required Name or Value properties, parameter will be marked as non-existing.`,
      );

      return undefined;
    } catch (error) {
      if (error instanceof Error && error.name === 'ParameterNotFound') {
        return { name: parameter.name, exists: false };
      }

      errors.push(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Parameter "${parameter.name}" - Failed to get parameter: ${error}`,
      );
      return undefined;
    }
  }

  /**
   * Creates an SSM client with appropriate credentials.
   *
   * This method handles cross-account access by assuming roles when necessary
   * and configures the client with proper retry strategies.
   *
   * @param accountId - AWS account ID for the SSM client
   * @param region - AWS region for the SSM client
   * @param currentRoleArn - Current role ARN to validate against
   * @param assumeRoleArn - Role ARN to assume for cross-account access, if needed
   * @param solutionId - Solution ID for user agent tracking
   * @returns Promise resolving to a configured SSM client
   */
  private async createSSMClient(
    accountId: string,
    region: string,
    errors: string[],
    parameterName: string,
    currentRoleArn: string,
    assumeRoleArn?: string,
    solutionId?: string,
    credentials?: IAssumeRoleCredential,
  ): Promise<SSMClient | undefined> {
    let assumedCredentials;

    if (assumeRoleArn) {
      if (currentRoleArn === assumeRoleArn) {
        errors.push(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Parameter "${parameterName}" - Cannot assume role ${assumeRoleArn}, already using this role. Remove assumeRoleArn to use current credentials`,
        );
        return undefined;
      }
      assumedCredentials = await getCredentials({
        accountId,
        region,
        solutionId,
        assumeRoleArn,
      });
    }

    return new SSMClient({
      region,
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: assumedCredentials ?? credentials,
    });
  }
}

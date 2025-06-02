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
import { SSMClient, GetParameterCommand, GetParameterCommandInput, SSMServiceException } from '@aws-sdk/client-ssm';
import { Credentials } from '@aws-sdk/types';
import { createLogger } from './logger';
import * as path from 'path';

// Create a logger instance for this module
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Custom error class for SSM operations
 */
export class SSMOperationError extends Error {
  readonly originalError: unknown;
  readonly parameterName: string;

  constructor(message: string, originalError: unknown, parameterName: string) {
    super(message);
    this.name = 'SSMOperationError';
    this.originalError = originalError;
    this.parameterName = parameterName;
  }
}

/**
 * Get a parameter value from AWS Systems Manager Parameter Store
 * @param {string} parameterName - The name of the parameter to retrieve
 * @param {Credentials} [credentials] - Optional AWS credentials
 * @returns {Promise<string>} - Returns the parameter value
 * @throws {SSMOperationError} - Throws a custom error with details about the failure
 */
export async function getSSMParameterValue(parameterName: string, credentials?: Credentials): Promise<string> {
  // Initialize SSM client with optional credentials
  const clientOptions = credentials ? { credentials } : {};

  const client = new SSMClient(clientOptions);

  // Define parameters for GetParameterCommand
  const params: GetParameterCommandInput = {
    Name: parameterName,
  };

  try {
    logger.debug(`Retrieving SSM parameter: ${parameterName}`);
    // Execute the GetParameterCommand
    const command = new GetParameterCommand(params);
    const response = await client.send(command);

    // Check if parameter exists and has value
    if (response.Parameter && response.Parameter.Value) {
      logger.debug(`Successfully retrieved SSM parameter: ${parameterName}`);
      return response.Parameter.Value;
    } else {
      throw new SSMOperationError(
        `Parameter exists but has no value: "${parameterName}"`,
        new Error('Parameter missing value'),
        parameterName,
      );
    }
  } catch (error) {
    // Type-safe error handling
    if (error instanceof SSMOperationError) {
      // Our custom error is already formatted correctly, just re-throw it
      throw error;
    } else if (error instanceof SSMServiceException) {
      // AWS SSM Service exception
      logger.error(`SSM Service Error: ${error.name} - ${error.message}`);
      throw new SSMOperationError(
        `SSM service error for parameter "${parameterName}": ${error.name} - ${error.message}`,
        error,
        parameterName,
      );
    } else {
      // Unknown error type
      logger.error('Unknown error retrieving parameter from SSM:', error);
      throw new SSMOperationError(
        `Unknown error retrieving parameter "${parameterName}" from SSM: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error,
        parameterName,
      );
    }
  }
}

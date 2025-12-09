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

/**
 * @fileoverview AWS Systems Manager Utility Functions - Parameter management and SSM operations
 *
 * Provides comprehensive utilities for AWS Systems Manager operations including parameter retrieval
 * across accounts and regions with cross-account role assumption capabilities. Supports secure
 * parameter access with proper error handling and validation.
 *
 * Key capabilities:
 * - Cross-account SSM parameter retrieval
 * - Role assumption for parameter access
 * - Parameter validation and error handling
 * - Comprehensive logging and monitoring
 * - Support for multiple parameter retrieval
 */

import path from 'path';
import { SSMClient, GetParametersCommand, ParameterNotFound, Parameter } from '@aws-sdk/client-ssm';
import { createLogger } from './logger';
import { executeApi, setRetryStrategy } from './utility';
import { getCredentials } from './sts-functions';
import { IAssumeRoleCredential } from './interfaces';
import { MODULE_EXCEPTIONS } from './types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Target account configuration for cross-account SSM parameter access
 */
export interface ITargetAccountConfig {
  /** Target AWS account ID */
  accountId: string;
  /** Target AWS region */
  region: string;
  /** AWS partition (aws, aws-gov, aws-cn, etc.) */
  partition: string;
  /** IAM role name to assume for cross-account access */
  assumeRoleName: string;
}

/**
 * Retrieves SSM parameter values from current or target account and region
 * @param parameterNames - Array of parameter names to retrieve
 * @param region - AWS region for SSM operations
 * @param logPrefix - Prefix for logging messages
 * @param targetAccount - Optional target account configuration for cross-account access
 * @param solutionId - Optional solution identifier for user agent
 * @param credentials - Optional existing credentials for the operation
 * @returns Promise resolving to array of parameter objects
 * @throws Error if parameters are not found or access is denied
 */
export async function getParametersValue(
  parameterNames: string[],
  region: string,
  logPrefix: string,
  targetAccount?: ITargetAccountConfig,
  solutionId?: string,
  credentials?: IAssumeRoleCredential,
): Promise<Parameter[]> {
  let targetCredentials: IAssumeRoleCredential | undefined;
  let targetRegion = region;

  if (targetAccount) {
    logger.info(
      `Getting SSM parameters from account ${targetAccount.accountId} in region ${targetAccount.region}`,
      logPrefix,
    );
    targetRegion = targetAccount.region;

    // Get credentials for target account
    targetCredentials = await getCredentials({
      accountId: targetAccount.accountId,
      region: targetAccount.region,
      logPrefix,
      solutionId,
      partition: targetAccount.partition,
      assumeRoleName: targetAccount.assumeRoleName,
      credentials,
    });
  } else {
    logger.info(`Getting SSM parameters from current account in region ${region}`, logPrefix);
    targetCredentials = credentials;
  }

  // Create SSM client with appropriate credentials
  const ssmClient = new SSMClient({
    region: targetRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: targetCredentials,
  });

  const commandName = 'GetParametersCommand';
  const parameters = { Names: parameterNames };

  const response = await executeApi(
    commandName,
    parameters,
    () => ssmClient.send(new GetParametersCommand(parameters)),
    logger,
    logPrefix,
    [ParameterNotFound],
  );

  // Check if all parameters were found
  if (response.InvalidParameters && response.InvalidParameters.length > 0) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Parameters not found: ${response.InvalidParameters.join(', ')}`;
    logger.error(message, logPrefix);
    throw new Error(message);
  }

  if (!response.Parameters || response.Parameters.length === 0) {
    const message = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetParametersCommand api returned undefined for Parameters or returned no values, for parameter names: ${parameterNames.join(', ')}`;
    logger.error(message, logPrefix);
    throw new Error(message);
  }

  const results: Parameter[] = [...response.Parameters];

  logger.info(`Successfully retrieved ${results.length} parameters`, logPrefix);
  return results;
}

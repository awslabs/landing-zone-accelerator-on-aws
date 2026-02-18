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
import {
  SSMClient,
  GetParametersCommand,
  PutParameterCommand,
  ParameterNotFound,
  Parameter,
  ParameterType,
} from '@aws-sdk/client-ssm';
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
 * @param defaultValues - Optional map of parameter name to default value. When a parameter is not found and has a default, the default is returned instead of throwing.
 * @returns Promise resolving to array of parameter objects
 * @throws Error if parameters are not found (when no default provided) or access is denied
 */
export async function getParametersValue(
  parameterNames: string[],
  region: string,
  logPrefix: string,
  targetAccount?: ITargetAccountConfig,
  solutionId?: string,
  credentials?: IAssumeRoleCredential,
  defaultValues?: Record<string, string>,
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

  const found: Parameter[] = response.Parameters ?? [];
  const missingNames: string[] = response.InvalidParameters ?? [];

  // Resolve missing parameters: use defaults where available, throw for the rest
  if (missingNames.length > 0) {
    const withDefaults = missingNames.filter(name => defaultValues?.[name] !== undefined);
    const withoutDefaults = missingNames.filter(name => defaultValues?.[name] === undefined);

    if (withoutDefaults.length > 0) {
      const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Parameters not found: ${withoutDefaults.join(', ')}`;
      logger.error(message, logPrefix);
      throw new Error(message);
    }

    const defaultResults: Parameter[] = withDefaults.map(name => {
      logger.info(
        `[${logPrefix}] SSM parameter ${name} not found, using default value ${defaultValues![name]}`,
        logPrefix,
      );
      return { Name: name, Value: defaultValues![name] };
    });

    return [...found, ...defaultResults];
  }

  logger.info(`Successfully retrieved ${found.length} parameters`, logPrefix);
  return found;
}

/**
 * Puts SSM parameter values to current or target account and region
 * @param parameters - Array of parameter objects to put (name, value, type, description)
 * @param region - AWS region for SSM operations
 * @param logPrefix - Prefix for logging messages
 * @param targetAccount - Optional target account configuration for cross-account access
 * @param solutionId - Optional solution identifier for user agent
 * @param credentials - Optional existing credentials for the operation
 * @param overwrite - Whether to overwrite existing parameters (default: true)
 * @returns Promise resolving when all parameters are successfully put
 * @throws Error if parameters cannot be created or access is denied
 */
export async function putParametersValue(
  parameters: Array<{
    name: string;
    value: string;
    type?: ParameterType;
    description?: string;
  }>,
  region: string,
  logPrefix: string,
  targetAccount?: ITargetAccountConfig,
  solutionId?: string,
  credentials?: IAssumeRoleCredential,
  overwrite: boolean = true,
): Promise<void> {
  let targetCredentials: IAssumeRoleCredential | undefined;
  let targetRegion = region;

  if (targetAccount) {
    logger.info(
      `Putting SSM parameters to account ${targetAccount.accountId} in region ${targetAccount.region}`,
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
    logger.info(`Putting SSM parameters to current account in region ${region}`, logPrefix);
    targetCredentials = credentials;
  }

  // Create SSM client with appropriate credentials
  const ssmClient = new SSMClient({
    region: targetRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: targetCredentials,
  });

  const commandName = 'PutParameterCommand';

  // Put each parameter
  for (const param of parameters) {
    const commandParameters = {
      Name: param.name,
      Value: param.value,
      Type: param.type || ParameterType.STRING,
      Description: param.description,
      Overwrite: overwrite,
    };

    await executeApi(
      commandName,
      commandParameters,
      () => ssmClient.send(new PutParameterCommand(commandParameters)),
      logger,
      logPrefix,
    );

    logger.info(`Successfully put parameter: ${param.name}`, logPrefix);
  }

  logger.info(`Successfully put ${parameters.length} parameters`, logPrefix);
}

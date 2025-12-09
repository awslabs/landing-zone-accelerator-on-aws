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
 * @fileoverview AWS STS Utility Functions - Cross-account credential management
 *
 * Provides utility functions for AWS Security Token Service (STS) operations,
 * including cross-account role assumption and credential management. These
 * functions enable secure multi-account operations in AWS Landing Zone
 * Accelerator deployments with proper validation and error handling.
 *
 * Key capabilities:
 * - Cross-account assume role operations with validation
 * - Flexible role specification (ARN or name-based)
 * - Credential caching and session management
 * - Comprehensive error handling and validation
 * - Integration with LZA retry and throttling mechanisms
 *
 * @example
 * ```typescript
 * // Assume role in target account using role name
 * const credentials = await getCredentials({
 *   accountId: '123456789012',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   assumeRoleName: 'LZAExecutionRole',
 *   sessionName: 'MacieSetup'
 * });
 *
 * // Use credentials with AWS SDK clients
 * const macieClient = new MacieClient({
 *   region: 'us-east-1',
 *   credentials: credentials
 * });
 * ```
 */

import path from 'path';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { IAssumeRoleCredential, ISessionContext } from './interfaces';
import { executeApi, setRetryStrategy } from './utility';
import { MODULE_EXCEPTIONS } from './types';
import { createLogger } from './logger';

/**
 * Logger instance for STS functions with file-based context.
 * Provides consistent logging for all STS operations and credential management.
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Retrieves cross-account assume role credentials for multi-account operations.
 * Handles role assumption with flexible role specification, validation, and
 * optimization to avoid unnecessary assume role operations when already in target context.
 *
 * @param options - Configuration object for assume role operation
 * @param options.accountId - Target AWS account ID for role assumption
 * @param options.region - AWS region for STS client configuration
 * @param options.solutionId - Optional solution identifier for user agent tracking
 * @param options.partition - AWS partition (required when using assumeRoleName)
 * @param options.assumeRoleName - IAM role name to assume (mutually exclusive with assumeRoleArn)
 * @param options.assumeRoleArn - Complete IAM role ARN to assume (mutually exclusive with assumeRoleName)
 * @param options.sessionName - Optional session name for the assumed role session
 * @param options.credentials - Optional existing credentials for the assume role operation
 *
 * @returns Promise resolving to assume role credentials, or undefined if already in target context
 *
 * @throws {Error} When both assumeRoleName and assumeRoleArn are provided
 * @throws {Error} When neither assumeRoleName nor assumeRoleArn are provided
 * @throws {Error} When assumeRoleName is provided without partition
 * @throws {Error} When STS operations fail or return incomplete credentials
 *
 * @remarks
 * Function behavior:
 * - Validates input parameters for mutual exclusivity and required combinations
 * - Constructs role ARN from partition, account ID, and role name if needed
 * - Checks current session identity to avoid unnecessary assume role operations
 * - Performs comprehensive validation of returned credentials
 * - Uses throttling and retry mechanisms for reliable STS operations
 *
 * @example
 * ```typescript
 * // Assume role using role name (recommended for consistency)
 * const credentials1 = await getCredentials({
 *   accountId: '123456789012',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   assumeRoleName: 'LZAExecutionRole',
 *   sessionName: 'MacieConfiguration',
 *   solutionId: 'lza-v1.0.0'
 * });
 *
 * // Assume role using complete ARN
 * const credentials2 = await getCredentials({
 *   accountId: '123456789012',
 *   region: 'us-east-1',
 *   assumeRoleArn: 'arn:aws:iam::123456789012:role/CustomExecutionRole',
 *   sessionName: 'SecurityHubSetup'
 * });
 *
 * // Chain assume role operations
 * const managementCredentials = await getCredentials({
 *   accountId: '111111111111',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   assumeRoleName: 'OrganizationAccountAccessRole'
 * });
 *
 * const workloadCredentials = await getCredentials({
 *   accountId: '222222222222',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   assumeRoleName: 'LZAExecutionRole',
 *   credentials: managementCredentials
 * });
 *
 * // Use with AWS SDK clients
 * if (credentials1) {
 *   const macieClient = new MacieClient({
 *     region: 'us-east-1',
 *     credentials: credentials1
 *   });
 *
 *   // Perform operations in target account
 *   await macieClient.send(new EnableMacieCommand({}));
 * }
 *
 * // Handle case where assume role is not needed
 * const sameAccountCredentials = await getCredentials({
 *   accountId: getCurrentAccountId(),
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   assumeRoleName: 'CurrentRole'
 * });
 * // Returns undefined if already in target role context
 * ```
 */
export async function getCredentials(options: {
  accountId: string;
  region: string;
  logPrefix: string;
  solutionId?: string;
  partition?: string;
  assumeRoleName?: string;
  assumeRoleArn?: string;
  sessionName?: string;
  credentials?: IAssumeRoleCredential;
}): Promise<IAssumeRoleCredential | undefined> {
  if (options.assumeRoleName && options.assumeRoleArn) {
    throw new Error(`Either assumeRoleName or assumeRoleArn can be provided not both`);
  }

  if (!options.assumeRoleName && !options.assumeRoleArn) {
    throw new Error(`Either assumeRoleName or assumeRoleArn must provided`);
  }

  if (options.assumeRoleName && !options.partition) {
    throw new Error(`When assumeRoleName provided partition must be provided`);
  }

  const roleArn =
    options.assumeRoleArn ?? `arn:${options.partition}:iam::${options.accountId}:role/${options.assumeRoleName}`;

  const client: STSClient = new STSClient({
    region: options.region,
    customUserAgent: options.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: options.credentials,
  });

  const currentSessionResponse = await executeApi(
    'GetCallerIdentityCommand',
    {},
    () => client.send(new GetCallerIdentityCommand({})),
    logger,
    options.logPrefix,
  );

  if (currentSessionResponse.Arn === roleArn) {
    logger.info(`Already in target environment assume role credential not required`, options.logPrefix);
    return undefined;
  }

  const commandName = 'AssumeRoleCommand';
  const parameters = { RoleArn: roleArn, RoleSessionName: options.sessionName ?? 'AcceleratorAssumeRole' };
  const response = await executeApi(
    commandName,
    parameters,
    () => client.send(new AssumeRoleCommand(parameters)),
    logger,
    options.logPrefix,
  );

  //
  // Validate response
  if (!response.Credentials) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AssumeRoleCommand did not return Credentials`);
  }

  if (!response.Credentials.AccessKeyId) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AssumeRoleCommand did not return AccessKeyId`);
  }
  if (!response.Credentials.SecretAccessKey) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AssumeRoleCommand did not return SecretAccessKey`);
  }
  if (!response.Credentials.SessionToken) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AssumeRoleCommand did not return SessionToken`);
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId,
    secretAccessKey: response.Credentials.SecretAccessKey,
    sessionToken: response.Credentials.SessionToken,
    expiration: response.Credentials.Expiration,
  };
}

/**
 * Sets the global region for API calls based on the given partition.
 *
 * @param partition - AWS partition identifier
 * @returns Global region string for the partition
 */
export function getGlobalRegion(partition: string): string {
  switch (partition) {
    case 'aws-us-gov':
      return 'us-gov-west-1';
    case 'aws-iso':
      return 'us-iso-east-1';
    case 'aws-iso-b':
      return 'us-isob-east-1';
    case 'aws-iso-e':
      return 'eu-isoe-west-1';
    case 'aws-iso-f':
      return 'us-isof-south-1';
    case 'aws-cn':
      return 'cn-northwest-1';
    default:
      return 'us-east-1';
  }
}

/**
 * Retrieves current AWS session details including account ID, region, global region, and partition.
 * Automatically detects session context without requiring explicit partition or region parameters.
 *
 * @param options - Configuration object for session details retrieval
 * @param options.logPrefix - Optional log prefix for consistent logging
 * @param options.region - Optional AWS region to use for the STS client (auto-detected if not provided)
 * @param options.solutionId - Optional solution identifier for user agent tracking
 * @param options.credentials - Optional existing credentials for the operation
 * @returns Promise resolving to current session details with invokingAccountId
 *
 * @throws {Error} When STS API fails or returns incomplete session information
 * @throws {Error} When region cannot be resolved from any source
 *
 * @example
 * ```typescript
 * // Basic usage with auto-detected region
 * const sessionDetails = await getCurrentSessionDetails({});
 *
 * // With specific region
 * const sessionDetails = await getCurrentSessionDetails({
 *   region: 'us-east-1'
 * });
 *
 * // With logging and solution tracking
 * const sessionDetails = await getCurrentSessionDetails({
 *   logPrefix: 'CLI:SessionCheck',
 *   solutionId: 'lza-v1.0.0'
 * });
 *
 * // With existing credentials for cross-account operations
 * const sessionDetails = await getCurrentSessionDetails({
 *   credentials: assumedRoleCredentials,
 *   logPrefix: 'CrossAccount:Identity'
 * });
 * ```
 */
export async function getCurrentSessionDetails(props: {
  logPrefix?: string;
  region?: string;
  solutionId?: string;
  credentials?: IAssumeRoleCredential;
}): Promise<ISessionContext> {
  const client: STSClient = new STSClient({
    region: props.region,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });
  const configRegion = await client.config.region();

  const commandName = 'GetCallerIdentityCommand';
  const parameters = {};
  const response = await executeApi(
    commandName,
    parameters,
    () => client.send(new GetCallerIdentityCommand(parameters)),
    logger,
    props.logPrefix ?? `Invoker:${configRegion}`,
  );

  if (!response.Account) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${commandName} did not return Account property`);
  }

  if (!response.Arn) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${commandName} did not return Arn property`);
  }

  // Extract partition from ARN format: arn:partition:service:region:account:resource
  const partition = response.Arn.split(':')[1];

  // Resolve region from config or environment
  const resolvedRegion: string | undefined = props.region ?? configRegion;

  if (!resolvedRegion) {
    throw new Error('Region is missing');
  }

  const globalRegion = getGlobalRegion(partition);

  const sessionContext: ISessionContext = {
    invokingAccountId: response.Account,
    region: resolvedRegion,
    globalRegion,
    partition,
  };

  logger.info(
    `Current session details: ${JSON.stringify(sessionContext)}`,
    props.logPrefix ?? `Invoker:${configRegion}`,
  );

  return sessionContext;
}

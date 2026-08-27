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

import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import path from 'node:path';
import { credentialCache } from './credential-cache';
import {
  AssumeRoleCredentialType,
  IAssumeRoleCredential,
  ICreateStsClientOptions,
  ISessionContext,
} from './interfaces';
import { createLogger } from './logger';
import { MODULE_EXCEPTIONS } from './types';
import { executeApi, setRetryStrategy } from './utility';

/**
 * Logger instance for STS functions with file-based context.
 * Provides consistent logging for all STS operations and credential management.
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Creates an {@link STSClient} configured with the accelerator retry strategy.
 *
 * Centralizes STS client construction so every caller resolves endpoints the
 * same way. No explicit `endpoint` is set: the AWS SDK resolves the regional STS
 * endpoint from the region (including isolated and sovereign partitions), which
 * also lets the standard `AWS_ENDPOINT_URL[_STS]` / `AWS_USE_FIPS_ENDPOINT`
 * environment overrides take effect.
 *
 * @param options.region - AWS region used to resolve the STS endpoint
 * @param options.solutionId - Value for the client `customUserAgent`
 * @param options.credentials - Optional credentials or credential provider
 * @returns A configured {@link STSClient}
 */
export function createStsClient(options: ICreateStsClientOptions): STSClient {
  return new STSClient({
    region: options.region,
    customUserAgent: options.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: options.credentials,
  });
}

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
/**
 * Simple string hash for cache key differentiation.
 * Not cryptographic — just needs to produce distinct values for distinct policies.
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function getCredentials(options: {
  accountId: string;
  region: string;
  logPrefix: string;
  solutionId?: string;
  partition?: string;
  assumeRoleName?: string;
  assumeRoleArn?: string;
  sessionName?: string;
  credentials?: AssumeRoleCredentialType;
  /** Inline JSON session policy to restrict assumed role permissions (max 2048 chars) */
  sessionPolicy?: string;
  /** When true, throws if sessionPolicy is not provided (enforces least-privilege for module calls) */
  requireSessionPolicy?: boolean;
  // NOTE: Session tags (sts:TagSession) intentionally NOT supported here.
  // AWSControlTowerExecution trust policy only allows sts:AssumeRole, not sts:TagSession.
  // Since CT owns that role, we cannot modify its trust policy. Session policies (Policy param)
  // work without any trust policy changes — they restrict via intersection, not expansion.
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

  // Create cache key for credential caching
  // When session policy is provided, include a policy hash to prevent cross-module credential reuse
  // (different modules assume the same role but with different session policies)
  const cacheKey = options.sessionPolicy
    ? `${options.accountId}-${options.region}-${roleArn}-${hashCode(options.sessionPolicy)}`
    : `${options.accountId}-${options.region}-${roleArn}`;

  // Use credential cache with atomic in-flight request tracking
  return await credentialCache.getOrFetch(
    cacheKey,
    async () => {
      const client: STSClient = createStsClient({
        region: options.region,
        solutionId: options.solutionId,
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

      if (options.sessionPolicy) {
        // Validate policy is well-formed JSON before sending to STS
        try {
          JSON.parse(options.sessionPolicy);
        } catch {
          throw new Error(`Invalid session policy JSON: ${options.sessionPolicy.substring(0, 100)}...`);
        }
        logger.info(`Session policy applied (${options.sessionPolicy.length} chars)`, options.logPrefix);
      } else if (options.requireSessionPolicy) {
        throw new Error(
          `Cross-account AssumeRole to ${roleArn} blocked: no session policy provided. ` +
            `Module must have a policy declared in module-session-policies.ts to enforce least privilege.`,
        );
      }

      const parameters = {
        RoleArn: roleArn,
        RoleSessionName: options.sessionName ?? 'AcceleratorAssumeRole',
        Policy: options.sessionPolicy,
      };

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
    },
    options.logPrefix,
  );
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
    case 'aws-eusc':
      return 'eusc-de-east-1';
    default:
      return 'us-east-1';
  }
}

/**
 * Returns the regional S3 virtual-hosted endpoint URL for the given partition,
 * region, and bucket.
 *
 * Isolated and sovereign partitions do not use the standard
 * `.amazonaws.com` host suffix, so a hardcoded suffix produces an unreachable
 * URL (for example, CloudFormation `TemplateURL` references fail in those
 * partitions). This function maps each partition to its correct S3 host suffix.
 *
 * @param partition - AWS partition identifier
 * @param region - AWS region where the bucket exists
 * @param bucket - S3 bucket name
 * @returns Fully qualified S3 virtual-hosted endpoint URL (no trailing slash)
 */
export function getS3Endpoint(partition: string, region: string, bucket: string): string {
  let suffix: string;
  switch (partition) {
    case 'aws-iso':
      suffix = 'c2s.ic.gov';
      break;
    case 'aws-iso-b':
      suffix = 'sc2s.sgov.gov';
      break;
    case 'aws-iso-f':
      suffix = 'csp.hci.ic.gov';
      break;
    case 'aws-iso-e':
      suffix = 'cloud.adc-e.uk';
      break;
    case 'aws-cn':
      suffix = 'amazonaws.com.cn';
      break;
    case 'aws-eusc':
      suffix = 'amazonaws.eu';
      break;
    default:
      // both commercial and GovCloud use this pattern
      suffix = 'amazonaws.com';
      break;
  }
  return `https://${bucket}.s3.${region}.${suffix}`;
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
  credentials?: AssumeRoleCredentialType;
}): Promise<ISessionContext> {
  const client: STSClient = createStsClient({
    region: props.region,
    solutionId: props.solutionId,
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

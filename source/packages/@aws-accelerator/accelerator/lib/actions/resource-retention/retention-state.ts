/**
 * @fileoverview Retention state management utilities for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module provides state management capabilities for tracking CloudFormation stack resource
 * retention operations. It enables:
 * - Retention status tracking per stack
 * - Retry attempt counting
 * - Error tracking and debugging
 * - Batch state retrieval with pagination
 * - Idempotent retention operations
 *
 * State is stored in a centralized DynamoDB table in the home region of the pipeline account,
 * accessible by all modules regardless of their execution region. This ensures consistent
 * state management across multi-region deployments.
 *
 * The module supports large-scale deployments with automatic pagination for retrieving
 * retention states across thousands of stacks.
 *
 * @example
 * ```typescript
 * // Check if retention needed
 * const state = await getRetentionState(
 *   'macie',
 *   'XXXXXXXXXXXX',
 *   'us-east-1',
 *   'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *   params,
 *   'XXXXXXXXXXXX:us-east-1'
 * );
 *
 * if (state?.retentionStatus === 'COMPLETED') {
 *   // Skip retention - already completed
 * } else {
 *   // Perform retention
 *   await retainResources(...);
 *
 *   // Update state
 *   await updateRetentionStatus({
 *     serviceName: 'macie',
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     status: 'COMPLETED',
 *     dryRun: false
 *   }, params, 'XXXXXXXXXXXX:us-east-1');
 * }
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ | DynamoDB Developer Guide}
 */

/**
 * Retention state management utilities.
 * Provides functions for tracking CloudFormation stack resource retention status.
 */

import { createLogger, createStatusLogger, queryDynamoDBTable } from 'aws-lza';
import path from 'node:path';
import type { ModuleParams } from '../../types';
import { createDynamoDBClient, getItem, getModuleResourcePrefix, putItem } from '../utils/dynamodb';
import { IResourceRetentionState, RetentionStatus } from './types';

/**
 * Logger instance for retention state operations.
 *
 * @private
 * @constant
 *
 * @description
 * Provides structured logging for retention state management operations including:
 * - State retrieval and persistence
 * - Status updates
 * - Batch operations with pagination
 * - Error conditions
 *
 * Uses the filename as the logger context for easy identification in log aggregation systems.
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Status logger instance for tracking module execution status and progress.
 *
 * @private
 * @static
 * @readonly
 *
 * @description
 * Provides structured logging for module status updates, progress tracking,
 * and operational visibility. Uses the filename as the logger context for
 * easy identification in log aggregation systems.
 */
const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * Gets the DynamoDB table name for retention state storage.
 *
 * @private
 * @function getRetentionStateTableName
 *
 * @description
 * Constructs the retention state table name using the LZA naming convention.
 * The table is created in the home region (where the module infrastructure stack is deployed)
 * in the pipeline account, accessible by all modules regardless of their execution region.
 *
 * Table naming format: `{prefix}-Resource-Retention-{accountId}-{homeRegion}`
 *
 * @param {ModuleParams} params - Module parameters containing resource prefixes and session context
 *
 * @returns {string} DynamoDB table name for retention state
 *
 * @example
 * ```typescript
 * const tableName = getRetentionStateTableName(params);
 * // Returns: "AWSAccelerator-Resource-Retention-XXXXXXXXXXXX-us-east-1"
 * ```
 */
function getRetentionStateTableName(params: ModuleParams): string {
  return `${getModuleResourcePrefix()}-Resource-Retention-${params.runnerParameters.sessionContext.invokingAccountId}-${params.runnerParameters.sessionContext.region}`;
}

/**
 * Get retention state for a specific CloudFormation stack.
 * Retrieves the current retention status to determine if retention is needed.
 *
 * @param serviceName - Service name (e.g., 'MACIE', 'GUARDDUTY')
 * @param accountId - AWS account ID where the stack exists
 * @param region - AWS region where the stack exists
 * @param stackName - CloudFormation stack name
 * @param params - Module parameters for DynamoDB access
 * @param logPrefix - Logging prefix
 * @returns Retention state or undefined if not found
 *
 * @example
 * ```typescript
 * const state = await getRetentionState(
 *   'macie',
 *   'XXXXXXXXXXXX',
 *   'us-east-1',
 *   'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *   params,
 *   logPrefix
 * );
 *
 * if (state?.retentionStatus === 'COMPLETED') {
 *   logger.info('Retention already completed, skipping');
 * }
 * ```
 */
export async function getRetentionState(
  serviceName: string,
  accountId: string,
  region: string,
  stackName: string,
  params: ModuleParams,
  logPrefix: string,
): Promise<IResourceRetentionState | undefined> {
  try {
    logger.info(`Getting retention state for ${serviceName} stack ${stackName} in ${accountId}:${region}`, logPrefix);

    // Create DynamoDB client for home region (state tables are in the pipeline account)
    const client = createDynamoDBClient(
      params.runnerParameters.sessionContext.region,
      params.runnerParameters.solutionId,
    );

    // Get dynamic table name
    const tableName = getRetentionStateTableName(params);

    // Build composite sort key
    const sortKey = `STACK#${accountId}#${region}#${stackName}`;

    // Get retention state
    const item = await getItem(
      client,
      tableName,
      {
        PK: `RETENTION#${serviceName}`,
        SK: sortKey,
      },
      logPrefix,
    );

    if (!item) {
      logger.info(
        `No retention state found for ${serviceName} stack ${stackName} in ${accountId}:${region}`,
        logPrefix,
      );
      return undefined;
    }

    // Map DynamoDB item to interface
    const state: IResourceRetentionState = {
      serviceName: item['serviceName'] as string,
      accountId: item['accountId'] as string,
      region: item['region'] as string,
      stackName: item['stackName'] as string,
      resourceTypes: item['resourceTypes'] as string[],
      retentionStatus: item['retentionStatus'] as RetentionStatus,
      retentionTime: item['retentionTime'] as string | undefined,
      retentionAttempts: item['retentionAttempts'] as number,
      lastError: item['lastError'] as string | undefined,
      resourcesRetained: item['resourcesRetained'] as boolean,
    };

    logger.info(`Retrieved retention state for ${serviceName} stack ${stackName}: ${state.retentionStatus}`, logPrefix);
    return state;
  } catch (error: unknown) {
    logger.error(`Error getting retention state for ${serviceName} stack ${stackName}: ${error}`, logPrefix);
    // Return undefined on error (safe default - will attempt retention)
    return undefined;
  }
}

/**
 * Save retention state to DynamoDB.
 * Creates or updates the retention state for a CloudFormation stack.
 *
 * @param state - Retention state object to save
 * @param params - Module parameters for DynamoDB access
 * @param logPrefix - Logging prefix
 * @param dryRun - Whether to perform dry run (default: false)
 *
 * @example
 * ```typescript
 * await saveRetentionState(
 *   {
 *     serviceName: 'macie',
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     resourceTypes: ['Custom::MacieExportConfigClassification'],
 *     retentionStatus: 'COMPLETED',
 *     retentionTime: '2024-01-15T10:30:00.000Z',
 *     retentionAttempts: 1,
 *     resourcesRetained: true
 *   },
 *   params,
 *   logPrefix,
 *   false
 * );
 * ```
 */
export async function saveRetentionState(
  state: IResourceRetentionState,
  params: ModuleParams,
  logPrefix: string,
  dryRun: boolean,
): Promise<void> {
  try {
    statusLogger.info(`Saving retention status for stack ${state.stackName}`, logPrefix);
    logger.info(
      `Saving retention state for ${state.serviceName} stack ${state.stackName} in ${state.accountId}:${state.region}`,
      logPrefix,
    );

    // Create DynamoDB client for home region (state tables are in the pipeline account)
    const client = createDynamoDBClient(
      params.runnerParameters.sessionContext.region,
      params.runnerParameters.solutionId,
    );

    // Get dynamic table name
    const tableName = getRetentionStateTableName(params);

    // Build composite sort key
    const sortKey = `STACK#${state.accountId}#${state.region}#${state.stackName}`;

    // Build DynamoDB item
    const item = {
      PK: `RETENTION#${state.serviceName}`,
      SK: sortKey,
      serviceName: state.serviceName,
      accountId: state.accountId,
      region: state.region,
      stackName: state.stackName,
      resourceTypes: state.resourceTypes,
      retentionStatus: state.retentionStatus,
      retentionTime: state.retentionTime,
      retentionAttempts: state.retentionAttempts,
      lastError: state.lastError,
      resourcesRetained: state.resourcesRetained,
    };

    // Save to DynamoDB
    await putItem(client, tableName, item, logPrefix, dryRun);

    statusLogger.info(`Retention status saved successfully for stack ${state.stackName}`, logPrefix);
    logger.info(
      `Saved retention state for ${state.serviceName} stack ${state.stackName}: ${state.retentionStatus}`,
      logPrefix,
    );
  } catch (error: unknown) {
    // Log error but don't fail - state save is not critical
    logger.error(`Error saving retention state for ${state.serviceName} stack ${state.stackName}: ${error}`, logPrefix);
    logger.warn(
      `Continuing execution despite retention state save failure for ${state.serviceName} stack ${state.stackName}`,
      logPrefix,
    );
  }
}

/**
 * Configuration interface for updating retention status.
 *
 * @interface IUpdateRetentionStatusConfig
 * @private
 *
 * @description
 * Internal configuration structure used by updateRetentionStatus()
 * to update retention status without reconstructing the entire state object.
 *
 * @property {string} serviceName - Service name (e.g., 'macie', 'guardduty')
 * @property {string} accountId - AWS account ID where the stack exists
 * @property {string} region - AWS region where the stack exists
 * @property {string} stackName - CloudFormation stack name
 * @property {RetentionStatus} status - New retention status
 * @property {string} [error] - Error message if status is FAILED
 * @property {boolean} dryRun - Whether this is a dry run execution
 */
interface IUpdateRetentionStatusConfig {
  readonly serviceName: string;
  readonly accountId: string;
  readonly region: string;
  readonly stackName: string;
  readonly status: RetentionStatus;
  readonly error?: string;
  readonly dryRun: boolean;
  /** Updated resource types to store (e.g., when new service types are added to the registry) */
  readonly resourceTypes?: string[];
}

/**
 * Update retention status for a CloudFormation stack.
 * Convenience function to update status without reconstructing the entire state object.
 *
 * @param config - Update configuration
 * @param params - Module parameters for DynamoDB access
 * @param logPrefix - Logging prefix
 *
 * @example
 * ```typescript
 * // Mark retention as in progress
 * await updateRetentionStatus(
 *   {
 *     serviceName: 'macie',
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     status: 'IN_PROGRESS',
 *     dryRun: false
 *   },
 *   params,
 *   logPrefix
 * );
 *
 * // Mark retention as failed with error
 * await updateRetentionStatus(
 *   {
 *     serviceName: 'macie',
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     status: 'FAILED',
 *     error: 'Stack not found',
 *     dryRun: false
 *   },
 *   params,
 *   logPrefix
 * );
 * ```
 */
export async function updateRetentionStatus(
  config: IUpdateRetentionStatusConfig,
  params: ModuleParams,
  logPrefix: string,
): Promise<void> {
  logger.info(
    `Updating retention status for ${config.serviceName} stack ${config.stackName} to ${config.status}`,
    logPrefix,
  );

  // Get existing state
  const existingState = await getRetentionState(
    config.serviceName,
    config.accountId,
    config.region,
    config.stackName,
    params,
    logPrefix,
  );

  if (!existingState) {
    logger.warn(
      `Cannot update retention status for ${config.serviceName} stack ${config.stackName}: no existing state found`,
      logPrefix,
    );
    return;
  }

  // Build updated state
  const updatedState: IResourceRetentionState = {
    ...existingState,
    retentionStatus: config.status,
    retentionTime:
      config.status === RetentionStatus.COMPLETED || config.status === RetentionStatus.NOT_FOUND
        ? new Date().toISOString()
        : existingState.retentionTime,
    retentionAttempts:
      config.status === RetentionStatus.FAILED ? existingState.retentionAttempts + 1 : existingState.retentionAttempts,
    lastError: config.error,
    resourcesRetained:
      config.status === RetentionStatus.COMPLETED || config.status === RetentionStatus.NOT_FOUND
        ? true
        : existingState.resourcesRetained,
    // Update resourceTypes if new types provided (e.g., new service added to registry)
    ...(config.resourceTypes && { resourceTypes: config.resourceTypes }),
  };

  // Save updated state
  await saveRetentionState(updatedState, params, logPrefix, config.dryRun);

  const typeSuffix = config.resourceTypes ? ` with resourceTypes: [${config.resourceTypes.join(', ')}]` : '';
  logger.info(
    `Updated retention status for ${config.serviceName} stack ${config.stackName} to ${config.status}${typeSuffix}`,
    logPrefix,
  );
}

/**
 * Get all retention states for a service with pagination support.
 * Returns a Map for O(1) lookups by composite key.
 *
 * This function is optimized for scalability - instead of querying DynamoDB
 * individually for each stack (which could be 10,000+ queries), it queries
 * all retention states for a service with automatic pagination and builds an in-memory Map.
 *
 * **CRITICAL**: This function implements pagination to handle large deployments.
 * DynamoDB has a 1 MB response limit (~2,000 items). For deployments with >2,000 retention
 * states, pagination is essential to retrieve all records.
 *
 * @param serviceName - Service name (e.g., 'MACIE', 'GUARDDUTY')
 * @param params - Module parameters for DynamoDB access
 * @param logPrefix - Logging prefix
 * @returns Map of retention states keyed by composite key (accountId:region:stackName)
 *
 * @example
 * ```typescript
 * // Get all Macie retention states with automatic pagination
 * const allStates = await getAllRetentionStates('macie', params, logPrefix);
 *
 * // O(1) lookup for specific stack
 * const key = `${accountId}:${region}:${stackName}`;
 * const state = allStates.get(key);
 *
 * if (state?.retentionStatus === 'COMPLETED') {
 *   logger.info('Retention already completed, skipping');
 * }
 *
 * // Performance comparison for 10,000 stacks:
 * // - Individual queries: 10,000 DynamoDB queries (~30 seconds)
 * // - Batch query with pagination: 5 queries + in-memory filtering (~1 second)
 * ```
 */
export async function getAllRetentionStates(
  serviceName: string,
  params: ModuleParams,
  logPrefix: string,
): Promise<Map<string, IResourceRetentionState>> {
  try {
    statusLogger.info(`Getting all retention states for ${serviceName} with pagination support`, logPrefix);

    // Create DynamoDB client for home region (state tables are in the pipeline account)
    const client = createDynamoDBClient(
      params.runnerParameters.sessionContext.region,
      params.runnerParameters.solutionId,
    );

    // Get dynamic table name
    const tableName = getRetentionStateTableName(params);

    // Query retention states for this service using partition key with pagination enabled
    const result = await queryDynamoDBTable({
      client,
      logPrefix,
      tableName,
      partitionKey: {
        name: 'PK',
        value: `RETENTION#${serviceName}`,
      },
      pagination: { enabled: true },
    });

    // Build Map for O(1) lookups
    const statesMap = new Map<string, IResourceRetentionState>();

    if (!result.items || result.items.length === 0) {
      statusLogger.info(`No retention states found for ${serviceName}`, logPrefix);
      return statesMap;
    }

    // Convert DynamoDB items to IResourceRetentionState and add to Map
    for (const item of result.items) {
      const state: IResourceRetentionState = {
        serviceName: item['serviceName'] as string,
        accountId: item['accountId'] as string,
        region: item['region'] as string,
        stackName: item['stackName'] as string,
        resourceTypes: item['resourceTypes'] as string[],
        retentionStatus: item['retentionStatus'] as RetentionStatus,
        retentionTime: item['retentionTime'] as string | undefined,
        retentionAttempts: item['retentionAttempts'] as number,
        lastError: item['lastError'] as string | undefined,
        resourcesRetained: item['resourcesRetained'] as boolean,
      };

      // Build composite key for O(1) lookups
      const key = `${state.accountId}:${state.region}:${state.stackName}`;
      statesMap.set(key, state);
    }

    logger.info(
      `Retrieved ${statesMap.size} retention states for ${serviceName} across ${result.pageCount} page(s)`,
      logPrefix,
    );

    // Warn if we might have hit pagination limit
    if (result.lastEvaluatedKey) {
      logger.warn(
        `Pagination limit reached for ${serviceName}. Retrieved ${result.totalItems} items across ${result.pageCount} pages. ` +
          `There may be more retention states available. Consider increasing maxPages if needed.`,
        logPrefix,
      );
    }

    return statesMap;
  } catch (error: unknown) {
    logger.error(`Error getting all retention states for ${serviceName}: ${error}`, logPrefix);
    // Return empty Map on error (safe default - will attempt retention for all stacks)
    return new Map();
  }
}

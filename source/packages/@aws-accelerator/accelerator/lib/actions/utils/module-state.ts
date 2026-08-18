/**
 * @fileoverview Module state management utilities for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module provides comprehensive state management capabilities for LZA modules including:
 * - Configuration change detection using SHA256 hashing
 * - Module execution state persistence in DynamoDB
 * - Execution history tracking with TTL
 * - Configuration difference analysis for debugging
 *
 * State management enables LZA modules to:
 * - Skip redundant operations when configuration hasn't changed
 * - Track execution history for audit and troubleshooting
 * - Detect configuration drift and changes
 * - Maintain idempotent behavior across executions
 *
 * All state is stored in a centralized DynamoDB table in the home region of the pipeline account,
 * accessible by all modules regardless of their execution region. This ensures
 * consistent state management across multi-region deployments.
 *
 * @example
 * ```typescript
 * // Check if configuration changed
 * const configChanged = await hasModuleConfigChanged(
 *   {
 *     serviceName: 'macie',
 *     currentConfig: { enable: true, accountsCount: 5 },
 *     overrideExisting: false
 *   },
 *   params,
 *   'XXXXXXXXXXXX:us-east-1'
 * );
 *
 * if (!configChanged) {
 *   // Skip execution - config unchanged
 *   return { status: 'SKIPPED', summary: 'Configuration unchanged' };
 * }
 *
 * // Execute module operations...
 *
 * // Save execution state
 * await saveModuleExecutionState(
 *   {
 *     serviceName: 'macie',
 *     config: { enable: true, accountsCount: 5 },
 *     status: 'COMPLETED',
 *     response: moduleResponse,
 *     dryRun: false
 *   },
 *   params,
 *   'XXXXXXXXXXXX:us-east-1'
 * );
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ | DynamoDB Developer Guide}
 */

/**
 * Module state management utilities.
 * Provides functions for tracking module configuration changes and execution state.
 */

import { createLogger, createStatusLogger } from 'aws-lza';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { ModuleParams } from '../../types';
import { createDynamoDBClient, getItem, getModuleResourcePrefix, putItem } from './dynamodb';
import { IModuleExecutionState, IModuleStateConfig } from './types';

/**
 * Logger instance for module state operations.
 *
 * @private
 * @constant
 *
 * @description
 * Provides structured logging for module state management operations including:
 * - Configuration change detection
 * - State retrieval and persistence
 * - Hash calculations
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
 * Gets the DynamoDB table name for module state storage.
 *
 * @private
 * @function getModuleStateTableName
 *
 * @description
 * Constructs the module state table name using the LZA naming convention.
 * The table is created in the home region (where the module infrastructure stack is deployed)
 * in the pipeline account, accessible by all modules regardless of their execution region.
 *
 * Table naming format: `{prefix}-Module-State-{accountId}-{homeRegion}`
 *
 * @param {ModuleParams} params - Module parameters containing resource prefixes and session context
 *
 * @returns {string} DynamoDB table name for module state
 *
 * @example
 * ```typescript
 * const tableName = getModuleStateTableName(params);
 * // Returns: "AWSAccelerator-Module-State-XXXXXXXXXXXX-us-east-1"
 * ```
 */
function getModuleStateTableName(params: ModuleParams): string {
  return `${getModuleResourcePrefix()}-Module-State-${params.runnerParameters.sessionContext.invokingAccountId}-${params.runnerParameters.sessionContext.region}`;
}

/**
 * Validates configuration object before hashing.
 *
 * @private
 * @function validateConfig
 *
 * @description
 * Ensures the configuration object is valid and serializable before hash calculation.
 * Checks for:
 * - Undefined values
 * - Non-object types
 * - Circular references
 * - Non-serializable values
 *
 * @param {unknown} config - Configuration object to validate
 *
 * @throws {TypeError} When config is undefined
 * @throws {TypeError} When config is not an object
 * @throws {TypeError} When config contains circular references or non-serializable values
 *
 * @example
 * ```typescript
 * validateConfig({ enable: true }); // OK
 * validateConfig(undefined); // Throws: Config cannot be undefined
 * validateConfig("string"); // Throws: Config must be an object
 * ```
 */
function validateConfig(config: unknown): void {
  if (config === undefined) {
    throw new TypeError('Config cannot be undefined');
  }

  if (typeof config !== 'object' || config === null) {
    throw new TypeError('Config must be an object');
  }

  // Check for circular references (would cause JSON.stringify to fail)
  try {
    JSON.stringify(config);
  } catch (error: unknown) {
    throw new TypeError(`Config contains circular references or non-serializable values: ${error}`);
  }
}

/**
 * Finds differences between two configuration objects for debugging.
 *
 * @private
 * @function findConfigDifferences
 * @template T - Type of the configuration objects
 *
 * @description
 * Performs a shallow comparison of two configuration objects and identifies
 * fields that have changed, been added, or been removed. Used for debugging
 * configuration changes between executions.
 *
 * The function:
 * - Compares all keys in the current config
 * - Identifies removed keys from the previous config
 * - Returns an object mapping changed keys to their old and new values
 *
 * @param {T} current - Current configuration object
 * @param {T} previous - Previous configuration object
 *
 * @returns {Record<string, {previous: unknown, current: unknown}>} Object containing the differences
 *
 * @example
 * ```typescript
 * const current = { enable: true, accountsCount: 5, regions: ['us-east-1'] };
 * const previous = { enable: true, accountsCount: 3, oldField: 'removed' };
 *
 * const diffs = findConfigDifferences(current, previous);
 * // Returns: {
 * //   accountsCount: { previous: 3, current: 5 },
 * //   regions: { previous: undefined, current: ['us-east-1'] },
 * //   oldField: { previous: 'removed', current: undefined }
 * // }
 * ```
 */
function findConfigDifferences<T = unknown>(
  current: T,
  previous: T,
): Record<string, { previous: unknown; current: unknown }> {
  const differences: Record<string, { previous: unknown; current: unknown }> = {};

  // Ensure both configs are objects
  if (typeof current !== 'object' || current === null || typeof previous !== 'object' || previous === null) {
    return differences;
  }

  // Check all keys in current config
  for (const key of Object.keys(current as object)) {
    const currentValue = JSON.stringify((current as Record<string, unknown>)[key]);
    const previousValue = JSON.stringify((previous as Record<string, unknown>)[key]);

    if (currentValue !== previousValue) {
      differences[key] = {
        previous: (previous as Record<string, unknown>)[key],
        current: (current as Record<string, unknown>)[key],
      };
    }
  }

  // Check for removed keys
  for (const key of Object.keys(previous as object)) {
    if (!(key in (current as object))) {
      differences[key] = {
        previous: (previous as Record<string, unknown>)[key],
        current: undefined,
      };
    }
  }

  return differences;
}

/**
 * Calculate SHA256 hash of configuration object.
 * Ensures consistent serialization for reliable hash comparison.
 *
 * @typeParam T - Type of the configuration object
 * @param config - Configuration object to hash
 * @returns SHA256 hash string (hex format)
 *
 * @example
 * ```typescript
 * const config = { enable: true, regions: ['us-east-1'] };
 * const hash = calculateConfigHash(config);
 * // Returns: "a1b2c3d4e5f6..."
 * ```
 */
export function calculateConfigHash<T = unknown>(config: T): string {
  // Validate config before hashing
  validateConfig(config);

  // Deep sort all keys recursively for consistent hashing
  const sorted = deepSortKeys(config);
  const configString = JSON.stringify(sorted);

  // Calculate SHA256 hash
  const hash = createHash('sha256').update(configString).digest('hex');

  return hash;
}

/**
 * Recursively sorts all object keys at every nesting level.
 * Arrays are preserved in order but their object elements are deep-sorted.
 * Primitives are returned as-is.
 */
function deepSortKeys(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => deepSortKeys(item));
  }

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Calculate SHA256 hash for an array of strings.
 * Ensures consistent hashing regardless of array order by sorting before hashing.
 *
 * @param items - Array of strings to hash (e.g., account IDs, region names)
 * @param hashLength - Length of hash to return (default: 12 characters)
 * @returns Truncated SHA256 hash string (hex format)
 *
 * @example
 * ```typescript
 * const accountIds = ['XXXXXXXXXXXX', 'YYYYYYYYYYYY', 'ZZZZZZZZZZZZ'];
 * const hash = calculateArrayHash(accountIds);
 * // Returns: "a1b2c3d4e5f6" (12 characters)
 *
 * // Order doesn't matter - same hash
 * const hash2 = calculateArrayHash(['ZZZZZZZZZZZZ', 'XXXXXXXXXXXX', 'YYYYYYYYYYYY']);
 * // Returns: "a1b2c3d4e5f6" (same hash)
 * ```
 */
export function calculateArrayHash(items: string[], hashLength: number = 12): string {
  // Sort array to ensure consistent hash regardless of order
  const sorted = [...items].sort();

  // Calculate SHA256 hash
  const hash = createHash('sha256').update(JSON.stringify(sorted)).digest('hex').substring(0, hashLength);

  return hash;
}

/**
 * Get module execution state from DynamoDB.
 * Retrieves the latest execution state for a service.
 *
 * @param serviceName - Service name (e.g., 'MACIE', 'GUARDDUTY')
 * @param params - Module parameters for DynamoDB access
 * @param logPrefix - Logging prefix
 * @returns Module execution state or undefined if not found
 * @throws {Error} When ANY error occurs accessing DynamoDB (table not found, permission denied, network errors, query failures, etc.)
 *
 * @example
 * ```typescript
 * try {
 *   const state = await getModuleExecutionState('macie', params, 'XXXXXXXXXXXX:us-east-1');
 *   if (state) {
 *     // State found - use previous execution data
 *     logger.info('Last execution:', state.lastExecutionTime);
 *     logger.info('Config hash:', state.configHash);
 *   } else {
 *     // No previous execution found (first run)
 *     logger.info('No previous execution found');
 *   }
 * } catch (error) {
 *   // State management failure - table not found, permission denied, network error, etc.
 *   logger.error('Failed to access state table:', error);
 * }
 * ```
 */
export async function getModuleExecutionState(
  serviceName: string,
  params: ModuleParams,
  logPrefix: string,
): Promise<IModuleExecutionState | undefined> {
  logger.info(`Getting module execution state for ${serviceName}`, logPrefix);

  // Create DynamoDB client for home region (state tables are in the pipeline account)
  const client = createDynamoDBClient(
    params.runnerParameters.sessionContext.region,
    params.runnerParameters.solutionId,
  );

  // Get dynamic table name
  const tableName = getModuleStateTableName(params);

  // Get latest execution state
  // NOTE: getItem() throws on ANY DynamoDB error (table not found, permission denied, network errors, query failures, etc.)
  // This is intentional - ANY state management failure should fail-fast, not be treated as "no previous state"
  const item = await getItem(
    client,
    tableName,
    {
      PK: `MODULE#${serviceName}`,
      SK: 'EXECUTION#latest',
    },
    logPrefix,
  );

  if (!item) {
    logger.info(`No previous execution state found for ${serviceName}`, logPrefix);
    return undefined;
  }

  // Map DynamoDB item to interface
  const state: IModuleExecutionState = {
    serviceName: item['serviceName'] as string,
    lastExecutionTime: item['lastExecutionTime'] as string,
    lastConfig: item['lastConfig'] as string,
    configHash: item['configHash'] as string,
    lastStatus: item['lastStatus'] as string,
    lastResponse: item['lastResponse'] as string,
  };

  logger.info(`Retrieved execution state for ${serviceName} from ${state.lastExecutionTime}`, logPrefix);
  return state;
}

/**
 * Check if module configuration has changed since last execution.
 * Compares current config hash with last execution config hash.
 *
 * @typeParam T - Type of the configuration object
 * @param config - Module state configuration
 * @param params - Module parameters for DynamoDB access
 * @param logPrefix - Logging prefix
 * @returns True if config changed or no previous execution, false otherwise
 * @throws {Error} When ANY error occurs accessing DynamoDB (table not found, permission denied, network errors, query failures, etc.)
 *
 * @example
 * ```typescript
 * // Without type parameter
 * try {
 *   const changed = await hasModuleConfigChanged({
 *     serviceName: 'MACIE',
 *     currentConfig: { enable: true, accountsCount: 5 },
 *     overrideExisting: false
 *   }, params, logPrefix);
 *
 *   if (!changed) {
 *     return { status: 'SKIPPED', summary: 'Config unchanged' };
 *   }
 * } catch (error) {
 *   // State management failure - fail-fast
 *   return { status: 'FAILED', summary: `State check failed: ${error.message}` };
 * }
 *
 * // With type parameter (type-safe)
 * interface IMacieConfigForState {
 *   enable: boolean;
 *   accountsCount: number;
 * }
 *
 * const changed = await hasModuleConfigChanged<IMacieConfigForState>({
 *   serviceName: 'MACIE',
 *   currentConfig: { enable: true, accountsCount: 5 },
 *   overrideExisting: false
 * }, params, logPrefix);
 * ```
 */
export async function hasModuleConfigChanged<T = unknown>(
  config: IModuleStateConfig<T>,
  params: ModuleParams,
  logPrefix: string,
): Promise<boolean> {
  statusLogger.info(`Checking if ${config.serviceName} configuration has changed`, logPrefix);

  // If override existing is enabled, always return true (skip expensive hash calculation)
  if (config.overrideExisting) {
    statusLogger.info(`Override existing enabled for ${config.serviceName} - skipping config comparison`, logPrefix);
    return true;
  }

  // Calculate current config hash
  const currentHash = calculateConfigHash(config.currentConfig);
  logger.info(`Current config hash for ${config.serviceName}: ${currentHash}`, logPrefix);

  // Get previous execution state
  // NOTE: This throws on ANY DynamoDB error (table not found, permission denied, network errors, query failures, etc.)
  // This is intentional - ANY state management failure should fail-fast
  const previousState = await getModuleExecutionState(config.serviceName, params, logPrefix);

  // If no previous execution, config has "changed" (first run)
  if (!previousState) {
    statusLogger.info(`No previous execution found for ${config.serviceName} - treating as changed`, logPrefix);
    return true;
  }

  // If previous execution failed, always retry regardless of config hash
  if (previousState.lastStatus === 'failed') {
    statusLogger.info(`Previous execution failed for ${config.serviceName} - retrying`, logPrefix);
    return true;
  }

  // Compare hashes
  const previousHash = previousState.configHash;
  logger.info(`Previous config hash for ${config.serviceName}: ${previousHash}`, logPrefix);

  if (currentHash === previousHash) {
    statusLogger.info(`Configuration unchanged for ${config.serviceName}`, logPrefix);
    return false;
  }

  // Config changed - log what changed for debugging
  statusLogger.info(`Configuration changed for ${config.serviceName}`, logPrefix);

  try {
    const currentConfigObj = config.currentConfig;
    const previousConfigObj = JSON.parse(previousState.lastConfig) as T;

    // Validate previous config is a valid object (security check)
    if (typeof previousConfigObj !== 'object' || previousConfigObj === null) {
      const actualType = previousConfigObj === null ? 'null' : typeof previousConfigObj;
      throw new TypeError(
        `Invalid previous config for ${config.serviceName}: expected object, got ${actualType}. ` +
          `This may indicate corrupted or manipulated state data in DynamoDB.`,
      );
    }

    const differences = findConfigDifferences(currentConfigObj, previousConfigObj);
    const diffCount = Object.keys(differences).length;

    if (diffCount > 0) {
      logger.info(
        `Detected ${diffCount} config difference(s) for ${config.serviceName}: ${JSON.stringify(differences)}`,
        logPrefix,
      );
    }
  } catch (error: unknown) {
    logger.warn(`Could not parse config differences for ${config.serviceName}: ${error}`, logPrefix);
    logger.warn(`This may indicate corrupted state data or schema changes for ${config.serviceName}`, logPrefix);
    statusLogger.warn(
      `Configuration comparison failed for ${config.serviceName} - proceeding with execution due to hash mismatch`,
      logPrefix,
    );
  }

  return true;
}

/**
 * Configuration interface for saving module execution state.
 *
 * @interface ISaveModuleStateConfig
 * @template T - Type of the configuration object
 * @private
 *
 * @description
 * Internal configuration structure used by saveModuleExecutionState()
 * to persist module execution state to DynamoDB.
 *
 * @property {string} serviceName - Service name (e.g., 'macie', 'guardduty')
 * @property {T} config - Configuration object to save
 * @property {string} status - Execution status (e.g., 'COMPLETED', 'FAILED', 'SKIPPED')
 * @property {unknown} response - Module execution response object
 * @property {boolean} dryRun - Whether this was a dry run execution
 */
interface ISaveModuleStateConfig<T = unknown> {
  readonly serviceName: string;
  readonly config: T;
  readonly status: string;
  readonly response: unknown;
  readonly dryRun: boolean;
}

/**
 * Save module execution state to DynamoDB with efficient history management.
 *
 * @typeParam T - Type of the configuration object
 * @param stateConfig - Module state configuration
 * @param params - Module parameters for DynamoDB access
 * @param logPrefix - Logging prefix
 *
 * @description
 * Persists module execution state using an efficient two-record pattern:
 * - Current state: Stored with SK="EXECUTION#latest" (permanent, no TTL)
 * - Historical states: Stored with SK="EXECUTION#{timestamp}" (1-year TTL)
 *
 * State management flow:
 * 1. First execution: Creates only "EXECUTION#latest" record
 * 2. Subsequent executions:
 *    - Reads current "EXECUTION#latest" record
 *    - Archives it to "EXECUTION#{previousTimestamp}" with 1-year TTL
 *    - Updates "EXECUTION#latest" with new state
 *
 * This design ensures:
 * - Efficient storage: N executions = N records (N-1 history + 1 latest)
 * - Fast current state lookup: Direct key access to "EXECUTION#latest"
 * - Complete audit trail: All historical states preserved with timestamps
 * - Automatic cleanup: Historical records expire after 1 year via TTL
 * - No data duplication: Current state never duplicates most recent history
 *
 * @example
 * ```typescript
 * // First execution - creates only "latest"
 * await saveModuleExecutionState(
 *   {
 *     serviceName: 'macie',
 *     config: { enable: true, accountsCount: 5 },
 *     status: 'COMPLETED',
 *     response: { status: 'COMPLETED', summary: 'Macie enabled' },
 *     dryRun: false
 *   },
 *   params,
 *   'XXXXXXXXXXXX:us-east-1'
 * );
 * // Table state: 1 record
 * //   - EXECUTION#latest (enable: true)
 *
 * // Second execution - archives previous, creates new latest
 * await saveModuleExecutionState(
 *   {
 *     serviceName: 'macie',
 *     config: { enable: false, accountsCount: 5 },
 *     status: 'COMPLETED',
 *     response: { status: 'COMPLETED', summary: 'Macie disabled' },
 *     dryRun: false
 *   },
 *   params,
 *   'XXXXXXXXXXXX:us-east-1'
 * );
 * // Table state: 2 records
 * //   - EXECUTION#2026-02-12T10:00:00Z (enable: true, TTL: 1 year)
 * //   - EXECUTION#latest (enable: false)
 *
 * // Third execution - archives previous, creates new latest
 * await saveModuleExecutionState(
 *   {
 *     serviceName: 'macie',
 *     config: { enable: true, accountsCount: 8 },
 *     status: 'COMPLETED',
 *     response: { status: 'COMPLETED', summary: 'Macie re-enabled' },
 *     dryRun: false
 *   },
 *   params,
 *   'XXXXXXXXXXXX:us-east-1'
 * );
 * // Table state: 3 records
 * //   - EXECUTION#2026-02-12T10:00:00Z (enable: true, TTL: 1 year)
 * //   - EXECUTION#2026-02-12T14:30:00Z (enable: false, TTL: 1 year)
 * //   - EXECUTION#latest (enable: true)
 * ```
 */
export async function saveModuleExecutionState<T = unknown>(
  stateConfig: ISaveModuleStateConfig<T>,
  params: ModuleParams,
  logPrefix: string,
): Promise<void> {
  try {
    logger.info(`Saving module execution state for ${stateConfig.serviceName}`, logPrefix);

    // Create DynamoDB client for home region (state tables are in the pipeline account)
    const client = createDynamoDBClient(
      params.runnerParameters.sessionContext.region,
      params.runnerParameters.solutionId,
    );

    // Calculate config hash
    const configHash = calculateConfigHash(stateConfig.config);
    const executionTime = new Date().toISOString();

    // Get dynamic table name
    const tableName = getModuleStateTableName(params);

    // Build state item
    const stateItem = {
      serviceName: stateConfig.serviceName,
      lastExecutionTime: executionTime,
      lastConfig: JSON.stringify(stateConfig.config),
      configHash,
      lastStatus: stateConfig.status,
      lastResponse: JSON.stringify(stateConfig.response),
    };

    // Check if this is the first execution by trying to get current "latest" record
    const previousLatest = await getItem(
      client,
      tableName,
      {
        PK: `MODULE#${stateConfig.serviceName}`,
        SK: 'EXECUTION#latest',
      },
      logPrefix,
    );

    // If previous "latest" exists, move it to history before updating
    if (previousLatest) {
      const previousExecutionTime = previousLatest['lastExecutionTime'] as string;
      const ttl = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year TTL

      logger.info(
        `Moving previous latest state to history: ${previousExecutionTime} for ${stateConfig.serviceName}`,
        logPrefix,
      );

      // Save previous "latest" to timestamped history record
      await putItem(
        client,
        tableName,
        {
          PK: `MODULE#${stateConfig.serviceName}`,
          SK: `EXECUTION#${previousExecutionTime}`,
          serviceName: previousLatest['serviceName'],
          lastExecutionTime: previousLatest['lastExecutionTime'],
          lastConfig: previousLatest['lastConfig'],
          configHash: previousLatest['configHash'],
          lastStatus: previousLatest['lastStatus'],
          lastResponse: previousLatest['lastResponse'],
          ttl,
        },
        logPrefix,
        stateConfig.dryRun,
      );

      logger.info(`Moved previous state to history for ${stateConfig.serviceName}`, logPrefix);
    } else {
      logger.info(`First execution for ${stateConfig.serviceName} - no previous state to archive`, logPrefix);
    }

    // Save new state to "latest" key
    await putItem(
      client,
      tableName,
      {
        PK: `MODULE#${stateConfig.serviceName}`,
        SK: 'EXECUTION#latest',
        ...stateItem,
      },
      logPrefix,
      stateConfig.dryRun,
    );

    logger.info(`Saved latest execution state for ${stateConfig.serviceName} at ${executionTime}`, logPrefix);
  } catch (error: unknown) {
    logger.error(`Error saving module execution state for ${stateConfig.serviceName}: ${error}`, logPrefix);
    logger.warn(`Continuing execution despite state save failure for ${stateConfig.serviceName}`, logPrefix);
  }
}

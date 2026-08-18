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
 * @fileoverview Resource ownership state management for LZA modules.
 *
 * @description
 * Provides generic resource-level ownership tracking for modules that need to
 * distinguish between resources they created vs resources created externally.
 *
 * This enables safe reconciliation: modules only delete resources they previously
 * created (tracked in state), leaving externally-created resources untouched.
 *
 * Owned resources are stored in the module's lastResponse field (part of the
 * EXECUTION#latest DDB item) — no separate DDB item is needed. The module
 * returns ownedResources in its response, which saveModuleExecutionState
 * persists as lastResponse. On the next run, loadOwnedResources reads it back.
 *
 * Use cases:
 * - TGW associations/propagations (don't delete customer-managed resources)
 * - Any future module that coexists with external resource management
 *
 * @example
 * ```typescript
 * // Load previously owned resources (from lastResponse in EXECUTION#latest)
 * const owned = await loadOwnedResources(params, 'tgw-associations-and-propagations', logPrefix);
 *
 * // Pass to module — deletion filters use ownedResourceIds.has() inline
 * // No separate save needed — ownedResources in the module response flows
 * // into lastResponse via saveModuleExecutionState automatically.
 * ```
 */

import { createLogger } from 'aws-lza';
import path from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { ModuleParams } from '../../types';
import { getModuleExecutionState } from './module-state';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const COMPRESSED_PREFIX = 'gz:';

/**
 * Loads previously owned resource IDs for a module from the EXECUTION#latest DDB item.
 * Delegates DDB access to the shared {@link getModuleExecutionState} utility, then
 * extracts ownedResources from the serialized lastResponse field.
 *
 * @param params - Module parameters for DDB access
 * @param serviceName - Service name (e.g., 'tgw-associations-and-propagations')
 * @param logPrefix - Prefix for logging messages
 * @returns Array of owned resource ID strings, or empty array if no state exists
 * @throws When persisted execution state is malformed or cannot be decompressed
 */
export async function loadOwnedResources(
  params: ModuleParams,
  serviceName: string,
  logPrefix: string,
): Promise<string[]> {
  const state = await getModuleExecutionState(serviceName, params, logPrefix);

  if (!state) {
    logger.info(
      `No previous execution state found for ${serviceName}, treating as first run (no owned resources)`,
      logPrefix,
    );
    return [];
  }

  // A failed execution may contain partial results, so it cannot authorize deletions.
  if (state.lastStatus === 'failed') {
    logger.info(`Previous execution failed for ${serviceName}, using create-only mode (no deletions)`, logPrefix);
    return [];
  }

  if (!state.lastResponse) {
    logger.info(`No lastResponse found for ${serviceName}, treating as no owned resources`, logPrefix);
    return [];
  }

  try {
    const lastResponse: unknown = JSON.parse(state.lastResponse);
    const ownedResources = getOwnedResources(lastResponse);
    if (ownedResources === undefined) {
      logger.info(`No owned resources in lastResponse for ${serviceName}`, logPrefix);
      return [];
    }

    const resourceIds = parseOwnedResources(ownedResources);
    logger.info(`Loaded ${resourceIds.length} owned resources for ${serviceName} from lastResponse`, logPrefix);
    return resourceIds;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to load owned resources for ${serviceName}: ${errorMessage}`, logPrefix);
    throw new Error(`Failed to load owned resources for ${serviceName}: ${errorMessage}`);
  }
}

/**
 * Compress owned resource IDs for storage in the module state response.
 *
 * @param ownedResources Resource IDs to compress
 * @returns A gzipped, base64-encoded string for non-empty input, or an empty array
 * @throws When gzip compression fails
 */
export function compressOwnedResources(ownedResources: string[]): string | string[] {
  if (ownedResources.length === 0) {
    return [];
  }

  const compressed = gzipSync(Buffer.from(JSON.stringify(ownedResources), 'utf-8'));
  return `${COMPRESSED_PREFIX}${compressed.toString('base64')}`;
}

/**
 * Read the ownership field from a module response.
 *
 * @param lastResponse Parsed module response
 * @returns Persisted ownership value, or undefined when the field is absent
 */
function getOwnedResources(lastResponse: unknown): unknown {
  if (typeof lastResponse !== 'object' || lastResponse === null) {
    throw new TypeError('lastResponse must be an object');
  }

  const response = (lastResponse as Record<string, unknown>)['response'];
  if (response === undefined) {
    return undefined;
  }
  if (typeof response !== 'object' || response === null) {
    throw new TypeError('lastResponse.response must be an object');
  }

  return (response as Record<string, unknown>)['ownedResources'];
}

/**
 * Parse compressed or uncompressed ownership state.
 *
 * @param ownedResources Persisted ownership value
 * @returns String resource IDs, excluding unexpected non-string array entries
 */
function parseOwnedResources(ownedResources: unknown): string[] {
  let parsedResources = ownedResources;

  if (typeof parsedResources === 'string') {
    if (!parsedResources.startsWith(COMPRESSED_PREFIX)) {
      throw new TypeError('ownedResources string is missing the gz: prefix');
    }
    const compressed = Buffer.from(parsedResources.slice(COMPRESSED_PREFIX.length), 'base64');
    parsedResources = JSON.parse(gunzipSync(compressed).toString('utf-8'));
  }

  if (!Array.isArray(parsedResources)) {
    throw new TypeError('ownedResources must be a string array or gz:-prefixed compressed string');
  }

  return parsedResources.filter((resource): resource is string => typeof resource === 'string');
}

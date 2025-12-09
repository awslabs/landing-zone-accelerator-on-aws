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
 * @fileoverview Boundary Resolution Utilities - AWS resource boundary management for multi-account operations
 *
 * Provides utilities for resolving and calculating AWS resource boundaries (regions, accounts, OUs)
 * for Landing Zone Accelerator operations. Handles service enablement/disablement scenarios
 * with proper boundary filtering and validation.
 *
 * Key capabilities:
 * - Dynamic AWS region discovery and filtering
 * - Service-aware boundary calculation
 * - Support for ignored and disabled boundaries
 * - Multi-partition AWS region support
 */

import path from 'path';
import { EC2Client, DescribeRegionsCommand } from '@aws-sdk/client-ec2';
import { IAssumeRoleCredential, IModuleRegionFilters } from './interfaces';
import { executeApi, setRetryStrategy } from './utility';
import { createLogger } from './logger';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Enumeration of supported boundary types for AWS resource operations
 */
export enum BoundaryType {
  /** AWS regions boundary type */
  REGIONS = 'regions',
  /** AWS Organizations organizational units boundary type */
  ORGANIZATIONAL_UNITS = 'organizational-units',
  /** AWS accounts boundary type */
  ACCOUNTS = 'accounts',
}

/**
 * Result interface for boundary calculation operations
 * @template T - Type of boundary identifiers (defaults to string)
 */
export interface BoundaryResult<T = string> {
  /** List of boundaries where service should be enabled */
  enabledBoundaries: T[];
  /** List of boundaries where service should be disabled */
  disabledBoundaries: T[];
}

/**
 * Context information required for boundary resolution operations
 */
export interface BoundaryContext {
  /** AWS partition (aws, aws-gov, aws-cn, etc.) */
  partition: string;
  /** AWS region for API operations */
  region: string;
  /** Optional solution identifier for user agent */
  solutionId?: string;
  /** Optional credentials for cross-account operations */
  credentials?: IAssumeRoleCredential;
  /** Optional AWS Organizations root ID */
  organizationRootId?: string;
}

/**
 * Utility class for resolving AWS resource boundaries
 */
export class BoundaryResolver {
  /**
   * Retrieves all available boundaries for the specified type
   * @template T - Type of boundary identifiers
   * @param boundaryType - Type of boundary to retrieve
   * @param context - Context information for boundary resolution
   * @returns Promise resolving to array of all available boundaries
   */
  static async getAllBoundaries<T = string>(boundaryType: BoundaryType, context: BoundaryContext): Promise<T[]> {
    switch (boundaryType) {
      case BoundaryType.REGIONS:
        return this.getAllRegions(context) as Promise<T[]>;
      default:
        throw new Error(`Unsupported boundary type: ${boundaryType}`);
    }
  }

  /**
   * Calculates enabled and disabled boundaries based on service state and filters
   * @template T - Type of boundary identifiers
   * @param boundaryType - Type of boundary to calculate
   * @param isServiceEnabled - Whether the service is enabled
   * @param context - Context information for boundary resolution
   * @param providedBoundaries - Optional pre-defined boundaries
   * @param targetRegions - Optional region filters
   * @returns Promise resolving to boundary calculation result
   */
  static async calculateBoundaries<T = string>(
    boundaryType: BoundaryType,
    isServiceEnabled: boolean,
    context: BoundaryContext,
    providedBoundaries?: T[],
    targetRegions?: IModuleRegionFilters,
  ): Promise<BoundaryResult<T>> {
    const availableBoundaries: T[] = [];
    // Get all available boundaries if not provided
    if (!providedBoundaries) {
      logger.info(`No boundaries provided for ${boundaryType}`);
      logger.info(`Getting all available boundaries for ${boundaryType}`);
      availableBoundaries.push(...(await this.getAllBoundaries<T>(boundaryType, context)));
    } else {
      logger.info(`Boundaries provided for ${boundaryType}`);
      availableBoundaries.push(...providedBoundaries);
    }

    if (!isServiceEnabled) {
      // Service disabled: disabledRegions = boundary - ignoredRegions, enabledRegions = []
      const ignoredRegions = (targetRegions?.ignoredRegions || []) as T[];
      const disabledBoundaries = availableBoundaries.filter(region => !ignoredRegions.includes(region));

      return {
        enabledBoundaries: [],
        disabledBoundaries,
      };
    }

    // Service enabled: enabledRegions = boundary - (disabledRegions + ignoredRegions), disabledRegions = disabledRegions
    const disabledRegions = (targetRegions?.disabledRegions || []) as T[];
    const ignoredRegions = (targetRegions?.ignoredRegions || []) as T[];
    const excludedRegions = [...disabledRegions, ...ignoredRegions];

    const enabledBoundaries = availableBoundaries.filter(region => !excludedRegions.includes(region));

    return {
      enabledBoundaries,
      disabledBoundaries: disabledRegions,
    };
  }

  /**
   * Retrieves all available AWS regions for the specified partition
   * @param context - Context information including partition and credentials
   * @returns Promise resolving to array of region names
   */
  private static async getAllRegions(context: BoundaryContext): Promise<string[]> {
    logger.info(`Getting all available regions for ${context.partition}`);
    const client = new EC2Client({
      region: context.region,
      customUserAgent: context.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: context.credentials,
    });

    const commandName = 'DescribeRegionsCommand';
    const parameters = {};

    const response = await executeApi(
      commandName,
      parameters,
      () => client.send(new DescribeRegionsCommand(parameters)),
      logger,
      context.region,
    );

    return response.Regions?.map(region => region.RegionName!).filter(Boolean) || [];
  }
}

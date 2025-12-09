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
 * @fileoverview Common Interface Definitions - Shared interfaces for AWS LZA operations
 *
 * Provides comprehensive interface definitions for AWS Landing Zone Accelerator operations
 * including credentials, session context, module requests/responses, and data source configurations.
 * These interfaces ensure type safety and consistency across all LZA modules.
 *
 * Key interface categories:
 * - AWS credential and session management
 * - Module operation requests and responses
 * - DynamoDB query and filter configurations
 * - Regional and organizational boundary definitions
 * - Concurrency and performance settings
 */

import { DynamoDBFilterOperator, DynamoDBLogicalOperator, MODULE_STATE_CODE } from './types';
/**
 * Represents an AWS environment (account-region combination) for accelerator operations
 */
export interface IAcceleratorEnvironment {
  /** AWS account ID */
  accountId: string;
  /** AWS region */
  region: string;
}
/**
 * AWS STS assume role credentials for cross-account operations
 */
export interface IAssumeRoleCredential {
  /** AWS access key ID */
  accessKeyId: string;
  /** AWS secret access key */
  secretAccessKey: string;
  /** AWS session token */
  sessionToken: string;
  /** Optional credential expiration timestamp */
  expiration?: Date;
}

/**
 * Regional filtering configuration for module operations
 */
export interface IModuleRegionFilters {
  /** Regions to completely ignore (not processed) */
  readonly ignoredRegions?: string[];
  /** Regions where service should be disabled */
  readonly disabledRegions?: string[];
}

/**
 * Module boundary configuration for limiting operation scope
 */
export interface IModuleBoundary {
  /** Specific regions to include in operations */
  readonly regions?: string[];
}

/**
 * DynamoDB partition key specification for query operations
 */
export interface IDynamoDBPartitionKey {
  /** Partition key attribute name */
  readonly name: string;
  /** Partition key value */
  readonly value: unknown;
}

/**
 * DynamoDB sort key specification with operator support
 */
export interface IDynamoDBSortKey extends IDynamoDBPartitionKey {
  /** Comparison operator for sort key */
  readonly operator?: DynamoDBFilterOperator;
  /** Second value for range operations (BETWEEN) */
  readonly value2?: unknown;
}

/**
 * DynamoDB filter condition for advanced query operations
 */
export interface IDynamoDBFilter {
  /** Filter attribute name */
  readonly name: string;
  /** Primary filter value */
  readonly value?: unknown;
  /** Filter operator */
  readonly operator?: DynamoDBFilterOperator;
  /** Second value for range operations */
  readonly value2?: unknown;
  /** Array of values for IN operations */
  readonly values?: unknown[];
}

/**
 * Configuration for retrieving AWS Organizations data from DynamoDB
 */
export interface IModuleOrganizationsDataSource {
  /** DynamoDB table name containing organization data */
  readonly tableName: string;
  /** Optional filters to apply to the query */
  readonly filters?: IDynamoDBFilter[];
  /** Logical operator for combining multiple filters */
  readonly filterOperator?: DynamoDBLogicalOperator;
}

/**
 * AWS session context information for operations
 */
export interface ISessionContext {
  /** Account ID of the invoking session */
  invokingAccountId: string;
  /** Current AWS region */
  region: string;
  /** Global region for the partition */
  globalRegion: string;
  /** AWS partition */
  partition: string;
}

/**
 * Standard module request interface extending session context
 */
export interface IModuleRequest extends ISessionContext {
  /** Operation to perform */
  operation: string;
  /** Optional module name */
  moduleName?: string;
  /** Solution identifier for tracking */
  readonly solutionId?: string;
  /** Optional credentials for cross-account operations */
  credentials?: IAssumeRoleCredential;
  /** Whether to perform dry run */
  dryRun?: boolean;
}

/**
 * Standard module response interface with generic result type
 * @template T - Type of the response data
 */
export interface IModuleResponse<T = unknown> {
  /** Error information if operation failed */
  error?: {
    /** Error name/type */
    name: string;
    /** Error message */
    message: string;
  };
  /** Operation status code */
  status: MODULE_STATE_CODE;
  /** Human-readable operation summary */
  summary: string;
  /** Operation timestamp */
  timestamp: string;
  /** Name of the module that generated the response */
  moduleName: string;
  /** Whether this was a dry run operation */
  dryRun: boolean;
  /** Optional response data */
  response?: T;
}

/**
 * Concurrency and performance settings for batch operations
 */
export interface IConcurrencySettings {
  /** Maximum number of concurrent account-region environments */
  readonly maxConcurrentEnvironments?: number;
  /** Timeout in milliseconds for individual operations */
  readonly operationTimeoutMs?: number;
}

/**
 * Enumeration of supported accelerator module names
 */
export enum AcceleratorModuleName {
  /** Amazon Macie security module */
  AMAZON_MACIE = 'amazon-macie',
}

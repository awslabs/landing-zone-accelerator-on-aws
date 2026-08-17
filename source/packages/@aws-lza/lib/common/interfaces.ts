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

import { Account } from '@aws-sdk/client-organizations';
import type { AwsCredentialIdentityProvider } from '@aws-sdk/types';
import {
  DynamoDBFilterOperator,
  DynamoDBLogicalOperator,
  MODULE_STATE_CODE,
  OrderedAccountListType,
  SecurityModuleOperationType,
} from './types';
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
 * Credential type that accepts both static credentials and credential providers
 */
export type AssumeRoleCredentialType = IAssumeRoleCredential | AwsCredentialIdentityProvider;

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
  /** Specific account IDs to include in operations (empty/undefined = all accounts) */
  readonly accounts?: string[];
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
  credentials?: AssumeRoleCredentialType;
  /** Whether to perform dry run */
  dryRun?: boolean;
  /** IAM session policy JSON for least-privilege cross-account role assumption */
  sessionPolicy?: string;
  /** Session tags for CloudTrail attribution */
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
 * Batch operation settings for concurrency and performance
 */
export interface IBatchOperationSettings {
  /** Maximum number of concurrent account-region environments */
  readonly maxConcurrentEnvironments?: number;
  /** Timeout in milliseconds for individual operations */
  readonly operationTimeoutMs?: number;
}

/**
 * Required batch operation settings for internal processing layers
 * Used by batch-processor and regional-error-wrapper to ensure all settings are resolved
 */
export interface IRequiredBatchOperationSettings {
  /** Maximum number of concurrent account-region environments */
  readonly maxConcurrentEnvironments: number;
  /** Timeout in milliseconds for individual operations */
  readonly operationTimeoutMs: number;
}

/**
 * Enumeration of supported accelerator module names
 */
export enum AcceleratorModuleName {
  /** Amazon Macie security module */
  AMAZON_MACIE = 'amazon-macie',
  /** Amazon GuardDuty security module */
  AMAZON_GUARDDUTY = 'amazon-guardduty',
  /** Unified accounts module — manages alias and tags */
  ACCOUNTS = 'accounts',
}

/**
 * Regional operation error information for batch processing failures
 */
export interface IRegionOperationError {
  /** AWS region where the error occurred */
  region: string;
  /** Account ID where the error occurred */
  accountId: string;
  /** Account name where the error occurred */
  accountName: string;
  /** AWS error name (e.g., UnrecognizedClientException) */
  errorName: string;
  /** Detailed error message */
  errorMessage: string;
}

/**
 * Base configuration interface for AWS security services
 *
 * Provides common configuration properties shared across multiple AWS security services
 * such as Amazon Macie, GuardDuty, Security Hub, and Detective. This interface ensures
 * consistency in configuration structure and reduces code duplication.
 *
 * @example
 * ```typescript
 * // Extending for a specific security service
 * interface IMacieConfiguration extends ISecurityBaseConfig {
 *   readonly findingPublishingFrequency?: 'FIFTEEN_MINUTES' | 'ONE_HOUR' | 'SIX_HOURS';
 * }
 *
 * const macieConfig: IMacieConfiguration = {
 *   accountAccessRoleName: 'AWSControlTowerExecution',
 *   enable: true,
 *   delegatedAdminAccountId: 'XXXXXXXXXXXX'
 * };
 * ```
 */
export interface ISecurityBaseConfig {
  /**
   * IAM role name for cross-account access
   *
   * Specifies the IAM role that will be assumed for cross-account operations.
   * This role must exist in all target accounts and have the necessary permissions
   * for the security service operations.
   *
   * @example 'AWSControlTowerExecution'
   */
  readonly accountAccessRoleName: string;

  /**
   * Whether to enable or disable the security service
   *
   * Controls the overall enablement state of the security service across
   * the organization. When set to false, the service will be disabled
   * in all accounts and regions.
   *
   * @default true
   */
  readonly enable: boolean;

  /**
   * Account ID for delegated administrator
   *
   * Specifies the AWS account ID that will serve as the delegated administrator
   * for the security service. This account will have administrative privileges
   * to manage the service across all member accounts in the organization.
   *
   * @example 'XXXXXXXXXXXX'
   */
  readonly delegatedAdminAccountId: string;
}
/**
 * Base interface for security service module requests
 *
 * Extends the standard module request interface with security service configuration.
 * This interface ensures all security service requests have the required configuration
 * structure while maintaining type safety.
 *
 * @template TConfiguration - Type of the security service configuration (extends ISecurityBaseConfig)
 */
/**
 * Generic security operation context for AWS security services
 *
 * Provides a shared context interface that carries common data across security service operations.
 * This interface uses generic type parameters to support different module request types while
 * maintaining type safety and consistency across all AWS security services.
 *
 * @template TModuleRequest - Type of the module request (IMacieModuleRequest, IGuardDutyModuleRequest, etc.)
 *
 * @example
 * ```typescript
 * // Usage with Macie
 * type IMacieContext = ISecurityOperationContext<IMacieModuleRequest>;
 *
 * // Usage with GuardDuty (future)
 * type IGuardDutyContext = ISecurityOperationContext<IGuardDutyModuleRequest>;
 * ```
 */
export interface ISecurityOperationContext<TModuleRequest extends IModuleRequest> {
  /** Module name for logging and identification */
  moduleName: string;

  /** AWS service name for Organizations API (e.g., 'macie.amazonaws.com') */
  serviceName: string;

  /** Logging prefix for the invoker */
  invokerLogPrefix: string;

  /** Management account ID */
  managementAccountId: string;

  /** List of organization accounts */
  organizationAccounts: Account[];

  /** Regions where service should be enabled */
  enabledRegions: string[];

  /** Regions where service should be disabled */
  disabledRegions: string[];

  /** Ordered accounts for enable operations */
  enableOrderAccounts: OrderedAccountListType[];

  /** Ordered accounts for disable operations */
  disableOrderAccounts: OrderedAccountListType[];

  /** Accounts requiring final cleanup */
  finalCleanupAccounts: Account[];

  /** Resolved batch operation settings */
  resolvedBatchOperationSettings: IRequiredBatchOperationSettings;

  /** Module-specific request properties */
  props: TModuleRequest;
}

/**
 * Base response interface for AWS security service modules
 *
 * Provides common response structure shared across all security services.
 * Each service extends this interface and adds its service-specific configuration.
 *
 * @example
 * ```typescript
 * // Macie extends and adds sessionConfig
 * export interface IMacieModuleResponse extends ISecurityServiceModuleResponse {
 *   sessionConfig: IMacieSessionResponse[];
 * }
 *
 * // GuardDuty extends and adds detectorConfig
 * export interface IGuardDutyModuleResponse extends ISecurityServiceModuleResponse {
 *   detectorConfig: IGuardDutyDetectorResponse[];
 * }
 * ```
 */
export interface ISecurityServiceModuleResponse {
  /** Organization admin configuration results */
  organizationAdminConfig: IOrganizationAdminResponse[];
  /** Delegated admin account configuration results */
  delegatedAdminAccountConfig: IDelegatedAccountResponse[];
  /** List of account:region environments where operations completed successfully (only present when there are failures) */
  successfulEnvs?: string[];
  /** List of account:region environments where operations failed (only present when there are failures) */
  failedEnvironments?: string[];
  /** Detailed error information for each failed region (only present when there are failures) */
  environmentErrors?: IRegionOperationError[];
}

/**
 * Organization admin configuration data
 * Used by handlers to return organization admin setup information (data only, no operation/regions)
 */
export interface IOrganizationAdminData extends Record<string, unknown> {
  /** Management account ID */
  managementAccountId: string;
  /** Delegated administrator account ID */
  delegatedAdminAccountId: string;
}

/**
 * Delegated account configuration data
 * Used by handlers to return delegated admin member information (data only, no operation/regions)
 */
export interface IDelegatedAccountData extends Record<string, unknown> {
  /** Administrator account ID */
  adminAccountId: string;
  /** List of member account IDs */
  memberAccountIds: string[];
}

/**
 * Generic organization admin response interface
 * Used across all security services for organization-level configuration (final merged response)
 */
export interface IOrganizationAdminResponse {
  /** Type of operation performed (enabled/disabled) */
  operation: SecurityModuleOperationType;
  /** List of regions where operation was performed */
  regions: string[];
  /** Management account ID */
  managementAccountId: string;
  /** Delegated administrator account ID */
  delegatedAdminAccountId: string;
}

/**
 * Generic delegated account response interface
 * Used across all security services for delegated admin configuration (final merged response)
 */
export interface IDelegatedAccountResponse {
  /** Type of operation performed (enabled/disabled) */
  operation: SecurityModuleOperationType;
  /** List of regions where operation was performed */
  regions: string[];
  /** Administrator account ID */
  adminAccountId: string;
  /** List of member account IDs */
  memberAccountIds: string[];
}

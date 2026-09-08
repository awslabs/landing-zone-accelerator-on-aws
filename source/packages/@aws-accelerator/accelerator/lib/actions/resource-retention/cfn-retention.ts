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
 * @fileoverview CloudFormation resource retention utilities for Landing Zone Accelerator on AWS (LZA).
 *
 * @description
 * This module provides low-level CloudFormation operations for retaining resources during stack updates.
 * It handles the complete lifecycle of resource retention including:
 * - Stack existence validation
 * - Template retrieval and modification
 * - DeletionPolicy application to resources and dependencies
 * - Template storage (local disk and S3)
 * - Stack deployment with modified templates
 * - Operation status monitoring
 *
 * Resource retention is critical when transitioning from CloudFormation-managed resources to
 * alternative management approaches (e.g., Terraform, direct API calls). This module ensures
 * resources are preserved during stack updates or deletions by applying the "Retain" deletion policy.
 *
 * The module follows a fail-fast approach - any error in the retention process stops execution
 * immediately to prevent accidental resource deletion.
 *
 * @example
 * ```typescript
 * // Retain Macie resources in a CloudFormation stack
 * const request: IRetainResourceModuleRequest = {
 *   invokingAccountId: 'XXXXXXXXXXXX',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   dryRun: false,
 *   configuration: {
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     resourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *     accountAccessRoleName: 'AWSControlTowerExecution',
 *     s3BucketName: 'aws-accelerator-assets-XXXXXXXXXXXX-us-east-1',
 *     directory: '/path/to/output'
 *   }
 * };
 *
 * const result = await retainResources(request);
 * // Result includes deployment status and modified resources
 * ```
 *
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html | CloudFormation DeletionPolicy}
 * @see {@link https://aws.amazon.com/solutions/implementations/landing-zone-accelerator-on-aws/ | LZA Solution}
 */

import {
  CloudFormationClient,
  DescribeStacksCommand,
  GetTemplateCommand,
  StackSetOperationStatus,
  StackStatus,
  TemplateStage,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import { S3Client } from '@aws-sdk/client-s3';
import { AccountClient, GetRegionOptStatusCommand } from '@aws-sdk/client-account';
import {
  AssumeRoleCredentialType,
  IModuleRequest,
  MODULE_EXCEPTIONS,
  createLogger,
  createStatusLogger,
  executeApi,
  getCredentials,
  getS3Endpoint,
  setRetryStrategy,
  uploadFileToS3,
  waitUntil,
} from 'aws-lza';
import { OptInRegions } from '@aws-accelerator/utils';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IStackRetentionConfig } from './types';

/**
 * Error codes for resource retention operations.
 *
 * @enum {string}
 *
 * @description
 * Provides explicit, type-safe error classification for retention operations
 * instead of relying on string matching or error message parsing.
 *
 * These error codes enable:
 * - Consistent error handling across the retention workflow
 * - Type-safe error classification
 * - Clear error reporting and debugging
 * - Programmatic error handling by callers
 *
 * @example
 * ```typescript
 * if (error.errorCode === RetentionErrorCode.STACK_NOT_FOUND) {
 *   // Handle missing stack scenario
 * } else if (error.errorCode === RetentionErrorCode.DEPLOYMENT_FAILED) {
 *   // Handle deployment failure
 * }
 * ```
 */
export enum RetentionErrorCode {
  /** CloudFormation stack does not exist in the specified account/region */
  STACK_NOT_FOUND = 'STACK_NOT_FOUND',
  /** Template modification failed (parsing, validation, or transformation errors) */
  TEMPLATE_MODIFICATION_FAILED = 'TEMPLATE_MODIFICATION_FAILED',
  /** Stack deployment or update operation failed */
  DEPLOYMENT_FAILED = 'DEPLOYMENT_FAILED',
  /** No resources found matching the specified resource types */
  NO_MATCHING_RESOURCES = 'NO_MATCHING_RESOURCES',
  /**
   * The target Region is not reachable for this account because it is a disabled (or
   * never-enabled) opt-in Region. Nothing can exist or be retained there now, so the target
   * is deferred and re-evaluated on a later run once the Region is enabled. This is
   * deliberately DISTINCT from STACK_NOT_FOUND: STACK_NOT_FOUND is persisted as a terminal
   * state (treated as completed) and would permanently suppress retention for the target once
   * the Region becomes available.
   */
  REGION_NOT_AVAILABLE = 'REGION_NOT_AVAILABLE',
  /** Unknown or unexpected error occurred during retention operation */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Response interface for resource retention operations.
 *
 * @interface IRetainResourceModuleResponse
 *
 * @description
 * Contains the complete result of a resource retention operation including:
 * - Operation status and messages
 * - Deployment information
 * - Detailed resource modification status
 * - Error information if applicable
 *
 * @property {string} message - Human-readable message describing the operation result
 * @property {string[]} requestedResourceTypes - CloudFormation resource types that were requested for retention
 * @property {StackStatus} [deploymentStatus] - Final CloudFormation stack status after deployment (if deployment was attempted)
 * @property {boolean} [deploymentAttempted] - Whether stack deployment was attempted
 * @property {RetentionErrorCode} [errorCode] - Error code if operation failed
 * @property {Object} [resourceRetentionStatus] - Detailed status of resource modifications
 * @property {string} resourceRetentionStatus.stackName - Name of the CloudFormation stack
 * @property {StackSetOperationStatus} resourceRetentionStatus.stackModificationStatus - Status of the stack modification operation
 * @property {Array} resourceRetentionStatus.modifiedResources - List of resources that were modified with retention policy
 * @property {string} resourceRetentionStatus.modifiedResources[].name - Logical ID of the modified resource
 * @property {string} resourceRetentionStatus.modifiedResources[].type - CloudFormation resource type
 * @property {string[]} resourceRetentionStatus.notFoundResources - Resource types that were requested but not found in the stack
 * @property {number} resourceRetentionStatus.totalModifiedResources - Total count of resources modified
 *
 * @example
 * ```typescript
 * const response: IRetainResourceModuleResponse = {
 *   message: 'Successfully retained 3 resources',
 *   requestedResourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *   deploymentStatus: 'UPDATE_COMPLETE',
 *   deploymentAttempted: true,
 *   resourceRetentionStatus: {
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     stackModificationStatus: 'SUCCEEDED',
 *     modifiedResources: [
 *       { name: 'MacieExportConfig', type: 'Custom::MaciePutClassificationExportConfiguration' }
 *     ],
 *     notFoundResources: [],
 *     totalModifiedResources: 1
 *   }
 * };
 * ```
 */
interface IRetainResourceModuleResponse {
  readonly message: string;
  readonly requestedResourceTypes: string[];
  readonly deploymentStatus?: StackStatus;
  readonly deploymentAttempted?: boolean;
  readonly errorCode?: RetentionErrorCode;
  readonly resourceRetentionStatus?: {
    readonly stackName: string;
    readonly stackModificationStatus: StackSetOperationStatus;
    readonly modifiedResources: Array<{
      readonly name: string;
      readonly type: string;
    }>;
    readonly notFoundResources: string[];
    readonly totalModifiedResources: number;
  };
}

/**
 * CloudFormation template structure interface.
 *
 * @interface ICloudFormationTemplate
 *
 * @description
 * Represents the structure of a CloudFormation template JSON document.
 * Focuses on the Resources section which is the primary target for retention operations.
 *
 * @property {Object} Resources - CloudFormation resources defined in the template
 * @property {string} Resources[resourceName].Type - CloudFormation resource type (e.g., 'AWS::S3::Bucket', 'Custom::MacieConfig')
 * @property {string} [Resources[resourceName].DeletionPolicy] - Resource deletion policy ('Delete', 'Retain', 'Snapshot')
 * @property {string | string[]} [Resources[resourceName].DependsOn] - Resource dependencies (logical IDs)
 *
 * @example
 * ```typescript
 * const template: ICloudFormationTemplate = {
 *   Resources: {
 *     MacieConfig: {
 *       Type: 'Custom::MaciePutClassificationExportConfiguration',
 *       DeletionPolicy: 'Retain',
 *       DependsOn: ['MacieLogGroup']
 *     },
 *     MacieLogGroup: {
 *       Type: 'AWS::Logs::LogGroup',
 *       DeletionPolicy: 'Retain'
 *     }
 *   },
 *   Parameters: {},
 *   Outputs: {}
 * };
 * ```
 */
interface ICloudFormationTemplate {
  Resources: {
    [resourceName: string]: {
      Type: string;
      DeletionPolicy?: string;
      DependsOn?: string | string[];
      [key: string]: unknown; // For other CloudFormation properties
    };
  };
  [key: string]: unknown; // For other template sections like Parameters, Outputs, etc.
}

/**
 * Internal configuration for CloudFormation template retention operations.
 *
 * @interface ICfnRetentionModuleConfig
 * @extends {IStackRetentionConfig}
 *
 * @description
 * Extends the base stack retention configuration with local file system directory
 * information for template storage. Used internally by retention operations to
 * manage template files on disk before uploading to S3.
 *
 * @property {string} directory - Base directory where modified templates will be stored locally
 *
 * @example
 * ```typescript
 * const config: ICfnRetentionModuleConfig = {
 *   stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *   accountId: 'XXXXXXXXXXXX',
 *   region: 'us-east-1',
 *   resourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *   accountAccessRoleName: 'AWSControlTowerExecution',
 *   s3BucketName: 'aws-accelerator-assets-XXXXXXXXXXXX-us-east-1',
 *   directory: '/path/to/accelerator/output'
 * };
 * ```
 */
interface ICfnRetentionModuleConfig extends IStackRetentionConfig {
  /**
   * Base directory where modified templates will be stored locally
   * @example '/path/to/accelerator/output'
   */
  readonly directory: string;
}

/**
 * Request interface for resource retention module operations.
 *
 * @interface IRetainResourceModuleRequest
 * @extends {IModuleRequest}
 *
 * @description
 * Complete request structure for initiating a resource retention operation.
 * Extends the base module request with retention-specific configuration.
 *
 * @property {ICfnRetentionModuleConfig} configuration - Retention operation configuration including stack details and storage locations
 *
 * @example
 * ```typescript
 * const request: IRetainResourceModuleRequest = {
 *   invokingAccountId: 'XXXXXXXXXXXX',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   dryRun: false,
 *   configuration: {
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     resourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *     accountAccessRoleName: 'AWSControlTowerExecution',
 *     s3BucketName: 'aws-accelerator-assets-XXXXXXXXXXXX-us-east-1',
 *     directory: '/path/to/output'
 *   }
 * };
 * ```
 */
export interface IRetainResourceModuleRequest extends IModuleRequest {
  readonly configuration: ICfnRetentionModuleConfig;
}

/**
 * Logger instance for CloudFormation retention operations.
 *
 * @private
 * @constant
 *
 * @description
 * Provides structured logging for all CloudFormation retention operations including:
 * - Stack existence checks
 * - Template retrieval and modification
 * - Deployment operations
 * - Error conditions
 *
 * Uses the filename as the logger context for easy identification in log aggregation systems.
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Status logger for surfacing critical errors in CodeBuild output.
 */
const statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

/**
 * Interval in seconds between stack operation status checks.
 *
 * @private
 * @constant
 * @default 30
 *
 * @description
 * Controls how frequently the system polls CloudFormation for stack operation status updates.
 * A 30-second interval balances responsiveness with API rate limiting.
 */
const STACK_OPERATION_CHECK_INTERVAL_SECONDS = 30;

/**
 * Maximum time in minutes to wait for a stack operation to complete.
 *
 * @private
 * @constant
 * @default 15
 *
 * @description
 * Defines the timeout for CloudFormation stack operations (create, update, delete).
 * Operations exceeding this duration are considered failed. The 15-minute timeout
 * accommodates most stack operations while preventing indefinite waits.
 */
const STACK_OPERATION_MAX_WAIT_MINUTES = 15;

/**
 * Creates a resource retention status object.
 *
 * @private
 * @function createResourceRetentionStatus
 *
 * @description
 * Helper function to construct a standardized resource retention status object
 * containing information about modified resources, not found resources, and operation status.
 *
 * @param {string} stackName - Name of the CloudFormation stack
 * @param {StackSetOperationStatus} modificationStatus - Status of the stack modification operation
 * @param {Array<{resourceName: string, resourceType: string}>} [appliedResources=[]] - Resources that were successfully modified
 * @param {string[]} [notFoundResources=[]] - Resource types that were requested but not found
 * @param {number} [totalProcessed=0] - Total number of resources processed
 *
 * @returns {Object} Resource retention status object
 *
 * @example
 * ```typescript
 * const status = createResourceRetentionStatus(
 *   'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *   'SUCCEEDED',
 *   [{ resourceName: 'MacieConfig', resourceType: 'Custom::MaciePutClassificationExportConfiguration' }],
 *   [],
 *   1
 * );
 * ```
 */
function createResourceRetentionStatus(
  stackName: string,
  modificationStatus: StackSetOperationStatus,
  appliedResources: Array<{ resourceName: string; resourceType: string }> = [],
  notFoundResources: string[] = [],
  totalProcessed: number = 0,
) {
  return {
    stackName,
    stackModificationStatus: modificationStatus,
    modifiedResources: appliedResources.map(resource => ({
      name: resource.resourceName,
      type: resource.resourceType,
    })),
    notFoundResources,
    totalModifiedResources: totalProcessed,
  };
}

/**
 * Configuration interface for creating retention response objects.
 *
 * @interface IRetentionResponseConfig
 * @private
 *
 * @description
 * Internal configuration structure used by createResponseWithRetentionStatus()
 * to construct standardized retention response objects.
 *
 * @property {string} message - Human-readable message describing the operation result
 * @property {string[]} requestedResourceTypes - CloudFormation resource types requested for retention
 * @property {boolean} deploymentAttempted - Whether stack deployment was attempted
 * @property {string} stackName - Name of the CloudFormation stack
 * @property {StackSetOperationStatus} modificationStatus - Status of the stack modification operation
 * @property {Array<{resourceName: string, resourceType: string}>} [appliedResources] - Resources successfully modified
 * @property {string[]} [notFoundResources] - Resource types requested but not found
 * @property {number} [totalProcessed] - Total number of resources processed
 * @property {StackStatus} [deploymentStatus] - Final CloudFormation stack status
 * @property {RetentionErrorCode} [errorCode] - Error code if operation failed
 */
interface IRetentionResponseConfig {
  readonly message: string;
  readonly requestedResourceTypes: string[];
  readonly deploymentAttempted: boolean;
  readonly stackName: string;
  readonly modificationStatus: StackSetOperationStatus;
  readonly appliedResources?: Array<{ resourceName: string; resourceType: string }>;
  readonly notFoundResources?: string[];
  readonly totalProcessed?: number;
  readonly deploymentStatus?: StackStatus;
  readonly errorCode?: RetentionErrorCode;
}

/**
 * Creates a complete retention response object with resource retention status.
 *
 * @private
 * @function createResponseWithRetentionStatus
 *
 * @description
 * Helper function to construct a standardized IRetainResourceModuleResponse object
 * from a configuration object. Combines operation metadata with detailed resource
 * retention status information.
 *
 * @param {IRetentionResponseConfig} config - Configuration for the response object
 *
 * @returns {IRetainResourceModuleResponse} Complete retention response object
 *
 * @example
 * ```typescript
 * const response = createResponseWithRetentionStatus({
 *   message: 'Successfully retained 3 resources',
 *   requestedResourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *   deploymentAttempted: true,
 *   stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *   modificationStatus: 'SUCCEEDED',
 *   appliedResources: [
 *     { resourceName: 'MacieConfig', resourceType: 'Custom::MaciePutClassificationExportConfiguration' }
 *   ],
 *   notFoundResources: [],
 *   totalProcessed: 1,
 *   deploymentStatus: 'UPDATE_COMPLETE'
 * });
 * ```
 */
function createResponseWithRetentionStatus(config: IRetentionResponseConfig): IRetainResourceModuleResponse {
  return {
    message: config.message,
    requestedResourceTypes: config.requestedResourceTypes,
    deploymentAttempted: config.deploymentAttempted,
    deploymentStatus: config.deploymentStatus,
    errorCode: config.errorCode,
    resourceRetentionStatus: createResourceRetentionStatus(
      config.stackName,
      config.modificationStatus,
      config.appliedResources ?? [],
      config.notFoundResources ?? [],
      config.totalProcessed ?? 0,
    ),
  };
}

/**
 * Sentinel error signalling that the target Region is unreachable for the account because it is
 * a disabled (or never-enabled) opt-in Region, as opposed to the stack genuinely not existing.
 *
 * `isStackExists()` throws this instead of returning `false` so the caller can classify the
 * outcome as {@link RetentionErrorCode.REGION_NOT_AVAILABLE} (deferred, non-terminal) rather than
 * STACK_NOT_FOUND (terminal).
 */
class RegionNotAvailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegionNotAvailableError';
  }
}

/**
 * Builds the response returned when the target Region is unreachable for the account (a disabled
 * opt-in Region). It carries {@link RetentionErrorCode.REGION_NOT_AVAILABLE} so the state layer
 * defers the target (resets it to PENDING and re-evaluates next run) instead of persisting a
 * terminal NOT_FOUND/COMPLETED that would suppress retention once the Region is enabled.
 *
 * @param props The retention request being processed
 * @param message Human-readable reason the Region is being deferred
 */
function createRegionNotAvailableResponse(
  props: IRetainResourceModuleRequest,
  message: string,
): IRetainResourceModuleResponse {
  return createResponseWithRetentionStatus({
    message,
    requestedResourceTypes: props.configuration.resourceTypes,
    deploymentAttempted: false,
    stackName: props.configuration.stackName,
    modificationStatus: StackSetOperationStatus.FAILED,
    appliedResources: [],
    notFoundResources: props.configuration.resourceTypes,
    totalProcessed: 0,
    errorCode: RetentionErrorCode.REGION_NOT_AVAILABLE,
  });
}

/**
 * Retains CloudFormation resources by applying the "Retain" deletion policy.
 *
 * @async
 * @function retainResources
 * @export
 *
 * @description
 * Main entry point for CloudFormation resource retention operations. This function orchestrates
 * the complete lifecycle of retaining resources in a CloudFormation stack:
 *
 * 1. **Validation** - Validates required parameters and cross-account configuration
 * 2. **Stack Existence Check** - Verifies the target stack exists
 * 3. **Template Retrieval** - Fetches the current CloudFormation template
 * 4. **Template Modification** - Applies "Retain" deletion policy to specified resources and dependencies
 * 5. **Template Storage** - Saves modified template to local disk and uploads to S3
 * 6. **Stack Deployment** - Updates the stack with the modified template
 * 7. **Operation Monitoring** - Waits for stack operation to complete
 *
 * The function follows a fail-fast approach - any error stops execution immediately to prevent
 * accidental resource deletion. It supports both same-account and cross-account operations
 * with automatic credential management.
 *
 * **Key Features:**
 * - Cross-account support with automatic role assumption
 * - Dry-run mode for testing without actual changes
 * - Comprehensive error handling with typed error codes
 * - Detailed operation status and resource tracking
 * - Automatic dependency resolution (resources with DependsOn are also retained)
 * - S3 and local file system template storage
 *
 * @param {IRetainResourceModuleRequest} props - Complete retention request configuration
 * @param {string} props.invokingAccountId - AWS account ID initiating the operation
 * @param {string} props.region - AWS region for the operation
 * @param {string} props.partition - AWS partition (aws, aws-cn, aws-us-gov)
 * @param {boolean} props.dryRun - Whether to perform a dry run (required parameter)
 * @param {AssumeRoleCredentialType} [props.credentials] - AWS credentials for the operation
 * @param {string} [props.solutionId] - Solution identifier for tracking and user agent
 * @param {ICfnRetentionModuleConfig} props.configuration - Retention operation configuration
 * @param {string} props.configuration.stackName - Name of the CloudFormation stack
 * @param {string} props.configuration.accountId - Target AWS account ID
 * @param {string} props.configuration.region - Target AWS region
 * @param {string[]} props.configuration.resourceTypes - CloudFormation resource types to retain
 * @param {string[]} [props.configuration.resourceLogicalIds] - Specific resource logical IDs to retain (optional)
 * @param {string} props.configuration.accountAccessRoleName - IAM role name for cross-account access
 * @param {string} props.configuration.s3BucketName - S3 bucket name for template storage
 * @param {string} props.configuration.directory - Local directory for template storage
 *
 * @returns {Promise<IRetainResourceModuleResponse>} Retention operation result
 * @returns {string} returns.message - Human-readable operation result message
 * @returns {string[]} returns.requestedResourceTypes - Resource types requested for retention
 * @returns {StackStatus} [returns.deploymentStatus] - Final CloudFormation stack status
 * @returns {boolean} returns.deploymentAttempted - Whether stack deployment was attempted
 * @returns {RetentionErrorCode} [returns.errorCode] - Error code if operation failed
 * @returns {Object} [returns.resourceRetentionStatus] - Detailed resource modification status
 *
 * @throws {Error} When dryRun parameter is not provided
 * @throws {Error} When accountAccessRoleName is missing for cross-account operations
 * @throws {Error} When template modification fails
 * @throws {Error} When stack deployment fails
 *
 * @example
 * ```typescript
 * // Same-account retention
 * const request: IRetainResourceModuleRequest = {
 *   invokingAccountId: 'XXXXXXXXXXXX',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   dryRun: false,
 *   configuration: {
 *     stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *     accountId: 'XXXXXXXXXXXX',
 *     region: 'us-east-1',
 *     resourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *     accountAccessRoleName: 'AWSControlTowerExecution',
 *     s3BucketName: 'aws-accelerator-assets-XXXXXXXXXXXX-us-east-1',
 *     directory: '/path/to/output'
 *   }
 * };
 *
 * const result = await retainResources(request);
 * if (result.errorCode) {
 *   // Handle error
 * } else {
 *   // Success - resources retained
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Cross-account retention with specific resource IDs
 * const crossAccountRequest: IRetainResourceModuleRequest = {
 *   invokingAccountId: 'XXXXXXXXXXXX',
 *   region: 'us-east-1',
 *   partition: 'aws',
 *   dryRun: false,
 *   credentials: managementAccountCredentials,
 *   configuration: {
 *     stackName: 'AWSAccelerator-SecurityStack-YYYYYYYYYYYY-us-east-1',
 *     accountId: 'YYYYYYYYYYYY', // Different account
 *     region: 'us-east-1',
 *     resourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *     resourceLogicalIds: ['MacieExportConfig'], // Specific resource
 *     accountAccessRoleName: 'AWSControlTowerExecution',
 *     s3BucketName: 'aws-accelerator-assets-XXXXXXXXXXXX-us-east-1',
 *     directory: '/path/to/output'
 *   }
 * };
 *
 * const result = await retainResources(crossAccountRequest);
 * ```
 *
 * @example
 * ```typescript
 * // Dry run for testing
 * const dryRunRequest: IRetainResourceModuleRequest = {
 *   ...request,
 *   dryRun: true // Test without making changes
 * };
 *
 * const dryRunResult = await retainResources(dryRunRequest);
 * // Review results before actual deployment
 * ```
 *
 * @see {@link IRetainResourceModuleRequest} - Request interface
 * @see {@link IRetainResourceModuleResponse} - Response interface
 * @see {@link RetentionErrorCode} - Error codes
 * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-attribute-deletionpolicy.html | CloudFormation DeletionPolicy}
 */
export async function retainResources(props: IRetainResourceModuleRequest): Promise<IRetainResourceModuleResponse> {
  // dryRun is required - if not provided, fail fast
  if (props.dryRun === undefined) {
    throw new Error('dryRun parameter is required but was not provided');
  }
  const dryRun = props.dryRun;

  // Initialize mutable response object that will be updated by internal functions
  let response: IRetainResourceModuleResponse = {
    message: '',
    requestedResourceTypes: props.configuration.resourceTypes,
    deploymentStatus: undefined,
    deploymentAttempted: false,
    resourceRetentionStatus: undefined,
  };

  let logPrefix = `${props.invokingAccountId}:${props.region}`;
  let credentials = props.credentials;

  // Handle cross-account operations
  if (props.configuration.accountId !== props.invokingAccountId) {
    if (!props.configuration.accountAccessRoleName) {
      const message = 'Account access role name is required for cross-account operations';
      logger.error(message, logPrefix);
      statusLogger.error(message, logPrefix);
      throw new Error(message);
    }
    logger.info(`Cross-account operation detected for account ${props.configuration.accountId}`, logPrefix);
    logPrefix = `${props.configuration.accountId}:${props.configuration.region}`;
    credentials = await getCredentials({
      accountId: props.configuration.accountId,
      region: props.region,
      logPrefix,
      solutionId: props.solutionId,
      assumeRoleName: props.configuration.accountAccessRoleName,
      partition: props.partition,
      credentials: props.credentials,
    });
  }

  // Proactively skip disabled opt-in Regions before touching CloudFormation. When an account is
  // added whose accounts-config enables an opt-in Region the account has not yet activated, the
  // CloudFormation call below would otherwise fail with InvalidClientTokenId and kill the Prepare
  // stage. A disabled opt-in Region is unreachable, so there is nothing to
  // retain there. This check is a no-op (no API call) for standard Regions.
  const regionReachable = await isRegionReachableForAccount({
    credentials,
    endpointRegion: props.region,
    targetRegion: props.configuration.region,
    solutionId: props.solutionId,
    logPrefix,
  });
  if (!regionReachable) {
    const message =
      `Region ${props.configuration.region} is not enabled for account ${props.configuration.accountId}; ` +
      `deferring retention (Region is unreachable, nothing to retain; will re-evaluate once it is enabled)`;
    logger.warn(message, logPrefix);
    return createRegionNotAvailableResponse(props, message);
  }

  const client = new CloudFormationClient({
    region: props.configuration.region,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: credentials,
  });

  // Check if stack exists. If the proactive opt-in check above failed open (e.g. the account
  // lacks account:GetRegionOptStatus) and the Region is in fact a disabled opt-in Region, the
  // CloudFormation call rejects with InvalidClientTokenId; isStackExists() surfaces that as a
  // RegionNotAvailableError so we defer the target here rather than treating it as not-found.
  let stackExists: boolean;
  try {
    stackExists = await isStackExists(client, props.configuration.stackName, logPrefix, props.configuration.region);
  } catch (e: unknown) {
    if (e instanceof RegionNotAvailableError) {
      logger.warn(e.message, logPrefix);
      return createRegionNotAvailableResponse(props, e.message);
    }
    throw e;
  }
  if (!stackExists) {
    const message = `Stack ${props.configuration.stackName} not found`;
    logger.warn(message, logPrefix);

    return createResponseWithRetentionStatus({
      message: `${message} in ${props.configuration.accountId}`,
      requestedResourceTypes: props.configuration.resourceTypes,
      deploymentAttempted: false,
      stackName: props.configuration.stackName,
      modificationStatus: StackSetOperationStatus.FAILED,
      appliedResources: [],
      notFoundResources: props.configuration.resourceTypes,
      totalProcessed: 0,
      errorCode: RetentionErrorCode.STACK_NOT_FOUND,
    });
  }

  logger.info(
    `Stack ${props.configuration.stackName} found in ${props.configuration.accountId} account for ${props.configuration.region} region`,
    logPrefix,
  );

  // Step 1: Modify templates
  const modificationResult = await modifyTemplateForRetention(client, props.configuration, dryRun, logPrefix);

  // Update response with modification results
  response = {
    ...response,
    resourceRetentionStatus: {
      stackName: props.configuration.stackName,
      stackModificationStatus: modificationResult.success
        ? StackSetOperationStatus.SUCCEEDED
        : StackSetOperationStatus.FAILED,
      modifiedResources: modificationResult.appliedResourceDetails.map(resource => ({
        name: resource.resourceName,
        type: resource.resourceType,
      })),
      notFoundResources: modificationResult.resourceTypesNotFound,
      totalModifiedResources: modificationResult.totalResourcesProcessed,
    },
  };

  if (!modificationResult.success) {
    return createResponseWithRetentionStatus({
      message: modificationResult.message,
      requestedResourceTypes: props.configuration.resourceTypes,
      deploymentAttempted: false,
      stackName: props.configuration.stackName,
      modificationStatus: StackSetOperationStatus.FAILED,
      appliedResources: modificationResult.appliedResourceDetails,
      notFoundResources: modificationResult.resourceTypesNotFound,
      totalProcessed: modificationResult.totalResourcesProcessed,
      errorCode: RetentionErrorCode.TEMPLATE_MODIFICATION_FAILED,
    });
  }

  // Check if operation was skipped (no resources to process)
  if (modificationResult.skipped) {
    logger.info(
      `Resource retention operation skipped for stack ${props.configuration.stackName} - no resources found`,
      logPrefix,
    );

    return createResponseWithRetentionStatus({
      message: modificationResult.message,
      requestedResourceTypes: props.configuration.resourceTypes,
      deploymentAttempted: false,
      stackName: props.configuration.stackName,
      modificationStatus: StackSetOperationStatus.SUCCEEDED,
      appliedResources: modificationResult.appliedResourceDetails,
      notFoundResources: modificationResult.resourceTypesNotFound,
      totalProcessed: modificationResult.totalResourcesProcessed,
      errorCode: RetentionErrorCode.NO_MATCHING_RESOURCES,
    });
  }

  // Step 2: Deploy stack
  response = {
    ...response,
    deploymentAttempted: true,
  };

  await deployStack(
    client,
    props.configuration,
    modificationResult.templateBody!,
    dryRun,
    logPrefix,
    props.partition,
    props.solutionId,
    props.credentials, // Use management account credentials for S3 upload
  );

  // Get final stack status after deployment
  const commandName = 'DescribeStacksCommand';
  const parameters = { StackName: props.configuration.stackName };
  const statusResponse = await executeApi(
    commandName,
    parameters,
    () => client.send(new DescribeStacksCommand(parameters)),
    logger,
    logPrefix,
  );

  response = {
    ...response,
    deploymentStatus: statusResponse.Stacks?.[0]?.StackStatus,
    message: 'Resource retention and deployment completed successfully',
  };

  logger.info(
    `Resource retention operation completed successfully for stack ${props.configuration.stackName}`,
    logPrefix,
  );

  return response;
}

async function isStackExists(
  client: CloudFormationClient,
  stackName: string,
  logPrefix: string,
  targetRegion: string,
): Promise<boolean> {
  logger.info(`Checking if stack ${stackName} exists.`, logPrefix);
  try {
    const commandName = 'DescribeStacksCommand';
    const parameters = {
      StackName: stackName,
    };
    const response = await executeApi(
      commandName,
      parameters,
      () => client.send(new DescribeStacksCommand(parameters)),
      logger,
      logPrefix,
    );
    if (!response.Stacks) {
      const message = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api did not return Stacks object for ${stackName} stack.`;
      logger.error(message, logPrefix);
      statusLogger.error(message, logPrefix);
      throw new Error(message);
    }
    const stackCount = response.Stacks.length;
    if (stackCount > 1) {
      const message = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api returned more than 1 stack for ${stackName} stack.`;
      logger.error(message, logPrefix);
      statusLogger.error(message, logPrefix);
      throw new Error(message);
    }

    if (stackCount === 0) {
      logger.warn(`Stack ${stackName} does not exist.`, logPrefix);
      return false;
    }

    logger.info(`Stack ${stackName} exists.`, logPrefix);
    return true;
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.name === 'ValidationError' && e.message.includes('does not exist')) {
        logger.warn(`Stack ${stackName} does not exist.`, logPrefix);
        return false;
      }
      // A disabled (or never-enabled) opt-in Region rejects CloudFormation calls with
      // InvalidClientTokenId ("The security token included in the request is invalid"). Only an
      // OPT-IN Region can be in this state, so scope the deferral to opt-in Regions: signal an
      // unreachable opt-in Region as a RegionNotAvailableError (distinct from stack-not-found) so
      // the caller defers the target instead of failing the Prepare stage. A
      // standard (always-on) Region can never be disabled, so an InvalidClientTokenId there is a
      // genuine credential failure (suspended/closed account, rejected assumed-role) and MUST stay
      // fatal - it falls through to `throw e` below. Genuine credential expiry
      // (ExpiredToken/ExpiredTokenException) is likewise never swallowed. This gate depends on the
      // OptInRegions allowlist in @aws-accelerator/utils (regions.ts) - see the maintenance note in
      // isRegionReachableForAccount.
      if (e.name === 'InvalidClientTokenId' && OptInRegions.includes(targetRegion)) {
        logger.warn(
          `CloudFormation is unreachable for stack ${stackName} in opt-in Region ${targetRegion} ` +
            `(${e.name}: ${e.message}); Region is not enabled for this account, deferring retention.`,
          logPrefix,
        );
        throw new RegionNotAvailableError(
          `Region ${targetRegion} unreachable for stack ${stackName} (${e.name}: ${e.message})`,
        );
      }
    }
    throw e;
  }
}

/**
 * Determines whether the target Region is reachable for the given account before any
 * CloudFormation call is attempted.
 *
 * Standard (always-on) Regions short-circuit to `true` with no API call. For opt-in Regions
 * this calls `account:GetRegionOptStatus` using the target account's own credentials to check
 * whether the account has actually enabled the Region. A disabled (or never-enabled) opt-in
 * Region is unreachable for CloudFormation, so there is nothing to retain there and the target
 * can be skipped proactively rather than failing the Prepare stage with a fatal
 * `InvalidClientTokenId`.
 *
 * The status lookup uses `endpointRegion` (the invoking/home Region, always enabled) for the
 * Account API endpoint while querying the opt-in status of `targetRegion`. If the status cannot
 * be determined for any reason we fail open (return `true`) and let `isStackExists()` classify
 * the downstream rejection, so this check can never make retention worse than before.
 *
 * @param params.credentials Credentials scoped to the target account (undefined = ambient creds)
 * @param params.endpointRegion An always-reachable Region for the Account API endpoint
 * @param params.targetRegion The Region whose reachability is being evaluated
 * @param params.solutionId Solution id for the custom user agent
 * @param params.logPrefix Log prefix for correlation
 * @returns `true` when the Region is reachable (or unknown), `false` when it is a disabled opt-in Region
 */
async function isRegionReachableForAccount(params: {
  credentials?: AssumeRoleCredentialType;
  endpointRegion: string;
  targetRegion: string;
  solutionId?: string;
  logPrefix: string;
}): Promise<boolean> {
  // Standard Regions are always reachable - no API call needed.
  // Maintenance note: this Region scoping (and the InvalidClientTokenId gate in isStackExists)
  // depends on the OptInRegions allowlist in @aws-accelerator/utils (regions.ts). A newly launched
  // opt-in Region that is not yet in that list is treated as standard here, so the proactive skip
  // is bypassed and its disabled-Region rejection would surface as a fatal InvalidClientTokenId,
  // reintroducing the Prepare-stage failure this guard prevents. Keep regions.ts current as AWS
  // adds opt-in Regions so this deferral keeps covering them.
  if (!OptInRegions.includes(params.targetRegion)) {
    return true;
  }

  try {
    const accountClient = new AccountClient({
      region: params.endpointRegion,
      customUserAgent: params.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: params.credentials,
    });

    const response = await executeApi(
      'GetRegionOptStatusCommand',
      { RegionName: params.targetRegion },
      () => accountClient.send(new GetRegionOptStatusCommand({ RegionName: params.targetRegion })),
      logger,
      params.logPrefix,
    );

    const status = (response as { RegionOptStatus?: string }).RegionOptStatus;
    const enabled = status === 'ENABLED' || status === 'ENABLED_BY_DEFAULT';
    if (!enabled) {
      logger.warn(
        `Opt-in Region ${params.targetRegion} is '${status ?? 'not enabled'}' for this account; ` +
          `skipping retention (Region is unreachable, nothing to retain).`,
        params.logPrefix,
      );
    }
    return enabled;
  } catch (e: unknown) {
    // Fail open: if we cannot determine opt-in status (e.g. missing account:GetRegionOptStatus
    // permission), proceed with the normal flow and rely on isStackExists() to classify any
    // downstream Region-unreachable rejection. This guard can only skip work, never add failure.
    logger.warn(
      `Unable to determine opt-in status for Region ${params.targetRegion} ` +
        `(${e instanceof Error ? `${e.name}: ${e.message}` : 'unknown error'}); ` +
        `proceeding and relying on stack-existence handling.`,
      params.logPrefix,
    );
    return true;
  }
}

async function modifyTemplateForRetention(
  client: CloudFormationClient,
  config: ICfnRetentionModuleConfig,
  dryRun: boolean,
  logPrefix: string,
): Promise<{
  success: boolean;
  message: string;
  templateBody?: string;
  appliedResourceDetails: Array<{
    resourceName: string;
    resourceType: string;
  }>;
  resourceTypesNotFound: string[];
  totalResourcesProcessed: number;
  skipped?: boolean;
}> {
  try {
    logger.info(`Starting template modification for stack ${config.stackName}`, logPrefix);

    const originalTemplateBody = await getStackTemplateBody(client, config.stackName, logPrefix);
    const modificationResult = await applyRetentionPolicy(
      originalTemplateBody,
      config.resourceTypes,
      config.stackName,
      logPrefix,
      config.resourceLogicalIds,
    );

    if (!modificationResult.status) {
      return {
        success: false,
        message: modificationResult.message ?? 'Template modification failed',
        appliedResourceDetails: modificationResult.appliedResourceDetails,
        resourceTypesNotFound: modificationResult.resourceTypesNotFound,
        totalResourcesProcessed: modificationResult.totalResourcesProcessed,
        skipped: modificationResult.skipped,
      };
    }

    // Check if operation was skipped (no resources found)
    if (modificationResult.skipped) {
      logger.info(`Template processing skipped for stack ${config.stackName} - no resources found`, logPrefix);
      return {
        success: true,
        message: modificationResult.message ?? 'Template processing skipped - no resources found',
        appliedResourceDetails: modificationResult.appliedResourceDetails,
        resourceTypesNotFound: modificationResult.resourceTypesNotFound,
        totalResourcesProcessed: modificationResult.totalResourcesProcessed,
        skipped: true,
      };
    }

    // Write template to disk (handles dry run internally)
    await writeTemplateToDisk(config, modificationResult.body!, dryRun, logPrefix);

    logger.info(`Template modification completed successfully for stack ${config.stackName}`, logPrefix);

    return {
      success: true,
      message: 'Template modification completed successfully',
      templateBody: modificationResult.body!,
      appliedResourceDetails: modificationResult.appliedResourceDetails,
      resourceTypesNotFound: modificationResult.resourceTypesNotFound,
      totalResourcesProcessed: modificationResult.totalResourcesProcessed,
      skipped: false,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Template modification failed: ${errorMessage}`, logPrefix);
    statusLogger.error(`Template modification failed: ${errorMessage}`, logPrefix);
    return {
      success: false,
      message: `Template modification failed: ${errorMessage}`,
      appliedResourceDetails: [],
      resourceTypesNotFound: config.resourceTypes,
      totalResourcesProcessed: 0,
      skipped: false,
    };
  }
}

async function deployStack(
  client: CloudFormationClient,
  config: ICfnRetentionModuleConfig,
  templateBody: string,
  dryRun: boolean,
  logPrefix: string,
  partition: string,
  solutionId?: string,
  credentials?: AssumeRoleCredentialType,
): Promise<void> {
  logger.info(`Starting stack deployment for ${config.stackName}`, logPrefix);

  // Upload template to S3
  const s3Key = await uploadTemplateToS3(config, templateBody, dryRun, logPrefix, solutionId, credentials);
  const s3Url = `${getS3Endpoint(partition, config.bucketRegion, config.s3BucketName)}/${s3Key}`;

  // Deploy stack using S3 template URL
  await updateStackWithS3Template(client, config.stackName, s3Url, dryRun, logPrefix);

  // Wait for stack operation to complete
  await waitForStackOperation(client, config.stackName, logPrefix);
}

async function getStackTemplateBody(
  client: CloudFormationClient,
  stackName: string,
  logPrefix: string,
): Promise<string> {
  logger.info(`Retrieving stack ${stackName} template.`, logPrefix);
  const commandName = 'GetTemplateCommand';
  const parameters = {
    StackName: stackName,
    TemplateStage: TemplateStage.Original,
  };

  const response = await executeApi(
    commandName,
    parameters,
    () => client.send(new GetTemplateCommand(parameters)),
    logger,
    logPrefix,
  );
  if (!response.TemplateBody) {
    const message = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetTemplate api did not return TemplateBody for ${stackName} stack.`;
    logger.error(message, logPrefix);
    statusLogger.error(message, logPrefix);
    throw new Error(message);
  }

  logger.info(`Retrieved stack ${stackName} template.`, logPrefix);
  return response.TemplateBody;
}

/**
 * Parse CloudFormation template JSON with error handling
 */
function parseTemplateJson(templateBody: string, stackName: string): ICloudFormationTemplate {
  try {
    return JSON.parse(templateBody);
  } catch (e: unknown) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Invalid JSON in template for stack ${stackName}, error: ${e}`,
    );
  }
}

/**
 * Build a map of resource types to their logical IDs
 */
function buildResourcesByTypeMap(resources: ICloudFormationTemplate['Resources']): Map<string, string[]> {
  const resourcesByType = new Map<string, string[]>();
  for (const [resourceName, resource] of Object.entries(resources)) {
    if (!resourcesByType.has(resource.Type)) {
      resourcesByType.set(resource.Type, []);
    }
    resourcesByType.get(resource.Type)!.push(resourceName);
  }
  return resourcesByType;
}

/**
 * Filter resources by logical IDs if provided, otherwise return all
 */
function filterResourcesByLogicalIds(matchingResources: string[], resourceLogicalIds?: string[]): string[] {
  if (resourceLogicalIds && resourceLogicalIds.length > 0) {
    return matchingResources.filter(resourceName => resourceLogicalIds.includes(resourceName));
  }
  return matchingResources;
}

/**
 * Apply retention policy to a single resource and its dependencies
 */
function applyRetentionToResource(
  resourceName: string,
  resourceType: string,
  templateJson: ICloudFormationTemplate,
  logPrefix: string,
): { resourceName: string; resourceType: string } {
  // Set DeletionPolicy to Retain
  templateJson.Resources[resourceName] = {
    ...templateJson.Resources[resourceName],
    DeletionPolicy: 'Retain',
  };

  // Check if this custom resource has dependent log groups
  const resource = templateJson.Resources[resourceName];
  const dependencies = getDependencies(resource.DependsOn);
  updateCustomResourceLogGroupRetention(resourceName, dependencies, templateJson, logPrefix);

  return { resourceName, resourceType };
}

/**
 * Process resources of a specific type and apply retention policy
 */
function processResourceType(
  resourceType: string,
  matchingResources: string[],
  templateJson: ICloudFormationTemplate,
  stackName: string,
  logPrefix: string,
  resourceLogicalIds?: string[],
): {
  appliedResources: Array<{ resourceName: string; resourceType: string }>;
  notFound: boolean;
} {
  if (matchingResources.length === 0) {
    logger.warn(`No resources found with type ${resourceType} in template ${stackName}`, logPrefix);
    return { appliedResources: [], notFound: true };
  }

  const resourcesToProcess = filterResourcesByLogicalIds(matchingResources, resourceLogicalIds);

  if (resourcesToProcess.length === 0) {
    logger.warn(
      `No resources found with type ${resourceType} matching specified logical IDs in template ${stackName}`,
      logPrefix,
    );
    return { appliedResources: [], notFound: true };
  }

  const appliedResources = resourcesToProcess.map(resourceName =>
    applyRetentionToResource(resourceName, resourceType, templateJson, logPrefix),
  );

  const filterMessage = resourceLogicalIds && resourceLogicalIds.length > 0 ? ' (filtered by logical IDs)' : '';
  logger.info(`Updated ${resourcesToProcess.length} resources of type ${resourceType}${filterMessage}`, logPrefix);

  return { appliedResources, notFound: false };
}

async function applyRetentionPolicy(
  templateBody: string,
  resourceTypes: string[],
  stackName: string,
  logPrefix: string,
  resourceLogicalIds?: string[],
): Promise<{
  status: boolean;
  body?: string;
  message?: string;
  appliedResourceDetails: Array<{
    resourceName: string;
    resourceType: string;
  }>;
  resourceTypesNotFound: string[];
  totalResourcesProcessed: number;
  skipped?: boolean;
}> {
  // Validate input
  if (resourceTypes.length === 0) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: No resource types specified for retention policy`;
    logger.error(message, logPrefix);
    statusLogger.error(message, logPrefix);
    return {
      status: true,
      skipped: true,
      message,
      appliedResourceDetails: [],
      resourceTypesNotFound: [],
      totalResourcesProcessed: 0,
    };
  }

  // Parse template
  const templateJson = parseTemplateJson(templateBody, stackName);

  // Validate resources exist
  if (!templateJson.Resources || Object.keys(templateJson.Resources).length === 0) {
    const message = `No resources found in template for stack ${stackName}. Skipping resource retention.`;
    logger.warn(message, logPrefix);
    return {
      status: true,
      skipped: true,
      message,
      appliedResourceDetails: [],
      resourceTypesNotFound: resourceTypes,
      totalResourcesProcessed: 0,
    };
  }

  // Build resource type map
  const resourcesByType = buildResourcesByTypeMap(templateJson.Resources);

  // Process each resource type
  const appliedResourceDetails: Array<{ resourceName: string; resourceType: string }> = [];
  const resourceTypesNotFound: string[] = [];

  for (const resourceType of resourceTypes) {
    const matchingResources = resourcesByType.get(resourceType) || [];
    const result = processResourceType(
      resourceType,
      matchingResources,
      templateJson,
      stackName,
      logPrefix,
      resourceLogicalIds,
    );

    appliedResourceDetails.push(...result.appliedResources);
    if (result.notFound) {
      resourceTypesNotFound.push(resourceType);
    }
  }

  // Check if any resources were processed
  if (appliedResourceDetails.length === 0) {
    const message = `No matching resources found for specified types in stack ${stackName}. Skipping resource retention.`;
    logger.warn(message, logPrefix);
    return {
      status: true,
      skipped: true,
      message,
      appliedResourceDetails,
      resourceTypesNotFound,
      totalResourcesProcessed: 0,
    };
  }

  logger.info(`Modified stack ${stackName} template.`, logPrefix);
  return {
    status: true,
    body: JSON.stringify(templateJson, null, 2),
    appliedResourceDetails,
    resourceTypesNotFound,
    totalResourcesProcessed: appliedResourceDetails.length,
  };
}

async function writeTemplateToDisk(
  props: ICfnRetentionModuleConfig,
  templateBody: string,
  dryRun: boolean,
  logPrefix: string,
): Promise<void> {
  logger.info(`Creating modified stack ${props.stackName} template into disk.`, logPrefix);
  const fileName = `${props.stackName}.json`;
  const filePath = path.join(props.directory, props.accountId, props.region, fileName);

  // Create directory structure
  if (dryRun) {
    logger.dryRun(
      'fs.mkdir',
      {
        directory: path.dirname(filePath),
        recursive: true,
      },
      logPrefix,
    );
  } else {
    await mkdir(path.dirname(filePath), { recursive: true });
  }

  // Write template file
  if (dryRun) {
    logger.dryRun(
      'fs.writeFile',
      {
        filePath: filePath,
        templateSize: templateBody.length,
        stackName: props.stackName,
      },
      logPrefix,
    );
  } else {
    await writeFile(filePath, templateBody);
    logger.info(`Created modified stack ${props.stackName} template into ${filePath}`, logPrefix);
  }
}

async function uploadTemplateToS3(
  config: ICfnRetentionModuleConfig,
  templateBody: string,
  dryRun: boolean,
  logPrefix: string,
  solutionId?: string,
  credentials?: AssumeRoleCredentialType,
): Promise<string> {
  const now = new Date();
  const timestamp = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${now.getFullYear()}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
  const fileName = `${config.stackName}.json`;
  const s3Key = `cfn-retention/${config.accountId}/${config.region}/${config.stackName}/${timestamp}/${fileName}`;

  const s3Client = new S3Client({
    region: config.bucketRegion,
    retryStrategy: setRetryStrategy(),
    customUserAgent: solutionId,
    credentials,
  });

  logger.info(`Uploading template to S3 bucket ${config.s3BucketName} with key ${s3Key}`, logPrefix);

  if (dryRun) {
    logger.dryRun(
      'uploadFileToS3',
      {
        bucketName: config.s3BucketName,
        objectPath: s3Key,
        templateSize: templateBody.length,
      },
      logPrefix,
    );
  } else {
    await executeApi(
      'uploadFileToS3',
      { bucketName: config.s3BucketName, objectPath: s3Key },
      () => uploadFileToS3(s3Client, config.s3BucketName, s3Key, templateBody),
      logger,
      logPrefix,
    );
    logger.info(`Successfully uploaded template to S3 bucket ${config.s3BucketName} with key ${s3Key}`, logPrefix);
  }

  return s3Key;
}

async function updateStackWithS3Template(
  client: CloudFormationClient,
  stackName: string,
  s3Url: string,
  dryRun: boolean,
  logPrefix: string,
): Promise<void> {
  logger.info(`Deploying stack ${stackName}`, logPrefix);

  const commandName = 'UpdateStackCommand';
  const parameters = {
    StackName: stackName,
    TemplateURL: s3Url,
    Capabilities: ['CAPABILITY_NAMED_IAM' as const],
  };

  if (dryRun) {
    logger.dryRun(commandName, parameters, logPrefix);
    return;
  }

  try {
    await executeApi(commandName, parameters, () => client.send(new UpdateStackCommand(parameters)), logger, logPrefix);
  } catch (error: unknown) {
    const noUpdateMessage = 'No updates are to be performed';
    if (error instanceof Error && error.name === 'ValidationError' && error.message.includes(noUpdateMessage)) {
      const message = `${noUpdateMessage} for stack ${stackName}`;
      logger.warn(message, logPrefix);
      return; // This is not an error, just no changes needed
    }
    throw error; // Re-throw other errors
  }
}

async function waitForStackOperation(
  client: CloudFormationClient,
  stackName: string,
  logPrefix: string,
): Promise<void> {
  logger.info(`Waiting for stack ${stackName} operation to complete`, logPrefix);

  const FAILED_STATES: Set<StackStatus> = new Set([
    StackStatus.CREATE_FAILED,
    StackStatus.ROLLBACK_IN_PROGRESS,
    StackStatus.ROLLBACK_FAILED,
    StackStatus.ROLLBACK_COMPLETE,
    StackStatus.UPDATE_ROLLBACK_IN_PROGRESS,
    StackStatus.UPDATE_ROLLBACK_FAILED,
    StackStatus.UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS,
    StackStatus.UPDATE_ROLLBACK_COMPLETE,
  ]);

  const SUCCESS_STATES: Set<StackStatus> = new Set([StackStatus.CREATE_COMPLETE, StackStatus.UPDATE_COMPLETE]);

  const IN_PROGRESS_STATES: Set<StackStatus> = new Set([
    StackStatus.CREATE_IN_PROGRESS,
    StackStatus.UPDATE_IN_PROGRESS,
    StackStatus.UPDATE_COMPLETE_CLEANUP_IN_PROGRESS,
  ]);

  await waitUntil(
    async () => {
      const commandName = 'DescribeStacksCommand';
      const parameters = { StackName: stackName };

      const response = await executeApi(
        commandName,
        parameters,
        () => client.send(new DescribeStacksCommand(parameters)),
        logger,
        logPrefix,
      );

      if (!response.Stacks || response.Stacks.length === 0) {
        throw new Error(`Stack ${stackName} not found`);
      }

      const stackStatus = response.Stacks[0].StackStatus;

      if (stackStatus && FAILED_STATES.has(stackStatus)) {
        const reason = response.Stacks[0].StackStatusReason ?? 'No reason provided';
        throw new Error(`Stack ${stackName} operation failed with status ${stackStatus} - ${reason}`);
      }

      if (stackStatus && SUCCESS_STATES.has(stackStatus)) {
        logger.info(`Stack ${stackName} operation completed successfully with status ${stackStatus}`, logPrefix);
        return true; // Operation completed successfully
      }

      if (stackStatus && IN_PROGRESS_STATES.has(stackStatus)) {
        logger.info(`Stack ${stackName} operation is in progress with status ${stackStatus}`, logPrefix);
        return false; // Continue waiting
      }

      throw new Error(`Stack ${stackName} operation completed with unexpected status: ${stackStatus}`);
    },
    `Stack ${stackName} operation did not complete within the expected time`,
    logger,
    logPrefix,
    Math.floor((STACK_OPERATION_MAX_WAIT_MINUTES * 60) / STACK_OPERATION_CHECK_INTERVAL_SECONDS), // 30 retries
    STACK_OPERATION_CHECK_INTERVAL_SECONDS / 60, // 0.5 minutes (30 seconds)
  );
}

function getDependencies(dependsOn: unknown): string[] {
  if (!dependsOn) return [];

  if (typeof dependsOn === 'string') {
    return [dependsOn];
  }

  if (Array.isArray(dependsOn)) {
    return dependsOn.filter((dep): dep is string => typeof dep === 'string');
  }

  return [];
}

function updateCustomResourceLogGroupRetention(
  resourceName: string,
  dependencies: string[],
  templateJson: ICloudFormationTemplate,
  logPrefix: string,
) {
  for (const dependency of dependencies) {
    const resourceDependencies = templateJson.Resources[dependency];
    if (resourceDependencies && resourceDependencies.Type === 'AWS::Logs::LogGroup') {
      templateJson.Resources[dependency] = {
        ...templateJson.Resources[dependency],
        DeletionPolicy: 'Retain',
      };
      logger.info(
        `Updated deletion policy for dependent log group ${dependency} of custom resource ${resourceName}`,
        logPrefix,
      );
    }
  }
}

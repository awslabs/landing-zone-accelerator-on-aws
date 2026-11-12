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
 * @fileoverview Type definitions for resource retention operations.
 *
 * @description
 * This module provides type definitions specific to CloudFormation resource retention operations.
 * These types are used across the resource-retention module for:
 * - Retention status tracking
 * - Stack configuration
 * - Retention results
 * - State management
 *
 * @example
 * ```typescript
 * // Using retention types
 * const config: IStackRetentionConfig = {
 *   accountId: 'XXXXXXXXXXXX',
 *   region: 'us-east-1',
 *   stackName: 'AWSAccelerator-SecurityStack-XXXXXXXXXXXX-us-east-1',
 *   resourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
 *   accountAccessRoleName: 'AWSControlTowerExecution',
 *   s3BucketName: 'cdk-accel-assets-XXXXXXXXXXXX-us-east-1',
 *   bucketRegion: 'us-east-1'
 * };
 * ```
 */

/**
 * Retention status enumeration for CloudFormation stack resource retention.
 * Tracks the lifecycle of retention operations from pending to completion.
 *
 * @enum {string}
 */
export enum RetentionStatus {
  /**
   * Retention has not been attempted yet.
   * Initial state when a stack is first identified for retention.
   */
  PENDING = 'PENDING',

  /**
   * Retention operation is currently in progress.
   * CloudFormation UpdateStack is being executed.
   */
  IN_PROGRESS = 'IN_PROGRESS',

  /**
   * Retention successfully completed.
   * Resources now have DeletionPolicy: Retain set.
   */
  COMPLETED = 'COMPLETED',

  /**
   * Retention operation failed.
   * Will be retried on next execution.
   */
  FAILED = 'FAILED',

  /**
   * CloudFormation stack was not found.
   * Treated as completed (nothing to retain).
   */
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * Stack configuration for resource retention.
 * Defines which CloudFormation stack to retain resources from and what resource types to target.
 */
export interface IStackRetentionConfig {
  /**
   * AWS account ID where the stack exists
   */
  readonly accountId: string;

  /**
   * AWS region where the stack exists
   */
  readonly region: string;

  /**
   * CloudFormation stack name
   * @example 'AWSAccelerator-OrganizationsStack-XXXXXXXXXXXX-us-east-1'
   */
  readonly stackName: string;

  /**
   * Array of resource types to retain from the stack
   * @example ['Custom::MacieEnableOrganizationAdminAccount', 'AWS::S3::Bucket']
   */
  readonly resourceTypes: string[];

  /**
   * Optional array of specific resource logical IDs to retain
   * When provided, only these specific resources will be retained (selective retention)
   * When omitted or empty, ALL resources matching resourceTypes will be retained
   * @example ['ReportBucket', 'AccessLogsBucket']
   */
  readonly resourceLogicalIds?: string[];

  /**
   * Optional IAM role name for cross-account access
   * Used when the stack is in a different account than the execution account
   */
  readonly accountAccessRoleName?: string;

  /**
   * S3 bucket name for uploading modified CloudFormation templates
   * Regional bucket in management account for template retention
   * @example 'awsaccelerator-cfn-retention-us-east-1'
   */
  readonly s3BucketName: string;

  /**
   * AWS region where the S3 bucket exists
   * This is typically the home region where the CDK bootstrap bucket is located
   * Used to create the S3 client with the correct regional endpoint
   * @example 'us-east-1'
   */
  readonly bucketRegion: string;
}

/**
 * Result of retention operation for a single stack.
 * Returned after attempting to retain resources from a CloudFormation stack.
 */
export interface IRetentionResult {
  /**
   * CloudFormation stack name that was processed
   */
  readonly stackName: string;

  /**
   * AWS account ID where the stack exists
   */
  readonly accountId: string;

  /**
   * AWS region where the stack exists
   */
  readonly region: string;

  /**
   * Status of the retention operation
   * - COMPLETED: Resources successfully retained
   * - FAILED: Retention operation failed
   * - SKIPPED: Retention was skipped (already completed or not needed)
   * - NOT_FOUND: Stack or resources not found
   */
  readonly status: 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'NOT_FOUND';

  /**
   * Human-readable message describing the result
   */
  readonly message: string;

  /**
   * Number of resources that were retained (if applicable)
   */
  readonly resourcesRetained?: number;

  /**
   * Error message if the operation failed
   */
  readonly error?: string;
}

/**
 * Resource retention state stored in DynamoDB.
 * Tracks the retention status of CloudFormation stacks to avoid redundant operations.
 */
export interface IResourceRetentionState {
  /**
   * Service name (e.g., 'MACIE', 'GUARDDUTY', 'SECURITYHUB', 'DETECTIVE', 'S3')
   */
  readonly serviceName: string;

  /**
   * AWS account ID where the stack exists
   */
  readonly accountId: string;

  /**
   * AWS region where the stack exists
   */
  readonly region: string;

  /**
   * CloudFormation stack name
   */
  readonly stackName: string;

  /**
   * Array of resource types that were targeted for retention
   * @example ['Custom::MacieCreateMember', 'AWS::S3::Bucket']
   */
  readonly resourceTypes: string[];

  /**
   * Optional array of specific resource logical IDs that were retained
   * Tracks which specific resources have been retained for incremental migration support
   * When empty or undefined, indicates all resources of the specified types were retained
   * @example ['ReportBucket', 'AccessLogsBucket']
   */
  readonly resourceLogicalIds?: string[];

  /**
   * Current retention status
   * Uses RetentionStatus enum for type safety and autocomplete support
   */
  readonly retentionStatus: RetentionStatus;

  /**
   * ISO timestamp when retention was completed (if applicable)
   * @example '2024-01-15T10:30:00.000Z'
   */
  readonly retentionTime?: string;

  /**
   * Number of retention attempts made
   * Incremented on each retry
   */
  readonly retentionAttempts: number;

  /**
   * Error message from the last failed attempt (if applicable)
   */
  readonly lastError?: string;

  /**
   * Flag indicating if resources have been successfully retained
   * When true, DeletionPolicy: Retain has been applied and retention will be skipped on subsequent executions
   */
  readonly resourcesRetained: boolean;
}

/**
 * Configuration for building stack retention configurations.
 * Generic interface that works for any stack type and migration scenario.
 */
export interface IStackConfigBuilderInput {
  /** Stack name prefix (e.g., 'AWSAccelerator-OrganizationsStack', 'AWSAccelerator-NetworkVpcStack') */
  readonly stackPrefix: string;
  /** List of AWS account IDs to create stack configs for */
  readonly accounts: string[];
  /** List of AWS regions to create stack configs for */
  readonly regions: string[];
  /** Custom resource types to retain from these stacks */
  readonly resourceTypes: string[];
  /** Optional account access role name for cross-account operations */
  readonly accountAccessRoleName?: string;
  /**
   * S3 bucket name for uploading modified CloudFormation templates.
   * Always uses the CDK bootstrap bucket in the home region.
   * @example 'cdk-accel-assets-XXXXXXXXXXXX-us-east-1'
   */
  readonly s3BucketName: string;
  /**
   * AWS region where the S3 bucket exists.
   * This is typically the home region where the CDK bootstrap bucket is located.
   * Used to create the S3 client with the correct regional endpoint.
   * @example 'us-east-1'
   */
  readonly bucketRegion: string;
}

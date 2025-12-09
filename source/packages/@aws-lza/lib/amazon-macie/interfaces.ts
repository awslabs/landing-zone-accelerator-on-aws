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
 * @fileoverview Amazon Macie Interface Definitions - Type definitions for Macie operations
 *
 * Provides comprehensive interface definitions for Amazon Macie module operations
 * including configuration, requests, responses, and data structures. These interfaces
 * ensure type safety and consistency across all Macie-related operations.
 *
 * Key interface categories:
 * - Configuration interfaces for Macie setup
 * - Request and response interfaces for module operations
 * - S3 destination and data source configurations
 * - Organization and session management structures
 */

import { FindingPublishingFrequency } from '@aws-sdk/client-macie2';
import {
  IConcurrencySettings,
  IModuleBoundary,
  IModuleRequest,
  IModuleOrganizationsDataSource,
  IModuleRegionFilters,
} from '../common/interfaces';
import { SecurityModuleOperationType } from '../common/types';

/**
 * S3 destination configuration for Macie findings and exports
 */
export interface IMacieS3Destination {
  /** S3 bucket name for storing Macie findings */
  bucketName: string;
  /** KMS key ARN for encrypting stored findings */
  kmsKeyArn: string;
  /** Optional key prefix for organizing findings in S3 */
  keyPrefix?: string;
}

/**
 * Data source configuration for Macie module operations
 */
export interface IMacieModuleDataSources {
  /** Organizations data source configuration */
  readonly organizations: IModuleOrganizationsDataSource;
}

/**
 * Complete configuration interface for Amazon Macie module operations
 */
export interface IMacieConfiguration {
  /** IAM role name for cross-account access */
  readonly accountAccessRoleName: string;
  /** Whether to enable or disable Macie */
  readonly enable: boolean;
  /** Account ID for delegated administrator */
  readonly delegatedAdminAccountId: string;
  /** Frequency for publishing policy findings */
  readonly policyFindingsPublishingFrequency: FindingPublishingFrequency;
  /** Whether to publish sensitive data findings to Security Hub */
  readonly publishSensitiveDataFindings: boolean;
  /** Whether to publish policy findings to Security Hub */
  readonly publishPolicyFindings: boolean;
  /** S3 destination configuration for findings export */
  readonly s3Destination: IMacieS3Destination;
  /** Optional regional filtering configuration */
  readonly regionFilters?: IModuleRegionFilters;
  /** Optional boundary configuration for operation scope */
  readonly boundary?: IModuleBoundary;
  /** Optional concurrency settings for batch operations */
  readonly concurrency?: IConcurrencySettings;
  /** Optional data source configurations */
  readonly dataSources?: IMacieModuleDataSources;
}

/**
 * Request interface for Macie module operations extending base module request
 */
export interface IMacieModuleRequest extends IModuleRequest {
  /** Macie-specific configuration */
  readonly configuration: IMacieConfiguration;
}

/**
 * Base response interface for Macie operations
 */
interface IMacieBaseResponse {
  /** Type of operation performed (enabled/disabled) */
  operation: SecurityModuleOperationType;
  /** List of regions where operation was performed */
  regions: string[];
}

/**
 * Account-level response interface extending base response
 */
interface IMacieAccountResponse extends IMacieBaseResponse {
  /** List of account IDs affected by the operation */
  accountIds: string[];
}
/**
 * Organization admin configuration response interface
 */
export interface IMacieOrganizationAdminResponse extends IMacieBaseResponse {
  /** Management account ID */
  managementAccountId: string;
  /** Delegated administrator account ID */
  delegatedAdminAccountId: string;
}

/**
 * Delegated account configuration response interface
 */
export interface IMacieDelegatedAccountResponse extends IMacieBaseResponse {
  /** Administrator account ID */
  adminAccountId: string;
  /** List of member account IDs */
  memberAccountIds: string[];
}

/**
 * Macie session configuration response interface
 */
export interface IMacieSessionResponse extends IMacieAccountResponse {
  /** Whether sensitive data findings are published */
  publishSensitiveDataFindings?: boolean;
  /** Frequency of finding publication */
  findingPublishingFrequency?: string;
  /** S3 destination configuration */
  s3Destination?: IMacieS3Destination;
}

/**
 * Complete Macie module response interface containing all configuration results
 */
export interface IMacieModuleResponse {
  /** Organization admin configuration results */
  organizationAdminConfig: IMacieOrganizationAdminResponse[];
  /** Delegated admin account configuration results */
  delegatedAdminAccountConfig: IMacieDelegatedAccountResponse[];
  /** Session configuration results */
  sessionConfig: IMacieSessionResponse[];
}

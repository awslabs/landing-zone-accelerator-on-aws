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
 * @fileoverview Amazon GuardDuty Interface Definitions - Type definitions for GuardDuty operations
 *
 * Provides comprehensive interface definitions for Amazon GuardDuty module operations
 * including configuration, requests, responses, and data structures. These interfaces
 * ensure type safety and consistency across all GuardDuty-related operations.
 *
 * Key interface categories:
 * - Feature flag interfaces for GuardDuty protection types
 * - Configuration interfaces for GuardDuty setup
 * - Request and response interfaces for module operations
 * - S3 destination and export configurations
 * - Organization and detector management structures
 */

import { DestinationType, FindingPublishingFrequency, OrgFeatureStatus } from '@aws-sdk/client-guardduty';
import {
  IModuleBoundary,
  IModuleOrganizationsDataSource,
  IModuleRegionFilters,
  IModuleRequest,
  IRequiredBatchOperationSettings,
  ISecurityBaseConfig,
  ISecurityServiceModuleResponse,
} from '../common/interfaces';
import { SecurityModuleOperationType } from '../common/types';

/**
 * Configuration for GuardDuty protections
 */
export interface IGuardDutyProtectionsConfiguration {
  /** Configuration for GuardDuty S3 Protection */
  readonly s3Protection: IGuardDutyBaseProtectionConfiguration;
  /** Configuration for AWS GuardDuty EKS Protection*/
  readonly eksProtection?: IGuardDutyEksProtectionConfig;
  /** Configuration for GuardDuty EC2 Protection */
  readonly ec2Protection?: IGuardDutyEc2ProtectionConfig;
  /** Configuration for RDS Protection */
  readonly rdsProtection?: IGuardDutyBaseProtectionConfiguration;
  /** Configuration for GuardDuty Lambda Protection */
  readonly lambdaProtection?: IGuardDutyBaseProtectionConfiguration;
}

/**
 * Common configuration parameters for GuardDuty protections
 */
export interface IGuardDutyBaseProtectionConfiguration {
  /**
   * Controls whether the given protection is enabled
   */
  readonly enable: boolean;
  /**
   * List of AWS regions where the given protection should not be enabled
   */
  readonly excludedRegions?: string[];
}

/**
 * Configuration for GuardDuty EKS Protection with agent management
 */
export interface IGuardDutyEksProtectionConfig extends IGuardDutyBaseProtectionConfiguration {
  /**
   * Controls whether the GuardDuty EKS Agent is managed
   */
  readonly manageAgent?: boolean;
}

/**
 * Configuration for GuardDuty EC2 Malware Protection with snapshot retention
 */
export interface IGuardDutyEc2ProtectionConfig extends IGuardDutyBaseProtectionConfiguration {
  /**
   * Controls whether EBS snapshots created during malware scanning are retained.
   * When enables, snapshots are preserved.
   */
  readonly keepSnapshots: boolean;
}

/**
 * S3 destination configuration for GuardDuty findings export
 */
export interface IGuardDutyExportDestination {
  /** S3 bucket ARN for storing GuardDuty findings */
  readonly destinationArn: string;
  /** KMS key ARN for encrypting stored findings */
  readonly kmsKeyArn: string;
  /** Destination type (currently only S3 supported) */
  readonly destinationType: DestinationType;
  /** Whether to override an existing publishing destination */
  readonly overrideExisting?: boolean;
}

/**
 * Data source configuration for GuardDuty module operations
 */
export interface IGuardDutyModuleDataSources {
  /** Organizations data source configuration */
  readonly organizations: IModuleOrganizationsDataSource;
}

/**
 * Complete configuration interface for Amazon GuardDuty module operations
 */
export interface IGuardDutyConfiguration extends ISecurityBaseConfig {
  /** How to auto-enable GuardDuty for new organization members */
  readonly autoEnableOrgMembers: OrgFeatureStatus;
  /** Feature flags for GuardDuty protection types */
  readonly protectionsConfiguration?: IGuardDutyProtectionsConfiguration;
  /** Frequency for publishing findings */
  readonly exportFrequency?: FindingPublishingFrequency;
  /** Export destination configuration for findings */
  readonly exportDestination?: IGuardDutyExportDestination;
  /** Whether to retain EBS malware snapshots with findings */
  readonly enableKeepMalwareSnapshots?: boolean;
  /** Optional regional filtering configuration */
  readonly regionFilters?: IModuleRegionFilters;
  /**
   * Optional boundary configuration for operation scope.
   *
   * When `boundary.accounts` is non-empty, member enrollment is scoped to those accounts and
   * out-of-boundary accounts are pruned (disassociated/removed). This REQUIRES
   * `autoEnableOrgMembers: NONE` — combining an account boundary with `NEW`/`ALL` is contradictory
   * (GuardDuty would auto-enroll pruned accounts and reject the disassociation) and the module throws.
   */
  readonly boundary?: IModuleBoundary;
  /** Concurrency settings for batch operations */
  readonly batchOperationSettings: IRequiredBatchOperationSettings;
  /** Optional data source configurations */
  readonly dataSources?: IGuardDutyModuleDataSources;
}

/**
 * Request interface for GuardDuty module operations extending base module request
 */
export interface IGuardDutyModuleRequest extends IModuleRequest {
  /** GuardDuty-specific configuration */
  readonly configuration: IGuardDutyConfiguration;
}

/**
 * GuardDuty detector configuration response interface
 */
export interface IGuardDutyDetectorResponse {
  /** Type of operation performed (enabled/disabled) */
  readonly operation: SecurityModuleOperationType;
  /** List of regions where operation was performed */
  readonly regions: string[];
  /** List of account IDs affected by the operation */
  readonly accountIds: string[];
  /** Feature flags that were configured */
  readonly protectionsConfiguration?: IGuardDutyProtectionsConfiguration;
  /** Finding publishing frequency */
  readonly exportFrequency?: string;
  /** Export destination configuration */
  readonly exportDestination?: IGuardDutyExportDestination;
}

/**
 * Complete GuardDuty module response interface
 * Extends base security service response with GuardDuty-specific detector configuration
 */
export interface IGuardDutyModuleResponse extends ISecurityServiceModuleResponse {
  /** Detector configuration results */
  readonly detectorConfig: IGuardDutyDetectorResponse[];
}

/**
 * Flags dictating which GuardDuty features should be enabled
 */
export interface IGuardDutyFeatureFlags {
  /**
   * Whether or not to enable S3 Data Events logging
   */
  s3DataEvents?: boolean;
  /**
   * Whether or not to enable EKS audit logs
   */
  eksProtection?: boolean;
  /**
   * Whether or not to enable EKS runtime monitoring
   */
  eksAgent?: boolean;
  /**
   * Whether or not to enable EC2 EBS Malware protection
   */
  ec2Protection?: boolean;
  /**
   * Whether or not to enable RDS Data Events logging
   */
  rdsProtection?: boolean;
  /**
   * Whether or not to enable Lambda network logging
   */
  lambdaProtection?: boolean;
}

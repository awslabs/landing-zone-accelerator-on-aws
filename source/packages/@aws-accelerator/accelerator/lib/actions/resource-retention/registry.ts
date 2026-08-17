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
 * @fileoverview Master registry of CloudFormation custom resources for retention operations.
 *
 * @description
 * This registry maps CloudFormation stack prefixes to the custom resource types that need
 * to be retained during service migrations. The registry is used by the StackResources
 * retention module to aggregate resources across all services and perform unified retention
 * operations in the PREPARE stage.
 *
 * **Structure:**
 * - Key: Stack prefix from AcceleratorStackNames (e.g., AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS])
 * - Value: Array of CloudFormation custom resource types to retain
 *
 * **Stack Naming:**
 * Keys use AcceleratorStackNames to get the dynamic stack prefix based on the configured
 * accelerator prefix. This ensures the registry works regardless of the stack prefix configuration.
 *
 * **Usage:**
 * The StackResources.retain() method reads this registry, aggregates resources by stack prefix,
 * and performs batch retention operations before any service-specific actions run.
 *
 * **Adding New Services:**
 * To add a new service to retention:
 * 1. Identify which stack types contain the service's custom resources
 * 2. Add the custom resource types to the appropriate AcceleratorStackNames[stage] arrays
 * 3. No code changes needed - just update this data file
 *
 * @example
 * ```typescript
 * // Registry structure
 * export const RESOURCE_RETENTION_REGISTRY = {
 *   [AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]]: [
 *     'Custom::MacieEnableOrganizationAdminAccount',
 *     'Custom::GuardDutyEnableOrganizationAdminAccount'
 *   ],
 *   [AcceleratorStackNames[AcceleratorStage.SECURITY]]: [
 *     'Custom::MaciePutClassificationExportConfiguration'
 *   ]
 * };
 * ```
 */

import { AcceleratorStackNames } from '../../accelerator';
import { AcceleratorStage } from '../../accelerator-stage';
import { AcceleratorModules } from '../../types';

/**
 * Service retention configuration interface.
 *
 * @description
 * Defines the structure for service-specific retention configuration.
 * Services are grouped by stack type for efficient batch retention operations.
 *
 * @interface IServiceRetentionConfig
 *
 * @property {AcceleratorModules} serviceName - Service identifier from AcceleratorModules enum
 *   Used for documentation and tracking purposes. Service-level skip control is handled
 *   via SKIP_{serviceName}_MODULE environment variable (e.g., SKIP_MACIE_MODULE).
 * @property {string[]} resourceTypes - Array of CloudFormation custom resource types to retain
 *
 * @example
 * ```typescript
 * const macieConfig: IServiceRetentionConfig = {
 *   serviceName: AcceleratorModules.MACIE,  // 'macie'
 *   resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount']
 * };
 * // Service can be skipped with: SKIP_MACIE_MODULE=true
 * ```
 */
export interface IServiceRetentionConfig {
  serviceName: AcceleratorModules;
  resourceTypes: string[];
}

/**
 * Master registry of CloudFormation custom resources for retention operations.
 *
 * @description
 * Maps CloudFormation stack prefixes (from AcceleratorStackNames) to arrays of service
 * retention configurations. Each service configuration includes the service name and
 * the custom resource types that need DeletionPolicy: Retain set before service migration.
 * This enables safe migration from CloudFormation custom resources to native AWS SDK-based
 * implementations.
 *
 * **Stack Naming Convention:**
 * Stack names are constructed using the pattern: `{stackPrefix}-{accountId}-{region}`
 * - stackPrefix comes from AcceleratorStackNames[stage]
 * - Example: `AWSAccelerator-OrganizationsStack-123456789012-us-east-1`
 *
 * **Module-Level Control:**
 * Individual services can be skipped using their module environment variables:
 * - `SKIP_{serviceName}_MODULE=true` - Skip entire service module (both retention and API)
 * - Example: `SKIP_MACIE_MODULE=true` skips Macie retention and API module
 * - Example: `SKIP_GUARDDUTY_MODULE=true` skips GuardDuty retention and API module
 *
 * **Entire Retention Module Control:**
 * The entire retention module can be skipped:
 * - `SKIP_STACK_RESOURCES_RETENTION_MODULE=true` - Skip all retention operations
 *
 * **Resource Aggregation:**
 * When multiple services have resources in the same stack type, they are processed
 * together in a single retention operation, reducing API calls and processing time.
 *
 * @constant
 * @type {Record<string, IServiceRetentionConfig[]>}
 *
 * @example
 * ```typescript
 * // Example: OrganizationsStack has resources from multiple services
 * [AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]]: [
 *   {
 *     serviceName: AcceleratorModules.MACIE,
 *     resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount']
 *   },
 *   {
 *     serviceName: AcceleratorModules.GUARDDUTY,
 *     resourceTypes: ['Custom::GuardDutyEnableOrganizationAdminAccount']
 *   }
 * ]
 * // Result: Both services processed together in one retention operation
 * // Skip Macie: SKIP_MACIE_MODULE=true
 * // Skip GuardDuty: SKIP_GUARDDUTY_MODULE=true
 * // Skip all retention: SKIP_STACK_RESOURCES_RETENTION_MODULE=true
 * ```
 */
export const RESOURCE_RETENTION_REGISTRY: Record<string, IServiceRetentionConfig[]> = {
  /**
   * OrganizationsStack resources (management account, all enabled regions).
   *
   * @description
   * Contains organization-level resources that enable services across the AWS organization.
   * These resources typically configure delegated administrator accounts and organization-wide settings.
   *
   * **Module Control:**
   * - Skip Macie: `SKIP_MACIE_MODULE=true`
   * - Skip GuardDuty: `SKIP_GUARDDUTY_MODULE=true` (when added)
   * - Skip all retention: `SKIP_STACK_RESOURCES_RETENTION_MODULE=true`
   */
  [AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]]: [
    {
      serviceName: AcceleratorModules.MACIE,
      resourceTypes: ['Custom::MacieEnableOrganizationAdminAccount'],
    },
    {
      serviceName: AcceleratorModules.GUARDDUTY,
      resourceTypes: ['Custom::GuardDutyEnableOrganizationAdminAccount'],
    },
  ],

  /**
   * SecurityAuditStack resources (audit account, all enabled regions).
   *
   * @description
   * Contains resources deployed to the audit account for centralized security monitoring
   * and compliance. These resources typically manage member accounts and aggregation.
   *
   * **Module Control:**
   * - Skip Macie: `SKIP_MACIE_MODULE=true`
   * - Skip all retention: `SKIP_STACK_RESOURCES_RETENTION_MODULE=true`
   */
  [AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]]: [
    {
      serviceName: AcceleratorModules.MACIE,
      resourceTypes: ['Custom::MacieCreateMember'],
    },
    {
      serviceName: AcceleratorModules.GUARDDUTY,
      resourceTypes: ['Custom::GuardDutyCreateMembers', 'Custom::GuardDutyUpdateDetector'],
    },
  ],

  /**
   * SecurityStack resources (all accounts, all enabled regions).
   *
   * @description
   * Contains resources deployed to all accounts for security service configuration.
   * These resources typically configure service-specific settings and integrations.
   *
   * **Module Control:**
   * - Skip Macie: `SKIP_MACIE_MODULE=true`
   * - Skip all retention: `SKIP_STACK_RESOURCES_RETENTION_MODULE=true`
   */
  [AcceleratorStackNames[AcceleratorStage.SECURITY]]: [
    {
      serviceName: AcceleratorModules.MACIE,
      resourceTypes: ['Custom::MaciePutClassificationExportConfiguration'],
    },
    {
      serviceName: AcceleratorModules.GUARDDUTY,
      resourceTypes: ['Custom::GuardDutyCreatePublishingDestinationCommand'],
    },
  ],

  /**
   * NetworkAssociationsStack resources (TGW owner accounts, TGW regions).
   *
   * @description
   * Contains native CFN resources for TGW route table associations and propagations.
   * When the TGW module handles these operations, the CDK guard removes these resources
   * from the template. Without retention, CloudFormation would delete the actual AWS
   * resources during stack update.
   *
   * **Module Control:**
   * - Skip TGW module: `SKIP_TGW_ASSOCIATIONS_AND_PROPAGATIONS_MODULE=true`
   * - Skip all retention: `SKIP_STACK_RESOURCES_RETENTION_MODULE=true`
   */
  [AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]]: [
    {
      serviceName: AcceleratorModules.TGW_ASSOCIATIONS_AND_PROPAGATIONS,
      resourceTypes: [
        'AWS::EC2::TransitGatewayRouteTableAssociation',
        'AWS::EC2::TransitGatewayRouteTablePropagation',
        'AWS::EC2::TransitGatewayConnect',
      ],
    },
  ],

  // Add more stack types and resources as services are migrated
  // Examples:
  //
  // [AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]]: [
  //   'Custom::TransitGatewayCreatePeering',
  //   'Custom::TransitGatewayAttachment'
  // ],
  //
  // [AcceleratorStackNames[AcceleratorStage.LOGGING]]: [
  //   'Custom::CloudWatchLogsRetentionPolicy'
  // ]
};

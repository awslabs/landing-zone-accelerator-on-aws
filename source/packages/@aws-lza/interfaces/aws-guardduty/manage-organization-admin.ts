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

import { IModuleCommonParameter } from '../../common/resources';

/**
 * Amazon GuardDuty Organization Admin Configuration
 *
 * @description
 * Configuration for managing GuardDuty organization admin account
 *
 * @example
 * ```
 * {
 *   enable: true,
 *   accountId: '123456789012',
 *   operation: 'manage-organization-admin',
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   dryRun: 'true',
 *   solutionId: 'test',
 * }
 * ```
 */
export interface IGuardDutyManageOrganizationAdminConfiguration {
  /**
   * Flag indicating whether the organization admin should be enabled or cleared
   */
  readonly enable: boolean;
  /**
   * Which account should be set or removed as the organization admin
   */
  readonly accountId: string;
}

/**
 * AWS GuardDuty organization admin handler parameter
 */
export interface IGuardDutyManageOrganizationAdminParameter extends IModuleCommonParameter {
  /**
   * AWS GuardDuty Organization Admin configuration
   *
   * @example
   *
   * ```
   * {
   *   enable: true,
   *   accountId: '123456789012',
   *   operation: 'manage-organization-admin',
   *   partition: 'aws',
   *   region: 'us-east-1',
   *   dryRun: 'true',
   *   solutionId: 'test',
   * }
   * ```
   */
  configuration: IGuardDutyManageOrganizationAdminConfiguration;
}

/**
 * AWS GuardDuty organization admin module interface
 */
export interface IGuardDutyManageOrganizationAdminModule {
  /**
   * Handler function for GuardDuty Organization Admin configuration
   *
   * @param props {@link IGuardDutyManageOrganizationAdminParameter}
   * @returns status string
   *
   */
  handler(props: IGuardDutyManageOrganizationAdminParameter): Promise<string>;
}

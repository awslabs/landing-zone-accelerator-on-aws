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
 * AWS Security Hub Organization Admin Configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 * ```
 * {
 *   enable: false,
 *   accountId: "11111111111"
 * }
 * ```
 */
export interface ISecurityHubManageOrganizationAdminConfiguration {
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
 * AWS Security Hub module handler parameter
 */
export interface ISecurityHubManageOrganizationAdminParameter extends IModuleCommonParameter {
  /**
   * AWS Security Hub Organization Admin Configuration
   *
   * @example
   *
   * ```
   * {
   *   enable: false,
   *   accountId: "11111111111"
   * }
   * ```
   */
  readonly configuration: ISecurityHubManageOrganizationAdminConfiguration;
}

/**
 * Security Hub Organization Admin
 */
export interface ISecurityHubManageOrganizationAdminModule {
  /**
   * Handler function for Security Hub Organization Admin Configuration
   *
   * @param props {@link ISecurityHubManageOrganizationAdminParameter}
   * @returns status string
   */
  handler(props: ISecurityHubManageOrganizationAdminParameter): Promise<string>;
}

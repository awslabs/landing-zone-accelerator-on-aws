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
export interface IRootUserManagementConfiguration {
  /**
   * Root User Management Configuration
   *
   * @description
   * Is centralized root user managment enabled.
   */
  readonly enabled: boolean;
  /**
   * Root User Management Capabilities
   *
   * @description
   * Is credentials management enabled.
   */
  readonly credentials: boolean;
  /**
   * Are root user sessions enabled.
   */
  readonly session: boolean;
}

/**
 * AWS IAM Root User Managment handler parameter
 */
export interface IRootUserManagementHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Root User Management Configuration
   *
   * @example
   * ```
   * {
   *   enabled: true,
   *   credentials: true,
   *   session: true,
   * }
   * ```
   */
  configuration: IRootUserManagementConfiguration;
}
/**
 * AWS IAM Root User Management Module interface
 *
 */
export interface IRootUserManagementModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IRootUserManagementHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IRootUserManagementHandlerParameter): Promise<string>;
}

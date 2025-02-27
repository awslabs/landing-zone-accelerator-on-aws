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
 * AWS Organizations organizational unit (OU) registration configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 *
 * ```
 * {
 *   name: 'OU1/OU2',
 * }
 * ```
 */
export interface IRegisterOrganizationalUnitConfiguration {
  /**
   * The friendly name to the OU.
   *
   * @description
   * For nested OU, you need to provide complete path of the target OU.
   * Example:
   *  - Level1/Level2-02/Level3-01/Level4-01
   *  - Level1/Level2-02
   *  - Level1 (Parent OU is Root)
   *
   * If this property is set to `Root`, program will try to register ou `Root/Root`. Organization Root is always registered with Control Tower.
   */
  readonly name: string;

  /**
   * Organization id
   */
  readonly organizationalUnitId?: string;
}

/**
 * AWS Organizations organizational unit (OU) registration handler parameter
 */
export interface IRegisterOrganizationalUnitHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @example
   * ```
   * {
   *   name: 'OU1/OU2',
   *   organizationalUnitId: 'ou-xxxxxxxx-xxxxxxxx',
   * }
   * ```
   */
  configuration: IRegisterOrganizationalUnitConfiguration;
}
/**
 * AWS Organizations organizational unit (OU) registration Module interface
 *
 */
export interface IRegisterOrganizationalUnitModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IRegisterOrganizationalUnitHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IRegisterOrganizationalUnitHandlerParameter): Promise<string>;
}

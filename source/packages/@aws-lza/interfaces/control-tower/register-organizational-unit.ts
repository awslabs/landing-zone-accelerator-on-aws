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
 *   ouArn: 'ou1Arn',
 * }
 * ```
 */
export interface IRegisterOrganizationalUnitConfiguration {
  /**
   * The ARN of the target OU which will be registered with AWS Control Tower
   */
  readonly ouArn: string;
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
   *   ouArn: 'ou1Arn',
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

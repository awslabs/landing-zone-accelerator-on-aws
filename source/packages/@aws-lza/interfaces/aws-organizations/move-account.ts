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
 * ```
 * {
 *   email: 'account@example.com',
 *   destinationOu: 'XXXXXXXXX',
 * }
 * ```
 */
export interface IMoveAccountConfiguration {
  /**
   * Email address that is associated with the account to be invited into AWS Organizations
   */
  readonly email: string;
  /**
   * Target root or organizational unit that you want to move the account to.
   *
   * @description
   * For nested OU as target, you need to provide complete path of the target OU.
   * Example:
   *  - Level1/Level2-02/Level3-01/Level4-01
   *  - Level1/Level2-02
   *  - Level1
   */
  readonly destinationOu: string;
}

/**
 * AWS Organizations organizational unit (OU) registration handler parameter
 */
export interface IMoveAccountHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @example
   * ```
   * {
   *   email: 'account@example.com',
   *   destinationOu: 'XXXXXXXXX',
   * }
   * ```
   */
  configuration: IMoveAccountConfiguration;
}

/**
 * AWS Account invite to AWS Organizations module interface
 */
export interface IMoveAccountModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IMoveAccountHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IMoveAccountHandlerParameter): Promise<string>;
}

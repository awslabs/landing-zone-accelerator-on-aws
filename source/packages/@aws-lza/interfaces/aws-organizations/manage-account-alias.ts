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
 * AWS Organizations account alias management configuration
 *
 * @description
 * This is the essential inputs for API operation by this module
 *
 * @example
 *
 * ```
 * {
 *   alias: 'my-account-alias',
 * }
 * ```
 */
export interface IManageAccountAliasConfiguration {
  /**
   * The account alias identifier
   *
   * @description
   * A unique identifier for the account alias configuration.
   * This is used to reference the alias in the configuration.
   *
   * @example
   * - 'my-org-production'
   * - 'dev-environment-01'
   * - 'security-audit-account'
   */
  readonly alias: string;
}

/**
 * AWS Organizations account alias management handler parameter
 */
export interface IManageAccountAliasHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS account alias management configuration
   *
   * @example
   * ```
   * {
   *   alias: 'my-account-alias',
   * }
   * ```
   */
  configuration: IManageAccountAliasConfiguration;
}

/**
 * AWS Organizations account alias management Module interface
 *
 */
export interface IManageAccountAliasModule {
  /**
   * Handler function to manage AWS account aliases
   *
   * @param props {@link IManageAccountAliasHandlerParameter}
   * @returns status string indicating the result(s) of the operation
   *
   */
  handler(props: IManageAccountAliasHandlerParameter): Promise<string>;
}

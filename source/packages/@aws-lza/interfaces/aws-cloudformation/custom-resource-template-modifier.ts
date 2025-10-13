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
import { ModuleHandlerReturnType } from '../../common/types';

/**
 * Update template configuration
 *
 * @example
 * ```
 * {
 *   directory: './',
 *   accountId: 'XXXXXXXXXXXX',
 *   region: 'us-east-1
 *   stackName: 'stack1',
 *   resourceNames: ['resource1', 'resource2'],
 * }
 * ```
 *
 */
export interface ICustomResourceTemplateModifierConfiguration {
  /**
   * Base directory where modified templates will be stored.
   */
  readonly directory: string;
  /**
   * Stack account id
   */
  readonly accountId: string;
  /**
   * Stack region
   */
  readonly region: string;
  /**
   * Stack name
   */
  readonly stackName: string;
  /**
   * Resources names
   */
  readonly resourceNames: string[];
}

/**
 * Update template module handler parameter
 */
export interface ICustomResourceTemplateModifierHandlerParameter extends IModuleCommonParameter {
  /**
   * Update template configuration
   *
   * @example
   * ```
   * {
   *   directory: './',
   *   accountId: 'XXXXXXXXXXXX',
   *   region: 'us-east-1
   *   stackName: 'stack1',
   *   resourceNames: ['resource1', 'resource2'],
   * }
   * ```
   */
  readonly configuration: ICustomResourceTemplateModifierConfiguration;
}

/**
 * CloudFormation update template module interface
 */
export interface ICustomResourceTemplateModifierModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link ICustomResourceTemplateModifierHandlerParameter}
   * @returns status string
   *
   */
  handler(props: ICustomResourceTemplateModifierHandlerParameter): Promise<ModuleHandlerReturnType>;
}

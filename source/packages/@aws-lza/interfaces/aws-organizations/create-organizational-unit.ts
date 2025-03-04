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

import { Tag } from '@aws-sdk/client-organizations';
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
 *   tags: [
 *     {
 *       Key: 'tag1',
 *       Value: 'value1',
 *     },
 *     {
 *       Key: 'tag2',
 *       Value: 'value2',
 *     },
 *   ],
 * }
 * ```
 */
export interface ICreateOrganizationalUnitConfiguration {
  /**
   * The friendly name to assign to the new OU.
   *
   * @description
   * For nested OU, you need to provide complete path of the target OU.
   * Example:
   *  - Level1/Level2-02/Level3-01/Level4-01
   *  - Level1/Level2-02
   *  - Level1 (Parent OU is Root)
   */
  readonly name: string;
  /**
   * The tags that you want to attach to the newly created OU. For each tag in the
   * list, you must specify both a tag key and a value.
   */
  readonly tags?: Tag[];
}

/**
 * AWS Organizations organizational unit (OU) registration handler parameter
 */
export interface ICreateOrganizationalUnitHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @example
   * ```
   * {
   *   name: 'OU1/OU2',
   *   tags: [
   *     {
   *       Key: 'tag1',
   *       Value: 'value1',
   *     },
   *     {
   *       Key: 'tag2',
   *       Value: 'value2',
   *     },
   *   ],
   * }
   * ```
   */
  configuration: ICreateOrganizationalUnitConfiguration;
}
/**
 * AWS Organizations organizational unit (OU) registration Module interface
 *
 */
export interface ICreateOrganizationalUnitModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link ICreateOrganizationalUnitHandlerParameter}
   * @returns status string
   *
   */
  handler(props: ICreateOrganizationalUnitHandlerParameter): Promise<string>;
}

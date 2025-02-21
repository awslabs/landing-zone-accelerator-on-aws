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
 *   email: 'account@example.com',
 *   accountId: 'XXXXXXXXX',
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
export interface IInviteAccountToOrganizationConfiguration {
  /**
   * Email address that is associated with the account to be invited into AWS Organizations
   */
  readonly email: string;
  /**
   * AWS Account Id to be invited into AWS Organizations
   */
  readonly accountId: string;
  /**
   * AWS Account Access Role Name
   *
   * @description
   * The name of the role that will be assumed to accept invitation from the account invited to AWS Organizations.
   * This rule must be present in the account invited to AWS Organizations and Management account must be able to assume the role.
   *
   */
  readonly accountAccessRoleName: string;
  /**
   * A list of tags that you want to attach to the account when it becomes a member of the organization. For each tag in the list, you must specify both a tag key and a value. You can set the value to an empty string, but you can't set it to `null`.
   */
  readonly tags?: Tag[];
}

/**
 * AWS Organizations organizational unit (OU) registration handler parameter
 */
export interface IInviteAccountToOrganizationHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Control Tower Landing Zone configuration
   *
   * @example
   * ```
   * {
   *   email: 'account@example.com',
   *   accountId: 'XXXXXXXXX',
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
  configuration: IInviteAccountToOrganizationConfiguration;
}

/**
 * AWS Account invite to AWS Organizations module interface
 */
export interface IInviteAccountToOrganizationModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IInviteAccountToOrganizationHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IInviteAccountToOrganizationHandlerParameter): Promise<string>;
}

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
import { PolicyType, Tag } from '@aws-sdk/client-organizations';
import { ModuleHandlerReturnType } from '../../common/types';

/**
 * Operation flags for policy management
 */
export enum OperationFlag {
  /**
   * Create or update a policy
   */
  UPSERT = 'upsert',
  /**
   * Delete a policy
   */
  DELETE = 'delete',
}

/**
 * AWS Organizations policy management configuration
 *
 * @description Configuration interface for managing AWS Organizations policies including creation, updates, and deletion
 *
 * @example
 * ```
 * const policyConfig: IManagePolicyConfiguration = {
 *   name: 'MyPolicy',
 *   type: PolicyType.SERVICE_CONTROL_POLICY,
 *   operationFlag: OperationFlag.UPSERT,
 *   content: JSON.stringify({ Version: '2012-10-17', Statement: [...] }),
 *   description: 'My custom SCP policy'
 * };
 * ```
 */
export interface IManagePolicyConfiguration {
  /**
   * Name of the policy to be managed
   */
  readonly name: string;
  /**
   * Type of the policy to be managed
   * */
  readonly type: PolicyType;
  /**
   * Operation to be performed on the policy (upsert or delete)
   */
  readonly operationFlag: OperationFlag;
  /**
   * Bucket name where policy content can be found
   */
  readonly bucketName?: string;
  /**
   * Object path to file that contains policy content
   */
  readonly objectPath?: string;
  /**
   * Content of the policy
   */
  readonly content?: string;
  /**
   * Description of the policy
   */
  readonly description?: string;
  /**
   * Tags to add to the policy
   */
  readonly tags?: Tag[];
}

/**
 * AWS Organizations policy management handler parameter
 */
export interface IManagePolicyHandlerParameter extends IModuleCommonParameter {
  /**
   * AWS Organizations policy management configuration
   *
   * @example
   * ```
   * {
   *   name: 'MyPolicy',
   *   type: PolicyType.SERVICE_CONTROL_POLICY,
   *   operationFlag: OperationFlag.UPSERT,
   *   content: JSON.stringify({ Version: '2012-10-17', Statement: [...] }),
   *   description: 'My custom SCP policy'
   * }
   * ```
   */
  readonly configuration: IManagePolicyConfiguration;
}

/**
 * AWS Organizations policy managemnt module interface
 */
export interface IManagePolicyModule {
  /**
   * Handler function to manage AWS Organizations policy
   * @param props {@link IManagePolicyHandlerParameter}
   * @returns Promise resolving to module handler return type indicating the result of the policy operation
   */
  handler(props: IManagePolicyHandlerParameter): Promise<ModuleHandlerReturnType>;
}

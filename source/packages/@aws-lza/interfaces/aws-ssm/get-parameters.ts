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
 * SSM parameter retrieval configuration
 *
 * @description
 * This interface defines the inputs required for SSM parameter retrieval
 *
 * @example
 * ```
 * {
 *   name: '/my/parameter/path',
 *   region: 'us-east-2'
 *   assumeRoleArn: 'arn:aws:iam::222222222222:role/CrossAccountRole'
 * }
 * ```
 */
export interface IGetSsmParametersValueConfiguration {
  /**
   * SSM parameter name to retrieve
   */
  readonly name: string;
  /**
   * IAM role ARN to assume for cross-account access
   */
  readonly assumeRoleArn?: string;
  /**
   * AWS region for cross-region parameter access
   */
  readonly region?: string;
}

/**
 * SSM parameter response details
 *
 * @description
 * Represents the response structure for retrieved SSM parameters
 *
 * @example
 * ```
 * // Successful parameter retrieval
 * {
 *   name: '/my/parameter/path',
 *   value: 'my-parameter-value',
 *   exists: true
 * }
 *
 * // Failed parameter retrieval
 * {
 *   name: '/not-found/parameter',
 *   value: '',
 *   exists: false
 * }
 * ```
 */
export interface ISsmParameterValue {
  /**
   * SSM parameter name
   */
  readonly name: string;
  /**
   * Parameter value retrieved from SSM
   */
  readonly value?: string;
  /**
   * Whether parameter exists or not
   */
  readonly exists: boolean;
}

/**
 * Get SSM Parameters configuration handler parameter
 */
export interface IGetSsmParametersValueHandlerParameter extends IModuleCommonParameter {
  /**
   * List of parameters to retrieve
   *
   * @example
   * ```
   * [
   *   {
   *     name: '/my/parameter/path'
   *   },
   *   {
   *     name: '/my/parameter/path2',
   *     region: 'us-east-2'
   *   },
   *   {
   *     name: '/cross/account/param',
   *     assumeRoleArn: 'arn:aws:iam::222222222222:role/CrossAccountRole'
   *   }
   * ]
   * ```
   */
  readonly configuration: IGetSsmParametersValueConfiguration[];
}

/**
 * AWS SSM get parameters module interface
 */
export interface IGetSsmParametersValueModule {
  /**
   * Handler function for Get SSM Parameter Values
   *
   * @param props {@link IGetSsmParametersHandlerParameter}
   * @returns {@link ISsmParameterValue}
   */
  handler(props: IGetSsmParametersValueHandlerParameter): Promise<ISsmParameterValue[]>;
}

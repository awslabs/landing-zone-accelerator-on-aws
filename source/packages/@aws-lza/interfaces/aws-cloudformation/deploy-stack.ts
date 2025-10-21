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
 * Deploy stack configuration
 *
 * @example
 * ```
 * {
 *   stackName: 'stack1',
 *   templatePath: './template.yaml',
 * }
 * ```
 */
export interface IDeployStackConfiguration {
  /**
   * Name of the stack to be deployed
   */
  stackName: string;
  /**
   * Path to the template file
   */
  templatePath: string;
  /**
   * S3 Bucket to upload template for deployment
   */
  s3BucketName: string;
}

/**
 * Deploy stack module handler parameter
 */
export interface IDeployStackHandlerParameter extends IModuleCommonParameter {
  /**
   * Deploy stack configuration
   *
   * @example
   * ```
   * {
   *   stackName: 'stack1',
   *   templatePath: './template.yaml',
   * }
   * ```
   */
  readonly configuration: IDeployStackConfiguration;
}

/**
 * CloudFormation deploy stack module interface
 */
export interface IDeployStackModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IDeployStackHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IDeployStackHandlerParameter): Promise<ModuleHandlerReturnType>;
}

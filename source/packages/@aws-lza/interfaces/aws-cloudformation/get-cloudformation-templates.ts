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

import { AcceleratorEnvironment } from '../../common/types';

/**
 * CloudFormation template retrieval
 *
 * @description
 * This module retrieves cloudformation templates from multi-account and multi-region environments.
 * It will store the retrieved templates and environment information to a local directory
 *
 * @example
 *
 * ```
 * {
 *   stackPrefix: 'AWSAccelerator-NetworkVpc',
 *   directory: './',
 *   roleNameToAssume: 'AWSControlTowerExecution',
 *   centralAccountId: '111111111111',
 *   environments: [
 *     {
 *       accountId: '222222222222',
 *       region: 'us-east-1'
 *     }
 *     ...
 *   ]
 * }
 * ```
 */
export interface IGetCloudFormationTemplatesConfiguration {
  /**
   * The prefix of the existing stack to retrieve for every environment.
   * The account id and account region will be appended to the stack prefix.
   * Only one of stackName or stackPrefix can be defined.
   */
  readonly stackPrefix?: string;
  /**
   * The name of the existing stack to retrieve for every environment.
   * Only one of stackName or stackPrefix can be defined.
   */
  readonly stackName?: string;
  /**
   * The absolute or relative path to the directory where the templates will be stored
   */
  readonly directory: string;
  /**
   * The name of the cross account role to assume
   */

  readonly roleNameToAssume: string;
  /**
   * The central accountId used for cross account actions
   */
  readonly centralAccountId: string;
  /**
   * The list of environments to retrieve templates from
   */
  readonly acceleratorEnvironments: AcceleratorEnvironment[];
  /**
   * The batch size used for api calls. Defaults to 50.
   */
  readonly batchSize?: number;
}

/**
 * AWS Organizations organizational unit (OU) registration handler parameter
 */
export interface IGetCloudFormationTemplatesHandlerParameter extends IModuleCommonParameter {
  /**
   * Get CloudFormation templates configuration
   *
   * @example
   *
   * ```
   * {
   *   stackPrefix: 'AWSAccelerator-NetworkVpc'
   *   directory: './',
   *   roleNameToAssume: 'AWSControlTowerExecution',
   *   centralAccountId: '111111111111',
   *   environments: [
   *     {
   *       accountId: '222222222222',
   *       region: 'us-east-1'
   *     }
   *     ...
   *   ]
   * }
   * ```
   */
  configuration: IGetCloudFormationTemplatesConfiguration;
}
/**
 * Get CloudFormation Templates Module interface
 *
 */
export interface IGetCloudFormationTemplatesModule {
  /**
   * Handler function to manage Accelerator Modules
   *
   * @param props {@link IGetCloudFormationTemplatesHandlerParameter}
   * @returns status string
   *
   */
  handler(props: IGetCloudFormationTemplatesHandlerParameter): Promise<string>;
}

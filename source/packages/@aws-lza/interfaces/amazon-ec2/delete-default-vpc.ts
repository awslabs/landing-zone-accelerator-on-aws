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
 * Configuration for deleting default VPC
 *
 * @description
 *
 * Configuration for deleting default VPC
 *
 * @example
 * ```
 * {
    region: 'us-west-1',
    partition: 'aws',
    configuration: {},
    operation: 'delete-default-vpc',
    dryRun: false, // Start with dry run for safety
    solutionId: 'test',
  };
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IDeleteDefaultVpcConfiguration {
  // Configuration properties can be added here as needed
}

/**
 * Parameter to handle deleting default VPC
 */
export interface IDeleteDefaultVpcParameter extends IModuleCommonParameter {
  /**
   * Parameter Configuration for deleting default VPC
   *
   * @example
   *
   * ```
   * {
    region: 'us-west-1',
    partition: 'aws',
    configuration: {},
    operation: 'delete-default-vpc',
    dryRun: false, // Start with dry run for safety
    solutionId: 'test',
  };
   * ```
   */
  configuration: IDeleteDefaultVpcConfiguration;
}

/**
 * Default VPC deletion interface
 */
export interface IDeleteDefaultVpcModule {
  /**
   * Handler function for deleting default VPC
   *
   * @param props {@link IDeleteDefaultVpcModule}
   * @returns status string
   *
   */
  handler(props: IDeleteDefaultVpcParameter): Promise<string>;
}

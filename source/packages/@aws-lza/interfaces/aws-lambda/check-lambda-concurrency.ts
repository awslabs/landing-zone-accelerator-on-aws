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
 * AWS Lambda Concurrency Check Configuration
 *
 * @description
 * Configuration parameters needed to check AWS Lambda concurrent execution limits
 * for a specific account and region.
 *
 * @example
 * ```
 * {
 *   accountId: "111111111111",
 *   region: "us-east-1",
 *   managementAccountAccessRole: "AWSControlTowerExecution",
 *   requiredConcurrency: 1000
 * }
 * ```
 */
export interface ICheckLambdaConcurrencyConfiguration {
  /**
   * Minimum required concurrent execution limit for Lambda functions
   */
  requiredConcurrency: number;
}

/**
 * AWS Lambda Concurrency Check Module Parameters
 *
 * @description
 * Input parameters for the Lambda concurrency check module, combining common
 * module parameters and specific configuration for Lambda concurrency check.
 */
export interface ICheckLambdaConcurrencyParameter extends IModuleCommonParameter {
  /**
   * Lambda concurrency check configuration
   */
  readonly configuration: ICheckLambdaConcurrencyConfiguration;
}

/**
 * AWS Lambda Prerequisites Check Module Interface
 *
 * @description
 * Interface defining the contract for Lambda prerequisites checking module
 */
export interface ICheckLambdaConcurrencyModule {
  /**
   * Handler function for Lambda concurrency check
   *
   * This method validates if the AWS account has sufficient Lambda concurrent
   * execution limit to meet the specified requirements.
   *
   * @param props {@link ICheckLambdaConcurrencyParameter}
   * @returns Promise resolving to boolean indicating if the account meets the required concurrency limit
   */
  handler(props: ICheckLambdaConcurrencyParameter): Promise<boolean>;
}

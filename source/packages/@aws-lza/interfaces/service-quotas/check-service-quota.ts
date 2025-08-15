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
 * AWS Service Quotas Check Configuration
 *
 * @description
 * Configuration parameters needed to check AWS service quotas
 * for a specific account, region, service and quota.
 *
 * @example
 * ```
 * {
 *   managementAccountAccessRole: "AWSControlTowerExecution",
 *   serviceCode: "codebuild",
 *   quotaCode: "L-2DC20C30",
 *   requiredServiceQuota: 5
 * }
 * ```
 */
export interface ICheckServiceQuotaConfiguration {
  /**
   * AWS service code for which to check the quota (e.g., 'codebuild', 'lambda', 'ec2')
   */
  serviceCode: string;

  /**
   * AWS quota code for the specific service quota to check (e.g., 'L-2DC20C30' for CodeBuild concurrent builds)
   */
  quotaCode: string;

  /**
   * Minimum required service quota value
   */
  requiredServiceQuota: number;
}

/**
 * AWS Service Quotas Check Module Parameters
 *
 * @description
 * Input parameters for the service quotas check module, combining common
 * module parameters and specific configuration for service quotas check.
 */
export interface ICheckServiceQuotaParameter extends IModuleCommonParameter {
  /**
   * Service quotas check configuration
   */
  readonly configuration: ICheckServiceQuotaConfiguration;
}

/**
 * AWS Service Quota Check Module Interface
 *
 * @description
 * Interface defining the contract for service quota checking module
 */
export interface ICheckServiceQuotaModule {
  /**
   * Handler function for service quotas check
   *
   * This method validates if the AWS account has sufficient quota for the specified
   * service to meet the specified requirements.
   *
   * @param props {@link ICheckServiceQuotaParameter}
   * @returns Promise resolving to boolean indicating if the account meets the required service quota
   */
  handler(props: ICheckServiceQuotaParameter): Promise<boolean>;
}

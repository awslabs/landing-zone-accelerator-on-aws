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
 * AWS Service Quotas Get Code Configuration
 *
 * @description
 * Configuration parameters needed to retrieve the quota code for a specific
 * AWS service quota by service code and quota name.
 *
 * @example
 * ```
 * {
 *   serviceCode: "codebuild",
 *   quotaName: "Concurrent builds"
 * }
 * ```
 */
export interface IGetServiceQuotaCodeConfiguration {
  /**
   * AWS service code for which to retrieve the quota code (e.g., 'codebuild', 'lambda', 'ec2')
   */
  serviceCode: string;

  /**
   * Human-readable name of the service quota (e.g., 'Concurrent builds', 'Lambda concurrent executions')
   */
  quotaName: string;
}

/**
 * AWS Service Quotas Get Code Module Parameters
 *
 * @description
 * Input parameters for the service quotas get code module, combining common
 * module parameters and specific configuration for quota code retrieval.
 */
export interface IGetServiceQuotaCodeParameter extends IModuleCommonParameter {
  /**
   * Service quotas get code configuration
   */
  readonly configuration: IGetServiceQuotaCodeConfiguration;
}

/**
 * AWS Service Quota Get Code Module Interface
 *
 * @description
 * Interface defining the contract for service quota code retrieval module
 */
export interface IGetServiceQuotaCodeModule {
  /**
   * Handler function for service quota code retrieval
   *
   * This method retrieves the quota code for a specified AWS service quota
   * using the service code and quota name.
   *
   * @param props {@link IGetServiceQuotaCodeParameter}
   * @returns Promise resolving to the quota code string, or undefined if not found
   */
  handler(props: IGetServiceQuotaCodeParameter): Promise<string | undefined>;
}

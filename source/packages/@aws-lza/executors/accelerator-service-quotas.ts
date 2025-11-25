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

import path from 'path';
import { createLogger } from '../common/logger';
import { ICheckServiceQuotaParameter } from '../interfaces/service-quotas/check-service-quota';
import { CheckServiceQuota } from '../lib/service-quotas/check-service-quota';
import { IGetServiceQuotaCodeParameter } from '../interfaces/service-quotas/get-service-quota-code';
import { GetServiceQuotaCode } from '../lib/service-quotas/get-service-quota-code';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 *
 * Function to check an AWS Service Limit
 *
 * @param input  { @link ICheckServiceQuotaParameter}
 * @returns boolean
 *
 * @description
 * This function is used to check if the account has sufficient limits
 * based on the inputed quota and requirement
 *
 * @example
 * ```
 * const input: IServiceQuotaCheckCodeBuildPreRequisitesParameter = {
 *   configuration: {
 *    managementAccountAccessRole: "AWSControlTowerExecution",
 *    serviceCode: "codebuild",
 *    quotaCode: "L-2DC20C30",
 *    requiredServiceQuota: 5
 *   },
 *   partition: 'aws',
 * };
 *
 * await checkServiceQuota(input);
 * ```
 */
export async function checkServiceQuota(input: ICheckServiceQuotaParameter): Promise<boolean> {
  try {
    return await new CheckServiceQuota().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

/**
 *
 * Function to retrieve an AWS Service Quota Code by quota name
 *
 * @param input  { @link IGetServiceQuotaCodeParameter}
 * @returns string | undefined
 *
 * @description
 * This function is used to find the quota code for a specific AWS service quota
 * by searching through all available quotas for a given service and matching
 * the quota name. Returns the quota code if found, otherwise undefined.
 *
 * @example
 * ```
 * const input: IGetServiceQuotaCodeParameter = {
 *   configuration: {
 *     serviceCode: "codebuild",
 *     quotaName: "Concurrently running builds for Linux/Medium environment"
 *   },
 *   partition: 'aws',
 *   region: 'us-east-1'
 * };
 *
 * const quotaCode = await getServiceQuotaCode(input);
 * // Returns: "L-2DC20C30" (or undefined if not found)
 * ```
 */
export async function getServiceQuotaCode(input: IGetServiceQuotaCodeParameter): Promise<string | undefined> {
  try {
    return await new GetServiceQuotaCode().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

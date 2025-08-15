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

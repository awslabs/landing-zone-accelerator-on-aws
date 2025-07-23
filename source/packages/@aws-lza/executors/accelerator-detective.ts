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
import { DetectiveManageOrganizationAdminModule } from '../lib/detective/manage-organization-admin';
import { IDetectiveManageOrganizationAdminParameter } from '../interfaces/detective/manage-organization-admin';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to manage Amazon Detective Admin account from AWS Organization management account
 * @param input {@link IDetectiveManageOrganizationAdminParameter}
 * @returns string
 *
 * @description
 * Use this function to manage the organization's detective administrator
 *
 * @example
 * ```
 * const param: IDetectiveManageOrganizationAdminParameter = {
    region: 'us-east-1',
    partition: 'aws',
    configuration: { enable: true, accountId: '123456789012' },
    operation: 'manage-organization-admin',
    dryRun: true,
    solutionId: 'test',
  };
 * ```
 */
export async function manageDetectiveOrganizationAdminAccount(
  input: IDetectiveManageOrganizationAdminParameter,
): Promise<string> {
  try {
    return await new DetectiveManageOrganizationAdminModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

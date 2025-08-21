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
import { SecurityHubManageOrganizationAdminModule } from '../lib/security-hub/manage-organization-admin';
import { ISecurityHubManageOrganizationAdminParameter } from '../interfaces/security-hub/manage-organization-admin';

process.on('uncaughtException', err => {
  throw err;
});

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to manage Security Hub organization admin
 * @param input {@link ISecurityHubManageOrganizationAdminParameter}
 * @returns string
 *
 * @description
 * Use this function to manage the organization's Security Hub admin
 *
 * @example
 * ```
 * const param: ISecurityHubManageOrganizationAdminParameter = {
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     enable: true,
 *     accountId: 'XXXXXXXXXXXX',
 *   },
 *   operation: 'manage-organization-admin',
 *   dryRun: true,
 *   solutionId: 'test',
 * };
 * ```
 */
export async function manageSecurityHubOrganizationAdminAccount(
  input: ISecurityHubManageOrganizationAdminParameter,
): Promise<string> {
  try {
    return await new SecurityHubManageOrganizationAdminModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

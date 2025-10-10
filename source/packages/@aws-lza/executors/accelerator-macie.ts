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

import { MacieManageOrganizationAdminModule } from '../lib/macie/manage-organization-admin';
import { IMacieManageOrganizationAdminParameter } from '../interfaces/macie/manage-organization-admin';
import { createLogger } from '../common/logger';
import path from 'path';

process.on('uncaughtException', err => {
  throw err;
});

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to manage Macie organization admin
 * @param input {@link IMacieManageOrganizationAdminParameter}
 *
 *
 * @description
 * Use this function to set or reset the Macie organization admin
 *
 * If macie is not yet enabled, this will enable it for the current account
 *
 * @example
 *
 * ```
 * const param: IMacieManageOrganizationAdminParameter = {
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     enable: false,
 *     account: "111111111111"
 *   }
 * }
 *
 * const status = await manageOrganizationAdmin(param);
 *
 * ```
 *
 * @returns status string
 */
export async function manageOrganizationAdmin(input: IMacieManageOrganizationAdminParameter): Promise<string> {
  try {
    return await new MacieManageOrganizationAdminModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

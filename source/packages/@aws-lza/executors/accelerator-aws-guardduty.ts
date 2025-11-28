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
import { IGuardDutyManageOrganizationAdminParameter } from '../interfaces/aws-guardduty/manage-organization-admin';
import { GuardDutyManageOrganizationAdminModule } from '../lib/guardduty/manage-organization-admin';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to manage Amazon GuardDuty Admin account from AWS Organization management account
 * @param input {@link IGuardDutyManageOrganizationAdminParameter}
 * @returns string
 *
 * @description
 * Use this function to manage Amazon GuardDuty Admin account from AWS Organization management account
 *
 * @example
 * ```
 * const param: IGuardDutyManageOrganizationAdminParameter = {
    region: 'us-east-1',
    partition: 'aws',
    configuration: { enable: true, accountId: '123456789012' },
    operation: 'manage-organization-admin',
    dryRun: true,
    solutionId: 'test',
  };
 * ```
 */
export async function manageGuardDutyAdminAccount(input: IGuardDutyManageOrganizationAdminParameter): Promise<string> {
  try {
    return await new GuardDutyManageOrganizationAdminModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

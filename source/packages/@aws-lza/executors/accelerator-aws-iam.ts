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
import { IRootUserManagementHandlerParameter } from '../interfaces/aws-iam/root-user-management';
import { RootUserManagementModule } from '../lib/aws-iam/root-user-management';

import { createLogger } from '../common/logger';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to Configure IAM Root User Management
 * @param input {@link IRootUserManagementHandlerParameter}
 * @returns string
 *
 * @example
 * ```
 * const input: IRootUserManagementHandlerParameter = {
 *   operation: 'configure-root-user-managment',
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     enabled: true,
 *     credentials: true,
 *     session: true
 * };
 *
 * const status = await configureRootUserManagment(input);
 * ```
 */
export async function configureRootUserManagment(input: IRootUserManagementHandlerParameter): Promise<string> {
  try {
    return await new RootUserManagementModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

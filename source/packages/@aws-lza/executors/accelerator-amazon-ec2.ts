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
import { IManageEbsDefaultEncryptionHandlerParameter } from '../interfaces/amazon-ec2/manage-ebs-default-encryption';
import { ManageEbsDefaultEncryptionModule } from '../lib/amazon-ec2/manage-ebs-default-encryption';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to manage Amazon EBS default encryption
 * @param input {@link IManageEbsDefaultEncryptionHandlerParameter}
 * @returns string
 *
 * @description
 * Use this function to manage Amazon EBS default encryption.
 *
 * @example
 * ```
 * const input: IEbsDefaultEncryptionHandlerParameter = {
 *   operation: 'manage-ebs-default-encryption',
 *   configuration: {
 *     enableDefaultEncryption: true,
 *     kmsKeyId: 'XXXXXXXXXXXXXX',
 *   },
 *   partition: 'aws',
 *   region: 'us-east-1',
 * };
 *
 * const status = await manageEbsDefaultEncryption(input);
 * ```
 */
export async function manageEbsDefaultEncryption(input: IManageEbsDefaultEncryptionHandlerParameter): Promise<string> {
  try {
    return await new ManageEbsDefaultEncryptionModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

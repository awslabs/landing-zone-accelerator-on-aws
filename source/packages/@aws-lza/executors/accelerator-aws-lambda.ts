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
import { ICheckLambdaConcurrencyParameter } from '../interfaces/aws-lambda/check-lambda-concurrency';
import { CheckLambdaConcurrencyModule } from '../lib/aws-lambda/check-lambda-concurrency';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 *
 * Function to check the lambda concurrency limits for a given account and region
 *
 * @param input  { @link ICheckLambdaConcurrencyParameter}
 * @returns boolean
 *
 * @description
 * This function is used to check if the account has sufficient Lambda concurrent
 * execution limit to meet the specified requirements.
 *
 * @example
 * ```
 * const input: ICheckLambdaConcurrencyParameter = {
 *   configuration: {
 *     requiredConcurrency: 1000,
 *   },
 *   partition: 'aws',
 *   currentAccountId: 'XXXXXXXXXXXX',
 * };
 *
 * await checkLambdaConcurrency(input);
 * ```
 */
export async function checkLambdaConcurrency(input: ICheckLambdaConcurrencyParameter): Promise<boolean> {
  try {
    return await new CheckLambdaConcurrencyModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

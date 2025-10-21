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

import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { throttlingBackOff } from './throttle';
import { MODULE_EXCEPTIONS } from './enums';
import { createLogger } from './logger';
import path from 'path';

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to check if stack exists
 * @param client {@link CloudFormationClient}
 * @param stackName string
 * @returns
 */
export async function isStackExists(client: CloudFormationClient, stackName: string): Promise<boolean> {
  logger.info(`Checking if stack ${stackName} exists.`);
  try {
    const response = await throttlingBackOff(() =>
      client.send(
        new DescribeStacksCommand({
          StackName: stackName,
        }),
      ),
    );

    if (!response.Stacks) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api did not return Stacks object for ${stackName} stack.`,
      );
    }
    const stackCount = response.Stacks.length;
    if (stackCount > 1) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api returned more than 1 stack for ${stackName} stack.`,
      );
    }

    if (stackCount === 0) {
      logger.info(`Stack ${stackName} does not exist.`);
      return false;
    }

    logger.info(`Stack ${stackName} exists.`);
    return true;
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.name === 'ValidationError' && e.message.includes('does not exist')) {
        logger.info(`Stack ${stackName} does not exist.`);
        return false;
      }
    }
    throw e;
  }
}

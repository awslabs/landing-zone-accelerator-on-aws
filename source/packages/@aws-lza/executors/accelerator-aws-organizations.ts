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
import { OrganizationalUnit } from '@aws-sdk/client-organizations';
import { ICreateOrganizationalUnitHandlerParameter } from '../interfaces/aws-organizations/create-organizational-unit';
import { CreateOrganizationalUnitModule } from '../lib/aws-organizations/create-organizational-unit';
import { createLogger } from '../common/logger';
import { IMoveAccountHandlerParameter } from '../interfaces/aws-organizations/move-account';
import { MoveAccountModule } from '../lib/aws-organizations/move-account';
import { IInviteAccountToOrganizationHandlerParameter } from '../interfaces/aws-organizations/invite-account-to-organization';
import { InviteAccountToOrganizationModule } from '../lib/aws-organizations/invite-account-to-organization';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to create AWS Organizations Organizational Unit (OU)
 * @param input {@link ICreateOrganizationalUnitHandlerParameter}
 * @returns string
 *
 * @description
 * Use this function to create AWS Organizations Organizational Unit (OU).
 * This function is used by the Accelerator to create the AWS Control Tower OU.
 *
 * @example
 * ```
 * const input: ICreateOrganizationalUnitHandlerParameter = {
 *   configuration: {
 *     name: 'OU1/OU2',
 *     tags : [
 *       {
 *         Key: 'tag1',
 *         Value: 'value1',
 *       },
 *       {
 *         Key: 'tag2',
 *         Value: 'value2',
 *       },
 *     ],
 *   },
 *   partition: 'aws,
 *   region: 'us-east-1',
 * };
 *
 * const response = await createOrganizationalUnit(input);
 * ```
 */
export async function createOrganizationalUnit(input: ICreateOrganizationalUnitHandlerParameter): Promise<string> {
  try {
    return await new CreateOrganizationalUnitModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

/**
 * Function to create AWS Organizations Organizational Unit (OU) and return the created OU
 * @param input {@link ICreateOrganizationalUnitHandlerParameter}
 * @returns OrganizationalUnit | undefined
 *
 * @description
 * Use this function to create AWS Organizations Organizational Unit (OU) and return the created OU.
 *
 * @example
 * ```
 * const input: ICreateOrganizationalUnitHandlerParameter = {
 *   configuration: {
 *    name: 'OU1/OU2',
 *    tags: [
 *      {
 *        Key: 'tag1',
 *        Value: 'value1',
 *      },
 *      {
 *        Key: 'tag2',
 *        Value: 'value2',
 *      },
 *    ],
 *   },
 *   partition: 'aws,
 *   region: 'us-east-1',
 * };
 *
 * const response: OrganizationalUnit = await createAndRetrieveOrganizationalUnit(input);
 * ```
 */
export async function createAndRetrieveOrganizationalUnit(
  input: ICreateOrganizationalUnitHandlerParameter,
): Promise<OrganizationalUnit | undefined> {
  try {
    const createOrganizationalUnitModule = new CreateOrganizationalUnitModule();
    await createOrganizationalUnitModule.handler(input);
    return createOrganizationalUnitModule.createdOrganizationalUnit;
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

/**
 * Function to invite account to AWS Organizations
 * @param input {@link IInviteAccountToOrganizationHandlerParameter}
 * @returns string
 *
 * @example
 * ```
 * const input: IInviteAccountToOrganizationHandlerParameter = {
 *   operation: 'invite-account-to-organization',
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     email: 'account@example.com',
 *     accountId: 'XXXXXXXXX',
 *     tags: [
 *       {
 *         Key: 'tag1',
 *         Value: 'value1',
 *       },
 *       {
 *         Key: 'tag2',
 *         Value: 'value2',
 *       },
 *     ],
 * };
 *
 * const status = await inviteAccountToOrganization(input);
 * ```
 */
export async function inviteAccountToOrganization(
  input: IInviteAccountToOrganizationHandlerParameter,
): Promise<string> {
  try {
    return await new InviteAccountToOrganizationModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

/*
 * Function to move account to target OU
 * @param input {@link IMoveAccountHandlerParameter}
 * @returns string
 *
 * @example
 * ```
 * const input: IMoveAccountHandlerParameter = {
 *   operation: 'move-account',
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     email: 'account@example.com',
 *     destinationOu: 'OU1/OU2/OU3',
 *   },
 * };
 *
 * const status = await moveAccount(input);
 * ```
 */
export async function moveAccount(input: IMoveAccountHandlerParameter): Promise<string> {
  try {
    return await new MoveAccountModule().handler(input);
  } catch (e: unknown) {
    logger.error(e);
    throw e;
  }
}

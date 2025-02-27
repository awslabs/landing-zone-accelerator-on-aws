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

import { ISetupLandingZoneHandlerParameter } from '../interfaces/control-tower/setup-landing-zone';
import { SetupLandingZoneModule } from '../lib/control-tower/setup-landing-zone/index';

import { IRegisterOrganizationalUnitHandlerParameter } from '../interfaces/control-tower/register-organizational-unit';
import { RegisterOrganizationalUnitModule } from '../lib/control-tower/register-organizational-unit';

process.on('uncaughtException', err => {
  throw err;
});

/**
 * Function to setup Accelerator AWS Control Tower landing zone
 * @param input {@link ISetupLandingZoneHandlerParameter}
 *
 *
 * @pre-requisites
 * In order to deploy an AWS Control Tower landing zone, the following prerequisites must be fulfilled.
 *
 * - AWS Organizations with all feature enabled
 * - No AWS services enabled for AWS Organizations
 * - No organization units in AWS Organizations
 * - No additional accounts in AWS Organizations
 * - No AWS IAM Identity Center configured
 * - None of the AWS Control Tower service roles are preset
 *
 * @description
 * Use this function to create, update or reset AWS Control Tower landing zone.
 *
 * This function will perform the following pre-requisites before deploying AWS Control Tower Landing Zone
 * - Deploy AWS Control Tower service roles
 * - Deploy AWS KMS CMK for AWS Control Tower resources
 * - Create shared accounts (LogArchive and Audit)
 *
 * If there is an existing AWS Control Tower landing zone, this function can initiate an update or reset of the landing zone, in cases where the configuration has changed or the landing zone has drifted from the expected state.
 *
 * @example
 *
 * ```
 * const param: IControlTowerLandingZoneHandlerParameter = {
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     enable: true,
 *     version: '3.3',
 *     enabledRegions: ['us-east-1', 'us-west-2'],
 *     logging: { organizationTrail: true, retention: { loggingBucket: 3650, accessLoggingBucket: 365 } },
 *     security: { enableIdentityCenterAccess: true },
 *     sharedAccounts: {
 *       management: { name: 'Management', email: '<management-account>@example.com' },
 *       logging: { name: 'LogArchive', email: ' <log-archive>@example.com'},
 *       audit: { name: 'Audit', email: '<audit>@example.com' },
 *     }
 *   }
 * }
 *
 * const status = await setupControlTowerLandingZone(param);
 *
 * ```
 *
 * @returns status string
 */
export async function setupControlTowerLandingZone(input: ISetupLandingZoneHandlerParameter): Promise<string> {
  try {
    return await new SetupLandingZoneModule().handler(input);
  } catch (e: unknown) {
    console.error(e);
    throw e;
  }
}

/**
 * Function to register organizational unit with AWS Control Tower
 * @param input {@link IRegisterOrganizationalUnitHandlerParameter}
 *
 * @description
 * Use this function to register AWS Organizations organizational unit (OU) with AWS Control Tower.
 *
 * @example
 *
 * ```
 * const param: IRegisterOrganizationalUnitHandlerParameter = {
 *   partition: 'aws',
 *   region: 'us-east-1',
 *   configuration: {
 *     name: 'OU1/OU2',
 *     organizationalUnitId: 'ou-xxxxxxxx-xxxxxxxx',
 *   }
 * }
 *
 * const status = await registerOrganizationalUnit(param);
 *
 * ```
 *
 * @returns status string
 */ export async function registerOrganizationalUnit(
  input: IRegisterOrganizationalUnitHandlerParameter,
): Promise<string> {
  try {
    return await new RegisterOrganizationalUnitModule().handler(input);
  } catch (e: unknown) {
    console.error(e);
    throw e;
  }
}

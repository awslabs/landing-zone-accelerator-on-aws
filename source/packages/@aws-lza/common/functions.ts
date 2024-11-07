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

import {
  OrganizationalUnit,
  OrganizationsClient,
  paginateListOrganizationalUnitsForParent,
} from '@aws-sdk/client-organizations';
import { ControlTowerClient, GetLandingZoneCommand, ListLandingZonesCommand } from '@aws-sdk/client-controltower';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';

import path from 'path';

import { IAssumeRoleCredential, ControlTowerLandingZoneDetailsType } from './resources';
import { createLogger } from './logger';
import { throttlingBackOff } from './throttle';

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

export function setRetryStrategy() {
  const numberOfRetries = Number(process.env['ACCELERATOR_SDK_MAX_ATTEMPTS'] ?? 800);
  return new ConfiguredRetryStrategy(numberOfRetries, (attempt: number) => 100 + attempt * 1000);
}

/**
 * Function to get list of organization for given parent
 * @param client {@link OrganizationsClient}
 * @param parentId string
 * @returns organizationalUnits {@link OrganizationalUnit}[]
 */
export async function getOrganizationalUnitsForParent(
  client: OrganizationsClient,
  parentId: string,
): Promise<OrganizationalUnit[]> {
  const organizationalUnits: OrganizationalUnit[] = [];

  const paginator = paginateListOrganizationalUnitsForParent({ client }, { ParentId: parentId });
  for await (const page of paginator) {
    for (const organizationalUnit of page.OrganizationalUnits ?? []) {
      organizationalUnits.push(organizationalUnit);
    }
  }
  return organizationalUnits;
}

/**
 * Function to get the landing zone identifier.
 *
 * @remarks
 * Function returns undefined when there is no landing zone configured, otherwise returns arn for the landing zone.
 * If there are multiple landing zone deployment found, function will return error.
 * @returns landingZoneIdentifier string | undefined
 *
 * @param client {@link ControlTowerClient}
 * @returns landingZoneIdentifier string | undefined
 */
export async function getLandingZoneIdentifier(client: ControlTowerClient): Promise<string | undefined> {
  const response = await throttlingBackOff(() => client.send(new ListLandingZonesCommand({})));

  if (response.landingZones!.length! > 1) {
    throw new Error(
      `Multiple AWS Control Tower Landing Zone configuration found, list of Landing Zone arns are - ${response.landingZones?.join(
        ',',
      )}`,
    );
  }

  if (response.landingZones?.length === 1 && response.landingZones[0].arn) {
    return response.landingZones[0].arn;
  }

  return undefined;
}

/**
 * Function to get the landing zone details
 * @param client {@link ControlTowerClient}
 * @param region string
 * @param landingZoneIdentifier string| undefined
 * @returns landingZoneDetails {@link ControlTowerLandingZoneDetailsType} | undefined
 */
export async function getLandingZoneDetails(
  client: ControlTowerClient,
  region: string,
  landingZoneIdentifier?: string,
): Promise<ControlTowerLandingZoneDetailsType | undefined> {
  if (!landingZoneIdentifier) {
    return undefined;
  }

  const landingZoneDetails: ControlTowerLandingZoneDetailsType = { landingZoneIdentifier: landingZoneIdentifier };

  try {
    const response = await throttlingBackOff(() =>
      client.send(new GetLandingZoneCommand({ landingZoneIdentifier: landingZoneIdentifier })),
    );

    if (response.landingZone) {
      for (const [key, value] of Object.entries(response.landingZone.manifest!)) {
        switch (key) {
          case 'governedRegions':
            landingZoneDetails.governedRegions = value;
            break;
          case 'accessManagement':
            landingZoneDetails.enableIdentityCenterAccess = value['enabled'];
            break;
          case 'organizationStructure':
            landingZoneDetails.securityOuName = value['security']['name'];
            if (value['sandbox']) {
              landingZoneDetails.sandboxOuName = value['sandbox']['name'];
            }
            break;
          case 'centralizedLogging':
            landingZoneDetails.loggingBucketRetentionDays = value['configurations']['loggingBucket']['retentionDays'];
            landingZoneDetails.accessLoggingBucketRetentionDays =
              value['configurations']['accessLoggingBucket']['retentionDays'];
            landingZoneDetails.kmsKeyArn = value['configurations']['kmsKeyArn'];
            break;
        }
      }
      landingZoneDetails.landingZoneIdentifier = response.landingZone.arn!;
      landingZoneDetails.status = response.landingZone.status!;
      landingZoneDetails.version = response.landingZone.version!;
      landingZoneDetails.latestAvailableVersion = response.landingZone.latestAvailableVersion!;
      landingZoneDetails.driftStatus = response.landingZone.driftStatus!.status!;
    }
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (e.name === 'ResourceNotFoundException' && landingZoneIdentifier) {
      throw new Error(
        `Existing AWS Control Tower Landing Zone home region differs from the executing environment region ${region}. Existing Landing Zone identifier is ${landingZoneIdentifier}`,
      );
    }
    throw e;
  }

  return landingZoneDetails;
}

/**
 * Function to sleep process
 * @param ms
 * @returns
 */
export function delay(minutes: number) {
  return new Promise(resolve => setTimeout(resolve, minutes * 60000));
}

/**
 * Function to get cross account assume role credential
 * @param options
 * @returns credentials {@link Credentials}
 */
export async function getCredentials(options: {
  accountId: string;
  region: string;
  solutionId: string;
  partition?: string;
  assumeRoleName?: string;
  assumeRoleArn?: string;
  sessionName?: string;
  credentials?: IAssumeRoleCredential;
}): Promise<IAssumeRoleCredential | undefined> {
  if (options.assumeRoleName && options.assumeRoleArn) {
    throw new Error(`Either assumeRoleName or assumeRoleArn can be provided not both`);
  }

  if (!options.assumeRoleName && !options.assumeRoleArn) {
    throw new Error(`Either assumeRoleName or assumeRoleArn must provided`);
  }

  if (options.assumeRoleName && !options.partition) {
    throw new Error(`When assumeRoleName provided partition must be provided`);
  }

  const roleArn =
    options.assumeRoleArn ?? `arn:${options.partition}:iam::${options.accountId}:role/${options.assumeRoleName}`;

  const client: STSClient = new STSClient({
    region: options.region,
    customUserAgent: options.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: options.credentials,
  });

  const currentSessionResponse = await throttlingBackOff(() => client.send(new GetCallerIdentityCommand({})));

  if (currentSessionResponse.Arn === roleArn) {
    logger.info(`Already in target environment assume role credential not required`);
    return undefined;
  }

  const response = await throttlingBackOff(() =>
    client.send(
      new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: options.sessionName ?? 'AcceleratorAssumeRole' }),
    ),
  );

  //
  // Validate response
  if (!response.Credentials?.AccessKeyId) {
    throw new Error(`Access key ID not returned from AssumeRole command`);
  }
  if (!response.Credentials.SecretAccessKey) {
    throw new Error(`Secret access key not returned from AssumeRole command`);
  }
  if (!response.Credentials.SessionToken) {
    throw new Error(`Session token not returned from AssumeRole command`);
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId,
    secretAccessKey: response.Credentials.SecretAccessKey,
    sessionToken: response.Credentials.SessionToken,
    expiration: response.Credentials.Expiration,
  };
}

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
  AccountStatus,
  DescribeAccountCommand,
  ListOrganizationalUnitsForParentCommand,
  ListRootsCommand,
  OrganizationalUnit,
  OrganizationsClient,
  Root,
  paginateListOrganizationalUnitsForParent,
} from '@aws-sdk/client-organizations';
import { ControlTowerClient, GetLandingZoneCommand, ListLandingZonesCommand } from '@aws-sdk/client-controltower';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';

import * as winston from 'winston';
import path from 'path';

import { OrganizationConfig } from '@aws-accelerator/config';

import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import {
  AssumeRoleCredentialType,
  ControlTowerLandingZoneDetailsType,
  OrganizationalUnitDetailsType,
  OrganizationalUnitKeysType,
} from './resources';

/**
 * Logger
 */
const logger: winston.Logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to check if account is suspended.
 * @param client {@link OrganizationsClient}
 * @param accountId string
 * @returns boolean
 */
export async function isAccountSuspended(client: OrganizationsClient, accountId: string): Promise<boolean> {
  const response = await throttlingBackOff(() => client.send(new DescribeAccountCommand({ AccountId: accountId })));
  if (!response.Account) {
    throw new Error(`DescribeAccount API did not return Account object.`);
  }
  return response.Account.Status === AccountStatus.SUSPENDED;
}

/**
 * Function to get AWS Organizations Root details
 *
 * @param client {@link OrganizationsClient}
 * @returns organizationRoot {@link Root}
 */
export async function getOrganizationsRoot(client: OrganizationsClient): Promise<Root> {
  const response = await throttlingBackOff(() => client.send(new ListRootsCommand({})));
  if (!response.Roots) {
    throw new Error(`AWS Organizations root undefined !!!`);
  }
  if (response.Roots.length === 0) {
    throw new Error(`AWS Organizations root not found !!!`);
  }

  if (response.Roots.length > 1) {
    throw new Error(`Multiple AWS Organizations root found !!!`);
  }

  if (!response.Roots[0].Arn) {
    throw new Error(`AWS Organizations root arn undefined !!!`);
  }

  if (!response.Roots[0].Id) {
    throw new Error(`AWS Organizations root id undefined !!!`);
  }

  if (!response.Roots[0].Name) {
    throw new Error(`AWS Organizations root name undefined !!!`);
  }

  return response.Roots[0];
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
 * Type to define OU relation
 */
export type OuRelationType = {
  level: number;
  name: string;
  parentName?: string;
  completePath: string;
  isIgnored: boolean;
};

/**
 * Function to get Ou relation from config
 * @param organizationConfig {@link OrganizationConfig}
 * @returns ouRelations {@link OuRelationType}[]
 */
export function getOuRelationsFromConfig(organizationConfig: OrganizationConfig): OuRelationType[] {
  const ouRelations: OuRelationType[] = [];
  for (const organizationalUnit of organizationConfig.organizationalUnits) {
    const isIgnored = organizationalUnit.ignore ?? false;

    const isParentChildPath = organizationalUnit.name.split('/');
    const pathLength = isParentChildPath.length;

    if (pathLength === 1) {
      ouRelations.push({
        level: pathLength,
        name: isParentChildPath[0],
        completePath: isParentChildPath[0],
        isIgnored,
      });
    } else {
      ouRelations.push({
        level: pathLength,
        name: isParentChildPath[pathLength - 1],
        //parentName: isParentChildPath[pathLength - 1],
        parentName: organizationalUnit.name.substr(0, organizationalUnit.name.lastIndexOf('/')),
        completePath: organizationalUnit.name,
        isIgnored,
      });
    }
  }

  // sort by level
  return ouRelations.sort((item1, item2) => item1.level - item2.level);
}

/**
 * Function to sleep process
 * @param minutes
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
  credentials?: AssumeRoleCredentialType;
}): Promise<AssumeRoleCredentialType | undefined> {
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

/**
 * Function to get management account credential.
 *
 * @remarks
 * When solution deployed from external account management account credential will be provided
 * @param partition string
 * @param region string
 * @param solutionId string
 * @returns credential {@AssumeRoleCredentialType} | undefined
 */
export async function getManagementAccountCredentials(
  partition: string,
  region: string,
  solutionId: string,
): Promise<AssumeRoleCredentialType | undefined> {
  if (process.env['MANAGEMENT_ACCOUNT_ID'] && process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']) {
    logger.info('set management account credentials');
    logger.info(`managementAccountId => ${process.env['MANAGEMENT_ACCOUNT_ID']}`);
    logger.info(`management account role name => ${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`);

    const assumeRoleArn = `arn:${partition}:iam::${process.env['MANAGEMENT_ACCOUNT_ID']}:role/${process.env['MANAGEMENT_ACCOUNT_ROLE_NAME']}`;

    return getCredentials({
      accountId: process.env['MANAGEMENT_ACCOUNT_ID'],
      region,
      solutionId,
      assumeRoleArn,
      sessionName: 'ManagementAccountCredentials',
    });
  }

  return undefined;
}

export function getOrganizationalUnit(
  organizationalUnitName: string,
  organizationalUnits: OrganizationalUnitDetailsType[],
): OrganizationalUnitDetailsType {
  const organizationalUnit = organizationalUnits.find(
    organizationalUnit => organizationalUnit.name === organizationalUnitName,
  );

  if (!organizationalUnit) {
    throw new Error(`Organizational Unit ${organizationalUnitName} not found`);
  }

  return organizationalUnit;
}

export async function getOrganizationalUnitKeys(
  organizationsClient: OrganizationsClient,
): Promise<OrganizationalUnitKeysType> {
  const awsOuKeys: OrganizationalUnitKeysType = [];
  await getAwsOrganizationalUnitKeys(organizationsClient, awsOuKeys, await getRootId(organizationsClient), '');
  return awsOuKeys;
}

async function getAwsOrganizationalUnitKeys(
  organizationsClient: OrganizationsClient,
  awsOuKeys: OrganizationalUnitKeysType,
  ouId: string,
  path: string,
) {
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.send(new ListOrganizationalUnitsForParentCommand({ ParentId: ouId, NextToken: nextToken })),
    );
    let parentPath = path.substr(0, path.lastIndexOf('/'));
    for (const ou of page.OrganizationalUnits ?? []) {
      if (path.length === 0) parentPath = 'Root';
      awsOuKeys.push({
        acceleratorKey: `${path}${ou.Name!}`,
        awsKey: ou.Id!,
        parentId: ouId,
        level: path.split('/').length,
        arn: ou.Arn!,
        parentPath: parentPath,
      });
      await getAwsOrganizationalUnitKeys(organizationsClient, awsOuKeys, ou.Id!, `${path}${ou.Name!}/`);
    }
    nextToken = page.NextToken;
  } while (nextToken);
}

async function getRootId(organizationsClient: OrganizationsClient): Promise<string> {
  // get root ou id
  let rootId = '';
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.send(new ListRootsCommand({ NextToken: nextToken })),
    );
    for (const item of page.Roots ?? []) {
      if (item.Name === 'Root' && item.Id && item.Arn) {
        rootId = item.Id;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return rootId;
}

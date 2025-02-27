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
  Account,
  DescribeOrganizationCommand,
  InvalidInputException,
  ListRootsCommand,
  OrganizationalUnit,
  OrganizationsClient,
  paginateListAccounts,
  paginateListOrganizationalUnitsForParent,
} from '@aws-sdk/client-organizations';
import {
  ControlTowerClient,
  GetLandingZoneCommand,
  ListLandingZonesCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-controltower';
import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';
import { MODULE_EXCEPTIONS } from '../common/enums';
import path from 'path';

import {
  IAssumeRoleCredential,
  ControlTowerLandingZoneDetailsType,
  IModuleDefaultParameter,
  IModuleCommonParameter,
} from './resources';
import { createLogger } from './logger';
import { throttlingBackOff } from './throttle';

/**
 * Logger
 */
const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to generate dry run response
 * @param moduleName string
 * @param operation string
 * @param message string
 * @returns string
 */
export function generateDryRunResponse(moduleName: string, operation: string, message: string): string {
  const statusPrefix = `[DRY-RUN]: ${moduleName} ${operation} (no actual changes were made)\nValidation: ✓ Successful\nStatus: `;
  return `${statusPrefix}${message}`;
}

/**
 * Function to get default parameters for module
 * @param moduleName string
 * @param props {@link IModuleCommonParameter}
 * @returns props  {@link IModuleDefaultParameter}
 */
export function getModuleDefaultParameters(moduleName: string, props: IModuleCommonParameter): IModuleDefaultParameter {
  const defaultParameters: IModuleDefaultParameter = {
    moduleName: props.moduleName ?? moduleName,
    globalRegion: props.globalRegion ?? props.region,
    useExistingRole: props.useExistingRole ?? false,
    dryRun: props.dryRun ?? false,
  };
  return defaultParameters;
}

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

  try {
    const paginator = paginateListOrganizationalUnitsForParent({ client }, { ParentId: parentId });
    for await (const page of paginator) {
      for (const organizationalUnit of page.OrganizationalUnits ?? []) {
        organizationalUnits.push(organizationalUnit);
      }
    }
    return organizationalUnits;
  } catch (e: unknown) {
    if (e instanceof InvalidInputException) {
      logger.warn(`${e.name}: Invalid parent id: ${parentId} - ${e.message}`);
      throw new Error(`${e.name}: Invalid parent id: ${parentId}`);
    }
    throw e;
  }
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

  if (!response.landingZones) {
    throw new Error(`Internal error: ListLandingZonesCommand did not return landingZones object`);
  }

  if (response.landingZones.length > 1) {
    logger.warn(
      `Internal error: ListLandingZonesCommand returned multiple landing zones, list of Landing Zone arns are - ${response.landingZones.join(
        ',',
      )}`,
    );
    throw new Error(`Internal error: ListLandingZonesCommand returned multiple landing zones`);
  }

  if (response.landingZones.length === 1 && response.landingZones[0].arn) {
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
    if (e instanceof ResourceNotFoundException && landingZoneIdentifier) {
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
export async function delay(minutes: number) {
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
  solutionId?: string;
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
  if (!response.Credentials) {
    throw new Error(`Internal error: AssumeRoleCommand did not return Credentials`);
  }

  if (!response.Credentials.AccessKeyId) {
    throw new Error(`Internal error: AssumeRoleCommand did not return AccessKeyId`);
  }
  if (!response.Credentials.SecretAccessKey) {
    throw new Error(`Internal error: AssumeRoleCommand did not return SecretAccessKey`);
  }
  if (!response.Credentials.SessionToken) {
    throw new Error(`Internal error: AssumeRoleCommand did not return SessionToken`);
  }

  return {
    accessKeyId: response.Credentials.AccessKeyId,
    secretAccessKey: response.Credentials.SecretAccessKey,
    sessionToken: response.Credentials.SessionToken,
    expiration: response.Credentials.Expiration,
  };
}

/**
 * Function to get root id
 * @param client {@link OrganizationsClient}
 * @returns string
 */
export async function getOrganizationRootId(client: OrganizationsClient): Promise<string> {
  const response = await throttlingBackOff(() => client.send(new ListRootsCommand({})));

  if (!response.Roots) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListRootsCommand api didn't return Roots object.`);
  }

  if (response.Roots.length !== 1) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListRootsCommand api returned multiple Roots or no Roots.`,
    );
  }

  const rootId = response.Roots[0].Id;

  if (!rootId) {
    throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListRootsCommand api didn't return root id.`);
  }

  return rootId;
}

/**
 * Function to get Organizational unit id by path
 * @param client {@link OrganizationsClient}
 * @param ouPath string
 * @returns string
 */
export async function getOrganizationalUnitIdByPath(
  client: OrganizationsClient,
  ouPath: string,
): Promise<string | undefined> {
  if (ouPath.replace(/\/+$/, '').toLowerCase() === 'root') {
    return await getOrganizationRootId(client);
  }

  const ouNames = ouPath.replace(/\/+$/, '').split('/');

  let emptyPathId: string | undefined;
  if (ouPath.length === 0) {
    emptyPathId = undefined;
  } else {
    let currentParentId = await getOrganizationRootId(client);
    const isTopLevelOuNameRoot = ouNames[0].toLowerCase() === 'root';
    const startIndex = isTopLevelOuNameRoot ? 1 : 0;

    for (let i = startIndex; i < ouNames.length; i++) {
      const currentOuName = ouNames[i];

      const ous = await getOrganizationalUnitsForParent(client, currentParentId);

      const matchingOu = ous.find(ou => ou.Name!.toLowerCase() === currentOuName.toLowerCase());

      if (!matchingOu) {
        return undefined;
      }

      if (i === ouNames.length - 1) {
        return matchingOu.Id;
      }

      currentParentId = matchingOu.Id!;
    }
  }

  return emptyPathId;
}

/**
 * Function to get parent OU id
 * @param client {@link OrganizationsClient}
 * @param parentOuName string
 * @returns string | undefined
 */
export async function getParentOuId(client: OrganizationsClient, parentOuName: string): Promise<string | undefined> {
  if (parentOuName === 'Root') {
    return await getOrganizationRootId(client);
  }
  return await getOrganizationalUnitIdByPath(client, parentOuName);
}

/**
 * Function to get AWS Organizations accounts
 * @param client {@link OrganizationsClient}
 * @returns accounts {@link Account}[]
 */
export async function getOrganizationAccounts(client: OrganizationsClient): Promise<Account[]> {
  const accounts: Account[] = [];
  const paginator = paginateListAccounts({ client }, {});
  for await (const page of paginator) {
    for (const account of page.Accounts ?? []) {
      accounts.push(account);
    }
  }

  return accounts;
}

/**
 * Function to get Account details from AWS Organizations by email
 * @param client {@link OrganizationsClient}
 * @param accountEmail string
 * @returns Account | undefined
 */
export async function getAccountDetailsFromOrganizations(
  client: OrganizationsClient,
  accountEmail: string,
): Promise<Account | undefined> {
  const accounts = await getOrganizationAccounts(client);

  for (const account of accounts) {
    if (account.Email && account.Email.toLowerCase() === accountEmail.toLowerCase()) {
      return account;
    }
  }

  return undefined;
}

/**
 * Function to get account id by email
 * @param client {@link OrganizationsClient}
 * @param email string
 * @returns string
 */
export async function getAccountId(client: OrganizationsClient, email: string): Promise<string> {
  const accountDetailsFromOrganizations = await getAccountDetailsFromOrganizations(client, email);
  if (!accountDetailsFromOrganizations) {
    throw new Error(
      `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with email "${email}" not found in AWS Organizations.`,
    );
  }

  if (!accountDetailsFromOrganizations.Id) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListAccounts api did not return the Account object Id property for the account with email "${email}".`,
    );
  }

  return accountDetailsFromOrganizations.Id;
}

/**
 * Function to get organization id
 * @param client {@link OrganizationsClient}
 * @returns string
 */
export async function getOrganizationId(client: OrganizationsClient): Promise<string> {
  const response = await throttlingBackOff(() => client.send(new DescribeOrganizationCommand({})));

  if (!response.Organization) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeOrganizationCommand api did not return Organization object.`,
    );
  }

  if (!response.Organization.Id) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeOrganizationCommand api did not return Organization object Id property.`,
    );
  }

  return response.Organization.Id;
}

/**
 * Function to get current account id
 * @param client {@link STSClient}
 * @returns string
 */
export async function getCurrentAccountId(client: STSClient): Promise<string> {
  const response = await throttlingBackOff(() => client.send(new GetCallerIdentityCommand({})));

  if (!response.Account) {
    throw new Error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetCallerIdentityCommand api did not return Account property.`,
    );
  }

  return response.Account;
}

/**
 * Function to get organizational unit arn
 * @param organizationClient {@link OrganizationsClient}
 * @param stsClient {@link STSClient}
 * @param ouId string
 * @param partition string
 * @param organizationId string | undefined
 * @returns string
 */
export async function getOrganizationalUnitArn(
  organizationClient: OrganizationsClient,
  stsClient: STSClient,
  ouId: string,
  partition: string,
  organizationId?: string,
): Promise<string> {
  const organizationAccountId = await getCurrentAccountId(stsClient);
  const orgId = organizationId ?? (await getOrganizationId(organizationClient));

  return `arn:${partition}:organizations::${organizationAccountId}:ou/${orgId}/${ouId.toLowerCase()}`;
}

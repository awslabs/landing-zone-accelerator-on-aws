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

import { AssumeRoleCommand, GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import {
  Account,
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  Organization,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';

import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';

import path from 'path';
import fs from 'fs';

import { AssumeRoleCredentialType } from './resources';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to validate config directory and presence of mandatory files
 * @param configDirPath
 */
export function validateConfigDirPath(configDirPath: string): void {
  if (!fs.existsSync(configDirPath)) {
    throw new Error(`Invalid config directory path !!! "${configDirPath}" not found`);
  }

  const mandatoryConfigFiles: string[] = [
    'accounts-config.yaml',
    'global-config.yaml',
    'iam-config.yaml',
    'network-config.yaml',
    'organization-config.yaml',
    'security-config.yaml',
  ];

  const files = fs.readdirSync(configDirPath);
  const missingFiles = mandatoryConfigFiles.filter(item => !files.includes(item));

  if (missingFiles.length > 0) {
    throw new Error(
      `Missing mandatory configuration files in ${configDirPath}. \n Missing files are ${missingFiles.join(',')}`,
    );
  }
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

  if (!response.Credentials) {
    throw new Error(`Credentials not found from AssumeRole command`);
  }

  if (!response.Credentials.AccessKeyId) {
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
 * Function to retrieve AWS organizations accounts
 * @param globalRegion string
 * @param solutionId string
 * @param managementAccountCredentials {@link AssumeRoleCredentialType}
 * @returns accounts {@link Account}[]
 */
export async function getOrganizationAccounts(
  globalRegion: string,
  solutionId: string,
  managementAccountCredentials?: AssumeRoleCredentialType,
): Promise<Account[]> {
  const client = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: managementAccountCredentials,
  });
  const organizationAccounts: Account[] = [];
  const paginator = paginateListAccounts({ client }, {});
  for await (const page of paginator) {
    organizationAccounts.push(...(page.Accounts ?? []));
  }
  return organizationAccounts;
}

/**
 * Function to retrieve AWS organizations details
 * @param globalRegion string
 * @param solutionId string
 * @param managementAccountCredentials {@link AssumeRoleCredentialType}
 * @returns accounts {@link Account}[]
 */
export async function getOrganizationDetails(
  globalRegion: string,
  solutionId: string,
  managementAccountCredentials?: AssumeRoleCredentialType,
): Promise<Organization | undefined> {
  const client = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: managementAccountCredentials,
  });
  try {
    const response = await throttlingBackOff(() => client.send(new DescribeOrganizationCommand({})));

    if (!response.Organization) {
      throw new Error(`Aws Organization couldn't fetch organizations details`);
    }
    return response.Organization;
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (e instanceof AWSOrganizationsNotInUseException) {
      logger.warn(`AWS Organizations is not configured !!!`);
      return undefined;
    }
    throw e;
  }
}

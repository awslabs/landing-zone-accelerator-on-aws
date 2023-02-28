/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * share directory - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  console.log(event);
  const region = event.ResourceProperties['region'];
  const partition = event.ResourceProperties['partition'];
  const madAccountId = event.ResourceProperties['madAccountId'];
  const directoryId = event.ResourceProperties['directoryId'];
  const newTargetAccountIds: string[] = event.ResourceProperties['shareTargetAccountIds'];
  const assumeRoleName = event.ResourceProperties['assumeRoleName'];

  const solutionId = process.env['SOLUTION_ID'];

  const directoryServiceClient = new AWS.DirectoryService({ region: region, customUserAgent: solutionId });

  const existingSharedAccountIds = await getExistingSharedAccountIds(directoryServiceClient, directoryId);

  console.log(`Existing shared account is ${existingSharedAccountIds}`);

  const excludeSharedAccountIds: string[] = [];
  const includeSharedAccountIds: string[] = [];

  if (existingSharedAccountIds.length > 0) {
    excludeSharedAccountIds.push(...existingSharedAccountIds.filter(item => !newTargetAccountIds.includes(item)));
    includeSharedAccountIds.push(...newTargetAccountIds.filter(item => !existingSharedAccountIds.includes(item)));
  } else {
    includeSharedAccountIds.push(...newTargetAccountIds);
  }

  console.log(`Include shared account is ${includeSharedAccountIds}`);
  console.log(`Exclude shared account is ${excludeSharedAccountIds}`);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('start ShareDirectory');

      for (const account of includeSharedAccountIds) {
        if (madAccountId === account) {
          console.warn(
            `The Target AWS account ID ${account} you specified cannot be the same as the directory owner AWS account ID ${madAccountId}, skipping share request!!!!`,
          );
          continue;
        }
        console.log(`Start: Directory ${directoryId} share with account ${account}`);
        const targetDirectoryId = await shareDirectory(directoryServiceClient, directoryId, account);
        await acceptShare(
          directoryServiceClient,
          region,
          partition,
          directoryId,
          targetDirectoryId,
          account,
          assumeRoleName,
          solutionId,
        );
        // }
      }

      console.log('start un-share Directory');
      for (const account of excludeSharedAccountIds) {
        await unshareDirectory(directoryServiceClient, directoryId, account);
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      for (const account of existingSharedAccountIds) {
        await unshareDirectory(directoryServiceClient, directoryId, account);
        await sleep(30000);
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Function to accept directory share request
 * @param sourceDirectoryServiceClient
 * @param region
 * @param sourceDirectoryId
 * @param targetDirectoryId
 * @param accountId
 * @param assumeRoleName
 * @param solutionId
 */
async function acceptShare(
  sourceDirectoryServiceClient: AWS.DirectoryService,
  region: string,
  partition: string,
  sourceDirectoryId: string,
  targetDirectoryId: string,
  accountId: string,
  assumeRoleName: string,
  solutionId?: string,
): Promise<void> {
  const shareStatus = await getSharedAccountStatus(sourceDirectoryServiceClient, sourceDirectoryId, accountId);

  if (shareStatus === 'PendingAcceptance') {
    const roleArn = `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`;
    console.log(`Role arn : ${roleArn}`);
    const stsClient = new AWS.STS({ region: region, customUserAgent: solutionId });
    console.log(`Assume role in target account ${accountId}, role arn is ${roleArn}`);
    const assumeRoleCredential = await throttlingBackOff(() =>
      stsClient
        .assumeRole({
          RoleArn: roleArn,
          RoleSessionName: 'AcceptMadShareSession',
        })
        .promise(),
    );

    const targetDirectoryServiceClient = new AWS.DirectoryService({
      region: region,
      credentials: {
        accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId,
        secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey,
        sessionToken: assumeRoleCredential.Credentials!.SessionToken,
        expireTime: assumeRoleCredential.Credentials!.Expiration,
      },
      customUserAgent: solutionId,
    });

    console.log(`Start: Accepting share directory for target account ${accountId}`);
    await throttlingBackOff(() =>
      targetDirectoryServiceClient
        .acceptSharedDirectory({
          SharedDirectoryId: targetDirectoryId,
        })
        .promise(),
    );
  } else {
    console.warn(`Share account ${accountId} status is ${shareStatus}, skipping acceptance`);
  }

  console.log(`End: Accepting share directory for target account ${accountId}`);
}

/**
 * Function to unshare directory
 * @param directoryServiceClient
 * @param directoryId
 * @param accountId
 */
async function unshareDirectory(
  directoryServiceClient: AWS.DirectoryService,
  directoryId: string,
  accountId: string,
): Promise<void> {
  const shareStatus = await getSharedAccountStatus(directoryServiceClient, directoryId, accountId);

  if (shareStatus === 'Shared') {
    await throttlingBackOff(() =>
      directoryServiceClient
        .unshareDirectory({
          DirectoryId: directoryId,
          UnshareTarget: { Id: accountId, Type: 'ACCOUNT' },
        })
        .promise(),
    );
  } else {
    throw new Error(`Target account ${accountId} share status is ${shareStatus}, skipped unshare !!!!`);
  }
}

/**
 * Function to share directory to target account
 * @param directoryServiceClient
 * @param directoryId
 * @param accountId
 * @returns
 */
async function shareDirectory(
  directoryServiceClient: AWS.DirectoryService,
  directoryId: string,
  accountId: string,
): Promise<string> {
  const response = await throttlingBackOff(() =>
    directoryServiceClient
      .shareDirectory({
        DirectoryId: directoryId,
        ShareNotes: 'Shared by LZA',
        ShareMethod: 'HANDSHAKE',
        ShareTarget: { Id: accountId, Type: 'ACCOUNT' },
      })
      .promise(),
  );

  let shareStatus = await getSharedAccountStatus(directoryServiceClient, directoryId, accountId);

  do {
    console.warn(
      `Account ${accountId} share status ${shareStatus} is not PendingAcceptance, sleeping for 10 seconds before rechecking`,
    );
    await sleep(10000);
    shareStatus = await getSharedAccountStatus(directoryServiceClient, directoryId, accountId);
  } while (shareStatus !== 'PendingAcceptance');

  return response.SharedDirectoryId!;
}

/**
 * Function to get shared account status
 * @param directoryServiceClient
 * @param directoryId
 * @param accountId
 * @returns
 */
async function getSharedAccountStatus(
  directoryServiceClient: AWS.DirectoryService,
  directoryId: string,
  accountId: string,
): Promise<string> {
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      directoryServiceClient
        .describeSharedDirectories({
          OwnerDirectoryId: directoryId,
          NextToken: nextToken,
        })
        .promise(),
    );

    for (const sharedDirectory of page.SharedDirectories ?? []) {
      if (sharedDirectory.SharedAccountId! === accountId) {
        return sharedDirectory.ShareStatus!;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  throw new Error(`Shared status not found for Directory ${directoryId} with share target account ${accountId}`);
}

/**
 * Function to get existing shared accounts ids
 * @param directoryServiceClient
 * @param directoryId
 * @returns
 */
async function getExistingSharedAccountIds(
  directoryServiceClient: AWS.DirectoryService,
  directoryId: string,
): Promise<string[]> {
  const sharedAccounts: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      directoryServiceClient
        .describeSharedDirectories({
          OwnerDirectoryId: directoryId,
          NextToken: nextToken,
        })
        .promise(),
    );

    for (const sharedDirectory of page.SharedDirectories ?? []) {
      sharedAccounts.push(sharedDirectory.SharedAccountId!);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return sharedAccounts;
}

/**
 * Sleep for a specified number of milliseconds
 * @param ms
 * @returns
 */
async function sleep(ms: number) {
  return new Promise(f => setTimeout(f, ms));
}

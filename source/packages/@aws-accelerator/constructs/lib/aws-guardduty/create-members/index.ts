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

import { chunkArray, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  GuardDutyClient,
  AccountDetail,
  UpdateOrganizationConfigurationCommand,
  CreateMembersCommand,
  ListMembersCommand,
  DisassociateMembersCommand,
  DeleteMembersCommand,
  ListDetectorsCommand,
  OrganizationFeatureConfiguration,
  BadRequestException,
} from '@aws-sdk/client-guardduty';
import { ListAccountsCommand, ListAccountsCommandOutput } from '@aws-sdk/client-organizations';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { setOrganizationsClient } from '@aws-accelerator/utils/lib/set-organizations-client';

/**
 * enable-guardduty - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const partition = event.ResourceProperties['partition'];
  const region = event.ResourceProperties['region'];
  const guardDutyMemberAccountIds: string[] = event.ResourceProperties['guardDutyMemberAccountIds'];
  const enableS3Protection: boolean = event.ResourceProperties['enableS3Protection'] === 'true';
  const enableEksProtection: boolean = event.ResourceProperties['enableEksProtection'] === 'true';
  const autoEnableOrgMembersFlag: boolean = event.ResourceProperties['autoEnableOrgMembers'] === 'true';

  const solutionId = process.env['SOLUTION_ID'];
  const chunkSize = process.env['CHUNK_SIZE'] ? parseInt(process.env['CHUNK_SIZE']) : 50;
  const organizationsClient = setOrganizationsClient(partition, solutionId);

  const guardDutyClient = new GuardDutyClient({
    region: region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  const detectorId = await getDetectorId(guardDutyClient);

  let nextToken: string | undefined = undefined;

  let existingMemberAccountIds: string[] = [];

  let autoEnableOrgMembers: 'ALL' | 'NEW' | 'NONE' = 'ALL';
  if (!autoEnableOrgMembersFlag) {
    autoEnableOrgMembers = 'NONE';
  }

  console.log(`EnableS3Protection: ${enableS3Protection}`);
  console.log(`EnableEksProtection: ${enableEksProtection}`);
  console.log(`autoEnableOrgMembers: ${autoEnableOrgMembers}`);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const features = getOrganizationFeaturesEnabled(enableS3Protection, enableEksProtection);

      console.log('starting - UpdateOrganizationConfiguration');
      try {
        autoEnableOrgMembersFlag
          ? await updateOrganizationConfiguration(guardDutyClient, detectorId!, autoEnableOrgMembers, features)
          : await updateOrganizationConfiguration(guardDutyClient, detectorId!, autoEnableOrgMembers);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        return { Status: 'Failure', StatusCode: e.statusCode };
      }

      console.log('starting - CreateMembersCommand');
      const allAccounts: AccountDetail[] = [];

      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })),
        );

        allAccounts.push(...getMembersToCreate(page, guardDutyMemberAccountIds));
        nextToken = page.NextToken;
      } while (nextToken);

      const chunkedAccountsForCreate = chunkArray(allAccounts, chunkSize);

      for (const accounts of chunkedAccountsForCreate) {
        console.log(`Initiating createMembers request for ${accounts.length} accounts`);
        await throttlingBackOff(() =>
          guardDutyClient.send(new CreateMembersCommand({ DetectorId: detectorId!, AccountDetails: accounts })),
        );
      }

      // Cleanup members removed from deploymentTarget
      if (guardDutyMemberAccountIds.length > 0) {
        console.log('Initiating cleanup of members removed from deploymentTargets');
        existingMemberAccountIds = await getExistingMembers(guardDutyClient, detectorId!);

        const memberAccountIdsToDelete: string[] = [];
        for (const accountId of existingMemberAccountIds) {
          if (!guardDutyMemberAccountIds.includes(accountId)) {
            memberAccountIdsToDelete.push(accountId);
          }
        }
        if (memberAccountIdsToDelete.length > 0) {
          const chunkedAccountsForDelete = chunkArray(memberAccountIdsToDelete, chunkSize);
          await disassociateAndDeleteMembers(guardDutyClient, detectorId!, chunkedAccountsForDelete);
        }
      }

      console.log('Returning Success');
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const disabledFeatures = getOrganizationFeaturesEnabled(false, false);
      try {
        await updateOrganizationConfiguration(guardDutyClient, detectorId!, 'NONE', disabledFeatures);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        return { Status: 'Failure', StatusCode: e.statusCode };
      }

      existingMemberAccountIds = await getExistingMembers(guardDutyClient, detectorId!);

      if (existingMemberAccountIds.length > 0) {
        const chunkedAccountsForDelete = chunkArray(existingMemberAccountIds, chunkSize);
        await disassociateAndDeleteMembers(guardDutyClient, detectorId!, chunkedAccountsForDelete);
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Get accounts details for the GuardDuty members to create
 * @param page
 * @param guardDutyMemberAccountIds
 * @returns
 */
function getMembersToCreate(page: ListAccountsCommandOutput, guardDutyMemberAccountIds: string[]): AccountDetail[] {
  const allAccounts: AccountDetail[] = [];
  for (const account of page.Accounts ?? []) {
    if (guardDutyMemberAccountIds.length > 0) {
      if (guardDutyMemberAccountIds.includes(account.Id!)) {
        allAccounts.push({ AccountId: account.Id!, Email: account.Email! });
      }
    } else {
      allAccounts.push({ AccountId: account.Id!, Email: account.Email! });
    }
  }
  return allAccounts;
}

/**
 * Function to get existing guardduty members
 * @param guardDutyClient
 * @param detectorId
 * @returns string[]
 */
async function getExistingMembers(guardDutyClient: GuardDutyClient, detectorId: string): Promise<string[]> {
  const existingMemberAccountIds: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      guardDutyClient.send(new ListMembersCommand({ DetectorId: detectorId, NextToken: nextToken })),
    );
    for (const member of page.Members ?? []) {
      existingMemberAccountIds.push(member.AccountId!);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return existingMemberAccountIds;
}

/**
 * Function to disassociate and delete guardduty members
 * @param guardDutyClient
 * @param chunkedAccountsForDelete
 */
async function disassociateAndDeleteMembers(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  chunkedAccountsForDelete: string[][],
) {
  for (const existingMemberAccountIdBatch of chunkedAccountsForDelete) {
    console.log(`Initiating disassociateMembers request for ${existingMemberAccountIdBatch.length} accounts`);
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new DisassociateMembersCommand({ AccountIds: existingMemberAccountIdBatch, DetectorId: detectorId }),
      ),
    );

    console.log(`Initiating deleteMembers request for ${existingMemberAccountIdBatch.length} accounts`);
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new DeleteMembersCommand({ AccountIds: existingMemberAccountIdBatch, DetectorId: detectorId }),
      ),
    );
  }
}

function convertBooleanToGuardDutyFormat(flag: boolean) {
  if (flag) {
    return 'NEW';
  } else {
    return 'NONE';
  }
}

function getOrganizationFeaturesEnabled(s3DataEvents: boolean, eksAuditLogs: boolean) {
  const featureList: OrganizationFeatureConfiguration[] = [];

  featureList.push({
    AutoEnable: convertBooleanToGuardDutyFormat(s3DataEvents),
    Name: 'S3_DATA_EVENTS',
  });

  featureList.push({
    AutoEnable: convertBooleanToGuardDutyFormat(eksAuditLogs),
    Name: 'EKS_AUDIT_LOGS',
  });
  return featureList;
}

async function getDetectorId(guardDutyClient: GuardDutyClient): Promise<string | undefined> {
  const response = await throttlingBackOff(() => guardDutyClient.send(new ListDetectorsCommand({})));
  console.log(response);
  return response.DetectorIds!.length === 1 ? response.DetectorIds![0] : undefined;
}

async function updateOrganizationConfiguration(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  autoEnableOrgMembers: 'ALL' | 'NEW' | 'NONE',
  featureList?: OrganizationFeatureConfiguration[],
) {
  try {
    await guardDutyClient.send(
      new UpdateOrganizationConfigurationCommand({
        AutoEnableOrganizationMembers: autoEnableOrgMembers,
        DetectorId: detectorId!,
        Features: featureList,
      }),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e instanceof BadRequestException && featureList) {
      console.log('Retrying with only S3 protection');
      const featureListS3Only = featureList.filter(feat => feat.Name === 'S3_DATA_EVENTS');
      await guardDutyClient.send(
        new UpdateOrganizationConfigurationCommand({
          AutoEnableOrganizationMembers: autoEnableOrgMembers,
          DetectorId: detectorId!,
          Features: featureListS3Only,
        }),
      );
    } else {
      console.log(`Error: ${JSON.stringify(e)}`);
      throw new Error('Failed to update GuardDuty Organization Configuration, check logs for details');
    }
  }
}

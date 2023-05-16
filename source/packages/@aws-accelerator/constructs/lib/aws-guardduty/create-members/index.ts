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
import { OrganizationsClient, ListAccountsCommand } from '@aws-sdk/client-organizations';

/**
 * enable-guardduty - lambda handler
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
  const region = event.ResourceProperties['region'];
  const partition = event.ResourceProperties['partition'];
  const enableS3Protection: boolean = event.ResourceProperties['enableS3Protection'] === 'true';
  const enableEksProtection: boolean = event.ResourceProperties['enableEksProtection'] === 'true';
  const solutionId = process.env['SOLUTION_ID'];

  let organizationsClient: OrganizationsClient;
  if (partition === 'aws-us-gov') {
    organizationsClient = new OrganizationsClient({ region: 'us-gov-west-1', customUserAgent: solutionId });
  } else if (partition === 'aws-cn') {
    organizationsClient = new OrganizationsClient({ region: 'cn-northwest-1', customUserAgent: solutionId });
  } else {
    organizationsClient = new OrganizationsClient({ region: 'us-east-1', customUserAgent: solutionId });
  }

  const guardDutyClient = new GuardDutyClient({ region: region, customUserAgent: solutionId });

  const detectorId = await getDetectorId(guardDutyClient);

  let nextToken: string | undefined = undefined;

  console.log(`EnableS3Protection: ${enableS3Protection}`);
  console.log(`EnableEksProtection: ${enableEksProtection}`);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');
      const allAccounts: AccountDetail[] = [];

      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })),
        );
        for (const account of page.Accounts ?? []) {
          allAccounts.push({ AccountId: account.Id!, Email: account.Email! });
        }
        nextToken = page.NextToken;
      } while (nextToken);

      await throttlingBackOff(() =>
        guardDutyClient.send(new CreateMembersCommand({ DetectorId: detectorId!, AccountDetails: allAccounts })),
      );

      const features = getOrganizationFeaturesEnabled(enableS3Protection, enableEksProtection);

      console.log('starting - UpdateOrganizationConfiguration');
      try {
        await updateOrganizationConfiguration(guardDutyClient, detectorId!, features, 'ALL');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        return { Status: 'Failure', StatusCode: e.statusCode };
      }

      console.log('Returning Success');
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const disabledFeatures = getOrganizationFeaturesEnabled(false, false);
      try {
        await updateOrganizationConfiguration(guardDutyClient, detectorId!, disabledFeatures, 'NONE');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        return { Status: 'Failure', StatusCode: e.statusCode };
      }

      const existingMemberAccountIds: string[] = [];
      nextToken = undefined;
      do {
        const page = await throttlingBackOff(() =>
          guardDutyClient.send(new ListMembersCommand({ DetectorId: detectorId!, NextToken: nextToken })),
        );
        for (const member of page.Members ?? []) {
          existingMemberAccountIds.push(member.AccountId!);
        }
        nextToken = page.NextToken;
      } while (nextToken);

      if (existingMemberAccountIds.length > 0) {
        await throttlingBackOff(() =>
          guardDutyClient.send(
            new DisassociateMembersCommand({ AccountIds: existingMemberAccountIds, DetectorId: detectorId! }),
          ),
        );

        await throttlingBackOff(() =>
          guardDutyClient.send(
            new DeleteMembersCommand({ AccountIds: existingMemberAccountIds, DetectorId: detectorId! }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
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
  featureList: OrganizationFeatureConfiguration[],
  autoEnableOrgMembers: 'ALL' | 'NEW' | 'NONE',
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
    if (e instanceof BadRequestException) {
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

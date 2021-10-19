/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as console from 'console';
import { OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';
import {
  AccountDetail,
  CreateMembersCommand,
  DeleteMembersCommand,
  DisassociateMembersCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  UpdateOrganizationConfigurationCommand,
  paginateListMembers,
} from '@aws-sdk/client-guardduty';

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
  const enableS3Protection: boolean = event.ResourceProperties['enableS3Protection'];

  const organizationsClient = new OrganizationsClient({});
  const guardDutyClient = new GuardDutyClient({ region: region });

  const detectorId = await getDetectorId(guardDutyClient);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');
      const allAccounts: AccountDetail[] = [];
      for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
        for (const account of page.Accounts ?? []) {
          allAccounts.push({ AccountId: account.Id, Email: account.Email });
        }
      }
      await throttlingBackOff(() =>
        guardDutyClient.send(new CreateMembersCommand({ DetectorId: detectorId, AccountDetails: allAccounts })),
      );

      await throttlingBackOff(() =>
        guardDutyClient.send(
          new UpdateOrganizationConfigurationCommand({
            AutoEnable: true,
            DetectorId: detectorId,
            DataSources: { S3Logs: { AutoEnable: enableS3Protection } },
          }),
        ),
      );

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const existingMemberAccountIds: string[] = [];
      for await (const page of paginateListMembers({ client: guardDutyClient }, { DetectorId: detectorId })) {
        for (const member of page.Members ?? []) {
          console.log(member);
          existingMemberAccountIds.push(member.AccountId!);
        }
      }

      await throttlingBackOff(() =>
        guardDutyClient.send(
          new DisassociateMembersCommand({ AccountIds: existingMemberAccountIds, DetectorId: detectorId }),
        ),
      );

      await throttlingBackOff(() =>
        guardDutyClient.send(
          new DeleteMembersCommand({ AccountIds: existingMemberAccountIds, DetectorId: detectorId }),
        ),
      );

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getDetectorId(guardDutyClient: GuardDutyClient): Promise<string | undefined> {
  const response = await throttlingBackOff(() => guardDutyClient.send(new ListDetectorsCommand({})));
  console.log(response);
  return response.DetectorIds!.length === 1 ? response.DetectorIds![0] : undefined;
}

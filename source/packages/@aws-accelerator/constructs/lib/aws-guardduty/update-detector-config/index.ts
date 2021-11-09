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
import {
  GuardDutyClient,
  ListDetectorsCommand,
  UpdateDetectorCommand,
  UpdateMemberDetectorsCommand,
  paginateListMembers,
} from '@aws-sdk/client-guardduty';

/**
 * GuardDutyUpdateDetector - lambda handler
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
  const adminAccountId = event.ResourceProperties['adminAccountId'];
  const isExportConfigEnable = event.ResourceProperties['isExportConfigEnable'];
  const exportDestination = event.ResourceProperties['exportDestination'];
  const exportFrequency = event.ResourceProperties['exportFrequency'];

  const guardDutyClient = new GuardDutyClient({ region: region });
  const detectorId = await getDetectorId(guardDutyClient);

  const existingMemberAccountIds: string[] = [adminAccountId];

  for await (const page of paginateListMembers({ client: guardDutyClient }, { DetectorId: detectorId })) {
    for (const member of page.Members ?? []) {
      console.log(member);
      existingMemberAccountIds.push(member.AccountId!);
    }
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateMembersCommand');
      if (isExportConfigEnable && exportDestination === 's3') {
        await throttlingBackOff(() =>
          guardDutyClient.send(
            new UpdateMemberDetectorsCommand({
              DetectorId: detectorId,
              AccountIds: existingMemberAccountIds,
              DataSources: { S3Logs: { Enable: isExportConfigEnable } },
            }),
          ),
        );

        await throttlingBackOff(() =>
          guardDutyClient.send(
            new UpdateDetectorCommand({
              DetectorId: detectorId,
              Enable: true,
              FindingPublishingFrequency: exportFrequency,
              DataSources: { S3Logs: { Enable: isExportConfigEnable } },
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (isExportConfigEnable && exportDestination === 's3') {
        await throttlingBackOff(() =>
          guardDutyClient.send(
            new UpdateDetectorCommand({
              DetectorId: detectorId,
              Enable: false,
              FindingPublishingFrequency: exportFrequency,
              DataSources: { S3Logs: { Enable: false } },
            }),
          ),
        );

        await throttlingBackOff(() =>
          guardDutyClient.send(
            new UpdateMemberDetectorsCommand({
              DetectorId: detectorId,
              AccountIds: existingMemberAccountIds,
              DataSources: { S3Logs: { Enable: false } },
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getDetectorId(guardDutyClient: GuardDutyClient): Promise<string> {
  const response = await throttlingBackOff(() => guardDutyClient.send(new ListDetectorsCommand({})));
  console.log(response);
  if (response.DetectorIds) {
    return response.DetectorIds[0];
  }
  throw new Error(`GuardDuty not enabled`);
}

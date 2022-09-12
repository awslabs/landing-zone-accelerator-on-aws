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
  const exportFrequency = event.ResourceProperties['exportFrequency'];
  const enableS3Protection = event.ResourceProperties['enableS3Protection'] === 'true';
  const guardDutyClient = new AWS.GuardDuty({ region: region });
  const detectorId = await getDetectorId(guardDutyClient);

  const existingMemberAccountIds: string[] = [adminAccountId];

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      guardDutyClient.listMembers({ DetectorId: detectorId, NextToken: nextToken }).promise(),
    );
    for (const member of page.Members ?? []) {
      console.log(member);
      existingMemberAccountIds.push(member.AccountId!);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - UpdateMembersCommand');
      await throttlingBackOff(() =>
        guardDutyClient
          .updateMemberDetectors({
            DetectorId: detectorId,
            AccountIds: existingMemberAccountIds,
            DataSources: { S3Logs: { Enable: enableS3Protection } },
          })
          .promise(),
      );

      console.log('starting - UpdateDetectorCommand');
      await throttlingBackOff(() =>
        guardDutyClient
          .updateDetector({
            DetectorId: detectorId,
            Enable: true,
            FindingPublishingFrequency: exportFrequency,
            DataSources: { S3Logs: { Enable: enableS3Protection } },
          })
          .promise(),
      );

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      await throttlingBackOff(() =>
        guardDutyClient
          .updateDetector({
            DetectorId: detectorId,
            Enable: false,
            FindingPublishingFrequency: exportFrequency,
            DataSources: { S3Logs: { Enable: false } },
          })
          .promise(),
      );

      await throttlingBackOff(() =>
        guardDutyClient
          .updateMemberDetectors({
            DetectorId: detectorId,
            AccountIds: existingMemberAccountIds,
            DataSources: { S3Logs: { Enable: false } },
          })
          .promise(),
      );

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getDetectorId(guardDutyClient: AWS.GuardDuty): Promise<string> {
  const response = await throttlingBackOff(() => guardDutyClient.listDetectors({}).promise());
  console.log(response);
  if (response.DetectorIds) {
    return response.DetectorIds[0];
  }
  throw new Error(`GuardDuty not enabled`);
}

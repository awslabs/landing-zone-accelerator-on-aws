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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  AccessDeniedException,
  ConflictException,
  DisableMacieCommand,
  EnableMacieCommand,
  GetMacieSessionCommand,
  Macie2Client,
  MacieStatus,
  PutFindingsPublicationConfigurationCommand,
  UpdateMacieSessionCommand,
} from '@aws-sdk/client-macie2';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * add-macie-members - lambda handler
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
  const region = event.ResourceProperties['region'];
  const findingPublishingFrequency = event.ResourceProperties['findingPublishingFrequency'];
  const isSensitiveSh = event.ResourceProperties['isSensitiveSh'] === 'true';
  const solutionId = process.env['SOLUTION_ID'];

  const macie2Client = new Macie2Client({
    region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let macieStatus = await isMacieEnable(macie2Client);
      if (!macieStatus) {
        try {
          console.log('start enable of macie');
          await throttlingBackOff(() =>
            macie2Client.send(
              new EnableMacieCommand({
                findingPublishingFrequency: findingPublishingFrequency,
                status: MacieStatus.ENABLED,
              }),
            ),
          );
        } catch (e: unknown) {
          // This is required when macie is already enabled ConflictException exception issues
          if (e instanceof ConflictException) {
            console.warn(`Macie already enabled`);
            console.warn(e.name + ': ' + e.message);
          }
          throw e;
        }
      }
      console.log('start update of macie');
      await throttlingBackOff(() =>
        macie2Client.send(
          new UpdateMacieSessionCommand({
            findingPublishingFrequency: findingPublishingFrequency,
            status: 'ENABLED',
          }),
        ),
      );

      // macie status do not change immediately causing failure to other processes, so wait till macie enabled
      while (!macieStatus) {
        console.log(`checking macie status ${macieStatus}`);
        macieStatus = await isMacieEnable(macie2Client);
      }

      await throttlingBackOff(() =>
        macie2Client.send(
          new PutFindingsPublicationConfigurationCommand({
            securityHubConfiguration: {
              publishClassificationFindings: isSensitiveSh,
              publishPolicyFindings: true,
            },
          }),
        ),
      );

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      if (await isMacieEnable(macie2Client)) {
        try {
          await throttlingBackOff(() => macie2Client.send(new DisableMacieCommand({})));
        } catch (e: unknown) {
          // This is required when macie is already disabled ConflictException exception issues
          if (e instanceof ConflictException) {
            console.warn(`Macie already disabled`);
            console.warn(e.name + ': ' + e.message);
          }
          throw e;
        }
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

async function isMacieEnable(macie2Client: Macie2Client): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() => macie2Client.send(new GetMacieSessionCommand({})));
    return response.status === MacieStatus.ENABLED;
  } catch (e: unknown) {
    // This is required when macie is not enabled AccessDeniedException exception issues
    if (e instanceof AccessDeniedException) {
      console.warn(e.name + ': ' + e.message);
      return false;
    }
    throw e;
  }
}

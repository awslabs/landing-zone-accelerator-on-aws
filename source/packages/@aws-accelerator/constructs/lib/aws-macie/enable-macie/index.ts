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
  Macie2Client,
  GetMacieSessionCommand,
  MacieStatus,
  UpdateMacieSessionCommand,
  EnableMacieCommand,
  DisableMacieCommand,
  PutFindingsPublicationConfigurationCommand,
} from '@aws-sdk/client-macie2';

/**
 * add-macie-members - lambda handler
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
  const findingPublishingFrequency = event.ResourceProperties['findingPublishingFrequency'];
  const isSensitiveSh = event.ResourceProperties['isSensitiveSh'];

  const macie2Client = new Macie2Client({ region: region });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let macieStatus = await isMacieEnable(macie2Client);
      if (!macieStatus) {
        console.log('start enable of macie');
        await throttlingBackOff(() =>
          macie2Client.send(
            new EnableMacieCommand({
              findingPublishingFrequency: findingPublishingFrequency,
              status: MacieStatus.ENABLED,
            }),
          ),
        );
      }
      console.log('start update of macie');
      await throttlingBackOff(() =>
        macie2Client.send(
          new UpdateMacieSessionCommand({
            findingPublishingFrequency: findingPublishingFrequency,
            status: MacieStatus.ENABLED,
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
        await throttlingBackOff(() =>
          macie2Client.send(
            new DisableMacieCommand({
              findingPublishingFrequency: findingPublishingFrequency,
              status: MacieStatus.ENABLED,
            }),
          ),
        );
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}
async function isMacieEnable(macie2Client: Macie2Client): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() => macie2Client.send(new GetMacieSessionCommand({})));
    return response.status === MacieStatus.ENABLED;
  } catch (e) {
    if (`${e}`.includes('Macie is not enabled')) {
      console.warn('Macie is not enabled');
      return false;
    } else {
      throw e;
    }
  }
}

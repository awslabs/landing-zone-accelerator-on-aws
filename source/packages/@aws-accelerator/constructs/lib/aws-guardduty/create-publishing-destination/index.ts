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
  CreateDetectorCommand,
  CreatePublishingDestinationCommand,
  DeletePublishingDestinationCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  ListPublishingDestinationsCommand,
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
  const exportDestinationType = event.ResourceProperties['exportDestinationType'];
  const bucketArn = event.ResourceProperties['bucketArn'];
  const kmsKeyArn = event.ResourceProperties['kmsKeyArn'];

  const guardDutyClient = new GuardDutyClient({ region: region });

  let detectorId = await getDetectorId(guardDutyClient);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreatePublishingDestination');
      if (!detectorId) {
        await throttlingBackOff(() =>
          guardDutyClient.send(
            new CreateDetectorCommand({
              Enable: true,
            }),
          ),
        );

        detectorId = await getDetectorId(guardDutyClient);
      }

      const listPublishingDestinationResponse = await throttlingBackOff(() =>
        guardDutyClient.send(
          new ListPublishingDestinationsCommand({
            DetectorId: detectorId,
          }),
        ),
      );

      if (listPublishingDestinationResponse.Destinations!.length === 0) {
        console.log('starting CreatePublishingDestinationCommand');

        await throttlingBackOff(() =>
          guardDutyClient.send(
            new CreatePublishingDestinationCommand({
              DetectorId: detectorId,
              DestinationType: exportDestinationType,
              DestinationProperties: { DestinationArn: bucketArn, KmsKeyArn: kmsKeyArn },
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const response = await throttlingBackOff(() =>
        guardDutyClient.send(
          new ListPublishingDestinationsCommand({
            DetectorId: detectorId,
          }),
        ),
      );

      const destinationId =
        response.Destinations ?? [].length === 1 ? response.Destinations![0].DestinationId : undefined;

      if (response.Destinations!.length === 1) {
        await throttlingBackOff(() =>
          guardDutyClient.send(
            new DeletePublishingDestinationCommand({
              DetectorId: detectorId,
              DestinationId: destinationId,
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getDetectorId(guardDutyClient: GuardDutyClient): Promise<string | undefined> {
  const response = await throttlingBackOff(() => guardDutyClient.send(new ListDetectorsCommand({})));
  console.log(response);
  return response.DetectorIds!.length === 1 ? response.DetectorIds![0] : undefined;
}

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
  const destinationArn = event.ResourceProperties['destinationArn'];
  const kmsKeyArn = event.ResourceProperties['kmsKeyArn'];
  const overrideExisting = event.ResourceProperties['exportDestinationOverride'];
  const solutionId = process.env['SOLUTION_ID'];

  const guardDutyClient = new AWS.GuardDuty({ region: region, customUserAgent: solutionId });

  let detectorId = await getDetectorId(guardDutyClient);

  switch (event.RequestType) {
    case 'Create':
      console.log('starting - CreatePublishingDestination');
      if (!detectorId) {
        await throttlingBackOff(() =>
          guardDutyClient
            .createDetector({
              Enable: true,
            })
            .promise(),
        );
      }

      detectorId = await getDetectorId(guardDutyClient);

      if (overrideExisting) {
        await overrideExistingDestination(
          guardDutyClient,
          detectorId!,
          destinationArn,
          kmsKeyArn,
          exportDestinationType,
        );
      } else {
        await throttlingBackOff(() =>
          guardDutyClient
            .createPublishingDestination({
              DetectorId: detectorId!,
              DestinationType: exportDestinationType,
              DestinationProperties: { DestinationArn: destinationArn, KmsKeyArn: kmsKeyArn },
            })
            .promise(),
        );
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Update':
      console.log('starting - UpdatePublishingDestination');

      // if override is enabled, then follow that workflow
      // Note: override will check destinationArn of s3 and kmsKeyArn. If they are the same no change will be done.
      if (overrideExisting) {
        await overrideExistingDestination(
          guardDutyClient,
          detectorId!,
          destinationArn,
          kmsKeyArn,
          exportDestinationType,
        );
      } else {
        const updateResponse = await getPublishingDestinations(guardDutyClient, detectorId!);

        const updateDestinationId =
          updateResponse.Destinations ?? [].length === 1 ? updateResponse.Destinations[0].DestinationId : undefined;

        if (updateResponse.Destinations.length === 1) {
          await throttlingBackOff(() =>
            guardDutyClient
              .updatePublishingDestination({
                DetectorId: detectorId!,
                DestinationId: updateDestinationId!,
                DestinationProperties: { DestinationArn: destinationArn, KmsKeyArn: kmsKeyArn },
              })
              .promise(),
          );
        }
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const deleteResponse = await getPublishingDestinations(guardDutyClient, detectorId!);

      const deleteDestinationId =
        deleteResponse.Destinations ?? [].length === 1 ? deleteResponse.Destinations[0].DestinationId : undefined;

      if (deleteResponse.Destinations.length === 1) {
        await throttlingBackOff(() =>
          guardDutyClient
            .deletePublishingDestination({
              DetectorId: detectorId!,
              DestinationId: deleteDestinationId!,
            })
            .promise(),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

async function getDetectorId(guardDutyClient: AWS.GuardDuty): Promise<string | undefined> {
  const response = await throttlingBackOff(() => guardDutyClient.listDetectors({}).promise());
  console.log(response);
  return response.DetectorIds!.length === 1 ? response.DetectorIds![0] : undefined;
}

async function getPublishingDestinations(
  guardDutyClient: AWS.GuardDuty,
  detectorId: string,
): Promise<AWS.GuardDuty.ListPublishingDestinationsResponse> {
  return throttlingBackOff(() =>
    guardDutyClient
      .listPublishingDestinations({
        DetectorId: detectorId,
      })
      .promise(),
  );
}

async function overrideExistingDestination(
  guardDutyClient: AWS.GuardDuty,
  detectorId: string,
  destinationArn: string,
  kmsKeyArn: string,
  exportDestinationType: string,
) {
  // Check account for destination
  const publishingDestinations = await getPublishingDestinations(guardDutyClient, detectorId);
  if (publishingDestinations.Destinations.length > 0) {
    for (const pubDestination of publishingDestinations.Destinations) {
      // only s3 is possible but leaving this logic in place, incase guard duty service has more destinations
      if (pubDestination.DestinationType == 'S3') {
        //get current destination id and find the destination arn
        const pubDestinationArn = await throttlingBackOff(() =>
          guardDutyClient
            .describePublishingDestination({
              DestinationId: pubDestination.DestinationId,
              DetectorId: detectorId,
            })
            .promise(),
        );

        if (
          pubDestinationArn.DestinationProperties.DestinationArn === destinationArn &&
          pubDestinationArn.DestinationProperties.KmsKeyArn === kmsKeyArn
        ) {
          // kms and destination are same as input. So no change is needed.
          console.log('No changes are necessary. Destination Arn and KMS key are the same.');
        } else {
          // kms and destination are not the same. So update destination
          await throttlingBackOff(() =>
            guardDutyClient
              .updatePublishingDestination({
                DetectorId: detectorId!,
                DestinationId: pubDestination.DestinationId,
                DestinationProperties: { DestinationArn: destinationArn, KmsKeyArn: kmsKeyArn },
              })
              .promise(),
          );
        }
      }
    }
  } else {
    // there are no destinations. Create one
    await throttlingBackOff(() =>
      guardDutyClient
        .createPublishingDestination({
          DetectorId: detectorId!,
          DestinationType: exportDestinationType,
          DestinationProperties: { DestinationArn: destinationArn, KmsKeyArn: kmsKeyArn },
        })
        .promise(),
    );
  }
}

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

import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  BadRequestException,
  CreateDetectorCommand,
  CreatePublishingDestinationCommand,
  DeletePublishingDestinationCommand,
  DescribePublishingDestinationCommand,
  GuardDutyClient,
  ListDetectorsCommand,
  ListPublishingDestinationsCommand,
  ListPublishingDestinationsCommandOutput,
  UpdatePublishingDestinationCommand,
} from '@aws-sdk/client-guardduty';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

interface PublishingDestinationOptions {
  /**
   * Publishing destination ARN
   */
  readonly destinationArn: string;
  /**
   * The export destination type
   */
  readonly exportDestinationType: string;
  /**
   * KMS key ARN
   */
  readonly kmsKeyArn: string;
  /**
   * Override existing configuration
   */
  readonly overrideExisting: boolean;
}

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
  const options = setOptions(event.ResourceProperties);

  const guardDutyClient = new GuardDutyClient({
    retryStrategy: setRetryStrategy(),
    customUserAgent: process.env['SOLUTION_ID'],
  });

  let detectorId = await getDetectorId(guardDutyClient);

  switch (event.RequestType) {
    case 'Create':
      console.log('starting - CreatePublishingDestination');
      if (!detectorId) {
        detectorId = await createDetector(guardDutyClient);
      }

      if (options.overrideExisting) {
        await overrideExistingDestination(guardDutyClient, detectorId, options);
      } else {
        try {
          await throttlingBackOff(() =>
            guardDutyClient.send(
              new CreatePublishingDestinationCommand({
                DetectorId: detectorId,
                DestinationType: options.exportDestinationType,
                DestinationProperties: { DestinationArn: options.destinationArn, KmsKeyArn: options.kmsKeyArn },
              }),
            ),
          );
        } catch (err) {
          if (
            err instanceof BadRequestException &&
            err.message.startsWith('The request failed because a publishingDestination already exists')
          ) {
            console.log('Publishing destination already exists.');
            return { Status: 'Success', StatusCode: 200 };
          }
          throw err;
        }
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Update':
      console.log('starting - UpdatePublishingDestination');

      // if override is enabled, then follow that workflow
      // Note: override will check destinationArn of s3 and kmsKeyArn. If they are the same no change will be done.
      if (options.overrideExisting) {
        await overrideExistingDestination(guardDutyClient, detectorId!, options);
      } else {
        const updateDestinationId = await getDestinationId(guardDutyClient, detectorId!);

        if (updateDestinationId) {
          await throttlingBackOff(() =>
            guardDutyClient.send(
              new UpdatePublishingDestinationCommand({
                DetectorId: detectorId!,
                DestinationId: updateDestinationId,
                DestinationProperties: { DestinationArn: options.destinationArn, KmsKeyArn: options.kmsKeyArn },
              }),
            ),
          );
        }
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const deleteDestinationId = await getDestinationId(guardDutyClient, detectorId!);

      if (deleteDestinationId) {
        await throttlingBackOff(() =>
          guardDutyClient.send(
            new DeletePublishingDestinationCommand({
              DetectorId: detectorId!,
              DestinationId: deleteDestinationId,
            }),
          ),
        );
      }

      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Set custom resource options for GuardDuty publishing destination
 * @param resourceProperties { [key: string]: any }
 * @param serviceToken string
 * @returns PublishingDestinationOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOptions(resourceProperties: { [key: string]: any }): PublishingDestinationOptions {
  return {
    destinationArn: resourceProperties['destinationArn'],
    exportDestinationType: resourceProperties['exportDestinationType'],
    kmsKeyArn: resourceProperties['kmsKeyArn'],
    overrideExisting: resourceProperties['exportDestinationOverride'] === 'true',
  };
}

/**
 * Returns the detector ID, if one exists
 * @param guardDutyClient GuardDutyClient
 * @returns Promise<string | undefined>
 */
async function getDetectorId(guardDutyClient: GuardDutyClient): Promise<string | undefined> {
  const response = await throttlingBackOff(() => guardDutyClient.send(new ListDetectorsCommand({})));
  console.log(response);
  return response.DetectorIds!.length === 1 ? response.DetectorIds![0] : undefined;
}

/**
 * Create a GuardDuty detector
 * @param guardDutyClient GuardDutyClient
 * @returns Promise<string>
 */
async function createDetector(guardDutyClient: GuardDutyClient): Promise<string> {
  const response = await throttlingBackOff(() => guardDutyClient.send(new CreateDetectorCommand({ Enable: true })));

  if (!response.DetectorId) {
    throw new Error(`Unable to create detector`);
  }
  return response.DetectorId;
}

/**
 * List GuardDuty publishing destinations
 * @param guardDutyClient GuardDutyClient
 * @param detectorId string
 * @returns Promise<ListPublishingDestinationsCommandOutput>
 */
async function getPublishingDestinations(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
): Promise<ListPublishingDestinationsCommandOutput> {
  return await throttlingBackOff(() =>
    guardDutyClient.send(new ListPublishingDestinationsCommand({ DetectorId: detectorId })),
  );
}

/**
 * Get the GuardDuty publishing destination ID
 * @param guardDutyClient GuardDutyClient
 * @param detectorId string
 * @returns Promise<string | undefined>
 */
async function getDestinationId(guardDutyClient: GuardDutyClient, detectorId: string): Promise<string | undefined> {
  try {
    const publishingDestinations = await getPublishingDestinations(guardDutyClient, detectorId);

    if (!publishingDestinations.Destinations) {
      throw new Error(`API did not return destinations`);
    }

    return publishingDestinations.Destinations.length === 1
      ? publishingDestinations.Destinations[0].DestinationId
      : undefined;
  } catch (e) {
    throw new Error(`Unable to retrieve destination ID from ListPublishingDestinations command: ${e}`);
  }
}

/**
 * Override existing publishing destination configuration
 * @param guardDutyClient GuardDutyClient
 * @param detectorId string
 * @param options PublishingDestinationOptions
 */
async function overrideExistingDestination(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  options: PublishingDestinationOptions,
) {
  // Check account for destination
  const publishingDestinations = await getPublishingDestinations(guardDutyClient, detectorId);
  if (publishingDestinations.Destinations && publishingDestinations.Destinations.length > 0) {
    for (const pubDestination of publishingDestinations.Destinations) {
      // Only s3 is currently possible but leaving this logic in place, in case GuardDuty service adds additional destinations
      if (pubDestination.DestinationType == 'S3') {
        // Get current destination id and find the destination arn
        const pubDestinationResponse = await throttlingBackOff(() =>
          guardDutyClient.send(
            new DescribePublishingDestinationCommand({
              DestinationId: pubDestination.DestinationId,
              DetectorId: detectorId,
            }),
          ),
        );

        if (
          pubDestinationResponse.DestinationProperties &&
          pubDestinationResponse.DestinationProperties.DestinationArn === options.destinationArn &&
          pubDestinationResponse.DestinationProperties.KmsKeyArn === options.kmsKeyArn
        ) {
          // KMS and destination are same as input. So no change is needed.
          console.log('No changes are necessary. Destination Arn and KMS key are the same.');
        } else {
          // kms and destination are not the same. So update destination
          await throttlingBackOff(() =>
            guardDutyClient.send(
              new UpdatePublishingDestinationCommand({
                DetectorId: detectorId,
                DestinationId: pubDestination.DestinationId,
                DestinationProperties: { DestinationArn: options.destinationArn, KmsKeyArn: options.kmsKeyArn },
              }),
            ),
          );
        }
      }
    }
  } else {
    // There are no destinations. Create one
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new CreatePublishingDestinationCommand({
          DetectorId: detectorId,
          DestinationType: options.exportDestinationType,
          DestinationProperties: { DestinationArn: options.destinationArn, KmsKeyArn: options.kmsKeyArn },
        }),
      ),
    );
  }
}

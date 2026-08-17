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

import {
  CreatePublishingDestinationCommand,
  DeletePublishingDestinationCommand,
  DestinationProperties,
  DestinationType,
  GuardDutyClient,
  ListPublishingDestinationsCommand,
  UpdatePublishingDestinationCommand,
} from '@aws-sdk/client-guardduty';
import path from 'node:path';
import { createLogger } from '../common/logger';
import { MODULE_EXCEPTIONS } from '../common/types';
import { executeApi } from '../common/utility';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Abstract class for managing GuardDuty's findings export configuration
 */
export abstract class FindingsExportConfiguration {
  /**
   * Creates or modifies the export configuration based on the given parameters
   * @param client - GuardDutyClient
   * @param overrideExisting - Whether the function should modify an existing destination
   * @param detectorId - GuardDuty detector ID
   * @param destinationType - The destination type to configure (Only S3 Supported)
   * @param destinationProperties - Properties for the destination
   * @param dryRun - Whether to execute the operation in dry-run mode
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when the configuration is complete
   */
  public static async configurePublishingDestination(
    client: GuardDutyClient,
    overrideExisting: boolean,
    detectorId: string,
    destinationType: DestinationType,
    destinationProperties: DestinationProperties,
    dryRun: boolean,
    logPrefix: string,
  ) {
    if (dryRun) {
      logger.dryRun(
        'ConfigurePublishingDestination',
        {
          DetectorId: detectorId,
          DestinationType: destinationType,
          DestinationProperties: destinationProperties,
          OverrideExisting: overrideExisting,
        },
        logPrefix,
      );
      return;
    }

    const destinationId = await this.getDestinationId(client, detectorId, logPrefix, destinationType);

    if (destinationId) {
      if (overrideExisting) {
        // Update the existing configuration
        const commandName = 'UpdatePublishingDestinationCommand';
        const parameters = {
          DetectorId: detectorId,
          DestinationId: destinationId,
          DestinationProperties: destinationProperties,
        };
        await executeApi(
          commandName,
          parameters,
          () => client.send(new UpdatePublishingDestinationCommand(parameters)),
          logger,
          logPrefix,
        );
      } else {
        logger.info(
          `Publishing destination of type ${destinationType} already exists, and \`overrideExisting\` is \`false\`. No update performed.`,
          logPrefix,
        );
      }
    } else {
      // Create a new destination configuration
      const commandName = 'CreatePublishingDestinationCommand';
      const parameters = {
        DetectorId: detectorId,
        DestinationType: destinationType,
        DestinationProperties: destinationProperties,
      };
      await executeApi(
        commandName,
        parameters,
        () => client.send(new CreatePublishingDestinationCommand(parameters)),
        logger,
        logPrefix,
      );
    }
  }

  /**
   * Deletes the export configuration for the specified destination type
   * @param client - GuardDutyClient
   * @param detectorId - GuardDuty detector ID
   * @param destinationType - The destination type to delete (Only S3 Supported)
   * @param dryRun - Whether to execute the operation in dry-run mode
   * @param logPrefix - Prefix for logging messages
   * @returns Promise that resolves when the deletion is complete
   */
  public static async deletePublishingDestination(
    client: GuardDutyClient,
    detectorId: string,
    destinationType: DestinationType,
    dryRun: boolean,
    logPrefix: string,
  ) {
    if (dryRun) {
      logger.dryRun(
        'DeletePublishingDestination',
        {
          DetectorId: detectorId,
          DestinationType: destinationType,
        },
        logPrefix,
      );
      return;
    }

    const deleteDestinationId = await this.getDestinationId(client, detectorId, logPrefix, destinationType);

    if (deleteDestinationId) {
      const commandName = 'DeletePublishingDestinationCommand';
      const parameters = {
        DetectorId: detectorId,
        DestinationId: deleteDestinationId,
      };
      await executeApi(
        commandName,
        parameters,
        () => client.send(new DeletePublishingDestinationCommand(parameters)),
        logger,
        logPrefix,
      );
    } else {
      logger.info(`No publishing destination for ${detectorId} of type ${destinationType} found to delete.`, logPrefix);
    }
  }

  /**
   * Finds the destination Id for the given destination type
   * @param client - GuardDutyClient
   * @param detectorId - The detector ID to query
   * @param logPrefix - Prefix for logging messages
   * @param destinationType - The destination type to filter for
   * @returns The destination ID if found, undefined otherwise
   */
  private static async getDestinationId(
    client: GuardDutyClient,
    detectorId: string,
    logPrefix: string,
    destinationType: DestinationType,
  ): Promise<string | undefined> {
    const parameters = { DetectorId: detectorId };
    const publishingDestinations = await executeApi(
      'ListPublishingDestinationsCommand',
      parameters,
      () => client.send(new ListPublishingDestinationsCommand(parameters)),
      logger,
      logPrefix,
    );

    if (!publishingDestinations.Destinations) {
      throw new Error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: API did not return destinations`);
    }

    const filteredPublishingDestinations = publishingDestinations.Destinations.filter(
      dest => dest.DestinationType === destinationType,
    );

    if (filteredPublishingDestinations.length > 1) {
      throw new Error(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Expected 1 destination ID but found ${filteredPublishingDestinations.length}`,
      );
    }

    return filteredPublishingDestinations.length ? filteredPublishingDestinations[0].DestinationId : undefined;
  }
}

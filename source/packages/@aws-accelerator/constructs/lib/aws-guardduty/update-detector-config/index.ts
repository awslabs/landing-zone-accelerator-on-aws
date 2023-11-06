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

import { setRetryStrategy, throttlingBackOff } from '@aws-accelerator/utils';
import {
  BadRequestException,
  DataSourceConfigurations,
  GuardDutyClient,
  ListDetectorsCommand,
  ListMembersCommand,
  UpdateDetectorCommand,
  UpdateMemberDetectorsCommand,
} from '@aws-sdk/client-guardduty';

interface UpdateDetectorOptions {
  /**
   * Enable EKS protection
   */
  readonly enableEksProtection: boolean;
  /**
   * Enable S3 protection
   */
  readonly enableS3Protection: boolean;
  /**
   * Finding export frequency
   */
  readonly exportFrequency?: string;
}

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
  const options = setOptions(event.ResourceProperties);

  const guardDutyClient = new GuardDutyClient({
    retryStrategy: setRetryStrategy(),
    customUserAgent: process.env['SOLUTION_ID'],
  });
  const detectorId = await getDetectorId(guardDutyClient);

  const existingMemberAccountIds = await getMemberAccountIds(guardDutyClient, detectorId);

  console.log(`S3 Protection Enable: ${options.enableS3Protection}`);
  console.log(`EKS Protection Enable: ${options.enableEksProtection}`);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await updateMemberDetectors(guardDutyClient, detectorId, existingMemberAccountIds, options);
      await updateMainDetector(guardDutyClient, detectorId, options);

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('starting - Delete');
      const dataSourcesToRemove: DataSourceConfigurations = {};
      dataSourcesToRemove.S3Logs = { Enable: false };
      dataSourcesToRemove.Kubernetes = { AuditLogs: { Enable: false } };
      await throttlingBackOff(() =>
        guardDutyClient.send(
          new UpdateDetectorCommand({
            DetectorId: detectorId,
            Enable: false,
            FindingPublishingFrequency: options.exportFrequency,
            DataSources: dataSourcesToRemove,
          }),
        ),
      );

      await throttlingBackOff(() =>
        guardDutyClient.send(
          new UpdateMemberDetectorsCommand({
            DetectorId: detectorId,
            AccountIds: existingMemberAccountIds,
            DataSources: dataSourcesToRemove,
          }),
        ),
      );

      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Set custom resource options for GuardDuty detector configuration
 * @param resourceProperties { [key: string]: any }
 * @param serviceToken string
 * @returns UpdateDetectorOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOptions(resourceProperties: { [key: string]: any }): UpdateDetectorOptions {
  return {
    enableEksProtection: resourceProperties['enableEksProtection'] === 'true',
    enableS3Protection: resourceProperties['enableS3Protection'] === 'true',
    exportFrequency: resourceProperties['exportFrequency'],
  };
}

/**
 * Get existing GuardDuty detector ID
 * @param guardDutyClient GuardDutyClient
 * @returns Promise<string>
 */
async function getDetectorId(guardDutyClient: GuardDutyClient): Promise<string> {
  const response = await throttlingBackOff(() => guardDutyClient.send(new ListDetectorsCommand({})));
  console.log(response);
  if (response.DetectorIds) {
    return response.DetectorIds[0];
  }
  throw new Error(`GuardDuty not enabled`);
}

/**
 * Get existing member account IDs
 * @param guardDutyClient GuardDutyClient
 * @param detectorId string
 * @returns Promise<string[]>
 */
async function getMemberAccountIds(guardDutyClient: GuardDutyClient, detectorId: string): Promise<string[]> {
  const existingMemberAccountIds: string[] = [];

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      guardDutyClient.send(new ListMembersCommand({ DetectorId: detectorId, NextToken: nextToken })),
    );
    for (const member of page.Members ?? []) {
      if (member.AccountId) {
        existingMemberAccountIds.push(member.AccountId);
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return existingMemberAccountIds;
}

/**
 * Update member account detector configurations
 * @param guardDutyClient GuardDutyClient
 * @param detectorId string
 * @param existingMemberAccountIds string []
 * @param options UpdateDetectorOptions
 */
async function updateMemberDetectors(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  existingMemberAccountIds: string[],
  options: UpdateDetectorOptions,
) {
  let dataSourcesToUpdate: DataSourceConfigurations = {};
  dataSourcesToUpdate.S3Logs = { Enable: options.enableS3Protection };
  dataSourcesToUpdate.Kubernetes = { AuditLogs: { Enable: options.enableEksProtection } };
  console.log('starting - UpdateMembersCommand');
  try {
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateMemberDetectorsCommand({
          DetectorId: detectorId,
          AccountIds: existingMemberAccountIds,
          DataSources: dataSourcesToUpdate,
        }),
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e instanceof BadRequestException) {
      dataSourcesToUpdate = { S3Logs: { Enable: options.enableS3Protection } };
      await throttlingBackOff(() =>
        guardDutyClient.send(
          new UpdateMemberDetectorsCommand({
            DetectorId: detectorId,
            AccountIds: existingMemberAccountIds,
            DataSources: dataSourcesToUpdate,
          }),
        ),
      );
    } else {
      throw new Error(`Unable to complete UpdateMemberDetectors command: ${e}`);
    }
  }
}

async function updateMainDetector(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  options: UpdateDetectorOptions,
) {
  let dataSourcesToUpdate: DataSourceConfigurations = {};
  dataSourcesToUpdate.S3Logs = { Enable: options.enableS3Protection };
  dataSourcesToUpdate.Kubernetes = { AuditLogs: { Enable: options.enableEksProtection } };
  console.log('starting - UpdateDetectorCommand');
  try {
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateDetectorCommand({
          DetectorId: detectorId,
          Enable: true,
          FindingPublishingFrequency: options.exportFrequency,
          DataSources: dataSourcesToUpdate,
        }),
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e instanceof BadRequestException) {
      dataSourcesToUpdate = { S3Logs: { Enable: options.enableS3Protection } };
      await throttlingBackOff(() =>
        guardDutyClient.send(
          new UpdateDetectorCommand({
            DetectorId: detectorId,
            Enable: true,
            FindingPublishingFrequency: options.exportFrequency,
            DataSources: dataSourcesToUpdate,
          }),
        ),
      );
    } else {
      throw new Error(`Unable to complete UpdateDetector command: ${e}`);
    }
  }
}

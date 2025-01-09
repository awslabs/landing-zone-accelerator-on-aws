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
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  BadRequestException,
  DetectorAdditionalConfiguration,
  DetectorFeature,
  DetectorFeatureConfiguration,
  EbsSnapshotPreservation,
  FeatureAdditionalConfiguration,
  FindingPublishingFrequency,
  GuardDutyClient,
  ListDetectorsCommand,
  ListMembersCommand,
  UpdateDetectorCommand,
  UpdateMalwareScanSettingsCommand,
  UpdateMemberDetectorsCommand,
} from '@aws-sdk/client-guardduty';

export interface UpdateDetectorOptions {
  /**
   * Enable EKS protection
   */
  readonly enableEksProtection: boolean;
  /**
   * Enable EKS Agent protection
   */
  readonly enableEksAgent: boolean;
  /**
   * Enable S3 protection
   */
  readonly enableS3Protection: boolean;
  /**
   * Enable EC2 protection
   */
  readonly enableEc2Protection: boolean;
  /**
   * Enable RDS protection
   */
  readonly enableRdsProtection: boolean;
  /**
   * Enable Lambda protection
   */
  readonly enableLambdaProtection: boolean;
  /**
   * Finding export frequency
   */
  readonly exportFrequency?: FindingPublishingFrequency | undefined;
  /**
   * Enable keep malware snapshots for EC2 findings
   */
  readonly enableKeepMalwareSnapshots: boolean;
}

/**
 * GuardDutyUpdateDetector - lambda handler
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
  const detectorId = await getDetectorId(guardDutyClient);
  const existingMemberAccountIds = await getMemberAccountIds(guardDutyClient, detectorId);

  console.log(`S3 Protection Enable: ${options.enableS3Protection}`);
  console.log(`EKS Protection Enable: ${options.enableEksProtection}`);
  console.log(`EKS Agent Enable: ${options.enableEksAgent}`);
  console.log(`EC2 Protection Enable: ${options.enableEc2Protection}`);
  console.log(`RDS Protection Enable: ${options.enableRdsProtection}`);
  console.log(`Lambda Protection Enable: ${options.enableLambdaProtection}`);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await updateMemberDetectors(guardDutyClient, detectorId, existingMemberAccountIds, options);
      await updateMainDetector(guardDutyClient, detectorId, options);
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('starting - Delete');
      await removeDetectorFeatures(guardDutyClient, detectorId, existingMemberAccountIds, options);
      return { Status: 'Success', StatusCode: 200 };
  }
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
export async function updateMemberDetectors(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  existingMemberAccountIds: string[],
  options: UpdateDetectorOptions,
) {
  const addFeatures: DetectorFeatureConfiguration[] = createDetectorFeatures(options);
  console.log('starting - UpdateMembersCommand');
  try {
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateMemberDetectorsCommand({
          DetectorId: detectorId,
          AccountIds: existingMemberAccountIds,
          Features: addFeatures,
        }),
      ),
    );
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateMalwareScanSettingsCommand({
          DetectorId: detectorId,
          EbsSnapshotPreservation:
            options.enableKeepMalwareSnapshots === true
              ? EbsSnapshotPreservation.RETENTION_WITH_FINDING
              : EbsSnapshotPreservation.NO_RETENTION,
        }),
      ),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e instanceof BadRequestException) {
      const dataSourcesToUpdate: DetectorFeatureConfiguration[] = [
        createFeature(DetectorFeature.S3_DATA_EVENTS, options.enableS3Protection),
      ];
      await throttlingBackOff(() =>
        guardDutyClient.send(
          new UpdateMemberDetectorsCommand({
            DetectorId: detectorId,
            AccountIds: existingMemberAccountIds,
            Features: dataSourcesToUpdate,
          }),
        ),
      );
    } else {
      throw new Error(`Unable to complete UpdateMemberDetectors command: ${e}`);
    }
  }
}

export async function updateMainDetector(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  options: UpdateDetectorOptions,
) {
  const addFeatures: DetectorFeatureConfiguration[] = createDetectorFeatures(options);
  console.log('starting - UpdateDetectorCommand');
  try {
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateDetectorCommand({
          DetectorId: detectorId,
          Enable: true,
          FindingPublishingFrequency: options.exportFrequency,
          Features: addFeatures,
        }),
      ),
    );
    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateMalwareScanSettingsCommand({
          DetectorId: detectorId,
          EbsSnapshotPreservation:
            options.enableKeepMalwareSnapshots === true
              ? EbsSnapshotPreservation.RETENTION_WITH_FINDING
              : EbsSnapshotPreservation.NO_RETENTION,
        }),
      ),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    if (e instanceof BadRequestException) {
      const dataSourcesToUpdate: DetectorFeatureConfiguration[] = [
        createFeature(DetectorFeature.S3_DATA_EVENTS, options.enableS3Protection),
      ];
      await throttlingBackOff(() =>
        guardDutyClient.send(
          new UpdateDetectorCommand({
            DetectorId: detectorId,
            Enable: true,
            FindingPublishingFrequency: options.exportFrequency,
            Features: dataSourcesToUpdate,
          }),
        ),
      );
    } else {
      throw new Error(`Unable to complete UpdateDetector command: ${e}`);
    }
  }
}

export async function removeDetectorFeatures(
  guardDutyClient: GuardDutyClient,
  detectorId: string,
  existingMemberAccountIds: string[],
  options: UpdateDetectorOptions,
) {
  console.log('starting - Delete');
  try {
    const removeFeatures: DetectorFeatureConfiguration[] = [];
    removeFeatures.push(createFeature(DetectorFeature.EKS_RUNTIME_MONITORING, options.enableEksProtection));
    removeFeatures.push(createFeature(DetectorFeature.EKS_AUDIT_LOGS, options.enableEksProtection));
    removeFeatures.push(createFeature(DetectorFeature.S3_DATA_EVENTS, options.enableS3Protection));
    removeFeatures.push(createFeature(DetectorFeature.EBS_MALWARE_PROTECTION, options.enableEc2Protection));
    removeFeatures.push(createFeature(DetectorFeature.RDS_LOGIN_EVENTS, options.enableRdsProtection));
    removeFeatures.push(createFeature(DetectorFeature.LAMBDA_NETWORK_LOGS, options.enableLambdaProtection));

    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateDetectorCommand({
          DetectorId: detectorId,
          Enable: false,
          FindingPublishingFrequency: options.exportFrequency,
          Features: removeFeatures,
        }),
      ),
    );

    await throttlingBackOff(() =>
      guardDutyClient.send(
        new UpdateMemberDetectorsCommand({
          DetectorId: detectorId,
          AccountIds: existingMemberAccountIds,
          Features: removeFeatures,
        }),
      ),
    );
  } catch (error) {
    console.error(error);
  }
}

/**
 * Set custom resource options for GuardDuty detector configuration
 * @param resourceProperties { [key: string]: any }
 * @param serviceToken string
 * @returns UpdateDetectorOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setOptions(resourceProperties: { [key: string]: any }): UpdateDetectorOptions {
  let exportFrequency: FindingPublishingFrequency | undefined;
  switch (resourceProperties['exportFrequency']) {
    case undefined:
      exportFrequency = undefined;
      break;
    case 'FIFTEEN_MINUTES':
      exportFrequency = FindingPublishingFrequency.FIFTEEN_MINUTES;
      break;
    case 'ONE_HOUR':
      exportFrequency = FindingPublishingFrequency.ONE_HOUR;
      break;
    case 'SIX_HOURS':
      exportFrequency = FindingPublishingFrequency.SIX_HOURS;
      break;
    default:
      throw new Error(
        `Invalid value for GuardDuty FindingPublishingFrequency: ${resourceProperties['exportFrequency']}.`,
      );
  }

  return {
    enableS3Protection: resourceProperties['enableS3Protection'] === 'true',
    enableEksProtection: resourceProperties['enableEksProtection'] === 'true',
    enableEksAgent: resourceProperties['enableEksAgent'] === 'true',
    enableEc2Protection: resourceProperties['enableEc2Protection'] === 'true',
    enableKeepMalwareSnapshots: resourceProperties['enableKeepMalwareSnapshots'] === 'true',
    enableRdsProtection: resourceProperties['enableRdsProtection'] === 'true',
    enableLambdaProtection: resourceProperties['enableLambdaProtection'] === 'true',
    exportFrequency: exportFrequency,
  };
}

/**
 * Create array of DetectorFeatureConfiguration based on configuration
 * @param options UpdateDetectorOptions
 * @returns DetectorFeatureConfiguration[]
 */
export function createDetectorFeatures(options: UpdateDetectorOptions): DetectorFeatureConfiguration[] {
  const addFeatures: DetectorFeatureConfiguration[] = [];
  const eksFeature = createFeature(DetectorFeature.EKS_RUNTIME_MONITORING, options.enableEksProtection);
  addFeatures.push(eksFeature);
  if (options.enableEksAgent) {
    const featureConfiguration = createAdditionalConfiguration(
      FeatureAdditionalConfiguration.EKS_ADDON_MANAGEMENT,
      options.enableEksAgent,
    );
    eksFeature.AdditionalConfiguration = [featureConfiguration];
  }

  addFeatures.push(createFeature(DetectorFeature.EKS_AUDIT_LOGS, options.enableEksProtection));
  addFeatures.push(createFeature(DetectorFeature.S3_DATA_EVENTS, options.enableS3Protection));
  addFeatures.push(createFeature(DetectorFeature.EBS_MALWARE_PROTECTION, options.enableEc2Protection));
  addFeatures.push(createFeature(DetectorFeature.RDS_LOGIN_EVENTS, options.enableRdsProtection));
  addFeatures.push(createFeature(DetectorFeature.LAMBDA_NETWORK_LOGS, options.enableLambdaProtection));

  return addFeatures;
}

/**
 * Create a DetectorFeatureConfiguration item
 * @param featureName DetectorFeature
 * @param featureStatus boolean
 * @returns a single DetectorFeatureConfiguration
 */
export function createFeature(featureName: DetectorFeature, featureStatus: boolean): DetectorFeatureConfiguration {
  const feature: DetectorFeatureConfiguration = {};
  feature.Name = featureName;
  if (featureStatus) {
    feature.Status = 'ENABLED';
  } else {
    feature.Status = 'DISABLED';
  }
  return feature;
}

/**
 * Create a DetectorAdditionalConfiguration item
 * @param configName FeatureAdditionalConfiguration
 * @param featureStatus boolean
 * @returns a single DetectorAdditionalConfiguration
 */
export function createAdditionalConfiguration(
  configName: FeatureAdditionalConfiguration,
  featureStatus: boolean,
): DetectorAdditionalConfiguration {
  const feature: DetectorAdditionalConfiguration = {};
  feature.Name = configName;
  if (featureStatus) {
    feature.Status = 'ENABLED';
  } else {
    feature.Status = 'DISABLED';
  }
  return feature;
}

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

import { LandingZoneDriftStatus } from '@aws-sdk/client-controltower';
import {
  ControlTowerLandingZoneConfigType,
  ControlTowerLandingZoneDetailsType,
  IControlTowerKmsKeys,
  LandingZoneUpdateOrResetRequiredType,
} from './resources';

/**
 * Function to make manifest document for CT API
 * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
 * @param event string 'CREATE' | 'UPDATE'
 * @param kmsKeyArns IControlTowerKmsKeys | undefined
 * @param existingManifest any | undefined
 * @returns
 */
export function makeManifestDocument(
  landingZoneConfiguration: ControlTowerLandingZoneConfigType,
  event: 'CREATE' | 'UPDATE',
  kmsKeyArns?: IControlTowerKmsKeys,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingManifest?: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let manifestJsonDocument: any = {
    accessManagement: {
      enabled: landingZoneConfiguration.enableIdentityCenterAccess,
    },
    centralizedLogging: {
      accountId: landingZoneConfiguration.logArchiveAccountId,
      configurations: {
        loggingBucket: {
          retentionDays: landingZoneConfiguration.loggingBucketRetentionDays,
        },
        accessLoggingBucket: {
          retentionDays: landingZoneConfiguration.accessLoggingBucketRetentionDays,
        },
        kmsKeyArn: kmsKeyArns?.centralizedLoggingKeyArn,
      },
      enabled: landingZoneConfiguration.enableOrganizationTrail,
    },
    config: {
      accountId: landingZoneConfiguration.auditAccountId,
      configurations: {
        loggingBucket: {
          retentionDays: landingZoneConfiguration.loggingBucketRetentionDays,
        },
        accessLoggingBucket: {
          retentionDays: landingZoneConfiguration.accessLoggingBucketRetentionDays,
        },
        kmsKeyArn: kmsKeyArns?.configLoggingKeyArn,
      },
      enabled: true,
    },
    securityRoles: {
      enabled: true,
      accountId: landingZoneConfiguration.auditAccountId,
    },
    governedRegions: landingZoneConfiguration.governedRegions,
  };

  if (event === 'CREATE') {
    manifestJsonDocument = {
      ...manifestJsonDocument,
      backup: {
        enabled: false,
      },
    };
  }

  // For UPDATE operations, merge with existing manifest to preserve other modules
  if (event === 'UPDATE' && existingManifest) {
    if (existingManifest.organizationStructure) {
      delete existingManifest.organizationStructure;
    }

    if (existingManifest.securityRoles.accountId && !existingManifest.securityRoles.enabled) {
      existingManifest.securityRoles.enabled = true;
    }

    return {
      ...existingManifest,
      ...manifestJsonDocument,
    };
  }

  return manifestJsonDocument;
}

/**
 * This function compares the AWS Region list from configuration with the existing AWS Control Tower Landing Zone govern region list
 * @param existingRegions string[]
 * @param configRegions string[]
 * @returns status boolean
 */
export function governedRegionsChanged(existingRegions: string[], configRegions: string[]): boolean {
  if (existingRegions.length !== configRegions.length) {
    return true;
  }

  return !existingRegions.every(region => configRegions.includes(region));
}

/**
 * Function to validate AWS Control Tower Landing Zone organization version provided in global config file is latest version
 * @param configVersion string
 * @param latestVersion string
 * @param reason string | undefined
 * @param operationType string | undefined
 */
export function validateLandingZoneVersion(
  configVersion: string,
  latestVersion: string,
  reason?: string,
  operationType?: string,
): void {
  if (latestVersion !== configVersion) {
    if (reason && operationType) {
      throw new Error(
        `It is necessary to ${operationType} the AWS Control Tower Landing Zone because "${reason}". AWS Control Tower Landing Zone's most recent version is ${latestVersion}, which is different from the version ${configVersion} provided. AWS Control Tower Landing Zone can be ${
          operationType === 'update' ? 'updated' : operationType
        } when you specify the latest version in the configuration.`,
      );
    } else {
      throw new Error(
        `AWS Control Tower Landing Zone's most recent version is ${latestVersion}, which is different from the version ${configVersion} provided, execution terminated.`,
      );
    }
  }
}
/**
 * Function to check if the AWS Control Tower Landing Zone is required to update or reset
 * @param landingZoneConfiguration ${@link LandingZoneConfigType}
 * @param landingZoneDetails ${@link ControlTowerLandingZoneDetailsType}
 * @returns landingZoneUpdateOrResetRequired {@link LandingZoneUpdateOrResetRequiredType}
 */
export function landingZoneUpdateOrResetRequired(
  landingZoneConfiguration: ControlTowerLandingZoneConfigType,
  landingZoneDetails: ControlTowerLandingZoneDetailsType,
): LandingZoneUpdateOrResetRequiredType {
  //when drifted
  if (landingZoneDetails.driftStatus === LandingZoneDriftStatus.DRIFTED) {
    const reason = 'The Landing Zone has drifted';
    validateLandingZoneVersion(
      landingZoneConfiguration.version,
      landingZoneDetails.latestAvailableVersion!,
      reason,
      'reset',
    );

    return {
      updateRequired: false,
      targetVersion: landingZoneDetails.latestAvailableVersion!,
      resetRequired: true,
      reason,
    };
  }

  // Changes in the AWS Control Tower Landing Zone configuration force an update of the AWS Control Tower Landing Zone, which will update the AWS Control Tower Landing Zone to the latest version if it is available
  // find reasons to update
  const reasons: string[] = [];

  if (
    landingZoneDetails.centralizedLoggingConfig?.accessLoggingBucketRetentionDays !==
    landingZoneConfiguration.accessLoggingBucketRetentionDays
  ) {
    reasons.push(
      `Changes made in Centralized Logging AccessLoggingBucketRetentionDays from ${landingZoneDetails.centralizedLoggingConfig?.accessLoggingBucketRetentionDays} to ${landingZoneConfiguration.accessLoggingBucketRetentionDays}`,
    );
  }
  if (
    landingZoneDetails.centralizedLoggingConfig?.loggingBucketRetentionDays !==
    landingZoneConfiguration.loggingBucketRetentionDays
  ) {
    reasons.push(
      `Changes made in Centralized Logging LoggingBucketRetentionDays from ${landingZoneDetails.centralizedLoggingConfig?.loggingBucketRetentionDays} to ${landingZoneConfiguration.loggingBucketRetentionDays}`,
    );
  }

  // During upgrade from 3.3 to 4.0 configHubConfig will be undefined
  if (landingZoneDetails.configHubConfig) {
    if (
      landingZoneDetails.configHubConfig.accessLoggingBucketRetentionDays !==
      landingZoneConfiguration.accessLoggingBucketRetentionDays
    ) {
      reasons.push(
        `Changes made in Config AccessLoggingBucketRetentionDays from ${landingZoneDetails.configHubConfig.accessLoggingBucketRetentionDays} to ${landingZoneConfiguration.accessLoggingBucketRetentionDays}`,
      );
    }
    if (
      landingZoneDetails.configHubConfig.loggingBucketRetentionDays !==
      landingZoneConfiguration.loggingBucketRetentionDays
    ) {
      reasons.push(
        `Changes made in Config LoggingBucketRetentionDays from ${landingZoneDetails.configHubConfig.loggingBucketRetentionDays} to ${landingZoneConfiguration.loggingBucketRetentionDays}`,
      );
    }
  }

  if (landingZoneDetails.enableIdentityCenterAccess !== landingZoneConfiguration.enableIdentityCenterAccess) {
    reasons.push(
      `Changes made in EnableIdentityCenterAccess from ${landingZoneDetails.enableIdentityCenterAccess} to ${landingZoneConfiguration.enableIdentityCenterAccess}`,
    );
  }

  if (governedRegionsChanged(landingZoneDetails.governedRegions ?? [], landingZoneConfiguration.governedRegions)) {
    reasons.push(
      `Changes made in governed regions from [${landingZoneDetails.governedRegions?.join(
        ',',
      )}] to [${landingZoneConfiguration.governedRegions.join(',')}]`,
    );
  }

  if (landingZoneDetails.version !== landingZoneConfiguration.version) {
    reasons.push(
      `Changes made in control tower version from ${landingZoneDetails.version} to ${landingZoneConfiguration.version}`,
    );
  }

  if (reasons.length > 0) {
    validateLandingZoneVersion(
      landingZoneConfiguration.version,
      landingZoneDetails.latestAvailableVersion!,
      reasons.join('. '),
      'update',
    );

    return {
      updateRequired: true,
      targetVersion: landingZoneDetails.latestAvailableVersion!,
      resetRequired: false,
      reason: `${reasons.join('. ')}`,
    };
  }

  return {
    updateRequired: false,
    targetVersion: landingZoneDetails.latestAvailableVersion!,
    resetRequired: false,
    reason: 'There were no changes found to update or reset the Landing Zone.',
  };
}

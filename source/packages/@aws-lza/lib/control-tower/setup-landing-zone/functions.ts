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

import { LandingZoneDriftStatus, LandingZoneStatus } from '@aws-sdk/client-controltower';
import {
  ControlTowerLandingZoneConfigType,
  ControlTowerLandingZoneDetailsType,
  IControlTowerKmsKeys,
  LandingZoneUpdateOrResetRequiredType,
} from './resources';

/**
 * Function to make manifest document for CT API
 *
 * @remarks
 * For in-place updates (target version equals the deployed landing zone version), the deployed
 * manifest is reused verbatim and only the fields managed by the accelerator are overlaid, because
 * the manifest schema differs across landing zone versions and may contain fields the accelerator
 * does not model. Rebuilding the manifest is reserved for create and upgrade operations, which
 * always target the latest landing zone version schema.
 * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
 * @param event string 'CREATE' | 'UPDATE'
 * @param kmsKeyArns IControlTowerKmsKeys | undefined
 * @param existingManifest any | undefined
 * @param inPlaceUpdate boolean | undefined
 * @returns
 */
export function makeManifestDocument(
  landingZoneConfiguration: ControlTowerLandingZoneConfigType,
  event: 'CREATE' | 'UPDATE',
  kmsKeyArns?: IControlTowerKmsKeys,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingManifest?: any,
  inPlaceUpdate?: boolean,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (event === 'UPDATE' && existingManifest && inPlaceUpdate) {
    return makeInPlaceManifestDocument(landingZoneConfiguration, existingManifest);
  }

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

    if (existingManifest.config?.enabled === false) {
      manifestJsonDocument['config'] = {
        enabled: false,
      };
    }

    return {
      ...existingManifest,
      ...manifestJsonDocument,
    };
  }

  return manifestJsonDocument;
}

/**
 * Function to make manifest document for an in-place landing zone update
 *
 * @remarks
 * The deployed manifest is by definition valid for the deployed landing zone version, so it is
 * deep copied and returned with only the accelerator managed fields overlaid: governed regions,
 * identity center access, organization trail enablement and bucket retention days. All other
 * fields, including any the accelerator does not model, are sent back to the AWS Control Tower
 * API untouched.
 * @param landingZoneConfiguration {@link ControlTowerLandingZoneConfigType}
 * @param existingManifest any
 * @returns
 */
function makeInPlaceManifestDocument(
  landingZoneConfiguration: ControlTowerLandingZoneConfigType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingManifest: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const manifestJsonDocument = structuredClone(existingManifest);

  manifestJsonDocument.governedRegions = landingZoneConfiguration.governedRegions;

  manifestJsonDocument.accessManagement = {
    ...manifestJsonDocument.accessManagement,
    enabled: landingZoneConfiguration.enableIdentityCenterAccess,
  };

  manifestJsonDocument.centralizedLogging = {
    ...manifestJsonDocument.centralizedLogging,
    enabled: landingZoneConfiguration.enableOrganizationTrail,
  };
  if (landingZoneConfiguration.enableOrganizationTrail) {
    manifestJsonDocument.centralizedLogging.configurations = {
      ...manifestJsonDocument.centralizedLogging.configurations,
      loggingBucket: {
        ...manifestJsonDocument.centralizedLogging.configurations?.loggingBucket,
        retentionDays: landingZoneConfiguration.loggingBucketRetentionDays,
      },
      accessLoggingBucket: {
        ...manifestJsonDocument.centralizedLogging.configurations?.accessLoggingBucket,
        retentionDays: landingZoneConfiguration.accessLoggingBucketRetentionDays,
      },
    };
  }

  // The config field exists only in landing zone version 4.0 and above manifests
  if (manifestJsonDocument.config?.enabled) {
    manifestJsonDocument.config.configurations = {
      ...manifestJsonDocument.config.configurations,
      loggingBucket: {
        ...manifestJsonDocument.config.configurations?.loggingBucket,
        retentionDays: landingZoneConfiguration.loggingBucketRetentionDays,
      },
      accessLoggingBucket: {
        ...manifestJsonDocument.config.configurations?.accessLoggingBucket,
        retentionDays: landingZoneConfiguration.accessLoggingBucketRetentionDays,
      },
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
  // Compare as sets so duplicate entries on either side do not falsely report a change.
  const existingSet = new Set(existingRegions);
  const configSet = new Set(configRegions);

  if (existingSet.size !== configSet.size) {
    return true;
  }

  for (const region of existingSet) {
    if (!configSet.has(region)) {
      return true;
    }
  }

  return false;
}

/**
 * Minimum AWS Control Tower Landing Zone version that supports in-place update and reset operations.
 */
export const MINIMUM_IN_PLACE_OPERATION_VERSION = '3.1';

/**
 * Function to check whether a landing zone version supports in-place update and reset operations
 *
 * @remarks
 * Compares major and minor segments as integers so the check stays correct for hypothetical
 * double-digit minor versions (for example 3.10), which numeric parsing of the whole string
 * would misorder.
 * @param version string
 * @returns status boolean
 */
export function supportsInPlaceOperation(version: string): boolean {
  const [major, minor] = version.split('.').map(Number);
  const [minimumMajor, minimumMinor] = MINIMUM_IN_PLACE_OPERATION_VERSION.split('.').map(Number);

  if (Number.isNaN(major)) {
    return false;
  }

  return major > minimumMajor || (major === minimumMajor && (minor ?? 0) >= minimumMinor);
}

/**
 * Function to validate AWS Control Tower Landing Zone version provided in global config file
 *
 * @remarks
 * The configuration version must match either the deployed AWS Control Tower Landing Zone version
 * (in-place operation, supported from landing zone version 3.1 onward) or the latest available
 * version (upgrade).
 * @param configVersion string
 * @param latestVersion string
 * @param currentVersion string | undefined
 * @param reason string | undefined
 * @param operationType string | undefined
 */
export function validateLandingZoneVersion(
  configVersion: string,
  latestVersion: string,
  currentVersion?: string,
  reason?: string,
  operationType?: string,
): void {
  if (latestVersion === configVersion) {
    return;
  }

  const isInPlaceOperation = currentVersion !== undefined && configVersion === currentVersion;

  if (isInPlaceOperation && supportsInPlaceOperation(currentVersion)) {
    return;
  }

  if (reason && operationType) {
    if (isInPlaceOperation) {
      throw new Error(
        `It is necessary to ${operationType} the AWS Control Tower Landing Zone because "${reason}". In-place ${operationType} is not supported for AWS Control Tower Landing Zone version ${currentVersion}, it requires version ${MINIMUM_IN_PLACE_OPERATION_VERSION} or above. AWS Control Tower Landing Zone can be ${
          operationType === 'update' ? 'updated' : operationType
        } when you specify the latest version ${latestVersion} in the configuration.`,
      );
    }
    throw new Error(
      `It is necessary to ${operationType} the AWS Control Tower Landing Zone because "${reason}". The version ${configVersion} provided in the configuration must match either the deployed AWS Control Tower Landing Zone version ${currentVersion} for in-place ${operationType} or the latest available version ${latestVersion} to upgrade. AWS Control Tower Landing Zone can be ${
        operationType === 'update' ? 'updated' : operationType
      } when you specify one of these versions in the configuration.`,
    );
  } else {
    throw new Error(
      `AWS Control Tower Landing Zone's most recent version is ${latestVersion}, which is different from the version ${configVersion} provided, execution terminated.`,
    );
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
  if (
    landingZoneDetails.driftStatus === LandingZoneDriftStatus.DRIFTED ||
    landingZoneDetails.status === LandingZoneStatus.FAILED
  ) {
    const reason = `The Landing Zone has drifted or failed, resetting`;
    validateLandingZoneVersion(
      landingZoneConfiguration.version,
      landingZoneDetails.latestAvailableVersion!,
      landingZoneDetails.version,
      reason,
      'reset',
    );

    return {
      updateRequired: false,
      targetVersion: landingZoneConfiguration.version,
      resetRequired: true,
      reason,
    };
  }

  // Changes in the AWS Control Tower Landing Zone configuration force an update of the AWS Control Tower Landing Zone, targeting the version specified in the configuration (either the deployed version for in-place update or the latest available version for upgrade)
  // find reasons to update
  const reasons: string[] = [];

  if (landingZoneDetails.centralizedLoggingConfig?.enabled !== landingZoneConfiguration.enableOrganizationTrail) {
    reasons.push(
      `Changes made in Centralized Logging enabled from ${landingZoneDetails.centralizedLoggingConfig?.enabled} to ${landingZoneConfiguration.enableOrganizationTrail}`,
    );
  }

  if (landingZoneConfiguration.enableOrganizationTrail === true) {
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
  }

  // During upgrade from 3.3 to 4.0 configHubConfig will be undefined
  // If config logging is disabled already, we shouldn't overwrite that
  if (landingZoneDetails.configHubConfig && landingZoneDetails.configHubConfig.enabled) {
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

  if (landingZoneDetails.accountAutoEnrollment !== landingZoneConfiguration.accountAutoEnrollment) {
    reasons.push(
      `Changes made in account auto-enrollment from ${!!landingZoneDetails.accountAutoEnrollment} to ${!!landingZoneConfiguration.accountAutoEnrollment}`,
    );
  }

  if (reasons.length > 0) {
    // Skip version validation for account auto-enrollment only changes
    const isOnlyAccountAutoEnrollmentChange = reasons.length === 1 && reasons[0].includes('account auto-enrollment');

    if (!isOnlyAccountAutoEnrollmentChange) {
      validateLandingZoneVersion(
        landingZoneConfiguration.version,
        landingZoneDetails.latestAvailableVersion!,
        landingZoneDetails.version,
        reasons.join('. '),
        'update',
      );
    }

    return {
      updateRequired: true,
      targetVersion: landingZoneConfiguration.version,
      resetRequired: false,
      reason: `${reasons.join('. ')}`,
    };
  }

  return {
    updateRequired: false,
    targetVersion: landingZoneConfiguration.version,
    resetRequired: false,
    reason: 'There were no changes found to update or reset the Landing Zone.',
  };
}

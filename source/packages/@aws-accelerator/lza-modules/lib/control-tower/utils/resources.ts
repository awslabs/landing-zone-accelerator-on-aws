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

import { PolicyStatementType } from '@aws-accelerator/utils';
import { LandingZoneDriftStatus } from '@aws-sdk/client-controltower';

/**
 * AWS Organization Root config type
 */
export type OrganizationRootType = {
  Name: string;
  Id: string;
};

/**
 * Policy Document
 */
export type PolicyDocument = {
  Version: string;
  Id?: string;
  Statement: PolicyStatementType[];
};

export type LandingZoneUpdateOrResetRequiredType = {
  updateRequired: boolean;
  targetVersion: string;
  resetRequired: boolean;
  reason: string;
};

/**
 * ControlTowerLandingZoneProps
 */
export interface ControlTowerLandingZoneConfigType {
  /**
   * AWS Control Tower Landing Zone version, this must be latest version for creating any new AWS Control Tower Landing Zone
   *
   * @remarks
   * AWS Control Tower Landing Zone version value must be latest version of the AWS Control Tower Landing Zone.
   * You can refer [AWS Control Tower release notes](https://docs.aws.amazon.com/controltower/latest/userguide/release-notes.html) for more information.
   */
  readonly version: string;
  /**
   * List of AWS Regions governed by the AWS Control Tower Landing Zone
   */
  readonly governedRegions: string[];
  /**
   * Log archive AWS account ID
   */
  readonly logArchiveAccountId: string;
  /**
   * Audit AWS account ID
   */
  readonly auditAccountId: string;
  /**
   * Flag indicating weather AWS Control Tower sets up AWS account access with IAM Identity Center or not
   */
  readonly enableIdentityCenterAccess: boolean;
  /**
   * AWS Control Tower Landing Zone central logging bucket retention in days
   */
  readonly loggingBucketRetentionDays: number;
  /**
   * AWS Control Tower Landing Zone access logging bucket retention in days
   */
  readonly accessLoggingBucketRetentionDays: number;
  /**
   * Flag indicating Organization level CloudTrail is enable or not.
   */
  readonly enableOrganizationTrail: boolean;
}

/**
 * AWS Control Tower Landing Zone details type.
 */
export type ControlTowerLandingZoneDetailsType = {
  /**
   * AWS Control Tower Landing Zone identifier
   *
   * @remarks
   * AWS Control Tower Landing Zone arn
   *
   * @remarks
   * AWS Control Tower Landing Zone arn
   */
  landingZoneIdentifier: string;
  /**
   *  AWS Control Tower Landing Zone deployment status.
   *
   * @remarks
   * ACTIVE or FAILED or PROCESSING
   */
  status?: string;
  /**
   *  AWS Control Tower Landing Zone version
   */
  version?: string;
  /**
   *  The latest available version of AWS Control Tower Landing Zone.
   */
  latestAvailableVersion?: string;
  /**
   * The drift status of AWS Control Tower Landing Zone.
   *
   * @remarks
   * DRIFTED or IN_SYNC
   */
  driftStatus?: string;
  /**
   * List of AWS Regions governed by AWS Control Tower Landing Zone
   */
  governedRegions?: string[];
  /**
   * The name of Security organization unit (OU)
   */
  securityOuName?: string;
  /**
   * The name of Sandbox organization unit (OU)
   */
  sandboxOuName?: string;
  /**
   * Flag indicating weather AWS Control Tower sets up AWS account access with IAM Identity Center or not
   */
  enableIdentityCenterAccess?: boolean;
  /**
   * AWS Control Tower Landing Zone central logging bucket retention in days
   */
  loggingBucketRetentionDays?: number;
  /**
   * AWS Control Tower Landing Zone access logging bucket retention in days
   */
  accessLoggingBucketRetentionDays?: number;
  /**
   * AWS KMS CMK arn to encrypt AWS Control Tower Landing Zone resources
   */
  kmsKeyArn?: string;
};

/**
 * Function to make manifest document for CT API
 * @param landingZoneConfiguration ${@link LandingZoneConfigType}
 * @param event string 'CREATE' | 'UPDATE'
 * @param securityOuName string
 * @param kmsKeyArn string | undefined
 * @param sandboxOuName string | undefined
 * @returns
 */
export function makeManifestDocument(
  landingZoneConfiguration: ControlTowerLandingZoneConfigType,
  event: 'CREATE' | 'UPDATE',
  securityOuName: string,
  kmsKeyArn?: string,
  sandboxOuName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let organizationStructure = {};

  if (event === 'CREATE') {
    organizationStructure = {
      security: {
        name: securityOuName,
      },
      sandbox: {
        name: 'Infrastructure',
      },
    };
  }

  if (event === 'UPDATE') {
    if (sandboxOuName) {
      organizationStructure = {
        security: {
          name: securityOuName,
        },
        sandbox: {
          name: sandboxOuName,
        },
      };
    } else {
      organizationStructure = {
        security: {
          name: securityOuName,
        },
      };
    }
  }
  const manifestJsonDocument = {
    governedRegions: landingZoneConfiguration.governedRegions,
    organizationStructure,
    centralizedLogging: {
      accountId: landingZoneConfiguration.logArchiveAccountId,
      configurations: {
        loggingBucket: {
          retentionDays: landingZoneConfiguration.loggingBucketRetentionDays,
        },
        accessLoggingBucket: {
          retentionDays: landingZoneConfiguration.accessLoggingBucketRetentionDays,
        },
        kmsKeyArn,
      },
      enabled: landingZoneConfiguration.enableOrganizationTrail,
    },
    securityRoles: {
      accountId: landingZoneConfiguration.auditAccountId,
    },
    accessManagement: {
      enabled: landingZoneConfiguration.enableIdentityCenterAccess,
    },
  };

  return manifestJsonDocument;
}

/**
 * This function compares the AWS Region list from configuration with the existing AWS Control Tower Landing Zone govern region list
 * @param existingRegions string[]
 * @param configRegions string[]
 * @returns status boolean
 */
export function isGovernedRegionsChanged(existingRegions: string[], configRegions: string[]): boolean {
  return !(
    existingRegions.length === configRegions.length && existingRegions.every(region => configRegions.includes(region))
  );
}

/**
 * Function to validate AWS Control Tower Landing Zone organization version provided in global config file is latest version
 * @param configVersion string
 * @param latestVersion string
 * @param reason string | undefined
 * @param operationType string | undefined
 */
function validateLandingZoneVersion(
  configVersion: string,
  latestVersion: string,
  reason?: string,
  operationType?: string,
): void {
  if (latestVersion !== configVersion) {
    if (reason && operationType) {
      throw new Error(
        `It is necessary to ${operationType} the AWS Control Tower Landing Zone because "${reason}". AWS Control Tower Landing Zone's most recent version is ${latestVersion}, which is different from the version ${configVersion} specified in global-config.yaml file. AWS Control Tower Landing Zone can be ${
          operationType === 'update' ? 'updated' : operationType
        } when you specify the latest version in the configuration.`,
      );
    } else {
      throw new Error(
        `AWS Control Tower Landing Zone's most recent version is ${latestVersion}, which is different from the version ${configVersion} specified in global-config.yaml file, execution terminated.`,
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
export function isLandingZoneUpdateOrResetRequired(
  landingZoneConfiguration: ControlTowerLandingZoneConfigType,
  landingZoneDetails: ControlTowerLandingZoneDetailsType,
): LandingZoneUpdateOrResetRequiredType {
  // validate landing zone version listed in global config
  validateLandingZoneVersion(landingZoneConfiguration.version, landingZoneDetails.latestAvailableVersion!);

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
    landingZoneDetails.accessLoggingBucketRetentionDays !== landingZoneConfiguration.accessLoggingBucketRetentionDays
  ) {
    reasons.push(
      `Changes made in AccessLoggingBucketRetentionDays from ${landingZoneDetails.accessLoggingBucketRetentionDays} to ${landingZoneConfiguration.accessLoggingBucketRetentionDays}`,
    );
  }
  if (landingZoneDetails.loggingBucketRetentionDays !== landingZoneConfiguration.loggingBucketRetentionDays) {
    reasons.push(
      `Changes made in LoggingBucketRetentionDays from ${landingZoneDetails.loggingBucketRetentionDays} to ${landingZoneConfiguration.loggingBucketRetentionDays}`,
    );
  }
  if (landingZoneDetails.enableIdentityCenterAccess !== landingZoneConfiguration.enableIdentityCenterAccess) {
    reasons.push(
      `Changes made in EnableIdentityCenterAccess from ${landingZoneDetails.enableIdentityCenterAccess} to ${landingZoneConfiguration.enableIdentityCenterAccess}`,
    );
  }

  if (isGovernedRegionsChanged(landingZoneDetails.governedRegions ?? [], landingZoneConfiguration.governedRegions)) {
    reasons.push(
      `Changes made in governed regions from [${landingZoneDetails.governedRegions?.join(
        ',',
      )}] to [${landingZoneConfiguration.governedRegions.join(',')}]`,
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

/**
 * Function to sleep process
 * @param ms
 * @returns
 */
export function delay(minutes: number) {
  return new Promise(resolve => setTimeout(resolve, minutes * 60000));
}

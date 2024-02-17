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
 * @param sandboxOuName string
 * @returns
 */
export function makeManifestDocument(
  landingZoneConfiguration: ControlTowerLandingZoneConfigType,
  event: 'CREATE' | 'UPDATE',
  kmsKeyArn?: string,
  sandboxOuName?: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let organizationStructure = {};

  if (event === 'CREATE') {
    organizationStructure = {
      security: {
        name: 'Security',
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
          name: 'Security',
        },
        sandbox: {
          name: sandboxOuName,
        },
      };
    } else {
      organizationStructure = {
        security: {
          name: 'Security',
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
 * @param existingRegions
 * @param configRegions
 * @returns
 */
export function compareGovernedRegions(existingRegions: string[], configRegions: string[]): boolean {
  return (
    existingRegions.length === configRegions.length && existingRegions.every(region => configRegions.includes(region))
  );
}

/**
 * Function to validate AWS Control Tower Landing Zone organization version provided in global config file is latest version
 * @param configVersion string
 * @param latestVersion string
 * @param currentVersion string
 * @param reason string
 * @param operationType string
 */
function validateLandingZoneVersion(
  configVersion: string,
  latestVersion: string,
  currentVersion: string,
  reason: string,
  operationType: string,
): void {
  if (latestVersion !== currentVersion) {
    throw new Error(
      `It is necessary to ${operationType} the AWS Control Tower Landing Zone because "${reason}". AWS Control Tower Landing Zone's most recent version is ${latestVersion}, which is different from the version ${configVersion} specified in global-config.yaml file. AWS Control Tower Landing Zone can be ${
        operationType === 'update' ? 'updated' : operationType
      } when you specify the latest version in the configuration.`,
    );
  }
  if (currentVersion !== configVersion) {
    throw new Error(
      `It is necessary to ${operationType} the AWS Control Tower Landing Zone because "${reason}". AWS Control Tower Landing Zone's current version is ${currentVersion}, which is different from the version ${configVersion} specified in global-config.yaml file. AWS Control Tower Landing Zone can be ${
        operationType === 'update' ? 'updated' : operationType
      } when you specify the current version in the configuration.`,
    );
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
  // When Landing Zone version specified in global-config.yaml differs from current AWS Control Tower  Landing Zone version
  if (landingZoneDetails.version !== landingZoneConfiguration.version) {
    validateLandingZoneVersion(
      landingZoneConfiguration.version,
      landingZoneDetails.latestAvailableVersion!,
      landingZoneDetails.version!,
      'Landing Zone version specified in global-config.yaml file differs from existing AWS Control Tower Landing Zone version.',
      'update',
    );
  }

  // Changes in the AWS Control Tower Landing Zone configuration force an update of the AWS Control Tower Landing Zone, which will update the AWS Control Tower Landing Zone to the latest version if it is available
  const changeInAccessLoggingBucketRetentionDays =
    landingZoneDetails.accessLoggingBucketRetentionDays !== landingZoneConfiguration.accessLoggingBucketRetentionDays;
  const changeInLoggingBucketRetentionDays =
    landingZoneDetails.loggingBucketRetentionDays !== landingZoneConfiguration.loggingBucketRetentionDays;
  const changeInEnableIdentityCenterAccess =
    landingZoneDetails.enableIdentityCenterAccess !== landingZoneConfiguration.enableIdentityCenterAccess;
  const changeInGovernedRegions = !compareGovernedRegions(
    landingZoneDetails.governedRegions ?? [],
    landingZoneConfiguration.governedRegions,
  );
  if (
    changeInAccessLoggingBucketRetentionDays ||
    changeInLoggingBucketRetentionDays ||
    changeInEnableIdentityCenterAccess ||
    changeInGovernedRegions
  ) {
    const reasons: string[] = [];
    if (changeInAccessLoggingBucketRetentionDays) {
      reasons.push(
        `Changes made in AccessLoggingBucketRetentionDays from ${landingZoneDetails.accessLoggingBucketRetentionDays} to ${landingZoneConfiguration.accessLoggingBucketRetentionDays}`,
      );
    }
    if (changeInLoggingBucketRetentionDays) {
      reasons.push(
        `Changes made in LoggingBucketRetentionDays from ${landingZoneDetails.loggingBucketRetentionDays} to ${landingZoneConfiguration.loggingBucketRetentionDays}`,
      );
    }
    if (changeInEnableIdentityCenterAccess) {
      reasons.push(
        `Changes made in EnableIdentityCenterAccess from ${landingZoneDetails.enableIdentityCenterAccess} to ${landingZoneConfiguration.enableIdentityCenterAccess}`,
      );
    }
    if (changeInGovernedRegions) {
      reasons.push(
        `Changes made in EnableIdentityCenterAccess from [${landingZoneDetails.governedRegions?.join(
          ',',
        )}] to [${landingZoneConfiguration.governedRegions.join(',')}]`,
      );
    }

    validateLandingZoneVersion(
      landingZoneConfiguration.version,
      landingZoneDetails.latestAvailableVersion!,
      landingZoneDetails.version!,
      reasons.join('. '),
      'update',
    );

    return {
      updateRequired: true,
      targetVersion: landingZoneDetails.latestAvailableVersion!,
      resetRequired: false,
      reason: `The configuration of the Landing Zone has been modified. ${reasons.join('. ')}`,
    };
  }

  // Reset the AWS Control Tower Landing Zone if it has drifted
  if (landingZoneDetails.driftStatus === LandingZoneDriftStatus.DRIFTED) {
    const reason = 'The Landing Zone has drifted';
    validateLandingZoneVersion(
      landingZoneConfiguration.version,
      landingZoneDetails.latestAvailableVersion!,
      landingZoneDetails.version!,
      reason,
      'update',
    );
    return {
      updateRequired: false,
      targetVersion: landingZoneDetails.latestAvailableVersion!,
      resetRequired: true,
      reason,
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

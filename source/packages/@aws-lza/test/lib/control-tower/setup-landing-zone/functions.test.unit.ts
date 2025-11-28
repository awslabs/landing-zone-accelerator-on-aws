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
import { describe, expect, test } from 'vitest';
import {
  ControlTowerLandingZoneConfigType,
  ControlTowerLandingZoneDetailsType,
} from '../../../../lib/control-tower/setup-landing-zone/resources';
import {
  makeManifestDocument,
  governedRegionsChanged,
  validateLandingZoneVersion,
  landingZoneUpdateOrResetRequired,
} from '../../../../lib/control-tower/setup-landing-zone/functions';

describe('resources utility functions', () => {
  const mockLandingZoneConfig: ControlTowerLandingZoneConfigType = {
    version: '4.0',
    governedRegions: ['mockRegion1', 'mockRegion2'],
    logArchiveAccountId: '111122223333',
    auditAccountId: '444455556666',
    enableIdentityCenterAccess: true,
    loggingBucketRetentionDays: 30,
    accessLoggingBucketRetentionDays: 30,
    enableOrganizationTrail: true,
  };

  describe('makeManifestDocument', () => {
    test('should create manifest for CREATE event', () => {
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/67890',
      };

      const result = makeManifestDocument(mockLandingZoneConfig, 'CREATE', kmsKeyArns);

      expect(result).toEqual({
        accessManagement: {
          enabled: mockLandingZoneConfig.enableIdentityCenterAccess,
        },
        centralizedLogging: {
          accountId: mockLandingZoneConfig.logArchiveAccountId,
          configurations: {
            loggingBucket: {
              retentionDays: mockLandingZoneConfig.loggingBucketRetentionDays,
            },
            accessLoggingBucket: {
              retentionDays: mockLandingZoneConfig.accessLoggingBucketRetentionDays,
            },
            kmsKeyArn: kmsKeyArns.centralizedLoggingKeyArn,
          },
          enabled: mockLandingZoneConfig.enableOrganizationTrail,
        },
        config: {
          accountId: mockLandingZoneConfig.auditAccountId,
          configurations: {
            loggingBucket: {
              retentionDays: mockLandingZoneConfig.loggingBucketRetentionDays,
            },
            accessLoggingBucket: {
              retentionDays: mockLandingZoneConfig.accessLoggingBucketRetentionDays,
            },
            kmsKeyArn: kmsKeyArns.configLoggingKeyArn,
          },
          enabled: true,
        },
        governedRegions: mockLandingZoneConfig.governedRegions,
        backup: {
          enabled: false,
        },
        securityRoles: {
          enabled: true,
          accountId: mockLandingZoneConfig.auditAccountId,
        },
      });
    });

    test('should create manifest for UPDATE event with existing manifest', () => {
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/67890',
      };
      const existingManifest = {
        governedRegions: ['mockRegion1', 'mockRegion1'],
        accessManagement: { enabled: true },
        organizationStructure: {
          security: { name: 'mockSecurityOuName' },
          sandbox: { name: 'mockSandboxOuName' },
        },
        centralizedLogging: {
          configurations: {
            loggingBucket: { retentionDays: 365 },
            accessLoggingBucket: { retentionDays: 365 },
            kmsKeyArn: 'mockKmsKeyArn',
          },
        },
        securityRoles: {
          accountId: '444455556666',
          enabled: false,
        },
      };

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', kmsKeyArns, existingManifest);

      expect(result.organizationStructure).toBeUndefined();
    });

    test('should preserve minimal V4 manifest without changes', () => {
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/67890',
      };
      const existingManifest = {
        accessManagement: {
          enabled: true,
        },
        centralizedLogging: {
          accountId: '111122223333',
          configurations: {
            loggingBucket: {
              retentionDays: 30,
            },
            accessLoggingBucket: {
              retentionDays: 30,
            },
            kmsKeyArn: 'arn:aws:kms:region:account:key/12345',
          },
          enabled: true,
        },
        config: {
          accountId: '444455556666',
          configurations: {
            loggingBucket: {
              retentionDays: 30,
            },
            accessLoggingBucket: {
              retentionDays: 30,
            },
            kmsKeyArn: 'arn:aws:kms:region:account:key/67890',
          },
          enabled: true,
        },
        governedRegions: ['mockRegion1', 'mockRegion2'],
        securityRoles: {
          enabled: true,
          accountId: '444455556666',
        },
      };

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', kmsKeyArns, existingManifest);

      expect(result).toEqual({
        accessManagement: {
          enabled: mockLandingZoneConfig.enableIdentityCenterAccess,
        },
        centralizedLogging: {
          accountId: mockLandingZoneConfig.logArchiveAccountId,
          configurations: {
            loggingBucket: {
              retentionDays: mockLandingZoneConfig.loggingBucketRetentionDays,
            },
            accessLoggingBucket: {
              retentionDays: mockLandingZoneConfig.accessLoggingBucketRetentionDays,
            },
            kmsKeyArn: kmsKeyArns.centralizedLoggingKeyArn,
          },
          enabled: mockLandingZoneConfig.enableOrganizationTrail,
        },
        config: {
          accountId: mockLandingZoneConfig.auditAccountId,
          configurations: {
            loggingBucket: {
              retentionDays: mockLandingZoneConfig.loggingBucketRetentionDays,
            },
            accessLoggingBucket: {
              retentionDays: mockLandingZoneConfig.accessLoggingBucketRetentionDays,
            },
            kmsKeyArn: kmsKeyArns.configLoggingKeyArn,
          },
          enabled: true,
        },
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityRoles: {
          enabled: true,
          accountId: mockLandingZoneConfig.auditAccountId,
        },
      });
    });

    test('should preserve backup and securityRoles config in existing V4 manifest', () => {
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/67890',
      };
      const existingManifest = {
        accessManagement: {
          enabled: false,
        },
        centralizedLogging: {
          accountId: '111122223333',
          configurations: {
            loggingBucket: {
              retentionDays: 365,
            },
            accessLoggingBucket: {
              retentionDays: 365,
            },
            kmsKeyArn: 'arn:aws:kms:region:account:key/old-key',
          },
          enabled: false,
        },
        config: {
          accountId: '444455556666',
          configurations: {
            loggingBucket: {
              retentionDays: 365,
            },
            accessLoggingBucket: {
              retentionDays: 365,
            },
            kmsKeyArn: 'arn:aws:kms:region:account:key/old-config-key',
          },
          enabled: true,
        },
        governedRegions: ['mockRegion1'],
        backup: {
          enabled: true,
        },
        securityRoles: {
          enabled: true,
        },
      };

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', kmsKeyArns, existingManifest);

      expect(result.backup).toEqual({ enabled: true });
      expect(result.securityRoles).toEqual({ enabled: true, accountId: mockLandingZoneConfig.auditAccountId });
      expect(result.accessManagement.enabled).toBe(mockLandingZoneConfig.enableIdentityCenterAccess);
      expect(result.centralizedLogging.accountId).toBe(mockLandingZoneConfig.logArchiveAccountId);
      expect(result.config.accountId).toBe(mockLandingZoneConfig.auditAccountId);
      expect(result.governedRegions).toEqual(mockLandingZoneConfig.governedRegions);
    });

    test('should create new V4 manifest from existing V3.3 manifest', () => {
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/67890',
      };
      const existingV33Manifest = {
        governedRegions: ['mockRegion1'],
        organizationStructure: {
          security: { name: 'Security' },
          sandbox: { name: 'Sandbox' },
        },
        centralizedLogging: {
          accountId: '111122223333',
          configurations: {
            loggingBucket: {
              retentionDays: 365,
            },
            accessLoggingBucket: {
              retentionDays: 365,
            },
          },
          enabled: true,
        },
        securityRoles: {
          accountId: '444455556666',
        },
        accessManagement: {
          enabled: false,
        },
      };

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', kmsKeyArns, existingV33Manifest);

      expect(result.organizationStructure).toBeUndefined();
      expect(result).toEqual({
        accessManagement: {
          enabled: mockLandingZoneConfig.enableIdentityCenterAccess,
        },
        centralizedLogging: {
          accountId: mockLandingZoneConfig.logArchiveAccountId,
          configurations: {
            loggingBucket: {
              retentionDays: mockLandingZoneConfig.loggingBucketRetentionDays,
            },
            accessLoggingBucket: {
              retentionDays: mockLandingZoneConfig.accessLoggingBucketRetentionDays,
            },
            kmsKeyArn: kmsKeyArns.centralizedLoggingKeyArn,
          },
          enabled: mockLandingZoneConfig.enableOrganizationTrail,
        },
        config: {
          accountId: mockLandingZoneConfig.auditAccountId,
          configurations: {
            loggingBucket: {
              retentionDays: mockLandingZoneConfig.loggingBucketRetentionDays,
            },
            accessLoggingBucket: {
              retentionDays: mockLandingZoneConfig.accessLoggingBucketRetentionDays,
            },
            kmsKeyArn: kmsKeyArns.configLoggingKeyArn,
          },
          enabled: true,
        },
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityRoles: {
          accountId: mockLandingZoneConfig.auditAccountId,
          enabled: true,
        },
      });
    });
  });

  describe('governedRegionsChanged', () => {
    test('should return true when region lists have different lengths', () => {
      const existing = ['us-east-1', 'us-west-2'];
      const config = ['us-east-1'];

      expect(governedRegionsChanged(existing, config)).toBe(true);
    });

    test('should return true when region lists have different regions', () => {
      const existing = ['us-east-1', 'us-west-2'];
      const config = ['us-east-1', 'eu-west-1'];

      expect(governedRegionsChanged(existing, config)).toBe(true);
    });

    test('should return false when region lists are identical', () => {
      const existing = ['us-east-1', 'us-west-2'];
      const config = ['us-east-1', 'us-west-2'];

      expect(governedRegionsChanged(existing, config)).toBe(false);
    });

    test('should return false when regions are same but in different order', () => {
      const existing = ['us-east-1', 'us-west-2'];
      const config = ['us-west-2', 'us-east-1'];

      expect(governedRegionsChanged(existing, config)).toBe(false);
    });
  });

  describe('validateLandingZoneVersion', () => {
    test('should not throw error when versions match', () => {
      const configVersion = '3.0';
      const latestVersion = '3.0';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion);
      }).not.toThrow();
    });

    test('should throw error when versions do not match and no reason/operationType provided', () => {
      const configVersion = '2.9';
      const latestVersion = '3.0';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion);
      }).toThrow(
        "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version 2.9 provided, execution terminated.",
      );
    });

    test('should throw error with custom message when versions do not match and reason/operationType provided', () => {
      const configVersion = '2.9';
      const latestVersion = '3.0';
      const reason = 'new features available';
      const operationType = 'update';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion, reason, operationType);
      }).toThrow(
        'It is necessary to update the AWS Control Tower Landing Zone because "new features available". ' +
          "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version 2.9 provided. " +
          'AWS Control Tower Landing Zone can be updated when you specify the latest version in the configuration.',
      );
    });

    test('should handle non-update operationType correctly', () => {
      const configVersion = '2.9';
      const latestVersion = '3.0';
      const reason = 'configuration drift detected';
      const operationType = 'reset';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion, reason, operationType);
      }).toThrow(
        'It is necessary to reset the AWS Control Tower Landing Zone because "configuration drift detected". ' +
          "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version 2.9 provided. " +
          'AWS Control Tower Landing Zone can be reset when you specify the latest version in the configuration.',
      );
    });

    test('should handle empty strings correctly', () => {
      const configVersion = '';
      const latestVersion = '3.0';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion);
      }).toThrow(
        "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version  provided, execution terminated.",
      );
    });

    test('should handle different version formats', () => {
      const configVersion = '3.0.0';
      const latestVersion = '3.0';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion);
      }).toThrow(
        "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version 3.0.0 provided, execution terminated.",
      );
    });

    test('should handle reason without operationType', () => {
      const configVersion = '2.9';
      const latestVersion = '3.0';
      const reason = 'new features available';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion, reason);
      }).toThrow(
        "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version 2.9 provided, execution terminated.",
      );
    });

    test('should handle operationType without reason', () => {
      const configVersion = '2.9';
      const latestVersion = '3.0';
      const operationType = 'update';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion, undefined, operationType);
      }).toThrow(
        "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version 2.9 provided, execution terminated.",
      );
    });
  });

  describe('landingZoneUpdateOrResetRequired', () => {
    test('should return false when landing zone update is not required', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockConfigKmsKeyArn',
        },
      };

      // Execute
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Verify
      expect(result).toEqual({
        updateRequired: false,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: false,
        reason: 'There were no changes found to update or reset the Landing Zone.',
      });
    });

    test('should return true when landing zone reset is required', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'DRIFTED',
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          loggingBucketRetentionDays: 90,
          accessLoggingBucketRetentionDays: 90,
          kmsKeyArn: 'mockKmsKeyArn',
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: false,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: true,
        reason: 'The Landing Zone has drifted or failed, resetting',
      });
    });

    test('should return true when landing zone update is required', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: [...mockLandingZoneConfig.governedRegions, 'mockRegion3'],
        securityOuName: 'Security',
        enableIdentityCenterAccess: false,
        centralizedLoggingConfig: {
          loggingBucketRetentionDays: 90,
          accessLoggingBucketRetentionDays: 90,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          loggingBucketRetentionDays: 90,
          accessLoggingBucketRetentionDays: 90,
          kmsKeyArn: 'mockConfigKmsKeyArn',
        },
      };
      const reasons: string[] = [
        `Changes made in Centralized Logging AccessLoggingBucketRetentionDays from ${mockLandingZoneDetails.centralizedLoggingConfig?.accessLoggingBucketRetentionDays} to ${mockLandingZoneConfig.accessLoggingBucketRetentionDays}`,
        `Changes made in Centralized Logging LoggingBucketRetentionDays from ${mockLandingZoneDetails.centralizedLoggingConfig?.loggingBucketRetentionDays} to ${mockLandingZoneConfig.loggingBucketRetentionDays}`,
        `Changes made in Config AccessLoggingBucketRetentionDays from ${mockLandingZoneDetails.configHubConfig?.accessLoggingBucketRetentionDays} to ${mockLandingZoneConfig.accessLoggingBucketRetentionDays}`,
        `Changes made in Config LoggingBucketRetentionDays from ${mockLandingZoneDetails.configHubConfig?.loggingBucketRetentionDays} to ${mockLandingZoneConfig.loggingBucketRetentionDays}`,
        `Changes made in EnableIdentityCenterAccess from ${mockLandingZoneDetails.enableIdentityCenterAccess} to ${mockLandingZoneConfig.enableIdentityCenterAccess}`,
        `Changes made in governed regions from [${mockLandingZoneDetails.governedRegions?.join(
          ',',
        )}] to [${mockLandingZoneConfig.governedRegions.join(',')}]`,
      ];

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: true,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: false,
        reason: `${reasons.join('. ')}`,
      });
    });

    test('should return true when landing zone update is required for undefined governedRegions', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockConfigKmsKeyArn',
        },
      };
      const reasons: string[] = [
        `Changes made in governed regions from [${mockLandingZoneDetails.governedRegions?.join(
          ',',
        )}] to [${mockLandingZoneConfig.governedRegions.join(',')}]`,
      ];

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: true,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: false,
        reason: `${reasons.join('. ')}`,
      });
    });

    test('should detect changes in configHubConfig retention days', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          loggingBucketRetentionDays: 60,
          accessLoggingBucketRetentionDays: 60,
          kmsKeyArn: 'mockConfigKmsKeyArn',
        },
      };
      const reasons: string[] = [
        `Changes made in Config AccessLoggingBucketRetentionDays from 60 to 30`,
        `Changes made in Config LoggingBucketRetentionDays from 60 to 30`,
      ];

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: true,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: false,
        reason: `${reasons.join('. ')}`,
      });
    });

    test('should detect changes in centralizedLoggingConfig only', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          loggingBucketRetentionDays: 60,
          accessLoggingBucketRetentionDays: 60,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockConfigKmsKeyArn',
        },
      };
      const reasons: string[] = [
        `Changes made in Centralized Logging AccessLoggingBucketRetentionDays from 60 to 30`,
        `Changes made in Centralized Logging LoggingBucketRetentionDays from 60 to 30`,
      ];

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: true,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: false,
        reason: `${reasons.join('. ')}`,
      });
    });

    test('should not detect changes when both configs match', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockConfigKmsKeyArn',
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: false,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: false,
        reason: 'There were no changes found to update or reset the Landing Zone.',
      });
    });
  });
});

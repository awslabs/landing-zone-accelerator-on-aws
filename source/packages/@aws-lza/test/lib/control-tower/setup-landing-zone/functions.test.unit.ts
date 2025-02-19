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
import { describe, expect, test } from '@jest/globals';
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
    version: '3.0',
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
      const securityOuName = 'Security';
      const kmsKeyArn = 'arn:aws:kms:region:account:key/12345';

      const result = makeManifestDocument(mockLandingZoneConfig, 'CREATE', securityOuName, kmsKeyArn);

      expect(result).toEqual({
        governedRegions: mockLandingZoneConfig.governedRegions,
        organizationStructure: {
          security: {
            name: 'Security',
          },
          sandbox: {
            name: 'Infrastructure',
          },
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
            kmsKeyArn,
          },
          enabled: mockLandingZoneConfig.enableOrganizationTrail,
        },
        securityRoles: {
          accountId: mockLandingZoneConfig.auditAccountId,
        },
        accessManagement: {
          enabled: mockLandingZoneConfig.enableIdentityCenterAccess,
        },
      });
    });

    test('should create manifest for UPDATE event with sandboxOuName', () => {
      const securityOuName = 'Security';
      const sandboxOuName = 'Sandbox';
      const kmsKeyArn = 'arn:aws:kms:region:account:key/12345';

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', securityOuName, kmsKeyArn, sandboxOuName);

      expect(result.organizationStructure).toEqual({
        security: {
          name: 'Security',
        },
        sandbox: {
          name: 'Sandbox',
        },
      });
    });

    test('should create manifest for UPDATE event without sandboxOuName', () => {
      const securityOuName = 'Security';
      const kmsKeyArn = 'arn:aws:kms:region:account:key/12345';

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', securityOuName, kmsKeyArn);

      expect(result.organizationStructure).toEqual({
        security: {
          name: 'Security',
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
        version: '3.0',
        latestAvailableVersion: '3.0',
        driftStatus: 'IN_SYNC',
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        loggingBucketRetentionDays: 30,
        accessLoggingBucketRetentionDays: 30,
        kmsKeyArn: 'mockKmsKeyArn',
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
        version: '3.0',
        latestAvailableVersion: '3.0',
        driftStatus: 'DRIFTED',
        governedRegions: mockLandingZoneConfig.governedRegions,
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        loggingBucketRetentionDays: 90,
        accessLoggingBucketRetentionDays: 90,
        kmsKeyArn: 'mockKmsKeyArn',
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: false,
        targetVersion: mockLandingZoneDetails.version,
        resetRequired: true,
        reason: 'The Landing Zone has drifted',
      });
    });

    test('should return true when landing zone update is required', () => {
      // Setup
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '3.0',
        latestAvailableVersion: '3.0',
        driftStatus: 'IN_SYNC',
        governedRegions: [...mockLandingZoneConfig.governedRegions, 'mockRegion3'],
        securityOuName: 'Security',
        enableIdentityCenterAccess: false,
        loggingBucketRetentionDays: 90,
        accessLoggingBucketRetentionDays: 90,
        kmsKeyArn: 'mockKmsKeyArn',
      };
      const reasons: string[] = [
        `Changes made in AccessLoggingBucketRetentionDays from ${mockLandingZoneDetails.accessLoggingBucketRetentionDays} to ${mockLandingZoneConfig.accessLoggingBucketRetentionDays}`,
        `Changes made in LoggingBucketRetentionDays from ${mockLandingZoneDetails.loggingBucketRetentionDays} to ${mockLandingZoneConfig.loggingBucketRetentionDays}`,
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
        version: '3.0',
        latestAvailableVersion: '3.0',
        driftStatus: 'IN_SYNC',
        securityOuName: 'Security',
        enableIdentityCenterAccess: true,
        loggingBucketRetentionDays: 30,
        accessLoggingBucketRetentionDays: 30,
        kmsKeyArn: 'mockKmsKeyArn',
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
  });
});

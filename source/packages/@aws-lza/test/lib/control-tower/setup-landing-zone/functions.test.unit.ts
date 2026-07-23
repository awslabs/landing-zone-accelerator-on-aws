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
  supportsInPlaceOperation,
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

    test('should reuse the deployed manifest verbatim for in-place UPDATE, overlaying only managed fields', () => {
      // Setup - deployed 3.3 manifest, as returned by GetLandingZone
      const pinnedConfig: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        version: '3.3',
        governedRegions: ['mockRegion1'],
      };
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
      };
      const existingV33Manifest = {
        accessManagement: {
          enabled: true,
        },
        securityRoles: {
          accountId: '444455556666',
        },
        backup: {
          enabled: false,
        },
        governedRegions: ['mockRegion1', 'mockRegion2'],
        organizationStructure: {
          sandbox: { name: 'Sandbox' },
          security: { name: 'Security' },
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
        futureUnmodeledField: {
          nested: 'value',
        },
      };

      // Act
      const result = makeManifestDocument(pinnedConfig, 'UPDATE', kmsKeyArns, existingV33Manifest, true);

      // Assert - only managed fields are overlaid; everything else passes through untouched
      expect(result.governedRegions).toEqual(['mockRegion1']);
      expect(result.accessManagement).toEqual({ enabled: pinnedConfig.enableIdentityCenterAccess });
      expect(result.centralizedLogging).toEqual({
        accountId: '111122223333',
        configurations: {
          loggingBucket: {
            retentionDays: pinnedConfig.loggingBucketRetentionDays,
          },
          accessLoggingBucket: {
            retentionDays: pinnedConfig.accessLoggingBucketRetentionDays,
          },
          kmsKeyArn: 'arn:aws:kms:region:account:key/12345',
        },
        enabled: pinnedConfig.enableOrganizationTrail,
      });
      expect(result.config).toBeUndefined();
      expect(result.securityRoles).toEqual({ accountId: '444455556666' });
      expect(result.organizationStructure).toEqual({
        sandbox: { name: 'Sandbox' },
        security: { name: 'Security' },
      });
      expect(result.backup).toEqual({ enabled: false });
      expect(result.futureUnmodeledField).toEqual({ nested: 'value' });
      // Source manifest must not be mutated
      expect(existingV33Manifest.governedRegions).toEqual(['mockRegion1', 'mockRegion2']);
      expect(existingV33Manifest.organizationStructure).toBeDefined();
    });

    test('should overlay config retention days for in-place UPDATE on a 4.0 landing zone', () => {
      const pinnedConfig: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        loggingBucketRetentionDays: 400,
        accessLoggingBucketRetentionDays: 400,
      };
      const existingV4Manifest = {
        accessManagement: { enabled: true },
        securityRoles: { accountId: '444455556666', enabled: true },
        governedRegions: ['mockRegion1', 'mockRegion2'],
        centralizedLogging: {
          accountId: '111122223333',
          configurations: {
            loggingBucket: { retentionDays: 30 },
            accessLoggingBucket: { retentionDays: 30 },
            kmsKeyArn: 'arn:aws:kms:region:account:key/12345',
          },
          enabled: true,
        },
        config: {
          accountId: '444455556666',
          configurations: {
            loggingBucket: { retentionDays: 30 },
            accessLoggingBucket: { retentionDays: 30 },
            kmsKeyArn: 'arn:aws:kms:region:account:key/67890',
          },
          enabled: true,
        },
      };

      const result = makeManifestDocument(pinnedConfig, 'UPDATE', undefined, existingV4Manifest, true);

      expect(result.config).toEqual({
        accountId: '444455556666',
        configurations: {
          loggingBucket: { retentionDays: 400 },
          accessLoggingBucket: { retentionDays: 400 },
          kmsKeyArn: 'arn:aws:kms:region:account:key/67890',
        },
        enabled: true,
      });
      expect(result.centralizedLogging.configurations.loggingBucket.retentionDays).toBe(400);
      expect(result.securityRoles).toEqual({ accountId: '444455556666', enabled: true });
    });

    test('should preserve disabled config and skip trail retention overlay for in-place UPDATE', () => {
      const configWithTrailDisabled: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        enableOrganizationTrail: false,
      };
      const existingV4Manifest = {
        accessManagement: { enabled: true },
        securityRoles: { accountId: '444455556666', enabled: true },
        governedRegions: mockLandingZoneConfig.governedRegions,
        centralizedLogging: {
          accountId: '111122223333',
          enabled: false,
        },
        config: {
          enabled: false,
        },
      };

      const result = makeManifestDocument(configWithTrailDisabled, 'UPDATE', undefined, existingV4Manifest, true);

      // Disabled centralized logging has no configurations block; overlay must not invent one
      expect(result.centralizedLogging).toEqual({
        accountId: '111122223333',
        enabled: false,
      });
      expect(result.config).toEqual({ enabled: false });
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

    test('should return false when config has duplicate regions matching existing set', () => {
      const existing = ['eu-central-1'];
      const config = ['eu-central-1', 'eu-central-1'];

      expect(governedRegionsChanged(existing, config)).toBe(false);
    });

    test('should return false when existing has duplicate regions matching config set', () => {
      const existing = ['eu-central-1', 'eu-central-1'];
      const config = ['eu-central-1'];

      expect(governedRegionsChanged(existing, config)).toBe(false);
    });
  });

  describe('supportsInPlaceOperation', () => {
    test('should return true at and above the 3.1 floor', () => {
      expect(supportsInPlaceOperation('3.1')).toBe(true);
      expect(supportsInPlaceOperation('3.3')).toBe(true);
      expect(supportsInPlaceOperation('4.0')).toBe(true);
      expect(supportsInPlaceOperation('3.10')).toBe(true);
    });

    test('should return false below the 3.1 floor', () => {
      expect(supportsInPlaceOperation('3.0')).toBe(false);
      expect(supportsInPlaceOperation('2.9')).toBe(false);
    });

    test('should return false for malformed versions', () => {
      expect(supportsInPlaceOperation('')).toBe(false);
      expect(supportsInPlaceOperation('abc')).toBe(false);
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
      const currentVersion = '2.8';
      const reason = 'new features available';
      const operationType = 'update';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion, currentVersion, reason, operationType);
      }).toThrow(
        'It is necessary to update the AWS Control Tower Landing Zone because "new features available". ' +
          'The version 2.9 provided in the configuration must match either the deployed AWS Control Tower Landing Zone version 2.8 for in-place update or the latest available version 3.0 to upgrade. ' +
          'AWS Control Tower Landing Zone can be updated when you specify one of these versions in the configuration.',
      );
    });

    test('should handle non-update operationType correctly', () => {
      const configVersion = '2.9';
      const latestVersion = '3.0';
      const currentVersion = '2.8';
      const reason = 'configuration drift detected';
      const operationType = 'reset';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion, currentVersion, reason, operationType);
      }).toThrow(
        'It is necessary to reset the AWS Control Tower Landing Zone because "configuration drift detected". ' +
          'The version 2.9 provided in the configuration must match either the deployed AWS Control Tower Landing Zone version 2.8 for in-place reset or the latest available version 3.0 to upgrade. ' +
          'AWS Control Tower Landing Zone can be reset when you specify one of these versions in the configuration.',
      );
    });

    test('should not throw when config version matches deployed version at or above the in-place floor', () => {
      expect(() => {
        validateLandingZoneVersion('3.3', '4.0', '3.3', 'governed regions changed', 'update');
      }).not.toThrow();
    });

    test('should not throw for in-place reset when config version matches deployed version', () => {
      expect(() => {
        validateLandingZoneVersion('3.3', '4.0', '3.3', 'drift detected', 'reset');
      }).not.toThrow();
    });

    test('should throw when config version matches deployed version below the in-place floor', () => {
      expect(() => {
        validateLandingZoneVersion('3.0', '4.0', '3.0', 'governed regions changed', 'update');
      }).toThrow(
        'It is necessary to update the AWS Control Tower Landing Zone because "governed regions changed". ' +
          'In-place update is not supported for AWS Control Tower Landing Zone version 3.0, it requires version 3.1 or above. ' +
          'AWS Control Tower Landing Zone can be updated when you specify the latest version 4.0 in the configuration.',
      );
    });

    test('should throw when config version matches neither deployed nor latest version', () => {
      expect(() => {
        validateLandingZoneVersion('3.2', '4.0', '3.3', 'governed regions changed', 'update');
      }).toThrow(
        'It is necessary to update the AWS Control Tower Landing Zone because "governed regions changed". ' +
          'The version 3.2 provided in the configuration must match either the deployed AWS Control Tower Landing Zone version 3.3 for in-place update or the latest available version 4.0 to upgrade. ' +
          'AWS Control Tower Landing Zone can be updated when you specify one of these versions in the configuration.',
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
        validateLandingZoneVersion(configVersion, latestVersion, undefined, reason);
      }).toThrow(
        "AWS Control Tower Landing Zone's most recent version is 3.0, which is different from the version 2.9 provided, execution terminated.",
      );
    });

    test('should handle operationType without reason', () => {
      const configVersion = '2.9';
      const latestVersion = '3.0';
      const operationType = 'update';

      expect(() => {
        validateLandingZoneVersion(configVersion, latestVersion, undefined, undefined, operationType);
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
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          enabled: true,
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
          enabled: true,
          loggingBucketRetentionDays: 90,
          accessLoggingBucketRetentionDays: 90,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          enabled: true,
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
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          enabled: true,
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
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          enabled: true,
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
          enabled: true,
          loggingBucketRetentionDays: 60,
          accessLoggingBucketRetentionDays: 60,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          enabled: true,
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
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
        configHubConfig: {
          enabled: true,
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

    test('should skip centralized logging retention checks when organizationTrail is disabled', () => {
      // Setup - organizationTrail disabled, centralized logging has undefined retention (no configurations block)
      const configWithTrailDisabled: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        enableOrganizationTrail: false,
        loggingBucketRetentionDays: 365,
        accessLoggingBucketRetentionDays: 3650,
      };
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: configWithTrailDisabled.governedRegions,
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: false,
          loggingBucketRetentionDays: undefined,
          accessLoggingBucketRetentionDays: undefined,
        },
        configHubConfig: {
          enabled: true,
          loggingBucketRetentionDays: 365,
          accessLoggingBucketRetentionDays: 3650,
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(configWithTrailDisabled, mockLandingZoneDetails);

      // Assert - should NOT trigger update despite undefined centralized logging retention days
      expect(result).toEqual({
        updateRequired: false,
        targetVersion: '4.0',
        resetRequired: false,
        reason: 'There were no changes found to update or reset the Landing Zone.',
      });
    });

    test('should skip config hub retention checks when configHubConfig is disabled', () => {
      // Setup - config hub disabled with mismatched retention days
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: mockLandingZoneConfig.governedRegions,
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
        },
        configHubConfig: {
          enabled: false,
          loggingBucketRetentionDays: 90,
          accessLoggingBucketRetentionDays: 90,
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(mockLandingZoneConfig, mockLandingZoneDetails);

      // Assert - should NOT trigger update for config hub retention mismatch when disabled
      expect(result).toEqual({
        updateRequired: false,
        targetVersion: '4.0',
        resetRequired: false,
        reason: 'There were no changes found to update or reset the Landing Zone.',
      });
    });

    test('should still detect centralized logging changes when organizationTrail is enabled', () => {
      // Setup - organizationTrail enabled, centralized logging has undefined retention
      const configWithTrailEnabled: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        enableOrganizationTrail: true,
        loggingBucketRetentionDays: 365,
        accessLoggingBucketRetentionDays: 3650,
      };
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '4.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: configWithTrailEnabled.governedRegions,
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: false,
          loggingBucketRetentionDays: undefined,
          accessLoggingBucketRetentionDays: undefined,
        },
        configHubConfig: {
          enabled: true,
          loggingBucketRetentionDays: 365,
          accessLoggingBucketRetentionDays: 3650,
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(configWithTrailEnabled, mockLandingZoneDetails);

      // Assert - SHOULD trigger update because organizationTrail is true and retention days differ
      expect(result.updateRequired).toBe(true);
      expect(result.reason).toContain(
        'Changes made in Centralized Logging AccessLoggingBucketRetentionDays from undefined to 3650',
      );
      expect(result.reason).toContain(
        'Changes made in Centralized Logging LoggingBucketRetentionDays from undefined to 365',
      );
    });

    test('should allow in-place update when config version matches deployed version below latest', () => {
      // Setup - customer pinned at 3.3 removes a governed region while 4.0 is available
      const pinnedConfig: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        version: '3.3',
        governedRegions: ['mockRegion1'],
      };
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '3.3',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: ['mockRegion1', 'mockRegion2'],
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(pinnedConfig, mockLandingZoneDetails);

      // Assert - update proceeds in-place at the deployed version, not forced to latest
      expect(result).toEqual({
        updateRequired: true,
        targetVersion: '3.3',
        resetRequired: false,
        reason: 'Changes made in governed regions from [mockRegion1,mockRegion2] to [mockRegion1]',
      });
    });

    test('should target the config version when upgrading to latest', () => {
      // Setup - deployed 3.3, config explicitly requests latest 4.0
      const upgradeConfig: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        version: '4.0',
      };
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '3.3',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: upgradeConfig.governedRegions,
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(upgradeConfig, mockLandingZoneDetails);

      // Assert
      expect(result).toEqual({
        updateRequired: true,
        targetVersion: '4.0',
        resetRequired: false,
        reason: 'Changes made in control tower version from 3.3 to 4.0',
      });
    });

    test('should throw when config version matches neither deployed nor latest version', () => {
      // Setup - deployed 3.3, latest 4.0, config requests 3.2
      const invalidConfig: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        version: '3.2',
      };
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '3.3',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: invalidConfig.governedRegions,
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
      };

      // Act & Assert
      expect(() => landingZoneUpdateOrResetRequired(invalidConfig, mockLandingZoneDetails)).toThrow(
        'The version 3.2 provided in the configuration must match either the deployed AWS Control Tower Landing Zone version 3.3 for in-place update or the latest available version 4.0 to upgrade',
      );
    });

    test('should throw when deployed version is below the in-place update floor', () => {
      // Setup - deployed 3.0 does not support in-place update, config pinned at 3.0
      const pinnedConfig: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        version: '3.0',
        governedRegions: ['mockRegion1'],
      };
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '3.0',
        latestAvailableVersion: '4.0',
        driftStatus: 'IN_SYNC',
        governedRegions: ['mockRegion1', 'mockRegion2'],
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
      };

      // Act & Assert
      expect(() => landingZoneUpdateOrResetRequired(pinnedConfig, mockLandingZoneDetails)).toThrow(
        'In-place update is not supported for AWS Control Tower Landing Zone version 3.0, it requires version 3.1 or above',
      );
    });

    test('should allow in-place reset when drifted landing zone is pinned below latest', () => {
      // Setup - deployed 3.3 drifted, latest 4.0, config pinned at 3.3
      const pinnedConfig: ControlTowerLandingZoneConfigType = {
        ...mockLandingZoneConfig,
        version: '3.3',
      };
      const mockLandingZoneDetails: ControlTowerLandingZoneDetailsType = {
        landingZoneIdentifier: 'mockLandingZoneIdentifier',
        status: 'ACTIVE',
        version: '3.3',
        latestAvailableVersion: '4.0',
        driftStatus: 'DRIFTED',
        governedRegions: pinnedConfig.governedRegions,
        enableIdentityCenterAccess: true,
        centralizedLoggingConfig: {
          enabled: true,
          loggingBucketRetentionDays: 30,
          accessLoggingBucketRetentionDays: 30,
          kmsKeyArn: 'mockKmsKeyArn',
        },
      };

      // Act
      const result = landingZoneUpdateOrResetRequired(pinnedConfig, mockLandingZoneDetails);

      // Assert - reset proceeds without forcing a version bump
      expect(result).toEqual({
        updateRequired: false,
        targetVersion: '3.3',
        resetRequired: true,
        reason: 'The Landing Zone has drifted or failed, resetting',
      });
    });
  });

  describe('makeManifestDocument - config.enabled preservation', () => {
    test('should preserve config.enabled false during UPDATE when existing manifest has config disabled', () => {
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/67890',
      };
      const existingManifest = {
        accessManagement: { enabled: true },
        centralizedLogging: {
          accountId: '111122223333',
          configurations: {
            loggingBucket: { retentionDays: 365 },
            accessLoggingBucket: { retentionDays: 3650 },
          },
          enabled: false,
        },
        config: {
          accountId: '444455556666',
          configurations: {
            loggingBucket: { retentionDays: 365 },
            accessLoggingBucket: { retentionDays: 3650 },
          },
          enabled: false,
        },
        governedRegions: ['us-east-1', 'us-west-2'],
        securityRoles: { enabled: true, accountId: '444455556666' },
      };

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', kmsKeyArns, existingManifest);

      // config should remain disabled, not overwritten with enabled: true
      expect(result.config).toEqual({ enabled: false });
    });

    test('should set config.enabled true during UPDATE when existing manifest has config enabled', () => {
      const kmsKeyArns = {
        centralizedLoggingKeyArn: 'arn:aws:kms:region:account:key/12345',
        configLoggingKeyArn: 'arn:aws:kms:region:account:key/67890',
      };
      const existingManifest = {
        accessManagement: { enabled: true },
        centralizedLogging: {
          accountId: '111122223333',
          configurations: {
            loggingBucket: { retentionDays: 30 },
            accessLoggingBucket: { retentionDays: 30 },
          },
          enabled: true,
        },
        config: {
          accountId: '444455556666',
          configurations: {
            loggingBucket: { retentionDays: 30 },
            accessLoggingBucket: { retentionDays: 30 },
          },
          enabled: true,
        },
        governedRegions: ['mockRegion1', 'mockRegion2'],
        securityRoles: { enabled: true, accountId: '444455556666' },
      };

      const result = makeManifestDocument(mockLandingZoneConfig, 'UPDATE', kmsKeyArns, existingManifest);

      // config should remain enabled with full configuration
      expect(result.config.enabled).toBe(true);
      expect(result.config.configurations).toBeDefined();
    });
  });
});

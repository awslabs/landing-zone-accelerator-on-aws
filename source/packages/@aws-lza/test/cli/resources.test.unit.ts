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

import { CliResources } from '../../lib/cli/resources';
import { ConfigurationObjectType } from '../../lib/cli/libraries/root';

const MOCKED_CONSTANTS = {
  moduleName: 'test-module',
  version: '1.0',
  logging: {
    organizationTrail: true,
    retention: {
      loggingBucket: 30,
      accessLoggingBucket: 30,
    },
  },
  managementAccount: {
    name: 'management-account',
    email: 'management@example.com',
  },
  auditAccount: {
    name: 'audit-account',
    email: 'audit@example.com',
  },
  logArchiveAccount: {
    name: 'log-archive-account',
    email: 'logs@example.com',
  },
  operation: 'deploy',
  partition: 'aws',
  homeRegion: 'us-east-1',
  enabledRegions: ['us-east-1', 'us-west-2'],
  security: {
    enableIdentityCenterAccess: true,
  },
  dummy: 'invalid',
  noDryRun: false,
};

describe('CliResources', () => {
  describe('validControlTowerConfig', () => {
    test('should return true for valid configuration', () => {
      const validConfig: ConfigurationObjectType = {
        version: MOCKED_CONSTANTS.version,
        enabledRegions: MOCKED_CONSTANTS.enabledRegions,
        logging: MOCKED_CONSTANTS.logging,
        security: MOCKED_CONSTANTS.security,
        sharedAccounts: {
          management: MOCKED_CONSTANTS.managementAccount,
          logging: MOCKED_CONSTANTS.logArchiveAccount,
          audit: MOCKED_CONSTANTS.auditAccount,
        },
      };

      expect(CliResources.validControlTowerConfig(validConfig)).toBe(true);
    });

    test('should return false for invalid configuration', () => {
      const invalidConfig: ConfigurationObjectType = {
        version: MOCKED_CONSTANTS.version,
        logging: {
          organizationTrail: MOCKED_CONSTANTS.logging.organizationTrail,
        },
      };

      expect(CliResources.validControlTowerConfig(invalidConfig)).toBe(false);
    });

    test('should return false when shared accounts are missing required properties', () => {
      const invalidConfig: ConfigurationObjectType = {
        version: MOCKED_CONSTANTS.version,
        enabledRegions: MOCKED_CONSTANTS.enabledRegions,
        logging: MOCKED_CONSTANTS.logging,
        security: MOCKED_CONSTANTS.security,
        sharedAccounts: {
          Management: {
            name: MOCKED_CONSTANTS.managementAccount.name,
          },
          LogArchive: MOCKED_CONSTANTS.logArchiveAccount,
          Audit: MOCKED_CONSTANTS.auditAccount,
        },
      };

      expect(CliResources.validControlTowerConfig(invalidConfig)).toBe(false);
    });

    test('should return false when organizationTrail is not boolean', () => {
      const config: ConfigurationObjectType = {
        logging: {
          organizationTrail: MOCKED_CONSTANTS.dummy,
          retention: MOCKED_CONSTANTS.logging.retention,
        },
        security: {
          enableIdentityCenterAccess: true,
        },
      };

      expect(CliResources.validControlTowerConfig(config)).toBe(false);
    });

    test('should return false when retention is not an object', () => {
      const config: ConfigurationObjectType = {
        logging: {
          organizationTrail: MOCKED_CONSTANTS.logging.organizationTrail,
          retention: MOCKED_CONSTANTS.dummy,
        },
        security: MOCKED_CONSTANTS.security,
      };

      expect(CliResources.validControlTowerConfig(config)).toBe(false);
    });

    test('should return false when loggingBucket retention is not a number', () => {
      const config: ConfigurationObjectType = {
        logging: {
          organizationTrail: MOCKED_CONSTANTS.logging.organizationTrail,
          retention: {
            loggingBucket: MOCKED_CONSTANTS.dummy,
            accessLoggingBucket: MOCKED_CONSTANTS.logging.retention.accessLoggingBucket,
          },
        },
        security: MOCKED_CONSTANTS.security,
      };

      expect(CliResources.validControlTowerConfig(config)).toBe(false);
    });

    test('should return false when accessLoggingBucket retention is not a number', () => {
      const config: ConfigurationObjectType = {
        logging: {
          organizationTrail: MOCKED_CONSTANTS.logging.organizationTrail,
          retention: {
            loggingBucket: MOCKED_CONSTANTS.logging.retention.loggingBucket,
            accessLoggingBucket: MOCKED_CONSTANTS.dummy,
          },
        },
        security: MOCKED_CONSTANTS.security,
      };

      expect(CliResources.validControlTowerConfig(config)).toBe(false);
    });

    test('should return false when enableIdentityCenterAccess is not boolean', () => {
      const config: ConfigurationObjectType = {
        logging: MOCKED_CONSTANTS.logging,
        security: {
          enableIdentityCenterAccess: MOCKED_CONSTANTS.dummy,
        },
      };

      expect(CliResources.validControlTowerConfig(config)).toBe(false);
    });

    test('should return true when logging object is not valid', () => {
      const config: ConfigurationObjectType = {
        version: MOCKED_CONSTANTS.version,
        enabledRegions: MOCKED_CONSTANTS.enabledRegions,
        logging: {
          organizationTrail: MOCKED_CONSTANTS.logging.organizationTrail,
          retention: MOCKED_CONSTANTS.dummy,
        },
        security: MOCKED_CONSTANTS.security,
        sharedAccounts: {
          Management: MOCKED_CONSTANTS.managementAccount,
          LogArchive: MOCKED_CONSTANTS.logArchiveAccount,
          Audit: MOCKED_CONSTANTS.auditAccount,
        },
      };

      expect(CliResources.validControlTowerConfig(config)).toBe(false);
    });

    test('should return true when security object enableIdentityCenterAccess is not valid', () => {
      const config: ConfigurationObjectType = {
        version: MOCKED_CONSTANTS.version,
        enabledRegions: MOCKED_CONSTANTS.enabledRegions,
        logging: MOCKED_CONSTANTS.logging,
        security: {
          enableIdentityCenterAccess: MOCKED_CONSTANTS.dummy,
        },
        sharedAccounts: {
          Management: MOCKED_CONSTANTS.managementAccount,
          LogArchive: MOCKED_CONSTANTS.logArchiveAccount,
          Audit: MOCKED_CONSTANTS.auditAccount,
        },
      };

      expect(CliResources.validControlTowerConfig(config)).toBe(false);
    });
  });
});

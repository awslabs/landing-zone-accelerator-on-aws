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

import { describe, expect, test, vi } from 'vitest';

import { setupControlTowerLandingZone } from '../../../executors/accelerator-control-tower';
import { ControlTowerCommand, LZA_CONTROL_TOWER_MODULE } from '../../../lib/cli/libraries/control-tower';
import { CliExecutionParameterType, ConfigurationObjectType } from '../../../lib/cli/libraries/root';

vi.mock('../../../executors/accelerator-control-tower');

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

describe('control-tower', () => {
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

  describe('executeControlTowerCommand', () => {
    test('should execute successfully with valid parameters', async () => {
      const params: CliExecutionParameterType = {
        moduleName: MOCKED_CONSTANTS.moduleName,
        commandName: MOCKED_CONSTANTS.operation,
        args: {
          _: [],
          configuration: JSON.stringify(validConfig),
          partition: MOCKED_CONSTANTS.partition,
          region: MOCKED_CONSTANTS.homeRegion,
          dryRun: MOCKED_CONSTANTS.noDryRun,
        },
      };

      const mockSetupControlTowerLandingZone = setupControlTowerLandingZone as vi.Mock;
      mockSetupControlTowerLandingZone.mockResolvedValue('Success');

      const result = await ControlTowerCommand.executeCommand(params);

      expect(result).toBe('Success');
      expect(mockSetupControlTowerLandingZone).toHaveBeenCalledWith({
        operation: MOCKED_CONSTANTS.operation,
        partition: MOCKED_CONSTANTS.partition,
        region: MOCKED_CONSTANTS.homeRegion,
        configuration: validConfig,
        dryRun: MOCKED_CONSTANTS.noDryRun,
      });
    });
  });

  describe('getControlTowerParams', () => {
    test('should return parameter with valid args', () => {
      const moduleName = LZA_CONTROL_TOWER_MODULE.name;
      const commandName = 'create-landing-zone';
      const params: CliExecutionParameterType = {
        moduleName,
        commandName,
        args: {
          _: [moduleName, commandName],
          partition: MOCKED_CONSTANTS.partition,
          region: MOCKED_CONSTANTS.homeRegion,
          dryRun: MOCKED_CONSTANTS.noDryRun,
          configuration: JSON.stringify(validConfig),
        },
      };

      expect(ControlTowerCommand.getParams(params)).toEqual({
        operation: commandName,
        partition: MOCKED_CONSTANTS.partition,
        region: MOCKED_CONSTANTS.homeRegion,
        dryRun: MOCKED_CONSTANTS.noDryRun,
        configuration: validConfig,
      });
    });

    test('should exit with invalid args', () => {
      const moduleName = LZA_CONTROL_TOWER_MODULE.name;
      const commandName = 'create-landing-zone';
      const params: CliExecutionParameterType = {
        moduleName,
        commandName,
        args: {
          _: [moduleName, commandName],
        },
      };

      const mockExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null | undefined): never => {
          throw new Error('Process.exit called with code: ' + code);
        });

      expect(() => ControlTowerCommand.getParams(params)).toThrow('Process.exit called with code: 1');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockClear();
    });

    test('should exit with invalid config', () => {
      const moduleName = LZA_CONTROL_TOWER_MODULE.name;
      const commandName = 'create-landing-zone';
      const params: CliExecutionParameterType = {
        moduleName,
        commandName,
        args: {
          _: [moduleName, commandName],
          partition: MOCKED_CONSTANTS.partition,
          region: MOCKED_CONSTANTS.homeRegion,
          dryRun: MOCKED_CONSTANTS.noDryRun,
          configuration: '{}',
        },
      };
      (() => {
        return params;
      })();

      const mockExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null | undefined): never => {
          throw new Error('Process.exit called with code: ' + code);
        });

      expect(() => ControlTowerCommand.getParams(params)).toThrow('Process.exit called with code: 1');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockClear();
    });

    test('should exit with invalid partition', () => {
      const moduleName = LZA_CONTROL_TOWER_MODULE.name;
      const commandName = 'create-landing-zone';
      const params: CliExecutionParameterType = {
        moduleName,
        commandName,
        args: {
          _: [moduleName, commandName],
          partition: false,
          region: MOCKED_CONSTANTS.homeRegion,
          dryRun: MOCKED_CONSTANTS.noDryRun,
          configuration: JSON.stringify(validConfig),
        },
      };
      (() => {
        return params;
      })();

      const mockExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null | undefined): never => {
          throw new Error('Process.exit called with code: ' + code);
        });

      expect(() => ControlTowerCommand.getParams(params)).toThrow('Process.exit called with code: 1');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockClear();
    });

    test('should exit with invalid region', () => {
      const moduleName = LZA_CONTROL_TOWER_MODULE.name;
      const commandName = 'create-landing-zone';
      const params: CliExecutionParameterType = {
        moduleName,
        commandName,
        args: {
          _: [moduleName, commandName],
          partition: MOCKED_CONSTANTS.partition,
          region: 10,
          dryRun: MOCKED_CONSTANTS.noDryRun,
          configuration: JSON.stringify(validConfig),
        },
      };
      (() => {
        return params;
      })();

      const mockExit = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null | undefined): never => {
          throw new Error('Process.exit called with code: ' + code);
        });

      expect(() => ControlTowerCommand.getParams(params)).toThrow('Process.exit called with code: 1');
      expect(mockExit).toHaveBeenCalledWith(1);

      mockExit.mockClear();
    });
  });

  describe('validControlTowerConfig', () => {
    test('should return true for valid configuration', () => {
      expect(ControlTowerCommand.validConfig(validConfig)).toBe(true);
    });

    test('should return false when version is not a string', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        version: 1.0,
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when enabledRegions is not an array', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        enabledRegions: 'us-east-1',
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when logging is not an object', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        logging: true,
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when logging.organizationTrail is not a boolean', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        logging: {
          ...validConfig['logging'],
          organizationTrail: 'true',
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when logging.retention is not an object', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        logging: {
          ...validConfig['logging'],
          retention: 'month',
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when logging.retention.loggingBucket is not a number', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        logging: {
          ...validConfig['logging'],
          retention: {
            ...validConfig['logging']['retention'],
            loggingBucket: '30',
          },
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when logging.retention.accessLoggingBucket is not a number', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        logging: {
          ...validConfig['logging'],
          retention: {
            ...validConfig['logging']['retention'],
            accessLoggingBucket: '30',
          },
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when security is not an object', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        security: 10,
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when security.enableIdentityCenterAccess is not a boolean', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        security: {
          ...validConfig['security'],
          enableIdentityCenterAccess: 30,
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when sharedAccounts is not an object', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        sharedAccounts: 0,
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when sharedAccounts.<account> is not an object', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        sharedAccounts: {
          ...validConfig['sharedAccounts'],
          management: true,
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when sharedAccounts.<account>.name is not a string', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        sharedAccounts: {
          ...validConfig['sharedAccounts'],
          management: {
            ...validConfig['sharedAccounts']['management'],
            name: 1,
          },
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });

    test('should return false when sharedAccounts.<account>.email is not a string', () => {
      const invalidConfig: ConfigurationObjectType = {
        ...validConfig,
        sharedAccounts: {
          ...validConfig['sharedAccounts'],
          management: {
            ...validConfig['sharedAccounts']['management'],
            email: false,
          },
        },
      };

      expect(ControlTowerCommand.validConfig(invalidConfig)).toBe(false);
    });
  });
});

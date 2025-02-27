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

import { describe, beforeEach, expect, test } from '@jest/globals';

import { registerOrganizationalUnit, setupControlTowerLandingZone } from '../../executors/accelerator-control-tower';
import { SetupLandingZoneModule } from '../../lib/control-tower/setup-landing-zone/index';
import { RegisterOrganizationalUnitModule } from '../../lib/control-tower/register-organizational-unit/index';
import { ModuleCommands, Modules } from '../../lib/cli/libraries/modules';
import { MOCK_CONSTANTS as COMMON_MOCK_CONSTANTS } from '../mocked-resources';

const MOCK_CONSTANTS = {
  input: {
    operation: ModuleCommands[Modules.CONTROL_TOWER.name][0].name,
    partition: 'aws',
    region: 'us-east-1',
    configuration: {
      version: '3.3',
      enabledRegions: ['us-east-1', 'us-west-2'],
      logging: {
        organizationTrail: true,
        retention: {
          loggingBucket: 3650,
          accessLoggingBucket: 365,
        },
      },
      security: { enableIdentityCenterAccess: true },
      sharedAccounts: {
        management: {
          name: 'Management',
          email: 'management@example.com',
        },
        logging: {
          name: 'LogArchive',
          email: 'logging@example.com',
        },
        audit: {
          name: 'Audit',
          email: 'audit@example.com',
        },
      },
    },
  },
};

// Mock dependencies
jest.mock('../../lib/control-tower/setup-landing-zone/index');
jest.mock('../../lib/control-tower/register-organizational-unit/index');

describe('ControlTowerExecutors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setupControlTowerLandingZone', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should successfully setup Control Tower landing zone', async () => {
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
      (SetupLandingZoneModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await setupControlTowerLandingZone(MOCK_CONSTANTS.input);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when setup fails', async () => {
      const errorMessage = 'Setup failed';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
      (SetupLandingZoneModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(setupControlTowerLandingZone(MOCK_CONSTANTS.input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerOrganizationalUnit', () => {
    const input = {
      ...COMMON_MOCK_CONSTANTS.runnerParameters,
      configuration: { name: 'mockOu' },
    };
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should successfully register organizational unit', async () => {
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
      (RegisterOrganizationalUnitModule as unknown as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await registerOrganizationalUnit(input);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when setup fails', async () => {
      const errorMessage = 'Setup failed';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
      (RegisterOrganizationalUnitModule as unknown as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(registerOrganizationalUnit(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Uncaught Exception Handler', () => {
    let originalProcessOn: typeof process.on;
    let processOnCallback: NodeJS.UncaughtExceptionListener;

    beforeEach(() => {
      originalProcessOn = process.on;

      process.on = jest.fn((event: string, listener: NodeJS.UncaughtExceptionListener) => {
        if (event === 'uncaughtException') {
          processOnCallback = listener;
        }
        return process;
      }) as unknown as typeof process.on;

      jest.resetModules();
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    test('should register uncaughtException handler', () => {
      require('../../executors/accelerator-control-tower');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', () => {
      require('../../executors/accelerator-control-tower');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});

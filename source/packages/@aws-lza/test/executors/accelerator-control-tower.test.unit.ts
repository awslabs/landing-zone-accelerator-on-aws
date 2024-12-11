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

import { setupControlTowerLandingZone } from '../../executors/accelerator-control-tower';
import { AcceleratorControlTowerLandingZoneModule } from '../../lib/control-tower/index';
import { ModuleCommands, Modules } from '../../lib/cli/libraries/modules';

const MOCK_CONSTANTS = {
  input: {
    operation: ModuleCommands[Modules.CONTROL_TOWER.name][0].name,
    partition: 'aws',
    homeRegion: 'us-east-1',
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

jest.mock('../../lib/control-tower/index');

describe('setupControlTowerLandingZone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully setup Control Tower landing zone', async () => {
    const mockHandler = jest.fn().mockResolvedValue('SUCCESS');
    (AcceleratorControlTowerLandingZoneModule as jest.Mock).mockImplementation(() => ({
      handler: mockHandler,
    }));

    const result = await setupControlTowerLandingZone(MOCK_CONSTANTS.input);

    expect(result).toBe('SUCCESS');
    expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });

  it('should throw error when setup fails', async () => {
    const errorMessage = 'Setup failed';
    const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
    (AcceleratorControlTowerLandingZoneModule as jest.Mock).mockImplementation(() => ({
      handler: mockHandler,
    }));

    await expect(setupControlTowerLandingZone(MOCK_CONSTANTS.input)).rejects.toThrow(errorMessage);

    expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.input);
    expect(mockHandler).toHaveBeenCalledTimes(1);
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

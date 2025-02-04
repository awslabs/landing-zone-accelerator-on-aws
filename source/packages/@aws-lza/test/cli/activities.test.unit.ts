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
import { CliActivity } from '../../lib/cli/activities';
import { CliExecutionParameterType } from '../../lib/cli/libraries/root';

jest.mock('../../executors/accelerator-control-tower');

const MOCKED_CONSTANTS = {
  moduleName: 'test-module',
  operation: 'deploy',
  partition: 'aws',
  region: 'us-east-1',
  enabledRegions: ['us-east-1', 'us-west-2'],
  version: '1.0',
  logging: {
    organizationTrail: true,
    retention: {
      loggingBucket: 30,
      accessLoggingBucket: 30,
    },
  },
  security: {
    enableIdentityCenterAccess: true,
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
  noDryRun: false,
};

describe('CliActivity', () => {
  const mockConsoleError = jest.spyOn(console, 'error');
  const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('Process exit');
  });
  const mockSetupControlTowerLandingZone = setupControlTowerLandingZone as jest.MockedFunction<
    typeof setupControlTowerLandingZone
  >;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeControlTowerLandingZoneModule', () => {
    test('should execute successfully with valid parameters', async () => {
      const params: CliExecutionParameterType = {
        moduleName: MOCKED_CONSTANTS.moduleName,
        command: MOCKED_CONSTANTS.operation,
        configuration: {
          version: MOCKED_CONSTANTS.version,
          enabledRegions: MOCKED_CONSTANTS.enabledRegions,
          logging: MOCKED_CONSTANTS.logging,
          security: MOCKED_CONSTANTS.security,
          sharedAccounts: {
            Management: MOCKED_CONSTANTS.managementAccount,
            LogArchive: MOCKED_CONSTANTS.logArchiveAccount,
            Audit: MOCKED_CONSTANTS.auditAccount,
          },
        },
        partition: MOCKED_CONSTANTS.partition,
        region: MOCKED_CONSTANTS.region,
        dryRun: MOCKED_CONSTANTS.noDryRun,
      };

      mockSetupControlTowerLandingZone.mockResolvedValue('Success');

      const result = await CliActivity.executeControlTowerLandingZoneModule(params);

      expect(result).toBe('Success');
      expect(mockSetupControlTowerLandingZone).toHaveBeenCalledWith({
        operation: MOCKED_CONSTANTS.operation,
        partition: MOCKED_CONSTANTS.partition,
        region: MOCKED_CONSTANTS.region,
        configuration: params['configuration'],
        dryRun: MOCKED_CONSTANTS.noDryRun,
      });
    });

    test('should exit with error when partition is missing', async () => {
      const params: CliExecutionParameterType = {
        moduleName: MOCKED_CONSTANTS.moduleName,
        command: MOCKED_CONSTANTS.operation,
        configuration: {},
        region: MOCKED_CONSTANTS.region,
      };

      await expect(CliActivity.executeControlTowerLandingZoneModule(params)).rejects.toThrow('Process exit');
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    test('should exit with error when region is missing', async () => {
      const params: CliExecutionParameterType = {
        moduleName: MOCKED_CONSTANTS.moduleName,
        command: MOCKED_CONSTANTS.operation,
        configuration: {},
        partition: MOCKED_CONSTANTS.partition,
      };

      await expect(CliActivity.executeControlTowerLandingZoneModule(params)).rejects.toThrow('Process exit');
      expect(mockConsoleError).toHaveBeenCalled();
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });
  });
});

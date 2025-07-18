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

import { manageOrganizationAdmin } from '../../../executors/accelerator-macie';
import { LZA_MACIE_MODULE, ManageOrganizationAdminCommand } from '../../../lib/cli/libraries/macie';
import { CliExecutionParameterType } from '../../../lib/cli/libraries/root';

jest.mock('../../../executors/accelerator-macie');

const MOCKED_CONSTANTS = {
  partition: 'aws',
  region: 'us-east-1',
  enabledRegions: ['us-east-1', 'us-west-2'],
  enable: false,
  dryRun: false,
  accountId: '111111111111',
};

describe('macie', () => {
  describe('manageOrganizationAdmin', () => {
    const validConfig = {
      enable: MOCKED_CONSTANTS.enable,
      accountId: MOCKED_CONSTANTS.accountId,
    };

    describe('execute', () => {
      test('should execute successfully with valid parameters', async () => {
        const moduleName = LZA_MACIE_MODULE.name;
        const commandName = 'manage-organization-admin';
        const params: CliExecutionParameterType = {
          moduleName,
          commandName,
          args: {
            _: [moduleName, commandName],
            partition: MOCKED_CONSTANTS.partition,
            region: MOCKED_CONSTANTS.region,
            dryRun: MOCKED_CONSTANTS.dryRun,
            configuration: JSON.stringify(validConfig),
          },
        };

        const mockManageOrganizationAdmin = manageOrganizationAdmin as jest.Mock;
        mockManageOrganizationAdmin.mockResolvedValue('Success');

        const result = await LZA_MACIE_MODULE.commands[commandName].execute(params);

        expect(result).toBe('Success');
        expect(mockManageOrganizationAdmin).toHaveBeenCalledWith({
          operation: commandName,
          partition: MOCKED_CONSTANTS.partition,
          region: MOCKED_CONSTANTS.region,
          configuration: validConfig,
          dryRun: MOCKED_CONSTANTS.dryRun,
        });
      });
    });

    describe('getParam', () => {
      test('should return parameter with valid config', () => {
        const moduleName = LZA_MACIE_MODULE.name;
        const commandName = 'manage-organization-admin';
        const params: CliExecutionParameterType = {
          moduleName,
          commandName,
          args: {
            _: [moduleName, commandName],
            partition: MOCKED_CONSTANTS.partition,
            region: MOCKED_CONSTANTS.region,
            dryRun: MOCKED_CONSTANTS.dryRun,
            configuration: JSON.stringify(validConfig),
          },
        };

        expect(ManageOrganizationAdminCommand.getParams(params)).toEqual({
          operation: commandName,
          partition: MOCKED_CONSTANTS.partition,
          region: MOCKED_CONSTANTS.region,
          dryRun: MOCKED_CONSTANTS.dryRun,
          configuration: validConfig,
        });
      });

      test('should exit with invalid args', () => {
        const moduleName = LZA_MACIE_MODULE.name;
        const commandName = 'manage-organization-admin';
        const params: CliExecutionParameterType = {
          moduleName,
          commandName,
          args: {
            _: [moduleName, commandName],
          },
        };

        const mockExit = jest
          .spyOn(process, 'exit')
          .mockImplementation((code?: string | number | null | undefined): never => {
            throw new Error('Process.exit called with code: ' + code);
          });

        expect(() => ManageOrganizationAdminCommand.getParams(params)).toThrow('Process.exit called with code: 1');
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockClear();
      });

      test('should exit with invalid configuration', () => {
        const moduleName = LZA_MACIE_MODULE.name;
        const commandName = 'manage-organization-admin';
        const params: CliExecutionParameterType = {
          moduleName,
          commandName,
          args: {
            _: [moduleName, commandName],
            partition: MOCKED_CONSTANTS.partition,
            region: MOCKED_CONSTANTS.region,
            dryRun: MOCKED_CONSTANTS.dryRun,
            configuration: '{}',
          },
        };
        (() => {
          return params;
        })();

        const mockExit = jest
          .spyOn(process, 'exit')
          .mockImplementation((code?: string | number | null | undefined): never => {
            throw new Error('Process.exit called with code: ' + code);
          });

        expect(() => ManageOrganizationAdminCommand.getParams(params)).toThrow('Process.exit called with code: 1');
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockClear();
      });

      test('should exit with invalid partition', () => {
        const moduleName = LZA_MACIE_MODULE.name;
        const commandName = 'manage-organization-admin';
        const params: CliExecutionParameterType = {
          moduleName,
          commandName,
          args: {
            _: [moduleName, commandName],
            partition: 1,
            region: MOCKED_CONSTANTS.region,
            dryRun: MOCKED_CONSTANTS.dryRun,
            configuration: JSON.stringify(validConfig),
          },
        };
        (() => {
          return params;
        })();

        const mockExit = jest
          .spyOn(process, 'exit')
          .mockImplementation((code?: string | number | null | undefined): never => {
            throw new Error('Process.exit called with code: ' + code);
          });

        expect(() => ManageOrganizationAdminCommand.getParams(params)).toThrow('Process.exit called with code: 1');
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockClear();
      });

      test('should exit with invalid region', () => {
        const moduleName = LZA_MACIE_MODULE.name;
        const commandName = 'manage-organization-admin';
        const params: CliExecutionParameterType = {
          moduleName,
          commandName,
          args: {
            _: [moduleName, commandName],
            partition: MOCKED_CONSTANTS.partition,
            region: false,
            dryRun: MOCKED_CONSTANTS.dryRun,
            configuration: JSON.stringify(validConfig),
          },
        };
        (() => {
          return params;
        })();

        const mockExit = jest
          .spyOn(process, 'exit')
          .mockImplementation((code?: string | number | null | undefined): never => {
            throw new Error('Process.exit called with code: ' + code);
          });

        expect(() => ManageOrganizationAdminCommand.getParams(params)).toThrow('Process.exit called with code: 1');
        expect(mockExit).toHaveBeenCalledWith(1);

        mockExit.mockClear();
      });
    });

    describe('validConfig', () => {
      test('should return true for valid config', () => {
        expect(ManageOrganizationAdminCommand.validConfig(validConfig)).toBe(true);
      });

      test('should return false when enable is not a boolean', () => {
        const invalidConfig = {
          ...validConfig,
          enable: 0,
        };

        expect(ManageOrganizationAdminCommand.validConfig(invalidConfig)).toBe(false);
      });

      test('should return false when account is not a string', () => {
        const invalidConfig = {
          ...validConfig,
          accountId: 111111111111,
        };

        expect(ManageOrganizationAdminCommand.validConfig(invalidConfig)).toBe(false);
      });
    });
  });
});

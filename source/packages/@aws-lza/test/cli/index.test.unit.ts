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
import fs from 'fs';

import { CliInvokeArgumentType, CliExecutionParameterType, CliCommandDetailsType } from '../../lib/cli/libraries/root';
import { configureModuleCommands, main, parseArgs, validModuleConfiguration } from '../../lib/cli';
import { CliResources } from '../../lib/cli/resources';
import { CliActivity } from '../../lib/cli/activities';
import { ModuleCommands, Modules } from '../../lib/cli/libraries/modules';
import { Argv } from 'yargs';

const MOCK_CONSTANTS = {
  moduleName: 'test-module',
  invalidModuleName: 'invalid_module',
  invalidCommand: 'invalid_command',
  invalidDescription: 'invalid_description',
  configurationJsonString: '{"key": "value"}',
  configurationJson: { key: 'value' },
  invalidConfigurationJson: 'invalid',
  configurationFileName: 'file://test-file.json',
  partition: 'aws',
  region: 'us-east-1',
  account: '123456789012',
  verbose: true,
  noDryRun: false,
  dryRun: true,
  scriptArg: 'script',
};

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn().mockReturnValue('{"key": "value"}'),
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock('../../lib/cli/resources', () => {
  class MockCliActivity {
    static executeControlTowerLandingZoneModule = jest.fn();
    static executeOrganizationsModule = jest.fn();
  }

  class MockCliResources {
    static validControlTowerConfig = jest.fn();
    static validateOrganizationsConfiguration = jest.fn().mockReturnValue(true);
  }

  return {
    CliActivity: MockCliActivity,
    CliResources: MockCliResources,
  };
});

// Store original console methods
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

// Create arrays to store console messages
const consoleOutput: string[] = [];
const consoleErrors: string[] = [];

// Mock console methods to store and display messages
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation((...args) => {
  const message = args.join(' ');
  consoleErrors.push(message);
  originalConsoleError.apply(console, args);
});

const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation((...args) => {
  const message = args.join(' ');
  consoleOutput.push(message);
  originalConsoleLog.apply(console, args);
});

// Mock process.exit to show console output before throwing
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
  console.log('\n=== Console Output ===');
  consoleOutput.forEach(msg => console.log(msg));
  console.log('\n=== Console Errors ===');
  consoleErrors.forEach(msg => console.log(msg));
  console.log('\n=== End of Console Output ===\n');

  throw new Error(`Process.exit called with code: ${code}`);
});

describe('Parser', () => {
  beforeEach(() => {
    consoleOutput.length = 0;
    consoleErrors.length = 0;
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
    mockConsoleLog.mockRestore();
    mockExit.mockRestore();
  });

  describe('parseArgs', () => {
    test('should parse valid arguments with inline JSON configuration', () => {
      const argv: CliInvokeArgumentType = {
        _: [Modules.CONTROL_TOWER.name, ModuleCommands[Modules.CONTROL_TOWER.name][0].name],
        configuration: MOCK_CONSTANTS.configurationJsonString,
        partition: MOCK_CONSTANTS.partition,
        region: MOCK_CONSTANTS.region,
        account: MOCK_CONSTANTS.account,
        verbose: MOCK_CONSTANTS.verbose,
        $0: MOCK_CONSTANTS.scriptArg,
      };

      jest.spyOn(CliResources, 'validControlTowerConfig').mockReturnValue(true);

      const result = parseArgs(argv);

      expect(result).toEqual(
        expect.objectContaining({
          moduleName: Modules.CONTROL_TOWER.name,
          command: ModuleCommands[Modules.CONTROL_TOWER.name][0].name,
          configuration: MOCK_CONSTANTS.configurationJson,
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          account: MOCK_CONSTANTS.account,
          verbose: MOCK_CONSTANTS.verbose,
        }),
      );
    });

    test('should parse valid arguments with JSON file configuration', () => {
      const argv = {
        _: [Modules.CONTROL_TOWER.name, ModuleCommands[Modules.CONTROL_TOWER.name][0].name],
        configuration: MOCK_CONSTANTS.configurationFileName,
        partition: MOCK_CONSTANTS.partition,
        region: MOCK_CONSTANTS.region,
        account: MOCK_CONSTANTS.account,
        verbose: MOCK_CONSTANTS.verbose,
        dryRun: MOCK_CONSTANTS.noDryRun,
        $0: MOCK_CONSTANTS.scriptArg,
      };

      jest.spyOn(CliResources, 'validControlTowerConfig').mockReturnValue(true);

      const result = parseArgs(argv);

      expect(fs.readFileSync).toHaveBeenCalledWith('test-file.json', 'utf8');

      expect(result).toEqual(
        expect.objectContaining({
          moduleName: Modules.CONTROL_TOWER.name,
          command: ModuleCommands[Modules.CONTROL_TOWER.name][0].name,
          configuration: MOCK_CONSTANTS.configurationJson,
          partition: MOCK_CONSTANTS.partition,
          region: MOCK_CONSTANTS.region,
          account: MOCK_CONSTANTS.account,
          verbose: MOCK_CONSTANTS.verbose,
          dryRun: MOCK_CONSTANTS.noDryRun,
        }),
      );
    });

    test('should throw error when configuration JSON file does not exists', () => {
      const argv = {
        _: [MOCK_CONSTANTS.invalidModuleName, MOCK_CONSTANTS.invalidCommand],
        configuration: MOCK_CONSTANTS.configurationFileName,
        $0: MOCK_CONSTANTS.scriptArg,
      };

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      expect(() => {
        parseArgs(argv);
      }).toThrow('Process.exit called with code: 1');
      expect(mockConsoleError).toHaveBeenCalled();
    });

    test('should throw error for invalid JSON configuration', () => {
      const argv = {
        _: [Modules.CONTROL_TOWER.name, ModuleCommands[Modules.CONTROL_TOWER.name][0].name],
        configuration: MOCK_CONSTANTS.configurationJsonString,
        $0: MOCK_CONSTANTS.scriptArg,
      };

      jest.spyOn(CliResources, 'validControlTowerConfig').mockReturnValue(false);

      expect(() => {
        parseArgs(argv);
      }).toThrow('Process.exit called with code: 1');
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });

  describe('validModuleConfiguration', () => {
    test('should validate control-tower configuration', () => {
      jest.spyOn(CliResources, 'validControlTowerConfig').mockReturnValue(true);

      const result = validModuleConfiguration(Modules.CONTROL_TOWER.name, MOCK_CONSTANTS.configurationJson);
      expect(result).toBeTruthy();
    });

    test('should validate organizations configuration', () => {
      const result = validModuleConfiguration(Modules.ORGANIZATIONS.name, MOCK_CONSTANTS.configurationJson);
      expect(result).toBeTruthy();
    });

    test('should throw error for invalid module', () => {
      expect(() => validModuleConfiguration('invalid-module', MOCK_CONSTANTS.configurationJson)).toThrow();
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('main function', () => {
    test('should execute control-tower module', async () => {
      const params = {
        moduleName: Modules.CONTROL_TOWER.name,
        command: ModuleCommands[Modules.CONTROL_TOWER.name][0].name,
        configuration: MOCK_CONSTANTS.configurationJson,
        partition: MOCK_CONSTANTS.partition,
        region: MOCK_CONSTANTS.region,
        account: MOCK_CONSTANTS.account,
        verbose: MOCK_CONSTANTS.verbose,
        dryRun: MOCK_CONSTANTS.noDryRun,
      };

      jest
        .spyOn(CliActivity, 'executeControlTowerLandingZoneModule')
        .mockImplementation(() => Promise.resolve('Successful'));

      const result = await main(params);
      expect(result).toBeDefined();
    });

    test('should handle organizations module', async () => {
      const params = {
        moduleName: Modules.ORGANIZATIONS.name,
        command: ModuleCommands[Modules.ORGANIZATIONS.name][0].name,
        configuration: MOCK_CONSTANTS.configurationJson,
        partition: MOCK_CONSTANTS.partition,
        region: MOCK_CONSTANTS.region,
        account: MOCK_CONSTANTS.account,
        verbose: MOCK_CONSTANTS.verbose,
        dryRun: MOCK_CONSTANTS.noDryRun,
      };

      const result = await main(params);
      expect(result).toBe('Module yet to develop');
    });

    test('should handle invalid module name', async () => {
      const invalidParams: CliExecutionParameterType = {
        moduleName: MOCK_CONSTANTS.invalidModuleName,
        command: MOCK_CONSTANTS.invalidCommand,
        configuration: MOCK_CONSTANTS.configurationJson,
      };

      ModuleCommands[MOCK_CONSTANTS.invalidModuleName] = [
        { name: MOCK_CONSTANTS.invalidCommand, description: MOCK_CONSTANTS.invalidDescription },
      ];

      const result = await main(invalidParams);
      expect(result).toBe(`Invalid Module ${MOCK_CONSTANTS.invalidModuleName}`);
      expect(mockExit).not.toHaveBeenCalled();
    });
  });

  describe('configureModuleCommands', () => {
    let mockYargs: Argv<object>;
    const mockExit = jest
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null | undefined): never => {
        throw new Error('Process.exit called with code: ' + code);
      });
    const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

    beforeEach(() => {
      const yargsInstance = {
        command: jest.fn(),
        fail: jest.fn(),
        demandCommand: jest.fn(),
        help: jest.fn(),
        alias: jest.fn(),
      };

      yargsInstance.command.mockReturnValue(yargsInstance);
      yargsInstance.fail.mockReturnValue(yargsInstance);
      yargsInstance.demandCommand.mockReturnValue(yargsInstance);
      yargsInstance.help.mockReturnValue(yargsInstance);
      yargsInstance.alias.mockReturnValue(yargsInstance);

      mockYargs = yargsInstance as unknown as Argv<object>;

      jest.clearAllMocks();
    });

    afterEach(() => {
      mockConsoleLog.mockClear();
      mockExit.mockClear();
    });

    afterAll(() => {
      mockConsoleLog.mockRestore();
      mockExit.mockRestore();
    });

    test('should execute command handler', async () => {
      // Setup

      const commands: CliCommandDetailsType[] = [
        {
          name: 'command1',
          description: 'Test command 1',
        },
      ];

      configureModuleCommands(MOCK_CONSTANTS.moduleName, commands, mockYargs);

      const commandConfig = (mockYargs.command as jest.Mock).mock.calls[0][0];

      // Execute

      const result = await commandConfig.handler();

      // Verify

      expect(result).toBeUndefined();
    });

    test('should configure commands correctly', () => {
      // Setup

      const commands: CliCommandDetailsType[] = [
        {
          name: 'command1',
          description: 'Test command 1',
          options: [{ option1: { type: 'string', description: 'Option 1' } }],
        },
        {
          name: 'command2',
          description: 'Test command 2',
          options: [{ option2: { type: 'boolean', description: 'Option 2' } }],
        },
      ];

      // Execute

      const result = configureModuleCommands(MOCK_CONSTANTS.moduleName, commands, mockYargs);

      // Verify

      expect(mockYargs.command).toHaveBeenCalledTimes(2);
      expect(mockYargs.command).toHaveBeenNthCalledWith(1, {
        command: 'command1',
        describe: 'Test command 1',
        builder: { option1: { type: 'string', description: 'Option 1' } },
        handler: expect.any(Function),
      });
      expect(mockYargs.command).toHaveBeenNthCalledWith(2, {
        command: 'command2',
        describe: 'Test command 2',
        builder: { option2: { type: 'boolean', description: 'Option 2' } },
        handler: expect.any(Function),
      });
      expect(mockYargs.demandCommand).toHaveBeenCalledWith(
        1,
        'too few arguments, command is required for test-module module',
      );
      expect(mockYargs.help).toHaveBeenCalled();
      expect(mockYargs.alias).toHaveBeenCalledWith('help', 'h');
      expect(result).toBe(mockYargs);
    });

    test('should configure commands without options', () => {
      // Setup
      const commands: CliCommandDetailsType[] = [
        {
          name: 'command1',
          description: 'Test command 1',
        },
      ];

      // Execute

      const result = configureModuleCommands(MOCK_CONSTANTS.moduleName, commands, mockYargs);

      // Verify

      expect(mockYargs.command).toHaveBeenCalledWith({
        command: 'command1',
        describe: 'Test command 1',
        builder: {},
        handler: expect.any(Function),
      });
      expect(result).toBe(mockYargs);
    });

    test('should handle fail callback', () => {
      // Setup

      const commands: CliCommandDetailsType[] = [
        {
          name: 'command1',
          description: 'Test command 1',
        },
      ];

      // Execute

      configureModuleCommands(MOCK_CONSTANTS.moduleName, commands, mockYargs);
      const failCallback = (mockYargs.fail as jest.Mock).mock.calls[0][0];

      // Verify

      expect(() => {
        failCallback('error message', null, mockYargs);
      }).toThrow('Process.exit called with code: 1');
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.any(String));
      expect(mockConsoleLog).toHaveBeenCalledWith('lza: error: error message');
    });

    test('should handle fail callback in return statement', () => {
      // Setup
      const mockHelpText = 'Mock help text';

      const yargsInstance = {
        command: jest.fn(),
        fail: jest.fn(),
        demandCommand: jest.fn(),
        help: jest.fn(),
        alias: jest.fn(),
      };

      yargsInstance.command.mockReturnValue(yargsInstance);
      yargsInstance.fail.mockReturnValue(yargsInstance);
      yargsInstance.demandCommand.mockReturnValue(yargsInstance);
      yargsInstance.help.mockImplementation(() => yargsInstance);
      yargsInstance.alias.mockReturnValue(yargsInstance);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (yargsInstance as any).showHelp = jest.fn().mockReturnValue(mockHelpText);

      const commands: CliCommandDetailsType[] = [
        {
          name: 'command1',
          description: 'Test command 1',
        },
      ];

      configureModuleCommands(MOCK_CONSTANTS.moduleName, commands, yargsInstance as unknown as Argv<object>);

      // Execute
      const returnFailCallback = (yargsInstance.fail as jest.Mock).mock.calls[1][0];

      // Verify
      expect(() => {
        returnFailCallback('test error message', null, {
          ...yargsInstance,
          help: () => mockHelpText,
        });
      }).toThrow('Process.exit called with code: 1');

      expect(mockConsoleLog).toHaveBeenNthCalledWith(1, mockHelpText);
      expect(mockConsoleLog).toHaveBeenNthCalledWith(2, 'lza: error: test error message');
    });
  });
});

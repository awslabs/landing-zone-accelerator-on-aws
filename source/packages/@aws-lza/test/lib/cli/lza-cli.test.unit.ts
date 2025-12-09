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

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { main, configureModuleCommands } from '../../../lib/cli/lza-cli';

vi.mock('../../../lib/cli/commands/registry');

const mockCommands = {
  setup: {
    description: 'Setup commands',
    resources: {
      macie: {
        description: 'Setup Macie',
        options: [],
        execute: vi.fn().mockResolvedValue('macie setup complete'),
      },
      'control-tower': {
        description: 'Setup Control Tower',
        options: [],
        execute: vi.fn().mockResolvedValue('control tower setup complete'),
      },
    },
  },
};

vi.mocked(await import('../../../lib/cli/commands/registry')).Commands = mockCommands;

describe('lza-cli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('main', () => {
    test('should return empty string for help flag', async () => {
      const result = await main({ _: [], help: true });
      expect(result).toBe('');
    });

    test('should return empty string for h flag', async () => {
      const result = await main({ _: [], h: true });
      expect(result).toBe('');
    });

    test('should return empty string when both help and h are false', async () => {
      const result = await main({ _: [], help: false, h: false });
      expect(result).toBe('Usage: lza <command> <resource> [options]');
    });

    test('should return usage message when no arguments', async () => {
      const result = await main({ _: [] });
      expect(result).toBe('Usage: lza <command> <resource> [options]');
    });

    test('should return usage message when only verb provided', async () => {
      const result = await main({ _: ['setup'] });
      expect(result).toBe('Usage: lza <command> <resource> [options]');
    });

    test('should return error for invalid command', async () => {
      const result = await main({ _: ['invalid', 'resource'] });
      expect(result).toBe('Invalid command "invalid"');
    });

    test('should return error for invalid resource', async () => {
      const result = await main({ _: ['setup', 'invalid'] });
      expect(result).toBe('Invalid resource "invalid" for command "setup"');
    });

    test('should execute valid command and resource', async () => {
      const mockExecute = vi.fn().mockResolvedValue('macie setup complete');
      mockCommands.setup.resources.macie.execute = mockExecute;

      const result = await main({ _: ['setup', 'macie'], config: 'test' });

      expect(mockExecute).toHaveBeenCalledWith({
        moduleName: 'macie',
        commandName: 'setup',
        args: { _: ['setup', 'macie'], config: 'test' },
      });
      expect(result).toBe('macie setup complete');
    });

    test('should handle numeric arguments', async () => {
      const result = await main({ _: [123, 456] });
      expect(result).toBe('Invalid command "123"');
    });

    test('should handle undefined array elements', async () => {
      const result = await main({ _: [undefined, undefined] });
      expect(result).toBe('Usage: lza <command> <resource> [options]');
    });
  });

  describe('configureModuleCommands', () => {
    let mockYargs: {
      options: ReturnType<typeof vi.fn>;
      middleware: ReturnType<typeof vi.fn>;
      help: ReturnType<typeof vi.fn>;
      alias: ReturnType<typeof vi.fn>;
      command: ReturnType<typeof vi.fn>;
      strict: ReturnType<typeof vi.fn>;
      demandCommand: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockYargs = {
        options: vi.fn().mockReturnThis(),
        middleware: vi.fn().mockReturnThis(),
        help: vi.fn().mockReturnThis(),
        alias: vi.fn().mockReturnThis(),
        command: vi.fn().mockReturnThis(),
        strict: vi.fn().mockReturnThis(),
        demandCommand: vi.fn().mockReturnThis(),
      };

      Object.keys(mockYargs).forEach(key => {
        mockYargs[key].mockReturnValue(mockYargs);
      });
    });

    test('should configure default command', () => {
      const commands = {
        '': {
          description: 'Default command',
          options: [
            { verbose: { type: 'boolean' as const, description: 'Verbose output' } },
            { config: { type: 'string' as const, description: 'Config file' } },
          ],
          execute: vi.fn(),
        },
      };

      const result = configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.options).toHaveBeenCalledWith({
        verbose: { type: 'boolean', description: 'Verbose output' },
        config: { type: 'string', description: 'Config file' },
      });
      expect(mockYargs.middleware).toHaveBeenCalled();
      expect(mockYargs.help).toHaveBeenCalled();
      expect(mockYargs.alias).toHaveBeenCalledWith('help', 'h');
      expect(result).toBe(mockYargs);
    });

    test('should configure default command without options', () => {
      const commands = {
        '': {
          description: 'Default command',
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.options).toHaveBeenCalledWith({});
    });

    test('should configure subcommands', () => {
      const commands = {
        start: {
          description: 'Start command',
          options: [{ port: { type: 'string' as const, description: 'Port number' } }],
          execute: vi.fn(),
        },
        stop: {
          description: 'Stop command',
          execute: vi.fn(),
        },
      };

      const result = configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.command).toHaveBeenCalledTimes(2);
      expect(mockYargs.command).toHaveBeenCalledWith({
        command: 'start',
        describe: 'Start command',
        builder: { port: { type: 'string', description: 'Port number' } },
        handler: expect.any(Function),
      });
      expect(mockYargs.command).toHaveBeenCalledWith({
        command: 'stop',
        describe: 'Stop command',
        builder: {},
        handler: expect.any(Function),
      });
      expect(mockYargs.strict).toHaveBeenCalledWith(true);
      expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, 'too few arguments, command is required for test module');
      expect(result).toBe(mockYargs);
    });

    test('should handle middleware for default command with invalid subcommand', () => {
      const commands = {
        '': {
          description: 'Default command',
          execute: vi.fn(),
        },
      };

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      configureModuleCommands('test', commands, mockYargs);

      const middlewareCallback = mockYargs.middleware.mock.calls[0][0];

      expect(() => middlewareCallback({ _: ['cmd', 'subcmd'] })).toThrow('process.exit');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'lza: error: Invalid subcommand "subcmd" for module "test". This module does not accept subcommands.',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);

      consoleLogSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test('should not exit middleware for help flag', () => {
      const commands = {
        '': {
          description: 'Default command',
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      const middlewareCallback = mockYargs.middleware.mock.calls[0][0];

      expect(() => middlewareCallback({ _: ['cmd', 'subcmd'], help: true })).not.toThrow();
    });

    test('should not exit middleware for h flag', () => {
      const commands = {
        '': {
          description: 'Default command',
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      const middlewareCallback = mockYargs.middleware.mock.calls[0][0];

      expect(() => middlewareCallback({ _: ['cmd', 'subcmd'], h: true })).not.toThrow();
    });

    test('should not exit middleware when no subcommand', () => {
      const commands = {
        '': {
          description: 'Default command',
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      const middlewareCallback = mockYargs.middleware.mock.calls[0][0];

      expect(() => middlewareCallback({ _: ['cmd'] })).not.toThrow();
    });

    test('should handle command with no options in builder', () => {
      const commands = {
        start: {
          description: 'Start command',
          options: [{ port: { type: 'string' as const, description: 'Port number' } }],
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.command).toHaveBeenCalledWith({
        command: 'start',
        describe: 'Start command',
        builder: { port: { type: 'string', description: 'Port number' } },
        handler: expect.any(Function),
      });
    });

    test('should handle command with undefined options', () => {
      const commands = {
        start: {
          description: 'Start command',
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.command).toHaveBeenCalledWith({
        command: 'start',
        describe: 'Start command',
        builder: {},
        handler: expect.any(Function),
      });
    });

    test('should handle empty commands object', () => {
      const commands = {};

      configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.command).not.toHaveBeenCalled();
      expect(mockYargs.strict).toHaveBeenCalledWith(true);
      expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, 'too few arguments, command is required for test module');
    });

    test('should handle default command with undefined options', () => {
      const commands = {
        '': {
          description: 'Default command',
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.options).toHaveBeenCalledWith({});
    });

    test('should handle default command with null options', () => {
      const commands = {
        '': {
          description: 'Default command',
          options: null,
          execute: vi.fn(),
        },
      };

      configureModuleCommands('test', commands, mockYargs);

      expect(mockYargs.options).toHaveBeenCalledWith({});
    });
  });
});

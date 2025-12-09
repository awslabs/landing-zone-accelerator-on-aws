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
import fs from 'fs';
import {
  getConfig,
  getSessionDetailsFromArgs,
  logError,
  logErrorAndExit,
  CliCommonOptions,
} from '../../../../lib/cli/handlers/root';

vi.mock('fs');
vi.mock('../../../../lib/common/sts-functions');
vi.mock('../../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({ info: vi.fn() })),
}));

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockGetCurrentSessionDetails = vi.fn();

vi.mocked(await import('../../../../lib/common/sts-functions')).getCurrentSessionDetails = mockGetCurrentSessionDetails;

describe('root handlers', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('CliCommonOptions', () => {
    test('should have correct structure', () => {
      expect(CliCommonOptions).toHaveLength(3);

      const verboseOption = CliCommonOptions.find(opt => opt.verbose);
      expect(verboseOption?.verbose).toEqual({
        alias: 'v',
        type: 'boolean',
        description: 'Run with verbose logging',
        default: false,
      });

      const dryRunOption = CliCommonOptions.find(opt => opt['dry-run']);
      expect(dryRunOption?.['dry-run']).toEqual({
        type: 'boolean',
        description: 'Run the command in dry run mode',
        default: false,
      });

      const regionOption = CliCommonOptions.find(opt => opt.region);
      expect(regionOption?.region).toEqual({
        alias: 'r',
        type: 'string',
        description: 'AWS region for the session',
      });
    });
  });

  describe('getConfig', () => {
    test('should parse JSON string directly', () => {
      const config = { test: 'value' };
      const result = getConfig(JSON.stringify(config));
      expect(result).toEqual(config);
    });

    test('should read from file when file:// prefix', () => {
      const config = { test: 'value' };
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(config));

      const result = getConfig('file:///path/to/config.json');

      expect(mockExistsSync).toHaveBeenCalledWith('/path/to/config.json');
      expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/config.json', 'utf8');
      expect(result).toEqual(config);
    });

    test('should exit when file does not exist', () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockExistsSync.mockReturnValue(false);

      expect(() => getConfig('file:///nonexistent.json')).toThrow('process.exit');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'aws-lza: error: An error occurred (MissingConfigurationFile): The configuration file /nonexistent.json does not exists.',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getSessionDetailsFromArgs', () => {
    const mockSessionDetails = {
      accountId: '123456789012',
      region: 'us-east-1',
      partition: 'aws',
    };

    beforeEach(() => {
      mockGetCurrentSessionDetails.mockResolvedValue(mockSessionDetails);
    });

    test('should use region from args', async () => {
      const param = {
        moduleName: 'test',
        commandName: 'setup',
        args: { region: 'us-west-2' },
      };

      const result = await getSessionDetailsFromArgs(param);

      expect(mockGetCurrentSessionDetails).toHaveBeenCalledWith({ region: 'us-west-2' });
      expect(result).toBe(mockSessionDetails);
    });

    test('should use AWS_REGION env var when no region in args', async () => {
      process.env.AWS_REGION = 'eu-west-1';
      const param = {
        moduleName: 'test',
        commandName: 'setup',
        args: {},
      };

      await getSessionDetailsFromArgs(param);

      expect(mockGetCurrentSessionDetails).toHaveBeenCalledWith({ region: 'eu-west-1' });
    });

    test('should default to us-east-1 when no region specified', async () => {
      delete process.env.AWS_REGION;
      const param = {
        moduleName: 'test',
        commandName: 'setup',
        args: {},
      };

      await getSessionDetailsFromArgs(param);

      expect(mockGetCurrentSessionDetails).toHaveBeenCalledWith({ region: 'us-east-1' });
    });

    test('should handle non-string region in args', async () => {
      const param = {
        moduleName: 'test',
        commandName: 'setup',
        args: { region: 123 },
      };

      await getSessionDetailsFromArgs(param);

      expect(mockGetCurrentSessionDetails).toHaveBeenCalledWith({ region: 'us-east-1' });
    });
  });

  describe('logError', () => {
    test('should log error message', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logError('Test error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith('aws-lza: error: Test error message');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('logErrorAndExit', () => {
    test('should log error and exit with default code', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      logErrorAndExit('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith('aws-lza: error: Test error');
      expect(exitSpy).toHaveBeenCalledWith(1);

      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });

    test('should log error and exit with custom code', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      logErrorAndExit('Test error', 2);

      expect(consoleErrorSpy).toHaveBeenCalledWith('aws-lza: error: Test error');
      expect(exitSpy).toHaveBeenCalledWith(2);

      consoleErrorSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });
});

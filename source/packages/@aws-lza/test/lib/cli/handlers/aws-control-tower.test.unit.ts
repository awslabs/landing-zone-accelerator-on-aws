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
import { ControlTowerCommand } from '../../../../lib/cli/handlers/aws-control-tower';

vi.mock('../../../../executors/accelerator-control-tower');
vi.mock('../../../../lib/cli/handlers/root');

const mockSetupControlTowerLandingZone = vi.fn();
const mockGetConfig = vi.fn();
const mockGetSessionDetailsFromArgs = vi.fn();
const mockLogError = vi.fn();
const mockLogErrorAndExit = vi.fn();

vi.mocked(await import('../../../../executors/accelerator-control-tower')).setupControlTowerLandingZone =
  mockSetupControlTowerLandingZone;
vi.mocked(await import('../../../../lib/cli/handlers/root')).getConfig = mockGetConfig;
vi.mocked(await import('../../../../lib/cli/handlers/root')).getSessionDetailsFromArgs = mockGetSessionDetailsFromArgs;
vi.mocked(await import('../../../../lib/cli/handlers/root')).logError = mockLogError;
vi.mocked(await import('../../../../lib/cli/handlers/root')).logErrorAndExit = mockLogErrorAndExit;

describe('ControlTowerCommand', () => {
  const mockParam = {
    moduleName: 'control-tower',
    commandName: 'setup',
    args: {
      configuration: '{"version": "3.0"}',
      'dry-run': false,
    },
  };

  const mockSessionDetails = {
    accountId: '123456789012',
    region: 'us-east-1',
    partition: 'aws',
  };

  const validConfig = {
    version: '3.0',
    enabledRegions: ['us-east-1', 'us-west-2'],
    logging: {
      organizationTrail: true,
      retention: {
        loggingBucket: 365,
        accessLoggingBucket: 90,
      },
    },
    security: {
      enableIdentityCenterAccess: true,
    },
    sharedAccounts: {
      management: {
        name: 'Management',
        email: 'management@example.com',
      },
      logging: {
        name: 'Logging',
        email: 'logging@example.com',
      },
      audit: {
        name: 'Audit',
        email: 'audit@example.com',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionDetailsFromArgs.mockResolvedValue(mockSessionDetails);
    mockGetConfig.mockReturnValue(validConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execute', () => {
    test('should call setupControlTowerLandingZone with params', async () => {
      const mockResponse = 'success';
      mockSetupControlTowerLandingZone.mockResolvedValue(mockResponse);

      const result = await ControlTowerCommand.execute(mockParam);

      expect(mockSetupControlTowerLandingZone).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockSessionDetails,
          moduleName: 'control-tower',
          operation: 'setup',
          dryRun: false,
          configuration: validConfig,
        }),
      );
      expect(result).toBe(mockResponse);
    });
  });

  describe('getParams', () => {
    test('should return valid params', async () => {
      const result = await ControlTowerCommand.getParams(mockParam);

      expect(result).toEqual({
        ...mockSessionDetails,
        moduleName: 'control-tower',
        operation: 'setup',
        dryRun: false,
        configuration: validConfig,
      });
    });

    test('should exit if configuration is not string', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      const invalidParam = { ...mockParam, args: { configuration: 123 } };

      await ControlTowerCommand.getParams(invalidParam);

      expect(mockLogErrorAndExit).toHaveBeenCalledWith(
        'An error occurred (MissingRequiredParameters): The configuration parameter is a required string',
      );
      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    test('should exit if config validation fails', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      mockGetConfig.mockReturnValue({ invalid: 'config' });

      await ControlTowerCommand.getParams(mockParam);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });
  });

  describe('validConfig', () => {
    test('should return true for valid config', () => {
      expect(ControlTowerCommand.validConfig(validConfig)).toBe(true);
    });

    test('should return false for invalid version', () => {
      expect(ControlTowerCommand.validConfig({ ...validConfig, version: 123 })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.version must be a string');
    });

    test('should return false for invalid enabledRegions', () => {
      expect(ControlTowerCommand.validConfig({ ...validConfig, enabledRegions: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.enabledRegions must be an array');
    });

    test('should return false for invalid logging', () => {
      expect(ControlTowerCommand.validConfig({ ...validConfig, logging: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.logging must be an object');
    });

    test('should return false for invalid organizationTrail', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          logging: { ...validConfig.logging, organizationTrail: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        '(ConfigValidation): config.logging.organizationTrail must be a boolean',
      );
    });

    test('should return false for invalid retention', () => {
      expect(
        ControlTowerCommand.validConfig({ ...validConfig, logging: { ...validConfig.logging, retention: 'invalid' } }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.logging.retention must be an object');
    });

    test('should return false for invalid loggingBucket', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          logging: {
            ...validConfig.logging,
            retention: { ...validConfig.logging.retention, loggingBucket: 'invalid' },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        '(ConfigValidation): config.logging.retention.loggingBucket must be a number',
      );
    });

    test('should return false for invalid accessLoggingBucket', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          logging: {
            ...validConfig.logging,
            retention: { ...validConfig.logging.retention, accessLoggingBucket: 'invalid' },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        '(ConfigValidation): config.logging.retention.accessLoggingBucket must be a number',
      );
    });

    test('should return false for invalid security', () => {
      expect(ControlTowerCommand.validConfig({ ...validConfig, security: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.security must be an object');
    });

    test('should return false for invalid enableIdentityCenterAccess', () => {
      expect(
        ControlTowerCommand.validConfig({ ...validConfig, security: { enableIdentityCenterAccess: 'invalid' } }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        '(ConfigValidation): config.security.enableIdentityCenterAccess must be a boolean',
      );
    });

    test('should return false for invalid sharedAccounts', () => {
      expect(ControlTowerCommand.validConfig({ ...validConfig, sharedAccounts: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.sharedAccounts must be an object');
    });

    test('should return false for invalid management account', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          sharedAccounts: { ...validConfig.sharedAccounts, management: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        '(ConfigValidation): config.sharedAccounts.management must be an object',
      );
    });

    test('should return false for invalid management name', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          sharedAccounts: {
            ...validConfig.sharedAccounts,
            management: { ...validConfig.sharedAccounts.management, name: 123 },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        '(ConfigValidation): config.sharedAccounts.management.name must be a string',
      );
    });

    test('should return false for invalid management email', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          sharedAccounts: {
            ...validConfig.sharedAccounts,
            management: { ...validConfig.sharedAccounts.management, email: 123 },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        '(ConfigValidation): config.sharedAccounts.management.email must be a string',
      );
    });

    test('should return false for invalid logging account', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          sharedAccounts: { ...validConfig.sharedAccounts, logging: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.sharedAccounts.logging must be an object');
    });

    test('should return false for invalid audit account', () => {
      expect(
        ControlTowerCommand.validConfig({
          ...validConfig,
          sharedAccounts: { ...validConfig.sharedAccounts, audit: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith('(ConfigValidation): config.sharedAccounts.audit must be an object');
    });
  });
});

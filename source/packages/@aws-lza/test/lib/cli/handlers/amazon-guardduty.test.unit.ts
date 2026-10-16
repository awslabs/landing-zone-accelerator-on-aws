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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GuardDutyCommand } from '../../../../lib/cli/handlers/amazon-guardduty';

vi.mock('../../../../lib/guardduty/guardduty.js', () => ({
  configureGuardDuty: vi.fn(),
}));

vi.mock('../../../../lib/cli/handlers/root.js', () => ({
  getConfig: vi.fn(),
  getSessionDetailsFromArgs: vi.fn(),
  logError: vi.fn(),
  logErrorAndExit: vi.fn(),
}));

const mockConfigureGuardDuty = vi.fn();
const mockGetConfig = vi.fn();
const mockGetSessionDetailsFromArgs = vi.fn();
const mockLogError = vi.fn();
const mockLogErrorAndExit = vi.fn().mockImplementation(() => {
  throw new Error('Process exit called');
});

describe('GuardDutyCommand', () => {
  const mockParam = {
    moduleName: 'guardduty',
    commandName: 'setup',
    args: {
      _: [] as (string | number)[],
      configuration: '{"enable": true}',
      'dry-run': false,
    },
  };

  const mockSessionDetails = {
    accountId: '123456789012',
    region: 'us-east-1',
    partition: 'aws',
  };

  const validConfig = {
    enable: true,
    accountAccessRoleName: 'TestRole',
    delegatedAdminAccountId: '123456789012',
    autoEnableOrgMembers: 'NEW',
    batchOperationSettings: { maxConcurrentEnvironments: 10, operationTimeoutMs: 300000 },
    exportFrequency: 'FIFTEEN_MINUTES',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSessionDetailsFromArgs.mockResolvedValue(mockSessionDetails);
    mockGetConfig.mockReturnValue(validConfig);
    mockConfigureGuardDuty.mockResolvedValue({ success: true });

    mockLogErrorAndExit.mockImplementation(() => {
      throw new Error('Process exit called');
    });

    const guarddutyModule = await import('../../../../lib/guardduty/guardduty.js');
    const rootModule = await import('../../../../lib/cli/handlers/root.js');

    vi.mocked(guarddutyModule.configureGuardDuty).mockImplementation(mockConfigureGuardDuty);
    vi.mocked(rootModule.getConfig).mockImplementation(mockGetConfig);
    vi.mocked(rootModule.getSessionDetailsFromArgs).mockImplementation(mockGetSessionDetailsFromArgs);
    vi.mocked(rootModule.logError).mockImplementation(mockLogError);
    vi.mocked(rootModule.logErrorAndExit).mockImplementation(mockLogErrorAndExit as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('execute', () => {
    test('should call configureGuardDuty with params', async () => {
      const mockResponse = { success: true };
      mockConfigureGuardDuty.mockResolvedValue(mockResponse);

      const result = await GuardDutyCommand.execute(mockParam);

      expect(mockConfigureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockSessionDetails,
          moduleName: 'guardduty',
          operation: 'setup',
          dryRun: false,
        }),
      );
      expect(result).toBe(mockResponse);
    });
  });

  describe('getParams', () => {
    test('should return valid params', async () => {
      const result = await GuardDutyCommand.getParams(mockParam);

      expect(result).toEqual({
        ...mockSessionDetails,
        moduleName: 'guardduty',
        operation: 'setup',
        dryRun: false,
        configuration: {
          accountAccessRoleName: validConfig.accountAccessRoleName,
          enable: validConfig.enable,
          delegatedAdminAccountId: validConfig.delegatedAdminAccountId,
          autoEnableOrgMembers: validConfig.autoEnableOrgMembers,
          batchOperationSettings: validConfig.batchOperationSettings,
          exportFrequency: validConfig.exportFrequency,
        },
      });
    });

    test('should exit if configuration is not string', async () => {
      const invalidParam = {
        ...mockParam,
        args: {
          _: [] as (string | number)[],
          configuration: 123 as unknown as string,
        },
      };

      await expect(GuardDutyCommand.getParams(invalidParam)).rejects.toThrow('Process exit called');

      expect(mockLogErrorAndExit).toHaveBeenCalledWith(
        'An error occurred (MissingRequiredParameters): The configuration parameter is a required string',
      );
    });

    test('should exit if config validation fails', async () => {
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      mockGetConfig.mockReturnValue({ invalid: 'config' });

      await GuardDutyCommand.getParams(mockParam);

      expect(exitSpy).toHaveBeenCalledWith(1);
      exitSpy.mockRestore();
    });

    test('should include optional fields when present', async () => {
      const configWithOptionals = {
        ...validConfig,
        protectionsConfiguration: { s3Protection: { enable: true } },
        exportDestination: {
          destinationArn: 'arn:aws:s3:::test-bucket',
          kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test',
          destinationType: 'S3',
        },
        enableKeepMalwareSnapshots: true,
        regionFilters: { ignoredRegions: ['us-west-1'] },
        boundary: { regions: ['us-east-1'] },
      };
      mockGetConfig.mockReturnValue(configWithOptionals);

      const result = await GuardDutyCommand.getParams(mockParam);

      expect(result.configuration).toEqual(
        expect.objectContaining({
          protectionsConfiguration: configWithOptionals.protectionsConfiguration,
          exportDestination: configWithOptionals.exportDestination,
          enableKeepMalwareSnapshots: true,
          regionFilters: configWithOptionals.regionFilters,
          boundary: configWithOptionals.boundary,
        }),
      );
    });

    test('should not include enableKeepMalwareSnapshots when undefined', async () => {
      mockGetConfig.mockReturnValue(validConfig);

      const result = await GuardDutyCommand.getParams(mockParam);

      expect(result.configuration).not.toHaveProperty('enableKeepMalwareSnapshots');
    });

    test('should include enableKeepMalwareSnapshots when false', async () => {
      const configWithFalseSnapshots = { ...validConfig, enableKeepMalwareSnapshots: false };
      mockGetConfig.mockReturnValue(configWithFalseSnapshots);

      const result = await GuardDutyCommand.getParams(mockParam);

      expect(result.configuration.enableKeepMalwareSnapshots).toBe(false);
    });
  });

  describe('validConfig', () => {
    test('should return true for valid config', () => {
      expect(GuardDutyCommand.validConfig(validConfig)).toBe(true);
    });

    test('should return false for invalid enable', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, enable: 'true' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.enable'));
    });

    test('should return false for invalid accountAccessRoleName', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, accountAccessRoleName: 123 })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.accountAccessRoleName'));
    });

    test('should return false for invalid delegatedAdminAccountId', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, delegatedAdminAccountId: 123 })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.delegatedAdminAccountId'));
    });

    test('should return false for non-string autoEnableOrgMembers', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, autoEnableOrgMembers: 123 })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.autoEnableOrgMembers'));
    });

    test('should return false for invalid autoEnableOrgMembers value', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, autoEnableOrgMembers: 'INVALID' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.autoEnableOrgMembers'));
    });

    test('should return false for invalid exportFrequency type', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, exportFrequency: 123 })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportFrequency'));
    });

    test('should return false for invalid exportFrequency value', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, exportFrequency: 'INVALID' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportFrequency'));
    });

    test('should return false for invalid enableKeepMalwareSnapshots', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, enableKeepMalwareSnapshots: 'true' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.enableKeepMalwareSnapshots'));
    });

    test('should return true when enableKeepMalwareSnapshots is valid boolean', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, enableKeepMalwareSnapshots: true })).toBe(true);
    });

    test('should return true when enableKeepMalwareSnapshots is undefined', () => {
      expect(GuardDutyCommand.validConfig(validConfig)).toBe(true);
    });
  });

  describe('validConfig - protectionsConfiguration', () => {
    test('should return true when protectionsConfiguration is undefined', () => {
      expect(GuardDutyCommand.validConfig(validConfig)).toBe(true);
    });

    test('should return false for invalid protectionsConfiguration type', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, protectionsConfiguration: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.protectionsConfiguration'));
    });

    test('should return false when s3Protection is missing', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, protectionsConfiguration: {} })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.s3Protection'),
      );
    });

    test('should return false for invalid s3Protection type', () => {
      expect(
        GuardDutyCommand.validConfig({ ...validConfig, protectionsConfiguration: { s3Protection: 'invalid' } }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.s3Protection'),
      );
    });

    test('should return false for s3Protection missing enable', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { notEnable: true } },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.s3Protection.enable'),
      );
    });

    test('should return false for s3Protection invalid excludedRegions', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true, excludedRegions: 'invalid' } },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.s3Protection.excludedRegions'),
      );
    });

    test('should return true for valid s3Protection with excludedRegions', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true, excludedRegions: ['us-west-1'] } },
        }),
      ).toBe(true);
    });

    test('should return true for valid s3Protection only', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true } },
        }),
      ).toBe(true);
    });

    // eksProtection tests
    test('should return false for invalid eksProtection type', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, eksProtection: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.eksProtection'),
      );
    });

    test('should return true for eksProtection without granular flags (features omitted)', () => {
      // auditLogs/runtimeMonitoring are optional; when omitted the features are simply not sent
      // to GuardDuty, so a block with only manageAgent is valid.
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, eksProtection: { manageAgent: true } },
        }),
      ).toBe(true);
    });

    test('should return true for empty eksProtection (all features omitted)', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, eksProtection: {} },
        }),
      ).toBe(true);
    });

    test('should return false for eksProtection invalid auditLogs', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            eksProtection: { auditLogs: 'invalid', runtimeMonitoring: false },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.eksProtection.auditLogs'),
      );
    });

    test('should return false for eksProtection invalid runtimeMonitoring', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            eksProtection: { auditLogs: true, runtimeMonitoring: 'invalid' },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.eksProtection.runtimeMonitoring'),
      );
    });

    test('should return false for eksProtection invalid manageAgent', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            eksProtection: { auditLogs: true, runtimeMonitoring: true, manageAgent: 'invalid' },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.eksProtection.manageAgent'),
      );
    });

    test('should return true for valid eksProtection with manageAgent', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            eksProtection: { auditLogs: true, runtimeMonitoring: true, manageAgent: true },
          },
        }),
      ).toBe(true);
    });

    test('should return true for valid eksProtection without manageAgent', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            eksProtection: { auditLogs: true, runtimeMonitoring: false },
          },
        }),
      ).toBe(true);
    });

    test('should return false for eksProtection invalid excludedRegions', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            eksProtection: { auditLogs: true, runtimeMonitoring: true, excludedRegions: 'invalid' },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.eksProtection.excludedRegions'),
      );
    });

    // ec2Protection tests
    test('should return false for invalid ec2Protection type', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, ec2Protection: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.ec2Protection'),
      );
    });

    test('should return false for ec2Protection missing enable', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, ec2Protection: { keepSnapshots: true } },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.ec2Protection.enable'),
      );
    });

    test('should return false for ec2Protection invalid keepSnapshots', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            ec2Protection: { enable: true, keepSnapshots: 'invalid' },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.ec2Protection.keepSnapshots'),
      );
    });

    test('should return true for valid ec2Protection', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            ec2Protection: { enable: true, keepSnapshots: false },
          },
        }),
      ).toBe(true);
    });

    test('should return false for ec2Protection invalid excludedRegions', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            ec2Protection: { enable: true, keepSnapshots: true, excludedRegions: 'invalid' },
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.ec2Protection.excludedRegions'),
      );
    });

    // rdsProtection tests
    test('should return false for invalid rdsProtection type', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, rdsProtection: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.rdsProtection'),
      );
    });

    test('should return false for rdsProtection missing enable', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, rdsProtection: { notEnable: true } },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.rdsProtection.enable'),
      );
    });

    test('should return true for valid rdsProtection', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, rdsProtection: { enable: true } },
        }),
      ).toBe(true);
    });

    // lambdaProtection tests
    test('should return false for invalid lambdaProtection type', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, lambdaProtection: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.lambdaProtection'),
      );
    });

    test('should return false for lambdaProtection missing enable', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, lambdaProtection: { notEnable: true } },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.protectionsConfiguration.lambdaProtection.enable'),
      );
    });

    test('should return true for valid lambdaProtection', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: { s3Protection: { enable: true }, lambdaProtection: { enable: true } },
        }),
      ).toBe(true);
    });

    test('should return true for all protections valid', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          protectionsConfiguration: {
            s3Protection: { enable: true },
            eksProtection: { auditLogs: true, runtimeMonitoring: true, manageAgent: false },
            ec2Protection: { enable: true, keepSnapshots: true },
            rdsProtection: { enable: false },
            lambdaProtection: { enable: true },
          },
        }),
      ).toBe(true);
    });
  });

  describe('validConfig - exportDestination', () => {
    test('should return true when exportDestination is undefined', () => {
      expect(GuardDutyCommand.validConfig(validConfig)).toBe(true);
    });

    test('should return false for invalid exportDestination type', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, exportDestination: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportDestination'));
    });

    test('should return false for invalid destinationArn', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          exportDestination: { destinationArn: 123 },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportDestination.destinationArn'));
    });

    test('should return false for invalid kmsKeyArn', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          exportDestination: { destinationArn: 'arn:aws:s3:::bucket', kmsKeyArn: 123 },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportDestination.kmsKeyArn'));
    });

    test('should return false for invalid destinationType type', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          exportDestination: {
            destinationArn: 'arn:aws:s3:::bucket',
            kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test',
            destinationType: 123,
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportDestination.destinationType'));
    });

    test('should return false for invalid destinationType value', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          exportDestination: {
            destinationArn: 'arn:aws:s3:::bucket',
            kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test',
            destinationType: 'INVALID',
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportDestination.destinationType'));
    });

    test('should return false for invalid overrideExisting', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          exportDestination: {
            destinationArn: 'arn:aws:s3:::bucket',
            kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test',
            destinationType: 'S3',
            overrideExisting: 'true',
          },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.exportDestination.overrideExisting'));
    });

    test('should return true for valid exportDestination without overrideExisting', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          exportDestination: {
            destinationArn: 'arn:aws:s3:::bucket',
            kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test',
            destinationType: 'S3',
          },
        }),
      ).toBe(true);
    });

    test('should return true for valid exportDestination with overrideExisting', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          exportDestination: {
            destinationArn: 'arn:aws:s3:::bucket',
            kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/test',
            destinationType: 'S3',
            overrideExisting: true,
          },
        }),
      ).toBe(true);
    });
  });

  describe('validConfig - regionFilters', () => {
    test('should return true when regionFilters is undefined', () => {
      expect(GuardDutyCommand.validConfig(validConfig)).toBe(true);
    });

    test('should return false for invalid regionFilters type', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, regionFilters: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.regionFilters'));
    });

    test('should return false for invalid ignoredRegions', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, regionFilters: { ignoredRegions: 'invalid' } })).toBe(
        false,
      );
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.regionFilters.ignoredRegions'));
    });

    test('should return false for invalid disabledRegions', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, regionFilters: { disabledRegions: 'invalid' } })).toBe(
        false,
      );
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.regionFilters.disabledRegions'));
    });

    test('should return true for valid regionFilters', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          regionFilters: { ignoredRegions: [], disabledRegions: [] },
        }),
      ).toBe(true);
    });
  });

  describe('validConfig - boundary', () => {
    test('should return true when boundary is undefined', () => {
      expect(GuardDutyCommand.validConfig(validConfig)).toBe(true);
    });

    test('should return false for invalid boundary type', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, boundary: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.boundary'));
    });

    test('should return false for invalid boundary.regions', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, boundary: { regions: 'invalid' } })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.boundary.regions'));
    });

    test('should return true for valid boundary', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, boundary: { regions: ['us-east-1'] } })).toBe(true);
    });
  });

  describe('validConfig - batchOperationSettings', () => {
    test('should return true when batchOperationSettings is undefined', () => {
      const { batchOperationSettings: _unused, ...configWithoutBatch } = validConfig;
      void _unused;
      expect(GuardDutyCommand.validConfig(configWithoutBatch)).toBe(true);
    });

    test('should return false for invalid batchOperationSettings type', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, batchOperationSettings: 'invalid' })).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('config.batchOperationSettings'));
    });

    test('should return false for invalid maxConcurrentEnvironments type', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { maxConcurrentEnvironments: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.batchOperationSettings.maxConcurrentEnvironments'),
      );
    });

    test('should return false for maxConcurrentEnvironments <= 0', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { maxConcurrentEnvironments: 0 },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.batchOperationSettings.maxConcurrentEnvironments'),
      );
    });

    test('should return false for negative maxConcurrentEnvironments', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { maxConcurrentEnvironments: -1 },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.batchOperationSettings.maxConcurrentEnvironments'),
      );
    });

    test('should return false for invalid operationTimeoutMs type', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { operationTimeoutMs: 'invalid' },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.batchOperationSettings.operationTimeoutMs'),
      );
    });

    test('should return false for operationTimeoutMs <= 0', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { operationTimeoutMs: 0 },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.batchOperationSettings.operationTimeoutMs'),
      );
    });

    test('should return false for negative operationTimeoutMs', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { operationTimeoutMs: -1 },
        }),
      ).toBe(false);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('config.batchOperationSettings.operationTimeoutMs'),
      );
    });

    test('should return true for valid maxConcurrentEnvironments only', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { maxConcurrentEnvironments: 10 },
        }),
      ).toBe(true);
    });

    test('should return true for valid operationTimeoutMs only', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { operationTimeoutMs: 300000 },
        }),
      ).toBe(true);
    });

    test('should return true for valid batchOperationSettings config', () => {
      expect(
        GuardDutyCommand.validConfig({
          ...validConfig,
          batchOperationSettings: { maxConcurrentEnvironments: 10, operationTimeoutMs: 300000 },
        }),
      ).toBe(true);
    });

    test('should return true for empty batchOperationSettings object', () => {
      expect(GuardDutyCommand.validConfig({ ...validConfig, batchOperationSettings: {} })).toBe(true);
    });
  });
});

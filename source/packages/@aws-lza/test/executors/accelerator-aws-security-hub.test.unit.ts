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

import { describe, beforeEach, afterEach, expect, test, vi } from 'vitest';

import { SecurityHubManageOrganizationAdminModule } from '../../lib/security-hub/manage-organization-admin';
import { SecurityHubManageAutomationRulesModule } from '../../lib/security-hub/manage-automation-rules';
import {
  manageSecurityHubOrganizationAdminAccount,
  manageSecurityHubAutomationRules,
} from '../../executors/accelerator-security-hub';

const MOCK_CONSTANTS = {
  organizationAdminInput: {
    operation: 'manage-organization-admin',
    partition: 'aws',
    region: 'us-east-1',
    configuration: {
      enable: true,
      accountId: '123456789012',
    },
    dryRun: false,
    solutionId: 'test',
  },
  automationRulesInput: {
    operation: 'manage-automation-rules',
    partition: 'aws',
    region: 'us-east-1',
    configuration: {
      automationRules: [
        {
          name: 'SuppressLowSeverityFindings',
          description: 'Automatically suppress low severity findings',
          enabled: true,
          actions: [
            {
              type: 'FINDING_FIELDS_UPDATE',
              findingFieldsUpdate: {
                workflowStatus: 'SUPPRESSED',
                note: {
                  text: 'Automatically suppressed by automation rule',
                  updatedBy: 'SecurityTeam',
                },
              },
            },
          ],
          criteria: [
            {
              key: 'SeverityLabel',
              filter: [
                {
                  value: 'LOW',
                  comparison: 'EQUALS' as const,
                },
              ],
            },
          ],
          ruleOrder: 1,
          isTerminal: false,
        },
      ],
    },
    dryRun: false,
    solutionId: 'test',
  },
};

// Mock dependencies
vi.mock('../../lib/security-hub/manage-organization-admin/index');
vi.mock('../../lib/security-hub/manage-automation-rules/index');

describe('SecurityHubExecutors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('manageSecurityHubOrganizationAdminAccount', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should successfully set organization admin', async () => {
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');
      (SecurityHubManageOrganizationAdminModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await manageSecurityHubOrganizationAdminAccount(MOCK_CONSTANTS.organizationAdminInput);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.organizationAdminInput);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should successfully disable organization admin', async () => {
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');
      (SecurityHubManageOrganizationAdminModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDisable = {
        ...MOCK_CONSTANTS.organizationAdminInput,
        configuration: {
          enable: false,
          accountId: '123456789012',
        },
      };

      const result = await manageSecurityHubOrganizationAdminAccount(inputWithDisable);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithDisable);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle dry run mode', async () => {
      const mockHandler = vi.fn().mockResolvedValue('DRY_RUN_SUCCESS');
      (SecurityHubManageOrganizationAdminModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDryRun = {
        ...MOCK_CONSTANTS.organizationAdminInput,
        dryRun: true,
      };

      const result = await manageSecurityHubOrganizationAdminAccount(inputWithDryRun);

      expect(result).toBe('DRY_RUN_SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithDryRun);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when setup fails', async () => {
      const errorMessage = 'failed to manage security hub organization admin';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));
      (SecurityHubManageOrganizationAdminModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(manageSecurityHubOrganizationAdminAccount(MOCK_CONSTANTS.organizationAdminInput)).rejects.toThrow(
        errorMessage,
      );

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.organizationAdminInput);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when handler throws unknown error', async () => {
      const errorMessage = 'unknown error occurred';
      const mockHandler = vi.fn().mockRejectedValue(errorMessage);
      (SecurityHubManageOrganizationAdminModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(manageSecurityHubOrganizationAdminAccount(MOCK_CONSTANTS.organizationAdminInput)).rejects.toBe(
        errorMessage,
      );

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.organizationAdminInput);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle different partition', async () => {
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');
      (SecurityHubManageOrganizationAdminModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithGovCloud = {
        ...MOCK_CONSTANTS.organizationAdminInput,
        partition: 'aws-us-gov',
      };

      const result = await manageSecurityHubOrganizationAdminAccount(inputWithGovCloud);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithGovCloud);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle different region', async () => {
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');
      (SecurityHubManageOrganizationAdminModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDifferentRegion = {
        ...MOCK_CONSTANTS.organizationAdminInput,
        region: 'us-west-2',
      };

      const result = await manageSecurityHubOrganizationAdminAccount(inputWithDifferentRegion);

      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(inputWithDifferentRegion);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    describe('Uncaught Exception Handler', () => {
      let originalProcessOn: typeof process.on;
      let processOnCallback: NodeJS.UncaughtExceptionListener;

      beforeEach(() => {
        originalProcessOn = process.on;

        process.on = vi.fn((event: string, listener: NodeJS.UncaughtExceptionListener) => {
          if (event === 'uncaughtException') {
            processOnCallback = listener;
          }
          return process;
        }) as unknown as typeof process.on;

        vi.resetModules();
      });

      afterEach(() => {
        process.on = originalProcessOn;
      });

      test('should register uncaughtException handler', async () => {
        await import('../../executors/accelerator-security-hub');

        expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      });

      test('should rethrow the error when uncaughtException occurs', async () => {
        await import('../../executors/accelerator-security-hub');

        const testError = new Error('Test uncaught exception');
        const origin = 'uncaughtException';

        expect(processOnCallback).toBeDefined();

        expect(() => {
          processOnCallback(testError, origin);
        }).toThrow(testError);
      });
    });
  });

  describe('manageSecurityHubAutomationRules', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should successfully manage automation rules', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        status: true,
        message: 'Successfully created automation rules: SuppressLowSeverityFindings',
      });
      (SecurityHubManageAutomationRulesModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await manageSecurityHubAutomationRules(MOCK_CONSTANTS.automationRulesInput);

      expect(result).toBe('Successfully created automation rules: SuppressLowSeverityFindings');
      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.automationRulesInput);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle dry run mode for automation rules', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        status: true,
        message: 'DRY_RUN: SuppressLowSeverityFindings will be created',
      });
      (SecurityHubManageAutomationRulesModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDryRun = {
        ...MOCK_CONSTANTS.automationRulesInput,
        dryRun: true,
      };

      const result = await manageSecurityHubAutomationRules(inputWithDryRun);

      expect(result).toBe('DRY_RUN: SuppressLowSeverityFindings will be created');
      expect(mockHandler).toHaveBeenCalledWith(inputWithDryRun);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle error in executor', async () => {
      const mockHandler = vi.fn().mockRejectedValue(new Error('Error'));
      (SecurityHubManageAutomationRulesModule as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDryRun = {
        ...MOCK_CONSTANTS.automationRulesInput,
      };

      await expect(manageSecurityHubAutomationRules(inputWithDryRun)).rejects.toThrowError('Error');

      expect(mockHandler).toHaveBeenCalledWith(inputWithDryRun);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });
});

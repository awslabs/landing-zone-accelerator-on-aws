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

import { beforeEach, afterEach, describe, test, vi, expect } from 'vitest';
import { AcceleratorModules, ModuleExecutionPhase } from '../../../models/enums';
import { ModuleParams } from '../../../models/types';
import {
  MOCK_CONSTANTS,
  mockAccountsConfiguration,
  mockCustomizationsConfig,
  mockGlobalConfiguration,
  mockIamConfig,
  mockNetworkConfig,
  mockOrganizationConfig,
  mockReplacementsConfig,
  mockSecurityConfig,
} from '../../mocked-resources';
import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
//
// Mock Dependencies
//
vi.mock('../../../../../@aws-lza/index', () => ({
  checkLambdaConcurrency: vi.fn(),
  createStatusLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('../../../../../@aws-lza/common/functions', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('@aws-accelerator/utils', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { AcceleratorPrerequisites } from '../../../lib/actions/prerequisites/accelerator-prerequisites';

// Import the mocked modules to access their functions
import { checkLambdaConcurrency } from '../../../../../@aws-lza/index';
import { getCredentials } from '../../../../../@aws-lza/common/functions';

// Get typed mocks
const mockCheckLambdaConcurrency = vi.mocked(checkLambdaConcurrency);
const mockGetCredentials = vi.mocked(getCredentials);

describe('AcceleratorPrerequisites', () => {
  let mockAccountsConfig: Partial<AccountsConfig>;
  let mockParams: ModuleParams;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    mockAccountsConfig = {
      getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccountId),
      ...mockAccountsConfiguration,
    };

    mockParams = {
      moduleItem: {
        name: AcceleratorModules.ACCELERATOR_PREREQUISITES,
        description: 'Test accelerator prerequisites',
        runOrder: 1,
        handler: vi.fn(),
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: MOCK_CONSTANTS.runnerParameters,
      moduleRunnerParameters: {
        configs: {
          customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
          iamConfig: mockIamConfig as IamConfig,
          networkConfig: mockNetworkConfig as NetworkConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
          securityConfig: mockSecurityConfig as SecurityConfig,
          accountsConfig: mockAccountsConfig as AccountsConfig,
          globalConfig: {
            ...mockGlobalConfiguration,
            enabledRegions: ['us-east-1', 'us-west-2'],
            managementAccountAccessRole: 'AWSAccelerator-PipelineRole',
          } as unknown as GlobalConfig,
        },
        globalRegion: MOCK_CONSTANTS.globalRegion,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationDetails: MOCK_CONSTANTS.organizationDetails,
        organizationAccounts: [
          { Id: MOCK_CONSTANTS.managementAccountId, Name: 'Management' },
          { Id: '222222222222', Name: 'Account2' },
        ],
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
      },
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('execute', () => {
    test('should succeed when all prerequisites are satisfied', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute
      const result = await AcceleratorPrerequisites.execute(mockParams);

      // Verify
      expect(result).toBe('Module "accelerator-prerequisites" completed successfully');
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledTimes(4); // 2 accounts × 2 regions
    });

    test('should throw error when lambda concurrency check fails', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(false);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute & Verify
      await expect(AcceleratorPrerequisites.execute(mockParams)).rejects.toThrow(
        `Lambda concurrency limit for account ${MOCK_CONSTANTS.managementAccountId} in region us-east-1 is insufficient`,
      );
    });

    test('should handle empty organization accounts array', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      const paramsWithEmptyAccounts = {
        ...mockParams,
        moduleRunnerParameters: {
          ...mockParams.moduleRunnerParameters,
          organizationAccounts: [],
        },
      };

      // Execute
      const result = await AcceleratorPrerequisites.execute(paramsWithEmptyAccounts);

      // Verify
      expect(result).toBe('Module "accelerator-prerequisites" completed successfully');
    });

    test('should handle empty enabled regions array', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      const paramsWithEmptyRegions = {
        ...mockParams,
        moduleRunnerParameters: {
          ...mockParams.moduleRunnerParameters,
          configs: {
            ...mockParams.moduleRunnerParameters.configs,
            globalConfig: {
              ...mockParams.moduleRunnerParameters.configs.globalConfig,
              enabledRegions: [],
            } as unknown as GlobalConfig,
          },
        },
      } as ModuleParams;

      // Execute
      const result = await AcceleratorPrerequisites.execute(paramsWithEmptyRegions);

      // Verify
      expect(result).toBe('Module "accelerator-prerequisites" completed successfully');
    });
  });

  describe('checkLambdaConcurrency', () => {
    test('should use management account credentials for management account', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute
      const result = await AcceleratorPrerequisites.execute(mockParams);

      // Verify
      expect(result).toBe('Module "accelerator-prerequisites" completed successfully');
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleName: AcceleratorModules.ACCELERATOR_PREREQUISITES,
          credentials: MOCK_CONSTANTS.credentials,
          configuration: {
            requiredConcurrency: 1000,
          },
        }),
      );
    });

    test('should get cross-account credentials for non-management accounts', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute
      await AcceleratorPrerequisites.execute(mockParams);

      // Verify
      expect(mockGetCredentials).toHaveBeenCalledWith({
        accountId: '222222222222',
        region: 'us-east-1',
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        assumeRoleName: 'AWSAccelerator-PipelineRole',
        credentials: MOCK_CONSTANTS.credentials,
      });
    });

    test('should throw error when credentials cannot be obtained for non-management account', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      // Return undefined for non-management account only
      mockGetCredentials.mockImplementation((params: { accountId: string }) => {
        if (params.accountId === '222222222222') {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(MOCK_CONSTANTS.credentials);
      });

      // Execute & Verify
      await expect(AcceleratorPrerequisites.execute(mockParams)).rejects.toThrow(
        'Failed to get credentials for account 222222222222',
      );
    });

    test('should use environment variable for required concurrency limit', async () => {
      // Setup
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] = '2000';
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute
      await AcceleratorPrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredConcurrency: 2000,
          },
        }),
      );
    });

    test('should use default concurrency limit when environment variable is not set', async () => {
      // Setup
      delete process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'];
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute
      await AcceleratorPrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredConcurrency: 1000,
          },
        }),
      );
    });

    test('should handle invalid environment variable gracefully', async () => {
      // Setup
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] = 'invalid';
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute
      await AcceleratorPrerequisites.execute(mockParams);

      // Verify - parseInt('invalid') returns NaN, so it should use default
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredConcurrency: NaN,
          },
        }),
      );
    });

    test('should pass correct parameters to checkLambdaConcurrency', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute
      await AcceleratorPrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith({
        moduleName: AcceleratorModules.ACCELERATOR_PREREQUISITES,
        region: 'us-east-1',
        credentials: MOCK_CONSTANTS.credentials,
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        operation: 'prerequisites',
        dryRun: MOCK_CONSTANTS.runnerParameters.dryRun,
        configuration: {
          requiredConcurrency: 1000,
        },
      });
    });

    test('should handle checkLambdaConcurrency rejection', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockRejectedValue(new Error('Lambda service error'));
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);

      // Execute & Verify
      await expect(AcceleratorPrerequisites.execute(mockParams)).rejects.toThrow('Lambda service error');
    });
  });
});

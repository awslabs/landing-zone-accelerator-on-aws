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
import { PipelinePrerequisites } from '../../../lib/actions/prerequisites/pipeline-prerequisites';

//
// Mock Dependencies
//
vi.mock('../../../../../@aws-lza/index', () => ({
  checkLambdaConcurrency: vi.fn(),
  checkServiceQuota: vi.fn(),
  getServiceQuotaCode: vi.fn(),
  createStatusLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock('@aws-accelerator/utils', () => ({
  getGlobalRegion: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Import the mocked modules to access their functions
import { checkLambdaConcurrency, checkServiceQuota, getServiceQuotaCode } from '../../../../../@aws-lza/index';
import { getGlobalRegion } from '@aws-accelerator/utils';

// Get typed mocks
const mockCheckLambdaConcurrency = vi.mocked(checkLambdaConcurrency);
const mockCheckServiceQuota = vi.mocked(checkServiceQuota);
const mockGetServiceQuotaCode = vi.mocked(getServiceQuotaCode);
const mockGetGlobalRegion = vi.mocked(getGlobalRegion);

describe('PipelinePrerequisites', () => {
  let mockAccountsConfig: Partial<AccountsConfig>;
  let mockParams: ModuleParams;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };

    // Set up default mock behaviors
    mockGetServiceQuotaCode.mockResolvedValue('L-2DC20C30');

    mockAccountsConfig = {
      getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccountId),
      ...mockAccountsConfiguration,
    };

    mockParams = {
      moduleItem: {
        name: AcceleratorModules.PIPELINE_PREREQUISITES,
        description: 'Test pipeline prerequisites',
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
            homeRegion: 'us-east-1',
          } as unknown as GlobalConfig,
        },
        globalRegion: MOCK_CONSTANTS.globalRegion,
        resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
        acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
        logging: MOCK_CONSTANTS.logging,
        organizationDetails: MOCK_CONSTANTS.organizationDetails,
        organizationAccounts: MOCK_CONSTANTS.organizationAccounts,
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
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      const result = await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(result).toBe('Module "pipeline-prerequisites" completed successfully');
      expect(mockCheckServiceQuota).toHaveBeenCalledTimes(1); // CodeBuild check in home region
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledTimes(1); // Lambda check in home region only
    });

    test('should throw error when CodeBuild limit check fails', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(false);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute & Verify
      await expect(PipelinePrerequisites.execute(mockParams)).rejects.toThrow(
        'CodeBuild concurrency limit for pipeline account in home region us-east-1 is insufficient',
      );
    });

    test('should throw error when Lambda concurrency check fails in home region', async () => {
      // Setup
      mockCheckServiceQuota.mockResolvedValue(true);
      mockCheckLambdaConcurrency.mockResolvedValueOnce(false); // First call (home region) fails
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute & Verify
      await expect(PipelinePrerequisites.execute(mockParams)).rejects.toThrow(
        'Lambda concurrency for pipeline account in home region us-east-1 is insufficient',
      );
    });

    test('should throw error when Lambda concurrency check fails in global region', async () => {
      // Setup
      mockCheckServiceQuota.mockResolvedValue(true);
      mockCheckLambdaConcurrency.mockResolvedValue(false); // Lambda check fails
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute & Verify
      await expect(PipelinePrerequisites.execute(mockParams)).rejects.toThrow(
        'Lambda concurrency for pipeline account in home region us-east-1 is insufficient',
      );
    });

    test('should handle same home and global region', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-east-1'); // Same as home region

      // Execute
      const result = await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(result).toBe('Module "pipeline-prerequisites" completed successfully');
      expect(mockCheckServiceQuota).toHaveBeenCalledTimes(1);
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledTimes(1); // Only called once for home region
    });
  });

  describe('checkLambdaConcurrency', () => {
    test('should use default concurrency limit when environment variable is not set', async () => {
      // Setup
      delete process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'];

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredConcurrency: 1000,
          },
        }),
      );
    });

    test('should use environment variable for required concurrency limit', async () => {
      // Setup
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] = '2000';

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredConcurrency: 2000,
          },
        }),
      );
    });

    test('should handle invalid environment variable gracefully', async () => {
      // Setup
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] = 'invalid';

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify - parseInt('invalid') returns NaN
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
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify home region call
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith({
        moduleName: AcceleratorModules.PIPELINE_PREREQUISITES,
        region: 'us-east-1',
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
      mockCheckServiceQuota.mockResolvedValue(true);
      mockCheckLambdaConcurrency.mockRejectedValue(new Error('Lambda service error'));
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute & Verify
      await expect(PipelinePrerequisites.execute(mockParams)).rejects.toThrow('Lambda service error');
    });
  });

  describe('checkCodeBuildLimit', () => {
    test('should use default service quota when environment variable is not set', async () => {
      // Setup
      delete process.env['ACCELERATOR_CODEBUILD_PARALLEL_LIMIT'];

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckServiceQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredServiceQuota: 3,
            serviceCode: 'codebuild',
            quotaCode: 'L-2DC20C30',
          },
        }),
      );
    });

    test('should use environment variable for required service quota', async () => {
      // Setup
      process.env['ACCELERATOR_CODEBUILD_PARALLEL_LIMIT'] = '10';

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckServiceQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredServiceQuota: 10,
            serviceCode: 'codebuild',
            quotaCode: 'L-2DC20C30',
          },
        }),
      );
    });

    test('should handle invalid environment variable gracefully', async () => {
      // Setup
      process.env['ACCELERATOR_CODEBUILD_PARALLEL_LIMIT'] = 'invalid';

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify - parseInt('invalid') returns NaN
      expect(mockCheckServiceQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredServiceQuota: NaN,
            serviceCode: 'codebuild',
            quotaCode: 'L-2DC20C30',
          },
        }),
      );
    });

    test('should pass correct parameters to checkServiceQuota', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(mockCheckServiceQuota).toHaveBeenCalledWith({
        moduleName: AcceleratorModules.PIPELINE_PREREQUISITES,
        region: 'us-east-1',
        solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
        partition: MOCK_CONSTANTS.runnerParameters.partition,
        operation: 'prerequisites',
        dryRun: MOCK_CONSTANTS.runnerParameters.dryRun,
        configuration: {
          requiredServiceQuota: 3,
          serviceCode: 'codebuild',
          quotaCode: 'L-2DC20C30',
        },
      });
    });

    test('should handle checkServiceQuota rejection', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockRejectedValue(new Error('CodeBuild service error'));
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute & Verify
      await expect(PipelinePrerequisites.execute(mockParams)).rejects.toThrow('CodeBuild service error');
    });

    test('should skip CodeBuild check when getServiceQuotaCode returns null', async () => {
      // Setup
      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockGetServiceQuotaCode.mockResolvedValue(null); // This will trigger the skip logic
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      const result = await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(result).toBe('Module "pipeline-prerequisites" completed successfully');
      expect(mockGetServiceQuotaCode).toHaveBeenCalledTimes(1);
      expect(mockCheckServiceQuota).toHaveBeenCalledTimes(0); // Should not be called since we skip the check
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledTimes(1); // Lambda check should still run
    });
  });

  describe('integration scenarios', () => {
    test('should handle both environment variables set', async () => {
      // Setup
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] = '1500';
      process.env['ACCELERATOR_CODEBUILD_PARALLEL_LIMIT'] = '5';

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      const result = await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(result).toBe('Module "pipeline-prerequisites" completed successfully');
      expect(mockCheckServiceQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredServiceQuota: 5,
            serviceCode: 'codebuild',
            quotaCode: 'L-2DC20C30',
          },
        }),
      );
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredConcurrency: 1500,
          },
        }),
      );
    });

    test('should handle multiple prerequisite failures', async () => {
      // Setup
      mockCheckServiceQuota.mockResolvedValue(false); // CodeBuild check fails
      mockCheckLambdaConcurrency.mockResolvedValue(false); // Lambda checks fail

      // Execute & Verify
      await expect(PipelinePrerequisites.execute(mockParams)).rejects.toThrow();

      // Should include both error messages
      try {
        await PipelinePrerequisites.execute(mockParams);
      } catch (error) {
        expect((error as Error).message).toContain(
          'CodeBuild concurrency limit for pipeline account in home region us-east-1 is insufficient',
        );
        expect((error as Error).message).toContain(
          'Lambda concurrency for pipeline account in home region us-east-1 is insufficient',
        );
      }
    });

    test('should handle zero values in environment variables', async () => {
      // Setup
      process.env['ACCELERATOR_LAMBDA_CONCURRENCY_LIMIT'] = '0';
      process.env['ACCELERATOR_CODEBUILD_PARALLEL_LIMIT'] = '0';

      mockCheckLambdaConcurrency.mockResolvedValue(true);
      mockCheckServiceQuota.mockResolvedValue(true);
      mockGetGlobalRegion.mockReturnValue('us-west-2');

      // Execute
      const result = await PipelinePrerequisites.execute(mockParams);

      // Verify
      expect(result).toBe('Module "pipeline-prerequisites" completed successfully');
      expect(mockCheckServiceQuota).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredServiceQuota: 0,
            serviceCode: 'codebuild',
            quotaCode: 'L-2DC20C30',
          },
        }),
      );
      expect(mockCheckLambdaConcurrency).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: {
            requiredConcurrency: 0,
          },
        }),
      );
    });
  });
});

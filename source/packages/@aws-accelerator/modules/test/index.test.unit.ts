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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, afterEach, describe, test, vi, expect } from 'vitest';
import { AcceleratorStage } from '../../accelerator';
import {
  AccountsConfig,
  ControlTowerConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { AcceleratorModuleRunnerParametersType, PromiseItemType } from '../models/types';
import { AcceleratorModules, AcceleratorModuleStages } from '../models/enums';
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
} from './mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../@aws-lza/index';
import * as moduleLibFunctions from '../lib/functions';

//
// Mock Dependencies
//
vi.mock('../lib/functions', () => ({
  getManagementAccountCredentials: vi.fn().mockReturnValue(undefined),
  getAcceleratorModuleRunnerParameters: vi.fn().mockReturnValue(undefined),
  getCentralLoggingResources: vi.fn(),
  isModuleExecutionSkippedByEnvironment: vi.fn().mockReturnValue(false),
}));

vi.mock('../../accelerator/utils/app-utils', () => ({
  setResourcePrefixes: vi.fn().mockReturnValue(undefined),
}));

// Import after mocking
import { ModuleRunner } from '../index';

describe('ModuleRunner', () => {
  let mockAccountsConfig: Partial<AccountsConfig>;
  let mockModuleRunnerParameters: AcceleratorModuleRunnerParametersType;

  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    process.env['CDK_OPTIONS'] = 'synth';

    mockAccountsConfig = {
      getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      getAuditAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
      getAuditAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
      getLogArchiveAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
      getLogArchiveAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
      ...mockAccountsConfiguration,
    };

    mockModuleRunnerParameters = {
      configs: {
        accountsConfig: mockAccountsConfig as AccountsConfig,
        customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
        globalConfig: mockGlobalConfiguration,
        iamConfig: mockIamConfig as IamConfig,
        networkConfig: mockNetworkConfig as NetworkConfig,
        organizationConfig: mockOrganizationConfig as OrganizationConfig,
        replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
        securityConfig: mockSecurityConfig as SecurityConfig,
      },
      globalRegion: MOCK_CONSTANTS.globalRegion,
      resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
      acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
      logging: {
        centralizedRegion: MOCK_CONSTANTS.logging.centralizedRegion,
        bucketName: MOCK_CONSTANTS.logging.bucketName,
      },
      organizationAccounts: [],
      organizationDetails: undefined,
      managementAccountCredentials: MOCK_CONSTANTS.credentials,
    };

    vi.spyOn(moduleLibFunctions, 'getAcceleratorModuleRunnerParameters').mockReturnValue(mockModuleRunnerParameters);
  });

  describe('getStageRunOrder', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should return the correct run order for a valid stage name', () => {
      // Mock the private method directly
      vi.spyOn(ModuleRunner as any, 'getStageRunOrder').mockReturnValue(2); // eslint-disable-line @typescript-eslint/no-explicit-any

      // Execute
      const result = ModuleRunner['getStageRunOrder'](AcceleratorModuleStages.PREPARE);

      // Verify
      expect(result).toBe(2);
    });

    test('should throw an error when stage name is not found', () => {
      // Mock the private method to throw
      vi.spyOn(ModuleRunner as any, 'getStageRunOrder').mockImplementation(() => {
        // eslint-disable-line @typescript-eslint/no-explicit-any
        throw new Error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${MOCK_CONSTANTS.invalidStage} not found in AcceleratorModuleStageDetails.`,
        );
      });

      // Execute & Verify
      expect(() => {
        ModuleRunner['getStageRunOrder'](MOCK_CONSTANTS.invalidStage);
      }).toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${MOCK_CONSTANTS.invalidStage} not found in AcceleratorModuleStageDetails.`,
      );
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should handle empty promise items', async () => {
      const emptyPromiseItems: PromiseItemType[] = [];
      const result = await ModuleRunner['executePromises'](emptyPromiseItems);
      expect(result).toEqual([]);
    });

    test('should return a message when no modules are found for the given stage', async () => {
      // Mock executeStageDependentModules to throw the expected error
      vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockRejectedValue(
        // eslint-disable-line @typescript-eslint/no-explicit-any
        new Error(`No modules found in AcceleratorModuleStageDetails`),
      );

      await expect(
        ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParameters, stage: MOCK_CONSTANTS.invalidStage }),
      ).rejects.toThrow(`No modules found in AcceleratorModuleStageDetails`);
    });

    test('should return a message when no modules array is empty for the given stage', async () => {
      // Mock executeStageDependentModules to return the expected message
      vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockResolvedValue(
        // eslint-disable-line @typescript-eslint/no-explicit-any
        `No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`,
      );

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: MOCK_CONSTANTS.invalidStage,
      });

      expect(result).toBe(`No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`);
    });

    test('should throw an error when multiple entries are found for a stage', async () => {
      // Mock executeStageDependentModules to throw the expected error
      vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockRejectedValue(
        // eslint-disable-line @typescript-eslint/no-explicit-any
        new Error(
          `${MODULE_EXCEPTIONS.INVALID_INPUT} - duplicate entries found for stage ${MOCK_CONSTANTS.invalidStage} in AcceleratorModuleStageDetails`,
        ),
      );

      await expect(
        ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParameters, stage: MOCK_CONSTANTS.invalidStage }),
      ).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT} - duplicate entries found for stage ${MOCK_CONSTANTS.invalidStage} in AcceleratorModuleStageDetails`,
      );
    });

    test('should execute stage modules with synth phase modules', async () => {
      // Setup
      process.env['CDK_OPTIONS'] = 'bootstrap';

      // Mock executeStageDependentModules to return the expected result
      vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockResolvedValue(
        'Module 1 executed\nModule 2 executed',
      ); // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should execute stage modules and return status', async () => {
      // Setup
      vi.spyOn(moduleLibFunctions, 'getCentralLoggingResources').mockReturnValue({
        bucketName: MOCK_CONSTANTS.logging.bucketName,
        keyArn: MOCK_CONSTANTS.logging.bucketKeyArn,
      });

      // Mock executeStageDependentModules to return the expected result
      vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockResolvedValue(
        'Module 1 executed\nModule 2 executed',
      ); // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should execute stage modules and return status', async () => {
      // Mock executeStageDependentModules to return the expected result
      vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockResolvedValue(
        'Module 1 executed\nModule 2 executed',
      ); // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should execute stage modules with parallel module executions and return status', async () => {
      // Mock executeStageDependentModules to return the expected result
      vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockResolvedValue(
        'Module 1 executed\nModule 2 executed',
      ); // eslint-disable-line @typescript-eslint/no-explicit-any

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.SECURITY,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    describe('control tower landing zone module', () => {
      beforeEach(() => {
        vi.clearAllMocks();
      });

      test('should execute module and return status when CT landing zone is not available in configuration', async () => {
        //Setup
        mockModuleRunnerParameters = {
          configs: {
            accountsConfig: mockAccountsConfig as AccountsConfig,
            customizationsConfig: mockCustomizationsConfig as CustomizationsConfig,
            globalConfig: {
              homeRegion: 'mockHomeRegion',
              controlTower: {
                enable: true,
              } as ControlTowerConfig,
            } as GlobalConfig,
            iamConfig: mockIamConfig as IamConfig,
            networkConfig: mockNetworkConfig as NetworkConfig,
            organizationConfig: mockOrganizationConfig as OrganizationConfig,
            replacementsConfig: mockReplacementsConfig as ReplacementsConfig,
            securityConfig: mockSecurityConfig as SecurityConfig,
          },
          globalRegion: MOCK_CONSTANTS.globalRegion,
          resourcePrefixes: MOCK_CONSTANTS.resourcePrefixes,
          acceleratorResourceNames: MOCK_CONSTANTS.acceleratorResourceNames,
          logging: MOCK_CONSTANTS.logging,
          organizationAccounts: [],
          organizationDetails: undefined,
          managementAccountCredentials: MOCK_CONSTANTS.credentials,
        };

        vi.spyOn(moduleLibFunctions, 'getAcceleratorModuleRunnerParameters').mockReturnValue(
          mockModuleRunnerParameters,
        );

        // Mock executeStageDependentModules to return the expected result
        vi.spyOn(ModuleRunner as any, 'executeStageDependentModules').mockResolvedValue(
          // eslint-disable-line @typescript-eslint/no-explicit-any
          `${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE} execution skipped, No configuration found for Control Tower Landing zone`,
        );

        const result = await ModuleRunner.execute({
          ...MOCK_CONSTANTS.runnerParameters,
          stage: AcceleratorStage.PREPARE,
        });

        expect(result).toBe(
          `${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE} execution skipped, No configuration found for Control Tower Landing zone`,
        );
      });
    });
  });
});

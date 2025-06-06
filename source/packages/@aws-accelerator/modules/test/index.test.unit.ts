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

import { beforeEach, describe, test } from '@jest/globals';
import { ModuleRunner } from '../index';
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
import { AcceleratorModules, AcceleratorModuleStages, ModuleExecutionPhase } from '../models/enums';
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

//
// Mock Dependencies
//
jest.mock('../lib/functions', () => ({
  getManagementAccountCredentials: jest.fn().mockReturnValue(undefined),
  getAcceleratorModuleRunnerParameters: jest.fn().mockReturnValue(undefined),
  getCentralLoggingResources: jest.fn(),
  isModuleExecutionSkippedByEnvironment: jest.fn().mockReturnValue(true),
}));

jest.mock('../../accelerator/utils/app-utils', () => ({
  setResourcePrefixes: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../models/constants', () => ({
  ...jest.requireActual('../models/constants'),
  AcceleratorModuleStageDetails: [],
}));

describe('ModuleRunner', () => {
  const constants = require('../models/constants');

  let mockAccountsConfig: Partial<AccountsConfig>;
  let mockModuleRunnerParameters: AcceleratorModuleRunnerParametersType;

  beforeEach(() => {
    process.env['CDK_OPTIONS'] = 'synth';
    jest.clearAllMocks();

    mockAccountsConfig = {
      getManagementAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
      getManagementAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
      getAuditAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
      getAuditAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
      getLogArchiveAccount: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
      getLogArchiveAccountId: jest.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
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

    jest
      .spyOn(require('../lib/functions'), 'getAcceleratorModuleRunnerParameters')
      .mockReturnValue(mockModuleRunnerParameters);
  });

  describe('getStageRunOrder', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return the correct run order for a valid stage name', () => {
      // Setup
      constants.AcceleratorModuleStageDetails = [
        {
          stage: {
            name: AcceleratorModuleStages.PREPARE,
            runOrder: 2,
          },
          modules: [],
        },
      ];

      // Execute
      const result = ModuleRunner['getStageRunOrder'](AcceleratorModuleStages.PREPARE);

      // Verify
      expect(result).toBe(2);
    });

    test('should throw an error when stage name is not found', () => {
      // Setup
      constants.AcceleratorModuleStageDetails = [];
      const errorLogSpy = jest.spyOn(ModuleRunner['logger'], 'error');

      // Execute & Verify
      expect(() => {
        ModuleRunner['getStageRunOrder'](MOCK_CONSTANTS.invalidStage);
      }).toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${MOCK_CONSTANTS.invalidStage} not found in AcceleratorModuleStageDetails.`,
      );
      expect(errorLogSpy).toHaveBeenCalledWith(
        `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stage ${MOCK_CONSTANTS.invalidStage} not found in AcceleratorModuleStageDetails.`,
      );
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should handle empty promise items', async () => {
      const emptyPromiseItems: PromiseItemType[] = [];
      const result = await ModuleRunner['executePromises'](emptyPromiseItems);
      expect(result).toEqual([]);
    });

    test('should return a message when no modules are found for the given stage', async () => {
      constants.AcceleratorModuleStageDetails = [];

      await expect(
        ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParameters, stage: MOCK_CONSTANTS.invalidStage }),
      ).rejects.toThrow(`No modules found in AcceleratorModuleStageDetails`);
    });

    test('should return a message when no modules array is empty for the given stage', async () => {
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: MOCK_CONSTANTS.invalidStage },
          modules: [],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: MOCK_CONSTANTS.invalidStage,
      });

      expect(result).toBe(`No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`);
    });

    test('should throw an error when multiple entries are found for a stage', async () => {
      constants.AcceleratorModuleStageDetails = [
        { stage: { name: MOCK_CONSTANTS.invalidStage } },
        { stage: { name: MOCK_CONSTANTS.invalidStage } },
      ];

      await expect(
        ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParameters, stage: MOCK_CONSTANTS.invalidStage }),
      ).rejects.toThrow(
        `${MODULE_EXCEPTIONS.INVALID_INPUT} - duplicate entries found for stage ${MOCK_CONSTANTS.invalidStage} in AcceleratorModuleStageDetails`,
      );
    });

    test('should execute stage less modules and return status', async () => {
      // Setup
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

      jest
        .spyOn(require('../lib/functions'), 'getAcceleratorModuleRunnerParameters')
        .mockReturnValue(mockModuleRunnerParameters);

      jest.spyOn(require('../lib/functions'), 'getCentralLoggingResources').mockReturnValue({
        bucketName: MOCK_CONSTANTS.logging.bucketName,
        keyArn: MOCK_CONSTANTS.logging.bucketKeyArn,
      });

      constants.AcceleratorModuleStageOrders = {
        [AcceleratorModuleStages.PREPARE]: { name: AcceleratorModuleStages.PREPARE, runOrder: 2 },

        [AcceleratorModuleStages.ACCOUNTS]: { name: AcceleratorModuleStages.ACCOUNTS, runOrder: 1 },

        [AcceleratorModuleStages.FINALIZE]: { name: AcceleratorModuleStages.FINALIZE, runOrder: 4 },

        [AcceleratorModuleStages.LOGGING]: { name: AcceleratorModuleStages.LOGGING, runOrder: 3 },
      };
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.LOGGING, runOrder: 3 },
          modules: [],
        },
        {
          stage: { name: AcceleratorStage.FINALIZE, runOrder: 4 },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.FINALIZE} stage executed`),
            },
          ],
        },
        {
          stage: { name: AcceleratorStage.ACCOUNTS, runOrder: 2 },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.ACCOUNTS} stage executed`),
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue(`Module 2 of ${AcceleratorStage.ACCOUNTS} stage executed`),
            },
          ],
        },
        {
          stage: { name: AcceleratorStage.PREPARE, runOrder: 1 },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue(`Module 1 of ${AcceleratorStage.PREPARE} stage executed`),
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue(`Module 2 of ${AcceleratorStage.PREPARE} stage executed`),
            },
          ],
        },
      ];

      // Execute
      const result = await ModuleRunner.execute({ ...MOCK_CONSTANTS.runnerParameters });

      // Verify
      expect(result.split('\n').length).toEqual(5);
    });

    test('should execute stage modules and return status when no modules found for the stage', async () => {
      // Setup
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: MOCK_CONSTANTS.invalidStage,
      });

      expect(result).toBe(`No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`);
    });

    test('should execute stage modules with synth phase modules', async () => {
      // Setup
      process.env['CDK_OPTIONS'] = 'bootstrap';
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
              executionPhase: ModuleExecutionPhase.SYNTH,
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
              executionPhase: ModuleExecutionPhase.SYNTH,
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should skip stage modules execution becasue all modules are for synth phase', async () => {
      // Setup
      process.env['CDK_OPTIONS'] = 'bootstrap';
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe(`No modules found for "${AcceleratorStage.PREPARE}" stage`);
    });

    test('should execute stage modules and return status', async () => {
      // Setup
      jest.spyOn(require('../lib/functions'), 'getCentralLoggingResources').mockReturnValue({
        bucketName: MOCK_CONSTANTS.logging.bucketName,
        keyArn: MOCK_CONSTANTS.logging.bucketKeyArn,
      });

      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
          ],
        },
        {
          stage: { name: AcceleratorStage.FINALIZE },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should skip stage modules execution becasue all modules are for synth phase', async () => {
      // Setup
      process.env['CDK_OPTIONS'] = 'bootstrap';
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe(`No modules found for "${AcceleratorStage.PREPARE}" stage`);
    });

    test('should execute stage modules and return status', async () => {
      // Setup
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.PREPARE },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 2,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.PREPARE,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should execute stage modules with parallel module executions and return status', async () => {
      // Setup
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: AcceleratorStage.SECURITY },
          modules: [
            {
              name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 1 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
            {
              name: AcceleratorModules.EXAMPLE_MODULE,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue('Module 2 executed'),
              executionPhase: ModuleExecutionPhase.DEPLOY,
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: AcceleratorStage.SECURITY,
      });

      expect(result).toBe('Module 1 executed\nModule 2 executed');
    });

    test('should handle and log when invalid stage provided', async () => {
      constants.AcceleratorModuleStageDetails = [
        {
          stage: { name: MOCK_CONSTANTS.invalidStage },
          modules: [
            {
              name: MOCK_CONSTANTS.invalidModule,
              runOrder: 1,
              handler: jest.fn().mockResolvedValue(`No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`),
            },
          ],
        },
      ];

      const result = await ModuleRunner.execute({
        ...MOCK_CONSTANTS.runnerParameters,
        stage: MOCK_CONSTANTS.invalidStage,
      });

      expect(result).toBe(`No modules found for "${MOCK_CONSTANTS.invalidStage}" stage`);
    });

    describe('groupStagesByRunOrder', () => {
      test('should correctly group and sort stages by run order', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupStagesByRunOrder = (ModuleRunner as any)['groupStagesByRunOrder'];

        const mockStageItems = [
          {
            stage: { name: 'Stage1', runOrder: 2 },
            modules: [],
          },
          {
            stage: { name: 'Stage2', runOrder: 1 },
            modules: [],
          },
          {
            stage: { name: 'Stage3', runOrder: 2 },
            modules: [],
          },
        ];

        const result = groupStagesByRunOrder(mockStageItems);

        expect(result).toEqual([
          {
            order: 1,
            stages: [
              {
                stage: { name: 'Stage2', runOrder: 1 },
                modules: [],
              },
            ],
          },
          {
            order: 2,
            stages: [
              {
                stage: { name: 'Stage1', runOrder: 2 },
                modules: [],
              },
              {
                stage: { name: 'Stage3', runOrder: 2 },
                modules: [],
              },
            ],
          },
        ]);
      });

      test('should handle empty input array', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupStagesByRunOrder = (ModuleRunner as any)['groupStagesByRunOrder'];
        const result = groupStagesByRunOrder([]);
        expect(result).toEqual([]);
      });

      test('should handle single stage', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupStagesByRunOrder = (ModuleRunner as any)['groupStagesByRunOrder'];
        const mockStageItems = [
          {
            stage: { name: 'Stage1', runOrder: 1 },
            modules: [],
          },
        ];

        const result = groupStagesByRunOrder(mockStageItems);
        expect(result).toEqual([
          {
            order: 1,
            stages: [
              {
                stage: { name: 'Stage1', runOrder: 1 },
                modules: [],
              },
            ],
          },
        ]);
      });
    });

    describe('control tower landing zone module', () => {
      beforeEach(() => {
        jest.clearAllMocks();
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

        jest
          .spyOn(require('../lib/functions'), 'getAcceleratorModuleRunnerParameters')
          .mockReturnValue(mockModuleRunnerParameters);

        constants.AcceleratorModuleStageDetails = [
          {
            stage: { name: AcceleratorStage.PREPARE },
            modules: [
              {
                name: AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE,
                runOrder: 1,
                handler: jest
                  .fn()
                  .mockResolvedValue(
                    `${AcceleratorModules.SETUP_CONTROL_TOWER_LANDING_ZONE} execution skipped, No configuration found for Control Tower Landing zone`,
                  ),
                executionPhase: ModuleExecutionPhase.DEPLOY,
              },
            ],
          },
        ];

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

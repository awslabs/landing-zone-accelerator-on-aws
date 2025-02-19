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

import {
  BaselineOperationStatus,
  ControlTowerClient,
  EnableBaselineCommand,
  GetBaselineOperationCommand,
  LandingZoneStatus,
  paginateListBaselines,
  paginateListEnabledBaselines,
} from '@aws-sdk/client-controltower';

import { RegisterOrganizationalUnitModule } from '../../../../lib/control-tower/register-organizational-unit/index';
import { MOCK_CONSTANTS } from '../../../mocked-resources';

// Mock dependencies
jest.mock('@aws-sdk/client-controltower', () => {
  return {
    BaselineOperationStatus: {
      IN_PROGRESS: 'IN_PROGRESS',
      SUCCEEDED: 'SUCCEEDED',
      FAILED: 'FAILED',
    },
    ControlTowerClient: jest.fn(),
    ListEnabledBaselines: jest.fn(),
    paginateListBaselines: jest.fn(),
    paginateListEnabledBaselines: jest.fn(),
    EnableBaselineCommand: jest.fn(),
    GetBaselineOperationCommand: jest.fn(),
    LandingZoneStatus: {
      ACTIVE: 'ACTIVE',
      FAILED: 'FAILED',
      PROCESSING: 'PROCESSING',
    },
    EnablementStatus: {
      COMPLETED: 'COMPLETED',
      FAILED: 'FAILED',
      IN_PROGRESS: 'IN_PROGRESS',
    },
  };
});

jest.mock('../../../../common/functions', () => ({
  ...jest.requireActual('../../../../common/functions'),
  delay: jest.fn().mockResolvedValue(undefined),
}));

describe('RegisterOrganizationalUnitModule', () => {
  const mockSend = jest.fn();
  let getLandingZoneIdentifierSpy: jest.SpyInstance;
  let getLandingZoneDetailsSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    (ControlTowerClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    mockSend.mockImplementation(command => {
      if (command instanceof EnableBaselineCommand) {
        return Promise.resolve({
          operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
        });
      }
      if (command instanceof GetBaselineOperationCommand) {
        return Promise.resolve({
          baselineOperation: { status: BaselineOperationStatus.SUCCEEDED },
        });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    getLandingZoneIdentifierSpy = jest.spyOn(require('../../../../common/functions'), 'getLandingZoneIdentifier');
    getLandingZoneDetailsSpy = jest.spyOn(require('../../../../common/functions'), 'getLandingZoneDetails');

    getLandingZoneIdentifierSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingArn);
    getLandingZoneDetailsSpy.mockResolvedValue({
      landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
      status: LandingZoneStatus.ACTIVE,
      securityOuName: 'Security',
      enableIdentityCenterAccess: true,
    });

    (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
      {
        enabledBaselines: [
          MOCK_CONSTANTS.enabledBaselines.mockTarget1,
          MOCK_CONSTANTS.enabledBaselines.mockTarget2,
          MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
        ],
      },
    ]);

    (paginateListBaselines as jest.Mock).mockImplementation(() => [
      {
        baselines: [
          MOCK_CONSTANTS.baselines.controlTowerBaseline,
          MOCK_CONSTANTS.baselines.auditBaseline,
          MOCK_CONSTANTS.baselines.identityCenterBaseline,
        ],
      },
    ]);
  });

  describe('NO DRY-RUN RegisterOrganizationalUnitModule', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when ou already registered successfully', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            MOCK_CONSTANTS.enabledBaselines.mockOu,
            MOCK_CONSTANTS.enabledBaselines.mockTarget2,
            MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
          ],
        },
      ]);
      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
      expect(response).toEqual(
        `AWS Organizations organizational unit (OU) "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" is already registered with AWS Control Tower, registration status is ${MOCK_CONSTANTS.enabledBaselines.mockOu.statusSummary.status} and baseline version is ${MOCK_CONSTANTS.enabledBaselines.mockOu.baselineVersion}, operation skipped.`,
      );
    });

    test('should be successful with single attempt to get success status', async () => {
      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(1);
      expect(response).toEqual(
        `Registration of AWS Organizations organizational unit (OU) "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" with AWS Control Tower is successful.`,
      );
    });

    test('should be successful when multiple attempts made to get success status', async () => {
      // Setup
      let getBaselineOperationCommandCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof EnableBaselineCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetBaselineOperationCommand) {
          getBaselineOperationCommandCallCount++;

          if (getBaselineOperationCommandCallCount === 1) {
            return Promise.resolve({
              baselineOperation: { status: BaselineOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            baselineOperation: { status: BaselineOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(2);
      expect(response).toEqual(
        `Registration of AWS Organizations organizational unit (OU) "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" with AWS Control Tower is successful.`,
      );
    });

    test('should be successful with existing ou registration in failed status', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            MOCK_CONSTANTS.enabledBaselines.mockOuFailed,
            MOCK_CONSTANTS.enabledBaselines.mockTarget2,
            MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
          ],
        },
      ]);

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(1);
      expect(response).toEqual(
        `Registration of AWS Organizations organizational unit (OU) "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" with AWS Control Tower is successful.`,
      );
    });

    test('should be successful with existing ou registration has older baseline version status', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            MOCK_CONSTANTS.enabledBaselines.mockOuOldBaseLineVersion,
            MOCK_CONSTANTS.enabledBaselines.mockTarget2,
            MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
          ],
        },
      ]);

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
      expect(response).toEqual(
        `AWS Organizations organizational unit (OU) "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" is already registered with AWS Control Tower, but the baseline version is ${MOCK_CONSTANTS.enabledBaselines.mockOuOldBaseLineVersion.baselineVersion} which is different from expected baseline version ${MOCK_CONSTANTS.enabledBaselines.mockOu.baselineVersion} and registration status is ${MOCK_CONSTANTS.enabledBaselines.mockOuOldBaseLineVersion.statusSummary.status}, update baseline is required for OU, perform update baseline from console.`,
      );
    });

    test('should throw error when baseline operation exceeds timeout limit', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof EnableBaselineCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetBaselineOperationCommand) {
          return Promise.resolve({
            baselineOperation: { status: BaselineOperationStatus.IN_PROGRESS },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(
        new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrow(
        `AWS Organizations organizational unit "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" baseline operation took more than 60 minutes. Pipeline aborted, please review AWS Control Tower console to make sure organization unit registration completes.`,
      );

      // Verify
      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(31);
    });

    test('should throw error when GetBaselineOperation api did not return operation status', async () => {
      // Setup

      let getBaselineOperationCommandCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof EnableBaselineCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetBaselineOperationCommand) {
          getBaselineOperationCommandCallCount++;

          if (getBaselineOperationCommandCallCount === 1) {
            return Promise.resolve({
              baselineOperation: { status: BaselineOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            baselineOperation: undefined,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(
        new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrow(
        `Internal Error: AWS Control Tower Landing Zone GetBaselineOperation api didn't return operation status.`,
      );

      // Verify
      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should throw error when baseline operation failed', async () => {
      // Setup

      let getBaselineOperationCommandCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof EnableBaselineCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetBaselineOperationCommand) {
          getBaselineOperationCommandCallCount++;

          if (getBaselineOperationCommandCallCount === 1) {
            return Promise.resolve({
              baselineOperation: { status: BaselineOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            baselineOperation: { status: BaselineOperationStatus.FAILED },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(
        new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrow(
        `AWS Organizations organizational unit "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" baseline operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${BaselineOperationStatus.FAILED}" state. Investigate baseline operation before executing pipeline.`,
      );

      // Verify
      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should throw error when control tower not found', async () => {
      // Setup

      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);

      // Execute & Verify
      await expect(async () => {
        await new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        });
      }).rejects.toThrowError(
        `Error: AWS Control Tower Landing Zone not found in the region "${MOCK_CONSTANTS.runnerParameters.region}".`,
      );
      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(0);
      expect(paginateListBaselines).toHaveBeenCalledTimes(0);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when ou registration fails EnableBaseline api did not return operationIdentifier object', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof EnableBaselineCommand) {
          return Promise.resolve({
            operationIdentifier: undefined,
          });
        }
        if (command instanceof GetBaselineOperationCommand) {
          return Promise.resolve({
            baselineOperation: { status: BaselineOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(async () => {
        await new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        });
      }).rejects.toThrowError(
        `Internal error: AWS Organizations organizational unit (OU) "${MOCK_CONSTANTS.registerOuConfiguration.ouArn}" EnableBaseline api didn't return operationIdentifier object.`,
      );

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(1);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when control tower not found for dry run', async () => {
      // Setup

      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(0);
      expect(paginateListBaselines).toHaveBeenCalledTimes(0);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.setupLandingZoneModule(
          `Will experience error because the environment does not have AWS Control Tower Landing Zone.`,
        ),
      );
    });

    test('should throw error when AWSControlTowerBaseline identifier not found', async () => {
      // Setup

      (paginateListBaselines as jest.Mock).mockImplementation(() => [
        {
          baselines: undefined,
        },
      ]);

      // Execute & Verify
      await expect(async () => {
        await new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        });
      }).rejects.toThrowError(
        `Internal Error: AWSControlTowerBaseline identifier not found in available Control Tower baselines returned by ListBaselines api.`,
      );
      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when AWS Control Tower Landing Zone is configured with IAM Identity Center, but IdentityCenterBaseline not found', async () => {
      // Setup

      (paginateListBaselines as jest.Mock).mockImplementation(() => [
        {
          baselines: [MOCK_CONSTANTS.baselines.auditBaseline, MOCK_CONSTANTS.baselines.controlTowerBaseline],
        },
      ]);

      // Execute & Verify
      await expect(async () => {
        await new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        });
      }).rejects.toThrowError(
        `Internal Error: AWS Control Tower Landing Zone is configured with IAM Identity Center, but IdentityCenterBaseline not found in enabled baselines returned by ListEnabledBaselines api.`,
      );
      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when paginateListEnabledBaselines did not return enabledBaselines object', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: undefined,
        },
      ]);

      // Execute & Verify
      await expect(async () => {
        await new RegisterOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.registerOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        });
      }).rejects.toThrowError(
        `Internal Error: AWS Control Tower Landing Zone is configured with IAM Identity Center, but IdentityCenterBaseline not found in enabled baselines returned by ListEnabledBaselines api.`,
      );
      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
    });
  });

  describe('DRY-RUN - RegisterOrganizationalUnitModule - Dry Run', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when already registered successfully', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            MOCK_CONSTANTS.enabledBaselines.mockOu,
            MOCK_CONSTANTS.enabledBaselines.mockTarget1,
            MOCK_CONSTANTS.enabledBaselines.mockTarget2,
            MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
          ],
        },
      ]);

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.setupLandingZoneModule(
          `is already registered with AWS Control Tower, registration status is ${BaselineOperationStatus.SUCCEEDED}, accelerator will skip the registration process.`,
        ),
      );
    });

    test('should be successful when not registered', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            MOCK_CONSTANTS.enabledBaselines.mockTarget1,
            MOCK_CONSTANTS.enabledBaselines.mockTarget2,
            MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
          ],
        },
      ]);

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.setupLandingZoneModule(
          `is not registered with AWS Control Tower accelerator will register the OU with AWS Control Tower.`,
        ),
      );
    });

    test('should be successful when already registered with failed status', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            MOCK_CONSTANTS.enabledBaselines.mockOuFailed,
            MOCK_CONSTANTS.enabledBaselines.mockTarget2,
            MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
          ],
        },
      ]);

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.setupLandingZoneModule(
          `is already registered with AWS Control Tower, registration status is ${MOCK_CONSTANTS.enabledBaselines.mockOuFailed.statusSummary.status}, accelerator will try to re-register the OU.`,
        ),
      );
    });

    test('should be successful when already registered with older baseline version', async () => {
      // Setup

      (paginateListEnabledBaselines as jest.Mock).mockImplementation(() => [
        {
          enabledBaselines: [
            MOCK_CONSTANTS.enabledBaselines.mockOuOldBaseLineVersion,
            MOCK_CONSTANTS.enabledBaselines.mockTarget2,
            MOCK_CONSTANTS.enabledBaselines.mockIdentityCenterBaseline,
          ],
        },
      ]);

      // Execute

      const response = await new RegisterOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.registerOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify

      expect(ControlTowerClient).toHaveBeenCalledTimes(1);
      expect(paginateListEnabledBaselines).toHaveBeenCalledTimes(1);
      expect(paginateListBaselines).toHaveBeenCalledTimes(1);
      expect(EnableBaselineCommand).toHaveBeenCalledTimes(0);
      expect(GetBaselineOperationCommand).toHaveBeenCalledTimes(0);
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.setupLandingZoneModule(
          `is already registered with AWS Control Tower, but the baseline version is ${MOCK_CONSTANTS.enabledBaselines.mockOuOldBaseLineVersion.baselineVersion} which is different from expected baseline version ${MOCK_CONSTANTS.enabledBaselines.mockOu.baselineVersion} and registration status is ${MOCK_CONSTANTS.enabledBaselines.mockOuOldBaseLineVersion.statusSummary.status}, manual baseline update is required. Baseline version compatibility metrics can be found here https://docs.aws.amazon.com/controltower/latest/userguide/table-of-baselines.html`,
        ),
      );
    });
  });

  describe('getBaselineVersion', () => {
    let registerOrganizationalUnitModule: RegisterOrganizationalUnitModule;
    let getBaselineVersion: RegisterOrganizationalUnitModule['getBaselineVersion'];

    beforeEach(() => {
      registerOrganizationalUnitModule = new RegisterOrganizationalUnitModule();
      getBaselineVersion = registerOrganizationalUnitModule['getBaselineVersion'].bind(
        registerOrganizationalUnitModule,
      );
    });

    test('should return baseline version 1.0 for landing zone versions 2.0-2.7', () => {
      const landingZoneVersions = ['2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7'];

      landingZoneVersions.forEach(version => {
        const result = getBaselineVersion(version);
        expect(result).toBe('1.0');
      });
    });

    test('should return baseline version 2.0 for landing zone versions 2.8-2.9', () => {
      const landingZoneVersions = ['2.8', '2.9'];

      landingZoneVersions.forEach(version => {
        const result = getBaselineVersion(version);
        expect(result).toBe('2.0');
      });
    });

    test('should return baseline version 3.0 for landing zone versions 3.0-3.1', () => {
      const landingZoneVersions = ['3.0', '3.1'];

      landingZoneVersions.forEach(version => {
        const result = getBaselineVersion(version);
        expect(result).toBe('3.0');
      });
    });

    test('should return default baseline version 4.0 for unknown landing zone version', () => {
      const unknownVersions = ['1.9', '4.0', '3.2', 'invalid'];

      unknownVersions.forEach(version => {
        const result = getBaselineVersion(version);
        expect(result).toBe('4.0');
      });
    });
  });
});

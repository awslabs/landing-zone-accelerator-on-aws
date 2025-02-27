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

import { SetupLandingZoneModule } from '../../../../lib/control-tower/setup-landing-zone/index';
import { Organization } from '../../../../lib/control-tower/setup-landing-zone/prerequisites/organization';

import {
  ControlTowerClient,
  CreateLandingZoneCommand,
  GetLandingZoneOperationCommand,
  LandingZoneOperationStatus,
  LandingZoneStatus,
  ResetLandingZoneCommand,
  UpdateLandingZoneCommand,
} from '@aws-sdk/client-controltower';
import { IamRole } from '../../../../lib/control-tower/setup-landing-zone/prerequisites/iam-role';
import { KmsKey } from '../../../../lib/control-tower/setup-landing-zone/prerequisites/kms-key';
import { SharedAccount } from '../../../../lib/control-tower/setup-landing-zone/prerequisites/shared-account';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

// Mock dependencies
jest.mock('@aws-sdk/client-controltower', () => {
  return {
    ControlTowerClient: jest.fn(),
    CreateLandingZoneCommand: jest.fn(),
    GetLandingZoneOperationCommand: jest.fn(),
    LandingZoneOperationStatus: {
      FAILED: 'FAILED',
      IN_PROGRESS: 'IN_PROGRESS',
      SUCCEEDED: 'SUCCEEDED',
    },
    LandingZoneStatus: {
      ACTIVE: 'ACTIVE',
      FAILED: 'FAILED',
      PROCESSING: 'PROCESSING',
    },
    ListLandingZonesCommand: jest.fn(),
    GetLandingZoneCommand: jest.fn(),
    ResetLandingZoneCommand: jest.fn(),
    UpdateLandingZoneCommand: jest.fn(),
  };
});

jest.mock('../../../../common/functions', () => ({
  ...jest.requireActual('../../../../common/functions'),
  delay: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../lib/control-tower/setup-landing-zone/prerequisites/shared-account', () => ({
  ...jest.requireActual('../../../../lib/control-tower/setup-landing-zone/prerequisites/shared-account'),
  createAccounts: jest.fn(),
}));

jest.mock('../../../../lib/control-tower/setup-landing-zone/prerequisites/kms-key', () => ({
  ...jest.requireActual('../../../../lib/control-tower/setup-landing-zone/prerequisites/kms-key'),
  createControlTowerKey: jest.fn(),
}));

const MOCK_CONSTANTS = {
  unknownError: new Error('Unknown command'),
  moduleCommonParameter: {
    operation: 'mockOperation',
    partition: 'mockPartition',
    region: 'mockHomeRegion',
    credentials: {
      accessKeyId: 'mockAccessKeyId',
      secretAccessKey: 'mockSecretAccessKey',
      sessionToken: 'mockSessionToken',
      expiration: new Date('2024-12-31'),
    },
  },
  moduleName: 'mockModuleName',
  globalRegion: 'mockGlobalRegion',
  solutionId: 'mockSolutionId',

  controlTowerLandingZoneConfiguration: {
    version: 'mockVersion',
    enabledRegions: ['mockRegion1', 'mockRegion2'],
    logging: {
      organizationTrail: true,
      retention: {
        loggingBucket: 30,
        accessLoggingBucket: 30,
      },
    },
    security: {
      enableIdentityCenterAccess: true,
    },
    sharedAccounts: {
      management: {
        name: 'Management',
        email: 'mockManagement@example.com',
      },
      logging: {
        name: 'Logging',
        email: 'mockLogArchive@example.com',
      },
      audit: {
        name: 'Audit',
        email: 'mockAudit@example.com',
      },
    },
  },
  existingLandingArn: 'mockExistingLandingArn',
  region: 'mockRegion',
  partition: 'mockPartition',
  managementAccountItem: {
    Id: 'mockManagementId',
    Arn: 'mockManagementArn',
    Name: 'mockManagementName',
    Email: 'mockManagement@example.com',
    Status: 'mockStatus',
  },
  auditAccountItem: {
    Id: 'mockAuditId',
    Arn: 'mockAuditArn',
    Name: 'mockAuditName',
    Email: 'mockAudit@example.com',
    Status: 'mockStatus',
  },
  logArchiveAccountItem: {
    Id: 'mockLogArchiveId',
    Arn: 'mockLogArchiveArn',
    Name: 'mockLogArchiveName',
    Email: 'mockLogArchive@example.com',
    Status: 'mockStatus',
  },
  ctKmsKeyArn: 'mockCtKmsKeyArn',
  existingLandingZoneDetails: {
    manifest: {
      accessManagement: {
        enabled: true,
      },
      securityRoles: {
        accountId: 'mockAuditId',
      },
      governedRegions: ['mockRegion1', 'mockRegion2'],
      organizationStructure: {
        security: {
          name: 'Security',
        },
      },
      centralizedLogging: {
        accountId: 'mockLogArchiveId',
        configurations: {
          loggingBucket: {
            retentionDays: 3650,
          },
          kmsKeyArn: 'mockCtKmsKeyArn',
          accessLoggingBucket: {
            retentionDays: 365,
          },
        },
        enabled: true,
      },
    },
  },
  operationIdentifier: 'mockUpdateOperationIdentifier',
  existingLandingZoneIdentifier: 'mockLandingZoneIdentifier',
};

describe('Accelerator ControlTower Landing Zone Module', () => {
  const mockSend = jest.fn();

  let getLandingZoneIdentifierSpy: jest.SpyInstance;

  let organizationValidateSpy: jest.SpyInstance;
  let getOrganizationAccountDetailsByEmailSpy: jest.SpyInstance;

  let createControlTowerRolesSpy: jest.SpyInstance;

  let createControlTowerKeySpy: jest.SpyInstance;

  let createSharedAccountsSpy: jest.SpyInstance;

  let makeManifestDocumentSpy: jest.SpyInstance;

  let getLandingZoneDetailsSpy: jest.SpyInstance;

  let landingZoneUpdateOrResetRequiredSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    (ControlTowerClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    getLandingZoneIdentifierSpy = jest.spyOn(require('../../../../common/functions'), 'getLandingZoneIdentifier');
    organizationValidateSpy = jest.spyOn(Organization, 'validate');
    getOrganizationAccountDetailsByEmailSpy = jest.spyOn(Organization, 'getOrganizationAccountDetailsByEmail');

    createControlTowerRolesSpy = jest.spyOn(IamRole, 'createControlTowerRoles');

    createControlTowerKeySpy = jest.spyOn(KmsKey, 'createControlTowerKey');

    createSharedAccountsSpy = jest.spyOn(SharedAccount, 'createAccounts');
    makeManifestDocumentSpy = jest.spyOn(
      require('../../../../lib/control-tower/setup-landing-zone/functions'),
      'makeManifestDocument',
    );

    getLandingZoneDetailsSpy = jest.spyOn(require('../../../../common/functions'), 'getLandingZoneDetails');

    landingZoneUpdateOrResetRequiredSpy = jest.spyOn(
      require('../../../../lib/control-tower/setup-landing-zone/functions'),
      'landingZoneUpdateOrResetRequired',
    );
  });

  describe('Create landing zone operation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);

      organizationValidateSpy.mockReturnValue(true);
      getOrganizationAccountDetailsByEmailSpy
        .mockReturnValueOnce(MOCK_CONSTANTS.managementAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.logArchiveAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.auditAccountItem);

      createControlTowerRolesSpy.mockReturnValue(undefined);

      createSharedAccountsSpy.mockReturnValue(undefined);

      createControlTowerKeySpy.mockReturnValue(MOCK_CONSTANTS.ctKmsKeyArn);

      makeManifestDocumentSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingZoneDetails.manifest);

      getLandingZoneDetailsSpy.mockResolvedValue(undefined);
    });

    afterAll(() => {
      getOrganizationAccountDetailsByEmailSpy.mockReset();
    });

    test('should be successful of dry run', async () => {
      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        dryRun: true,
        moduleName: MOCK_CONSTANTS.moduleName,
        globalRegion: MOCK_CONSTANTS.globalRegion,
        solutionId: MOCK_CONSTANTS.solutionId,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(/\[DRY-RUN\]: mockModuleName mockOperation \(no actual changes were made\)/);
    });

    test('should be successful without rechecking of operation status', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(/Module "control-tower-landing-zone" The Landing Zone deployed successfully./);
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should be successful while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(/Module "control-tower-landing-zone" The Landing Zone deployed successfully./);
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should successfully handle failure without rechecking of operation status', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );

      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should successfully handle failure while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );

      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should successfully handle failure when CreateLandingZoneCommand did not return operationIdentifier', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: CreateLandingZoneCommand did not return operationIdentifier`,
      );

      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should successfully handle failure when GetLandingZoneOperationCommand did not return operationIdentifier without rechecking of operation status', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );

      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should successfully handle failure when GetLandingZoneOperationCommand did not return operationIdentifier while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );

      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });
  });

  describe('Update landing zone operation', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      getLandingZoneIdentifierSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingArn);

      getOrganizationAccountDetailsByEmailSpy
        .mockReturnValueOnce(MOCK_CONSTANTS.logArchiveAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.auditAccountItem);

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
      });

      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: true,
        targetVersion: '3.3',
        resetRequired: false,
        reason: 'mock reason for update',
      });

      makeManifestDocumentSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingZoneDetails.manifest);
    });

    afterAll(() => {
      getOrganizationAccountDetailsByEmailSpy.mockReset();
    });

    test('should be successful of dry run', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        dryRun: true,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(/\[DRY-RUN\]: control-tower-landing-zone mockOperation \(no actual changes were made\)/);
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful of dry run when no changes required', async () => {
      // Setup

      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: false,
        targetVersion: '3.3',
        resetRequired: false,
        reason: 'mock reason for update',
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        dryRun: true,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(/\[DRY-RUN\]: control-tower-landing-zone mockOperation \(no actual changes were made\)/);
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful of dry run changes required but LZ not in stable state', async () => {
      // Setup
      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.PROCESSING,
        securityOuName: 'Security',
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        dryRun: true,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(/\[DRY-RUN\]: control-tower-landing-zone mockOperation \(no actual changes were made\)/);
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful when no changes required', async () => {
      // Setup

      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: false,
        targetVersion: '3.3',
        resetRequired: false,
        reason: 'mock reason for update',
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" completed successfully with status mock reason for update/,
      );
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should successfully handle failure when landing zone changes are in progress', async () => {
      // Setup

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.PROCESSING,
        securityOuName: 'Security',
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone update operation failed with error - ConflictException - AWS Control Tower cannot begin landing zone setup while another execution is in progress.`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should successfully handle failure when landing zone is in failed status', async () => {
      // Setup

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.FAILED,
        securityOuName: 'Security',
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone Module has status of "${LandingZoneStatus.FAILED}". Before continuing, proceed to AWS Control Tower and evaluate the status`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful without rechecking of operation status', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" The Landing Zone update operation completed successfully./,
      );
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should be successful while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" The Landing Zone update operation completed successfully./,
      );
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should successfully handle failure without rechecking of operation status', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should successfully handle failure while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should successfully handle failure when UpdateLandingZoneCommand did not return operationIdentifier', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: UpdateLandingZoneCommand did not return operationIdentifier`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should successfully handle failure when GetLandingZoneOperationCommand did not return operationIdentifier without rechecking of operation status', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should successfully handle failure when GetLandingZoneOperationCommand did not return operationIdentifier while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should successfully handle failure when landingZoneDetails did not return securityOuName', async () => {
      // Setup
      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: undefined,
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneCommand did not return security Ou name`,
      );

      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });
  });

  describe('Reset landing zone operation', () => {
    beforeEach(() => {
      jest.clearAllMocks();

      getLandingZoneIdentifierSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingArn);

      getOrganizationAccountDetailsByEmailSpy
        .mockReturnValueOnce(MOCK_CONSTANTS.logArchiveAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.auditAccountItem);

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
      });

      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: false,
        targetVersion: '3.3',
        resetRequired: true,
        reason: 'mock reason for update',
      });

      makeManifestDocumentSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingZoneDetails.manifest);
    });

    afterAll(() => {
      getOrganizationAccountDetailsByEmailSpy.mockReset();
    });

    test('should be successful of dry run', async () => {
      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        dryRun: true,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(/\[DRY-RUN\]: control-tower-landing-zone mockOperation \(no actual changes were made\)/);
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful when no changes required', async () => {
      // Setup

      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: false,
        targetVersion: '3.3',
        resetRequired: false,
        reason: 'mock reason for update',
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" completed successfully with status mock reason for update/,
      );
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful without rechecking of operation status', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" The Landing Zone reset operation completed successfully./,
      );
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should be successful while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;

      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" The Landing Zone reset operation completed successfully./,
      );
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should successfully handle failure without rechecking of operation status', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );

      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should successfully handle failure while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED },
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status.`,
      );

      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });

    test('should successfully handle failure when ResetLandingZoneCommand did not return operationIdentifier', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ResetLandingZoneCommand did not return operationIdentifier`,
      );

      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should successfully handle failure when GetLandingZoneOperationCommand did not return operationIdentifier without rechecking of operation status', async () => {
      // Setup

      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );

      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
    });

    test('should successfully handle failure when GetLandingZoneOperationCommand did not return operationIdentifier while rechecking of operation status', async () => {
      // Setup
      let getLandingZoneOperationCallCount = 0;

      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          getLandingZoneOperationCallCount++;

          if (getLandingZoneOperationCallCount === 1) {
            return Promise.resolve({
              operationDetails: { status: LandingZoneOperationStatus.IN_PROGRESS },
            });
          }
          return Promise.resolve({
            operationDetails: undefined,
          });
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute & Verify
      await expect(async () => {
        await new SetupLandingZoneModule().handler({
          ...MOCK_CONSTANTS.moduleCommonParameter,
          useExistingRole: false,
          configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
        });
      }).rejects.toThrowError(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetLandingZoneOperationCommand did not return operationIdentifier`,
      );

      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(2);
    });
  });
});

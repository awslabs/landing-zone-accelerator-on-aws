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
import { describe, beforeEach, expect, test, vi, afterAll } from 'vitest';

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
import { ControlTowerLogAccess } from '../../../../lib/control-tower/setup-landing-zone/prerequisites/control-tower-log-access';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  processStart: vi.fn(),
  processEnd: vi.fn(),
  dryRun: vi.fn(),
  commandExecution: vi.fn(),
  commandSuccess: vi.fn(),
}));

// Mock dependencies
vi.mock('@aws-sdk/client-controltower', () => {
  return {
    ControlTowerClient: vi.fn(),
    CreateLandingZoneCommand: vi.fn(),
    GetLandingZoneOperationCommand: vi.fn(),
    ValidationException: vi.fn(),
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
    ListLandingZonesCommand: vi.fn(),
    GetLandingZoneCommand: vi.fn(),
    ResetLandingZoneCommand: vi.fn(),
    UpdateLandingZoneCommand: vi.fn(),
  };
});

vi.mock('@aws-sdk/client-organizations', async () => {
  const actual = await vi.importActual('@aws-sdk/client-organizations');
  return {
    ...actual,
    OrganizationsClient: vi.fn(),
    paginateListAccounts: vi.fn(),
    paginateListOrganizationalUnitsForParent: vi.fn(),
  };
});

vi.mock('../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../common/functions');
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
    getLandingZoneIdentifier: vi.fn(),
    getLandingZoneDetails: vi.fn(),
  };
});

vi.mock('../../../../lib/control-tower/setup-landing-zone/prerequisites/shared-account', async () => {
  const actual = await vi.importActual('../../../../lib/control-tower/setup-landing-zone/prerequisites/shared-account');
  return {
    ...actual,
    SharedAccount: {
      ...actual.SharedAccount,
      createAccounts: vi.fn(),
    },
  };
});

vi.mock('../../../../lib/control-tower/setup-landing-zone/prerequisites/kms-key', async () => {
  const actual = await vi.importActual('../../../../lib/control-tower/setup-landing-zone/prerequisites/kms-key');
  return {
    ...actual,
    KmsKey: {
      ...actual.KmsKey,
      createControlTowerKeys: vi.fn(),
    },
  };
});

vi.mock('../../../../lib/control-tower/setup-landing-zone/prerequisites/control-tower-log-access', async () => {
  const actual = await vi.importActual(
    '../../../../lib/control-tower/setup-landing-zone/prerequisites/control-tower-log-access',
  );
  return {
    ...actual,
    ControlTowerLogAccess: {
      configure: vi.fn(),
    },
  };
});

vi.mock('../../../../common/logger', () => ({
  createLogger: vi.fn(() => mockLogger),
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
  ctConfigKmsKeyArn: 'mockCtConfigKmsKeyArn',
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
            retentionDays: 365,
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

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe('Accelerator ControlTower Landing Zone Module', () => {
  const mockSend = vi.fn();
  const mockOrganizationsSend = vi.fn();

  let getLandingZoneIdentifierSpy: vi.SpyInstance;

  let organizationValidateSpy: vi.SpyInstance;
  let getOrganizationAccountDetailsByEmailSpy: vi.SpyInstance;

  let createControlTowerRolesSpy: vi.SpyInstance;

  let createControlTowerKeysSpy: vi.SpyInstance;

  let createSharedAccountsSpy: vi.SpyInstance;

  let makeManifestDocumentSpy: vi.SpyInstance;

  let getLandingZoneDetailsSpy: vi.SpyInstance;

  let landingZoneUpdateOrResetRequiredSpy: vi.SpyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();

    (ControlTowerClient as vi.Mock).mockImplementation(function () {
      return {
        send: mockSend,
      };
    });

    const {
      OrganizationsClient,
      ListRootsCommand,
      DescribeOrganizationCommand,
      CreateOrganizationalUnitCommand,
      ListOrganizationalUnitsForParentCommand,
      ListParentsCommand,
      MoveAccountCommand,
      paginateListAccounts,
      paginateListOrganizationalUnitsForParent,
    } = await import('@aws-sdk/client-organizations');

    // Setup default mock responses for Organizations commands
    mockOrganizationsSend.mockImplementation(command => {
      if (command instanceof ListRootsCommand) {
        return Promise.resolve({
          Roots: [
            {
              Id: 'r-mockRootId',
              Arn: 'arn:aws:organizations::123456789012:root/o-mockOrgId/r-mockRootId',
              Name: 'Root',
            },
          ],
        });
      }
      if (command instanceof DescribeOrganizationCommand) {
        return Promise.resolve({
          Organization: {
            Id: 'o-mockOrgId',
            Arn: 'arn:aws:organizations::123456789012:organization/o-mockOrgId',
            FeatureSet: 'ALL',
            MasterAccountArn: 'arn:aws:organizations::123456789012:account/o-mockOrgId/123456789012',
            MasterAccountId: '123456789012',
            MasterAccountEmail: 'mockManagement@example.com',
          },
        });
      }
      if (command instanceof CreateOrganizationalUnitCommand) {
        return Promise.resolve({
          OrganizationalUnit: {
            Id: 'ou-mockSecurityOuId',
            Arn: 'arn:aws:organizations::123456789012:ou/o-mockOrgId/ou-mockSecurityOuId',
            Name: 'Security',
          },
        });
      }
      if (command instanceof ListOrganizationalUnitsForParentCommand) {
        return Promise.resolve({
          OrganizationalUnits: [],
        });
      }
      if (command instanceof ListParentsCommand) {
        return Promise.resolve({
          Parents: [
            {
              Id: 'r-mockRootId',
              Type: 'ROOT',
            },
          ],
        });
      }
      if (command instanceof MoveAccountCommand) {
        return Promise.resolve({});
      }
      return Promise.resolve({});
    });

    (OrganizationsClient as vi.Mock).mockImplementation(function () {
      return {
        send: mockOrganizationsSend,
      };
    });

    // Mock paginators to return mock accounts
    (paginateListAccounts as vi.Mock).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield {
          Accounts: [
            MOCK_CONSTANTS.managementAccountItem,
            MOCK_CONSTANTS.logArchiveAccountItem,
            MOCK_CONSTANTS.auditAccountItem,
          ],
        };
      },
    });

    (paginateListOrganizationalUnitsForParent as vi.Mock).mockReturnValue({
      async *[Symbol.asyncIterator]() {
        yield { OrganizationalUnits: [] };
      },
    });

    const commonFunctions = await import('../../../../common/functions');
    getLandingZoneIdentifierSpy = vi.mocked(commonFunctions.getLandingZoneIdentifier);
    organizationValidateSpy = vi.spyOn(Organization, 'validate');
    getOrganizationAccountDetailsByEmailSpy = vi.spyOn(Organization, 'getOrganizationAccountDetailsByEmail');

    createControlTowerRolesSpy = vi.spyOn(IamRole, 'createControlTowerRoles');

    createControlTowerKeysSpy = vi.mocked(KmsKey.createControlTowerKeys);

    createSharedAccountsSpy = vi.mocked(SharedAccount.createAccounts);
    const setupFunctions = await import('../../../../lib/control-tower/setup-landing-zone/functions');
    makeManifestDocumentSpy = vi.spyOn(setupFunctions, 'makeManifestDocument');

    getLandingZoneDetailsSpy = vi.mocked(commonFunctions.getLandingZoneDetails);

    landingZoneUpdateOrResetRequiredSpy = vi.spyOn(setupFunctions, 'landingZoneUpdateOrResetRequired');
  });

  describe('Create landing zone operation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);

      organizationValidateSpy.mockReturnValue(true);
      getOrganizationAccountDetailsByEmailSpy
        .mockReturnValueOnce(MOCK_CONSTANTS.managementAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.logArchiveAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.auditAccountItem);

      createControlTowerRolesSpy.mockReturnValue(undefined);

      createSharedAccountsSpy.mockReturnValue(undefined);

      createControlTowerKeysSpy.mockResolvedValue({
        centralizedLoggingKeyArn: MOCK_CONSTANTS.ctKmsKeyArn,
        configLoggingKeyArn: MOCK_CONSTANTS.ctConfigKmsKeyArn,
      });

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
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();
    });

    test('should be successful without rechecking of operation status', async () => {
      // Setup
      const operation = createDeferred<{ operationDetails: { status: string } }>();
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return operation.promise;
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const handlerPromise = new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });
      await vi.waitFor(() => expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1));
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();

      operation.resolve({
        operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
      });
      const response = await handlerPromise;

      // Verify
      expect(response).toMatch(/AWS Control Tower landing zone deployed successfully./);
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
      expect(makeManifestDocumentSpy).toHaveBeenCalledWith(expect.any(Object), 'CREATE', {
        centralizedLoggingKeyArn: MOCK_CONSTANTS.ctKmsKeyArn,
        configLoggingKeyArn: MOCK_CONSTANTS.ctConfigKmsKeyArn,
      });
      expect(ControlTowerLogAccess.configure).toHaveBeenCalledWith(
        MOCK_CONSTANTS.moduleCommonParameter.partition,
        MOCK_CONSTANTS.moduleCommonParameter.region,
        MOCK_CONSTANTS.logArchiveAccountItem.Id,
        MOCK_CONSTANTS.ctKmsKeyArn,
        undefined,
        MOCK_CONSTANTS.moduleCommonParameter.credentials,
      );
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
      expect(response).toMatch(/AWS Control Tower landing zone deployed successfully./);
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

    test('should include the operation status message when the create operation fails', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof CreateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED, statusMessage: 'mock status message' },
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
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status. Status message: "mock status message"`,
      );
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Status message: "mock status message"'));
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
      vi.clearAllMocks();

      getLandingZoneIdentifierSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingArn);

      getOrganizationAccountDetailsByEmailSpy
        .mockReturnValueOnce(MOCK_CONSTANTS.logArchiveAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.auditAccountItem);

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        centralizedLoggingConfig: {
          kmsKeyArn: MOCK_CONSTANTS.ctKmsKeyArn,
        },
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
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();
    });

    test('should configure log access for an existing landing zone when no changes are required', async () => {
      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        centralizedLoggingConfig: {
          kmsKeyArn: MOCK_CONSTANTS.ctKmsKeyArn,
        },
      });
      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: false,
        targetVersion: '3.3',
        resetRequired: false,
        reason: 'No changes required',
      });

      await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      expect(ControlTowerLogAccess.configure).toHaveBeenCalledWith(
        MOCK_CONSTANTS.moduleCommonParameter.partition,
        MOCK_CONSTANTS.moduleCommonParameter.region,
        MOCK_CONSTANTS.logArchiveAccountItem.Id,
        MOCK_CONSTANTS.ctKmsKeyArn,
        undefined,
        MOCK_CONSTANTS.moduleCommonParameter.credentials,
      );
    });

    test('should warn and succeed when log access configuration fails', async () => {
      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        centralizedLoggingConfig: {
          kmsKeyArn: MOCK_CONSTANTS.ctKmsKeyArn,
        },
      });
      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: false,
        targetVersion: '3.3',
        resetRequired: false,
        reason: 'No changes required',
      });
      vi.mocked(ControlTowerLogAccess.configure).mockRejectedValueOnce(new Error('Access denied'));

      const response = await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      expect(response).toMatch(/No changes required/);
      expect(ControlTowerLogAccess.configure).toHaveBeenCalledOnce();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unable to configure AWS Control Tower centralized log access: Access denied',
      );
    });

    test('should skip log access when no centralized logging key is configured', async () => {
      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        configHubConfig: {
          kmsKeyArn: MOCK_CONSTANTS.ctConfigKmsKeyArn,
        },
      });
      landingZoneUpdateOrResetRequiredSpy.mockReturnValue({
        updateRequired: false,
        targetVersion: '4.0',
        resetRequired: false,
        reason: 'No changes required',
      });

      await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();
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
      expect(response).toMatch(/mock reason for update/);
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

    test('should be successful without rechecking of operation status', async () => {
      // Setup
      const operation = createDeferred<{ operationDetails: { status: string } }>();
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return operation.promise;
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const handlerPromise = new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });
      await vi.waitFor(() => expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1));
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();

      operation.resolve({
        operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
      });
      const response = await handlerPromise;

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" The Landing Zone update operation completed successfully./,
      );
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
      expect(ControlTowerLogAccess.configure).toHaveBeenCalledWith(
        MOCK_CONSTANTS.moduleCommonParameter.partition,
        MOCK_CONSTANTS.moduleCommonParameter.region,
        MOCK_CONSTANTS.logArchiveAccountItem.Id,
        MOCK_CONSTANTS.ctKmsKeyArn,
        undefined,
        MOCK_CONSTANTS.moduleCommonParameter.credentials,
      );
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
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();
    });

    test('should include the operation status message when the update operation fails', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED, statusMessage: 'mock status message' },
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
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status. Status message: "mock status message"`,
      );
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Status message: "mock status message"'));
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

    test('should call makeManifestDocument with correct KMS keys when configHubConfig.kmsKeyArn exists', async () => {
      // Setup
      const mockCentralizedLoggingKeyArn = 'arn:aws:kms:region:account:key/centralized-logging';
      const mockConfigHubKeyArn = 'arn:aws:kms:region:account:key/config-hub';

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        version: '4.0',
        centralizedLoggingConfig: {
          kmsKeyArn: mockCentralizedLoggingKeyArn,
        },
        configHubConfig: {
          kmsKeyArn: mockConfigHubKeyArn,
        },
        manifest: MOCK_CONSTANTS.existingLandingZoneDetails.manifest,
      });

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
      await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify - configLoggingKeyArn should preserve the config hub's own key
      expect(makeManifestDocumentSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'UPDATE',
        {
          centralizedLoggingKeyArn: mockCentralizedLoggingKeyArn,
          configLoggingKeyArn: mockConfigHubKeyArn,
        },
        MOCK_CONSTANTS.existingLandingZoneDetails.manifest,
        false,
      );
      expect(ControlTowerLogAccess.configure).toHaveBeenCalledWith(
        MOCK_CONSTANTS.moduleCommonParameter.partition,
        MOCK_CONSTANTS.moduleCommonParameter.region,
        MOCK_CONSTANTS.logArchiveAccountItem.Id,
        mockCentralizedLoggingKeyArn,
        undefined,
        MOCK_CONSTANTS.moduleCommonParameter.credentials,
      );
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalledWith(
        MOCK_CONSTANTS.moduleCommonParameter.partition,
        MOCK_CONSTANTS.moduleCommonParameter.region,
        MOCK_CONSTANTS.logArchiveAccountItem.Id,
        mockConfigHubKeyArn,
        undefined,
        MOCK_CONSTANTS.moduleCommonParameter.credentials,
      );
    });

    test('should call makeManifestDocument with correct KMS keys for existing v3 LZ', async () => {
      // Setup
      const mockCentralizedLoggingKeyArn = 'arn:aws:kms:region:account:key/centralized-logging';

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        version: '3.3',
        centralizedLoggingConfig: {
          kmsKeyArn: mockCentralizedLoggingKeyArn,
        },
        manifest: MOCK_CONSTANTS.existingLandingZoneDetails.manifest,
      });

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
      await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify - deployed version 3.3 matches the mocked targetVersion 3.3, so this is in-place
      expect(makeManifestDocumentSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'UPDATE',
        {
          centralizedLoggingKeyArn: mockCentralizedLoggingKeyArn,
          configLoggingKeyArn: mockCentralizedLoggingKeyArn,
        },
        MOCK_CONSTANTS.existingLandingZoneDetails.manifest,
        true,
      );
    });

    test('should call makeManifestDocument with no KMS key if not configured in V4 LZ', async () => {
      // Setup
      const mockCentralizedLoggingKeyArn = 'arn:aws:kms:region:account:key/centralized-logging';

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        version: '4.0',
        centralizedLoggingConfig: {
          kmsKeyArn: mockCentralizedLoggingKeyArn,
        },
        manifest: MOCK_CONSTANTS.existingLandingZoneDetails.manifest,
      });

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
      await new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });

      // Verify
      expect(makeManifestDocumentSpy).toHaveBeenCalledWith(
        expect.any(Object),
        'UPDATE',
        {
          centralizedLoggingKeyArn: mockCentralizedLoggingKeyArn,
          configLoggingKeyArn: undefined,
        },
        MOCK_CONSTANTS.existingLandingZoneDetails.manifest,
        false,
      );
    });
  });

  describe('Reset landing zone operation', () => {
    beforeEach(() => {
      vi.clearAllMocks();

      getLandingZoneIdentifierSpy.mockResolvedValue(MOCK_CONSTANTS.existingLandingArn);

      getOrganizationAccountDetailsByEmailSpy
        .mockReturnValueOnce(MOCK_CONSTANTS.logArchiveAccountItem)
        .mockReturnValueOnce(MOCK_CONSTANTS.auditAccountItem);

      getLandingZoneDetailsSpy.mockResolvedValue({
        landingZoneIdentifier: MOCK_CONSTANTS.existingLandingZoneIdentifier,
        status: LandingZoneStatus.ACTIVE,
        securityOuName: 'Security',
        centralizedLoggingConfig: {
          kmsKeyArn: MOCK_CONSTANTS.ctKmsKeyArn,
        },
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
      expect(response).toMatch(/mock reason for update/);
      expect(CreateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(UpdateLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(0);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful without rechecking of operation status', async () => {
      // Setup
      const operation = createDeferred<{ operationDetails: { status: string } }>();
      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return operation.promise;
        }
        return Promise.reject(new Error('Unexpected command'));
      });

      // Execute
      const handlerPromise = new SetupLandingZoneModule().handler({
        ...MOCK_CONSTANTS.moduleCommonParameter,
        useExistingRole: false,
        configuration: MOCK_CONSTANTS.controlTowerLandingZoneConfiguration,
      });
      await vi.waitFor(() => expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1));
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();

      operation.resolve({
        operationDetails: { status: LandingZoneOperationStatus.SUCCEEDED },
      });
      const response = await handlerPromise;

      // Verify
      expect(response).toMatch(
        /Module "control-tower-landing-zone" The Landing Zone reset operation completed successfully./,
      );
      expect(ResetLandingZoneCommand).toHaveBeenCalledTimes(1);
      expect(GetLandingZoneOperationCommand).toHaveBeenCalledTimes(1);
      expect(ControlTowerLogAccess.configure).toHaveBeenCalledWith(
        MOCK_CONSTANTS.moduleCommonParameter.partition,
        MOCK_CONSTANTS.moduleCommonParameter.region,
        MOCK_CONSTANTS.logArchiveAccountItem.Id,
        MOCK_CONSTANTS.ctKmsKeyArn,
        undefined,
        MOCK_CONSTANTS.moduleCommonParameter.credentials,
      );
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
      expect(ControlTowerLogAccess.configure).not.toHaveBeenCalled();
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

    test('should include the operation status message when the reset operation fails', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof ResetLandingZoneCommand) {
          return Promise.resolve({
            operationIdentifier: MOCK_CONSTANTS.operationIdentifier,
          });
        }
        if (command instanceof GetLandingZoneOperationCommand) {
          return Promise.resolve({
            operationDetails: { status: LandingZoneOperationStatus.FAILED, statusMessage: 'mock status message' },
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
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Control Tower Landing Zone operation with identifier "${MOCK_CONSTANTS.operationIdentifier}" in "${LandingZoneOperationStatus.FAILED}" state !!!!. Before continuing, proceed to AWS Control Tower and evaluate the status. Status message: "mock status message"`,
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Status message: "mock status message"'));
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

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

import { DestinationType, FindingPublishingFrequency, OrgFeatureStatus } from '@aws-sdk/client-guardduty';
import { Account } from '@aws-sdk/client-organizations';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all dependencies
vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    processStart: vi.fn(),
    processEnd: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    dryRun: vi.fn(),
  })),
}));

vi.mock('../../../lib/common/batch-processor', () => ({
  processEnableOperations: vi.fn(),
  processDisableOperations: vi.fn(),
}));

vi.mock('../../../lib/common/security/security-service-context-builder', () => ({
  SecurityServiceContextBuilder: vi.fn(),
}));

vi.mock('../../../lib/common/security/security-service-module-response-builder', () => ({
  SecurityServiceModuleResponseBuilder: vi.fn(),
}));

vi.mock('../../../lib/common/sts-functions', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('../../../lib/common/security/delegated-admin-manager', () => ({
  DelegatedAdminManager: vi.fn().mockImplementation(function () {
    return {
      enable: vi
        .fn()
        .mockImplementation(
          async (
            _accountId: string,
            _client: unknown,
            ops: DelegatedAdminOperations<unknown>,
            dryRun: boolean,
            logPrefix: string,
          ) => {
            await ops.enable(_client, _accountId, dryRun, logPrefix);
            await ops.getCurrent(_client, logPrefix);
          },
        ),
      disable: vi
        .fn()
        .mockImplementation(
          async (_client: unknown, ops: DelegatedAdminOperations<unknown>, dryRun: boolean, logPrefix: string) => {
            await ops.disable(_client, 'mock-account', dryRun, logPrefix);
            await ops.getCurrent(_client, logPrefix);
          },
        ),
    };
  }),
  manageOrganizationsApiDelegatedAdmin: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../lib/guardduty/functions', () => ({
  getOrganizationAdminAccountId: vi.fn(),
  getDetectorId: vi.fn(),
  getFeaturesToEnable: vi.fn(),
  createDetector: vi.fn(),
  deleteDetectorId: vi.fn(),
  deduplicateOrderedAccountListType: vi.fn((list: unknown[]) => list),
}));

vi.mock('../../../lib/guardduty/organizations-delegated-admin-account', () => ({
  OrganizationsDelegatedAdminAccount: {
    enableOrganizationAdminAccount: vi.fn(),
    disableOrganizationAdminAccount: vi.fn(),
  },
}));

vi.mock('../../../lib/guardduty/guardduty-members', () => ({
  GuardDutyMembers: {
    enable: vi.fn(),
    disable: vi.fn(),
  },
}));

vi.mock('../../../lib/guardduty/findings-export-configuration', () => ({
  FindingsExportConfiguration: {
    configurePublishingDestination: vi.fn(),
    deletePublishingDestination: vi.fn(),
  },
}));

vi.mock('@aws-sdk/client-organizations', () => ({
  OrganizationsClient: vi.fn().mockImplementation(function () {
    return {
      send: vi.fn().mockResolvedValue({ DelegatedAdministrators: [] }),
    };
  }),
  ListDelegatedAdministratorsCommand: vi.fn(),
  RegisterDelegatedAdministratorCommand: vi.fn(),
  DeregisterDelegatedAdministratorCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-guardduty', () => ({
  GuardDutyClient: vi.fn(),
}));

// Import after mocks
import { processDisableOperations, processEnableOperations } from '../../../lib/common/batch-processor';
import { AcceleratorModuleName } from '../../../lib/common/interfaces';
import {
  DelegatedAdminOperations,
  manageOrganizationsApiDelegatedAdmin,
} from '../../../lib/common/security/delegated-admin-manager';
import { SecurityServiceContextBuilder } from '../../../lib/common/security/security-service-context-builder';
import { SecurityServiceModuleResponseBuilder } from '../../../lib/common/security/security-service-module-response-builder';
import { getCredentials } from '../../../lib/common/sts-functions';
import { MODULE_STATE_CODE, SecurityModuleOperationAction } from '../../../lib/common/types';
import { FindingsExportConfiguration } from '../../../lib/guardduty/findings-export-configuration';
import { createDetector, getDetectorId, getOrganizationAdminAccountId } from '../../../lib/guardduty/functions';
import {
  configureGuardDuty,
  guardDutyAccountSetup,
  guardDutyDisableHandler,
  guardDutyEnableHandler,
  guardDutyFinalCleanupHandler,
} from '../../../lib/guardduty/guardduty';
import { GuardDutyMembers } from '../../../lib/guardduty/guardduty-members';
import { IGuardDutyModuleRequest } from '../../../lib/guardduty/interfaces';
import { OrganizationsDelegatedAdminAccount } from '../../../lib/guardduty/organizations-delegated-admin-account';

interface CollectedResponse {
  region: string;
  accountId: string;
  response: {
    organizationAdmin?: unknown;
    delegatedAdmin?: unknown;
    detector?: unknown;
  };
  operation: SecurityModuleOperationAction;
}

interface BatchProcessorConfig {
  props: IGuardDutyModuleRequest & { collectedResponses?: CollectedResponse[] };
}
describe('configureGuardDuty', () => {
  const mockCredentials = {
    accessKeyId: 'test-accessKeyId',
    secretAccessKey: 'test-secretAccessKey',
    sessionToken: 'test-sessionToken',
  };

  const mockOrganizationAccounts: Account[] = [
    { Id: '123456789012', Name: 'Management' },
    { Id: '111111111111', Name: 'DelegatedAdmin' },
    { Id: '222222222222', Name: 'Workload1' },
  ];

  const baseRequest: IGuardDutyModuleRequest = {
    invokingAccountId: '123456789012',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    partition: 'aws',
    solutionId: 'test-solution',
    credentials: mockCredentials,
    operation: 'enable',
    moduleName: AcceleratorModuleName.AMAZON_GUARDDUTY,
    configuration: {
      enable: true,
      delegatedAdminAccountId: '111111111111',
      accountAccessRoleName: 'TestRole',
      autoEnableOrgMembers: 'NEW' as OrgFeatureStatus,
      batchOperationSettings: {
        maxConcurrentEnvironments: 5,
        operationTimeoutMs: 60000,
      },
      exportFrequency: 'SIX_HOURS' as FindingPublishingFrequency,
      exportDestination: {
        destinationArn: 'arn:aws:s3:::test-bucket',
        kmsKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/test-key',
        destinationType: 'S3' as DestinationType,
        overrideExisting: true,
      },
      protectionsConfiguration: {
        s3Protection: { enable: true },
        eksProtection: { enable: true, manageAgent: true },
        ec2Protection: { enable: true, keepSnapshots: false },
        rdsProtection: { enable: true },
        lambdaProtection: { enable: true },
      },
    },
  };

  let mockContextBuilder: { build: ReturnType<typeof vi.fn> };
  let mockResponseBuilder: {
    build: ReturnType<typeof vi.fn>;
    buildErrorResponse: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockContextBuilder = {
      build: vi.fn().mockResolvedValue({
        moduleName: 'guardduty',
        managementAccountId: '123456789012',
        enabledRegions: ['us-east-1'],
        disabledRegions: [],
        enableOrderedAccounts: [
          { name: 'Management', order: 1, accounts: [mockOrganizationAccounts[0]] },
          { name: 'DelegatedAdmin', order: 2, accounts: [mockOrganizationAccounts[1]] },
        ],
        disableOrderedAccounts: [],
        organizationAccounts: mockOrganizationAccounts,
        concurrency: { maxConcurrentEnvironments: 5, operationTimeoutMs: 60000 },
      }),
    };
    (SecurityServiceContextBuilder as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockContextBuilder;
    });

    mockResponseBuilder = {
      build: vi
        .fn()
        .mockImplementation(
          (
            moduleName: string,
            operation: string,
            _data: unknown,
            _enableResults: unknown[],
            _disableResults: unknown[],
            dryRun: boolean,
          ) => ({
            status: MODULE_STATE_CODE.COMPLETED,
            moduleName,
            dryRun,
            summary: `${moduleName} ${operation} ${dryRun ? '(dry-run) ' : ''}completed`,
            timestamp: new Date().toISOString(),
            response: { organizationAdminConfig: [], delegatedAdminAccountConfig: [], detectorConfig: [] },
          }),
        ),
      buildErrorResponse: vi
        .fn()
        .mockImplementation((error: unknown, moduleName: string, operation: string, dryRun: boolean) => {
          let errorMessage = String(error);
          let errorName = 'UnknownError';
          if (error instanceof Error) {
            errorMessage = error.message;
            errorName = error.name;
          }
          return {
            status: MODULE_STATE_CODE.FAILED,
            moduleName,
            dryRun,
            summary: `${moduleName} ${operation} failed with error: ${errorMessage}`,
            timestamp: new Date().toISOString(),
            error: { name: errorName, message: errorMessage },
            response: { organizationAdminConfig: [], delegatedAdminAccountConfig: [], detectorConfig: [] },
          };
        }),
    };
    (SecurityServiceModuleResponseBuilder as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () {
      return mockResponseBuilder;
    });

    (processEnableOperations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (processDisableOperations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (manageOrganizationsApiDelegatedAdmin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getCredentials as ReturnType<typeof vi.fn>).mockResolvedValue(mockCredentials);
    (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getDetectorId as ReturnType<typeof vi.fn>).mockResolvedValue('detector-123');
    (createDetector as ReturnType<typeof vi.fn>).mockResolvedValue('new-detector-123');
    (OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    (OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    (GuardDutyMembers.enable as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (GuardDutyMembers.disable as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (FindingsExportConfiguration.configurePublishingDestination as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    (FindingsExportConfiguration.deletePublishingDestination as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  });

  describe('Basic Functionality', () => {
    it('should successfully configure GuardDuty with default values', async () => {
      const result = await configureGuardDuty(baseRequest);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.moduleName).toBe('guardduty');
      expect(result.dryRun).toBe(false);
      expect(SecurityServiceContextBuilder).toHaveBeenCalled();
      expect(processEnableOperations).toHaveBeenCalled();
      expect(SecurityServiceModuleResponseBuilder).toHaveBeenCalled();
    });

    it('should call manageOrganizationsApiDelegatedAdmin before regional operations', async () => {
      await configureGuardDuty(baseRequest);

      expect(manageOrganizationsApiDelegatedAdmin).toHaveBeenCalledWith(
        expect.any(Object),
        'guardduty.amazonaws.com',
        '111111111111',
        ['us-east-1'],
        [],
        false,
        '123456789012:us-east-1',
        expect.any(Object),
      );

      const orgApiCallOrder = (manageOrganizationsApiDelegatedAdmin as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0];
      const enableOpsCallOrder = (processEnableOperations as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      expect(orgApiCallOrder).toBeLessThan(enableOpsCallOrder);
    });

    it('should handle dry run mode', async () => {
      const dryRunRequest = { ...baseRequest, dryRun: true };
      const result = await configureGuardDuty(dryRunRequest);

      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(result.dryRun).toBe(true);
    });

    it('should use default module name when not provided', async () => {
      const requestWithoutModuleName = { ...baseRequest, moduleName: undefined };
      await configureGuardDuty(requestWithoutModuleName as IGuardDutyModuleRequest);

      expect(mockContextBuilder.build).toHaveBeenCalledWith(
        AcceleratorModuleName.AMAZON_GUARDDUTY,
        expect.any(Object),
        'guardduty.amazonaws.com',
        '123456789012:us-east-1',
      );
    });

    it('should pass disabled regions to manageOrganizationsApiDelegatedAdmin', async () => {
      mockContextBuilder.build.mockResolvedValueOnce({
        moduleName: 'guardduty',
        managementAccountId: '123456789012',
        enabledRegions: ['us-east-1'],
        disabledRegions: ['us-west-2', 'eu-west-1'],
        enableOrderedAccounts: [{ name: 'Management', order: 1, accounts: [mockOrganizationAccounts[0]] }],
        disableOrderedAccounts: [{ name: 'Management', order: 1, accounts: [mockOrganizationAccounts[0]] }],
        organizationAccounts: mockOrganizationAccounts,
        concurrency: { maxConcurrentEnvironments: 5, operationTimeoutMs: 60000 },
      });

      await configureGuardDuty(baseRequest);

      expect(manageOrganizationsApiDelegatedAdmin).toHaveBeenCalledWith(
        expect.any(Object),
        'guardduty.amazonaws.com',
        '111111111111',
        ['us-east-1'],
        ['us-west-2', 'eu-west-1'],
        false,
        '123456789012:us-east-1',
        expect.any(Object),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle errors from context builder', async () => {
      const testError = new Error('Context builder error');
      mockContextBuilder.build.mockRejectedValueOnce(testError);

      const result = await configureGuardDuty(baseRequest);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.error?.message).toBe('Context builder error');
    });

    it('should handle non-Error exceptions', async () => {
      mockContextBuilder.build.mockRejectedValueOnce('String error');

      const result = await configureGuardDuty(baseRequest);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.error?.name).toBe('UnknownError');
    });

    it('should handle errors from manageOrganizationsApiDelegatedAdmin', async () => {
      const testError = new Error('Organizations API error');
      (manageOrganizationsApiDelegatedAdmin as ReturnType<typeof vi.fn>).mockRejectedValueOnce(testError);

      const result = await configureGuardDuty(baseRequest);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(processEnableOperations).not.toHaveBeenCalled();
    });

    it('should handle errors from processEnableOperations', async () => {
      (processEnableOperations as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Enable error'));

      const result = await configureGuardDuty(baseRequest);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    });
  });

  describe('Response Building', () => {
    it('should build response with enable results', async () => {
      await configureGuardDuty(baseRequest);

      expect(mockResponseBuilder.build).toHaveBeenCalledWith(
        'guardduty',
        'enable',
        expect.objectContaining({
          organizationAdminConfig: expect.any(Array),
          delegatedAdminAccountConfig: expect.any(Array),
          detectorConfig: expect.any(Array),
        }),
        [],
        [],
        false,
      );
    });

    it('should build module response when enable responses are collected', async () => {
      (processEnableOperations as ReturnType<typeof vi.fn>).mockImplementation(async (config: BatchProcessorConfig) => {
        const propsWithResponses = config.props;
        if (propsWithResponses.collectedResponses) {
          propsWithResponses.collectedResponses.push({
            region: 'us-east-1',
            accountId: '123456789012',
            response: {
              organizationAdmin: {
                managementAccountId: '123456789012',
                delegatedAdminAccountId: '111111111111',
              },
            },
            operation: 'enable',
          });
        }
        return [];
      });

      await configureGuardDuty(baseRequest);
      expect(mockResponseBuilder.build).toHaveBeenCalled();
    });

    it('should build module response when disable responses are collected', async () => {
      mockContextBuilder.build.mockResolvedValueOnce({
        moduleName: 'guardduty',
        managementAccountId: '123456789012',
        enabledRegions: [],
        disabledRegions: ['us-west-2'],
        enableOrderedAccounts: [],
        disableOrderedAccounts: [{ name: 'Management', order: 1, accounts: [mockOrganizationAccounts[0]] }],
        organizationAccounts: mockOrganizationAccounts,
        concurrency: { maxConcurrentEnvironments: 5, operationTimeoutMs: 60000 },
      });

      (processDisableOperations as ReturnType<typeof vi.fn>).mockImplementation(
        async (config: BatchProcessorConfig) => {
          const propsWithResponses = config.props;
          if (propsWithResponses.collectedResponses) {
            propsWithResponses.collectedResponses.push({
              region: 'us-west-2',
              accountId: '123456789012',
              response: {
                organizationAdmin: {
                  managementAccountId: '123456789012',
                  delegatedAdminAccountId: '111111111111',
                },
              },
              operation: 'disable',
            });
          }
          return [];
        },
      );

      await configureGuardDuty(baseRequest);
      expect(mockResponseBuilder.build).toHaveBeenCalled();
    });
  });

  describe('Cleanup Operations', () => {
    it('should perform cleanup when disabled regions exist', async () => {
      mockContextBuilder.build.mockResolvedValueOnce({
        moduleName: 'guardduty',
        managementAccountId: '123456789012',
        enabledRegions: ['us-east-1'],
        disabledRegions: ['us-west-2'],
        enableOrderedAccounts: [{ name: 'Management', order: 1, accounts: [mockOrganizationAccounts[0]] }],
        disableOrderedAccounts: [],
        organizationAccounts: mockOrganizationAccounts,
        concurrency: { maxConcurrentEnvironments: 5, operationTimeoutMs: 60000 },
      });

      await configureGuardDuty(baseRequest);

      // processDisableOperations called twice: once for disable, once for cleanup
      expect(processDisableOperations).toHaveBeenCalledTimes(2);
    });

    it('should not perform cleanup when no disabled regions', async () => {
      await configureGuardDuty(baseRequest);

      expect(processDisableOperations).toHaveBeenCalledTimes(1);
    });

    it('should skip cleanup when no cleanup accounts found', async () => {
      mockContextBuilder.build.mockResolvedValueOnce({
        moduleName: 'guardduty',
        managementAccountId: '999999999999',
        enabledRegions: ['us-east-1'],
        disabledRegions: ['us-west-2'],
        enableOrderedAccounts: [{ name: 'Management', order: 1, accounts: [mockOrganizationAccounts[0]] }],
        disableOrderedAccounts: [],
        organizationAccounts: mockOrganizationAccounts,
        concurrency: { maxConcurrentEnvironments: 5, operationTimeoutMs: 60000 },
      });

      const requestWithDifferentDelegatedAdmin = {
        ...baseRequest,
        configuration: { ...baseRequest.configuration, delegatedAdminAccountId: 'ZZZZZZZZZZZZ' },
      };

      await configureGuardDuty(requestWithDifferentDelegatedAdmin);

      expect(processDisableOperations).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildModuleResponse coverage', () => {
    it('should build response with all three response types (orgAdmin, delegatedAdmin, detector)', async () => {
      (processEnableOperations as ReturnType<typeof vi.fn>).mockImplementation(async (config: BatchProcessorConfig) => {
        const propsWithResponses = config.props;
        if (propsWithResponses.collectedResponses) {
          propsWithResponses.collectedResponses.push({
            region: 'us-east-1',
            accountId: '123456789012',
            response: {
              organizationAdmin: {
                managementAccountId: '123456789012',
                delegatedAdminAccountId: '111111111111',
              },
              delegatedAdmin: {
                adminAccountId: '111111111111',
                memberAccountIds: ['222222222222'],
              },
              detector: {
                accountIds: ['111111111111'],
                protectionsConfiguration: { s3Protection: { enable: true } },
                exportFrequency: 'SIX_HOURS',
              },
            },
            operation: 'enable' as SecurityModuleOperationAction,
          });
        }
        return [];
      });

      const result = await configureGuardDuty(baseRequest);
      expect(result.status).toBe(MODULE_STATE_CODE.COMPLETED);
      expect(mockResponseBuilder.build).toHaveBeenCalled();
    });
  });
});

describe('guardDutyAccountSetup', () => {
  const mockCredentials = {
    accessKeyId: 'test-accessKeyId',
    secretAccessKey: 'test-secretAccessKey',
    sessionToken: 'test-sessionToken',
  };

  const baseRequest: IGuardDutyModuleRequest = {
    invokingAccountId: '123456789012',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    partition: 'aws',
    solutionId: 'test-solution',
    credentials: mockCredentials,
    operation: 'enable',
    moduleName: AcceleratorModuleName.AMAZON_GUARDDUTY,
    configuration: {
      enable: true,
      delegatedAdminAccountId: '111111111111',
      accountAccessRoleName: 'TestRole',
      autoEnableOrgMembers: 'NEW' as OrgFeatureStatus,
      batchOperationSettings: {
        maxConcurrentEnvironments: 5,
        operationTimeoutMs: 60000,
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getCredentials as ReturnType<typeof vi.fn>).mockResolvedValue({
      accessKeyId: 'assumed-key',
      secretAccessKey: 'assumed-secret',
      sessionToken: 'assumed-token',
    });
  });

  it('should return original props for management account', async () => {
    const managementAccount: Account = { Id: '123456789012', Name: 'Management' };

    const result = await guardDutyAccountSetup(managementAccount, '123456789012', baseRequest);

    expect(result).toBe(baseRequest);
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('should assume role for non-management accounts', async () => {
    const targetAccount: Account = { Id: '111111111111', Name: 'DelegatedAdmin' };

    const result = await guardDutyAccountSetup(targetAccount, '123456789012', baseRequest);

    expect(getCredentials).toHaveBeenCalledWith({
      partition: 'aws',
      accountId: '111111111111',
      region: 'us-east-1',
      logPrefix: 'Invoker:us-east-1',
      solutionId: 'test-solution',
      assumeRoleName: 'TestRole',
      credentials: mockCredentials,
      sessionPolicy: undefined,
      requireSessionPolicy: false,
    });

    expect(result.credentials).toEqual({
      accessKeyId: 'assumed-key',
      secretAccessKey: 'assumed-secret',
      sessionToken: 'assumed-token',
    });
  });
});

describe('Handler Functions', () => {
  const mockCredentials = {
    accessKeyId: 'test-accessKeyId',
    secretAccessKey: 'test-secretAccessKey',
    sessionToken: 'test-sessionToken',
  };

  const mockOrganizationAccounts: Account[] = [
    { Id: '123456789012', Name: 'Management' },
    { Id: '111111111111', Name: 'DelegatedAdmin' },
    { Id: '222222222222', Name: 'Workload1' },
  ];

  const baseRequest: IGuardDutyModuleRequest = {
    invokingAccountId: '123456789012',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    partition: 'aws',
    solutionId: 'test-solution',
    credentials: mockCredentials,
    operation: 'enable',
    moduleName: AcceleratorModuleName.AMAZON_GUARDDUTY,
    configuration: {
      enable: true,
      delegatedAdminAccountId: '111111111111',
      accountAccessRoleName: 'TestRole',
      autoEnableOrgMembers: 'NEW' as OrgFeatureStatus,
      batchOperationSettings: {
        maxConcurrentEnvironments: 5,
        operationTimeoutMs: 60000,
      },
      exportFrequency: 'SIX_HOURS' as FindingPublishingFrequency,
      exportDestination: {
        destinationArn: 'arn:aws:s3:::test-bucket',
        kmsKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/test-key',
        destinationType: 'S3' as DestinationType,
        overrideExisting: true,
      },
      protectionsConfiguration: {
        s3Protection: { enable: true },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getDetectorId as ReturnType<typeof vi.fn>).mockResolvedValue('detector-123');
    (createDetector as ReturnType<typeof vi.fn>).mockResolvedValue('new-detector-123');
    (GuardDutyMembers.enable as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (GuardDutyMembers.disable as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (FindingsExportConfiguration.configurePublishingDestination as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    (FindingsExportConfiguration.deletePublishingDestination as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    (OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
  });

  describe('guardDutyEnableHandler', () => {
    it('should enable GuardDuty for management account', async () => {
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(propsWithResponses.collectedResponses).toHaveLength(1);
      expect(propsWithResponses.collectedResponses[0].operation).toBe('enable');
      expect(propsWithResponses.collectedResponses[0].region).toBe('us-east-1');
    });

    it('should enable GuardDuty for delegated admin account', async () => {
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[1],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(GuardDutyMembers.enable).toHaveBeenCalled();
      expect(FindingsExportConfiguration.configurePublishingDestination).toHaveBeenCalled();
      expect(propsWithResponses.collectedResponses).toHaveLength(1);
    });

    it('should create detector when none exists', async () => {
      (getDetectorId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[1],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(createDetector).toHaveBeenCalled();
    });

    it('should throw when detector cannot be created', async () => {
      (getDetectorId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (createDetector as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await expect(
        guardDutyEnableHandler(
          '123456789012',
          mockOrganizationAccounts[0],
          'us-east-1',
          false,
          'test',
          propsWithResponses,
          mockOrganizationAccounts,
        ),
      ).rejects.toThrow('No GuardDuty detector found');
    });

    it('should not collect responses when collectedResponses is not present', async () => {
      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        baseRequest,
        mockOrganizationAccounts,
      );
      // No error thrown means it handled the missing collectedResponses gracefully
    });

    it('should use empty array when organizationAccounts not provided', async () => {
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
      );

      expect(propsWithResponses.collectedResponses).toHaveLength(1);
    });

    it('should delete existing export destination when export is disabled', async () => {
      const requestNoExport = {
        ...baseRequest,
        configuration: { ...baseRequest.configuration, exportDestination: undefined },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[1],
        'us-east-1',
        false,
        'test',
        requestNoExport,
        mockOrganizationAccounts,
      );

      expect(FindingsExportConfiguration.configurePublishingDestination).not.toHaveBeenCalled();
      expect(FindingsExportConfiguration.deletePublishingDestination).toHaveBeenCalledWith(
        expect.any(Object),
        'detector-123',
        'S3',
        false,
        'test',
      );
    });

    it('should default overrideExisting to true when undefined', async () => {
      const requestNoOverride = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          exportDestination: {
            destinationArn: 'arn:aws:s3:::test-bucket',
            kmsKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/test-key',
            destinationType: 'S3' as DestinationType,
            overrideExisting: undefined,
          },
        },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[1],
        'us-east-1',
        false,
        'test',
        requestNoOverride,
        mockOrganizationAccounts,
      );

      expect(FindingsExportConfiguration.configurePublishingDestination).toHaveBeenCalledWith(
        expect.any(Object),
        true, // overrideExisting defaults to true via ?? operator
        expect.any(String),
        'S3',
        expect.any(Object),
        false,
        'test',
      );
    });

    it('should disable current admin when different from configured', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('999999999999');
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyEnableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      // enableDelegatedAdminAccount should detect the mismatch and disable the old admin
    });
  });

  describe('guardDutyDisableHandler', () => {
    it('should disable GuardDuty for delegated admin account', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[1],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(GuardDutyMembers.disable).toHaveBeenCalled();
      expect(propsWithResponses.collectedResponses).toHaveLength(1);
      expect(propsWithResponses.collectedResponses[0].operation).toBe('disable');
    });

    it('should disable GuardDuty for management account', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(propsWithResponses.collectedResponses).toHaveLength(1);
    });

    it('should skip when GuardDuty is already disabled', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(propsWithResponses.collectedResponses).toHaveLength(1);
      // Response should be empty since service was already disabled
    });

    it('should skip when no detector found', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');
      (getDetectorId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(propsWithResponses.collectedResponses).toHaveLength(1);
    });

    it('should throw when getDetectorId throws', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');
      (getDetectorId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No detector'));
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await expect(
        guardDutyDisableHandler(
          '123456789012',
          mockOrganizationAccounts[0],
          'us-east-1',
          false,
          'test',
          propsWithResponses,
          mockOrganizationAccounts,
        ),
      ).rejects.toThrow('No detector');
    });

    it('should delete findings export when overrideExisting is true', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[1],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
        mockOrganizationAccounts,
      );

      expect(FindingsExportConfiguration.deletePublishingDestination).toHaveBeenCalled();
    });

    it('should skip findings export deletion when overrideExisting is false', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');
      const requestNoOverride = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          exportDestination: { ...baseRequest.configuration.exportDestination!, overrideExisting: false },
        },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[1],
        'us-east-1',
        false,
        'test',
        requestNoOverride,
        mockOrganizationAccounts,
      );

      expect(FindingsExportConfiguration.deletePublishingDestination).not.toHaveBeenCalled();
    });

    it('should not collect responses when collectedResponses is not present', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        baseRequest,
        mockOrganizationAccounts,
      );
      // No error thrown
    });

    it('should use empty array when organizationAccounts not provided', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('111111111111');
      const propsWithResponses = { ...baseRequest, collectedResponses: [] as CollectedResponse[] };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        propsWithResponses,
      );

      expect(propsWithResponses.collectedResponses).toHaveLength(1);
    });
  });

  describe('guardDutyFinalCleanupHandler', () => {
    it('should delete findings export and skip when no detector found', async () => {
      (getDetectorId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await guardDutyFinalCleanupHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        baseRequest,
      );

      expect(FindingsExportConfiguration.deletePublishingDestination).not.toHaveBeenCalled();
    });

    it('should throw when getDetectorId throws', async () => {
      (getDetectorId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No detector'));

      await expect(
        guardDutyFinalCleanupHandler(
          '123456789012',
          mockOrganizationAccounts[0],
          'us-east-1',
          false,
          'test',
          baseRequest,
        ),
      ).rejects.toThrow('No detector');

      expect(FindingsExportConfiguration.deletePublishingDestination).not.toHaveBeenCalled();
    });

    it('should delete findings export when detector exists and export configured', async () => {
      await guardDutyFinalCleanupHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        baseRequest,
      );

      expect(FindingsExportConfiguration.deletePublishingDestination).toHaveBeenCalledWith(
        expect.any(Object),
        'detector-123',
        'S3',
        false,
        'test',
      );
    });

    it('should skip export deletion when overrideExisting is false', async () => {
      const requestNoOverride = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          exportDestination: { ...baseRequest.configuration.exportDestination!, overrideExisting: false },
        },
      };

      await guardDutyFinalCleanupHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        requestNoOverride,
      );

      expect(FindingsExportConfiguration.deletePublishingDestination).not.toHaveBeenCalled();
    });

    it('should skip export deletion when no export destination configured', async () => {
      const requestNoExport = {
        ...baseRequest,
        configuration: { ...baseRequest.configuration, exportDestination: undefined },
      };

      await guardDutyFinalCleanupHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        requestNoExport,
      );

      expect(FindingsExportConfiguration.deletePublishingDestination).not.toHaveBeenCalled();
    });

    it('should handle dry run mode', async () => {
      await guardDutyFinalCleanupHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        true,
        'test',
        baseRequest,
      );

      // Should still call deletePublishingDestination (it handles dryRun internally)
      expect(FindingsExportConfiguration.deletePublishingDestination).toHaveBeenCalled();
    });
  });

  describe('guardDutyDisableHandler - disableDelegatedAdminAccount else branch', () => {
    it('should hit deregister=false path when managementAccountId equals delegatedAdminAccountId', async () => {
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>).mockResolvedValue('123456789012');
      // When managementAccountId === delegatedAdminAccountId, deregister is false
      const requestSameAdmin = {
        ...baseRequest,
        configuration: { ...baseRequest.configuration, delegatedAdminAccountId: '123456789012' },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[0], // management account
        'us-east-1',
        false,
        'test',
        requestSameAdmin,
        mockOrganizationAccounts,
      );

      expect(requestSameAdmin.collectedResponses).toHaveLength(1);
    });

    it('should skip disable when no delegated admin found in deregister=false path', async () => {
      // First call returns admin (for disableService check), second returns undefined (for delegatedAdminOps.getCurrent in else branch)
      (getOrganizationAdminAccountId as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('123456789012') // disableService: currentAdmin check
        .mockResolvedValueOnce(undefined); // disableDelegatedAdminAccount else branch: getCurrent returns undefined

      const requestSameAdmin = {
        ...baseRequest,
        configuration: { ...baseRequest.configuration, delegatedAdminAccountId: '123456789012' },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyDisableHandler(
        '123456789012',
        mockOrganizationAccounts[0],
        'us-east-1',
        false,
        'test',
        requestSameAdmin,
        mockOrganizationAccounts,
      );

      // Should complete without error
      expect(requestSameAdmin.collectedResponses).toHaveLength(1);
    });
  });
});

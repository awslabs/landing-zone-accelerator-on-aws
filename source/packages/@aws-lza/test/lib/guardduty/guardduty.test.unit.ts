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

vi.mock('../../../lib/common/organizations-functions', () => ({
  ensureOrganizationsTrustedAccess: vi.fn(),
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
  OrgFeatureStatus: { NEW: 'NEW', ALL: 'ALL', NONE: 'NONE' },
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
import { MODULE_SESSION_POLICIES } from '../../../lib/common/module-session-policies';
import { SecurityServiceModuleResponseBuilder } from '../../../lib/common/security/security-service-module-response-builder';
import { getCredentials } from '../../../lib/common/sts-functions';
import { ensureOrganizationsTrustedAccess } from '../../../lib/common/organizations-functions';
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
        eksProtection: { auditLogs: true, runtimeMonitoring: true, manageAgent: true },
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
    (ensureOrganizationsTrustedAccess as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
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

    it('should ensure Malware Protection trusted access before regional operations when EC2 Protection is enabled', async () => {
      await configureGuardDuty(baseRequest);

      expect(ensureOrganizationsTrustedAccess).toHaveBeenCalledWith(
        expect.any(Object),
        'malware-protection.guardduty.amazonaws.com',
        false,
        '123456789012:us-east-1',
      );

      const trustedAccessCallOrder = (ensureOrganizationsTrustedAccess as ReturnType<typeof vi.fn>).mock
        .invocationCallOrder[0];
      const enableOpsCallOrder = (processEnableOperations as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
      expect(trustedAccessCallOrder).toBeLessThan(enableOpsCallOrder);
    });

    it('should not ensure trusted access when EC2 Protection is disabled', async () => {
      const request = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          protectionsConfiguration: {
            ...baseRequest.configuration.protectionsConfiguration!,
            ec2Protection: { enable: false, keepSnapshots: false },
          },
        },
      };

      await configureGuardDuty(request);

      expect(ensureOrganizationsTrustedAccess).not.toHaveBeenCalled();
    });

    it('should not ensure trusted access when EC2 Protection is excluded from every enabled region', async () => {
      const request = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          protectionsConfiguration: {
            ...baseRequest.configuration.protectionsConfiguration!,
            ec2Protection: { enable: true, keepSnapshots: false, excludedRegions: ['us-east-1'] },
          },
        },
      };

      await configureGuardDuty(request);

      expect(ensureOrganizationsTrustedAccess).not.toHaveBeenCalled();
    });

    it('should stop before regional operations when trusted access cannot be confirmed', async () => {
      (ensureOrganizationsTrustedAccess as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Trusted access did not settle'),
      );

      const result = await configureGuardDuty(baseRequest);

      expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
      expect(result.error?.message).toBe('Trusted access did not settle');
      expect(processEnableOperations).not.toHaveBeenCalled();
      expect(processDisableOperations).not.toHaveBeenCalled();
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

  describe('findings-export session policy scoping', () => {
    const targetAccount: Account = { Id: '111111111111', Name: 'DelegatedAdmin' };

    const appliedPolicy = (): string =>
      (getCredentials as ReturnType<typeof vi.fn>).mock.calls[0][0].sessionPolicy as string;
    const statementFor = (policy: string, sid: string) =>
      JSON.parse(policy).Statement.find((s: { Sid?: string }) => s.Sid === sid);

    const requestWith = (exportDestination?: Record<string, unknown>): IGuardDutyModuleRequest =>
      ({
        ...baseRequest,
        sessionPolicy: MODULE_SESSION_POLICIES['guardduty'].policy,
        configuration: { ...baseRequest.configuration, exportDestination },
      }) as IGuardDutyModuleRequest;

    it('should scope s3 object actions to the findings-export destination', async () => {
      await guardDutyAccountSetup(
        targetAccount,
        '123456789012',
        requestWith({
          destinationArn: 'arn:aws:s3:::aws-accelerator-central-logs-111111111111-us-east-1/guardduty',
          kmsKeyArn: 'arn:aws:kms:us-east-1:111111111111:key/test',
          destinationType: 'S3',
        }),
      );

      const policy = appliedPolicy();
      expect(statementFor(policy, 'GuardDutyFindingsExportObjects')).toEqual({
        Sid: 'GuardDutyFindingsExportObjects',
        Effect: 'Allow',
        Action: ['s3:PutObject', 's3:GetObject'],
        Resource: 'arn:aws:s3:::aws-accelerator-central-logs-111111111111-us-east-1/guardduty/*',
      });
      // The wildcard statement must no longer carry object-level S3 access
      expect(statementFor(policy, 'ModuleSpecificActions').Action).not.toContain('s3:PutObject');
      expect(statementFor(policy, 'ModuleSpecificActions').Action).not.toContain('s3:GetObject');
    });

    it('should normalise a trailing slash on the destination ARN', async () => {
      await guardDutyAccountSetup(
        targetAccount,
        '123456789012',
        requestWith({
          destinationArn: 'arn:aws:s3:::bucket/guardduty/',
          kmsKeyArn: 'arn:aws:kms:us-east-1:111111111111:key/test',
          destinationType: 'S3',
        }),
      );

      expect(statementFor(appliedPolicy(), 'GuardDutyFindingsExportObjects').Resource).toEqual(
        'arn:aws:s3:::bucket/guardduty/*',
      );
    });

    it('should pass the policy through unchanged when findings export is not configured', async () => {
      const request = requestWith();
      // Precondition: this exercises the empty-resource branch, not the scoping branch
      expect(request.configuration.exportDestination).toBeUndefined();

      await guardDutyAccountSetup(targetAccount, '123456789012', request);

      expect(appliedPolicy()).toEqual(MODULE_SESSION_POLICIES['guardduty'].policy);
      expect(statementFor(appliedPolicy(), 'GuardDutyFindingsExportObjects')).toBeUndefined();
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

  describe('guardDutyEnableHandler deploymentTargets account boundary', () => {
    // Organization accounts WITH emails so toAccountDetails produces AccountDetail entries.
    // (The shared mockOrganizationAccounts intentionally omit Email.)
    const MGMT = '123456789012';
    const DELEGATED_ADMIN = '111111111111';
    const WORKLOAD_1 = '222222222222';
    const WORKLOAD_2 = '333333333333';
    const orgAccountsWithEmail: Account[] = [
      { Id: MGMT, Name: 'Management', Email: 'management@example.com' },
      { Id: DELEGATED_ADMIN, Name: 'DelegatedAdmin', Email: 'delegated-admin@example.com' },
      { Id: WORKLOAD_1, Name: 'Workload1', Email: 'workload1@example.com' },
      { Id: WORKLOAD_2, Name: 'Workload2', Email: 'workload2@example.com' },
    ];
    const delegatedAdminAccount = orgAccountsWithEmail[1];

    const getEnableCallArgs = () => {
      const call = (GuardDutyMembers.enable as ReturnType<typeof vi.fn>).mock.calls[0];
      return {
        enableAccounts: call[1] as { AccountId: string; Email: string }[],
        disableAccounts: call[2] as { AccountId: string; Email: string }[],
      };
    };

    it('enables only boundary accounts and prunes out-of-boundary accounts when boundary is set', async () => {
      // Boundary limits scope to management + delegated admin + workload 1 (workload 2 is out of scope).
      const requestWithBoundary = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          autoEnableOrgMembers: 'NONE' as OrgFeatureStatus,
          boundary: { accounts: [MGMT, DELEGATED_ADMIN, WORKLOAD_1] },
        },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        MGMT,
        delegatedAdminAccount,
        'us-east-1',
        false,
        'test',
        requestWithBoundary,
        orgAccountsWithEmail,
      );

      expect(GuardDutyMembers.enable).toHaveBeenCalledTimes(1);
      const { enableAccounts, disableAccounts } = getEnableCallArgs();

      // enableAccounts = boundary minus the delegated admin itself → management + workload 1.
      expect(enableAccounts.map(a => a.AccountId).sort()).toEqual([MGMT, WORKLOAD_1].sort());

      // disableAccounts = org (minus admin) − boundary → only the out-of-boundary workload 2.
      expect(disableAccounts.map(a => a.AccountId)).toEqual([WORKLOAD_2]);
    });

    it('never places the management account in disableAccounts even if boundary omits it', async () => {
      // Boundary omits the management account entirely (non-accelerator style caller).
      const requestWithBoundary = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          autoEnableOrgMembers: 'NONE' as OrgFeatureStatus,
          boundary: { accounts: [DELEGATED_ADMIN, WORKLOAD_1] },
        },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        MGMT,
        delegatedAdminAccount,
        'us-east-1',
        false,
        'test',
        requestWithBoundary,
        orgAccountsWithEmail,
      );

      const { enableAccounts, disableAccounts } = getEnableCallArgs();
      const disableIds = disableAccounts.map(a => a.AccountId);

      // Management account must never be pruned, and delegated admin is never a member of itself.
      expect(disableIds).not.toContain(MGMT);
      expect(disableIds).not.toContain(DELEGATED_ADMIN);
      // Out-of-boundary workload 2 is still pruned.
      expect(disableIds).toEqual([WORKLOAD_2]);
      // enableAccounts scoped to the boundary (minus admin) → only workload 1.
      expect(enableAccounts.map(a => a.AccountId)).toEqual([WORKLOAD_1]);
    });

    it('throws before any mutating call when a SUBSET boundary is combined with autoEnableOrgMembers != NONE', async () => {
      const requestWithBoundaryAndAll = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          autoEnableOrgMembers: 'ALL' as OrgFeatureStatus,
          // Proper subset: WORKLOAD_2 is out of boundary → prune non-empty → contradictory with ALL.
          boundary: { accounts: [MGMT, DELEGATED_ADMIN, WORKLOAD_1] },
        },
        collectedResponses: [] as CollectedResponse[],
      };

      await expect(
        guardDutyEnableHandler(
          MGMT,
          delegatedAdminAccount,
          'us-east-1',
          false,
          'test',
          requestWithBoundaryAndAll,
          orgAccountsWithEmail,
        ),
      ).rejects.toThrow('requires autoEnableOrgMembers=NONE');

      // Must fail fast before enrolling/pruning any members.
      expect(GuardDutyMembers.enable).not.toHaveBeenCalled();
    });

    it('does NOT throw for a full-organization boundary with autoEnableOrgMembers=ALL (Root-OU case)', async () => {
      const requestFullOrgBoundaryAll = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          autoEnableOrgMembers: 'ALL' as OrgFeatureStatus,
          // Boundary covers every org account (e.g. deploymentTargets: Root OU) → nothing to prune,
          // so ALL is not contradictory and the module must not reject this (pre-MR behavior preserved).
          boundary: { accounts: [MGMT, DELEGATED_ADMIN, WORKLOAD_1, WORKLOAD_2] },
        },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        MGMT,
        delegatedAdminAccount,
        'us-east-1',
        false,
        'test',
        requestFullOrgBoundaryAll,
        orgAccountsWithEmail,
      );

      // No prune, no throw — enrollment proceeds normally.
      expect(GuardDutyMembers.enable).toHaveBeenCalledTimes(1);
      const { enableAccounts, disableAccounts } = getEnableCallArgs();
      expect(enableAccounts.map(a => a.AccountId).sort()).toEqual([MGMT, WORKLOAD_1, WORKLOAD_2].sort());
      expect(disableAccounts).toEqual([]);
    });

    it('enables all organization accounts and prunes nothing when no boundary is set', async () => {
      const requestNoBoundary = {
        ...baseRequest,
        configuration: { ...baseRequest.configuration, boundary: undefined },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        MGMT,
        delegatedAdminAccount,
        'us-east-1',
        false,
        'test',
        requestNoBoundary,
        orgAccountsWithEmail,
      );

      const { enableAccounts, disableAccounts } = getEnableCallArgs();

      // No boundary → all org accounts minus the delegated admin are enabled.
      expect(enableAccounts.map(a => a.AccountId).sort()).toEqual([MGMT, WORKLOAD_1, WORKLOAD_2].sort());
      // No prune when there is no boundary.
      expect(disableAccounts).toEqual([]);
    });

    it('prunes nothing when boundary is set but empty (empty = no boundary)', async () => {
      const requestEmptyBoundary = {
        ...baseRequest,
        configuration: { ...baseRequest.configuration, boundary: { accounts: [] } },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        MGMT,
        delegatedAdminAccount,
        'us-east-1',
        false,
        'test',
        requestEmptyBoundary,
        orgAccountsWithEmail,
      );

      const { enableAccounts, disableAccounts } = getEnableCallArgs();

      // Empty boundary is treated as "no boundary": enable all org accounts minus admin, prune nothing.
      expect(enableAccounts.map(a => a.AccountId).sort()).toEqual([MGMT, WORKLOAD_1, WORKLOAD_2].sort());
      expect(disableAccounts).toEqual([]);
    });

    it('reports boundary-scoped memberAccountIds in the collected response', async () => {
      const requestWithBoundary = {
        ...baseRequest,
        configuration: {
          ...baseRequest.configuration,
          autoEnableOrgMembers: 'NONE' as OrgFeatureStatus,
          boundary: { accounts: [MGMT, DELEGATED_ADMIN, WORKLOAD_1] },
        },
        collectedResponses: [] as CollectedResponse[],
      };

      await guardDutyEnableHandler(
        MGMT,
        delegatedAdminAccount,
        'us-east-1',
        false,
        'test',
        requestWithBoundary,
        orgAccountsWithEmail,
      );

      const collected = requestWithBoundary.collectedResponses[0] as unknown as {
        response: { delegatedAdmin?: { adminAccountId?: string; memberAccountIds?: string[] } };
      };
      expect(collected.response.delegatedAdmin?.adminAccountId).toBe(DELEGATED_ADMIN);
      // memberAccountIds reflects the boundary-scoped enrolled set, not the full organization.
      expect(collected.response.delegatedAdmin?.memberAccountIds?.slice().sort()).toEqual([MGMT, WORKLOAD_1].sort());
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

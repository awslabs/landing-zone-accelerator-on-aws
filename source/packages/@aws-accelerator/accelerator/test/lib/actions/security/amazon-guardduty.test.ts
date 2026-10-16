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

import { AccountsConfig, GlobalConfig, SecurityConfig } from '@aws-accelerator/config';
import { MODULE_STATE_CODE } from 'aws-lza';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcceleratorResourceNames } from '../../../../lib/accelerator-resource-names';
import { AmazonGuardDuty } from '../../../../lib/actions/security/amazon-guardduty';
import { AcceleratorModules, ModuleExecutionPhase, ModuleParams } from '../../../../lib/types';
import { AcceleratorResourcePrefixes } from '../../../../utils/app-utils';

// Mock path module
vi.mock('path', () => ({
  default: {
    parse: vi.fn(() => ({ name: 'amazon-guardduty' })),
    basename: vi.fn(() => 'amazon-guardduty.ts'),
  },
}));

// Mock aws-lza module
vi.mock('aws-lza', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    processStart: vi.fn(),
    processEnd: vi.fn(),
  };

  const mockStatusLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    processStart: vi.fn(),
    processEnd: vi.fn(),
  };

  return {
    configureGuardDuty: vi.fn(),
    createLogger: vi.fn(() => mockLogger),
    createStatusLogger: vi.fn(() => mockStatusLogger),
    isGuardDutyAvailableInPartition: vi.fn(() => Promise.resolve(true)),
    GuardDutyOrgFeatureStatus: {
      ALL: 'ALL',
      NEW: 'NEW',
      NONE: 'NONE',
    },
    DynamoDBFilterOperator: {
      ATTRIBUTE_EXISTS: 'attribute_exists',
      EQUALS: '=',
    },
    MODULE_STATE_CODE: {
      SKIPPED: 'SKIPPED',
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED',
      COMPLETED: 'COMPLETED',
    },
  };
});

// Mock common-config module
vi.mock('../../../../lib/actions/utils/common-config', () => ({
  extractSecurityServiceMetadata: vi.fn(() => ({
    delegatedAdminAccountId: 'YYYYYYYYYYYY',
    enabledRegionsCount: 2,
    enabledRegionsHash: 'abc123',
    accountsCount: 4,
    accountsHash: 'def456',
  })),
  loadOrganizationDataSources: vi.fn(() => Promise.resolve(undefined)),
}));

// Mock module-state module
vi.mock('../../../../lib/actions/utils/module-state', () => ({
  calculateArrayHash: vi.fn((arr: string[]) => `hash-${arr.sort().join('-')}`),
  hasModuleConfigChanged: vi.fn(() => Promise.resolve(true)),
  saveModuleExecutionState: vi.fn(() => Promise.resolve()),
}));

// Mock module-logging module
vi.mock('../../../../lib/actions/utils/module-logging', () => ({
  logModuleExecutionResult: vi.fn(),
}));

describe('AmazonGuardDuty', () => {
  const mockSessionContext = {
    invokingAccountId: 'XXXXXXXXXXXX',
    region: 'us-east-1',
    partition: 'aws',
    globalRegion: 'us-east-1',
  };

  const mockResourcePrefixes: AcceleratorResourcePrefixes = {
    accelerator: 'AWSAccelerator',
    bucketName: 'aws-accelerator',
    databaseName: 'aws-accelerator',
    kmsAlias: 'alias/accelerator',
    repoName: 'aws-accelerator',
    secretName: '/accelerator',
    snsTopicName: 'aws-accelerator',
    ssmParamName: '/accelerator',
    importResourcesSsmParamName: '/accelerator/imported-resources',
    trailLogName: 'aws-accelerator',
    ssmLogName: 'aws-accelerator',
  };

  const mockAcceleratorResourceNames = {} as AcceleratorResourceNames;

  const mockLogging = {
    centralizedRegion: 'us-east-1',
    bucketName: 'aws-accelerator-logs-XXXXXXXXXXXX-us-east-1',
    bucketKeyArn: 'arn:aws:kms:us-east-1:XXXXXXXXXXXX:key/12345678-1234-1234-1234-XXXXXXXXXXXX',
  };

  let mockAccountsConfig: AccountsConfig;
  let mockGlobalConfig: GlobalConfig;
  let mockSecurityConfig: SecurityConfig;

  const mockGuardDutyConfig = {
    enable: true,
    excludeRegions: [] as string[],
    disabledRegions: [] as string[],
    overrideExisting: false,
    autoEnableOrgMembers: true,
    s3Protection: {
      enable: true,
      excludeRegions: [] as string[],
    },
    eksProtection: {
      enable: true,
      manageAgent: true,
      excludeRegions: [] as string[],
    },
    ec2Protection: {
      enable: true,
      keepSnapshots: false,
      excludeRegions: [] as string[],
    },
    rdsProtection: {
      enable: true,
      excludeRegions: [] as string[],
    },
    lambdaProtection: {
      enable: true,
      excludeRegions: [] as string[],
    },
    exportConfiguration: {
      enable: true,
      overrideExisting: false,
      exportFrequency: 'FIFTEEN_MINUTES',
    },
  };

  const mockModuleItem = {
    name: AcceleratorModules.GUARDDUTY,
    description: 'Configure Amazon GuardDuty',
    runOrder: 1,
    executionPhase: ModuleExecutionPhase.DEPLOY,
    handler: vi.fn(),
  };

  const mockRunnerParameters = {
    sessionContext: mockSessionContext,
    configDirPath: '/mock/config',
    prefix: 'AWSAccelerator',
    solutionId: 'AwsSolution/SO0199/1.0.0',
    dryRun: false,
    loadOrganizationsFromDynamoDbTable: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockAccountsConfig = {
      getManagementAccountId: vi.fn().mockReturnValue('111111111111'),
      getAuditAccountId: vi.fn().mockReturnValue('YYYYYYYYYYYY'),
      getAccountId: vi.fn().mockImplementation((accountName: string) => {
        if (accountName === 'Audit') {
          return 'YYYYYYYYYYYY';
        }
        return '111111111111';
      }),
      getAccountIdsFromDeploymentTarget: vi
        .fn()
        .mockReturnValue(['111111111111', 'YYYYYYYYYYYY', '333333333333', '444444444444']),
    } as unknown as AccountsConfig;

    mockGlobalConfig = {
      managementAccountAccessRole: 'AWSAcceleratorExecutionRole',
      enabledRegions: ['us-east-1', 'us-west-2'],
      homeRegion: 'us-east-1',
    } as unknown as GlobalConfig;

    mockSecurityConfig = {
      centralSecurityServices: {
        delegatedAdminAccount: 'Audit',
        guardduty: mockGuardDutyConfig,
      },
    } as unknown as SecurityConfig;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockModuleParams = (overrides: any = {}): ModuleParams => {
    const configs = {
      accountsConfig: mockAccountsConfig,
      globalConfig: mockGlobalConfig,
      securityConfig: mockSecurityConfig,
      ...overrides.configs,
    };

    const moduleRunnerParameters = {
      configs,
      resourcePrefixes: mockResourcePrefixes,
      acceleratorResourceNames: mockAcceleratorResourceNames,
      logging: mockLogging,
      organizationAccounts: [
        { Id: '111111111111', Name: 'Management' },
        { Id: 'YYYYYYYYYYYY', Name: 'Audit' },
        { Id: '333333333333', Name: 'Workload1' },
        { Id: '444444444444', Name: 'Workload2' },
      ],
      organizationDetails: undefined,
      managementAccountCredentials: {
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
      },
      ...overrides.moduleRunnerParameters,
    };

    const runnerParameters = {
      ...mockRunnerParameters,
      ...overrides.runnerParameters,
    };

    return {
      moduleItem: mockModuleItem,
      runnerParameters,
      moduleRunnerParameters,
    };
  };

  describe('configure - basic functionality', () => {
    it('should skip module when stack resources retention module is skipped', async () => {
      process.env['SKIP_STACK_RESOURCES_RETENTION_MODULE'] = 'true';
      const params = createMockModuleParams();

      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('stack resources retention module is skipped');
      expect(result.moduleName).toBe(AcceleratorModules.GUARDDUTY);
      expect(result.dryRun).toBe(false);
      delete process.env['SKIP_STACK_RESOURCES_RETENTION_MODULE'];
    });

    it('should skip module when GuardDuty is not configured', async () => {
      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: undefined,
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('GuardDuty is not configured');
      expect(result.moduleName).toBe(AcceleratorModules.GUARDDUTY);
      expect(result.dryRun).toBe(false);
    });

    it('should throw error when logging bucket name is missing', async () => {
      const params = createMockModuleParams({
        moduleRunnerParameters: {
          logging: {
            ...mockLogging,
            bucketName: undefined,
          },
        },
      });

      await expect(AmazonGuardDuty.configure(params)).rejects.toThrow(
        'Logging bucket name and key arn must be provided.',
      );
    });

    it('should throw error when logging bucket key ARN is missing', async () => {
      const params = createMockModuleParams({
        moduleRunnerParameters: {
          logging: {
            ...mockLogging,
            bucketKeyArn: undefined,
          },
        },
      });

      await expect(AmazonGuardDuty.configure(params)).rejects.toThrow(
        'Logging bucket name and key arn must be provided.',
      );
    });

    it('should skip module when GuardDuty is not available in the partition', async () => {
      const { isGuardDutyAvailableInPartition } = await import('aws-lza');
      vi.mocked(isGuardDutyAvailableInPartition).mockResolvedValue(false);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('not available in this partition');
      expect(result.moduleName).toBe(AcceleratorModules.GUARDDUTY);
      expect(isGuardDutyAvailableInPartition).toHaveBeenCalledWith(
        {
          region: mockSessionContext.globalRegion,
          solutionId: mockRunnerParameters.solutionId,
          credentials: expect.anything(),
        },
        'XXXXXXXXXXXX:us-east-1',
      );
    });

    it('should proceed when GuardDuty is available in the partition', async () => {
      const { configureGuardDuty, isGuardDutyAvailableInPartition } = await import('aws-lza');
      vi.mocked(isGuardDutyAvailableInPartition).mockResolvedValue(true);
      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('COMPLETED');
      expect(configureGuardDuty).toHaveBeenCalled();
    });
  });

  describe('configure - state management', () => {
    it('should skip execution when config has not changed', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(false);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('configuration has not changed since last execution');
      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: AcceleratorModules.GUARDDUTY,
          overrideExisting: false,
        }),
        params,
        'XXXXXXXXXXXX:us-east-1',
      );
    });

    it('should return FAILED when state management check fails', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockRejectedValue(new Error('DynamoDB table not found'));

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('FAILED');
      expect(result.summary).toContain('State management failure');
      expect(result.error).toEqual({
        name: 'StateManagementError',
        message: 'DynamoDB table not found',
      });
    });

    it('should proceed when overrideExisting is true', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');

      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                overrideExisting: true,
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('COMPLETED');
      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          overrideExisting: true,
        }),
        params,
        'XXXXXXXXXXXX:us-east-1',
      );
    });
  });

  describe('configure - GuardDuty configuration phase', () => {
    it('should configure GuardDuty successfully without DynamoDB data sources', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith({
        invokingAccountId: '111111111111',
        region: mockSessionContext.region,
        partition: mockSessionContext.partition,
        globalRegion: mockSessionContext.globalRegion,
        operation: 'setup',
        moduleName: AcceleratorModules.GUARDDUTY,
        solutionId: mockRunnerParameters.solutionId,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
        dryRun: false,
        configuration: {
          accountAccessRoleName: mockGlobalConfig.managementAccountAccessRole,
          enable: true,
          delegatedAdminAccountId: 'YYYYYYYYYYYY',
          autoEnableOrgMembers: 'ALL',
          batchOperationSettings: {
            maxConcurrentEnvironments: 50,
            operationTimeoutMs: 900000,
          },
          protectionsConfiguration: {
            s3Protection: {
              enable: true,
              excludedRegions: [],
            },
            eksProtection: {
              auditLogs: true,
              runtimeMonitoring: true,
              manageAgent: true,
              excludedRegions: [],
            },
            ec2Protection: {
              enable: true,
              keepSnapshots: false,
              excludedRegions: [],
            },
            rdsProtection: {
              enable: true,
              excludedRegions: [],
            },
            lambdaProtection: {
              enable: true,
              excludedRegions: [],
            },
          },
          exportFrequency: 'FIFTEEN_MINUTES',
          exportDestination: {
            destinationArn: `arn:aws:s3:::${mockLogging.bucketName}/guardduty`,
            kmsKeyArn: mockLogging.bucketKeyArn,
            destinationType: 'S3',
            overrideExisting: false,
          },
          enableKeepMalwareSnapshots: false,
          regionFilters: {
            ignoredRegions: undefined,
            disabledRegions: [],
          },
          boundary: {
            accounts: undefined,
            regions: ['us-east-1', 'us-west-2'],
          },
        },
      });
      expect(result).toBe(mockResponse);
    });

    it('should configure GuardDuty with DynamoDB data sources', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const { loadOrganizationDataSources } = await import('../../../../lib/actions/utils/common-config.js');

      const mockDataSources = {
        organizations: {
          tableName: 'AWSAccelerator-ConfigTable-XXXXXXXXXXXX',
          filters: [
            { name: 'commitId', value: 'abc123' },
            { name: 'awsKey', operator: 'attribute_exists' as any },
          ],
        },
      };

      vi.mocked(loadOrganizationDataSources).mockResolvedValue(mockDataSources);
      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });

      const params = createMockModuleParams();
      await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            dataSources: mockDataSources,
          }),
        }),
      );
    });

    it('should use GUARDDUTY_OPERATION_TIMEOUT env var for operationTimeoutMs when set', async () => {
      // Use a value distinct from the default (900000) so this test fails if the env-var read is
      // removed or inverted and the code falls through to the default.
      process.env['GUARDDUTY_OPERATION_TIMEOUT'] = '600000';
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            batchOperationSettings: { maxConcurrentEnvironments: 50, operationTimeoutMs: 600000 },
          }),
        }),
      );
      expect(result).toBe(mockResponse);
      delete process.env['GUARDDUTY_OPERATION_TIMEOUT'];
    });

    it('should default operationTimeoutMs to 900000 when GUARDDUTY_OPERATION_TIMEOUT env var is not set', async () => {
      delete process.env['GUARDDUTY_OPERATION_TIMEOUT'];
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            batchOperationSettings: { maxConcurrentEnvironments: 50, operationTimeoutMs: 900000 },
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it.each(['15m', 'abc', '0', '-1000', ''])(
      'falls back to the default 900000 when GUARDDUTY_OPERATION_TIMEOUT is invalid (%s)',
      async invalidValue => {
        process.env['GUARDDUTY_OPERATION_TIMEOUT'] = invalidValue;
        const { configureGuardDuty } = await import('aws-lza');
        const mockResponse = {
          status: MODULE_STATE_CODE.COMPLETED,
          summary: 'GuardDuty configured successfully',
          timestamp: new Date().toISOString(),
          moduleName: AcceleratorModules.GUARDDUTY,
          dryRun: false,
        };
        vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

        const params = createMockModuleParams();
        const result = await AmazonGuardDuty.configure(params);

        // A non-numeric/non-positive value must not become NaN (which coerces the timeout to 0 and
        // fails every account) — it falls back to the 900000 default.
        expect(configureGuardDuty).toHaveBeenCalledWith(
          expect.objectContaining({
            configuration: expect.objectContaining({
              batchOperationSettings: { maxConcurrentEnvironments: 50, operationTimeoutMs: 900000 },
            }),
          }),
        );
        expect(result).toBe(mockResponse);
        delete process.env['GUARDDUTY_OPERATION_TIMEOUT'];
      },
    );
  });

  describe('configure - state save phase', () => {
    it('should save execution state successfully', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');

      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(saveModuleExecutionState).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: AcceleratorModules.GUARDDUTY,
          config: expect.objectContaining({
            enable: true,
            excludedRegions: [],
            disabledRegions: [],
            autoEnableOrgMembers: true,
            s3Protection: {
              enable: true,
              excludeRegions: [],
            },
            exportConfiguration: {
              enable: true,
              overrideExisting: false,
              exportFrequency: 'FIFTEEN_MINUTES',
            },
          }),
          status: MODULE_STATE_CODE.COMPLETED,
          dryRun: false,
        }),
        params,
        'XXXXXXXXXXXX:us-east-1',
      );
      expect(result.status).toBe('COMPLETED');
    });

    it('should return FAILED when state save fails', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');

      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });
      vi.mocked(saveModuleExecutionState).mockRejectedValue(new Error('DynamoDB write failed'));

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('FAILED');
      expect(result.summary).toContain('Module execution state save failed');
      expect(result.error).toEqual({
        name: 'StateSaveError',
        message: 'DynamoDB write failed',
      });
    });
  });

  describe('configure - error handling and logging', () => {
    beforeEach(async () => {
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(saveModuleExecutionState).mockResolvedValue(undefined);
    });

    it('should handle configureGuardDuty error response', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockErrorResponse = {
        status: MODULE_STATE_CODE.FAILED,
        summary: 'GuardDuty configuration failed',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
        error: {
          name: 'GuardDutyConfigurationError',
          message: 'Failed to configure GuardDuty',
        },
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockErrorResponse);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(result).toBe(mockErrorResponse);
      expect(result.status).toBe('FAILED');
      expect(result.error).toBeDefined();
    });

    it('should log failed environments and regional errors when available', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockErrorResponse = {
        status: MODULE_STATE_CODE.FAILED,
        summary: 'Amazon GuardDuty enable failed in us-west-2',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
        error: {
          name: 'MultipleErrors',
          message: 'Amazon GuardDuty enable failed in us-west-2',
        },
        response: {
          organizationAdminConfig: [],
          delegatedAdminAccountConfig: [],
          sessionConfig: [],
          failedEnvironments: ['123456789012:us-west-2'],
          environmentErrors: [
            {
              region: 'us-west-2',
              accountId: '123456789012',
              accountName: 'Management',
              errorName: 'TestError',
              errorMessage: 'Test error message',
            },
          ],
        },
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockErrorResponse);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(result).toBe(mockErrorResponse);
      expect(result.status).toBe('FAILED');
      expect(result.response?.failedEnvironments).toHaveLength(1);
      expect(result.response?.environmentErrors).toHaveLength(1);
    });
  });

  describe('configure - configuration options', () => {
    it('should handle dry run mode', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configuration dry run completed',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: true,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        runnerParameters: {
          dryRun: true,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
        }),
      );
      expect(result.dryRun).toBe(true);
    });

    it('should handle custom GuardDuty configuration options', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const customGuardDutyConfig = {
        enable: true,
        excludeRegions: ['us-west-1'],
        disabledRegions: ['eu-west-1'],
        overrideExisting: false,
        autoEnableOrgMembers: false,
        s3Protection: {
          enable: false,
          excludeRegions: ['us-west-1'],
        },
        eksProtection: {
          enable: false,
          manageAgent: false,
          excludeRegions: ['us-west-1'],
        },
        ec2Protection: {
          enable: false,
          keepSnapshots: true,
          excludeRegions: ['us-west-1'],
        },
        rdsProtection: {
          enable: false,
          excludeRegions: ['us-west-1'],
        },
        lambdaProtection: {
          enable: false,
          excludeRegions: ['us-west-1'],
        },
        exportConfiguration: {
          enable: true,
          overrideExisting: true,
          exportFrequency: 'ONE_HOUR',
        },
      };

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: customGuardDutyConfig,
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            enable: true,
            autoEnableOrgMembers: 'NONE',
            exportFrequency: 'ONE_HOUR',
            regionFilters: {
              ignoredRegions: ['us-west-1'],
              disabledRegions: ['eu-west-1'],
            },
            protectionsConfiguration: expect.objectContaining({
              s3Protection: {
                enable: false,
                excludedRegions: ['us-west-1'],
              },
              eksProtection: {
                auditLogs: false,
                runtimeMonitoring: false,
                manageAgent: false,
                excludedRegions: ['us-west-1'],
              },
              ec2Protection: {
                enable: false,
                keepSnapshots: true,
                excludedRegions: ['us-west-1'],
              },
              rdsProtection: {
                enable: false,
                excludedRegions: ['us-west-1'],
              },
              lambdaProtection: {
                enable: false,
                excludedRegions: ['us-west-1'],
              },
            }),
            exportDestination: expect.objectContaining({
              overrideExisting: true,
            }),
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should pass through granular EKS auditLogs/runtimeMonitoring independently', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const granularGuardDutyConfig = {
        enable: true,
        excludeRegions: [] as string[],
        autoEnableOrgMembers: 'ALL',
        s3Protection: {
          enable: true,
          excludeRegions: [] as string[],
        },
        // Granular EKS: audit logs OFF, runtime monitoring ON, agent OFF.
        eksProtection: {
          auditLogs: false,
          runtimeMonitoring: true,
          manageAgent: false,
          excludeRegions: [] as string[],
        },
        exportConfiguration: {
          enable: true,
          overrideExisting: false,
          exportFrequency: 'FIFTEEN_MINUTES',
        },
      };

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: granularGuardDutyConfig,
            },
          } as unknown as SecurityConfig,
        },
      });

      await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            protectionsConfiguration: expect.objectContaining({
              eksProtection: {
                auditLogs: false,
                runtimeMonitoring: true,
                manageAgent: false,
                excludedRegions: [],
              },
            }),
          }),
        }),
      );
    });

    it('should handle overrideExisting flag in export configuration', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                overrideExisting: true,
                exportConfiguration: {
                  enable: true,
                  overrideExisting: true,
                  exportFrequency: 'FIFTEEN_MINUTES',
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            exportDestination: expect.objectContaining({
              overrideExisting: true,
            }),
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should map autoEnableOrgMembers true to ALL', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                autoEnableOrgMembers: true,
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            autoEnableOrgMembers: 'ALL',
          }),
        }),
      );
    });

    it('should map autoEnableOrgMembers false to NONE', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                autoEnableOrgMembers: false,
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            autoEnableOrgMembers: 'NONE',
          }),
        }),
      );
    });

    it('should map autoEnableOrgMembers undefined to ALL', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const guardDutyConfigWithoutAutoEnable = {
        ...mockGuardDutyConfig,
        autoEnableOrgMembers: undefined,
      };

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: guardDutyConfigWithoutAutoEnable,
            },
          } as unknown as SecurityConfig,
        },
      });

      await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            autoEnableOrgMembers: 'ALL',
          }),
        }),
      );
    });

    it('should handle export configuration disabled', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                exportConfiguration: {
                  enable: false,
                  overrideExisting: false,
                  exportFrequency: 'FIFTEEN_MINUTES',
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            exportDestination: undefined,
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should handle GuardDuty config without optional protections', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const minimalGuardDutyConfig = {
        enable: true,
        excludeRegions: [],
        disabledRegions: [],
        overrideExisting: false,
        autoEnableOrgMembers: true,
        s3Protection: {
          enable: true,
          excludeRegions: [],
        },
        exportConfiguration: {
          enable: true,
          overrideExisting: false,
          exportFrequency: 'FIFTEEN_MINUTES',
        },
        // No eksProtection, ec2Protection, rdsProtection, lambdaProtection
      };

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: minimalGuardDutyConfig,
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            protectionsConfiguration: {
              s3Protection: {
                enable: true,
                excludedRegions: [],
              },
            },
            enableKeepMalwareSnapshots: undefined,
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should validate logging configuration', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams();
      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            exportDestination: expect.objectContaining({
              destinationArn: `arn:aws:s3:::${mockLogging.bucketName}/guardduty`,
              kmsKeyArn: mockLogging.bucketKeyArn,
              destinationType: 'S3',
            }),
          }),
        }),
      );
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('configure - deploymentTargets', () => {
    it('should resolve deploymentTargets to account boundary when configured', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                deploymentTargets: {
                  organizationalUnits: ['Root'],
                  excludedRegions: ['eu-west-1'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            boundary: expect.objectContaining({
              accounts: expect.arrayContaining(['111111111111', 'YYYYYYYYYYYY', '333333333333', '444444444444']),
            }),
          }),
        }),
      );
      expect(result.status).toBe('COMPLETED');
    });

    it('should use deploymentTargets.excludedRegions as ignoredRegions when excludeRegions is empty', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                excludeRegions: [],
                deploymentTargets: {
                  organizationalUnits: ['Root'],
                  excludedRegions: ['eu-west-1', 'ap-southeast-1'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            regionFilters: expect.objectContaining({
              ignoredRegions: ['eu-west-1', 'ap-southeast-1'],
            }),
          }),
        }),
      );
    });

    it('should override accounts metadata in extractGuardDutyConfig when deploymentTargets is defined', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          accountsConfig: {
            ...mockAccountsConfig,
            getAccountIdsFromDeploymentTarget: vi
              .fn()
              .mockReturnValue(['111111111111', 'YYYYYYYYYYYY', '333333333333']),
          } as unknown as AccountsConfig,
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                deploymentTargets: {
                  organizationalUnits: ['Security'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      await AmazonGuardDuty.configure(params);

      // The state config should reflect 3 accounts from deployment targets, not the default 4
      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          currentConfig: expect.objectContaining({
            accountsCount: 3,
          }),
        }),
        params,
        'XXXXXXXXXXXX:us-east-1',
      );
    });

    it('should return undefined for boundary.accounts when deploymentTargets resolves to empty array', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      };
      vi.mocked(configureGuardDuty).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          accountsConfig: {
            ...mockAccountsConfig,
            getAccountIdsFromDeploymentTarget: vi.fn().mockReturnValue([]),
          } as unknown as AccountsConfig,
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                deploymentTargets: {
                  organizationalUnits: ['EmptyOU'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            boundary: expect.objectContaining({
              accounts: undefined,
            }),
          }),
        }),
      );
      expect(result.status).toBe('COMPLETED');
    });

    it('should auto-include delegated admin account when deploymentTargets omits it', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });

      const params = createMockModuleParams({
        configs: {
          accountsConfig: {
            ...mockAccountsConfig,
            getAccountIdsFromDeploymentTarget: vi.fn().mockReturnValue(['111111111111', '333333333333']),
          } as unknown as AccountsConfig,
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                deploymentTargets: {
                  organizationalUnits: ['Workloads'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      // Management (111111111111) was present; delegated admin (YYYYYYYYYYYY) is auto-added.
      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            boundary: expect.objectContaining({
              accounts: expect.arrayContaining(['111111111111', '333333333333', 'YYYYYYYYYYYY']),
            }),
          }),
        }),
      );
      const gdCallAccounts1 = vi.mocked(configureGuardDuty).mock.calls[0][0].configuration.boundary!.accounts;
      expect(gdCallAccounts1).toHaveLength(3);
      expect(result.status).toBe('COMPLETED');
    });

    it('should auto-include management account when deploymentTargets omits it', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });

      const params = createMockModuleParams({
        configs: {
          accountsConfig: {
            ...mockAccountsConfig,
            getAccountIdsFromDeploymentTarget: vi.fn().mockReturnValue(['YYYYYYYYYYYY', '333333333333']),
          } as unknown as AccountsConfig,
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                deploymentTargets: {
                  organizationalUnits: ['Security'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      // Delegated admin (YYYYYYYYYYYY) was present; management (111111111111) is auto-added.
      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            boundary: expect.objectContaining({
              accounts: expect.arrayContaining(['YYYYYYYYYYYY', '333333333333', '111111111111']),
            }),
          }),
        }),
      );
      const gdCallAccounts2 = vi.mocked(configureGuardDuty).mock.calls[0][0].configuration.boundary!.accounts;
      expect(gdCallAccounts2).toHaveLength(3);
      expect(result.status).toBe('COMPLETED');
    });

    it('should auto-include both management and delegated admin when deploymentTargets omits both', async () => {
      const { configureGuardDuty } = await import('aws-lza');
      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });

      const params = createMockModuleParams({
        configs: {
          accountsConfig: {
            ...mockAccountsConfig,
            getAccountIdsFromDeploymentTarget: vi.fn().mockReturnValue(['333333333333', '444444444444']),
          } as unknown as AccountsConfig,
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                deploymentTargets: {
                  organizationalUnits: ['Workloads'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      // Neither privileged account was present; management and delegated admin are auto-added.
      expect(configureGuardDuty).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            boundary: expect.objectContaining({
              accounts: expect.arrayContaining(['333333333333', '444444444444', '111111111111', 'YYYYYYYYYYYY']),
            }),
          }),
        }),
      );
      const gdCallAccounts3 = vi.mocked(configureGuardDuty).mock.calls[0][0].configuration.boundary!.accounts;
      expect(gdCallAccounts3).toHaveLength(4);
      expect(result.status).toBe('COMPLETED');
    });

    it('should warn (not just info) when re-adding an explicitly excluded required account', async () => {
      const { configureGuardDuty, createLogger } = await import('aws-lza');
      vi.mocked(configureGuardDuty).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'GuardDuty configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.GUARDDUTY,
        dryRun: false,
      });
      const logger = createLogger(['test']);
      vi.mocked(logger.warn).mockClear();

      const params = createMockModuleParams({
        configs: {
          accountsConfig: {
            ...mockAccountsConfig,
            // Resolved set excludes management (111111111111) because it was explicitly excluded.
            getAccountIdsFromDeploymentTarget: vi.fn().mockReturnValue(['YYYYYYYYYYYY', '333333333333']),
          } as unknown as AccountsConfig,
          securityConfig: {
            centralSecurityServices: {
              guardduty: {
                ...mockGuardDutyConfig,
                deploymentTargets: {
                  accounts: ['Audit'],
                  excludedAccounts: ['Management'],
                },
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonGuardDuty.configure(params);

      expect(result.status).toBe('COMPLETED');
      // Overriding an explicit exclusion must surface as a warning.
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('111111111111'));
    });
  });
});

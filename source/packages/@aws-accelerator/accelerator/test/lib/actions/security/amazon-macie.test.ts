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
import { AmazonMacie } from '../../../../lib/actions/security/amazon-macie';
import { AcceleratorModules, ModuleExecutionPhase, ModuleParams } from '../../../../lib/types';
import { AcceleratorResourcePrefixes } from '../../../../utils/app-utils';

// Mock path module
vi.mock('path', () => ({
  default: {
    parse: vi.fn(function () {
      return { name: 'amazon-macie' };
    }),
    basename: vi.fn(() => 'amazon-macie.ts'),
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
    configureMacie: vi.fn(),
    createLogger: vi.fn(() => mockLogger),
    createStatusLogger: vi.fn(() => mockStatusLogger),
    isMacieAvailableInPartition: vi.fn(() => Promise.resolve(true)),
    DynamoDBFilterOperator: {
      ATTRIBUTE_EXISTS: 'attribute_exists',
      EQUALS: '=',
    },
    MacieClassificationScopeUpdateOperation: {
      ADD: 'ADD',
      REMOVE: 'REMOVE',
      REPLACE: 'REPLACE',
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
  extractSecurityServiceMetadata: vi.fn(function () {
    return {
      delegatedAdminAccountId: 'YYYYYYYYYYYY',
      enabledRegionsCount: 2,
      enabledRegionsHash: 'abc123',
      accountsCount: 4,
      accountsHash: 'def456',
    };
  }),
  loadOrganizationDataSources: vi.fn(() => Promise.resolve(undefined)),
}));

// Mock module-state module
vi.mock('../../../../lib/actions/utils/module-state', () => ({
  hasModuleConfigChanged: vi.fn(() => Promise.resolve(true)),
  saveModuleExecutionState: vi.fn(() => Promise.resolve()),
}));

describe('AmazonMacie', () => {
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

  const mockMacieConfig = {
    enable: true,
    excludeRegions: [],
    disabledRegions: [],
    policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
    publishSensitiveDataFindings: true,
    publishPolicyFindings: true,
    overrideExisting: false,
  };

  const mockModuleItem = {
    name: AcceleratorModules.MACIE,
    description: 'Configure Amazon Macie',
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

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset dynamically-imported mocks to default resolved state (vitest 4.x persists mockRejectedValue through clearAllMocks)
    const { hasModuleConfigChanged, saveModuleExecutionState } = await import(
      '../../../../lib/actions/utils/module-state.js'
    );
    vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);
    vi.mocked(saveModuleExecutionState).mockResolvedValue(undefined);

    mockAccountsConfig = {
      getManagementAccountId: vi.fn().mockReturnValue('111111111111'),
      getAuditAccountId: vi.fn().mockReturnValue('YYYYYYYYYYYY'),
      getAccountId: vi.fn().mockImplementation((accountName: string) => {
        // Return the audit account ID for the delegated admin account
        if (accountName === 'Audit') {
          return 'YYYYYYYYYYYY';
        }
        return '111111111111';
      }),
    } as unknown as AccountsConfig;

    mockGlobalConfig = {
      managementAccountAccessRole: 'AWSAcceleratorExecutionRole',
      enabledRegions: ['us-east-1', 'us-west-2'],
      homeRegion: 'us-east-1',
    } as unknown as GlobalConfig;

    mockSecurityConfig = {
      centralSecurityServices: {
        delegatedAdminAccount: 'Audit',
        macie: mockMacieConfig,
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
      // Distinct from managementAccountAccessRole so tests prove the module forwards the
      // runner-resolved accountAccessRoleName (honoring customDeploymentRole), not globalConfig.
      accountAccessRoleName: 'MyCustomDeploymentRole',
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

      const result = await AmazonMacie.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('stack resources retention module is skipped');
      expect(result.moduleName).toBe(AcceleratorModules.MACIE);
      expect(result.dryRun).toBe(false);
      delete process.env['SKIP_STACK_RESOURCES_RETENTION_MODULE'];
    });

    it('should skip module when Macie is not enabled', async () => {
      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: undefined,
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('Skipping module macie as Macie is not enabled');
      expect(result.moduleName).toBe(AcceleratorModules.MACIE);
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

      await expect(AmazonMacie.configure(params)).rejects.toThrow('Logging bucket name and key arn must be provided.');
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

      await expect(AmazonMacie.configure(params)).rejects.toThrow('Logging bucket name and key arn must be provided.');
    });

    it('should skip module when Macie is not available in the partition', async () => {
      const { isMacieAvailableInPartition } = await import('aws-lza');
      vi.mocked(isMacieAvailableInPartition).mockResolvedValue(false);

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('not available in this partition');
      expect(result.moduleName).toBe(AcceleratorModules.MACIE);
      expect(isMacieAvailableInPartition).toHaveBeenCalledWith(
        {
          region: mockSessionContext.globalRegion,
          solutionId: mockRunnerParameters.solutionId,
          credentials: expect.anything(),
        },
        'XXXXXXXXXXXX:us-east-1',
      );
    });

    it('should proceed when Macie is available in the partition', async () => {
      const { configureMacie, isMacieAvailableInPartition } = await import('aws-lza');
      vi.mocked(isMacieAvailableInPartition).mockResolvedValue(true);
      vi.mocked(configureMacie).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      });

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(result.status).toBe('COMPLETED');
      expect(configureMacie).toHaveBeenCalled();
    });
  });

  describe('configure - state management', () => {
    it('should skip execution when config has not changed', async () => {
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(false);

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(result.status).toBe('SKIPPED');
      expect(result.summary).toContain('configuration has not changed since last execution');
      expect(hasModuleConfigChanged).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: AcceleratorModules.MACIE,
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
      const result = await AmazonMacie.configure(params);

      expect(result.status).toBe('FAILED');
      expect(result.summary).toContain('State management failure');
      expect(result.error).toEqual({
        name: 'StateManagementError',
        message: 'DynamoDB table not found',
      });
    });

    it('should proceed when overrideExisting is true', async () => {
      const { configureMacie } = await import('aws-lza');
      const { hasModuleConfigChanged } = await import('../../../../lib/actions/utils/module-state.js');

      vi.mocked(configureMacie).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      });
      vi.mocked(hasModuleConfigChanged).mockResolvedValue(true);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: {
                ...mockMacieConfig,
                overrideExisting: true,
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

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

  describe('configure - Macie configuration phase', () => {
    it('should configure Macie successfully without DynamoDB data sources', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith({
        invokingAccountId: '111111111111',
        region: mockSessionContext.region,
        partition: mockSessionContext.partition,
        globalRegion: mockSessionContext.globalRegion,
        operation: 'setup',
        moduleName: AcceleratorModules.MACIE,
        solutionId: mockRunnerParameters.solutionId,
        credentials: params.moduleRunnerParameters.managementAccountCredentials,
        dryRun: false,
        configuration: {
          // Must be the runner-resolved accountAccessRoleName (honors customDeploymentRole),
          // not globalConfig.managementAccountAccessRole.
          accountAccessRoleName: 'MyCustomDeploymentRole',
          enable: true,
          delegatedAdminAccountId: 'YYYYYYYYYYYY',
          policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
          publishSensitiveDataFindings: true,
          publishPolicyFindings: true,
          s3Destination: {
            bucketName: mockLogging.bucketName,
            kmsKeyArn: mockLogging.bucketKeyArn,
            keyPrefix: 'macie',
          },
          regionFilters: {
            ignoredRegions: [],
            disabledRegions: [],
          },
          boundary: {
            regions: ['us-east-1', 'us-west-2'],
          },
          dataSources: undefined,
          automatedDiscoveryEnabled: true,
          classificationScopeExclusion: undefined,
        },
      });
      expect(result).toBe(mockResponse);
    });

    it('should configure Macie with DynamoDB data sources', async () => {
      const { configureMacie } = await import('aws-lza');
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
      vi.mocked(configureMacie).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      });

      const params = createMockModuleParams();
      await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            dataSources: mockDataSources,
          }),
        }),
      );
    });
  });

  describe('configure - state save phase', () => {
    it('should save execution state successfully', async () => {
      const { configureMacie } = await import('aws-lza');
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');

      vi.mocked(configureMacie).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      });

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(saveModuleExecutionState).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceName: AcceleratorModules.MACIE,
          config: expect.objectContaining({
            enable: true,
            excludedRegions: [],
            disabledRegions: [],
            policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
            publishSensitiveDataFindings: true,
            publishPolicyFindings: true,
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
      const { configureMacie } = await import('aws-lza');
      const { saveModuleExecutionState } = await import('../../../../lib/actions/utils/module-state.js');

      vi.mocked(configureMacie).mockResolvedValue({
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      });
      vi.mocked(saveModuleExecutionState).mockRejectedValue(new Error('DynamoDB write failed'));

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(result.status).toBe('FAILED');
      expect(result.summary).toContain('Module execution state save failed');
      expect(result.error).toEqual({
        name: 'StateSaveError',
        message: 'DynamoDB write failed',
      });
    });
  });

  describe('configure - error handling and logging', () => {
    it('should handle configureMacie error response', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockErrorResponse = {
        status: MODULE_STATE_CODE.FAILED,
        summary: 'Macie configuration failed',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
        error: {
          name: 'MacieConfigurationError',
          message: 'Failed to configure Macie',
        },
      };
      vi.mocked(configureMacie).mockResolvedValue(mockErrorResponse);

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(result).toBe(mockErrorResponse);
      expect(result.status).toBe('FAILED');
      expect(result.error).toBeDefined();
    });

    it('should log failed environments and regional errors when available', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockErrorResponse = {
        status: MODULE_STATE_CODE.FAILED,
        summary: 'Amazon Macie enable failed in us-west-2',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
        error: {
          name: 'MultipleErrors',
          message: 'Amazon Macie enable failed in us-west-2',
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
      vi.mocked(configureMacie).mockResolvedValue(mockErrorResponse);

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(result).toBe(mockErrorResponse);
      expect(result.status).toBe('FAILED');
      expect(result.response?.failedEnvironments).toHaveLength(1);
      expect(result.response?.environmentErrors).toHaveLength(1);
    });
  });

  describe('configure - configuration options', () => {
    it('should handle dry run mode', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configuration dry run completed',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: true,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        runnerParameters: {
          dryRun: true,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          dryRun: true,
        }),
      );
      expect(result.dryRun).toBe(true);
    });

    it('should handle custom Macie configuration options', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const customMacieConfig = {
        enable: true,
        excludeRegions: ['us-west-1'],
        disabledRegions: ['eu-west-1'],
        policyFindingsPublishingFrequency: 'ONE_HOUR',
        publishSensitiveDataFindings: false,
        publishPolicyFindings: false,
        overrideExisting: false,
      };

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: customMacieConfig,
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            enable: true,
            policyFindingsPublishingFrequency: 'ONE_HOUR',
            publishSensitiveDataFindings: false,
            publishPolicyFindings: false,
            regionFilters: {
              ignoredRegions: ['us-west-1'],
              disabledRegions: ['eu-west-1'],
            },
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should pass batchOperationSettings config when MACIE_OPERATION_TIMEOUT env var is set', async () => {
      process.env['MACIE_OPERATION_TIMEOUT'] = '300000';
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            batchOperationSettings: { operationTimeoutMs: 300000 },
          }),
        }),
      );
      expect(result).toBe(mockResponse);
      delete process.env['MACIE_OPERATION_TIMEOUT'];
    });

    it('should not pass batchOperationSettings config when MACIE_OPERATION_TIMEOUT env var is not set', async () => {
      delete process.env['MACIE_OPERATION_TIMEOUT'];
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const params = createMockModuleParams();
      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            batchOperationSettings: undefined,
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should pass automatedDiscoveryEnabled as true when explicitly set', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: {
                ...mockMacieConfig,
                automatedDiscoveryEnabled: true,
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            automatedDiscoveryEnabled: true,
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should default automatedDiscoveryEnabled to true when undefined', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const macieConfigWithoutDiscovery = {
        enable: true,
        excludeRegions: [],
        disabledRegions: [],
        policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
        publishSensitiveDataFindings: true,
        publishPolicyFindings: true,
        overrideExisting: false,
        // automatedDiscoveryEnabled intentionally omitted
      };

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: macieConfigWithoutDiscovery,
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            automatedDiscoveryEnabled: true,
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should handle missing publishSensitiveDataFindings and publishPolicyFindings with defaults', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const macieConfigWithDefaults = {
        enable: true,
        excludedRegions: [],
        disabledRegions: [],
        policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
        overrideExisting: false,
      };

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: macieConfigWithDefaults,
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            publishSensitiveDataFindings: false,
            publishPolicyFindings: true,
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should pass classificationScopeExclusion with REPLACE when classificationScopeExcludedBuckets has values', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: {
                ...mockMacieConfig,
                automatedDiscoveryEnabled: true,
                classificationScopeExcludedBuckets: [
                  {
                    names: [
                      'aws-controltower-logs-123456789012-us-east-1',
                      'aws-accelerator-logs-123456789012-us-east-1',
                    ],
                    region: 'us-east-1',
                  },
                  { names: ['my-literal-bucket'], region: 'us-west-2' },
                ],
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            automatedDiscoveryEnabled: true,
            classificationScopeExclusion: {
              buckets: [
                { name: 'aws-controltower-logs-123456789012-us-east-1', region: 'us-east-1' },
                { name: 'aws-accelerator-logs-123456789012-us-east-1', region: 'us-east-1' },
                { name: 'my-literal-bucket', region: 'us-west-2' },
              ],
              operation: 'REPLACE',
            },
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });

    it('should set classificationScopeExclusion to undefined when classificationScopeExcludedBuckets is empty', async () => {
      const { configureMacie } = await import('aws-lza');
      const mockResponse = {
        status: MODULE_STATE_CODE.COMPLETED,
        summary: 'Macie configured successfully',
        timestamp: new Date().toISOString(),
        moduleName: AcceleratorModules.MACIE,
        dryRun: false,
      };
      vi.mocked(configureMacie).mockResolvedValue(mockResponse);

      const params = createMockModuleParams({
        configs: {
          securityConfig: {
            centralSecurityServices: {
              macie: {
                ...mockMacieConfig,
                automatedDiscoveryEnabled: true,
                classificationScopeExcludedBuckets: [],
              },
            },
          } as unknown as SecurityConfig,
        },
      });

      const result = await AmazonMacie.configure(params);

      expect(configureMacie).toHaveBeenCalledWith(
        expect.objectContaining({
          configuration: expect.objectContaining({
            automatedDiscoveryEnabled: true,
            classificationScopeExclusion: undefined,
          }),
        }),
      );
      expect(result).toBe(mockResponse);
    });
  });
});

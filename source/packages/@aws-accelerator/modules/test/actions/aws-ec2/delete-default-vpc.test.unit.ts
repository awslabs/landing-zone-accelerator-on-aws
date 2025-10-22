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

import { beforeEach, describe, test, vi, expect, afterEach } from 'vitest';

vi.mock('../../../../accelerator', () => ({
  AcceleratorStage: {
    NETWORK_PREP: 'NETWORK_PREP',
  },
}));

import { AcceleratorModules, ModuleExecutionPhase } from '../../../models/enums';
import { ModuleParams } from '../../../models/types';
import { MOCK_CONSTANTS, mockGlobalConfiguration } from '../../mocked-resources';
import {
  AccountsConfig,
  GlobalConfig,
  OrganizationConfig,
  CustomizationsConfig,
  IamConfig,
  NetworkConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';
import { AcceleratorResourceNames } from '../../../../accelerator/lib/accelerator-resource-names';
import * as awsLza from '../../../../../@aws-lza/index';
import * as commonFunctions from '../../../../../@aws-lza/common/functions';
import { DeleteDefaultVpc } from '../../../lib/actions/aws-ec2/delete-default-vpc';

describe('DeleteDefaultVpc', () => {
  const status = 'mock status';
  let mockOrganizationConfig: Partial<OrganizationConfig>;
  const mockNetworkConfig = {
    defaultVpc: { delete: true, excludeAccounts: [], excludeRegions: [] },
  } as unknown as NetworkConfig;

  const createBaseMockAccountsConfig = () => ({
    getManagementAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount),
    getManagementAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.managementAccount.name),
    getAuditAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount),
    getAuditAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.auditAccount.name),
    getLogArchiveAccount: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount),
    getLogArchiveAccountId: vi.fn().mockReturnValue(MOCK_CONSTANTS.logArchiveAccount.name),
    getAccountId: vi.fn().mockReturnValue('111111111111'),
    getActiveAccountIds: vi.fn().mockReturnValue(['111111111111']),
  });

  beforeEach(() => {
    mockOrganizationConfig = {
      getIgnoredOus: vi.fn().mockReturnValue([]),
    };

    vi.spyOn(awsLza, 'deleteDefaultVpc').mockResolvedValue(status);
    vi.spyOn(commonFunctions, 'getCredentials').mockResolvedValue(MOCK_CONSTANTS.credentials);
    vi.spyOn(commonFunctions, 'processModulePromises').mockResolvedValue();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('should execute delete default VPC for active accounts', async () => {
    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      mandatoryAccounts: [MOCK_CONSTANTS.managementAccount, MOCK_CONSTANTS.auditAccount],
      workloadAccounts: [MOCK_CONSTANTS.logArchiveAccount],
    } as unknown as AccountsConfig;

    const moduleParams: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.DELETE_DEFAULT_VPC,
        description: 'Delete default VPCs in accounts',
        runOrder: 1,
        handler: DeleteDefaultVpc.execute,
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        solutionId: 'test-solution',
        partition: 'aws',
        region: 'us-east-1',
        useExistingRoles: false,
        dryRun: false,
        maxConcurrentExecution: 10,
        configDirPath: '/test/config',
        prefix: 'test',
      },
      moduleRunnerParameters: {
        configs: {
          globalConfig: { ...mockGlobalConfiguration } as GlobalConfig,
          accountsConfig: mockAccountsConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          customizationsConfig: {} as CustomizationsConfig,
          iamConfig: {} as IamConfig,
          networkConfig: mockNetworkConfig,
          replacementsConfig: {} as ReplacementsConfig,
          securityConfig: {} as SecurityConfig,
        },
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
        globalRegion: 'us-east-1',
        resourcePrefixes: {
          accelerator: 'AWSAccelerator',
          bucketName: 'aws-accelerator',
          databaseName: 'aws-accelerator',
          kmsAlias: 'aws-accelerator',
          repoName: 'aws-accelerator',
          secretName: 'aws-accelerator',
          snsTopicName: 'aws-accelerator',
          ssmParamName: 'aws-accelerator',
          importResourcesSsmParamName: 'aws-accelerator',
          trailLogName: 'aws-accelerator',
          ssmLogName: 'aws-accelerator',
        },
        acceleratorResourceNames: {} as AcceleratorResourceNames,
        logging: {
          centralizedRegion: 'us-east-1',
        },
        organizationAccounts: [],
      },
    };

    const result = await DeleteDefaultVpc.execute(moduleParams);

    expect(result).toContain('completed successfully');
    expect(awsLza.deleteDefaultVpc).toHaveBeenCalled();
  });

  test('should skip execution when no active accounts found', async () => {
    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      mandatoryAccounts: [],
      workloadAccounts: [],
    } as unknown as AccountsConfig;

    mockAccountsConfig.getActiveAccountIds = vi.fn().mockReturnValue([]);

    const moduleParams: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.DELETE_DEFAULT_VPC,
        description: 'Delete default VPCs in accounts',
        runOrder: 1,
        handler: DeleteDefaultVpc.execute,
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        solutionId: 'test-solution',
        partition: 'aws',
        region: 'us-east-1',
        useExistingRoles: false,
        dryRun: false,
        maxConcurrentExecution: 10,
        configDirPath: '/test/config',
        prefix: 'test',
      },
      moduleRunnerParameters: {
        configs: {
          globalConfig: { ...mockGlobalConfiguration } as GlobalConfig,
          accountsConfig: mockAccountsConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          customizationsConfig: {} as CustomizationsConfig,
          iamConfig: {} as IamConfig,
          networkConfig: mockNetworkConfig,
          replacementsConfig: {} as ReplacementsConfig,
          securityConfig: {} as SecurityConfig,
        },
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
        globalRegion: 'us-east-1',
        resourcePrefixes: {
          accelerator: 'AWSAccelerator',
          bucketName: 'aws-accelerator',
          databaseName: 'aws-accelerator',
          kmsAlias: 'aws-accelerator',
          repoName: 'aws-accelerator',
          secretName: 'aws-accelerator',
          snsTopicName: 'aws-accelerator',
          ssmParamName: 'aws-accelerator',
          importResourcesSsmParamName: 'aws-accelerator',
          trailLogName: 'aws-accelerator',
          ssmLogName: 'aws-accelerator',
        },
        acceleratorResourceNames: {} as AcceleratorResourceNames,
        logging: {
          centralizedRegion: 'us-east-1',
        },
        organizationAccounts: [],
      },
    };

    const result = await DeleteDefaultVpc.execute(moduleParams);

    expect(result).toContain('no active accounts found');
    expect(awsLza.deleteDefaultVpc).not.toHaveBeenCalled();
  });

  test('should execute delete default VPC for management account without fetching credentials', async () => {
    const managementAccount = { name: 'Management', email: 'mgmt@example.com' };

    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      mandatoryAccounts: [managementAccount],
      workloadAccounts: [],
    } as unknown as AccountsConfig;

    const moduleParams: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.DELETE_DEFAULT_VPC,
        description: 'Delete default VPCs in accounts',
        runOrder: 1,
        handler: DeleteDefaultVpc.execute,
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        solutionId: 'test-solution',
        partition: 'aws',
        region: 'us-east-1',
        useExistingRoles: false,
        dryRun: false,
        maxConcurrentExecution: 10,
        configDirPath: '/test/config',
        prefix: 'test',
      },
      moduleRunnerParameters: {
        configs: {
          globalConfig: { ...mockGlobalConfiguration } as GlobalConfig,
          accountsConfig: mockAccountsConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          customizationsConfig: {} as CustomizationsConfig,
          iamConfig: {} as IamConfig,
          networkConfig: mockNetworkConfig,
          replacementsConfig: {} as ReplacementsConfig,
          securityConfig: {} as SecurityConfig,
        },
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
        globalRegion: 'us-east-1',
        resourcePrefixes: {
          accelerator: 'AWSAccelerator',
          bucketName: 'aws-accelerator',
          databaseName: 'aws-accelerator',
          kmsAlias: 'aws-accelerator',
          repoName: 'aws-accelerator',
          secretName: 'aws-accelerator',
          snsTopicName: 'aws-accelerator',
          ssmParamName: 'aws-accelerator',
          importResourcesSsmParamName: 'aws-accelerator',
          trailLogName: 'aws-accelerator',
          ssmLogName: 'aws-accelerator',
        },
        acceleratorResourceNames: {} as AcceleratorResourceNames,
        logging: {
          centralizedRegion: 'us-east-1',
        },
        organizationAccounts: [],
      },
    };

    const result = await DeleteDefaultVpc.execute(moduleParams);

    expect(result).toContain('completed successfully');
    expect(awsLza.deleteDefaultVpc).toHaveBeenCalled();
    expect(commonFunctions.getCredentials).not.toHaveBeenCalled(); // Management account doesn't fetch credentials
  });

  test('should skip excluded accounts', async () => {
    vi.clearAllMocks();
    vi.spyOn(awsLza, 'deleteDefaultVpc').mockResolvedValue(status);

    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      mandatoryAccounts: [MOCK_CONSTANTS.managementAccount],
      workloadAccounts: [],
    } as unknown as AccountsConfig;

    const mockNetworkConfigWithExclusions = {
      defaultVpc: { delete: true, excludeAccounts: ['management'], excludeRegions: [] },
    } as unknown as NetworkConfig;

    const moduleParams: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.DELETE_DEFAULT_VPC,
        description: 'Delete default VPCs in accounts',
        runOrder: 1,
        handler: DeleteDefaultVpc.execute,
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        solutionId: 'test-solution',
        partition: 'aws',
        region: 'us-east-1',
        useExistingRoles: false,
        dryRun: false,
        maxConcurrentExecution: 10,
        configDirPath: '/test/config',
        prefix: 'test',
      },
      moduleRunnerParameters: {
        configs: {
          globalConfig: { ...mockGlobalConfiguration } as GlobalConfig,
          accountsConfig: mockAccountsConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          customizationsConfig: {} as CustomizationsConfig,
          iamConfig: {} as IamConfig,
          networkConfig: mockNetworkConfigWithExclusions,
          replacementsConfig: {} as ReplacementsConfig,
          securityConfig: {} as SecurityConfig,
        },
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
        globalRegion: 'us-east-1',
        resourcePrefixes: {
          accelerator: 'AWSAccelerator',
          bucketName: 'aws-accelerator',
          databaseName: 'aws-accelerator',
          kmsAlias: 'aws-accelerator',
          repoName: 'aws-accelerator',
          secretName: 'aws-accelerator',
          snsTopicName: 'aws-accelerator',
          ssmParamName: 'aws-accelerator',
          importResourcesSsmParamName: 'aws-accelerator',
          trailLogName: 'aws-accelerator',
          ssmLogName: 'aws-accelerator',
        },
        acceleratorResourceNames: {} as AcceleratorResourceNames,
        logging: {
          centralizedRegion: 'us-east-1',
        },
        organizationAccounts: [],
      },
    };

    const result = await DeleteDefaultVpc.execute(moduleParams);

    expect(result).toContain('completed successfully');
    expect(awsLza.deleteDefaultVpc).not.toHaveBeenCalled();
  });

  test('should skip excluded regions', async () => {
    vi.clearAllMocks();
    vi.spyOn(awsLza, 'deleteDefaultVpc').mockResolvedValue(status);

    const mockAccountsConfig = {
      ...createBaseMockAccountsConfig(),
      mandatoryAccounts: [MOCK_CONSTANTS.managementAccount],
      workloadAccounts: [],
    } as unknown as AccountsConfig;

    const mockNetworkConfigWithExclusions = {
      defaultVpc: { delete: true, excludeAccounts: [], excludeRegions: ['us-east-1'] },
    } as unknown as NetworkConfig;

    const moduleParams: ModuleParams = {
      moduleItem: {
        name: AcceleratorModules.DELETE_DEFAULT_VPC,
        description: 'Delete default VPCs in accounts',
        runOrder: 1,
        handler: DeleteDefaultVpc.execute,
        executionPhase: ModuleExecutionPhase.DEPLOY,
      },
      runnerParameters: {
        solutionId: 'test-solution',
        partition: 'aws',
        region: 'us-east-1',
        useExistingRoles: false,
        dryRun: false,
        maxConcurrentExecution: 10,
        configDirPath: '/test/config',
        prefix: 'test',
      },
      moduleRunnerParameters: {
        configs: {
          globalConfig: { ...mockGlobalConfiguration } as GlobalConfig,
          accountsConfig: mockAccountsConfig,
          organizationConfig: mockOrganizationConfig as OrganizationConfig,
          customizationsConfig: {} as CustomizationsConfig,
          iamConfig: {} as IamConfig,
          networkConfig: mockNetworkConfigWithExclusions,
          replacementsConfig: {} as ReplacementsConfig,
          securityConfig: {} as SecurityConfig,
        },
        managementAccountCredentials: MOCK_CONSTANTS.credentials,
        globalRegion: 'us-east-1',
        resourcePrefixes: {
          accelerator: 'AWSAccelerator',
          bucketName: 'aws-accelerator',
          databaseName: 'aws-accelerator',
          kmsAlias: 'aws-accelerator',
          repoName: 'aws-accelerator',
          secretName: 'aws-accelerator',
          snsTopicName: 'aws-accelerator',
          ssmParamName: 'aws-accelerator',
          importResourcesSsmParamName: 'aws-accelerator',
          trailLogName: 'aws-accelerator',
          ssmLogName: 'aws-accelerator',
        },
        acceleratorResourceNames: {} as AcceleratorResourceNames,
        logging: {
          centralizedRegion: 'us-east-1',
        },
        organizationAccounts: [],
      },
    };

    const result = await DeleteDefaultVpc.execute(moduleParams);

    expect(result).toContain('region us-east-1 is excluded');
    expect(awsLza.deleteDefaultVpc).not.toHaveBeenCalled();
  });
});

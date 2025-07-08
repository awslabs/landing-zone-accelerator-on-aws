import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AcceleratorConfigurationsType, ModuleParams } from '../../../models/types';
import { AcceleratorModules, AcceleratorModuleStages, ModuleExecutionPhase } from '../../../models/enums';
import { CreateStackPolicyModule, MESSAGES } from '../../../lib/actions/aws-cloudformation/create-stack-policy-module';
import * as awsLza from '../../../../../@aws-lza/index';

// Mock the logger to avoid console output during tests
jest.mock('@aws-accelerator/utils', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('CreateStackPolicyModule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(awsLza, 'createStackPolicy').mockResolvedValue('Test text');
  });

  describe('skip on missing value', () => {
    it('missing stackpolicy', async () => {
      const config = { globalConfig: { stackPolicy: undefined } } as unknown as AcceleratorConfigurationsType;
      const params = createTestModuleParams(config, AcceleratorModuleStages.PREPARE);
      const result = await CreateStackPolicyModule.execute(params);
      expect(result).toEqual(MESSAGES.SKIP_NO_POLICY);
      expect(awsLza.createStackPolicy).not.toHaveBeenCalled();
    });
  });

  it('missing stage gets skipped', async () => {
    const config = createTestConfig(true);
    const params = createTestModuleParams(config, undefined);
    await expect(async () => await CreateStackPolicyModule.execute(params)).rejects.toThrow();
    expect(awsLza.createStackPolicy).not.toHaveBeenCalled();
  });

  it('skip prepare', async () => {
    const config = createTestConfig(true);
    const params = createTestModuleParams(config, AcceleratorModuleStages.PREPARE);
    const result = await CreateStackPolicyModule.execute(params);
    expect(result).toEqual(MESSAGES.SKIP_PREPARE);
    expect(awsLza.createStackPolicy).not.toHaveBeenCalled();
  });

  it('skip finalize', async () => {
    const config = createTestConfig(false);
    const params = createTestModuleParams(config, AcceleratorModuleStages.FINALIZE);
    const result = await CreateStackPolicyModule.execute(params);
    expect(result).toEqual(MESSAGES.SKIP_FINALIZE);
    expect(awsLza.createStackPolicy).not.toHaveBeenCalled();
  });

  it('execute stack policy creation in finalize stage', async () => {
    const config = createTestConfig(true);
    const params = createTestModuleParams(config, AcceleratorModuleStages.FINALIZE);
    await CreateStackPolicyModule.execute(params);
    expect(awsLza.createStackPolicy).toHaveBeenCalled();
  });

  it('should handle undefined optional parameters', async () => {
    const config = createTestConfig(true, true);
    const params = createTestModuleParams(config, AcceleratorModuleStages.FINALIZE);
    await CreateStackPolicyModule.execute(params);
    expect(awsLza.createStackPolicy).toHaveBeenCalled();
  });
});

function createTestConfig(enable: boolean, undefinedStackPolicy = false): AcceleratorConfigurationsType {
  return {
    globalConfig: {
      stackPolicy: {
        enable: enable,
        protectedTypes: undefinedStackPolicy ? undefined : ['AWS::IAM::Role'],
      },
      enabledRegions: undefinedStackPolicy ? undefined : ['us-east-1', 'us-west-2'],
      managementAccountAccessRole: 'AWSControlTowerExecution',
    },
    organizationConfig: {
      getIgnoredOus: jest.fn().mockReturnValue(['ou1', 'ou2']),
    },
    accountsConfig: {
      getActiveAccountIds: jest.fn().mockReturnValue(['account1', 'account2']),
      getManagementAccountId: jest.fn().mockReturnValue('managementAccount'),
    },
  } as unknown as AcceleratorConfigurationsType;
}

function createTestModuleParams(configs: AcceleratorConfigurationsType, stage?: AcceleratorModuleStages): ModuleParams {
  const params = {
    moduleItem: {
      name: AcceleratorModules.CREATE_STACK_POLICY,
      description: '',
      runOrder: 1,
      executionPhase: ModuleExecutionPhase.DEPLOY,
    },
    stage: stage,
    moduleRunnerParameters: {
      managementAccountCredentials: { accessKeyId: 'test', secretAccessKey: 'test' },
      globalRegion: 'us-east-1',
      resourcePrefixes: {
        accelerator: 'AWSAccelerator',
      },
      configs: configs,
    },
    runnerParameters: {
      partition: 'test',
      dryRun: false,
      solutionId: 'SO0199',
      useExistingRoles: true,
    },
  } as ModuleParams;

  return params;
}

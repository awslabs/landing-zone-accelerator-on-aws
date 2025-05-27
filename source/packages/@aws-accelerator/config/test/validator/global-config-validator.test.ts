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
/* eslint @typescript-eslint/no-explicit-any: 0 */

import {
  AwsConfig,
  CentralSecurityServicesConfig,
  CloudWatchConfig,
  GuardDutyConfig,
  KeyConfig,
  KeyManagementServiceConfig,
  S3PublicAccessBlockConfig,
  SecurityConfig,
  SecurityHubConfig,
  SsmAutomationConfig,
} from '../../lib/security-config';
import { AccountConfig, AccountsConfig } from '../../lib/accounts-config';
import {
  CloudTrailConfig,
  ControlTowerConfig,
  GlobalConfig,
  LoggingConfig,
  SessionManagerConfig,
  StackPolicyConfig,
} from '../../lib/global-config';
import { OrganizationConfig } from '../../lib/organization-config';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { DeploymentTargets } from '../../lib/common';
import { GlobalConfigValidator } from '../../validator/global-config-validator';
import { IamConfig, RoleSetConfig } from '../../lib/iam-config';

describe('SecurityConfigValidator', () => {
  const mockConfigDir = '/mock/config';
  let mockSecurityConfig: SecurityConfig;
  let mockAccountsConfig: AccountsConfig;
  let globalConfig: GlobalConfig;
  let mockOrganizationConfig: OrganizationConfig;
  let globalConfigValidator: GlobalConfigValidator;
  let mockIamConfig: IamConfig;

  beforeEach(() => {
    jest.spyOn(GlobalConfig.prototype, 'getS3Object' as any).mockReturnValue({});
    jest.spyOn(GlobalConfig.prototype, 'getSnsTopicNames').mockReturnValue([]);

    // Mock configs
    mockSecurityConfig = createSecurityConfig() as SecurityConfig;
    mockAccountsConfig = createAccountsConfig() as AccountsConfig;
    mockOrganizationConfig = createOrganizationConfig() as OrganizationConfig;
    const roleSets: RoleSetConfig[] = [];
    mockIamConfig = {
      roleSets,
    } as IamConfig;
    globalConfig = createGlobalConfig() as GlobalConfig;

    globalConfigValidator = new GlobalConfigValidator(
      globalConfig,
      mockAccountsConfig,
      mockIamConfig,
      mockOrganizationConfig,
      mockSecurityConfig,
      mockConfigDir,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateStackPolicy', () => {
    it('validate disabled does not fail validation', () => {
      const stackPolicy: StackPolicyConfig = {
        enable: false,
        protectedTypes: [],
      };
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;

      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(0);
      expect(result).toBeTruthy();
    });

    it('validate with undefined enabled does not fail validation', () => {
      const stackPolicy = {
        enable: undefined,
        protectedTypes: [],
      } as unknown as StackPolicyConfig;
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;
      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(0);
      expect(result).toBeTruthy();
    });

    it('validate with undefined protectedTypes fails validation', () => {
      const stackPolicy = {
        enable: true,
        protectedTypes: undefined,
      } as unknown as StackPolicyConfig;
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;
      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(1);
      expect(result).toBeFalsy();
    });

    it('validate no protectedTypes fails validation', () => {
      const stackPolicy: StackPolicyConfig = {
        enable: true,
        protectedTypes: [],
      };
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;
      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(1);
      expect(result).toBeFalsy();
    });

    it('validate protectedTypes as not array fails validation', () => {
      const stackPolicy = {
        enable: true,
        protectedTypes: 'notAnArray',
      } as unknown as StackPolicyConfig;
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;
      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(1);
      expect(result).toBeFalsy();
    });

    it('validate protectedTypes with invalid format fail validation', () => {
      const stackPolicy: StackPolicyConfig = {
        enable: true,
        protectedTypes: ['notAvalidServiceName', 'AWS::EC2'],
      };
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;
      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(2);
      expect(result).toBeFalsy();
    });

    it('validate protectedTypes with valid format does not fail validation', () => {
      const stackPolicy: StackPolicyConfig = {
        enable: true,
        protectedTypes: ['AWS::EC2::InternetGateway', 'AWS::EC2::Route'],
      };
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;
      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(0);
      expect(result).toBeTruthy();
    });

    it('validate protectedTypes with valid format does not fail validation', () => {
      const stackPolicy = {
        enable: true,
        protectedTypes: [undefined, 'test'],
      } as unknown as StackPolicyConfig;
      globalConfig = createGlobalConfig(stackPolicy) as GlobalConfig;
      const errors: string[] = [];
      const result = globalConfigValidator.validateStackPolicy(globalConfig, errors);
      expect(errors).toHaveLength(2);
      expect(result).toBeFalsy();
    });
  });
});

function createSecurityConfig(delegatedAdminAccount = 'Audit'): Partial<SecurityConfig> {
  const guardDuty: Partial<GuardDutyConfig> = {
    enable: true,
    excludeRegions: ['us-west-2'],
  };

  const securityHub = {
    enable: true,
    regionAggregation: true,
  } as unknown as SecurityHubConfig;

  const ssmAutomation: Partial<SsmAutomationConfig> = {
    documentSets: [
      {
        shareTargets: {
          organizationalUnits: ['Root'],
          accounts: [],
        },
        documents: [
          {
            name: 'Document1',
            template: 'template1.yaml',
            targetType: undefined,
          },
        ],
      },
    ],
  };

  const centralSecurityServices = {
    delegatedAdminAccount: delegatedAdminAccount,
    ebsDefaultVolumeEncryption: {
      enable: true,
      kmsKey: 'key1',
      excludeRegions: [],
    },
    guardduty: guardDuty as GuardDutyConfig,
    securityHub: securityHub as SecurityHubConfig,
    ssmAutomation: ssmAutomation as SsmAutomationConfig,
    s3PublicAccessBlock: new S3PublicAccessBlockConfig(),
  } as unknown as CentralSecurityServicesConfig;

  const keyConfig = {
    name: 'key1',
    deploymentTargets: new DeploymentTargets(),
  } as unknown as KeyConfig;

  const keyManagementService: Partial<KeyManagementServiceConfig> = {
    keySets: [keyConfig as KeyConfig],
  };

  const cloudWatchConfig: Partial<CloudWatchConfig> = {
    metricSets: [],
    alarmSets: [],
    logGroups: [],
  };

  const awsConfig = {
    enableConfigurationRecorder: true,
    ruleSets: [],
  } as unknown as AwsConfig;

  // Mock configs
  const securityConfig: Partial<SecurityConfig> = {
    centralSecurityServices: centralSecurityServices as CentralSecurityServicesConfig,
    keyManagementService: keyManagementService as KeyManagementServiceConfig,
    cloudWatch: cloudWatchConfig as CloudWatchConfig,
    awsConfig: awsConfig as AwsConfig,
  };

  return securityConfig;
}

function createAccountsConfig(): Partial<AccountsConfig> {
  const accountConfig: Partial<AccountsConfig> = {
    getAuditAccount: jest.fn().mockReturnValue({ name: 'Audit' }),
    getAccountIds: jest.fn().mockReturnValue(['123456789012']),
    mandatoryAccounts: [
      {
        name: 'LogArchive',
      } as AccountConfig,
    ],
    workloadAccounts: [],
  };

  return accountConfig;
}

function createGlobalConfig(stackPolicy: StackPolicyConfig | undefined = undefined): Partial<GlobalConfig> {
  const loggingConig: Partial<LoggingConfig> = {
    cloudtrail: {} as CloudTrailConfig,
    sessionManager: {} as SessionManagerConfig,
    account: 'LogArchive',
  };

  const globalConfig: Partial<GlobalConfig> = {
    controlTower: new ControlTowerConfig(),
    getSnsTopicNames: jest.fn().mockReturnValue([]),
    stackPolicy: stackPolicy,
    logging: loggingConig as LoggingConfig,
  };

  return globalConfig;
}

function createOrganizationConfig(): Partial<OrganizationConfig> {
  const organizationConfig: Partial<OrganizationConfig> = {
    enable: true,
    organizationalUnits: [
      {
        name: 'Security',
        ignore: undefined,
      },
      {
        name: 'Infrastructure',
        ignore: undefined,
      },
    ],
  };
  return organizationConfig;
}

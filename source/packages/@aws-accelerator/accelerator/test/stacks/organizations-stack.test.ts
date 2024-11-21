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

import {
  AccountsConfig,
  ControlTowerConfig,
  CustomizationsConfig,
  GlobalConfig,
  GroupSetConfig,
  IamConfig,
  LoggingConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
  UserSetConfig,
} from '@aws-accelerator/config';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { Capture, Template } from 'aws-cdk-lib/assertions';
import { OrganizationsStack, OrganizationsStackProps } from '../../lib/stacks/organizations-stack';
import { AcceleratorResourcePrefixes } from '../../utils/app-utils';
import { IKey } from 'aws-cdk-lib/aws-kms';

let app: cdk.App;
let organizationsStackDefault: OrganizationsStack;
let organizationsStackCT: OrganizationsStack;

beforeEach(() => {
  jest.spyOn(OrganizationsStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  jest.spyOn(OrganizationsStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');
  jest.spyOn(OrganizationsStack.prototype, 'getAcceleratorKey').mockReturnValue({} as IKey);
  jest.spyOn(OrganizationsStack.prototype, 'isIncluded').mockImplementation(() => true);

  app = new cdk.App();
  organizationsStackDefault = new OrganizationsStack(app, 'unit-test-Organizations-stack', createProps('us-east-1'));
  organizationsStackCT = createStackWithControlTower();
});

afterEach(() => {
  jest.resetAllMocks();
});

describe('OrganizationsStack cdk assert tests', () => {
  test('Default stack has no AWS Control Tower Enabled Controls', () => {
    const template = Template.fromStack(organizationsStackDefault);
    template.resourceCountIs('AWS::ControlTower::EnabledControl', 0);
  });

  test('Stack contains 6 Control Tower enabled controls', () => {
    const template = Template.fromStack(organizationsStackCT);
    template.resourceCountIs('AWS::ControlTower::EnabledControl', 6);
  });

  test('Stack contains 5 dependsOn properties for AWS::ControlTower::EnabledControl', () => {
    const template = Template.fromStack(organizationsStackCT);
    const dependsOnCapture = new Capture();
    template.findResources('AWS::ControlTower::EnabledControl', {
      DependsOn: dependsOnCapture,
    });
    let dependsOnCount = 0;
    do {
      dependsOnCount++;
    } while (dependsOnCapture.next());
    expect(dependsOnCount).toBe(5);
  });
});

function createProps(homeRegion: string, controlTowerConfig?: ControlTowerConfig): OrganizationsStackProps {
  const mockOrganizationConfig = {
    getOrganizationId: jest.fn().mockImplementation(() => '1234567890'),
    getOrganizationalUnitArn: jest
      .fn()
      .mockImplementation(ouName => `arn:aws:organizations::123456789012:ou/o-a1b2c3d4e5/${ouName}`),
    enable: true,
    backupPolicies: [],
    taggingPolicies: [],
  } as unknown as OrganizationConfig;
  const mockAccountsConfig = {
    getAccountId: jest.fn().mockImplementation(() => '100000'),
    getAccountIds: jest.fn().mockImplementation(() => ['100000']),
    getManagementAccountId: jest.fn().mockImplementation(() => '200000'),
    getLogArchiveAccountId: jest.fn().mockImplementation(() => '300000'),
    mandatoryAccounts: [],
    workloadAccounts: [],
  } as unknown as AccountsConfig;
  const mockLoggingConfig = {
    cloudwatchLogs: undefined,
    sessionManager: {
      sendToCloudWatchLogs: false,
      sendToS3: false,
    },
    cloudtrail: {
      enable: false,
    },
  } as LoggingConfig;
  const mockNetworkConfig = {
    vpcs: [],
  } as unknown as NetworkConfig;

  const props: OrganizationsStackProps = {
    accountsConfig: mockAccountsConfig,
    configDirPath: '../configs',
    globalConfig: {
      logging: mockLoggingConfig,
      homeRegion: homeRegion,
      controlTower: controlTowerConfig ?? new ControlTowerConfig(),
    } as GlobalConfig,
    iamConfig: {
      userSets: [new UserSetConfig()],
      groupSets: [new GroupSetConfig()],
    } as IamConfig,
    networkConfig: mockNetworkConfig,
    organizationConfig: mockOrganizationConfig,
    securityConfig: {
      centralSecurityServices: {
        delegatedAdminAccount: 'account1',
        auditManager: {},
        detective: {},
        macie: {
          enable: false,
        },
        guardduty: {
          enable: false,
        },
        securityHub: {
          enable: false,
        },
      },
      accessAnalyzer: {
        enable: false,
      },
      awsConfig: {
        aggregation: {
          enable: false,
        },
      },
    } as unknown as SecurityConfig,
    customizationsConfig: {} as CustomizationsConfig,
    replacementsConfig: {} as ReplacementsConfig,
    partition: 'unit-test',
    configRepositoryName: 'unit-test',
    configRepositoryLocation: 's3',
    globalRegion: 'us-east-1',
    centralizedLoggingRegion: 'us-east-1',
    prefixes: {} as AcceleratorResourcePrefixes,
    enableSingleAccountMode: true,
    useExistingRoles: false,
    isDiagnosticsPackEnabled: 'false',
    pipelineAccountId: '1234567890',
    env: {
      region: 'us-east-1',
      account: '100000',
    },
  };

  return props;
}

function createStackWithControlTower() {
  const controlTowerConfig: ControlTowerConfig = {
    enable: true,
    landingZone: undefined,
    controls: [
      {
        deploymentTargets: {
          organizationalUnits: ['OU1', 'OU2'],
          accounts: [],

          excludedRegions: [],
          excludedAccounts: [],
        },
        identifier: 'AWS-GR_1',
        enable: true,
        regions: [],
      },
      {
        deploymentTargets: {
          organizationalUnits: ['OU1', 'OU2'],
          accounts: [],

          excludedRegions: [],
          excludedAccounts: [],
        },
        identifier: 'AWS-GR_2',
        enable: true,
        regions: [],
      },
      {
        deploymentTargets: {
          organizationalUnits: ['OU1', 'OU2'],
          accounts: [],

          excludedRegions: [],
          excludedAccounts: [],
        },
        identifier: 'AWS-GR_3',
        enable: true,
        regions: [],
      },
      {
        deploymentTargets: {
          organizationalUnits: ['OU1'],
          accounts: [],

          excludedRegions: [],
          excludedAccounts: [],
        },
        identifier: 'AWS-GR_5',
        enable: false,
        regions: [],
      },
    ],
  };

  return new OrganizationsStack(app, 'unit-test-Organizations-stack-CT', createProps('us-east-1', controlTowerConfig));
}

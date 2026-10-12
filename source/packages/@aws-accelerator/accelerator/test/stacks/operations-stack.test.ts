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
  CloudWatchLogsConfig,
  GlobalConfig,
  GroupConfig,
  GroupSetConfig,
  LoggingConfig,
  ServiceQuotaLimitsConfig,
  UserConfig,
  UserSetConfig,
} from '@aws-accelerator/config';
import { beforeEach, describe, expect, vi, test } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { OperationsStack, OperationsStackProps } from '../../lib/stacks/operations-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

let app: cdk.App;
let operationsStack: OperationsStack;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(OperationsStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  vi.spyOn(OperationsStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');
  vi.spyOn(OperationsStack.prototype, 'getAcceleratorKey').mockImplementation(() => undefined);
  vi.spyOn(OperationsStack.prototype, 'isIncluded').mockImplementation(() => true);

  app = new cdk.App();
  const props = createAcceleratorStackProps();
  operationsStack = new OperationsStack(app, 'unit-test-operations-stack', props as OperationsStackProps);
});

describe('OperationsStack unit tests', () => {
  describe('isHomeRegion', () => {
    test('homeRegion equals stack region', () => {
      const result = operationsStack['isHomeRegion']('us-east-1');
      expect(result).toBeTruthy();
    });

    test('homeRegion differs from stack region', () => {
      const result = operationsStack['isHomeRegion']('eu-central-1');
      expect(result).toBeFalsy();
    });
  });

  describe('addUsers', () => {
    test('addUsers with no userSets creates nothing', () => {
      operationsStack['addUsers']();
      const result = Object.keys(operationsStack['users']);
      expect(result).toHaveLength(0);
    });

    test('addUsers adds a user', () => {
      const stack = createStackWithUsers('test-user', 'test-group', 'us-east-1', false);
      const result = Object.keys(stack['users']);
      expect(result).toHaveLength(1);
    });
  });
});

describe('OperationsStack cdk assert tests', () => {
  test('default stack has no users', () => {
    const template = Template.fromStack(operationsStack);
    template.resourceCountIs('AWS::IAM::User', 0);
    template.resourceCountIs('AWS::SecretsManager::Secret', 0);
  });

  test('user stack has one user', () => {
    const stack = createStackWithUsers('test-user', 'test-group', 'us-east-1', false);
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::IAM::User', 1);
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
  });

  test('user with undefined console access defaults to access', () => {
    const stack = createStackWithUsers('test-user', 'test-group', 'us-east-1', undefined);
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::IAM::User', 1);
    template.resourceCountIs('AWS::SecretsManager::Secret', 1);
    template.hasResourceProperties(
      'AWS::IAM::User',
      Match.objectLike({
        LoginProfile: {
          PasswordResetRequired: true,
          Password: Match.anyValue(),
        },
      }),
    );
  });

  test('user with undefined console access does not require password reset', () => {
    const stack = createStackWithUsers('test-user', 'test-group', 'us-east-1', undefined);
    const template = Template.fromStack(stack);
    template.hasResourceProperties(
      'AWS::IAM::User',
      Match.objectLike({
        LoginProfile: {
          PasswordResetRequired: true,
          Password: Match.anyValue(),
        },
      }),
    );
  });

  test('user without console access has no password', () => {
    const stack = createStackWithUsers('test-user', 'test-group', 'us-east-1', true);
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::IAM::User', 1);
    template.resourceCountIs('AWS::SecretsManager::Secret', 0);
    template.hasResourceProperties(
      'AWS::IAM::User',
      Match.objectLike({
        LoginProfile: Match.absent(),
      }),
    );
  });

  test('user name matches', () => {
    const userName = 'test-user-1234';
    const stack = createStackWithUsers(userName, 'test-group', 'us-east-1', false);
    const template = Template.fromStack(stack);
    template.hasResourceProperties(
      'AWS::IAM::User',
      Match.objectLike({
        UserName: userName,
      }),
    );
  });
});

describe('OperationsStack service quota limits tests', () => {
  const serviceQuotaResource = 'Custom::ServiceQuotaLimits';

  test('global service limit without regions is created in the global region', () => {
    const stack = createStackWithLimits([buildLimit('iam')], { homeRegion: 'us-east-1', globalRegion: 'us-east-1' });
    const template = Template.fromStack(stack);
    template.resourceCountIs(serviceQuotaResource, 1);
  });

  test('global service limit without regions is NOT created in a non-global home region', () => {
    // Regression test: home region (eu-west-1) differs from global region (us-east-1).
    // A global service like iam with no regions must not be requested outside the global
    // region, otherwise AWS returns NoSuchResourceException.
    const stack = createStackWithLimits([buildLimit('iam')], { homeRegion: 'eu-west-1', globalRegion: 'us-east-1' });
    const template = Template.fromStack(stack);
    template.resourceCountIs(serviceQuotaResource, 0);
  });

  test('non-global service limit without regions is created in the home region', () => {
    const stack = createStackWithLimits([buildLimit('lambda')], { homeRegion: 'us-east-1', globalRegion: 'us-east-1' });
    const template = Template.fromStack(stack);
    template.resourceCountIs(serviceQuotaResource, 1);
  });
});

describe('OperationsStack Service Catalog propagation role partition gating', () => {
  const findServiceCatalogPropagationRoles = (template: Template) =>
    template.findResources('AWS::IAM::Role', {
      Properties: {
        Policies: Match.arrayWith([
          Match.objectLike({
            PolicyDocument: {
              Statement: Match.arrayWith([
                Match.objectLike({ Action: Match.arrayWith(['servicecatalog:AcceptPortfolioShare']) }),
              ]),
            },
          }),
        ]),
      },
    });

  test.each([
    ['aws', 'us-east-1', 1],
    ['aws-eusc', 'eusc-de-east-1', 0],
  ])(
    'creates %s partition (home region %s) Service Catalog propagation role count %i',
    (partition, homeRegion, expectedCount) => {
      // Deploy in the partition's own home region so the home-region branch runs and only the partition gate decides
      const baseProps = createAcceleratorStackProps();
      const props = createAcceleratorStackProps({
        partition,
        globalRegion: homeRegion,
        env: { region: homeRegion, account: '00000001' },
        globalConfig: { ...baseProps.globalConfig, homeRegion } as GlobalConfig,
      } as AcceleratorStackProps);
      const stack = new OperationsStack(
        app,
        `unit-test-operations-stack-service-catalog-${partition}`,
        props as OperationsStackProps,
      );

      expect(Object.keys(findServiceCatalogPropagationRoles(Template.fromStack(stack)))).toHaveLength(expectedCount);
    },
  );
});

function buildLimit(serviceCode: string): ServiceQuotaLimitsConfig {
  return {
    serviceCode,
    quotaCode: 'L-TEST0001',
    desiredValue: 100,
    deploymentTargets: { accounts: [], organizationalUnits: [], excludedRegions: [], excludedAccounts: [] },
  } as unknown as ServiceQuotaLimitsConfig;
}

function createStackWithLimits(
  limits: ServiceQuotaLimitsConfig[],
  options: { homeRegion: string; globalRegion: string },
) {
  const overrideProps = {
    globalRegion: options.globalRegion,
    // Deploy the stack in the home region so the home-region fallback branch is exercised.
    env: {
      region: options.homeRegion,
      account: '00000001',
    },
    globalConfig: {
      homeRegion: options.homeRegion,
      limits,
      logging: {
        cloudwatchLogs: {} as CloudWatchLogsConfig,
        sessionManager: {
          sendToCloudWatchLogs: false,
          sendToS3: false,
        },
        cloudtrail: {
          enable: false,
        },
      } as LoggingConfig,
    } as GlobalConfig,
  } as AcceleratorStackProps;
  const props = createAcceleratorStackProps(overrideProps);

  return new OperationsStack(app, 'unit-test-operations-stack-with-limits', props as OperationsStackProps);
}

function createStackWithUsers(
  userName: string,
  userGroup: string,
  homeRegion: string,
  disableConsoleAccess: boolean | undefined,
) {
  const group = { name: userGroup } as GroupConfig;
  const deploymentTargets = {
    accounts: ['100000'],
  };
  const groupSetConfig = {
    groups: [group],
    deploymentTargets: deploymentTargets,
  } as GroupSetConfig;
  const user = { username: userName, group: group.name, disableConsoleAccess: disableConsoleAccess } as UserConfig;
  const userConfig = {
    users: [user],
    deploymentTargets: deploymentTargets,
  } as UserSetConfig;

  const overrideProps = {
    globalConfig: {
      homeRegion: homeRegion,
      logging: {
        cloudwatchLogs: {} as CloudWatchLogsConfig,
        sessionManager: {
          sendToCloudWatchLogs: false,
          sendToS3: false,
        },
        cloudtrail: {
          enable: false,
        },
      } as LoggingConfig,
    } as GlobalConfig,
    iamConfig: {
      userSets: [userConfig],
      groupSets: [groupSetConfig],
    },
  } as AcceleratorStackProps;
  const props = createAcceleratorStackProps(overrideProps);

  const operationsStack = new OperationsStack(
    app,
    'unit-test-operations-stack-with-user',
    props as OperationsStackProps,
  );
  return operationsStack;
}

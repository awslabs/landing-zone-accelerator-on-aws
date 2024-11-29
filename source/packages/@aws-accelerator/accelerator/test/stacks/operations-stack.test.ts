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
  UserConfig,
  UserSetConfig,
} from '@aws-accelerator/config';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { OperationsStack, OperationsStackProps } from '../../lib/stacks/operations-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

let app: cdk.App;
let operationsStack: OperationsStack;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(OperationsStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  jest.spyOn(OperationsStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');
  jest.spyOn(OperationsStack.prototype, 'getAcceleratorKey').mockImplementation(() => undefined);
  jest.spyOn(OperationsStack.prototype, 'isIncluded').mockImplementation(() => true);

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

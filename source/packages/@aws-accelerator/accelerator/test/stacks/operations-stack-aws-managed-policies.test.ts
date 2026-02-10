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
  RoleConfig,
  RoleSetConfig,
} from '@aws-accelerator/config';
import { beforeEach, describe, vi, test } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { OperationsStack, OperationsStackProps } from '../../lib/stacks/operations-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

let app: cdk.App;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(OperationsStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  vi.spyOn(OperationsStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');
  vi.spyOn(OperationsStack.prototype, 'getAcceleratorKey').mockImplementation(() => undefined);
  vi.spyOn(OperationsStack.prototype, 'isIncluded').mockImplementation(() => true);
  app = new cdk.App();
});

describe('OperationsStack AWS Managed Policy Support', () => {
  describe('IAM Groups with AWS Managed Policies', () => {
    test('should support policy name format', () => {
      const stack = createStackWithGroup('test-group', ['SecurityAudit', 'ReadOnlyAccess']);
      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::IAM::Group', 1);
      template.hasResourceProperties('AWS::IAM::Group', {
        GroupName: 'test-group',
        ManagedPolicyArns: [
          {
            'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::aws:policy/SecurityAudit']],
          },
          {
            'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::aws:policy/ReadOnlyAccess']],
          },
        ],
      });
    });

    test('should support full ARN format', () => {
      const stack = createStackWithGroup('test-group', [
        'arn:aws:iam::aws:policy/SecurityAudit',
        'arn:aws:iam::aws:policy/ReadOnlyAccess',
      ]);
      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::IAM::Group', 1);
      template.hasResourceProperties('AWS::IAM::Group', {
        GroupName: 'test-group',
        ManagedPolicyArns: ['arn:aws:iam::aws:policy/SecurityAudit', 'arn:aws:iam::aws:policy/ReadOnlyAccess'],
      });
    });

    test('should support mixed format (names and ARNs)', () => {
      const stack = createStackWithGroup('test-group', ['SecurityAudit', 'arn:aws:iam::aws:policy/ReadOnlyAccess']);
      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::IAM::Group', 1);
      template.hasResourceProperties('AWS::IAM::Group', {
        GroupName: 'test-group',
      });
    });

    test('should support GovCloud partition ARNs', () => {
      const stack = createStackWithGroup('test-group', ['arn:aws-us-gov:iam::aws:policy/SecurityAudit']);
      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::IAM::Group', 1);
      template.hasResourceProperties('AWS::IAM::Group', {
        GroupName: 'test-group',
        ManagedPolicyArns: ['arn:aws-us-gov:iam::aws:policy/SecurityAudit'],
      });
    });

    test('should handle empty AWS managed policies', () => {
      const stack = createStackWithGroup('test-group', []);
      const template = Template.fromStack(stack);

      template.resourceCountIs('AWS::IAM::Group', 1);
      template.hasResourceProperties('AWS::IAM::Group', {
        GroupName: 'test-group',
      });
    });
  });

  describe('IAM Roles with AWS Managed Policies', () => {
    test('should support policy name format', () => {
      const stack = createStackWithRole('test-role', ['SecurityAudit', 'ReadOnlyAccess']);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-role',
        ManagedPolicyArns: [
          {
            'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::aws:policy/SecurityAudit']],
          },
          {
            'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::aws:policy/ReadOnlyAccess']],
          },
        ],
      });
    });

    test('should support full ARN format', () => {
      const stack = createStackWithRole('test-role', [
        'arn:aws:iam::aws:policy/SecurityAudit',
        'arn:aws:iam::aws:policy/ReadOnlyAccess',
      ]);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-role',
        ManagedPolicyArns: ['arn:aws:iam::aws:policy/SecurityAudit', 'arn:aws:iam::aws:policy/ReadOnlyAccess'],
      });
    });

    test('should support mixed format (names and ARNs)', () => {
      const stack = createStackWithRole('test-role', ['SecurityAudit', 'arn:aws:iam::aws:policy/ReadOnlyAccess']);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-role',
      });
    });

    test('should support China partition ARNs', () => {
      const stack = createStackWithRole('test-role', ['arn:aws-cn:iam::aws:policy/SecurityAudit']);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-role',
        ManagedPolicyArns: ['arn:aws-cn:iam::aws:policy/SecurityAudit'],
      });
    });

    test('should handle empty AWS managed policies', () => {
      const stack = createStackWithRole('test-role', []);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::IAM::Role', {
        RoleName: 'test-role',
      });
    });
  });
});

function createStackWithGroup(groupName: string, awsManagedPolicies: string[]) {
  const group = {
    name: groupName,
    policies: {
      awsManaged: awsManagedPolicies,
    },
  } as GroupConfig;

  const deploymentTargets = {
    accounts: ['100000'],
  };

  const groupSetConfig = {
    groups: [group],
    deploymentTargets: deploymentTargets,
  } as GroupSetConfig;

  const overrideProps = {
    globalConfig: {
      homeRegion: 'us-east-1',
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
      groupSets: [groupSetConfig],
    },
  } as AcceleratorStackProps;

  const props = createAcceleratorStackProps(overrideProps);
  return new OperationsStack(app, `test-stack-group-${groupName}`, props as OperationsStackProps);
}

function createStackWithRole(roleName: string, awsManagedPolicies: string[]) {
  const role = {
    name: roleName,
    assumedBy: [
      {
        type: 'service',
        principal: 'ec2.amazonaws.com',
      },
    ],
    policies: {
      awsManaged: awsManagedPolicies,
    },
  } as RoleConfig;

  const deploymentTargets = {
    accounts: ['100000'],
  };

  const roleSetConfig = {
    roles: [role],
    deploymentTargets: deploymentTargets,
  } as RoleSetConfig;

  const overrideProps = {
    globalConfig: {
      homeRegion: 'us-east-1',
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
      roleSets: [roleSetConfig],
    },
  } as AcceleratorStackProps;

  const props = createAcceleratorStackProps(overrideProps);
  return new OperationsStack(app, `test-stack-role-${roleName}`, props as OperationsStackProps);
}

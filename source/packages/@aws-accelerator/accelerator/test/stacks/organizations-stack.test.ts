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
  ControlTowerConfig,
  GlobalConfig,
  IamConfig,
  IdentityCenterConfig,
  IdentityCenterPermissionSetConfig,
  LoggingConfig,
  OrganizationConfig,
} from '@aws-accelerator/config';
import { beforeEach, describe, expect, vi, test } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Capture, Match, Template } from 'aws-cdk-lib/assertions';
import { IKey } from 'aws-cdk-lib/aws-kms';
import path from 'node:path';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { OrganizationsStack } from '../../lib/stacks/organizations-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';
import { AcceleratorKeyType } from '../../lib/stacks/accelerator-stack';

let app: cdk.App;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(OrganizationsStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  vi.spyOn(OrganizationsStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');
  vi.spyOn(OrganizationsStack.prototype, 'getAcceleratorKey').mockImplementation(keyType => {
    if (keyType === AcceleratorKeyType.CLOUDWATCH_KEY) {
      return undefined; // This simulates the case where CloudWatch encryption is disabled
    }
    return { keyArn: 'arn:aws:kms:us-east-1:123456789012:key/test-key-id' } as IKey;
  });
  vi.spyOn(OrganizationsStack.prototype, 'isIncluded').mockImplementation(() => true);

  app = new cdk.App();
});

describe('OrganizationsStack cdk assert tests', () => {
  test('Default stack has no AWS Control Tower Enabled Controls', () => {
    const props = createAcceleratorStackProps();
    const organizationsStackDefault = new OrganizationsStack(app, 'unit-test-Organizations-stack', props);
    const template = Template.fromStack(organizationsStackDefault);
    template.resourceCountIs('AWS::ControlTower::EnabledControl', 0);
  });

  test('Stack contains 6 Control Tower enabled controls', () => {
    const organizationsStackCT = createStackWithControlTower();
    const template = Template.fromStack(organizationsStackCT);
    template.resourceCountIs('AWS::ControlTower::EnabledControl', 6);
  });

  test('Stack contains 5 dependsOn properties for AWS::ControlTower::EnabledControl', () => {
    const organizationsStackCT = createStackWithControlTower();
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

  test('Account-only backup policy creates no policy attachment custom resources', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createAcceleratorStackProps({
      ...baseProps,
      configDirPath: path.join(__dirname, '../configs/all-enabled'),
      organizationConfig: {
        ...baseProps.organizationConfig,
        backupPolicies: [
          {
            name: 'AccountOnlyBackupPolicy',
            description: 'Account-only backup policy',
            policy: 'backup-policies/org-backup-policies.json',
            deploymentTargets: {
              accounts: ['Management'],
              excludedAccounts: [],
            },
          },
        ],
      } as OrganizationConfig,
    });

    const stack = new OrganizationsStack(app, 'unit-test-account-only-backup-policy', props);
    const template = Template.fromStack(stack);

    template.hasResourceProperties('Custom::CreatePolicy', {
      name: 'AccountOnlyBackupPolicy',
      type: 'BACKUP_POLICY',
    });
    template.resourceCountIs('Custom::AttachPolicy', 0);
  });
});

describe('OrganizationsStack Identity Center delegated admin partition gating', () => {
  // The Identity Center delegated admin custom resource is uniquely identified by the
  // `lzaManagedPermissionSets` property it passes to the enable-organization-admin-account handler.
  const identityCenterAdminResource = {
    lzaManagedPermissionSets: Match.anyValue(),
  };

  // Partitions where IAM Identity Center org delegated admin enablement is supported.
  // aws-eusc (European Sovereign Cloud) launched IAM Identity Center in March 2026.
  test.each(['aws', 'aws-us-gov', 'aws-eusc'])(
    'registers the Identity Center delegated admin in the %s partition',
    partition => {
      const stack = createStackWithIdentityCenter(partition);
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::CloudFormation::CustomResource', identityCenterAdminResource);
    },
  );

  // Partitions where the enablement must remain gated out.
  test.each(['aws-cn'])('does not register the Identity Center delegated admin in the %s partition', partition => {
    const stack = createStackWithIdentityCenter(partition);
    const template = Template.fromStack(stack);

    const identityCenterAdmins = template.findResources('AWS::CloudFormation::CustomResource', {
      Properties: identityCenterAdminResource,
    });
    expect(Object.keys(identityCenterAdmins)).toHaveLength(0);
  });
});

function createStackWithIdentityCenter(partition: string) {
  const identityCenter: IdentityCenterConfig = {
    name: 'IdentityCenter',
    delegatedAdminAccount: 'SharedServices',
    identityCenterPermissionSets: [
      {
        name: 'ps-Admin',
        description: 'Admin access',
        policies: {
          awsManaged: ['AdministratorAccess'],
          customerManaged: undefined,
          acceleratorManaged: undefined,
          inlinePolicy: undefined,
          permissionsBoundary: undefined,
        },
        sessionDuration: undefined,
      } as IdentityCenterPermissionSetConfig,
    ],
    identityCenterAssignments: undefined,
  };

  const baseProps = createAcceleratorStackProps();
  const overrideProps = {
    partition,
    iamConfig: {
      ...baseProps.iamConfig,
      identityCenter,
    } as IamConfig,
  } as AcceleratorStackProps;
  const props = createAcceleratorStackProps(overrideProps);

  return new OrganizationsStack(app, `unit-test-Organizations-stack-idc-${partition}`, props);
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

  const overrideProps = {
    globalConfig: {
      homeRegion: 'us-east-1',
      controlTower: controlTowerConfig,
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

  return new OrganizationsStack(app, 'unit-test-Organizations-stack-CT', props);
}

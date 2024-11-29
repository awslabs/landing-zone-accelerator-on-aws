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

import { CloudWatchLogsConfig, ControlTowerConfig, GlobalConfig, LoggingConfig } from '@aws-accelerator/config';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { Capture, Template } from 'aws-cdk-lib/assertions';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { OrganizationsStack } from '../../lib/stacks/organizations-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

let app: cdk.App;

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(OrganizationsStack.prototype, 'getCentralLogBucketName').mockImplementation(() => 'unitTestLogBucket');
  jest.spyOn(OrganizationsStack.prototype, 'getSsmPath').mockImplementation(() => '/test/ssm-path/');
  jest.spyOn(OrganizationsStack.prototype, 'getAcceleratorKey').mockReturnValue({} as IKey);
  jest.spyOn(OrganizationsStack.prototype, 'isIncluded').mockImplementation(() => true);

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
});

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

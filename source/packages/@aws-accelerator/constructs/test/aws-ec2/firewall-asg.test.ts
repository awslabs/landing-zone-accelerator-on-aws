/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from 'aws-cdk-lib';
import {
  AutoScalingConfig,
  EbsItemConfig,
  LaunchTemplateConfig,
  NetworkInterfaceItemConfig,
} from '@aws-accelerator/config';
import { snapShotTest } from '../snapshot-test';
import { FirewallAutoScalingGroup } from '../../lib/aws-ec2/firewall-asg';

const testNamePrefix = 'Construct(FirewallAutoScalingGroup): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const launchTemplate: LaunchTemplateConfig = {
  name: 'test-firewall',
  blockDeviceMappings: [
    {
      deviceName: 'dev/xvda',
      ebs: {
        encrypted: true,
      } as EbsItemConfig,
    },
  ],
  enforceImdsv2: true,
  iamInstanceProfile: undefined,
  imageId: 'ami-123xyz',
  instanceType: 't3.large',
  keyPair: undefined,
  networkInterfaces: [
    {
      deviceIndex: 0,
      groups: ['Test'],
      subnetId: 'subnet-123xyz',
    } as NetworkInterfaceItemConfig,
  ],
  securityGroups: [],
  userData: undefined,
};

const autoscaling: AutoScalingConfig = {
  name: 'TestAsg',
  minSize: 1,
  maxSize: 4,
  desiredSize: 2,
  launchTemplate: 'test-firewall',
  healthCheckGracePeriod: 300,
  healthCheckType: 'ELB',
  subnets: ['subnet-123xyz', 'subnet-456abc'],
  targetGroups: [],
};

new FirewallAutoScalingGroup(stack, 'TestFirewall', {
  name: 'Test',
  autoscaling,
  configDir: './',
  launchTemplate,
  vpc: 'TestVpc',
  lambdaKey: new cdk.aws_kms.Key(stack, 'LambdaKey', {}),
  cloudWatchLogKmsKey: new cdk.aws_kms.Key(stack, 'CloudWatchKey', {}),
  cloudWatchLogRetentionInDays: 3653,
});

/**
 * Firewall ASG construct test
 */
describe('LaunchTemplate', () => {
  snapShotTest(testNamePrefix, stack);
});

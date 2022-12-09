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
import { FirewallInstance } from '../../lib/aws-ec2/firewall-instance';
import { EbsItemConfig, LaunchTemplateConfig, NetworkInterfaceItemConfig } from '@aws-accelerator/config';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(FirewallInstance): ';

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
      associateElasticIp: true,
      groups: ['Test'],
      sourceDestCheck: false,
      subnetId: 'subnet-123xyz',
    } as NetworkInterfaceItemConfig,
  ],
  securityGroups: [],
  userData: undefined,
};

new FirewallInstance(stack, 'TestFirewall', {
  name: 'Test',
  configDir: './',
  launchTemplate,
  vpc: 'TestVpc',
});

/**
 * Firewall instance construct test
 */
describe('LaunchTemplate', () => {
  snapShotTest(testNamePrefix, stack);
});

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
  AutoScalingConfig,
  EbsItemConfig,
  LaunchTemplateConfig,
  NetworkInterfaceItemConfig,
} from '@aws-accelerator/config';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import path from 'path';
import { describe, test, expect } from 'vitest';
import { FirewallAutoScalingGroup } from '../../lib/aws-ec2/firewall-asg';

/**
 * Verifies the firewall ASG construct passes the optional autoScalingGroupName from the
 * AutoScalingConfig through to the underlying AutoScalingGroup construct.
 *
 * See GitLab issue #3088.
 */
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
  userData: 'aws-ec2/launchTemplateFiles/firewallUserData.txt',
};

function buildAutoscaling(autoScalingGroupName?: string): AutoScalingConfig {
  return {
    name: 'TestAsg',
    autoScalingGroupName,
    minSize: 1,
    maxSize: 4,
    desiredSize: 2,
    launchTemplate: 'test-firewall',
    healthCheckGracePeriod: 300,
    healthCheckType: 'ELB',
    subnets: ['subnet-123xyz', 'subnet-456abc'],
    targetGroups: [],
    maxInstanceLifetime: 86400,
  } as AutoScalingConfig;
}

describe('FirewallAutoScalingGroup autoScalingGroupName', () => {
  test('passes autoScalingGroupName to the AutoScalingGroup resource', () => {
    const stack = new cdk.Stack();
    new FirewallAutoScalingGroup(stack, 'TestFirewall', {
      name: 'Test',
      autoscaling: buildAutoscaling('prod-checkpoint-firewall-asg'),
      configBucketName: 'test-bucket',
      configDir: path.dirname(__dirname),
      launchTemplate,
      vpc: 'TestVpc',
      cloudWatchLogRetentionInDays: 3653,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      AutoScalingGroupName: 'prod-checkpoint-firewall-asg',
    });
  });

  test('omits AutoScalingGroupName when not configured', () => {
    const stack = new cdk.Stack();
    new FirewallAutoScalingGroup(stack, 'TestFirewall', {
      name: 'Test',
      autoscaling: buildAutoscaling(),
      configBucketName: 'test-bucket',
      configDir: path.dirname(__dirname),
      launchTemplate,
      vpc: 'TestVpc',
      cloudWatchLogRetentionInDays: 3653,
    });

    const template = Template.fromStack(stack);
    const asgs = template.findResources('AWS::AutoScaling::AutoScalingGroup');
    const asg = Object.values(asgs)[0];
    expect(asg.Properties.AutoScalingGroupName).toBeUndefined();
  });
});

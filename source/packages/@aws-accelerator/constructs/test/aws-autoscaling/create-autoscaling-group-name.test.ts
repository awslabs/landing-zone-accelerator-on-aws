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

import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, test, expect } from 'vitest';
import { AutoscalingGroup } from '../../lib/aws-autoscaling/create-autoscaling-group';

/**
 * Tests for the optional autoScalingGroupName property on the AutoscalingGroup construct.
 *
 * See GitLab issue #3088: the L1 AutoScalingGroupName was previously hard-commented out which
 * forced CloudFormation to generate long, incoherent names. The fix exposes an optional
 * autoScalingGroupName so customers can deliberately opt in to a friendly name while keeping
 * the default CFN-generated name behavior to avoid resource replacement on existing deployments.
 */
describe('AutoscalingGroup autoScalingGroupName', () => {
  test('sets AutoScalingGroupName when autoScalingGroupName prop is provided', () => {
    const stack = new cdk.Stack();
    new AutoscalingGroup(stack, 'Test', {
      autoScalingGroupName: 'my-custom-asg-name',
      minSize: 1,
      maxSize: 4,
      desiredSize: 2,
      launchTemplateId: 'string',
      launchTemplateVersion: 'string',
      healthCheckGracePeriod: 300,
      healthCheckType: 'ELB',
      targetGroups: ['string'],
      subnets: ['string'],
      cloudWatchLogRetentionInDays: 3653,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      AutoScalingGroupName: 'my-custom-asg-name',
    });
  });

  test('does not set AutoScalingGroupName when autoScalingGroupName prop is omitted', () => {
    const stack = new cdk.Stack();
    new AutoscalingGroup(stack, 'Test', {
      minSize: 1,
      maxSize: 4,
      desiredSize: 2,
      launchTemplateId: 'string',
      launchTemplateVersion: 'string',
      healthCheckGracePeriod: 300,
      healthCheckType: 'ELB',
      targetGroups: ['string'],
      subnets: ['string'],
      cloudWatchLogRetentionInDays: 3653,
    });

    const template = Template.fromStack(stack);
    const asgs = template.findResources('AWS::AutoScaling::AutoScalingGroup');
    const asg = Object.values(asgs)[0];
    expect(asg.Properties.AutoScalingGroupName).toBeUndefined();
  });
});

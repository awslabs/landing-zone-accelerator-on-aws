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

import { AcceleratorStage } from '../lib/accelerator-stage';
import { describe, test } from 'vitest';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { snapShotTest } from './snapshot-test';
import { Create, memoize } from './accelerator-test-helpers';

const getStacks = memoize(Create.stacksProvider(AcceleratorStage.CUSTOMIZATIONS));

describe('ApplicationsStack', () => {
  snapShotTest('Construct(ApplicationsStack): ', Create.stackProviderFromStacks(`SharedServices-us-east-1`, getStacks));
});

describe('ApplicationsStack ALB with no targetGroup', () => {
  const getTemplate = () =>
    Template.fromStack(getStacks().stacks.get('App-appAlbNoTargetGroup-us-east-1')! as cdk.Stack);

  test('redirect/fixed-response listeners synthesize without a target group', () => {
    const template = getTemplate();
    // an ALB whose only listeners are redirect/fixed-response defines no target groups,
    // but its listeners must still synthesize (regression: previously dropped to undefined)
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: [
        Match.objectLike({ Type: 'redirect', RedirectConfig: Match.objectLike({ StatusCode: 'HTTP_301' }) }),
      ],
    });
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: [
        Match.objectLike({ Type: 'fixed-response', FixedResponseConfig: Match.objectLike({ StatusCode: '200' }) }),
      ],
    });
  });

  test('listeners with no target group omit TargetGroupArn', () => {
    const template = getTemplate();
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: [Match.objectLike({ TargetGroupArn: Match.absent() })],
    });
  });
});

describe('ApplicationsStack autoScalingGroupName', () => {
  // issue #3088: the application ASG path must pass the optional autoScalingGroupName through to
  // the physical AWS::AutoScaling::AutoScalingGroup name. appA sets it; appB leaves it undefined.
  test('sets AutoScalingGroupName when the application autoscaling config provides one', () => {
    const template = Template.fromStack(getStacks().stacks.get('App-appA-us-east-1')! as cdk.Stack);
    template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      AutoScalingGroupName: 'appA-custom-asg-name',
    });
  });

  test('omits AutoScalingGroupName when the application autoscaling config does not set one', () => {
    const template = Template.fromStack(getStacks().stacks.get('App-appB-us-east-1')! as cdk.Stack);
    template.hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      AutoScalingGroupName: Match.absent(),
    });
  });
});

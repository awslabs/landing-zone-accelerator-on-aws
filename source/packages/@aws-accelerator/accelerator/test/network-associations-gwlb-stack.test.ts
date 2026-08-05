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

import { describe, test } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';

import { AcceleratorStage } from '../lib/accelerator-stage';
import { snapShotTest } from './snapshot-test';
import { Create } from './accelerator-test-helpers';

describe('NetworkAssociationsGwlbStack', () => {
  snapShotTest(
    'Construct(NetworkAssociationsGwlbStack): ',
    Create.stackProvider(`Network-us-east-1`, AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB),
  );
});

describe('NetworkAssociationsGwlbStack firewall autoScalingGroupName', () => {
  // issue #3088: the firewall ASG name flows exclusively through
  // processAutoScalingReplacements, which rebuilds the AutoScalingConfig field by field.
  // The all-enabled test-asg sets autoScalingGroupName; assert it survives that reconstruction
  // and reaches the physical AWS::AutoScaling::AutoScalingGroup name.
  const getTemplate = () =>
    Template.fromStack(
      Create.stack('Network-us-east-1', [
        AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB,
        'aws',
        'us-east-1',
        'all-enabled',
      ])!,
    );

  test('passes the configured autoScalingGroupName through to the firewall ASG', () => {
    getTemplate().hasResourceProperties('AWS::AutoScaling::AutoScalingGroup', {
      AutoScalingGroupName: 'firewall-custom-asg-name',
    });
  });
});

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
import { describe, expect, test } from '@jest/globals';
import { snapShotTest } from './snapshot-test';
import { Create, memoize } from './accelerator-test-helpers';
import { Template } from 'aws-cdk-lib/assertions';

/**
 * NetworkVpcStack construct test
 */
describe('NetworkVpcEndpointsStack', () => {
  const stackProvider = memoize(Create.stackProvider(`Network-us-east-1`, AcceleratorStage.NETWORK_VPC_ENDPOINTS));
  snapShotTest('Construct(NetworkVpcEndpointsStack): ', stackProvider);

  test('should create a firewall with a named policy and another firewall with an arn', () => {
    const stack = stackProvider();
    expect(stack).toBeDefined();
    if (!stack) return;

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::NetworkFirewall::Firewall', {
      FirewallName: 'accelerator-firewall',
      // Policy defined as reference for named policies
      FirewallPolicyArn: {
        Ref: 'SsmParameterValueacceleratornetworknetworkFirewallpoliciesacceleratorpolicyarnC96584B6F00A464EAD1953AFF4B05118Parameter',
      },
    });

    template.hasResourceProperties('AWS::NetworkFirewall::Firewall', {
      FirewallName: 'az-id-firewall',
      // Policy defined as arn, it's used as is.
      FirewallPolicyArn:
        'arn:aws:network-firewall:ap-southeast-2:123456789012:firewall-policy/central-egress-nfw-policy',
    });
  });
});

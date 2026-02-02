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
import { describe, it, expect } from 'vitest';
import { snapShotTest } from './snapshot-test';
import { Create } from './accelerator-test-helpers';
import { Template } from 'aws-cdk-lib/assertions';

describe('NetworkPrepStack', () => {
  snapShotTest(
    'Construct(NetworkPrepStack): ',
    Create.stackProvider(`Network-us-east-1`, AcceleratorStage.NETWORK_PREP),
  );

  it('NetworkLoadBalancerIPAddressLookup role has correct trust policy', () => {
    const stack = Create.stackProvider(`Network-us-east-1`, AcceleratorStage.NETWORK_PREP)();
    expect(stack).toBeDefined();
    if (!stack) return;

    const template = Template.fromStack(stack);
    const role = template.toJSON().Resources.NetworkLoadBalancerIPAddressLookup954D57A8;

    expect(role).toBeDefined();
    expect(role.Type).toBe('AWS::IAM::Role');

    const statements = role.Properties.AssumeRolePolicyDocument.Statement;
    const trustedAccounts = statements.map((s: { Principal: { AWS: { 'Fn::Join': [string, unknown[]] } } }) => {
      const arnParts = s.Principal.AWS['Fn::Join'][1];
      const iamPart = arnParts[2] as string;
      const accountId = iamPart.match(/:iam::(\d{12}):/)?.[1];
      return accountId;
    });

    expect(trustedAccounts).toContain('444444444444');
    expect(trustedAccounts).toContain('555555555555');
  });
});

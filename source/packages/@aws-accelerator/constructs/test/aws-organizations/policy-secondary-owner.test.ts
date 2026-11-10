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

import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, test } from 'vitest';
import { Policy, PolicyType } from '../../lib/aws-organizations/policy';
import { PolicyAttachment } from '../../lib/aws-organizations/policy-attachment';

const SKIP_ENV = 'SKIP_ORGANIZATIONS_POLICY_DELETE';

/**
 * CDK adds AWS_STS_REGIONAL_ENDPOINTS to every custom resource provider that has environment
 * variables. Neither handler calls STS, so the extra variable has no effect.
 */
const SECONDARY_OWNER_VARIABLES = { [SKIP_ENV]: 'true', AWS_STS_REGIONAL_ENDPOINTS: 'regional' };

function addPolicy(stack: Stack, id: string, secondaryOwner?: boolean): Policy {
  return new Policy(stack, id, {
    path: __filename,
    name: id,
    partition: 'aws',
    description: 'Testing Policy construct',
    type: PolicyType.TAG_POLICY,
    acceleratorPrefix: 'AWSAccelerator',
    logRetentionInDays: 3653,
    secondaryOwner,
  });
}

function addAttachment(stack: Stack, id: string, secondaryOwner?: boolean): PolicyAttachment {
  return new PolicyAttachment(stack, id, {
    policyId: 'policyId',
    targetId: 'targetId',
    type: PolicyType.TAG_POLICY,
    configPolicyNames: [],
    acceleratorPrefix: 'AWSAccelerator',
    logRetentionInDays: 3653,
    secondaryOwner,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function onlyResource(stack: Stack, type: string): any {
  const resources = Object.values(Template.fromStack(stack).findResources(type));
  expect(resources).toHaveLength(1);
  return resources[0];
}

describe.each([
  { construct: 'Policy', add: addPolicy, customResourceType: 'Custom::CreatePolicy' },
  { construct: 'PolicyAttachment', add: addAttachment, customResourceType: 'Custom::AttachPolicy' },
])('$construct secondary owner', ({ add, customResourceType }) => {
  test.each([undefined, false])('renders no Lambda environment when secondaryOwner is %s', secondaryOwner => {
    const stack = new Stack();
    add(stack, 'Resource1', secondaryOwner);

    expect(onlyResource(stack, 'AWS::Lambda::Function').Properties.Environment).toBeUndefined();
  });

  test('sets the skip-delete Lambda environment variable when secondaryOwner is true', () => {
    const stack = new Stack();
    add(stack, 'Resource1', true);

    expect(onlyResource(stack, 'AWS::Lambda::Function').Properties.Environment).toStrictEqual({
      Variables: SECONDARY_OWNER_VARIABLES,
    });
  });

  test('does not change the custom resource properties, so no Update event is sent', () => {
    const primaryStack = new Stack();
    add(primaryStack, 'Resource1');
    const secondaryStack = new Stack();
    add(secondaryStack, 'Resource1', true);

    expect(onlyResource(secondaryStack, customResourceType)).toStrictEqual(
      onlyResource(primaryStack, customResourceType),
    );
  });

  test('does not change logical IDs', () => {
    const primaryStack = new Stack();
    add(primaryStack, 'Resource1');
    const secondaryStack = new Stack();
    add(secondaryStack, 'Resource1', true);

    expect(Object.keys(Template.fromStack(secondaryStack).toJSON()['Resources'])).toStrictEqual(
      Object.keys(Template.fromStack(primaryStack).toJSON()['Resources']),
    );
  });

  test('shares one provider when every construct in the stack uses the same setting', () => {
    const stack = new Stack();
    add(stack, 'Resource1', true);
    add(stack, 'Resource2', true);

    expect(onlyResource(stack, 'AWS::Lambda::Function').Properties.Environment).toStrictEqual({
      Variables: SECONDARY_OWNER_VARIABLES,
    });
    Template.fromStack(stack).resourceCountIs(customResourceType, 2);
  });

  test.each([
    { first: true, second: undefined },
    { first: undefined, second: true },
    { first: true, second: false },
  ])('throws when constructs in one stack disagree (first $first, second $second)', ({ first, second }) => {
    const stack = new Stack();
    add(stack, 'Resource1', first);

    expect(() => add(stack, 'Resource2', second)).toThrowError(/secondaryOwner/);
  });
});

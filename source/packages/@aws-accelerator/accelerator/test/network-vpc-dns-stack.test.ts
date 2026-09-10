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
import { describe, expect, test } from 'vitest';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { snapShotTest } from './snapshot-test';
import { Create } from './accelerator-test-helpers';

describe('NetworkVpcDnsStack', () => {
  snapShotTest(
    'Construct(NetworkVpcDnsStack): ',
    Create.stackProvider(`Network-us-east-1`, AcceleratorStage.NETWORK_VPC_DNS),
  );
});

describe('NetworkVpcDnsStack VPC-level resolver rules', () => {
  const acceleratorTestStacks = Create.stacks(AcceleratorStage.NETWORK_VPC_DNS);

  test('synthesizes FORWARD rules declared under vpcRoute53Resolver.endpoints[].rules', () => {
    // Network-Secondary (Network account, home region) declares a VPC-level OUTBOUND
    // resolver endpoint with a forward rule under vpcRoute53Resolver.endpoints[].rules.
    const stack = acceleratorTestStacks.stacks.get('Network-us-east-1')!;
    const template = Template.fromStack(stack);

    // The configured VPC-level forward rule is synthesized and bound to the
    // VPC-level outbound endpoint (not a centralNetworkServices endpoint).
    template.hasResourceProperties(
      'AWS::Route53Resolver::ResolverRule',
      Match.objectLike({
        Name: 'vpc-level-forward-rule',
        DomainName: 'local.example.com',
        RuleType: 'FORWARD',
        TargetIps: [{ Ip: '10.0.0.10' }, { Ip: '10.0.0.11' }],
        ResolverEndpointId: Match.objectLike({
          Ref: Match.stringLikeRegexp('outboundendpointlocal'),
        }),
      }),
    );

    // Exactly one rule targets the VPC-level outbound endpoint. This isolates the
    // new code path from the pre-existing centralNetworkServices rules that also
    // land in this stack, guarding against duplicate emission.
    const rules = template.findResources('AWS::Route53Resolver::ResolverRule');
    const vpcLevelRules = Object.values(rules).filter(r =>
      /outboundendpointlocal/.test(JSON.stringify(r.Properties?.ResolverEndpointId ?? {})),
    );
    expect(vpcLevelRules).toHaveLength(1);
  });

  test('emits exactly the rules configured on VPC-level endpoints (one OUTBOUND rule, none for INBOUND)', () => {
    // Network-Secondary declares one OUTBOUND VPC-level endpoint with a single rule and one
    // INBOUND VPC-level endpoint with no rules. Counting rules bound to EITHER VPC-level
    // endpoint (not just the outbound one) must equal exactly one: this fails if the
    // OUTBOUND filter is dropped and the inbound endpoint ever produced a rule, if a rule
    // were emitted twice, or if the rule were dropped entirely.
    const stack = acceleratorTestStacks.stacks.get('Network-us-east-1')!;
    const template = Template.fromStack(stack);
    const rules = template.findResources('AWS::Route53Resolver::ResolverRule');
    const vpcLevelRules = Object.values(rules).filter(r =>
      /outboundendpointlocal|inboundendpointlocal/.test(JSON.stringify(r.Properties?.ResolverEndpointId ?? {})),
    );
    expect(vpcLevelRules).toHaveLength(1);
  });
});

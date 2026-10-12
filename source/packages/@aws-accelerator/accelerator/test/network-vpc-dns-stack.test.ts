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

describe('NetworkVpcDnsStack central interface endpoint record sets', () => {
  const acceleratorTestStacks = Create.stacks(AcceleratorStage.NETWORK_VPC_DNS);

  const recordNamesInZone = (zoneName: string): string[] => {
    const stack = acceleratorTestStacks.stacks.get('Network-us-east-1')!;
    const records = Template.fromStack(stack).findResources('AWS::Route53::RecordSet');
    return Object.values(records)
      .map(r => r.Properties?.Name as string)
      .filter(name => name === zoneName || name === `*.${zoneName}`)
      .sort();
  };

  const recordNamesByLogicalId = (logicalIdPrefix: string): Record<string, string> => {
    const stack = acceleratorTestStacks.stacks.get('Network-us-east-1')!;
    const records = Template.fromStack(stack).findResources('AWS::Route53::RecordSet');
    return Object.fromEntries(
      Object.entries(records)
        .filter(([id]) => id.startsWith(logicalIdPrefix))
        .map(([id, r]) => [id, r.Properties?.Name as string]),
    );
  };

  test('creates wildcard and apex records for the FIPS variant of a wildcard service (ecr-fips.dkr)', () => {
    // Network-Endpoints is the central endpoint VPC and declares both ecr.dkr and ecr-fips.dkr.
    // Both PrivateDnsNames are wildcards, so with private DNS disabled on central endpoints the
    // FIPS zone needs the same wildcard record as the non-FIPS zone or account-scoped hosts NXDOMAIN.
    expect(recordNamesInZone('dkr.ecr-fips.us-east-1.amazonaws.com.')).toEqual([
      '*.dkr.ecr-fips.us-east-1.amazonaws.com.',
      'dkr.ecr-fips.us-east-1.amazonaws.com.',
    ]);
    expect(recordNamesInZone('dkr.ecr.us-east-1.amazonaws.com.')).toEqual([
      '*.dkr.ecr.us-east-1.amazonaws.com.',
      'dkr.ecr.us-east-1.amazonaws.com.',
    ]);
  });

  test('creates wildcard and apex records for bedrock-agentcore.gateway', () => {
    // AgentCore Gateway's PrivateDnsName is *.gateway.bedrock-agentcore.<region>.amazonaws.com; gateway hosts are
    // <gateway-id>.gateway.bedrock-agentcore..., so without the wildcard record they NXDOMAIN.
    expect(recordNamesInZone('gateway.bedrock-agentcore.us-east-1.amazonaws.com.')).toEqual([
      '*.gateway.bedrock-agentcore.us-east-1.amazonaws.com.',
      'gateway.bedrock-agentcore.us-east-1.amazonaws.com.',
    ]);
  });

  test('keeps the deployed apex record under its existing logical ID for services that became wildcard services', () => {
    // Before ecr-fips.dkr and bedrock-agentcore.gateway were wildcard services, their apex records were deployed
    // under the base ...EpRecordSet ID.
    // Renaming that resource to the wildcard name while creating a new apex resource would race on the same
    // record name during upgrade, so the apex must stay on the existing ID and the wildcard must be new.
    expect(recordNamesByLogicalId('NetworkEndpointsVpcEcrFipsDkrEpRecordSet')).toEqual({
      NetworkEndpointsVpcEcrFipsDkrEpRecordSet79BD22AA: 'dkr.ecr-fips.us-east-1.amazonaws.com.',
      NetworkEndpointsVpcEcrFipsDkrEpRecordSetWildcard2327EE16: '*.dkr.ecr-fips.us-east-1.amazonaws.com.',
    });
    expect(recordNamesByLogicalId('NetworkEndpointsVpcBedrockAgentcoreGatewayEpRecordSet')).toEqual({
      NetworkEndpointsVpcBedrockAgentcoreGatewayEpRecordSetC619D2F3:
        'gateway.bedrock-agentcore.us-east-1.amazonaws.com.',
      NetworkEndpointsVpcBedrockAgentcoreGatewayEpRecordSetWildcard9F1A8173:
        '*.gateway.bedrock-agentcore.us-east-1.amazonaws.com.',
    });
    // Existing wildcard services keep their deployed mapping.
    expect(recordNamesByLogicalId('NetworkEndpointsVpcEcrDkrEpRecordSet')).toEqual({
      NetworkEndpointsVpcEcrDkrEpRecordSet2DE2B6CB: '*.dkr.ecr.us-east-1.amazonaws.com.',
      NetworkEndpointsVpcEcrDkrEpRecordSetNonWildcard056D21B7: 'dkr.ecr.us-east-1.amazonaws.com.',
    });
  });

  test('does not add a wildcard record for a non-wildcard service', () => {
    expect(recordNamesInZone('ssm.us-east-1.amazonaws.com')).toEqual(['ssm.us-east-1.amazonaws.com']);
  });
});

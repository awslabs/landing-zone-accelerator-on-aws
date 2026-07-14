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
import { HostedZone, RecordSet } from '@aws-accelerator/constructs';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, test } from 'vitest';
import { addBatchedRoute53Dependencies } from '../../../lib/stacks/network-stacks/network-vpc-dns-stack/network-vpc-dns-stack';

type TemplateResource = {
  Type: string;
  Properties: {
    Name?: string;
  };
  DependsOn?: string[];
};

describe('Route 53 resource dependencies', () => {
  test('batches hosted zones and record sets in groups of five', () => {
    const stack = new cdk.Stack();
    const hostedZoneA = new HostedZone(stack, 'HostedZoneA', { hostedZoneName: 'a.example.com', vpcId: 'vpc-a' });
    const recordSetA = new RecordSet(stack, 'RecordSetA', {
      type: 'A',
      name: 'a.example.com',
      hostedZone: hostedZoneA,
      dnsName: 'vpce-a.example.com',
      hostedZoneId: 'Z1111111111111',
    });
    const hostedZoneB = new HostedZone(stack, 'HostedZoneB', { hostedZoneName: 'b.example.com', vpcId: 'vpc-b' });
    const recordSetB = new RecordSet(stack, 'RecordSetB', {
      type: 'A',
      name: 'b.example.com',
      hostedZone: hostedZoneB,
      dnsName: 'vpce-b.example.com',
      hostedZoneId: 'Z2222222222222',
    });
    const hostedZoneC = new HostedZone(stack, 'HostedZoneC', { hostedZoneName: 'c.example.com', vpcId: 'vpc-c' });
    const recordSetC = new RecordSet(stack, 'RecordSetC', {
      type: 'A',
      name: 'c.example.com',
      hostedZone: hostedZoneC,
      dnsName: 'vpce-c.example.com',
      hostedZoneId: 'Z3333333333333',
    });

    addBatchedRoute53Dependencies([hostedZoneA, recordSetA, hostedZoneB, recordSetB, hostedZoneC, recordSetC]);

    const resources = Template.fromStack(stack).toJSON().Resources;
    const hostedZoneALogicalId = getHostedZoneLogicalId(resources, 'a.example.com');
    const recordSetALogicalId = getRecordSetLogicalId(resources, 'a.example.com');
    const recordSetCLogicalId = getRecordSetLogicalId(resources, 'c.example.com');

    expect(resources[recordSetALogicalId].DependsOn ?? []).not.toContain(hostedZoneALogicalId);
    expect(resources[recordSetCLogicalId].DependsOn).toContain(hostedZoneALogicalId);
  });
});

function getHostedZoneLogicalId(resources: Record<string, TemplateResource>, name: string): string {
  return getLogicalId(resources, 'AWS::Route53::HostedZone', name);
}

function getRecordSetLogicalId(resources: Record<string, TemplateResource>, name: string): string {
  return getLogicalId(resources, 'AWS::Route53::RecordSet', name);
}

function getLogicalId(resources: Record<string, TemplateResource>, type: string, name: string): string {
  const logicalId = Object.entries(resources).find(
    ([, resource]) => resource.Type === type && resource.Properties.Name === name,
  )?.[0];
  expect(logicalId).toBeDefined();
  return logicalId!;
}

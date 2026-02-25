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
import { IpamPool } from '@aws-accelerator/constructs';

/**
 * These tests verify that IPAM pool sibling dependencies are correctly
 * expressed in the synthesized CloudFormation template via DependsOn.
 *
 * This prevents the "Too many concurrent mutations" error from the IPAM API
 * when CloudFormation tries to create multiple sibling pools in parallel.
 */
describe('IPAM Pool dependency chaining', () => {
  test('sibling base pools should have sequential DependsOn when chained', () => {
    const stack = new cdk.Stack();

    const poolA = new IpamPool(stack, 'PoolA', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'pool-a',
      provisionedCidrs: ['10.0.0.0/8'],
    });

    const poolB = new IpamPool(stack, 'PoolB', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'pool-b',
      provisionedCidrs: ['172.16.0.0/12'],
    });

    const poolC = new IpamPool(stack, 'PoolC', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'pool-c',
      provisionedCidrs: ['192.168.0.0/16'],
    });

    // Chain dependencies: B depends on A, C depends on B
    poolB.node.addDependency(poolA);
    poolC.node.addDependency(poolB);

    const template = Template.fromStack(stack);
    const resources = template.toJSON().Resources;

    // Find the logical IDs for each pool's CfnIPAMPool resource
    const poolALogicalId = findLogicalId(resources, 'pool-a');
    const poolBLogicalId = findLogicalId(resources, 'pool-b');
    const poolCLogicalId = findLogicalId(resources, 'pool-c');

    // Pool A should have no DependsOn (it's the first in the chain)
    const poolAResource = resources[poolALogicalId];
    expect(poolAResource.DependsOn).toBeUndefined();

    // Pool B should depend on Pool A
    const poolBResource = resources[poolBLogicalId];
    expect(poolBResource.DependsOn).toBeDefined();
    expect(poolBResource.DependsOn).toContain(poolALogicalId);

    // Pool C should depend on Pool B
    const poolCResource = resources[poolCLogicalId];
    expect(poolCResource.DependsOn).toBeDefined();
    expect(poolCResource.DependsOn).toContain(poolBLogicalId);
  });

  test('nested pools with same source should have sequential DependsOn when chained', () => {
    const stack = new cdk.Stack();

    // Create a base pool
    const basePool = new IpamPool(stack, 'BasePool', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'base-pool',
      provisionedCidrs: ['10.0.0.0/8'],
    });

    // Create nested sibling pools that all reference the same source
    const nestedA = new IpamPool(stack, 'NestedA', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'nested-a',
      sourceIpamPoolId: basePool.ipamPoolId,
      locale: 'us-east-1',
      provisionedCidrs: ['10.0.0.0/16'],
    });

    const nestedB = new IpamPool(stack, 'NestedB', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'nested-b',
      sourceIpamPoolId: basePool.ipamPoolId,
      locale: 'us-west-2',
      provisionedCidrs: ['10.1.0.0/16'],
    });

    const nestedC = new IpamPool(stack, 'NestedC', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'nested-c',
      sourceIpamPoolId: basePool.ipamPoolId,
      locale: 'eu-west-1',
      provisionedCidrs: ['10.2.0.0/16'],
    });

    // Chain sibling dependencies: B depends on A, C depends on B
    nestedB.node.addDependency(nestedA);
    nestedC.node.addDependency(nestedB);

    const template = Template.fromStack(stack);
    const resources = template.toJSON().Resources;

    findLogicalId(resources, 'base-pool');
    const nestedALogicalId = findLogicalId(resources, 'nested-a');
    const nestedBLogicalId = findLogicalId(resources, 'nested-b');
    const nestedCLogicalId = findLogicalId(resources, 'nested-c');

    // All nested pools should depend on the base pool (implicit via Ref for sourceIpamPoolId)
    const nestedAResource = resources[nestedALogicalId];
    expect(nestedAResource.Properties.SourceIpamPoolId).toBeDefined();

    // Nested B should have explicit DependsOn for Nested A (sibling chain)
    const nestedBResource = resources[nestedBLogicalId];
    expect(nestedBResource.DependsOn).toBeDefined();
    expect(nestedBResource.DependsOn).toContain(nestedALogicalId);

    // Nested C should have explicit DependsOn for Nested B (sibling chain)
    const nestedCResource = resources[nestedCLogicalId];
    expect(nestedCResource.DependsOn).toBeDefined();
    expect(nestedCResource.DependsOn).toContain(nestedBLogicalId);
  });

  test('single pool should not have DependsOn', () => {
    const stack = new cdk.Stack();

    new IpamPool(stack, 'OnlyPool', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'only-pool',
      provisionedCidrs: ['10.0.0.0/8'],
    });

    const template = Template.fromStack(stack);
    const resources = template.toJSON().Resources;
    const logicalId = findLogicalId(resources, 'only-pool');

    expect(resources[logicalId].DependsOn).toBeUndefined();
  });

  test('pools without chaining have no sibling DependsOn', () => {
    const stack = new cdk.Stack();

    new IpamPool(stack, 'PoolX', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'pool-x',
      provisionedCidrs: ['10.0.0.0/8'],
    });

    new IpamPool(stack, 'PoolY', {
      addressFamily: 'ipv4',
      ipamScopeId: 'scope-123',
      name: 'pool-y',
      provisionedCidrs: ['172.16.0.0/12'],
    });

    const template = Template.fromStack(stack);
    const resources = template.toJSON().Resources;

    const poolXLogicalId = findLogicalId(resources, 'pool-x');
    const poolYLogicalId = findLogicalId(resources, 'pool-y');

    // Neither pool should depend on the other
    expect(resources[poolXLogicalId].DependsOn).toBeUndefined();
    expect(resources[poolYLogicalId].DependsOn).toBeUndefined();
  });
});

/**
 * Helper to find the CloudFormation logical ID for an AWS::EC2::IPAMPool
 * resource by matching its Name tag value.
 */
function findLogicalId(resources: Record<string, cdk.CfnResource>, nameTagValue: string): string {
  for (const [logicalId, resource] of Object.entries(resources)) {
    if (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (resource as any).Type === 'AWS::EC2::IPAMPool' &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (resource as any).Properties?.Tags?.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (tag: any) => tag.Key === 'Name' && tag.Value === nameTagValue,
      )
    ) {
      return logicalId;
    }
  }
  throw new Error(`Could not find IPAMPool resource with Name tag "${nameTagValue}"`);
}

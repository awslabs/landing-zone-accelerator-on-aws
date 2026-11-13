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

import * as fs from 'fs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { describe, expect, test, vi } from 'vitest';
import { snapShotTest } from './snapshot-test';
import { Create, memoize } from './accelerator-test-helpers';
import { Template } from 'aws-cdk-lib/assertions';
import { InterfaceEndpointServiceConfig, VpcConfig } from '@aws-accelerator/config';
import { NetworkVpcEndpointsStack } from '../lib/stacks/network-stacks/network-vpc-endpoints-stack/network-vpc-endpoints-stack';
import { endpointPolicyNotAppliedMessage } from '../lib/stacks/network-stacks/network-vpc-endpoints-stack/endpoint-policy-support';

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

/**
 * Calls the private NetworkVpcEndpointsStack.createVpcEndpointPolicy against a minimal stack context so the
 * policy selection logic can be tested per service without synthesizing a full config.
 */
describe('NetworkVpcEndpointsStack createVpcEndpointPolicy', () => {
  type CreateVpcEndpointPolicy = (
    vpcItem: VpcConfig,
    endpointItem: InterfaceEndpointServiceConfig,
    isGatewayEndpoint?: boolean,
  ) => cdk.aws_iam.PolicyDocument | undefined;

  const createVpcEndpointPolicy = (
    NetworkVpcEndpointsStack.prototype as unknown as { createVpcEndpointPolicy: CreateVpcEndpointPolicy }
  ).createVpcEndpointPolicy;

  const configDirPath = path.join(__dirname, 'configs/snapshot-only');
  const policyDocuments: Record<string, string> = {
    Default: 'vpc-endpoint-policies/default.json',
    Ec2: 'vpc-endpoint-policies/ec2.json',
  };

  const expectedPolicy = (policyName: string) =>
    cdk.aws_iam.PolicyDocument.fromJson(
      JSON.parse(fs.readFileSync(path.join(configDirPath, policyDocuments[policyName]), 'utf8')),
    ).toJSON();

  const createContext = () => ({
    props: {
      configDirPath,
      networkConfig: {
        endpointPolicies: Object.entries(policyDocuments).map(([name, document]) => ({ name, document })),
      },
    },
    organizationId: 'o-test',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    generatePolicyReplacements: (policyPath: string) => fs.readFileSync(policyPath, 'utf8'),
  });

  const vpcItem = {
    name: 'Test-Vpc',
    interfaceEndpoints: { defaultPolicy: 'Default', endpoints: [], subnets: [] },
  } as unknown as VpcConfig;

  const endpoint = (service: string, overrides: Partial<InterfaceEndpointServiceConfig> = {}) =>
    ({ service, ...overrides }) as InterfaceEndpointServiceConfig;

  test('warns that an explicitly configured policy is not applied to an unsupported service', () => {
    const context = createContext();

    const policy = createVpcEndpointPolicy.call(context, vpcItem, endpoint('codeguru-profiler', { policy: 'Ec2' }));

    expect(policy).toBeUndefined();
    expect(context.logger.warn).toHaveBeenCalledWith(
      endpointPolicyNotAppliedMessage('Test-Vpc', 'codeguru-profiler', 'Ec2'),
    );
  });

  test('warns that the VPC default policy is not applied to an unsupported service', () => {
    const context = createContext();

    const policy = createVpcEndpointPolicy.call(context, vpcItem, endpoint('codeguru-profiler'));

    expect(policy).toBeUndefined();
    expect(context.logger.warn).toHaveBeenCalledWith(
      endpointPolicyNotAppliedMessage('Test-Vpc', 'codeguru-profiler', 'Default'),
    );
  });

  test('does not warn when applyPolicy is false', () => {
    const context = createContext();

    const policy = createVpcEndpointPolicy.call(
      context,
      vpcItem,
      endpoint('codeguru-profiler', { policy: 'Ec2', applyPolicy: false }),
    );

    expect(policy).toBeUndefined();
    expect(context.logger.warn).not.toHaveBeenCalled();
  });

  test('still applies a configured policy to a service that supports endpoint policies', () => {
    const context = createContext();

    const policy = createVpcEndpointPolicy.call(context, vpcItem, endpoint('athena', { policy: 'Ec2' }));

    expect(policy?.toJSON()).toEqual(expectedPolicy('Ec2'));
    expect(context.logger.warn).not.toHaveBeenCalled();
  });
});

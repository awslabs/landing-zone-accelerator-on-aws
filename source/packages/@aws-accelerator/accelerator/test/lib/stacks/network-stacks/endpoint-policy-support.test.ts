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

import { describe, expect, test } from 'vitest';
import { NetworkConfig } from '@aws-accelerator/config';
import {
  endpointPolicyNotAppliedMessage,
  getEndpointPolicyNotAppliedWarnings,
  isVpcEndpointPolicySupported,
} from '../../../../lib/stacks/network-stacks/network-vpc-endpoints-stack/endpoint-policy-support';

describe('endpoint policy support', () => {
  test('reports a service on the unsupported list as not supporting endpoint policies', () => {
    expect(isVpcEndpointPolicySupported('codeguru-profiler')).toBe(false);
  });

  test('reports a service not on the unsupported list as supporting endpoint policies', () => {
    expect(isVpcEndpointPolicySupported('athena')).toBe(true);
  });

  test('names the policy, service and VPC in the warning', () => {
    expect(endpointPolicyNotAppliedMessage('Network-Vpc', 'codeguru-profiler', 'Default')).toBe(
      'Endpoint policy Default is not applied to the codeguru-profiler endpoint in VPC Network-Vpc because the service ' +
        'does not support VPC endpoint policies. The endpoint is deployed without a policy.',
    );
  });
});

describe('getEndpointPolicyNotAppliedWarnings', () => {
  const networkConfig = (vpcs: unknown[], vpcTemplates?: unknown[]) =>
    ({ vpcs, vpcTemplates }) as unknown as NetworkConfig;

  test('warns for an explicit policy on an unsupported interface endpoint', () => {
    const config = networkConfig([
      { name: 'Vpc-A', interfaceEndpoints: { endpoints: [{ service: 'codeguru-profiler', policy: 'Ec2' }] } },
    ]);

    expect(getEndpointPolicyNotAppliedWarnings(config)).toStrictEqual([
      endpointPolicyNotAppliedMessage('Vpc-A', 'codeguru-profiler', 'Ec2'),
    ]);
  });

  test('warns for the VPC default policy on an unsupported interface endpoint', () => {
    const config = networkConfig([
      {
        name: 'Vpc-A',
        interfaceEndpoints: { defaultPolicy: 'Default', endpoints: [{ service: 'codeguru-profiler' }] },
      },
    ]);

    expect(getEndpointPolicyNotAppliedWarnings(config)).toStrictEqual([
      endpointPolicyNotAppliedMessage('Vpc-A', 'codeguru-profiler', 'Default'),
    ]);
  });

  test('warns for VPC templates too', () => {
    const config = networkConfig(
      [],
      [{ name: 'Template-A', interfaceEndpoints: { endpoints: [{ service: 'codeguru-profiler', policy: 'Ec2' }] } }],
    );

    expect(getEndpointPolicyNotAppliedWarnings(config)).toStrictEqual([
      endpointPolicyNotAppliedMessage('Template-A', 'codeguru-profiler', 'Ec2'),
    ]);
  });

  test('does not warn when applyPolicy is false', () => {
    const config = networkConfig([
      {
        name: 'Vpc-A',
        interfaceEndpoints: {
          defaultPolicy: 'Default',
          endpoints: [{ service: 'codeguru-profiler', policy: 'Ec2', applyPolicy: false }],
        },
      },
    ]);

    expect(getEndpointPolicyNotAppliedWarnings(config)).toStrictEqual([]);
  });

  test('does not warn when no policy is configured', () => {
    const config = networkConfig([
      { name: 'Vpc-A', interfaceEndpoints: { endpoints: [{ service: 'codeguru-profiler' }] } },
    ]);

    expect(getEndpointPolicyNotAppliedWarnings(config)).toStrictEqual([]);
  });

  test('does not warn for services that support endpoint policies', () => {
    const config = networkConfig([
      {
        name: 'Vpc-A',
        interfaceEndpoints: { defaultPolicy: 'Default', endpoints: [{ service: 'athena', policy: 'Ec2' }] },
        gatewayEndpoints: { defaultPolicy: 'Default', endpoints: [{ service: 's3' }] },
      },
    ]);

    expect(getEndpointPolicyNotAppliedWarnings(config)).toStrictEqual([]);
  });

  test('does not warn for VPCs without endpoints', () => {
    expect(getEndpointPolicyNotAppliedWarnings(networkConfig([{ name: 'Vpc-A' }]))).toStrictEqual([]);
  });
});

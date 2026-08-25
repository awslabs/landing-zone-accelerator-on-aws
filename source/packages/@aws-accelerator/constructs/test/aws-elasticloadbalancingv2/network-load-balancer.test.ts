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
import { Match, Template } from 'aws-cdk-lib/assertions';
import { NetworkLoadBalancer } from '../../lib/aws-elasticloadbalancingv2/network-load-balancer';
import { snapShotTest } from '../snapshot-test';
import { describe, test } from 'vitest';

const testNamePrefix = 'Construct(NetworkLoadBalancer): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new NetworkLoadBalancer(stack, 'Test', {
  name: 'Test',
  ssmPrefix: '/accelerator',
  appName: 'appA',
  vpcName: 'vpcA',
  subnets: ['subnet-test123', 'subnet-test456'],
  deletionProtection: true,
  scheme: 'internal',
  crossZoneLoadBalancing: true,
  accessLogsBucket: 'test-bucket',
  listeners: [
    {
      name: 'string',
      certificate: 'fully-qualified-arn-acm',
      port: 80,
      protocol: 'HTTP',
      alpnPolicy: 'TLS_V1_2_2018',
      sslPolicy: 'ELBSecurityPolicy-2016-08',
      targetGroup: '${ACCEL_LOOKUP::TargetGroup:target-group-test}',
    },
    {
      name: 'string1',
      certificate: 'fully-qualified-arn-acm',
      port: 81,
      protocol: 'HTTP',
      alpnPolicy: 'TLS_V1_2_2018',
      sslPolicy: 'ELBSecurityPolicy-2016-08',
      targetGroup: 'target-group-test1',
    },
  ],
});

/**
 * NLB construct test
 */
describe('NetworkLoadBalancer', () => {
  snapShotTest(testNamePrefix, stack);
});

/**
 * Pins the rendered `load_balancing.cross_zone.enabled` load balancer attribute so an
 * explicit `crossZoneLoadBalancing: false` is not silently discarded by a truthiness
 * ternary. See work item #4920.
 */
describe('NetworkLoadBalancer cross-zone load balancing', () => {
  function crossZoneTemplate(crossZoneLoadBalancing?: boolean): Template {
    const assertStack = new cdk.Stack();
    new NetworkLoadBalancer(assertStack, 'Test', {
      name: 'Test',
      ssmPrefix: '/accelerator',
      appName: 'appA',
      vpcName: 'vpcA',
      subnets: ['subnet-test123', 'subnet-test456'],
      accessLogsBucket: 'test-bucket',
      crossZoneLoadBalancing,
    });
    return Template.fromStack(assertStack);
  }

  test('explicit false renders false', () => {
    crossZoneTemplate(false).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([{ Key: 'load_balancing.cross_zone.enabled', Value: 'false' }]),
    });
  });

  test('explicit true renders true', () => {
    crossZoneTemplate(true).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([{ Key: 'load_balancing.cross_zone.enabled', Value: 'true' }]),
    });
  });

  test('omitted renders the documented default of true', () => {
    crossZoneTemplate(undefined).hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      LoadBalancerAttributes: Match.arrayWith([{ Key: 'load_balancing.cross_zone.enabled', Value: 'true' }]),
    });
  });
});

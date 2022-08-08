/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

// import { SynthUtils } from '@aws-cdk/assert';
import { GatewayLoadBalancer } from '../../lib/aws-elasticloadbalancingv2/gateway-load-balancer';

const testNamePrefix = 'Construct(GatewayLoadBalancer): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GatewayLoadBalancer(stack, 'Test', {
  name: 'Test',
  allowedPrincipals: ['333333333333'],
  subnets: ['subnet-test123'],
  deletionProtection: true,
});

/**
 * GWLB construct test
 */
describe('GatewayLoadBalancer', () => {
  /**
   * Snapshot test
   */
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

  /**
   * Number of GWLBs
   */
  test(`${testNamePrefix} GWLB count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
  });

  /**
   * Number of endpoint services
   */
  test(`${testNamePrefix} Endpoint service count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCEndpointService', 1);
  });

  /**
   * Number of endpoint service permissions
   */
  test(`${testNamePrefix} Endpoint service permission count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCEndpointServicePermissions', 1);
  });

  /**
   * GWLB resource configuration test
   */
  test(`${testNamePrefix} GWLB resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Test7BFAF513: {
          Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
          Properties: {
            LoadBalancerAttributes: [
              { Key: 'deletion_protection.enabled', Value: 'true' },
              { Key: 'load_balancing.cross_zone.enabled', Value: 'true' },
            ],
            Subnets: ['subnet-test123'],
            Tags: [{ Key: 'Name', Value: 'Test' }],
          },
        },
      },
    });
  });

  /**
   * Endpoint service resource configuration test
   */
  test(`${testNamePrefix} Endpoint service resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestEndpointServiceDD0E3344: {
          Type: 'AWS::EC2::VPCEndpointService',
          Properties: {
            AcceptanceRequired: false,
            GatewayLoadBalancerArns: [{ Ref: 'Test7BFAF513' }],
          },
        },
      },
    });
  });

  /**
   * Endpoint service permissions resource configuration test
   */
  test(`${testNamePrefix} Endpoint service permissions resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestEndpointServicePermissionsC0FA4150: {
          Type: 'AWS::EC2::VPCEndpointServicePermissions',
          Properties: {
            AllowedPrincipals: [{ 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::333333333333:root']] }],
            ServiceId: { Ref: 'TestEndpointServiceDD0E3344' },
          },
        },
      },
    });
  });
});

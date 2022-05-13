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

import { ResolverEndpoint } from '../../lib/aws-route-53-resolver/resolver-endpoint';

const testNamePrefix = 'Construct(ResolverEndpoint): ';

const stack = new cdk.Stack();

new ResolverEndpoint(stack, 'TestEndpoint', {
  direction: 'OUTBOUND',
  ipAddresses: ['subnet-1', 'subnet-2'],
  name: 'TestEndpoint',
  securityGroupIds: ['sg-123test'],
  tags: [],
});

describe('ResolverEndpoint', () => {
  /**
   * Resolver endpoint resource count tets
   */
  test(`${testNamePrefix} Resolver endpoint resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::ResolverEndpoint', 1);
  });

  /**
   * Resolver endpoint resource configuration test
   */
  test(`${testNamePrefix} Resolver endpoint resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestEndpoint4E197ABD: {
          Type: 'AWS::Route53Resolver::ResolverEndpoint',
          Properties: {
            Direction: 'OUTBOUND',
            IpAddresses: [{ SubnetId: 'subnet-1' }, { SubnetId: 'subnet-2' }],
            SecurityGroupIds: ['sg-123test'],
            Tags: [
              {
                Key: 'Name',
                Value: 'TestEndpoint',
              },
            ],
          },
        },
      },
    });
  });
});

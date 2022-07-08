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
import { IpamPool } from '../../lib/aws-ec2/ipam-pool';

const testNamePrefix = 'Construct(IpamPool): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new IpamPool(stack, 'TestIpamPool', {
  name: 'Test',
  description: 'Test IPAM pool',
  addressFamily: 'ipv4',
  ipamScopeId: 'test-scope',
  locale: 'us-east-1',
  provisionedCidrs: ['10.0.0.0/8', '192.168.0.0/16'],
});

/**
 * IPAM pool construct test
 */
describe('IpamPool', () => {
  /**
   * Snapshot test
   */
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

  /**
   * Number of IPAM pool test
   */
  test(`${testNamePrefix} IPAM pool count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::IPAMPool', 1);
  });

  /**
   * IPAM pool resource configuration test
   */
  test(`${testNamePrefix} IPAM pool resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestIpamPool2D962DC3: {
          Type: 'AWS::EC2::IPAMPool',
          Properties: {
            AddressFamily: 'ipv4',
            Description: 'Test IPAM pool',
            IpamScopeId: 'test-scope',
            Locale: 'us-east-1',
            ProvisionedCidrs: [
              {
                Cidr: '10.0.0.0/8',
              },
              {
                Cidr: '192.168.0.0/16',
              },
            ],
            Tags: [
              {
                Key: 'Name',
                Value: 'Test',
              },
            ],
          },
        },
      },
    });
  });
});

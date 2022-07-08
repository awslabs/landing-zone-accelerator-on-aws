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
import { IpamScope } from '../../lib/aws-ec2/ipam-scope';

const testNamePrefix = 'Construct(IpamScope): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new IpamScope(stack, 'TestIpamScope', {
  name: 'Test',
  description: 'Test IPAM scope',
  ipamId: 'test-ipam',
});

/**
 * IPAM scope construct test
 */
describe('IpamScope', () => {
  /**
   * Snapshot test
   */
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

  /**
   * Number of IPAM scope test
   */
  test(`${testNamePrefix} IPAM scope count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::IPAMScope', 1);
  });

  /**
   * IPAM scope resource configuration test
   */
  test(`${testNamePrefix} IPAM scope resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestIpamScope20AAB890: {
          Type: 'AWS::EC2::IPAMScope',
          Properties: {
            Description: 'Test IPAM scope',
            IpamId: 'test-ipam',
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

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
import { Ipam } from '../../lib/aws-ec2/ipam';

const testNamePrefix = 'Construct(Ipam): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new Ipam(stack, 'TestIpam', {
  name: 'Test',
  description: 'Test IPAM',
  operatingRegions: ['us-east-1', 'us-west-2'],
});

/**
 * IPAM construct test
 */
describe('Ipam', () => {
  /**
   * Snapshot test
   */
  // test(`${testNamePrefix} Snapshot Test`, () => {
  //   expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  // });

  /**
   * Number of IPAM test
   */
  test(`${testNamePrefix} IPAM count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::IPAM', 1);
  });

  /**
   * IPAM resource configuration test
   */
  test(`${testNamePrefix} IPAM resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestIpamD7083AA5: {
          Type: 'AWS::EC2::IPAM',
          Properties: {
            Description: 'Test IPAM',
            OperatingRegions: [
              {
                RegionName: 'us-east-1',
              },
              {
                RegionName: 'us-west-2',
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

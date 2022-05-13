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

import { SynthUtils } from '@aws-cdk/assert';

import { PrefixList } from '../../lib/aws-ec2/prefix-list';

const testNamePrefix = 'Construct(PrefixList): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new PrefixList(stack, 'TestPrefixList', {
  name: 'Test',
  addressFamily: 'IPv4',
  maxEntries: 1,
  entries: ['1.1.1.1/32'],
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
});

/**
 * Prefix List construct test
 */
describe('PrefixList', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of DHCP options test
   */
  test(`${testNamePrefix} Prefix List count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::PrefixList', 1);
  });

  /**
   * DHCP options resource configuration test
   */
  test(`${testNamePrefix} Prefix List resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestPrefixListF3A076C9: {
          Type: 'AWS::EC2::PrefixList',
          Properties: {
            AddressFamily: 'IPv4',
            MaxEntries: 1,
            Entries: [{ Cidr: '1.1.1.1/32' }],
          },
        },
      },
    });
  });
});

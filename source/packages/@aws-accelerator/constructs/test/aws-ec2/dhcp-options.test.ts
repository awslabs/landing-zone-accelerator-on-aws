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

import { DhcpOptions } from '../../lib/aws-ec2/dhcp-options';

const testNamePrefix = 'Construct(DhcpOptions): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new DhcpOptions(stack, 'TestDhcpOpts', {
  name: 'Test',
  domainName: 'test.com',
  domainNameServers: ['1.1.1.1'],
  netbiosNameServers: ['1.1.1.1'],
  netbiosNodeType: 2,
  ntpServers: ['1.1.1.1'],
  tags: [],
});

/**
 * DHCP Options construct test
 */
describe('DhcpOptions', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of DHCP options test
   */
  test(`${testNamePrefix} DHCP options count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::DHCPOptions', 1);
  });

  /**
   * DHCP options resource configuration test
   */
  test(`${testNamePrefix} DHCP options resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestDhcpOpts22CADF8A: {
          Type: 'AWS::EC2::DHCPOptions',
          Properties: {
            DomainName: 'test.com',
            DomainNameServers: ['1.1.1.1'],
            NetbiosNameServers: ['1.1.1.1'],
            NetbiosNodeType: 2,
            NtpServers: ['1.1.1.1'],
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

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

import { VpcPeering } from '../../lib/aws-ec2/vpc-peering';

const testNamePrefix = 'Construct(VpcPeering): ';

//Initialize stack for tests
const stack = new cdk.Stack();

new VpcPeering(stack, 'TestPeering', {
  name: 'Test',
  peerOwnerId: '111111111111',
  peerRegion: 'us-east-1',
  peerVpcId: 'AccepterVpc',
  vpcId: 'RequesterVpc',
  peerRoleName: 'TestRole',
  tags: [],
});

/**
 * VPC peering construct test
 */
describe('VpcPeering', () => {
  /**
   * Number of VPC peering test
   */
  test(`${testNamePrefix} VPC peering count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::VPCPeeringConnection', 1);
  });

  /**
   * VPC peering resource configuration test
   */
  test(`${testNamePrefix} VPC peering resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestPeeringF63C5812: {
          Type: 'AWS::EC2::VPCPeeringConnection',
          Properties: {
            PeerOwnerId: '111111111111',
            PeerRegion: 'us-east-1',
            PeerRoleArn: {
              'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':iam::111111111111:role/TestRole']],
            },
            PeerVpcId: 'AccepterVpc',
            Tags: [
              {
                Key: 'Name',
                Value: 'Test',
              },
            ],
            VpcId: 'RequesterVpc',
          },
        },
      },
    });
  });
});

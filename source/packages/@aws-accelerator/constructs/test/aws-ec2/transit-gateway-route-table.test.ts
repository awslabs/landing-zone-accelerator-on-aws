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
import { TransitGatewayRouteTable } from '../../lib/aws-ec2/transit-gateway-route-table';

const testNamePrefix = 'Construct(TransitGatewayRouteTable): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TransitGatewayRouteTable(stack, 'TransitGatewayRouteTable', {
  name: 'core',
  transitGatewayId: 'tgw0001',
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
});
/**
 * TransitGatewayRouteTable construct test
 */
describe('TransitGatewayRouteTable', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });
  /**
   * Number of TransitGatewayRouteTable resource test
   */
  test(`${testNamePrefix} TransitGatewayRouteTable resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::EC2::TransitGatewayRouteTable', 1);
  });

  /**
   * TransitGatewayRouteTable resource configuration test
   */
  test(`${testNamePrefix} TransitGatewayRouteTable resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TransitGatewayRouteTableCoreTransitGatewayRouteTableD6BC94E0: {
          Type: 'AWS::EC2::TransitGatewayRouteTable',
          Properties: {
            Tags: [
              {
                Key: 'Name',
                Value: 'core',
              },
              {
                Key: 'Test-Key',
                Value: 'Test-Value',
              },
            ],
            TransitGatewayId: 'tgw0001',
          },
        },
      },
    });
  });
});

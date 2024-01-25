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
import { TransitGatewayStaticRoute } from '../../lib/aws-ec2/transit-gateway-static-route';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(TransitGatewayStaticRoute): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRoute', {
  transitGatewayRouteTableId: '1234',
  blackhole: false,
  destinationCidrBlock: '10.0.0.0/16',
  transitGatewayAttachmentId: 'tgw-123123',
});

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRoutev6', {
  transitGatewayRouteTableId: '1234',
  blackhole: false,
  destinationCidrBlock: '::/0',
  transitGatewayAttachmentId: 'tgw-123123',
});

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRoutev4Blackhole', {
  transitGatewayRouteTableId: '1234',
  blackhole: true,
  destinationCidrBlock: '10.0.0.0/16',
});

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRoutev6Blackhole', {
  transitGatewayRouteTableId: '1234',
  blackhole: true,
  destinationCidrBlock: '::/0',
});

const customResourceHandler = cdk.aws_lambda.Function.fromFunctionName(stack, 'test', 'test');

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRouteCustom', {
  transitGatewayRouteTableId: '1234',
  blackhole: false,
  destinationCidrBlock: '10.0.0.0/16',
  transitGatewayAttachmentId: 'tgw-123123',
  customResourceHandler,
});

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRouteCustomv6', {
  transitGatewayRouteTableId: '1234',
  blackhole: false,
  destinationCidrBlock: '::/0',
  transitGatewayAttachmentId: 'tgw-123123',
  customResourceHandler,
});

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRouteCustomv4Blackhole', {
  transitGatewayRouteTableId: '1234',
  blackhole: true,
  destinationCidrBlock: '10.0.0.0/16',
  customResourceHandler,
});

new TransitGatewayStaticRoute(stack, 'TransitGatewayStaticRouteCustomv6Blackhole', {
  transitGatewayRouteTableId: '1234',
  blackhole: true,
  destinationCidrBlock: '::/0',
  customResourceHandler,
});

/**
 * TransitGatewayStaticRoute construct test
 */
describe('TransitGatewayStaticRoute', () => {
  snapShotTest(testNamePrefix, stack);
});

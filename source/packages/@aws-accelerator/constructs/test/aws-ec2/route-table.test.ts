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
import { RouteTable } from '../../lib/aws-ec2/route-table';
import { NatGateway, Vpc, Subnet } from '../../lib/aws-ec2/vpc';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(RouteTable): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const key = new cdk.aws_kms.Key(stack, 'testKey');
const vpc = new Vpc(stack, 'TestVpc', {
  name: 'Test',
  ipv4CidrBlock: '10.0.0.0/16',
  internetGateway: true,
  enableDnsHostnames: false,
  enableDnsSupport: true,
  instanceTenancy: 'default',
  virtualPrivateGateway: {
    asn: 65000,
  },
});

const rt = new RouteTable(stack, 'RouteTable', {
  name: 'TestRouteTable',
  vpc: vpc,
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
});

const subnet = new Subnet(stack, 'test-subnet', {
  name: 'test-subnet',
  routeTable: rt,
  vpc,
  availabilityZone: 'a',
  ipv4CidrBlock: '10.0.2.0/24',
});

const ngw = new NatGateway(stack, 'ngw', { name: 'ngw', subnet });

const tgwAttachment = new cdk.aws_ec2.CfnTransitGatewayAttachment(stack, 'tgwAttachment', {
  subnetIds: ['subnet-123'],
  transitGatewayId: 'tgw-12324',
  vpcId: vpc.vpcId,
});

rt.addTransitGatewayRoute('tg-route', 'tgw-1234', tgwAttachment, undefined, 'pl-1234', key, 10);
rt.addTransitGatewayRoute('tg', 'tg-1234', tgwAttachment, '10.0.5.0/24', undefined, key, 10);
rt.addNatGatewayRoute('testNgwRoute', ngw.natGatewayId, '10.0.3.0/24', undefined, key, 10);
rt.addNatGatewayRoute('test2NgwRoute', ngw.natGatewayId, undefined, 'pl-1234', key, 10);
rt.addInternetGatewayRoute('testIgwRoute', '0.0.0.0/0', undefined, key, 10);
rt.addInternetGatewayRoute('testIgwRoute2', undefined, 'pl-1234', key, 10);
rt.addVirtualPrivateGatewayRoute('testVgwRoute', '10.0.30./24', undefined, key, 10);
rt.addVirtualPrivateGatewayRoute('testVgw2Route', undefined, 'pl-1234', key, 10);
rt.addGatewayAssociation('internetGateway');
rt.addGatewayAssociation('virtualPrivateGateway');
/**
 * RouteTable construct test
 */
describe('RouteTable', () => {
  snapShotTest(testNamePrefix, stack);
});

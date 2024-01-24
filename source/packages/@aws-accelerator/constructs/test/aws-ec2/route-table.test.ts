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
import { RouteTable } from '../../lib/aws-ec2/route-table';
import { NatGateway, Vpc, Subnet } from '../../lib/aws-ec2/vpc';
import { snapShotTest } from '../snapshot-test';
import { describe, it, expect } from '@jest/globals';
import { TransitGatewayAttachment } from '../../lib/aws-ec2/transit-gateway';

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
vpc.addEgressOnlyIgw();

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
  availabilityZoneId: undefined,
  ipv4CidrBlock: '10.0.2.0/24',
});

const ngw = new NatGateway(stack, 'ngw', { name: 'ngw', subnet });

const tgwAttachment = new TransitGatewayAttachment(stack, 'tgwAttachment', {
  name: 'someTgwAttachment',
  partition: 'partition',
  subnetIds: ['subnet-123'],
  transitGatewayId: 'tgw-12324',
  vpcId: vpc.vpcId,
});

rt.addTransitGatewayRoute('tg-route', 'tgw-1234', tgwAttachment, undefined, 'pl-1234', undefined, key, 10);
rt.addTransitGatewayRoute('tg', 'tg-1234', tgwAttachment, '10.0.5.0/24', undefined, undefined, key, 10);
rt.addTransitGatewayRoute('tg-ipv6', 'tg-1234', tgwAttachment, undefined, undefined, '::1', key, 10);
rt.addNatGatewayRoute('testNgwRoute', ngw.natGatewayId, '10.0.3.0/24', undefined, undefined, key, 10);
rt.addNatGatewayRoute('test2NgwRoute', ngw.natGatewayId, undefined, 'pl-1234', undefined, key, 10);
rt.addNatGatewayRoute('test3NgwRoute', ngw.natGatewayId, undefined, undefined, '::1', key, 10);
rt.addInternetGatewayRoute('testIgwRoute', '0.0.0.0/0', undefined, undefined, key, 10);
rt.addInternetGatewayRoute('testIgwRoute2', undefined, 'pl-1234', undefined, key, 10);
rt.addInternetGatewayRoute('testIgwRoute3', undefined, undefined, '::1', key, 10);
rt.addEgressOnlyIgwRoute('testEigwRoute1', undefined, 'pl-1234', undefined, key, 10);
rt.addEgressOnlyIgwRoute('testEigwRoute2', '0.0.0.0/0', undefined, undefined, key, 10);
rt.addEgressOnlyIgwRoute('testEigwRoute3', undefined, undefined, '::1', key, 10);
rt.addVirtualPrivateGatewayRoute('testVgwRoute', '10.0.30./24', undefined, undefined, key, 10);
rt.addVirtualPrivateGatewayRoute('testVgw2Route', undefined, 'pl-1234', undefined, key, 10);
rt.addVirtualPrivateGatewayRoute('testVgw3Route', undefined, undefined, '::1', key, 10);
rt.addGatewayAssociation('internetGateway');
rt.addGatewayAssociation('virtualPrivateGateway');
/**
 * RouteTable construct test
 */
describe('RouteTable', () => {
  it('addTransitGatewayRoute destinationPrefix list without logRetention throws error', () => {
    function noLogRetention() {
      rt.addTransitGatewayRoute(
        'testRoute2',
        'tgw-1234',
        tgwAttachment,
        undefined,
        'pl-1234',
        undefined,
        key,
        undefined,
      );
    }
    expect(noLogRetention).toThrow(
      new Error('Attempting to add prefix list route without specifying log group retention period'),
    );
  });
  it('addTransitGatewayRoute no destination throws error', () => {
    function noDest() {
      rt.addTransitGatewayRoute('testRoute3', 'tgw-1234', tgwAttachment, undefined, undefined, undefined, key, 10);
    }
    expect(noDest).toThrow(new Error('Attempting to add CIDR route without specifying destination'));
  });
  it('addNatGatewayRoute destinationPrefix list without logRetention throws error', () => {
    function noLogRetention() {
      rt.addNatGatewayRoute(
        'testNgwRoute2',
        ngw.natGatewayId,
        '10.0.3.0/24',
        'destinationPrefixListId',
        undefined,
        key,
        undefined,
      );
    }
    expect(noLogRetention).toThrow(
      new Error('Attempting to add prefix list route without specifying log group retention period'),
    );
  });
  it('addNatGatewayRoute no destination throws error', () => {
    function noDest() {
      rt.addNatGatewayRoute('testNgwRoute3', ngw.natGatewayId, undefined, undefined, undefined, key, 10);
    }
    expect(noDest).toThrow(new Error('Attempting to add CIDR route without specifying destination'));
  });
  it('addInternetGatewayRoute destinationPrefix list without logRetention throws error', () => {
    function noLogRetention() {
      rt.addInternetGatewayRoute('testIgwRoute2', '0.0.0.0/0', 'destinationPrefixListId', undefined, key, undefined);
    }
    expect(noLogRetention).toThrow(
      new Error('Attempting to add prefix list route without specifying log group retention period'),
    );
  });
  it('addInternetGatewayRoute no destination throws error', () => {
    function noDest() {
      rt.addInternetGatewayRoute('testIgwRoute3', undefined, undefined, undefined, key, 10);
    }
    expect(noDest).toThrow(new Error('Attempting to add CIDR route without specifying destination'));
  });

  it('addEgressOnlyIgwRoute destinationPrefix list without logRetention throws error', () => {
    function noLogRetention() {
      rt.addEgressOnlyIgwRoute('testIgwRoute2', '0.0.0.0/0', 'destinationPrefixListId', undefined, key, undefined);
    }
    expect(noLogRetention).toThrow(
      new Error('Attempting to add prefix list route without specifying log group retention period'),
    );
  });
  it('addEgressOnlyIgwRoute no destination throws error', () => {
    function noDest() {
      rt.addEgressOnlyIgwRoute('testIgwRoute3', undefined, undefined, undefined, key, 10);
    }
    expect(noDest).toThrow(new Error('Attempting to add CIDR route without specifying destination'));
  });

  it('addVirtualPrivateGatewayRoute destinationPrefix list without logRetention throws error', () => {
    function noLogRetention() {
      rt.addVirtualPrivateGatewayRoute(
        'testVgwRoute2',
        '0.0.0.0/0',
        'destinationPrefixListId',
        undefined,
        key,
        undefined,
      );
    }
    expect(noLogRetention).toThrow(
      new Error('Attempting to add prefix list route without specifying log group retention period'),
    );
  });
  it('addVirtualPrivateGatewayRoute no destination throws error', () => {
    function noDest() {
      rt.addVirtualPrivateGatewayRoute('testVgwRoute3', undefined, undefined, undefined, key, 10);
    }
    expect(noDest).toThrow(new Error('Attempting to add CIDR route without specifying destination'));
  });
  snapShotTest(testNamePrefix, stack);
});

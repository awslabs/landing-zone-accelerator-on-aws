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
import {
  Vpc,
  Subnet,
  NatGateway,
  SecurityGroup,
  NetworkAcl,
  DeleteDefaultSecurityGroupRules,
} from '../../lib/aws-ec2/vpc';
import { RouteTable } from '../../lib/aws-ec2/route-table';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(Vpc): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const vpc = Vpc.fromVpcAttributes(stack, 'TestVpc', {
  name: 'Main',
  vpcId: 'someImportedVpcId',
});

vpc.addVirtualPrivateGateway(65000);
vpc.addInternetGateway();

vpc.addFlowLogs({
  destinations: ['s3', 'cloud-watch-logs'],
  maxAggregationInterval: 60,
  trafficType: 'ALL',
  bucketArn: 'arn:aws:s3:::aws-accelerator-test-111111111111-us-east-1',
  encryptionKey: new cdk.aws_kms.Key(stack, 'test-key2'),
  logRetentionInDays: 10,
  useExistingRoles: false,
  acceleratorPrefix: 'AWSAccelerator',
});

vpc.addCidr({ cidrBlock: '10.2.0.0/16' });
const rt2 = RouteTable.fromRouteTableAttributes(stack, 'ImportedRouteTable', {
  routeTableId: 'someImportedRouteTableId',
  vpc,
});
const rt = new RouteTable(stack, 'test-rt', { name: 'test-rt', vpc });
const route = rt.addInternetGatewayRoute('IgwRoute', '0.0.0.0/0');
vpc.addInternetGatewayDependent(route);
vpc.setDhcpOptions('test-dhcp-opts');
const subnet1 = Subnet.fromSubnetAttributes(stack, 'ImportedSubnet', {
  subnetId: 'someImportedSubnetId',
  ipv4CidrBlock: '10.2.1.0/24',
  name: 'testImportedSubnet',
  routeTable: rt,
});

Subnet.fromSubnetAttributes(stack, 'ImportedSubnet2', {
  subnetId: 'someImportedSubnetId2',
  ipv4CidrBlock: '10.2.2.0/24',
  name: 'testImportedSubnet2',
  routeTable: rt2,
});

new NatGateway(stack, 'natGw', { name: 'ngw', subnet: subnet1, tags: [{ key: 'test', value: 'test2' }] });

const sg = new SecurityGroup(stack, 'tetSg', {
  description: 'test',
  securityGroupName: 'test',
  vpc,
  tags: [{ key: 'test', value: 'test2' }],
});

sg.addEgressRule('egressTest', {
  ipProtocol: 'ipv4',
  cidrIp: '10.0.0.7/32',
  description: 'test description',
  fromPort: 80,
  toPort: 80,
});

sg.addIngressRule('ingressTest', {
  ipProtocol: 'ipv4',
  cidrIp: '10.0.0.7/32',
  description: 'test description',
  fromPort: 80,
  toPort: 80,
});

const sg2 = SecurityGroup.fromSecurityGroupId(stack, 'someImportedSecurityGroupId');

sg2.addEgressRule('egressTest', {
  ipProtocol: 'ipv4',
  cidrIp: '10.0.0.7/32',
  description: 'test description',
  fromPort: 80,
  toPort: 80,
});

sg2.addIngressRule('ingressTest', {
  ipProtocol: 'ipv4',
  cidrIp: '10.0.0.7/32',
  description: 'test description',
  fromPort: 80,
  toPort: 80,
});

const nacl = new NetworkAcl(stack, 'naclTest', {
  networkAclName: 'naclTest',
  vpc,
  tags: [{ key: 'test', value: 'test2' }],
});

nacl.addEntry('naclEntry', {
  egress: true,
  protocol: 443,
  ruleAction: 'deny',
  ruleNumber: 2,
  cidrBlock: '10.0.0.14/32',
});

nacl.associateSubnet('naclSubnetAssociation', { subnet: subnet1 });

new DeleteDefaultSecurityGroupRules(stack, 'TestDeleteDefaultSgRules', {
  vpcId: 'someVpcId', //intentionally did not use regex of VPC to prevent scan
  kmsKey: new cdk.aws_kms.Key(stack, 'testKmsTestDeleteDefaultSgRules'),
  logRetentionInDays: 7,
});

/**
 * Vpc construct test
 */
describe('VpcImport', () => {
  snapShotTest(testNamePrefix, stack);
});

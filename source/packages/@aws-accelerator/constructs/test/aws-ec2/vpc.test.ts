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
import { OutpostsConfig } from '@aws-accelerator/config';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(Vpc): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

const vpc = new Vpc(stack, 'TestVpc', {
  name: 'Main',
  ipv4CidrBlock: '10.0.0.0/16',
  dhcpOptions: 'Test-Options',
  internetGateway: true,
  enableDnsHostnames: false,
  enableDnsSupport: true,
  instanceTenancy: 'default',
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
  virtualPrivateGateway: {
    asn: 65000,
  },
});

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

const vpcExistingIam = new Vpc(stack, 'TestVpcExistingIam', {
  name: 'Main',
  ipv4CidrBlock: '10.0.0.0/16',
  dhcpOptions: 'Test-Options',
  internetGateway: true,
  enableDnsHostnames: false,
  enableDnsSupport: true,
  instanceTenancy: 'default',
  tags: [{ key: 'Test-Key', value: 'Test-Value' }],
  virtualPrivateGateway: {
    asn: 65000,
  },
});

vpcExistingIam.addFlowLogs({
  destinations: ['s3', 'cloud-watch-logs'],
  maxAggregationInterval: 60,
  trafficType: 'ALL',
  bucketArn: 'arn:aws:s3:::aws-accelerator-test-111111111111-us-east-1',
  encryptionKey: new cdk.aws_kms.Key(stack, 'testKey2ExistingIam'),
  logRetentionInDays: 10,
  useExistingRoles: true,
  acceleratorPrefix: 'AWSAccelerator',
});

vpc.addCidr({ cidrBlock: '10.2.0.0/16' });
const outpostConfig = new OutpostsConfig();
const rt = new RouteTable(stack, 'test-rt', { name: 'test-rt', vpc });
const subnet1 = new Subnet(stack, 'test', {
  availabilityZone: 'a',
  vpc,
  name: 'testSubnetOutpost',
  routeTable: rt,
  outpost: outpostConfig,
  ipv4CidrBlock: '10.0.1.0/24',
  availabilityZoneId: undefined,
});

new Subnet(stack, 'testSubnetIpam', {
  availabilityZone: 'b',
  availabilityZoneId: undefined,
  vpc,
  name: 'testSubnet',
  routeTable: rt,
  ipamAllocation: {
    ipamPoolName: 'test',
    netmaskLength: 24,
  },
  basePool: ['myBasePool'],
  logRetentionInDays: 10,
  kmsKey: new cdk.aws_kms.Key(stack, 'testKms'),
});

new Subnet(stack, 'testSubnetIpamPhysicalAz1', {
  availabilityZone: undefined,
  availabilityZoneId: '1',
  vpc,
  name: 'testSubnetPhysicalAz1',
  routeTable: rt,
  ipamAllocation: {
    ipamPoolName: 'test',
    netmaskLength: 24,
  },
  basePool: ['myBasePool'],
  logRetentionInDays: 10,
  kmsKey: new cdk.aws_kms.Key(stack, 'testKms1'),
});

new Subnet(stack, 'testSubnetPhysicalAz2', {
  availabilityZone: undefined,
  availabilityZoneId: '2',
  vpc,
  name: 'testSubnetPhysicalAz2',
  routeTable: rt,
  ipamAllocation: {
    ipamPoolName: 'test',
    netmaskLength: 24,
  },
  basePool: ['myBasePool'],
  logRetentionInDays: 10,
  kmsKey: new cdk.aws_kms.Key(stack, 'testKms2'),
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
describe('Vpc', () => {
  snapShotTest(testNamePrefix, stack);
});

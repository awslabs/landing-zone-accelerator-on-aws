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

import { handler } from '../../../lib/aws-ram/share-subnet-tags/index';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import {
  EC2Client,
  DescribeTagsCommand,
  CreateTagsCommand,
  DescribeSubnetsCommand,
  DeleteTagsCommand,
} from '@aws-sdk/client-ec2';
import {
  SSMClient,
  GetParameterCommand,
  DeleteParameterCommand,
  // PutParameterCommand,
  // ParameterNotFound,
} from '@aws-sdk/client-ssm';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from '../../../lib/lza-custom-resource';
import { expect, it, beforeEach, afterEach } from '@jest/globals';

let ssmMock: AwsClientStub<SSMClient>;
let ec2Mock: AwsClientStub<EC2Client>;

beforeEach(() => {
  ssmMock = mockClient(SSMClient);
  ec2Mock = mockClient(EC2Client);
});

afterEach(() => {
  ssmMock.restore();
  ec2Mock.restore();
});

// Given
const createEvent: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::ShareSubnetTags',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    ServiceToken: 'example-service-token',
    vpcTags: [
      { key: 'subnetKey1', value: 'subnetValue1' },
      { key: 'subnetKey2', value: 'subnetValue2' },
    ],
    subnetTags: [
      { key: 'subnetKey1', value: 'subnetValue1' },
      { key: 'subnetKey2', value: 'subnetValue2' },
    ],
    sharedSubnetName: 'sharedSubnet',
    vpcName: 'vpcName',
    acceleratorSsmParamPrefix: '/accel/prefix',
  },
};
const sharedSubnetSsmPath = `${createEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${createEvent.ResourceProperties['vpcName']}/subnet/${createEvent.ResourceProperties['sharedSubnetName']}/id`;
const vpcSsmPath = `${createEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${createEvent.ResourceProperties['vpcName']}/id`;

// When
it('@aws-accelerator/constructs-aws-ram-share-subnet-tags create event subnet and vpc needs no update', async () => {
  // when - parameter already exists
  ssmMock
    .on(GetParameterCommand, { Name: sharedSubnetSsmPath })
    .resolves({ Parameter: { Name: sharedSubnetSsmPath, Value: 'subnet-1234' } });
  // when - tags are same
  ec2Mock.on(DescribeTagsCommand).resolves({
    Tags: [
      { Key: 'subnetKey1', Value: 'subnetValue1', ResourceId: 'subnet-1234', ResourceType: 'subnet' },
      { Key: 'subnetKey2', Value: 'subnetValue2', ResourceId: 'subnet-1234', ResourceType: 'subnet' },
    ],
  });
  // when - subnet is found with exact tags
  ec2Mock.on(DescribeSubnetsCommand).resolves({
    Subnets: [
      {
        SubnetId: 'subnet-1234',
        VpcId: 'vpc-1234',
        AvailabilityZone: 'us-east-1a',
        AvailabilityZoneId: 'use1-az1',
        CidrBlock: '10.10.10.0/24',
        MapPublicIpOnLaunch: true,
        AvailableIpAddressCount: 253,
        DefaultForAz: true,
        State: 'available',
        OwnerId: '123456789012',
        AssignIpv6AddressOnCreation: false,
        Ipv6CidrBlockAssociationSet: [],
        Tags: [
          { Key: 'subnetKey1', Value: 'subnetValue1' },
          { Key: 'subnetKey2', Value: 'subnetValue2' },
        ],
      },
    ],
  });
  // when - parameter already exists
  ssmMock
    .on(GetParameterCommand, { Name: vpcSsmPath })
    .resolves({ Parameter: { Name: vpcSsmPath, Value: 'vpc-1234' } });
  const response = await handler(createEvent);
  // then - response Status is SUCCESS
  expect(response?.Status).toBe('SUCCESS');
});

it('@aws-accelerator/constructs-aws-ram-share-subnet-tags create event subnet and vpc exist but need update', async () => {
  // when - parameter exist
  ssmMock
    .on(GetParameterCommand, { Name: sharedSubnetSsmPath })
    .resolves({ Parameter: { Name: sharedSubnetSsmPath, Value: 'subnet-1234' } });
  // when - tags are same
  ec2Mock.on(DescribeTagsCommand).resolves({
    Tags: [{ Key: 'Key1', Value: 'Value1', ResourceId: 'subnet-1234', ResourceType: 'subnet' }],
  });
  // when - tags are same
  ec2Mock.on(DescribeTagsCommand).resolves({
    Tags: [{ Key: 'Key1', Value: 'Value1' }],
  });
  // when - subnet is found with different tags
  ec2Mock.on(DescribeSubnetsCommand).resolves({
    Subnets: [
      {
        SubnetId: 'subnet-1234',
        VpcId: 'vpc-1234',
        AvailabilityZone: 'us-east-1a',
        AvailabilityZoneId: 'use1-az1',
        CidrBlock: '10.10.10.0/24',
        MapPublicIpOnLaunch: true,
        AvailableIpAddressCount: 253,
        DefaultForAz: true,
        State: 'available',
        OwnerId: '123456789012',
        AssignIpv6AddressOnCreation: false,
        Ipv6CidrBlockAssociationSet: [],
        Tags: [{ Key: 'Key1', Value: 'Value1' }],
      },
    ],
  });
  // when - parameter already exists
  ssmMock
    .on(GetParameterCommand, { Name: vpcSsmPath })
    .resolves({ Parameter: { Name: vpcSsmPath, Value: 'vpc-1234' } });
  ec2Mock.on(DeleteTagsCommand).resolves({});
  ec2Mock.on(CreateTagsCommand).resolves({});
  const response = await handler(createEvent);
  // then - response Status is SUCCESS
  expect(response?.Status).toBe('SUCCESS');
});

// Given
const deleteEvent: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::ShareSubnetTags',
  PhysicalResourceId: 'example-physical-resource-id',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    ServiceToken: 'example-service-token',
    vpcTags: [
      { key: 'subnetKey1', value: 'subnetValue1' },
      { key: 'subnetKey2', value: 'subnetValue2' },
    ],
    subnetTags: [
      { key: 'subnetKey1', value: 'subnetValue1' },
      { key: 'subnetKey2', value: 'subnetValue2' },
    ],
    sharedSubnetName: 'sharedSubnet',
    vpcName: 'vpcName',
    acceleratorSsmParamPrefix: '/accel/prefix',
  },
};
const sharedSubnetSsmPathDelete = `${deleteEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${deleteEvent.ResourceProperties['vpcName']}/subnet/${deleteEvent.ResourceProperties['sharedSubnetName']}/id`;

it('@aws-accelerator/constructs-aws-ram-share-subnet-tags delete event', async () => {
  // when
  ssmMock
    .on(GetParameterCommand, { Name: sharedSubnetSsmPath })
    .resolves({ Parameter: { Name: sharedSubnetSsmPath, Value: 'subnet-1234' } });
  ssmMock.on(DeleteParameterCommand, { Name: sharedSubnetSsmPathDelete }).resolves({});
  ec2Mock.on(DeleteTagsCommand).resolves({});
  const response = await handler(deleteEvent);
  // then - response Status is SUCCESS
  expect(response?.Status).toBe('SUCCESS');
});

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
import { EC2Client, CreateTagsCommand, DescribeSubnetsCommand, DeleteTagsCommand } from '@aws-sdk/client-ec2';
import {
  SSMClient,
  GetParameterCommand,
  DeleteParameterCommand,
  // PutParameterCommand,
  // ParameterNotFound,
} from '@aws-sdk/client-ssm';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceUpdateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from '../../../lib/lza-custom-resource';
import { expect, it, beforeEach, afterEach } from 'vitest';

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

// When
it('@aws-accelerator/constructs-aws-ram-share-subnet-tags create event when subnet and vpc does not need tags deletion', async () => {
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
        { key: 'vpcKey1', value: 'vpcValue1' },
        { key: 'vpcKey2', value: 'vpcValue2' },
      ],
      subnetTags: [
        { key: 'subnetKey1', value: 'subnetValue1' },
        { key: 'subnetKey2', value: 'subnetValue2' },
      ],
      sharedSubnetId: 'subnet-1234',
      sharedSubnetName: 'sharedSubnet',
      vpcName: 'vpcName',
      acceleratorSsmParamPrefix: '/accel/prefix',
    },
  };
  const sharedSubnetSsmPath = `${createEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${createEvent.ResourceProperties['vpcName']}/subnet/${createEvent.ResourceProperties['sharedSubnetName']}/id`;
  const vpcSsmPath = `${createEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${createEvent.ResourceProperties['vpcName']}/id`;

  // when - parameter already exists
  ssmMock
    .on(GetParameterCommand, { Name: sharedSubnetSsmPath })
    .resolves({ Parameter: { Name: sharedSubnetSsmPath, Value: 'subnet-1234' } });
  // when - subnet is found with user-defined tags
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
          { Key: 'userSubnetKey1', Value: 'userSubnetValue1' },
          { Key: 'userSubnetKey2', Value: 'userSubnetValue2' },
        ],
      },
    ],
  });
  // when - parameter already exists
  ssmMock
    .on(GetParameterCommand, { Name: vpcSsmPath })
    .resolves({ Parameter: { Name: vpcSsmPath, Value: 'vpc-1234' } });
  ec2Mock.on(CreateTagsCommand).resolves({});
  const response = await handler(createEvent);
  // then - no tags (including user-defined) are deleted
  expect(ec2Mock.commandCalls(DeleteTagsCommand).length).toBe(0);

  // then - lza specific tags are created
  expect(ec2Mock.commandCalls(CreateTagsCommand).length).toBe(2);
  const createCalls = ec2Mock.commandCalls(CreateTagsCommand);
  expect(createCalls[0].args[0].input).toMatchObject({
    Resources: ['subnet-1234'],
    Tags: [
      { Key: 'subnetKey1', Value: 'subnetValue1' },
      { Key: 'subnetKey2', Value: 'subnetValue2' },
    ],
  });
  expect(createCalls[1].args[0].input).toMatchObject({
    Resources: ['vpc-1234'],
    Tags: [
      { Key: 'vpcKey1', Value: 'vpcValue1' },
      { Key: 'vpcKey2', Value: 'vpcValue2' },
    ],
  });

  // then - response Status is SUCCESS
  expect(response?.Status).toBe('SUCCESS');
});

it('@aws-accelerator/constructs-aws-ram-share-subnet-tags create event when subnet and vpc exist but need update', async () => {
  // Given
  const updateEvent: CloudFormationCustomResourceUpdateEvent = {
    RequestType: 'Update',
    ResponseURL: 'https://example.com',
    ServiceToken: 'example-service-token',
    StackId: 'example-stack-id',
    RequestId: 'example-create-request-id',
    ResourceType: 'Custom::ShareSubnetTags',
    LogicalResourceId: 'example-logical-resource-id',
    PhysicalResourceId: 'subnet-1234',
    ResourceProperties: {
      ServiceToken: 'example-service-token',
      vpcTags: [
        { key: 'vpcKey', value: 'vpcValue' },
        { key: 'vpcKeyNew', value: 'vpcValueNew' },
      ],
      subnetTags: [
        { key: 'subnetKey', value: 'subnetValue' },
        { key: 'subnetKeyNew', value: 'subnetValueNew' },
      ],
      sharedSubnetId: 'subnet-1234',
      sharedSubnetName: 'sharedSubnet',
      vpcName: 'vpcName',
      acceleratorSsmParamPrefix: '/accel/prefix',
    },
    OldResourceProperties: {
      ServiceToken: 'example-service-token',
      vpcTags: [
        { key: 'vpcKey', value: 'vpcValue' },
        { key: 'vpcKeyRemoved', value: 'vpcValueRemoved' },
      ],
      subnetTags: [
        { key: 'subnetKey', value: 'subnetValue' },
        { key: 'subnetKeyRemoved', value: 'subnetValueRemoved' },
      ],
      sharedSubnetId: 'subnet-1234',
      sharedSubnetName: 'sharedSubnet',
      vpcName: 'vpcName',
      acceleratorSsmParamPrefix: '/accel/prefix',
    },
  };
  const sharedSubnetSsmPath = `${updateEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${updateEvent.ResourceProperties['vpcName']}/subnet/${updateEvent.ResourceProperties['sharedSubnetName']}/id`;
  const vpcSsmPath = `${updateEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${updateEvent.ResourceProperties['vpcName']}/id`;

  // when - parameter exist
  ssmMock
    .on(GetParameterCommand, { Name: sharedSubnetSsmPath })
    .resolves({ Parameter: { Name: sharedSubnetSsmPath, Value: 'subnet-1234' } });
  // when - subnet is found with different lza tags
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
          { Key: 'subnetKey', Value: 'subnetValue' },
          { Key: 'subnetKeyRemoved', Value: 'subnetValueRemoved' },
          { Key: 'subnetKeyUser', Value: 'subnetValueUser' },
        ],
      },
    ],
  });
  // when - parameter already exists
  ssmMock
    .on(GetParameterCommand, { Name: vpcSsmPath })
    .resolves({ Parameter: { Name: vpcSsmPath, Value: 'vpc-1234' } });
  ec2Mock.on(DeleteTagsCommand).resolves({});
  ec2Mock.on(CreateTagsCommand).resolves({});
  const response = await handler(updateEvent);
  // then - no user-defined or new lza specific tags are deleted
  expect(ec2Mock.commandCalls(DeleteTagsCommand).length).toBe(2);
  const deleteCalls = ec2Mock.commandCalls(DeleteTagsCommand);
  expect(deleteCalls[0].args[0].input).toMatchObject({
    Resources: ['subnet-1234'],
    Tags: [{ Key: 'subnetKeyRemoved', Value: 'subnetValueRemoved' }],
  });
  expect(deleteCalls[1].args[0].input).toMatchObject({
    Resources: ['vpc-1234'],
    Tags: [{ Key: 'vpcKeyRemoved', Value: 'vpcValueRemoved' }],
  });

  // then - new lza specific tags are created
  expect(ec2Mock.commandCalls(CreateTagsCommand).length).toBe(2);
  const createCalls = ec2Mock.commandCalls(CreateTagsCommand);
  expect(createCalls[0].args[0].input).toMatchObject({
    Resources: ['subnet-1234'],
    Tags: [{ Key: 'subnetKeyNew', Value: 'subnetValueNew' }],
  });
  expect(createCalls[1].args[0].input).toMatchObject({
    Resources: ['vpc-1234'],
    Tags: [{ Key: 'vpcKeyNew', Value: 'vpcValueNew' }],
  });

  // then - response Status is SUCCESS
  expect(response?.Status).toBe('SUCCESS');
});

it('@aws-accelerator/constructs-aws-ram-share-subnet-tags delete event', async () => {
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
        { key: 'vpcKey1', value: 'vpcValue1' },
        { key: 'vpcKey2', value: 'vpcValue2' },
      ],
      subnetTags: [
        { key: 'subnetKey1', value: 'subnetValue1' },
        { key: 'subnetKey2', value: 'subnetValue2' },
      ],
      sharedSubnetId: 'subnet-1234',
      sharedSubnetName: 'sharedSubnet',
      vpcName: 'vpcName',
      acceleratorSsmParamPrefix: '/accel/prefix',
    },
  };
  const sharedSubnetSsmPath = `${deleteEvent.ResourceProperties['acceleratorSsmParamPrefix']}/shared/network/vpc/${deleteEvent.ResourceProperties['vpcName']}/subnet/${deleteEvent.ResourceProperties['sharedSubnetName']}/id`;

  // when
  ssmMock
    .on(GetParameterCommand, { Name: sharedSubnetSsmPath })
    .resolves({ Parameter: { Name: sharedSubnetSsmPath, Value: 'subnet-1234' } });
  ssmMock.on(DeleteParameterCommand, { Name: sharedSubnetSsmPath }).resolves({});
  ec2Mock.on(DeleteTagsCommand).resolves({});
  const response = await handler(deleteEvent);
  // then - only existing lza specific tags are deleted
  expect(ec2Mock.commandCalls(DeleteTagsCommand).length).toBe(1);
  const deleteCalls = ec2Mock.commandCalls(DeleteTagsCommand);
  expect(deleteCalls[0].args[0].input).toMatchObject({
    Resources: ['subnet-1234'],
    Tags: [
      { Key: 'vpcKey1', Value: 'vpcValue1' },
      { Key: 'vpcKey2', Value: 'vpcValue2' },
      { Key: 'subnetKey1', Value: 'subnetValue1' },
      { Key: 'subnetKey2', Value: 'subnetValue2' },
    ],
  });

  // then - response Status is SUCCESS
  expect(response?.Status).toBe('SUCCESS');
});

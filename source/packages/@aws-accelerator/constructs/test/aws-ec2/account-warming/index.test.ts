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

import { handler } from '../../../lib/aws-ec2/account-warming/index';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import {
  EC2Client,
  DescribeVpcsCommand,
  CreateVpcCommand,
  DescribeSubnetsCommand,
  DescribeInstancesCommand,
  CreateSubnetCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
  DeleteSubnetCommand,
  DeleteVpcCommand,
} from '@aws-sdk/client-ec2';
import { SSMClient, GetParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
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
  ResourceType: 'Custom::AccountWarming',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    ssmPrefix: '/test',
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/account-warming create event account warmed', async () => {
  // when - account warming is true
  ssmMock
    .on(GetParameterCommand, { Name: '/test/account/pre-warmed' })
    .resolves({ Parameter: { Name: '/test/account/pre-warmed', Value: 'true' } });
  const response = await handler(createEvent);
  // then - response isComplete is true
  expect(response?.IsComplete).toBeTruthy();
});

// When
it('@aws-accelerator/constructs/account-warming create event account not warmed pre-existing subnet, vpc, instance', async () => {
  // when - account warming is false
  ssmMock
    .on(GetParameterCommand, { Name: '/test/account/pre-warmed' })
    .resolves({ Parameter: { Name: '/test/account/pre-warmed', Value: 'false' } });
  // when - vpcs found
  ec2Mock
    .on(DescribeVpcsCommand, { Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })
    .resolves({ Vpcs: [{ VpcId: 'vpc-12345678' }] });
  //when - vpc created, get subnet for vpc
  ec2Mock
    .on(DescribeSubnetsCommand, {
      Filters: [{ Name: 'vpc-id', Values: ['vpc-12345678'] }],
    })
    .resolves({ Subnets: [{ SubnetId: 'subnet-123' }] });

  // when - subnet is found get instance
  ec2Mock
    .on(DescribeInstancesCommand, { Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })
    .resolves({ Reservations: [{ Instances: [{ InstanceId: 'i-1234', State: { Code: 10, Name: 'running' } }] }] });

  // when - instance is found
  const response = await handler(createEvent);
  // then - response isComplete is false
  expect(response?.IsComplete).toBeFalsy();
});

// When
it('@aws-accelerator/constructs/account-warming create event account not warmed new subnet, vpc, instance', async () => {
  // when - account warming is false
  ssmMock
    .on(GetParameterCommand, { Name: '/test/account/pre-warmed' })
    .resolves({ Parameter: { Name: '/test/account/pre-warmed', Value: 'false' } });
  // when - no vpcs found
  ec2Mock
    .on(DescribeVpcsCommand, { Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })
    .resolves({ Vpcs: [] });
  // when - no vpcs found, create vpc
  ec2Mock
    .on(CreateVpcCommand, {
      CidrBlock: '10.10.10.0/24',
      TagSpecifications: [{ ResourceType: 'vpc', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
    })
    .resolves({ Vpc: { VpcId: 'vpc-12345678' } });
  //when - vpc created, get subnet for vpc
  ec2Mock
    .on(DescribeSubnetsCommand, {
      Filters: [{ Name: 'vpc-id', Values: ['vpc-12345678'] }],
    })
    .resolves({ Subnets: [] });
  // when - no subnet found, create subnet
  ec2Mock
    .on(CreateSubnetCommand, {
      VpcId: 'vpc-12345678',
      CidrBlock: '10.10.10.0/24',
      TagSpecifications: [{ ResourceType: 'subnet', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
    })
    .resolves({ Subnet: { SubnetId: 'subnet-123' } });
  // when - subnet is found get instance
  ec2Mock
    .on(DescribeInstancesCommand, { Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })
    .resolves({ Reservations: [] });
  // when - no instance is found, create instance
  ssmMock
    .on(GetParameterCommand, { Name: '/aws/service/ami-amazon-linux-latest/amzn2-ami-hvm-x86_64-gp2' })
    .resolves({ Parameter: { Value: 'ami-123' } });
  ec2Mock
    .on(RunInstancesCommand, {
      InstanceType: 't2.micro',
      MaxCount: 1,
      MinCount: 1,
      SubnetId: 'subnet-123',
      ImageId: 'ami-123',
      TagSpecifications: [{ ResourceType: 'instance', Tags: [{ Key: 'Name', Value: 'accelerator-warm' }] }],
    })
    .resolves({ Instances: [{ InstanceId: 'i-1234' }] });

  // when - instance is found
  const response = await handler(createEvent);
  // then - response isComplete is false
  expect(response?.IsComplete).toBeFalsy();
});

// Given
const deleteEvent: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::AccountWarming',
  PhysicalResourceId: 'example-physical-resource-id',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    ssmPrefix: '/test',
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/account-warming delete event', async () => {
  // get instance id to terminate
  // instance is running, shutting down or terminated
  ec2Mock.on(DescribeInstancesCommand, { Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] }).resolves({
    Reservations: [
      {
        Instances: [
          { InstanceId: 'i-1234', State: { Code: 10, Name: 'running' } },
          { InstanceId: 'i-5678', State: { Code: 32, Name: 'shutting-down' } },
          { InstanceId: 'i-9012', State: { Code: 48, Name: 'terminated' } },
        ],
      },
    ],
  });
  ec2Mock.on(TerminateInstancesCommand, { InstanceIds: ['i-1234'] }).resolves({});

  //check instance status and return running, shutting down then terminated
  ec2Mock
    .on(DescribeInstancesCommand, { InstanceIds: ['i-1234'] })
    .resolvesOnce({ Reservations: [{ Instances: [{ InstanceId: 'i-1234', State: { Code: 10, Name: 'running' } }] }] })
    .resolvesOnce({
      Reservations: [{ Instances: [{ InstanceId: 'i-1234', State: { Code: 32, Name: 'shutting-down' } }] }],
    })
    .resolves({
      Reservations: [{ Instances: [{ InstanceId: 'i-1234', State: { Code: 48, Name: 'terminated' } }] }],
    });

  ec2Mock
    .on(DescribeInstancesCommand, { InstanceIds: ['i-5678'] })
    .resolvesOnce({ Reservations: [{ Instances: [{ InstanceId: 'i-5678', State: { Code: 10, Name: 'running' } }] }] })
    .resolvesOnce({
      Reservations: [{ Instances: [{ InstanceId: 'i-5678', State: { Code: 32, Name: 'shutting-down' } }] }],
    })
    .resolves({
      Reservations: [{ Instances: [{ InstanceId: 'i-5678', State: { Code: 48, Name: 'terminated' } }] }],
    });
  // when - vpcs found
  ec2Mock
    .on(DescribeVpcsCommand, { Filters: [{ Name: 'tag:Name', Values: ['accelerator-warm'] }] })
    .resolves({ Vpcs: [{ VpcId: 'vpc-12345678' }] });

  //when - vpc found, get subnet for vpc
  ec2Mock
    .on(DescribeSubnetsCommand, {
      Filters: [{ Name: 'vpc-id', Values: ['vpc-12345678'] }],
    })
    .resolves({ Subnets: [{ SubnetId: 'subnet-123' }] });

  ec2Mock.on(DeleteSubnetCommand, { SubnetId: 'subnet-123' }).resolves({});
  ec2Mock.on(DeleteVpcCommand, { VpcId: 'vpc-12345678' }).resolves({});
  ec2Mock.on(DeleteParameterCommand, { Name: '/test/account/pre-warmed' }).resolves({});

  //then - response isComplete is true
  const response = await handler(deleteEvent);
  expect(response?.IsComplete).toBeTruthy();
});

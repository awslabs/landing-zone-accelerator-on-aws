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

import { CreateRouteCommand, DeleteRouteCommand, EC2Client } from '@aws-sdk/client-ec2';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { afterEach, beforeEach, expect, it } from '@jest/globals';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../lib/aws-ec2/cross-account-route/index';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
} from '../../../lib/lza-custom-resource';

let ec2Mock: AwsClientStub<EC2Client>;
let stsMock: AwsClientStub<STSClient>;

beforeEach(() => {
  ec2Mock = mockClient(EC2Client);
  stsMock = mockClient(STSClient);
  stsMock.on(AssumeRoleCommand).resolves({
    Credentials: {
      AccessKeyId: 'access-key',
      SecretAccessKey: 'secret-key',
      SessionToken: 'session',
      Expiration: new Date(),
    },
  });
});

afterEach(() => {
  ec2Mock.restore();
  stsMock.restore();
});

/**
 * IPv4 tests
 */
// Given
const createIpv4Event: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationCidrBlock: '10.0.0.0/16',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route create IPv4 route event', async () => {
  ec2Mock.on(CreateRouteCommand).resolves({ Return: true });
  const response = await handler(createIpv4Event);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('10.0.0.0/16rtb-1234abc');
});

// Given
const updateIpv4Event: CloudFormationCustomResourceUpdateEvent = {
  RequestType: 'Update',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: '10.0.0.0/16rtb-1234abc',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationCidrBlock: '10.0.1.0/16',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
  OldResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationCidrBlock: '10.0.0.0/16',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route update IPv4 route event', async () => {
  ec2Mock.on(CreateRouteCommand).resolves({ Return: true });
  const response = await handler(updateIpv4Event);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('10.0.1.0/16rtb-1234abc');
});

// Given
const deleteIpv4Event: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: '10.0.1.0/16rtb-1234abc',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationCidrBlock: '10.0.1.0/16',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route delete IPv4 route event', async () => {
  ec2Mock.on(DeleteRouteCommand).resolves({});
  const response = await handler(deleteIpv4Event);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('10.0.1.0/16rtb-1234abc');
});

/**
 * IPv6 tests
 */
// Given
const createIpv6Event: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationIpv6CidrBlock: 'fd00::/8',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route create IPv6 route event', async () => {
  ec2Mock.on(CreateRouteCommand).resolves({ Return: true });
  const response = await handler(createIpv6Event);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('fd00::/8rtb-1234abc');
});

// Given
const updateIpv6Event: CloudFormationCustomResourceUpdateEvent = {
  RequestType: 'Update',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'fd00::/8rtb-1234abc',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationIpv6CidrBlock: 'fd01::/8',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
  OldResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationIpv6CidrBlock: 'fd00::/8rtb-1234abc',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route update IPv6 route event', async () => {
  ec2Mock.on(CreateRouteCommand).resolves({ Return: true });
  const response = await handler(updateIpv6Event);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('fd01::/8rtb-1234abc');
});

// Given
const deleteIpv6Event: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'fd01::/8rtb-1234abc',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationIpv6CidrBlock: 'fd01::/8',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route delete IPv6 route event', async () => {
  ec2Mock.on(DeleteRouteCommand).resolves({});
  const response = await handler(deleteIpv6Event);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('fd01::/8rtb-1234abc');
});

/**
 * Prefix list tests
 */
// Given
const createPlEvent: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationPrefixListId: 'pl-test',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route create prefix list route event', async () => {
  ec2Mock.on(CreateRouteCommand).resolves({ Return: true });
  const response = await handler(createPlEvent);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('pl-testrtb-1234abc');
});

// Given
const updatePlEvent: CloudFormationCustomResourceUpdateEvent = {
  RequestType: 'Update',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'pl-testrtb-1234abc',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationPrefixListId: 'pl-test123',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
  OldResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationPrefixListId: 'pl-test',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route update prefix list route event', async () => {
  ec2Mock.on(CreateRouteCommand).resolves({ Return: true });
  const response = await handler(updatePlEvent);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('pl-test123rtb-1234abc');
});

// Given
const deletePlEvent: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::CrossAccountRoute',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'pl-test123rtb-1234abc',
  ResourceProperties: {
    region: 'us-east-1',
    roleArn: 'test-role-arn',
    routeDefinition: {
      DestinationPrefixListId: 'pl-test123',
      RouteTableId: 'rtb-1234abc',
    },
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/cross-account-route delete prefix list route event', async () => {
  ec2Mock.on(DeleteRouteCommand).resolves({});
  const response = await handler(deletePlEvent);
  // Then
  expect(response?.Status).toEqual('SUCCESS');
  expect(response?.PhysicalResourceId).toEqual('pl-test123rtb-1234abc');
});

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
import { EnablePolicyTypeCommand, ListRootsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { afterEach, beforeEach, expect, it } from '@jest/globals';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../lib/aws-organizations/enable-policy-type/index';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
} from '../../../lib/lza-custom-resource';

let orgsMock: AwsClientStub<OrganizationsClient>;

beforeEach(() => {
  orgsMock = mockClient(OrganizationsClient);
});

afterEach(() => {
  orgsMock.restore();
});

// Given
const createEventScp: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EnablePolicyType',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    partition: 'aws',
    policyType: 'SERVICE_CONTROL_POLICY',
    ServiceToken: 'example-service-token',
  },
};

const createEventTag: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EnablePolicyType',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    partition: 'aws',
    policyType: 'TAG_POLICY',
    ServiceToken: 'example-service-token',
  },
};

const createEventBackup: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EnablePolicyType',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    partition: 'aws',
    policyType: 'BACKUP_POLICY',
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-organizations/enable-policy-type create event -- policies already enabled', async () => {
  orgsMock.on(ListRootsCommand).resolves({
    Roots: [
      {
        Id: 'r-123456',
        Name: 'Root',
        PolicyTypes: [
          { Type: 'SERVICE_CONTROL_POLICY', Status: 'ENABLED' },
          { Type: 'TAG_POLICY', Status: 'ENABLED' },
          { Type: 'BACKUP_POLICY', Status: 'ENABLED' },
        ],
      },
    ],
  });
  const scpResponse = await handler(createEventScp);
  const tagResponse = await handler(createEventTag);
  const backupResponse = await handler(createEventBackup);
  // Then
  expect(scpResponse?.Status).toEqual('SUCCESS');
  expect(scpResponse?.PhysicalResourceId).toEqual('SERVICE_CONTROL_POLICY');
  expect(tagResponse?.Status).toEqual('SUCCESS');
  expect(tagResponse?.PhysicalResourceId).toEqual('TAG_POLICY');
  expect(backupResponse?.Status).toEqual('SUCCESS');
  expect(backupResponse?.PhysicalResourceId).toEqual('BACKUP_POLICY');
});

// When
it('@aws-accelerator/constructs/aws-organizations/enable-policy-type create event -- policies not enabled', async () => {
  orgsMock.on(ListRootsCommand).resolves({
    Roots: [{ Id: 'r-123456', Name: 'Root' }],
  });
  orgsMock.on(EnablePolicyTypeCommand).resolves({
    Root: {
      Id: 'r-123456',
      Name: 'Root',
      PolicyTypes: [
        { Type: 'SERVICE_CONTROL_POLICY', Status: 'ENABLED' },
        { Type: 'TAG_POLICY', Status: 'ENABLED' },
        { Type: 'BACKUP_POLICY', Status: 'ENABLED' },
      ],
    },
  });
  const scpResponse = await handler(createEventScp);
  const tagResponse = await handler(createEventTag);
  const backupResponse = await handler(createEventBackup);
  // Then
  expect(scpResponse?.Status).toEqual('SUCCESS');
  expect(scpResponse?.PhysicalResourceId).toEqual('SERVICE_CONTROL_POLICY');
  expect(tagResponse?.Status).toEqual('SUCCESS');
  expect(tagResponse?.PhysicalResourceId).toEqual('TAG_POLICY');
  expect(backupResponse?.Status).toEqual('SUCCESS');
  expect(backupResponse?.PhysicalResourceId).toEqual('BACKUP_POLICY');
});

// Given
const deleteEventScp: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EnablePolicyType',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'SERVICE_CONTROL_POLICY',
  ResourceProperties: {
    partition: 'aws',
    policyType: 'SERVICE_CONTROL_POLICY',
    ServiceToken: 'example-service-token',
  },
};

const deleteEventTag: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EnablePolicyType',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'TAG_POLICY',
  ResourceProperties: {
    partition: 'aws',
    policyType: 'TAG_POLICY',
    ServiceToken: 'example-service-token',
  },
};

const deleteEventBackup: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EnablePolicyType',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'BACKUP_POLICY',
  ResourceProperties: {
    partition: 'aws',
    policyType: 'BACKUP_POLICY',
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-organizations/enable-policy-type delete event', async () => {
  const scpResponse = await handler(deleteEventScp);
  const tagResponse = await handler(deleteEventTag);
  const backupResponse = await handler(deleteEventBackup);
  // Then
  expect(scpResponse?.Status).toEqual('SUCCESS');
  expect(scpResponse?.PhysicalResourceId).toEqual('SERVICE_CONTROL_POLICY');
  expect(tagResponse?.Status).toEqual('SUCCESS');
  expect(tagResponse?.PhysicalResourceId).toEqual('TAG_POLICY');
  expect(backupResponse?.Status).toEqual('SUCCESS');
  expect(backupResponse?.PhysicalResourceId).toEqual('BACKUP_POLICY');
});

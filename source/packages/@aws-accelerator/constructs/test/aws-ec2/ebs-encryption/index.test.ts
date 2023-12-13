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

import {
  DisableEbsEncryptionByDefaultCommand,
  EC2Client,
  EnableEbsEncryptionByDefaultCommand,
  ModifyEbsDefaultKmsKeyIdCommand,
} from '@aws-sdk/client-ec2';
import { afterEach, beforeEach, expect, it } from '@jest/globals';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import { handler } from '../../../lib/aws-ec2/ebs-default-encryption/index';
import {
  CloudFormationCustomResourceCreateEvent,
  CloudFormationCustomResourceDeleteEvent,
  CloudFormationCustomResourceUpdateEvent,
} from '../../../lib/lza-custom-resource';

let ec2Mock: AwsClientStub<EC2Client>;

beforeEach(() => {
  ec2Mock = mockClient(EC2Client);
});

afterEach(() => {
  ec2Mock.restore();
});

// Given
const createEvent: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EbsDefaultVolumeEncryption',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    kmsKeyId: 'test-kms-key-id',
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/ebs-default-encryption create event', async () => {
  ec2Mock.on(EnableEbsEncryptionByDefaultCommand).resolves({ EbsEncryptionByDefault: true });
  ec2Mock.on(ModifyEbsDefaultKmsKeyIdCommand).resolves({ KmsKeyId: 'test-kms-key-id' });
  const response = await handler(createEvent);
  // Then
  expect(response?.Status).toEqual('Success');
  expect(response?.StatusCode).toEqual(200);
});

// Given
const updateEvent: CloudFormationCustomResourceUpdateEvent = {
  RequestType: 'Update',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EbsDefaultVolumeEncryption',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'example-physical-resource-id',
  ResourceProperties: {
    kmsKeyId: 'test-kms-key-id-2',
    ServiceToken: 'example-service-token',
  },
  OldResourceProperties: {
    kmsKeyId: 'test-kms-key-id',
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/ebs-default-encryption update event', async () => {
  ec2Mock.on(EnableEbsEncryptionByDefaultCommand).resolves({ EbsEncryptionByDefault: true });
  ec2Mock.on(ModifyEbsDefaultKmsKeyIdCommand).resolves({ KmsKeyId: 'test-kms-key-id-2' });
  const response = await handler(updateEvent);
  // Then
  expect(response?.Status).toEqual('Success');
  expect(response?.StatusCode).toEqual(200);
});

// Given
const deleteEvent: CloudFormationCustomResourceDeleteEvent = {
  RequestType: 'Delete',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-create-request-id',
  ResourceType: 'Custom::EbsDefaultVolumeEncryption',
  LogicalResourceId: 'example-logical-resource-id',
  PhysicalResourceId: 'example-physical-resource-id',
  ResourceProperties: {
    kmsKeyId: 'test-kms-key-id-2',
    ServiceToken: 'example-service-token',
  },
};

// When
it('@aws-accelerator/constructs/aws-ec2/ebs-default-encryption delete event', async () => {
  ec2Mock.on(DisableEbsEncryptionByDefaultCommand).resolves({ EbsEncryptionByDefault: false });
  const response = await handler(deleteEvent);
  // Then
  expect(response?.Status).toEqual('Success');
  expect(response?.StatusCode).toEqual(200);
});

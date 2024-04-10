import {
  OrganizationsClient,
  ListPoliciesCommand,
  ListTargetsForPolicyCommand,
  CreatePolicyCommand,
  DuplicatePolicyException,
  DetachPolicyCommand,
  DeletePolicyCommand,
} from '@aws-sdk/client-organizations';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { describe, beforeEach, afterEach, expect, test, jest } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';
import { sdkStreamMixin } from '@smithy/util-stream';
import { Readable } from 'stream';

const orgClient = AcceleratorMockClient(OrganizationsClient);

const s3Client = AcceleratorMockClient(S3Client);

process.env['SOLUTION_ID'] = 'testLza';

describe('Create Event', () => {
  const OLD_ENV = process.env; // cache old env
  beforeEach(() => {
    orgClient.reset();
    s3Client.reset();
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });
  // process env can change between tests so making this afterEach not afterAll
  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });
  test('Create a policy that does not exist', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    s3Client
      .on(GetObjectCommand, { Bucket: StaticInput.newProps.bucket, Key: StaticInput.newProps.key })
      .resolves({ Body: stringToStream(StaticInput.policyContent) });
    orgClient.on(CreatePolicyCommand).resolves({ Policy: { PolicySummary: { Id: 'Id' } } });
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Create a policy that exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    s3Client
      .on(GetObjectCommand, { Bucket: StaticInput.newProps.bucket, Key: StaticInput.newProps.key })
      .resolves({ Body: stringToStream(StaticInput.policyContent) });
    orgClient
      .on(CreatePolicyCommand)
      .rejects(new DuplicatePolicyException({ $metadata: { httpStatusCode: 400 }, message: 'Duplicate policy' }));
    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'Id' }] });
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    orgClient.reset();
    s3Client.reset();
  });

  test('Update a policy that exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });
    s3Client
      .on(GetObjectCommand, { Bucket: StaticInput.newProps.bucket, Key: StaticInput.newProps.key })
      .resolves({ Body: stringToStream(StaticInput.policyContent) });
    orgClient.on(CreatePolicyCommand).rejects({});
    await expect(handler(event)).rejects.toThrowError(
      `Error in creating policy ${StaticInput.newProps.name} in AWS Organizations. Exception: {}`,
    );
  });
});

describe('Delete Event', () => {
  const OLD_ENV = process.env; // cache old env
  beforeEach(() => {
    orgClient.reset();
    s3Client.reset();
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });
  // process env can change between tests so making this afterEach not afterAll
  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });

  test('Delete policy ideally', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'Id' }] });
    orgClient.on(ListTargetsForPolicyCommand, { PolicyId: 'Id' }).resolves({ Targets: [{ TargetId: 'targetId' }] });
    orgClient.on(DetachPolicyCommand, { PolicyId: 'Id', TargetId: 'targetId' }).resolves({});
    orgClient.on(DeletePolicyCommand, { PolicyId: 'Id' }).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Delete policy in homeRegion - policyId not found', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    orgClient.on(ListPoliciesCommand, { Filter: StaticInput.newProps.type }).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
});

function stringToStream(input: string) {
  // create Stream from string
  const stream = new Readable();
  stream.push(input);
  stream.push(null); // end of stream
  // wrap the Stream with SDK mixin
  return sdkStreamMixin(stream);
}

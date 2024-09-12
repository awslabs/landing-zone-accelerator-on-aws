import {
  OrganizationsClient,
  ListPoliciesCommand,
  ListTargetsForPolicyCommand,
  CreatePolicyCommand,
  DuplicatePolicyException,
  DetachPolicyCommand,
  DeletePolicyCommand,
  PolicyNotFoundException,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';
import { sdkStreamMixin } from '@smithy/util-stream';
import { Readable } from 'stream';

const orgClient = AcceleratorMockClient(OrganizationsClient);

const s3Client = AcceleratorMockClient(S3Client);

process.env['SOLUTION_ID'] = 'testLza';
beforeEach(() => {
  orgClient.reset();
  s3Client.reset();
});

/**
 * Resolved sdk stream issue based on
 * https://github.com/m-radzikowski/aws-sdk-client-mock/issues/234#issuecomment-2271857802
 */

describe('Create Event', () => {
  test('Create a policy that does not exist', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    s3Client
      .on(GetObjectCommand, { Bucket: StaticInput.newProps.bucket, Key: StaticInput.newProps.key })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .resolves({ Body: stringToStream(StaticInput.policyContent) as any });
    orgClient.on(CreatePolicyCommand).resolves({ Policy: { PolicySummary: { Id: 'Id' } } });
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Create a policy that exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    s3Client
      .on(GetObjectCommand, { Bucket: StaticInput.newProps.bucket, Key: StaticInput.newProps.key })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .resolves({ Body: stringToStream(StaticInput.policyContent) as any });
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
  test('Update a policy that exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });
    s3Client
      .on(GetObjectCommand, { Bucket: StaticInput.newProps.bucket, Key: StaticInput.newProps.key })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .resolves({ Body: stringToStream(StaticInput.policyContent) as any });
    orgClient.on(CreatePolicyCommand).rejects({});
    await expect(handler(event)).rejects.toThrowError(
      `Error in creating policy ${StaticInput.newProps.name} in AWS Organizations. Exception: {}`,
    );
    orgClient.on(UpdatePolicyCommand).resolves({ Policy: { PolicySummary: { Id: 'Id' } } });
  });
});

describe('Delete Event', () => {
  test('Delete policy ideally', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'PhysicalResourceId' }] });
    orgClient
      .on(ListTargetsForPolicyCommand, { PolicyId: 'PhysicalResourceId' })
      .resolves({ Targets: [{ TargetId: 'targetId' }] });
    orgClient.on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: 'targetId' }).resolves({});
    orgClient.on(DeletePolicyCommand, { PolicyId: 'PhysicalResourceId' }).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Delete policy - policy not found', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'PhysicalResourceId' }] });
    orgClient
      .on(ListTargetsForPolicyCommand, { PolicyId: 'PhysicalResourceId' })
      .resolves({ Targets: [{ TargetId: 'targetId' }] });
    orgClient.on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: 'targetId' }).resolves({});
    orgClient
      .on(DeletePolicyCommand)
      .rejects(new PolicyNotFoundException({ $metadata: { httpStatusCode: 400 }, message: 'Policy not found' }));
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Delete policy - policy is in use', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'PhysicalResourceId' }] });
    orgClient
      .on(ListTargetsForPolicyCommand, { PolicyId: 'PhysicalResourceId' })
      .resolves({ Targets: [{ TargetId: 'targetId' }] });
    orgClient.on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: 'targetId' }).resolves({});
    orgClient.on(DeletePolicyCommand).rejects();
    await expect(handler(event)).rejects.toThrowError(
      `Error while trying to delete policy: PhysicalResourceId. Error message: {}`,
    );
  });
  test('Delete policy in homeRegion - policyId not found', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    orgClient.on(ListPoliciesCommand, { Filter: StaticInput.newProps.type }).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
});

// describe('Delete Event - errors', () => {});

function stringToStream(input: string) {
  // create Stream from string
  const stream = new Readable();
  stream.push(input);
  stream.push(null); // end of stream
  // wrap the Stream with SDK mixin
  return sdkStreamMixin(stream);
}

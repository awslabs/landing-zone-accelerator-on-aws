import {
  OrganizationsClient,
  ListTagsForResourceCommand,
  PolicyNotAttachedException,
  DetachPolicyCommand,
  ListPoliciesForTargetCommand,
  AttachPolicyCommand,
  MalformedPolicyDocumentException,
  DuplicatePolicyAttachmentException,
  PolicyNotFoundException,
  ListPoliciesCommand,
} from '@aws-sdk/client-organizations';

import { describe, beforeEach, afterEach, expect, test, jest } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const orgClient = AcceleratorMockClient(OrganizationsClient);
process.env['SOLUTION_ID'] = 'testLza';

describe('Create Event', () => {
  const OLD_ENV = process.env; // cache old env
  beforeEach(() => {
    orgClient.reset();
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });
  // process env can change between tests so making this afterEach not afterAll
  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });
  test('Attach a policy - no policies', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({});
    orgClient.on(AttachPolicyCommand).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Attach a policy - one policy', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'configPolicy1', Id: StaticInput.attachProps.policyId },
        { Name: 'configPolicy2', Id: 'configPolicyId2' },
        { Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' },
        { Name: 'configPolicy3', Id: 'NoOperation' },
      ],
    });
    orgClient
      .on(ListTagsForResourceCommand)
      .resolves({ Tags: [{ Key: StaticInput.attachProps.policyTagKey, Value: 'Yes' }] });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'configPolicyId2', TargetId: StaticInput.attachProps.targetId })
      .resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Attach a policy - one policy', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({});
    orgClient.on(AttachPolicyCommand).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Attach a policy - one policy already exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({});
    orgClient
      .on(AttachPolicyCommand)
      .rejects(new DuplicatePolicyAttachmentException({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Attach a policy - malformed policy', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({});
    orgClient
      .on(AttachPolicyCommand)
      .rejects(new MalformedPolicyDocumentException({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    await expect(handler(event)).rejects.toThrowError(
      `Error while trying to attach policy: ${StaticInput.attachProps.policyId}. Error message: ${StaticInput.malFormedPolicyException}`,
    );
  });
  test('Attach a policy - one policy already detached', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'configPolicy1', Id: StaticInput.attachProps.policyId },
        { Name: 'configPolicy2', Id: 'configPolicyId2' },
        { Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' },
        { Name: 'configPolicy3', Id: 'NoOperation' },
      ],
    });
    orgClient
      .on(ListTagsForResourceCommand)
      .resolves({ Tags: [{ Key: StaticInput.attachProps.policyTagKey, Value: 'Yes' }] });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'configPolicyId2', TargetId: StaticInput.attachProps.targetId })
      .rejectsOnce(
        new PolicyNotAttachedException({ $metadata: { httpStatusCode: 400 }, message: 'Policy not attached' }),
      );
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Attach a policy - no tags found', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'configPolicy1', Id: StaticInput.attachProps.policyId },
        { Name: 'configPolicy2', Id: 'configPolicyId2' },
        { Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' },
        { Name: 'configPolicy3', Id: 'NoOperation' },
      ],
    });
    orgClient.on(ListTagsForResourceCommand).resolves({});
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'configPolicyId2', TargetId: StaticInput.attachProps.targetId })
      .resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Attach a policy - detached error', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'configPolicy1', Id: StaticInput.attachProps.policyId },
        { Name: 'configPolicy2', Id: 'configPolicyId2' },
        { Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' },
        { Name: 'configPolicy3', Id: 'NoOperation' },
      ],
    });
    orgClient
      .on(ListTagsForResourceCommand)
      .resolves({ Tags: [{ Key: StaticInput.attachProps.policyTagKey, Value: 'Yes' }] });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'configPolicyId2', TargetId: StaticInput.attachProps.targetId })
      .rejectsOnce({});
    await expect(handler(event)).rejects.toThrowError(
      `Error while trying to detach policy: configPolicyId2. Error message: {}`,
    );
  });
});

describe('Update Event', () => {
  const OLD_ENV = process.env; // cache old env
  beforeEach(() => {
    orgClient.reset();
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });
  // process env can change between tests so making this afterEach not afterAll
  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });
  test('Deny-list strategy - attach full aws access', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.denylistProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({});
    orgClient.on(AttachPolicyCommand).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('allow-list strategy - attach full aws access', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.allowlistProps] });
    orgClient
      .on(ListPoliciesForTargetCommand)
      .resolves({ Policies: [{ Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' }] });
    orgClient.on(DetachPolicyCommand).resolves({});
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
});

describe('Delete Event', () => {
  const OLD_ENV = process.env; // cache old env
  beforeEach(() => {
    orgClient.reset();
    jest.resetModules(); // Most important - it clears the cache
    process.env = { ...OLD_ENV }; // Make a copy
  });
  // process env can change between tests so making this afterEach not afterAll
  afterEach(() => {
    process.env = OLD_ENV; // Restore old environment
  });
  test('Delete policy for target', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'configPolicy1', Id: StaticInput.attachProps.policyId },
        { Name: 'configPolicy2', Id: 'configPolicyId2' },
        { Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' },
        { Name: 'configPolicy3', Id: 'NoOperation' },
      ],
    });
    orgClient.on(ListPoliciesCommand).resolves({
      Policies: [{ Name: 'configPolicyId2', Id: StaticInput.attachProps.policyId }],
    });
    orgClient
      .on(ListTagsForResourceCommand)
      .resolves({ Tags: [{ Key: StaticInput.attachProps.policyTagKey, Value: 'Yes' }] });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'configPolicyId2', TargetId: StaticInput.attachProps.targetId })
      .rejectsOnce(
        new PolicyNotAttachedException({ $metadata: { httpStatusCode: 400 }, message: 'Policy not attached' }),
      );
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Delete policy for target - policy not in org', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'configPolicy1', Id: StaticInput.attachProps.policyId },
        { Name: 'configPolicy2', Id: 'configPolicyId2' },
        { Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' },
        { Name: 'configPolicy3', Id: 'NoOperation' },
      ],
    });
    orgClient.on(ListPoliciesCommand).resolves({
      Policies: [],
    });
    orgClient
      .on(ListTagsForResourceCommand)
      .resolves({ Tags: [{ Key: StaticInput.attachProps.policyTagKey, Value: 'Yes' }] });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'configPolicyId2', TargetId: StaticInput.attachProps.targetId })
      .rejectsOnce(new PolicyNotFoundException({ $metadata: { httpStatusCode: 400 }, message: 'Policy not found' }));
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
  test('Delete policy for target - policy not found on detach', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'configPolicy1', Id: StaticInput.attachProps.policyId },
        { Name: 'configPolicy2', Id: 'configPolicyId2' },
        { Name: 'FullAWSAccess', Id: 'p-FullAWSAccess' },
        { Name: 'configPolicy3', Id: 'NoOperation' },
      ],
    });
    orgClient.on(ListPoliciesCommand).resolves({
      Policies: [{ Name: 'configPolicyId2', Id: StaticInput.attachProps.policyId }],
    });
    orgClient
      .on(ListTagsForResourceCommand)
      .resolves({ Tags: [{ Key: StaticInput.attachProps.policyTagKey, Value: 'Yes' }] });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'configPolicyId2', TargetId: StaticInput.attachProps.targetId })
      .rejectsOnce(new PolicyNotFoundException({ $metadata: { httpStatusCode: 400 }, message: 'Policy not found' }));
    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
});

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

import { describe, beforeEach, afterEach, expect, test, vi } from 'vitest';
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
    vi.resetModules(); // Most important - it clears the cache
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
    await expect(handler(event)).rejects.toThrowError(/Error while trying to attach policy: policyId\. Error message:/);
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
    vi.resetModules(); // Most important - it clears the cache
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
    vi.resetModules(); // Most important - it clears the cache
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
  test('Delete operation detaches only one policy', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [
        {
          policyId: 'p-specific123',
          targetId: 'ou-test123',
          type: 'SERVICE_CONTROL_POLICY',
          partition: 'aws',
          policyTagKey: 'LZAManaged',
        },
      ],
    });

    orgClient.on(ListPoliciesCommand).resolves({
      Policies: [{ Name: 'policy1', Id: 'p-specific123' }],
    });

    orgClient.on(ListPoliciesForTargetCommand).resolves({
      Policies: [
        { Name: 'policy1', Id: 'p-specific123' },
        { Name: 'policy2', Id: 'p-other456' },
        { Name: 'policy3', Id: 'p-other789' },
      ],
    });

    orgClient.on(ListTagsForResourceCommand).resolves({
      Tags: [{ Key: 'LZAManaged', Value: 'Yes' }],
    });

    orgClient.on(DetachPolicyCommand).resolves({});

    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');

    // Verify only one policy was detached
    const detachCalls = orgClient.commandCalls(DetachPolicyCommand);
    expect(detachCalls.length).toBe(1);

    const detachedIds = detachCalls.map(call => call.args[0].input.PolicyId);
    expect(detachedIds).toContain('p-specific123');
  });
});

describe('Delete Event - secondary owner stack', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    orgClient.reset();
    process.env = { ...OLD_ENV };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  test('skips detach and makes no Organizations calls when SKIP_ORGANIZATIONS_POLICY_DELETE is true', async () => {
    process.env['SKIP_ORGANIZATIONS_POLICY_DELETE'] = 'true';
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.attachProps] });

    const response = await handler(event);

    expect(response).toStrictEqual({ PhysicalResourceId: 'PhysicalResourceId', Status: 'SUCCESS' });
    expect(orgClient.calls()).toHaveLength(0);
  });

  test.each(['false', 'TRUE', 'yes', ''])(
    'detaches as before when SKIP_ORGANIZATIONS_POLICY_DELETE is %j',
    async value => {
      process.env['SKIP_ORGANIZATIONS_POLICY_DELETE'] = value;
      const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.attachProps] });
      orgClient.on(ListPoliciesCommand).resolves({
        Policies: [{ Name: 'configPolicy1', Id: StaticInput.attachProps.policyId }],
      });
      orgClient.on(DetachPolicyCommand).resolves({});

      const response = await handler(event);

      expect(response?.Status).toStrictEqual('SUCCESS');
      expect(
        orgClient.commandCalls(DetachPolicyCommand, {
          PolicyId: StaticInput.attachProps.policyId,
          TargetId: StaticInput.attachProps.targetId,
        }),
      ).toHaveLength(1);
    },
  );

  test('detaches as before when SKIP_ORGANIZATIONS_POLICY_DELETE is not set', async () => {
    delete process.env['SKIP_ORGANIZATIONS_POLICY_DELETE'];
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.attachProps] });
    orgClient.on(ListPoliciesCommand).resolves({
      Policies: [{ Name: 'configPolicy1', Id: StaticInput.attachProps.policyId }],
    });
    orgClient.on(DetachPolicyCommand).resolves({});

    const response = await handler(event);

    expect(response?.Status).toStrictEqual('SUCCESS');
    expect(orgClient.commandCalls(DetachPolicyCommand)).toHaveLength(1);
  });

  test.each([EventType.CREATE, EventType.UPDATE])(
    'still attaches on %s when SKIP_ORGANIZATIONS_POLICY_DELETE is true',
    async eventType => {
      process.env['SKIP_ORGANIZATIONS_POLICY_DELETE'] = 'true';
      const event = AcceleratorUnitTest.getEvent(eventType, { new: [StaticInput.attachProps] });
      orgClient.on(ListPoliciesForTargetCommand).resolves({});
      orgClient.on(AttachPolicyCommand).resolves({});

      const response = await handler(event);

      expect(response).toStrictEqual({
        PhysicalResourceId: `${StaticInput.attachProps.policyId}_${StaticInput.attachProps.targetId}`,
        Status: 'SUCCESS',
      });
      expect(
        orgClient.commandCalls(AttachPolicyCommand, {
          PolicyId: StaticInput.attachProps.policyId,
          TargetId: StaticInput.attachProps.targetId,
        }),
      ).toHaveLength(1);
    },
  );
});

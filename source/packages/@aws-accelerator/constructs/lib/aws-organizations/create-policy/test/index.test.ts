import {
  OrganizationsClient,
  ListPoliciesCommand,
  ListTargetsForPolicyCommand,
  CreatePolicyCommand,
  DuplicatePolicyException,
  DetachPolicyCommand,
  DeletePolicyCommand,
  AccessDeniedException,
  PolicyNotAttachedException,
  PolicyNotFoundException,
  TargetNotFoundException,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { describe, beforeEach, afterEach, expect, test, vi } from 'vitest';
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

afterEach(() => {
  vi.useRealTimers();
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
    let resolveDetach: (value: object) => void = () => undefined;
    const detachPromise = new Promise<object>(resolve => {
      resolveDetach = resolve;
    });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: 'targetId' })
      .callsFake(() => detachPromise);
    orgClient.on(DeletePolicyCommand, { PolicyId: 'PhysicalResourceId' }).resolves({});
    const responsePromise = handler(event);

    await vi.waitFor(() => expect(orgClient.commandCalls(DetachPolicyCommand)).toHaveLength(1));
    expect(orgClient.commandCalls(DeletePolicyCommand)).toHaveLength(0);

    resolveDetach({});
    const response = await responsePromise;

    expect(response?.Status).toStrictEqual('SUCCESS');
    expect(orgClient.commandCalls(DeletePolicyCommand)).toHaveLength(1);
  });
  test('Delete policy detaches targets in service-specific batches', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    const targetIds = ['target-1', 'target-2', 'target-3', 'target-4', 'target-5'];
    const detachCompletions = new Map<string, () => void>();
    const startedTargetIds: string[] = [];
    let activeDetaches = 0;
    let maximumConcurrentDetaches = 0;

    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'PhysicalResourceId' }] });
    orgClient
      .on(ListTargetsForPolicyCommand, { PolicyId: 'PhysicalResourceId' })
      .resolves({ Targets: targetIds.map(TargetId => ({ TargetId })) });
    orgClient.on(DetachPolicyCommand).callsFake(input => {
      const targetId = input.TargetId;
      if (!targetId) {
        throw new Error('Expected a target ID for DetachPolicy');
      }

      startedTargetIds.push(targetId);
      activeDetaches += 1;
      maximumConcurrentDetaches = Math.max(maximumConcurrentDetaches, activeDetaches);

      return new Promise<object>(resolve => {
        detachCompletions.set(targetId, () => {
          activeDetaches -= 1;
          resolve({});
        });
      });
    });
    orgClient.on(DeletePolicyCommand, { PolicyId: 'PhysicalResourceId' }).resolves({});

    const responsePromise = handler(event);
    await vi.waitFor(() => expect(startedTargetIds).toStrictEqual(['target-1', 'target-2']));
    expect(activeDetaches).toBe(2);

    vi.useFakeTimers();
    detachCompletions.get('target-1')?.();
    detachCompletions.get('target-2')?.();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(999);
    expect(startedTargetIds).toStrictEqual(['target-1', 'target-2']);
    await vi.advanceTimersByTimeAsync(1);
    expect(startedTargetIds).toStrictEqual(['target-1', 'target-2', 'target-3', 'target-4']);
    expect(activeDetaches).toBe(2);

    detachCompletions.get('target-3')?.();
    detachCompletions.get('target-4')?.();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(999);
    expect(startedTargetIds).toStrictEqual(['target-1', 'target-2', 'target-3', 'target-4']);
    await vi.advanceTimersByTimeAsync(1);
    expect(startedTargetIds).toStrictEqual(targetIds);
    expect(activeDetaches).toBe(1);

    detachCompletions.get('target-5')?.();
    const response = await responsePromise;

    expect(response?.Status).toStrictEqual('SUCCESS');
    expect(maximumConcurrentDetaches).toBe(2);
    expect(orgClient.commandCalls(DetachPolicyCommand)).toHaveLength(5);
    expect(orgClient.commandCalls(DeletePolicyCommand)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  test.each([
    {
      exceptionName: 'PolicyNotAttachedException',
      exception: new PolicyNotAttachedException({
        $metadata: { httpStatusCode: 400 },
        message: 'Policy is not attached',
      }),
    },
    {
      exceptionName: 'TargetNotFoundException',
      exception: new TargetNotFoundException({
        $metadata: { httpStatusCode: 400 },
        message: 'Target not found',
      }),
    },
    {
      exceptionName: 'PolicyNotFoundException',
      exception: new PolicyNotFoundException({
        $metadata: { httpStatusCode: 400 },
        message: 'Policy not found',
      }),
    },
  ])('Delete policy treats $exceptionName during detach as idempotent success', async ({ exception }) => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    const targetIds = ['already-detached-target', 'deferred-target', 'next-batch-target'];
    let resolveDeferredDetach: (value: object) => void = () => undefined;
    const deferredDetach = new Promise<object>(resolve => {
      resolveDeferredDetach = resolve;
    });

    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'PhysicalResourceId' }] });
    orgClient
      .on(ListTargetsForPolicyCommand, { PolicyId: 'PhysicalResourceId' })
      .resolves({ Targets: targetIds.map(TargetId => ({ TargetId })) });
    orgClient.on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: targetIds[0] }).rejects(exception);
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: targetIds[1] })
      .callsFake(() => deferredDetach);
    orgClient.on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: targetIds[2] }).resolves({});
    orgClient.on(DeletePolicyCommand, { PolicyId: 'PhysicalResourceId' }).resolves({});

    const responsePromise = handler(event);
    await vi.waitFor(() => expect(orgClient.commandCalls(DetachPolicyCommand)).toHaveLength(2));

    vi.useFakeTimers();
    resolveDeferredDetach({});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1000);
    const response = await responsePromise;

    expect(response?.Status).toStrictEqual('SUCCESS');
    expect(
      orgClient.commandCalls(DetachPolicyCommand, {
        PolicyId: 'PhysicalResourceId',
        TargetId: 'next-batch-target',
      }),
    ).toHaveLength(1);
    expect(orgClient.commandCalls(DeletePolicyCommand)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  test('Delete policy stops later detach batches when a detach fails', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });
    const detachError = new AccessDeniedException({
      $metadata: { httpStatusCode: 400 },
      message: 'Detach denied',
    });

    orgClient
      .on(ListPoliciesCommand, { Filter: StaticInput.newProps.type })
      .resolves({ Policies: [{ Name: StaticInput.newProps.name, Id: 'PhysicalResourceId' }] });
    orgClient.on(ListTargetsForPolicyCommand, { PolicyId: 'PhysicalResourceId' }).resolves({
      Targets: [{ TargetId: 'failed-target' }, { TargetId: 'same-batch-target' }, { TargetId: 'next-batch-target' }],
    });
    orgClient
      .on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: 'failed-target' })
      .rejects(detachError);
    orgClient.on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: 'same-batch-target' }).resolves({});
    orgClient.on(DetachPolicyCommand, { PolicyId: 'PhysicalResourceId', TargetId: 'next-batch-target' }).resolves({});

    await expect(handler(event)).rejects.toThrowError(
      `Policy ${StaticInput.newProps.name} detach error message - ${JSON.stringify(detachError)}`,
    );

    expect(orgClient.commandCalls(DetachPolicyCommand)).toHaveLength(2);
    expect(
      orgClient.commandCalls(DetachPolicyCommand, {
        PolicyId: 'PhysicalResourceId',
        TargetId: 'next-batch-target',
      }),
    ).toHaveLength(0);
    expect(orgClient.commandCalls(DeletePolicyCommand)).toHaveLength(0);
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

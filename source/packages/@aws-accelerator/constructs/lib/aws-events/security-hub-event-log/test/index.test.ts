import {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  ResourceAlreadyExistsException,
  PutResourcePolicyCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { describe, beforeEach, expect, test } from '@jest/globals';

import { generateResourcePolicy, handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';
import { StaticInput } from './static-input';

const logsClient = AcceleratorMockClient(CloudWatchLogsClient);

describe('Create Event, happy path', () => {
  beforeEach(() => {
    logsClient.reset();
  });
  test('Log group with policy created successfully.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    logsClient
      .on(CreateLogGroupCommand, {
        logGroupName: StaticInput.newProps.logGroupName,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const policyDocument = await generateResourcePolicy(StaticInput.newProps.logGroupArn);
    logsClient
      .on(PutResourcePolicyCommand, {
        policyDocument: policyDocument,
        policyName: 'TrustEventsToStoreLogEvent',
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual({ PhysicalResourceId: undefined, Status: 'SUCCESS' });
  });

  test('Create Event, log group already exists.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    logsClient
      .on(CreateLogGroupCommand, {
        logGroupName: StaticInput.newProps.logGroupName,
      })
      .rejects(new ResourceAlreadyExistsException({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));

    const policyDocument = await generateResourcePolicy(StaticInput.newProps.logGroupArn);
    logsClient
      .on(PutResourcePolicyCommand, {
        policyDocument: policyDocument,
        policyName: 'TrustEventsToStoreLogEvent',
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual({ PhysicalResourceId: undefined, Status: 'SUCCESS' });
  });

  test('Create Event, encountered error creating log group.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });

    logsClient
      .on(CreateLogGroupCommand, {
        logGroupName: StaticInput.newProps.logGroupName,
      })
      .rejects();

    await expect(handler(event)).rejects.toThrowError();
  });

  test('Update event, happy path', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });

    logsClient
      .on(CreateLogGroupCommand, {
        logGroupName: StaticInput.newProps.logGroupName,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const policyDocument = await generateResourcePolicy(StaticInput.newProps.logGroupArn);
    logsClient
      .on(PutResourcePolicyCommand, {
        policyDocument: policyDocument,
        policyName: 'TrustEventsToStoreLogEvent',
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual({ PhysicalResourceId: undefined, Status: 'SUCCESS' });
  });

  test('Update Event, error updating resource policy.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.newProps] });

    logsClient
      .on(CreateLogGroupCommand, {
        logGroupName: StaticInput.newProps.logGroupName,
      })
      .rejects(new ResourceAlreadyExistsException({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));

    const policyDocument = await generateResourcePolicy(StaticInput.newProps.logGroupArn);
    logsClient
      .on(PutResourcePolicyCommand, {
        policyDocument: policyDocument,
        policyName: 'TrustEventsToStoreLogEvent',
      })
      .rejects();

    await expect(handler(event)).rejects.toThrowError();
  });

  test('Delete event, happy path', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.newProps] });

    const response = await handler(event);
    expect(response).toStrictEqual({ PhysicalResourceId: 'PhysicalResourceId', Status: 'SUCCESS' });
  });
});

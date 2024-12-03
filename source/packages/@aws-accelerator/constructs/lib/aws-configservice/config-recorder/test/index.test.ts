import { handler } from '../index';
import {
  ConfigServiceClient,
  DescribeConfigurationRecordersCommand,
  DescribeDeliveryChannelStatusCommand,
  PutDeliveryChannelCommand,
  DeleteDeliveryChannelCommand,
  DeleteConfigurationRecorderCommand,
  StopConfigurationRecorderCommand,
  StartConfigurationRecorderCommand,
  PutConfigurationRecorderCommand,
} from '@aws-sdk/client-config-service';

import { describe, beforeEach, expect, test } from '@jest/globals';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';
import { StaticInput } from './static-input';

const client = AcceleratorMockClient(ConfigServiceClient);

describe('Create Event', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Create event without existing resources', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsWithGlobalResources] });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [],
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Create event with existing resources', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsWithGlobalResources] });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [{ name: 'default' }],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Create event existing delivery channel', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsWithGlobalResources] });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [{ name: 'default' }],
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Create event with existing config recorder', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsWithGlobalResources] });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Create event without existing resources and global resources excluded', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newPropsWithoutGlobalResources] });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [],
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Update event with existing resources', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsWithGlobalResources],
      old: [StaticInput.oldPropsWithoutGlobalResources],
    });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [{ name: 'default' }],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Update event config recorder exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsWithGlobalResources],
      old: [StaticInput.oldPropsWithGlobalResources],
    });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Update event config recorder and delivery channel exists, bucket name changes', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsWithGlobalResources],
      old: [StaticInput.oldPropsWithGlobalResourcesOldBucket],
    });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [{ name: 'default' }],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Update event config recorder and delivery channel exists, global resources change to exclude', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsWithoutGlobalResources],
      old: [StaticInput.oldPropsWithGlobalResources],
    });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [{ name: 'default' }],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });

  test('Update event config recorder and delivery channel exists, global resources change to include', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newPropsWithGlobalResources],
      old: [StaticInput.oldPropsWithoutGlobalResources],
    });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [{ name: 'default' }],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(StartConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(PutDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });
});

describe('Delete event', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Delete event both recorder and delivery channel exist', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [StaticInput.newPropsWithGlobalResources],
      old: [StaticInput.oldPropsWithGlobalResources],
    });
    client.on(DescribeConfigurationRecordersCommand).resolves({
      ConfigurationRecorders: [{ name: 'default' }],
    });
    client.on(DescribeDeliveryChannelStatusCommand).resolves({
      DeliveryChannelsStatus: [{ name: 'default' }],
    });
    client.on(StopConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(DeleteConfigurationRecorderCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    client.on(DeleteDeliveryChannelCommand).resolves({
      $metadata: {
        attempts: 1,
        httpStatusCode: 200,
      },
    });
    const result = await handler(event);
    expect(result.Status).toEqual('SUCCESS');
  });
});

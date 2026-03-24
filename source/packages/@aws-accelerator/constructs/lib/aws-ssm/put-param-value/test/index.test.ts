import {
  SSMClient,
  PutParameterCommand,
  DeleteParameterCommand,
  AddTagsToResourceCommand,
  RemoveTagsFromResourceCommand,
  ListTagsForResourceCommand,
} from '@aws-sdk/client-ssm';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { describe, beforeEach, expect, test } from 'vitest';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { StaticInput } from './static-input';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const ssmClient = AcceleratorMockClient(SSMClient);
const stsClient = AcceleratorMockClient(STSClient);

function mockStsAssumeRole() {
  stsClient.on(AssumeRoleCommand).resolves({
    Credentials: {
      AccessKeyId: 'AccessKeyId',
      SecretAccessKey: 'SecretAccessKey',
      SessionToken: 'SessionToken',
      Expiration: new Date(),
    },
  });
}

describe('Create Event', () => {
  beforeEach(() => {
    ssmClient.reset();
    stsClient.reset();
  });
  test('Create event - put parameter value cross account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountProps] });
    ssmClient
      .on(PutParameterCommand, {
        Name: StaticInput.crossAccountProps.parameters[0].name,
        Value: StaticInput.crossAccountProps.parameters[0].value,
        Overwrite: true,
        Type: 'String',
      })
      .resolves({ Version: 1 });
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountProps.parameters[0].name);
  });
  test('Create event - put parameter value same account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.sameAccountProps] });
    ssmClient
      .on(PutParameterCommand, {
        Name: StaticInput.sameAccountProps.parameters[0].name,
        Value: StaticInput.sameAccountProps.parameters[0].value,
        Overwrite: true,
        Type: 'String',
      })
      .resolves({ Version: 1 });
    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.sameAccountProps.parameters[0].name);
  });
  test('Create event - parameter already exists, fetches and cleans stale tags', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountWithTagsProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 2 });
    ssmClient.on(ListTagsForResourceCommand).resolves({
      TagList: [
        { Key: 'Accelerator', Value: 'AWSAccelerator' },
        { Key: 'StaleTag', Value: 'old-value' },
      ],
    });
    ssmClient.on(RemoveTagsFromResourceCommand).resolves({});
    ssmClient.on(AddTagsToResourceCommand).resolves({});
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountWithTagsProps.parameters[0].name);

    // Verify RemoveTagsFromResourceCommand was called to remove stale tag
    const removeCalls = ssmClient.commandCalls(RemoveTagsFromResourceCommand);
    expect(removeCalls.length).toBeGreaterThan(0);
    const removeInput = removeCalls[0].args[0].input;
    expect(removeInput.TagKeys).toContain('StaleTag');

    // Verify AddTagsToResourceCommand was called with new tags
    const addCalls = ssmClient.commandCalls(AddTagsToResourceCommand);
    expect(addCalls.length).toBeGreaterThan(0);
  });
  test('Create event - new parameter with tags, no ListTagsForResource call', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountWithTagsProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    ssmClient.on(AddTagsToResourceCommand).resolves({});
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountWithTagsProps.parameters[0].name);

    // Version 1 means new param — should NOT call ListTagsForResource
    const listTagsCalls = ssmClient.commandCalls(ListTagsForResourceCommand);
    expect(listTagsCalls.length).toBe(0);

    // Should still add tags
    const addCalls = ssmClient.commandCalls(AddTagsToResourceCommand);
    expect(addCalls.length).toBeGreaterThan(0);
  });
  test('Create event - version 2, existing param with matching tags, no tag update needed', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountWithTagsProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 2 });
    ssmClient.on(ListTagsForResourceCommand).resolves({
      TagList: [{ Key: 'Accelerator', Value: 'AWSAccelerator' }],
    });
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountWithTagsProps.parameters[0].name);

    // Version > 1 — should call ListTagsForResource
    const listTagsCalls = ssmClient.commandCalls(ListTagsForResourceCommand);
    expect(listTagsCalls.length).toBe(1);

    // Tags match existing — no add or remove calls needed
    const removeCalls = ssmClient.commandCalls(RemoveTagsFromResourceCommand);
    expect(removeCalls.length).toBe(0);
    const addCalls = ssmClient.commandCalls(AddTagsToResourceCommand);
    expect(addCalls.length).toBe(0);
  });
  test('Create event - version 2, existing param with no tags, adds new tags', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountWithTagsProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 2 });
    ssmClient.on(ListTagsForResourceCommand).resolves({ TagList: [] });
    ssmClient.on(AddTagsToResourceCommand).resolves({});
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountWithTagsProps.parameters[0].name);

    // Version > 1 — should call ListTagsForResource
    const listTagsCalls = ssmClient.commandCalls(ListTagsForResourceCommand);
    expect(listTagsCalls.length).toBe(1);

    // No existing tags, new tags requested — should add
    const addCalls = ssmClient.commandCalls(AddTagsToResourceCommand);
    expect(addCalls.length).toBe(1);
    expect(addCalls[0].args[0].input.Tags).toEqual([{ Key: 'Accelerator', Value: 'AWSAccelerator' }]);
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    ssmClient.reset();
    stsClient.reset();
  });
  test('Update event - cross accounts, accounts added', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountAddUpdateNewProps],
      old: [StaticInput.crossAccountAddUpdateOldProps],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    ssmClient.on(DeleteParameterCommand).resolves({});
    mockStsAssumeRole();
    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountAddUpdateNewProps.parameters[0].name);
  });
  test('Update event - cross accounts, accounts removed', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountRemoveUpdateNewProps],
      old: [StaticInput.crossAccountRemoveUpdateOldProps],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    ssmClient.on(DeleteParameterCommand).resolves({});
    mockStsAssumeRole();
    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountRemoveUpdateNewProps.parameters[0].name);
  });
  test('Update event - tags changed on existing parameter', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountTagUpdateNewProps],
      old: [StaticInput.crossAccountTagUpdateOldProps],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 2 });
    ssmClient.on(RemoveTagsFromResourceCommand).resolves({});
    ssmClient.on(AddTagsToResourceCommand).resolves({});
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountTagUpdateNewProps.parameters[0].name);

    // Verify tags were updated
    const addCalls = ssmClient.commandCalls(AddTagsToResourceCommand);
    expect(addCalls.length).toBeGreaterThan(0);
  });
});

describe('Delete Event', () => {
  beforeEach(() => {
    ssmClient.reset();
    stsClient.reset();
  });
  test('Delete event - put parameter value cross account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.crossAccountProps] });
    ssmClient.on(DeleteParameterCommand, { Name: StaticInput.crossAccountProps.parameters[0].name }).resolves({});
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountProps.parameters[0].name);
  });
});

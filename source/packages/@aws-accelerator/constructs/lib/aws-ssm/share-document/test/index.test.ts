import { SSMClient, DescribeDocumentPermissionCommand, ModifyDocumentPermissionCommand } from '@aws-sdk/client-ssm';
import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { StaticInput } from './static-input';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const ssmClient = AcceleratorMockClient(SSMClient);

describe('Create Event', () => {
  beforeEach(() => {
    ssmClient.reset();
  });
  test('Create event - put parameter value cross account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.createProps] });
    ssmClient.on(DescribeDocumentPermissionCommand).resolves({});
    ssmClient
      .on(ModifyDocumentPermissionCommand, {
        Name: 'name',
        PermissionType: 'Share',
        AccountIdsToAdd: ['acc000'],
        AccountIdsToRemove: undefined,
      })
      .resolves({});
    const response = await handler(event);
    expect(response?.PhysicalResourceId).toEqual('share-document');
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    ssmClient.reset();
  });
  test('Update event - document already exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.updatePropsNew],
      old: [StaticInput.createProps],
    });
    ssmClient.on(DescribeDocumentPermissionCommand).resolves({
      AccountIds: StaticInput.manyAccounts,
    });

    ssmClient.on(ModifyDocumentPermissionCommand).resolves({});

    const response = await handler(event);
    expect(response?.PhysicalResourceId).toEqual('share-document');
  });
});

describe('Delete Event', () => {
  beforeEach(() => {
    ssmClient.reset();
  });
  test('Delete event - put parameter value cross account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.updatePropsNew] });
    ssmClient.on(DescribeDocumentPermissionCommand).resolves({
      AccountIds: StaticInput.manyAccounts,
    });
    ssmClient.on(ModifyDocumentPermissionCommand).resolves({});

    const response = await handler(event);
    expect(response?.Status).toEqual('SUCCESS');
  });
});

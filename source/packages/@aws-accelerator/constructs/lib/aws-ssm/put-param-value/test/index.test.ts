import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
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

  test('Create event - cross account uses PutParameter with Overwrite', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountProps.parameters[0].name);

    const putCalls = ssmClient.commandCalls(PutParameterCommand);
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input.Overwrite).toBe(true);
    expect(putCalls[0].args[0].input.Name).toBe(StaticInput.crossAccountProps.parameters[0].name);
  });

  test('Create event - same account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.sameAccountProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.sameAccountProps.parameters[0].name);
    expect(stsClient.commandCalls(AssumeRoleCommand).length).toBe(0);
  });

  test('Create event - with tags still uses Overwrite, no tagging APIs called', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountWithTagsProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountWithTagsProps.parameters[0].name);

    const putCalls = ssmClient.commandCalls(PutParameterCommand);
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input.Overwrite).toBe(true);
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    ssmClient.reset();
    stsClient.reset();
  });

  test('Update event - accounts added, creates params in new accounts', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountAddUpdateNewProps],
      old: [StaticInput.crossAccountAddUpdateOldProps],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual('PhysicalResourceId');
  });

  test('Update event - accounts removed, deletes params from old accounts', async () => {
    const oldProps = {
      parameterAccountIds: ['acc000', 'acc001'],
      invokingAccountId: 'acc002',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [{ name: 'name1', value: 'value1' }],
    };
    const newProps = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc002',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [{ name: 'name1', value: 'value1' }],
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [newProps],
      old: [oldProps],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    ssmClient.on(DeleteParameterCommand).resolves({});
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual('PhysicalResourceId');

    // acc001 was removed -- its params should be deleted
    const deleteCalls = ssmClient.commandCalls(DeleteParameterCommand);
    expect(deleteCalls.length).toBe(1);
  });

  test('Update event - value changed, overwrites parameter', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountTagUpdateNewProps],
      old: [StaticInput.crossAccountTagUpdateOldProps],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 2 });
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual('PhysicalResourceId');
  });

  test('Update event - no value change, no PutParameter call for modify', async () => {
    const props = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc001',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [{ name: 'name1', value: 'same-value' }],
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [props],
      old: [props],
    });
    mockStsAssumeRole();

    await handler(event);

    // No value change, no new/removed params -- no PutParameter or DeleteParameter calls
    expect(ssmClient.commandCalls(PutParameterCommand).length).toBe(0);
    expect(ssmClient.commandCalls(DeleteParameterCommand).length).toBe(0);
  });

  test('Update event - removed params are deleted', async () => {
    const oldProps = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc001',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [
        { name: 'vpc-id', value: 'vpc-123' },
        { name: 'subnet-id', value: 'subnet-456' },
      ],
    };
    const newProps = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc001',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [{ name: 'subnet-id', value: 'subnet-456' }],
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [newProps],
      old: [oldProps],
    });
    ssmClient.on(DeleteParameterCommand).resolves({});
    mockStsAssumeRole();

    await handler(event);

    // vpc-id was removed from the list and should be deleted
    const deleteCalls = ssmClient.commandCalls(DeleteParameterCommand);
    expect(deleteCalls.length).toBe(1);
    expect(deleteCalls[0].args[0].input.Name).toBe('vpc-id');
  });

  test('Update event - preserves PhysicalResourceId on update', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountAddUpdateNewProps],
      old: [StaticInput.crossAccountAddUpdateOldProps],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    const result = await handler(event);
    // Should return the existing PhysicalResourceId, not parameters[0].name
    expect(result?.PhysicalResourceId).toEqual('PhysicalResourceId');
  });
});

describe('Delete Event', () => {
  beforeEach(() => {
    ssmClient.reset();
    stsClient.reset();
  });

  test('Delete event - cross account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.crossAccountProps] });
    ssmClient.on(DeleteParameterCommand).resolves({});
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual('PhysicalResourceId');

    const deleteCalls = ssmClient.commandCalls(DeleteParameterCommand);
    expect(deleteCalls.length).toBe(1);
  });

  test('Delete event - parameter not found is handled gracefully', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.crossAccountProps] });
    ssmClient.on(DeleteParameterCommand).rejects({ name: 'ParameterNotFound' });
    mockStsAssumeRole();

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual('PhysicalResourceId');
  });
});

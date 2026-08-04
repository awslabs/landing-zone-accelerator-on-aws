import { SSMClient, PutParameterCommand, DeleteParameterCommand, GetParametersCommand } from '@aws-sdk/client-ssm';
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

  test('Create event - does not read existing parameters', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountProps] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    await handler(event);

    // On create the parameters are known not to exist, so reconciling against live state would only
    // add wasted calls
    expect(ssmClient.commandCalls(GetParametersCommand).length).toBe(0);
    expect(ssmClient.commandCalls(PutParameterCommand).length).toBe(1);
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    ssmClient.reset();
    stsClient.reset();
    // Default to an empty target account so parameters are treated as missing unless a test says
    // otherwise
    ssmClient.on(GetParametersCommand).resolves({ Parameters: [] });
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

  test('Update event - parameters already correct in the target account are not rewritten', async () => {
    const props = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc001',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [
        { name: 'vpc-id', value: 'vpc-123' },
        { name: 'subnet-id', value: 'subnet-456' },
      ],
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [props],
      old: [props],
    });
    // The target account already holds both parameters with the configured values
    ssmClient.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: 'vpc-id', Value: 'vpc-123' },
        { Name: 'subnet-id', Value: 'subnet-456' },
      ],
    });
    mockStsAssumeRole();

    await handler(event);

    // Nothing to reconcile, so no writes and therefore no parameter version churn
    expect(ssmClient.commandCalls(PutParameterCommand).length).toBe(0);
    expect(ssmClient.commandCalls(DeleteParameterCommand).length).toBe(0);
  });

  test('Update event - a parameter missing from the target account is recreated', async () => {
    const props = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc001',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [
        { name: 'vpc-id', value: 'vpc-123' },
        { name: 'subnet-id', value: 'subnet-456' },
      ],
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [props],
      old: [props],
    });
    // vpc-id was deleted from the target account; GetParameters omits names that do not exist
    ssmClient.on(GetParametersCommand).resolves({
      Parameters: [{ Name: 'subnet-id', Value: 'subnet-456' }],
      InvalidParameters: ['vpc-id'],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    await handler(event);

    // The old resource properties are identical to the new ones, so a diff-based implementation
    // would write nothing here and leave the share target account permanently broken
    const putCalls = ssmClient.commandCalls(PutParameterCommand);
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input.Name).toBe('vpc-id');
    expect(putCalls[0].args[0].input.Overwrite).toBe(true);
  });

  test('Update event - a stale value in the target account is corrected', async () => {
    const props = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc001',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [{ name: 'vpc-id', value: 'vpc-new' }],
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [props],
      old: [props],
    });
    ssmClient.on(GetParametersCommand).resolves({ Parameters: [{ Name: 'vpc-id', Value: 'vpc-stale' }] });
    ssmClient.on(PutParameterCommand).resolves({ Version: 2 });
    mockStsAssumeRole();

    await handler(event);

    const putCalls = ssmClient.commandCalls(PutParameterCommand);
    expect(putCalls.length).toBe(1);
    expect(putCalls[0].args[0].input.Value).toBe('vpc-new');
  });

  test('Update event - reconciles every existing target account independently', async () => {
    const props = {
      parameterAccountIds: ['acc000', 'acc001'],
      invokingAccountId: 'acc002',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [{ name: 'vpc-id', value: 'vpc-123' }],
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [props],
      old: [props],
    });
    // Missing in both accounts (default GetParameters mock returns nothing)
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    await handler(event);

    expect(ssmClient.commandCalls(GetParametersCommand).length).toBe(2);
    expect(ssmClient.commandCalls(PutParameterCommand).length).toBe(2);
  });

  test('Update event - reads parameters in batches of ten', async () => {
    const parameters = Array.from({ length: 25 }, (_, index) => ({
      name: `param${index}`,
      value: `value${index}`,
    }));
    const props = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc001',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters,
    };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [props],
      old: [props],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    await handler(event);

    // GetParameters accepts at most 10 names per call, so 25 parameters need 3 calls
    const getCalls = ssmClient.commandCalls(GetParametersCommand);
    expect(getCalls.length).toBe(3);
    expect(getCalls.map(call => call.args[0].input.Names?.length)).toEqual([10, 10, 5]);
  });

  test('Update event - a newly added target account receives all parameters without a read', async () => {
    const oldProps = {
      parameterAccountIds: ['acc000'],
      invokingAccountId: 'acc002',
      roleName: 'roleName',
      region: 'us-east-1',
      parameters: [
        { name: 'vpc-id', value: 'vpc-123' },
        { name: 'subnet-id', value: 'subnet-456' },
      ],
    };
    const newProps = { ...oldProps, parameterAccountIds: ['acc000', 'acc001'] };
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [newProps],
      old: [oldProps],
    });
    // acc000 already holds both parameters, acc001 is brand new
    ssmClient.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: 'vpc-id', Value: 'vpc-123' },
        { Name: 'subnet-id', Value: 'subnet-456' },
      ],
    });
    ssmClient.on(PutParameterCommand).resolves({ Version: 1 });
    mockStsAssumeRole();

    await handler(event);

    // Both parameters are written for the added account, and the existing account is only read
    const putCalls = ssmClient.commandCalls(PutParameterCommand);
    expect(putCalls.length).toBe(2);
    expect(putCalls.map(call => call.args[0].input.Name)).toEqual(['vpc-id', 'subnet-id']);
    expect(ssmClient.commandCalls(GetParametersCommand).length).toBe(1);
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

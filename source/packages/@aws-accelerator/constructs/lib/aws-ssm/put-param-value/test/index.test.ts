import { SSMClient, PutParameterCommand, DeleteParameterCommand } from '@aws-sdk/client-ssm';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { StaticInput } from './static-input';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const ssmClient = AcceleratorMockClient(SSMClient);
const stsClient = AcceleratorMockClient(STSClient);

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
      .resolves({});
    stsClient.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'AccessKeyId',
        SecretAccessKey: 'SecretAccessKey',
        SessionToken: 'SessionToken',
        Expiration: new Date(),
      },
    });

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
      .resolves({});
    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.sameAccountProps.parameters[0].name);
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
    ssmClient.on(PutParameterCommand, {
      Name: StaticInput.crossAccountAddUpdateNewProps.parameters[0].name,
      Value: StaticInput.crossAccountAddUpdateNewProps.parameters[0].value,
      Overwrite: true,
      Type: 'String',
    });
    ssmClient
      .on(DeleteParameterCommand, { Name: StaticInput.crossAccountAddUpdateOldProps.parameters[0].name })
      .resolves({});
    // since there are 10 assume roles happening here mocking the entire call to return success
    stsClient.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'AccessKeyId',
        SecretAccessKey: 'SecretAccessKey',
        SessionToken: 'SessionToken',
        Expiration: new Date(),
      },
    });
    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountAddUpdateNewProps.parameters[0].name);
  });
  test('Update event - cross accounts, accounts removed', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountRemoveUpdateNewProps],
      old: [StaticInput.crossAccountRemoveUpdateOldProps],
    });
    ssmClient.on(PutParameterCommand, {
      Name: StaticInput.crossAccountRemoveUpdateNewProps.parameters[0].name,
      Value: StaticInput.crossAccountRemoveUpdateNewProps.parameters[0].value,
      Overwrite: true,
      Type: 'String',
    });
    ssmClient.on(DeleteParameterCommand).resolves({});
    // since there are 10 assume roles happening here mocking the entire call to return success
    stsClient.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'AccessKeyId',
        SecretAccessKey: 'SecretAccessKey',
        SessionToken: 'SessionToken',
        Expiration: new Date(),
      },
    });
    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountRemoveUpdateNewProps.parameters[0].name);
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
    stsClient.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'AccessKeyId',
        SecretAccessKey: 'SecretAccessKey',
        SessionToken: 'SessionToken',
        Expiration: new Date(),
      },
    });

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountProps.parameters[0].name);
  });
});

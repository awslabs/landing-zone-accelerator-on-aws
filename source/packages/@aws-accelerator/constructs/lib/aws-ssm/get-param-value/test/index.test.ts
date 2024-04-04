import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
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
  test('Create event - return parameter successfully', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountProps] });
    ssmClient.on(GetParameterCommand, { Name: StaticInput.crossAccountProps.parameterName }).resolves({
      Parameter: {
        Value: StaticInput.crossAccountProps.parameterName,
      },
    });
    stsClient
      .on(AssumeRoleCommand, {
        RoleArn: StaticInput.crossAccountProps.assumeRoleArn,
        RoleSessionName: 'AcceleratorAssumeRole',
      })
      .resolves({
        Credentials: {
          AccessKeyId: 'AccessKeyId',
          SecretAccessKey: 'SecretAccessKey',
          SessionToken: 'SessionToken',
          Expiration: new Date(),
        },
      });

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountProps.parameterName);
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    ssmClient.reset();
  });
  test('Update event - return parameter successfully', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [StaticInput.sameAccountProps] });
    ssmClient.on(GetParameterCommand, { Name: StaticInput.crossAccountProps.parameterName }).resolves({
      Parameter: {
        Value: StaticInput.crossAccountProps.parameterName,
      },
    });

    const result = await handler(event);
    expect(result?.PhysicalResourceId).toEqual(StaticInput.crossAccountProps.parameterName);
  });
});

describe('Delete Event', () => {
  test('Delete event - run successfully', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.crossAccountProps] });
    const result = await handler(event);
    expect(result?.PhysicalResourceId).toBeUndefined();
    expect(result?.Status).toBe('SUCCESS');
  });
});

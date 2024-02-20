import {
  AssociateKmsKeyCommand,
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DescribeLogGroupsCommand,
  DeleteLogGroupCommand,
  PutRetentionPolicyCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

import { CloudFormationCustomResourceDeleteEvent } from '@aws-accelerator/utils/lib/common-types';

const client = AcceleratorMockClient(CloudWatchLogsClient);

const stsClient = AcceleratorMockClient(STSClient);

describe('Create Event', () => {
  beforeEach(() => {
    client.reset();
  });
  test('Log group with encryption created successfully.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.newProps] });
    client.on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.newProps.logGroupName }).resolves({
      logGroups: undefined,
    });

    client
      .on(CreateLogGroupCommand, {
        kmsKeyId: StaticInput.newProps.keyArn,
        logGroupName: StaticInput.newProps.logGroupName,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    client
      .on(PutRetentionPolicyCommand, {
        logGroupName: StaticInput.newProps.logGroupName,
        retentionInDays: Number(StaticInput.newProps.retention),
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.createUpdateResponse);
  });

  test('Cross Account -> Log group with encryption created successfully.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountNewProps] });

    stsClient
      .on(AssumeRoleCommand, { RoleArn: StaticInput.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' })
      .resolves({
        Credentials: {
          AccessKeyId: StaticInput.assumeRoleCredential.AccessKeyId,
          SecretAccessKey: StaticInput.assumeRoleCredential.SecretAccessKey,
          SessionToken: StaticInput.assumeRoleCredential.SecretAccessKey,
          Expiration: undefined,
        },
      });

    client
      .on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.crossAccountNewProps.logGroupName })
      .resolves({
        logGroups: undefined,
      });

    client
      .on(CreateLogGroupCommand, {
        kmsKeyId: StaticInput.crossAccountNewProps.keyArn,
        logGroupName: StaticInput.crossAccountNewProps.logGroupName,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    client
      .on(PutRetentionPolicyCommand, {
        logGroupName: StaticInput.crossAccountNewProps.logGroupName,
        retentionInDays: Number(StaticInput.crossAccountNewProps.retention),
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.crossAccountCreateUpdateResponse);
  });

  test('Cross Account -> Missing owner region, Log group with encryption created successfully.', async () => {
    const localNewProps = {
      logGroupName: StaticInput.crossAccountNewProps.logGroupName,
      retention: StaticInput.crossAccountNewProps.retention,
      terminationProtected: StaticInput.crossAccountNewProps.terminationProtected,
      keyArn: StaticInput.crossAccountNewProps.keyArn,
      owningAccountId: StaticInput.crossAccountNewProps.owningAccountId,
      owningRegion: undefined,
      roleName: StaticInput.crossAccountNewProps.roleName,
    };

    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [localNewProps] });

    stsClient
      .on(AssumeRoleCommand, { RoleArn: StaticInput.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' })
      .resolves({
        Credentials: {
          AccessKeyId: StaticInput.assumeRoleCredential.AccessKeyId,
          SecretAccessKey: StaticInput.assumeRoleCredential.SecretAccessKey,
          SessionToken: StaticInput.assumeRoleCredential.SecretAccessKey,
          Expiration: undefined,
        },
      });

    client.on(DescribeLogGroupsCommand, { logGroupNamePrefix: localNewProps.logGroupName }).resolves({
      logGroups: undefined,
    });

    client
      .on(CreateLogGroupCommand, {
        kmsKeyId: localNewProps.keyArn,
        logGroupName: localNewProps.logGroupName,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    client
      .on(PutRetentionPolicyCommand, {
        logGroupName: localNewProps.logGroupName,
        retentionInDays: Number(localNewProps.retention),
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.crossAccountCreateUpdateResponse);
  });

  test('Cross Account -> Failure role name not provided.', async () => {
    const localNewProps = {
      logGroupName: StaticInput.crossAccountNewProps.logGroupName,
      retention: StaticInput.crossAccountNewProps.retention,
      terminationProtected: StaticInput.crossAccountNewProps.terminationProtected,
      keyArn: StaticInput.crossAccountNewProps.keyArn,
      owningAccountId: StaticInput.crossAccountNewProps.owningAccountId,
      owningRegion: StaticInput.crossAccountNewProps.owningRegion,
    };

    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [localNewProps] });

    stsClient
      .on(AssumeRoleCommand, { RoleArn: StaticInput.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' })
      .resolves({
        Credentials: {
          AccessKeyId: StaticInput.assumeRoleCredential.AccessKeyId,
          SecretAccessKey: StaticInput.assumeRoleCredential.SecretAccessKey,
          SessionToken: StaticInput.assumeRoleCredential.SecretAccessKey,
          Expiration: undefined,
        },
      });

    await expect(handler(event)).rejects.toThrow(StaticInput.crossAccountMissingOptionError);
  });

  test('Cross Account -> Failure AssumeRole missing AccessKey.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountNewProps] });

    stsClient
      .on(AssumeRoleCommand, { RoleArn: StaticInput.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' })
      .resolves({
        Credentials: {
          AccessKeyId: undefined,
          SecretAccessKey: StaticInput.assumeRoleCredential.SecretAccessKey,
          SessionToken: StaticInput.assumeRoleCredential.SecretAccessKey,
          Expiration: undefined,
        },
      });

    await expect(handler(event)).rejects.toThrow(StaticInput.missingAccessKeyError);
  });

  test('Cross Account -> Failure AssumeRole missing SecretAccessKey.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountNewProps] });

    stsClient
      .on(AssumeRoleCommand, { RoleArn: StaticInput.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' })
      .resolves({
        Credentials: {
          AccessKeyId: StaticInput.assumeRoleCredential.AccessKeyId,
          SecretAccessKey: undefined,
          SessionToken: StaticInput.assumeRoleCredential.SecretAccessKey,
          Expiration: undefined,
        },
      });

    await expect(handler(event)).rejects.toThrow(StaticInput.missingSecretAccessKeyError);
  });

  test('Cross Account -> Failure AssumeRole missing SessionToken.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.crossAccountNewProps] });

    stsClient
      .on(AssumeRoleCommand, { RoleArn: StaticInput.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' })
      .resolves({
        Credentials: {
          AccessKeyId: StaticInput.assumeRoleCredential.AccessKeyId,
          SecretAccessKey: StaticInput.assumeRoleCredential.SecretAccessKey,
          SessionToken: undefined,
          Expiration: undefined,
        },
      });

    await expect(handler(event)).rejects.toThrow(StaticInput.missingSessionTokenError);
  });

  test('Cross Account -> Failure owning region and role name not provided.', async () => {
    const localNewProps = {
      logGroupName: StaticInput.crossAccountNewProps.logGroupName,
      retention: StaticInput.crossAccountNewProps.retention,
      terminationProtected: StaticInput.crossAccountNewProps.terminationProtected,
      keyArn: StaticInput.crossAccountNewProps.keyArn,
      owningAccountId: StaticInput.crossAccountNewProps.owningAccountId,
    };

    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [localNewProps] });

    stsClient
      .on(AssumeRoleCommand, { RoleArn: StaticInput.assumeRoleArn, RoleSessionName: 'AcceleratorAssumeRole' })
      .resolves({
        Credentials: {
          AccessKeyId: StaticInput.assumeRoleCredential.AccessKeyId,
          SecretAccessKey: StaticInput.assumeRoleCredential.SecretAccessKey,
          SessionToken: StaticInput.assumeRoleCredential.SecretAccessKey,
          Expiration: undefined,
        },
      });

    await expect(handler(event)).rejects.toThrow(StaticInput.crossAccountMissingOptionError);
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Add encryption.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newProps],
      old: [StaticInput.oldProps],
    });
    client.on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.newProps.logGroupName }).resolves({
      logGroups: [{ logGroupName: StaticInput.newProps.logGroupName, kmsKeyId: undefined }],
    });

    client
      .on(AssociateKmsKeyCommand, {
        logGroupName: StaticInput.oldProps.logGroupName,
        kmsKeyId: StaticInput.newProps.keyArn,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.createUpdateResponse);
  });

  test('Replace encryption.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.newProps],
      old: [StaticInput.oldProps],
    });
    client.on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.newProps.logGroupName }).resolves({
      logGroups: [
        {
          logGroupName: StaticInput.oldProps.logGroupName,
          kmsKeyId: StaticInput.oldProps.keyArn,
        },
      ],
    });

    client
      .on(AssociateKmsKeyCommand, {
        logGroupName: StaticInput.newProps.logGroupName,
        kmsKeyId: StaticInput.newProps.keyArn,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.createUpdateResponse);
  });

  test('Cross Account -> Add encryption.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountNewProps],
      old: [StaticInput.crossAccountOldProps],
    });
    client
      .on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.crossAccountNewProps.logGroupName })
      .resolves({
        logGroups: [{ logGroupName: StaticInput.crossAccountNewProps.logGroupName, kmsKeyId: undefined }],
      });

    client
      .on(AssociateKmsKeyCommand, {
        logGroupName: StaticInput.crossAccountOldProps.logGroupName,
        kmsKeyId: undefined,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.crossAccountCreateUpdateResponse);
  });

  test('Cross Account -> Replace encryption', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.crossAccountNewProps],
      old: [StaticInput.crossAccountOldProps],
    });
    client
      .on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.crossAccountNewProps.logGroupName })
      .resolves({
        logGroups: [
          {
            logGroupName: StaticInput.crossAccountOldProps.logGroupName,
            kmsKeyId: StaticInput.crossAccountOldProps.keyArn,
          },
        ],
      });

    client
      .on(AssociateKmsKeyCommand, {
        logGroupName: StaticInput.crossAccountNewProps.logGroupName,
        kmsKeyId: StaticInput.crossAccountNewProps.keyArn,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.crossAccountCreateUpdateResponse);
  });
});

describe('Delete Event', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Termination protected no deletion.', async () => {
    let event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [StaticInput.newProps],
    });

    // Typecast to Delete Event to access PhysicalResourceId property
    event = event as CloudFormationCustomResourceDeleteEvent;

    client.on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.newProps.logGroupName }).resolves({
      logGroups: [
        {
          logGroupName: StaticInput.newProps.logGroupName,
          kmsKeyId: StaticInput.newProps.keyArn,
        },
      ],
    });

    const response = await handler(event);
    expect(response).toStrictEqual({
      PhysicalResourceId: event.PhysicalResourceId,
      Status: 'SUCCESS',
    });
  });

  test('Log group deleted successfully.', async () => {
    const localNewProps = {
      logGroupName: StaticInput.newProps.logGroupName,
      retention: StaticInput.newProps.retention,
      terminationProtected: 'false',
      keyArn: StaticInput.newProps.keyArn,
    };

    let event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [localNewProps],
    });

    // Typecast to Delete Event to access PhysicalResourceId property
    event = event as CloudFormationCustomResourceDeleteEvent;

    client.on(DescribeLogGroupsCommand, { logGroupNamePrefix: localNewProps.logGroupName }).resolves({
      logGroups: [
        {
          logGroupName: localNewProps.logGroupName,
          kmsKeyId: localNewProps.keyArn,
        },
      ],
    });

    client
      .on(DeleteLogGroupCommand, {
        logGroupName: localNewProps.logGroupName,
      })
      .resolves({
        $metadata: { httpStatusCode: 200 },
      });

    const response = await handler(event);
    expect(response).toStrictEqual({
      PhysicalResourceId: event.PhysicalResourceId,
      Status: 'SUCCESS',
    });
  });

  test('Cross Account -> Termination protected no deletion.', async () => {
    let event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [StaticInput.crossAccountNewProps],
    });

    // Typecast to Delete Event to access PhysicalResourceId property
    event = event as CloudFormationCustomResourceDeleteEvent;

    client
      .on(DescribeLogGroupsCommand, { logGroupNamePrefix: StaticInput.crossAccountNewProps.logGroupName })
      .resolves({
        logGroups: [
          {
            logGroupName: StaticInput.crossAccountNewProps.logGroupName,
            kmsKeyId: StaticInput.crossAccountNewProps.keyArn,
          },
        ],
      });

    const response = await handler(event);
    expect(response).toStrictEqual({
      PhysicalResourceId: event.PhysicalResourceId,
      Status: 'SUCCESS',
    });
  });
});

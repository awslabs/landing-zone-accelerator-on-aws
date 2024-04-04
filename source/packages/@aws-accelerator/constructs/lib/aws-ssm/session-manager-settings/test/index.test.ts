import {
  SSMClient,
  DescribeDocumentCommand,
  UpdateDocumentCommand,
  CreateDocumentCommand,
  DuplicateDocumentContent,
  InvalidDocument,
  MaxDocumentSizeExceeded,
} from '@aws-sdk/client-ssm';
import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { StaticInput } from './static-input';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const ssmClient = AcceleratorMockClient(SSMClient);
const documentName = 'SSM-SessionManagerRunShell';
describe('Create Event', () => {
  beforeEach(() => {
    ssmClient.reset();
  });
  test('Create event - put parameter value cross account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.createProps] });
    ssmClient.on(DescribeDocumentCommand, { Name: documentName }).resolves({});
    ssmClient
      .on(UpdateDocumentCommand, {
        Content: JSON.stringify(StaticInput.createPropsSetting),
        Name: documentName,
        DocumentVersion: '$LATEST',
      })
      .resolves({});
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
  });
});

describe('Update Event', () => {
  beforeEach(() => {
    ssmClient.reset();
  });
  test('Update event - document already exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.createProps],
    });
    ssmClient
      .on(DescribeDocumentCommand, { Name: documentName })
      .rejects(new DuplicateDocumentContent({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
  });
  test('Update event - unknown error MaxDocumentSizeExceeded', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.createProps],
    });
    ssmClient
      .on(DescribeDocumentCommand, { Name: documentName })
      .rejects(new MaxDocumentSizeExceeded({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    await expect(handler(event)).rejects.toThrowError(
      'Error while updating SSM Document :SSM-SessionManagerRunShell. Received: {"name":"MaxDocumentSizeExceeded","$fault":"client","$metadata":{"httpStatusCode":400}}',
    );
  });
  test('Update event - create document on InvalidDocument exception', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.updateProps],
    });
    ssmClient
      .on(DescribeDocumentCommand, { Name: documentName })
      .rejects(new InvalidDocument({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    ssmClient
      .on(CreateDocumentCommand, {
        Content: JSON.stringify(StaticInput.updatePropsSetting),
        Name: documentName,
        DocumentType: `Session`,
      })
      .resolves({});
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
  });
});

describe('Delete Event', () => {
  test('Delete event - put parameter value cross account', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, { new: [StaticInput.createProps] });
    const result = await handler(event);
    expect(result?.Status).toBe('SUCCESS');
  });
});

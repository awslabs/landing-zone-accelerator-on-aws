import {
  SSMClient,
  UpdateDocumentCommand,
  CreateDocumentCommand,
  DuplicateDocumentContent,
  InvalidDocument,
  MaxDocumentSizeExceeded,
  GetDocumentCommand,
} from '@aws-sdk/client-ssm';
import { describe, beforeEach, expect, test } from 'vitest';
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
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithoutRunAsSettings);
    ssmClient
      .on(UpdateDocumentCommand, {
        Content: JSON.stringify(StaticInput.createPropsSetting),
        Name: documentName,
        DocumentVersion: '$LATEST',
      })
      .resolves({});
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
  });
  test('Create event - put parameter value cross account with run as values', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.createProps] });
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithRunAsSettings);
    ssmClient
      .on(UpdateDocumentCommand, {
        Content: JSON.stringify(StaticInput.createPropsWithRunAsSettings),
        Name: documentName,
        DocumentVersion: '$LATEST',
      })
      .resolves({});
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
  });
});

describe('Session preference inputs', () => {
  beforeEach(() => {
    ssmClient.reset();
  });

  /**
   * Returns the document content the handler wrote with its single UpdateDocument call.
   */
  const updatedInputs = (): Record<string, unknown> => {
    const calls = ssmClient.commandCalls(UpdateDocumentCommand);
    expect(calls).toHaveLength(1);
    return JSON.parse(calls[0].args[0].input.Content as string).inputs;
  };

  test('configured preferences are written to the document', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.createPropsWithSessionPreferences],
    });
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithoutSessionPreferences);
    ssmClient.on(UpdateDocumentCommand).resolves({});

    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
    expect(updatedInputs()).toEqual(StaticInput.configuredSessionPreferenceInputs);
  });

  test('configured preferences override values changed out of band', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.createPropsWithSessionPreferences],
    });
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithSessionPreferences);
    ssmClient.on(UpdateDocumentCommand).resolves({});

    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
    expect(updatedInputs()).toEqual(StaticInput.configuredSessionPreferenceInputs);
  });

  test('unconfigured preferences are left out of the document entirely', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.createProps] });
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithoutSessionPreferences);
    ssmClient.on(UpdateDocumentCommand).resolves({});

    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
    // Byte for byte identical to what releases before this change wrote, so an upgrade that
    // configures none of these properties produces no document change.
    expect(JSON.parse(ssmClient.commandCalls(UpdateDocumentCommand)[0].args[0].input.Content as string)).toEqual({
      schemaVersion: '1.0',
      description: 'Document to hold regional settings for Session Manager',
      sessionType: 'Standard_Stream',
      inputs: StaticInput.baselineInputs,
    });
  });

  test('only configured preferences are written; everything out of band is dropped', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.createPropsWithIdleSessionTimeoutOnly],
    });
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithSessionPreferences);
    ssmClient.on(UpdateDocumentCommand).resolves({});

    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
    // Configuration is the only authority: the configured value replaces the out-of-band 45, and the
    // three preferences absent from configuration are removed rather than re-persisted.
    expect(updatedInputs()).toEqual({
      ...StaticInput.baselineInputs,
      idleSessionTimeout: '15',
    });
  });

  test('an out-of-band shellProfile is removed when none is configured', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [StaticInput.createProps] });
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithSessionPreferences);
    ssmClient.on(UpdateDocumentCommand).resolves({});

    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
    expect(updatedInputs()['shellProfile']).toBeUndefined();
    expect(updatedInputs()).toEqual(StaticInput.baselineInputs);
  });

  test('cloudWatchStreamingEnabled false is written rather than treated as unset', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [{ ...StaticInput.createProps, cloudWatchStreamingEnabled: 'false' }],
    });
    ssmClient.on(GetDocumentCommand, { Name: documentName }).resolves(StaticInput.documentWithSessionPreferences);
    ssmClient.on(UpdateDocumentCommand).resolves({});

    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
    expect(updatedInputs()['cloudWatchStreamingEnabled']).toBe(false);
  });

  test('configured preferences are written when the document does not exist yet', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.createPropsWithSessionPreferences],
    });
    ssmClient
      .on(GetDocumentCommand, { Name: documentName })
      .rejects(new InvalidDocument({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    ssmClient.on(CreateDocumentCommand).resolves({});

    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
    const calls = ssmClient.commandCalls(CreateDocumentCommand);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].args[0].input.Content as string).inputs).toEqual(
      StaticInput.configuredSessionPreferenceInputs,
    );
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
      .on(GetDocumentCommand, { Name: documentName })
      .rejects(new DuplicateDocumentContent({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    expect(await handler(event)).toEqual({ PhysicalResourceId: 'session-manager-settings', Status: 'SUCCESS' });
  });
  test('Update event - unknown error MaxDocumentSizeExceeded', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.createProps],
    });
    ssmClient
      .on(GetDocumentCommand, { Name: documentName })
      .rejects(new MaxDocumentSizeExceeded({ $metadata: { httpStatusCode: 400 }, message: 'Error' }));
    await expect(handler(event)).rejects.toThrowError(/Error while updating SSM Document :SSM-SessionManagerRunShell/);
  });
  test('Update event - create document on InvalidDocument exception', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.updateProps],
    });
    ssmClient
      .on(GetDocumentCommand, { Name: documentName })
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

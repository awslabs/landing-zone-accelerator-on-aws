/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */
import { handler } from '../index';
import {
  EnableMacieCommand,
  GetMacieSessionCommand,
  Macie2Client,
  PutClassificationExportConfigurationCommand,
  PutFindingsPublicationConfigurationCommand,
  UpdateMacieSessionCommand,
} from '@aws-sdk/client-macie2';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { NEW_PROPS } from './fixtures';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

jest.mock('@aws-accelerator/utils/lib/throttle');

const macie2Mock = AcceleratorMockClient(Macie2Client);

type MacieSessionResponse =
  | { status: 'PAUSED' | 'ENABLED' }
  | {
      name: 'ResourceConflictException' | 'AccessDeniedException';
      message: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkExpectations(result: any) {
  expect(result).toEqual({ Status: 'Success', StatusCode: 200 });
  expect(macie2Mock.calls()).toHaveLength(5);
  expect(macie2Mock.call(0).args[0].constructor.name).toBe('GetMacieSessionCommand');
  expect(macie2Mock.call(1).args[0].constructor.name).toBe('EnableMacieCommand');
  expect(macie2Mock.call(2).args[0].constructor.name).toBe('UpdateMacieSessionCommand');
  expect(macie2Mock.call(2).args[0].input).toEqual({
    findingPublishingFrequency: 'SIX_HOURS',
    status: 'ENABLED',
  });
  expect(macie2Mock.call(3).args[0].constructor.name).toBe('PutFindingsPublicationConfigurationCommand');
  expect(macie2Mock.call(3).args[0].input).toEqual({
    securityHubConfiguration: {
      publishClassificationFindings: true,
      publishPolicyFindings: true,
    },
  });
  expect(macie2Mock.call(4).args[0].constructor.name).toBe('PutClassificationExportConfigurationCommand');
  expect(macie2Mock.call(4).args[0].input).toEqual({
    configuration: {
      s3Destination: {
        bucketName: 'aws-accelerator-central-logs-123456789012-eu-west-1',
        keyPrefix: 'macie/123456789012/',
        kmsKeyArn: 'arn:aws:kms:eu-west-1:123456789012:key/2e329f92-7387-4818-ae74-5d467700296d',
      },
    },
  });
}

function setupMacie2MockResponses(getMacieCommandResult: MacieSessionResponse) {
  if ('name' in getMacieCommandResult) {
    macie2Mock.on(GetMacieSessionCommand).rejects(getMacieCommandResult);
  } else {
    macie2Mock.on(GetMacieSessionCommand).resolves(getMacieCommandResult);
  }
  macie2Mock.on(EnableMacieCommand).resolves({});
  macie2Mock.on(UpdateMacieSessionCommand).resolves({});
  macie2Mock.on(PutFindingsPublicationConfigurationCommand).resolves({});
  macie2Mock.on(PutClassificationExportConfigurationCommand).resolves({});
}

describe('Macie2 handler and helper functions', () => {
  const createEvent = AcceleratorUnitTest.getEvent(EventType.CREATE, { new: [NEW_PROPS] });
  const updateEvent = AcceleratorUnitTest.getEvent(EventType.UPDATE, { new: [NEW_PROPS] });
  beforeEach(() => {
    jest.clearAllMocks();
    macie2Mock.reset();
    process.env['SOLUTION_ID'] = 'test-solution-id';
    (throttlingBackOff as jest.Mock).mockImplementation(async wrappedFunction => {
      return wrappedFunction();
    });
  });

  describe('handler', () => {
    test('Create event should enable Macie and set export configuration given Macie is paused', async () => {
      setupMacie2MockResponses({ status: 'PAUSED' });
      const result = await handler(createEvent);
      checkExpectations(result);
    });

    test('Create event should not enable Macie and set export configuration given Macie is already enabled', async () => {
      setupMacie2MockResponses({ status: 'ENABLED' });

      const result = await handler(createEvent);

      expect(result).toEqual({ Status: 'Success', StatusCode: 200 });
      expect(macie2Mock.calls()).toHaveLength(4);
      expect(macie2Mock.call(0).args[0].constructor.name).toBe('GetMacieSessionCommand');
      expect(macie2Mock.call(1).args[0].constructor.name).toBe('UpdateMacieSessionCommand');
      expect(macie2Mock.call(2).args[0].constructor.name).toBe('PutFindingsPublicationConfigurationCommand');
      expect(macie2Mock.call(3).args[0].constructor.name).toBe('PutClassificationExportConfigurationCommand');
    });

    test('Update event should enable Macie and set export configuration given Macie is not enabled', async () => {
      setupMacie2MockResponses({ status: 'PAUSED' });
      const result = await handler(updateEvent);
      checkExpectations(result);
    });

    test('Delete event should return success', async () => {
      const event = {
        RequestType: 'Delete',
        ResourceProperties: {},
      };

      const result = await handler(event as CloudFormationCustomResourceEvent);

      expect(result).toEqual({ Status: 'Success', StatusCode: 200 });
    });

    test('Create event should enable macie when getMacieSession throws ResourceConflictException', async () => {
      setupMacie2MockResponses({
        name: 'ResourceConflictException',
        message: 'Macie is not enabled',
      });

      const result = await handler(createEvent);
      checkExpectations(result);
    });

    test('Create event should enable macie when getMacieSession throws AccessDeniedException', async () => {
      setupMacie2MockResponses({ name: 'AccessDeniedException', message: 'Access denied' });
      const result = await handler(createEvent);
      checkExpectations(result);
    });

    test('Create event should throw error when getMacieSession throws generic error', async () => {
      macie2Mock.on(GetMacieSessionCommand).rejects(new Error('Unexpected error'));

      await expect(handler(createEvent)).rejects.toThrow('Macie enable issue error message - Error: Unexpected error');
      expect(macie2Mock.calls()).toHaveLength(1);
      expect(macie2Mock.call(0).args[0].constructor.name).toBe('GetMacieSessionCommand');
    });
  });
});

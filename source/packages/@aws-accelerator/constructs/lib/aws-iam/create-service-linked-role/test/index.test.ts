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

import {
  CreateServiceLinkedRoleCommand,
  GetRoleCommand,
  IAMClient,
  InvalidInputException,
  NoSuchEntityException,
  ServiceFailureException,
} from '@aws-sdk/client-iam';

import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import * as throttleModule from '@aws-accelerator/utils/lib/throttle';
import { checkRoleStatus, createServiceLinkedRole, handler, isRoleExists } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';
import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const iamClientMock = AcceleratorMockClient(IAMClient);

const roleName = 'AWSServiceRoleForAwesomeService';
const roleArn = `arn:aws:iam::111111111111:role/${roleName}`;
const serviceName = 'awesomeService.amazonaws.com';
const role = { RoleName: roleName, Arn: roleArn };

/**
 * Builds a transient error that {@link throttleModule.throttlingBackOff} treats as retryable.
 */
function makeTransientError(): Error {
  const error = new Error('Rate exceeded');
  error.name = 'ThrottlingException';
  return error;
}

function makeNoSuchEntityError(): NoSuchEntityException {
  return new NoSuchEntityException({
    $metadata: { httpStatusCode: 404, requestId: 'not-found-request' },
    message: 'Role not found',
  });
}

process.env['SOLUTION_ID'] = 'testLza';

beforeAll(() => {
  // The repository-root vitest setup replaces throttlingBackOff with a single-shot passthrough, which would hide
  // the retry behavior this suite verifies. Restore the real implementation when that mock is active (root
  // config). Under the constructs package config the function is never mocked, so mockRestore() would throw;
  // there the real implementation is already in place.
  if (vi.isMockFunction(throttleModule.throttlingBackOff)) {
    vi.mocked(throttleModule.throttlingBackOff).mockRestore();
  }
  // checkRoleStatus polls on a 15s interval and throttlingBackOff sleeps between retries; run both instantly.
  vi.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
});

beforeEach(() => {
  iamClientMock.reset();
});

describe('isRoleExists', () => {
  test('retries a transient status-retrieval error and returns true once the role is found', async () => {
    // First GetRole call fails with a transient error, the retry succeeds
    iamClientMock.on(GetRoleCommand).rejectsOnce(makeTransientError()).resolves({ Role: role });

    await expect(isRoleExists(new IAMClient({}), roleName)).resolves.toStrictEqual(true);
    expect(iamClientMock.commandCalls(GetRoleCommand)).toHaveLength(2);
  });

  test('returns false when the role does not exist', async () => {
    iamClientMock.on(GetRoleCommand).rejects(makeNoSuchEntityError());

    await expect(isRoleExists(new IAMClient({}), roleName)).resolves.toStrictEqual(false);
  });

  test('throws the descriptive status-retrieval error including the underlying exception', async () => {
    iamClientMock.on(GetRoleCommand).rejects(
      new ServiceFailureException({
        $metadata: { httpStatusCode: 500, requestId: 'service-failure-request' },
        message: 'IAM unavailable',
      }),
    );

    await expect(isRoleExists(new IAMClient({}), roleName)).rejects.toThrow(
      `Encountered an error when attempting to retrieve the status of service-linked role ${roleName}: ServiceFailureException: IAM unavailable`,
    );
  });
});

describe('createServiceLinkedRole', () => {
  test('retries a transient create failure and then confirms the role is visible', async () => {
    iamClientMock.on(CreateServiceLinkedRoleCommand).rejectsOnce(makeTransientError()).resolves({ Role: role });
    iamClientMock.on(GetRoleCommand).resolves({ Role: role });

    await expect(createServiceLinkedRole(new IAMClient({}), serviceName, undefined)).resolves.toStrictEqual({
      Status: 'SUCCESS',
      Data: { roleArn, roleName },
    });
    expect(iamClientMock.commandCalls(CreateServiceLinkedRoleCommand)).toHaveLength(2);
    expect(iamClientMock.commandCalls(GetRoleCommand)).toHaveLength(1);
  });

  test('treats an already-taken role name as success without polling', async () => {
    iamClientMock.on(CreateServiceLinkedRoleCommand).rejects(
      new InvalidInputException({
        $metadata: { httpStatusCode: 400 },
        message: 'Service role name has been taken in this account',
      }),
    );

    await expect(createServiceLinkedRole(new IAMClient({}), serviceName, undefined)).resolves.toStrictEqual({
      Status: 'SUCCESS',
      Data: undefined,
    });
    expect(iamClientMock.commandCalls(GetRoleCommand)).toHaveLength(0);
  });

  test('throws including the underlying exception when creation fails permanently', async () => {
    iamClientMock.on(CreateServiceLinkedRoleCommand).rejects(
      new InvalidInputException({
        $metadata: { httpStatusCode: 400 },
        message: 'Service role name awesomeService is not supported',
      }),
    );

    await expect(createServiceLinkedRole(new IAMClient({}), serviceName, undefined)).rejects.toThrow(
      'There was an error in service linked role creation: InvalidInputException: Service role name awesomeService is not supported',
    );
  });

  test('polls until the created role becomes visible', async () => {
    iamClientMock.on(CreateServiceLinkedRoleCommand).resolves({ Role: role });
    iamClientMock
      .on(GetRoleCommand)
      .rejectsOnce(makeNoSuchEntityError())
      .rejectsOnce(makeNoSuchEntityError())
      .resolves({ Role: role });

    await expect(createServiceLinkedRole(new IAMClient({}), serviceName, 'description')).resolves.toStrictEqual({
      Status: 'SUCCESS',
      Data: { roleArn, roleName },
    });
    expect(iamClientMock.commandCalls(GetRoleCommand)).toHaveLength(3);
  });

  test('warns but still succeeds when the created role is not visible after all polling attempts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    iamClientMock.on(CreateServiceLinkedRoleCommand).resolves({ Role: role });
    iamClientMock.on(GetRoleCommand).rejects(makeNoSuchEntityError());

    await expect(createServiceLinkedRole(new IAMClient({}), serviceName, undefined)).resolves.toStrictEqual({
      Status: 'SUCCESS',
      Data: { roleArn, roleName },
    });
    expect(iamClientMock.commandCalls(GetRoleCommand)).toHaveLength(10);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`Role ${roleName} was not visible to GetRole`));
    warn.mockRestore();
  });

  test('throws when the create response has no role', async () => {
    iamClientMock.on(CreateServiceLinkedRoleCommand).resolves({});

    await expect(createServiceLinkedRole(new IAMClient({}), serviceName, undefined)).rejects.toThrow(
      'Response did not have Role.',
    );
  });
});

describe('checkRoleStatus', () => {
  test('retries a transient error while polling and resolves once the role is found', async () => {
    iamClientMock.on(GetRoleCommand).rejectsOnce(makeTransientError()).resolves({ Role: role });

    await expect(checkRoleStatus(new IAMClient({}), roleName)).resolves.toBeUndefined();
    expect(iamClientMock.commandCalls(GetRoleCommand)).toHaveLength(2);
  });

  test('throws including the underlying exception for a non-retryable status-check error', async () => {
    const accessDeniedError = Object.assign(new Error('Not authorized'), {
      name: 'AccessDeniedException',
      $metadata: { httpStatusCode: 403, requestId: 'access-denied-request' },
    });
    iamClientMock.on(GetRoleCommand).rejects(accessDeniedError);

    await expect(checkRoleStatus(new IAMClient({}), roleName)).rejects.toThrow(
      `There was an error in checking status of role: ${roleName}: AccessDeniedException: Not authorized`,
    );
    expect(iamClientMock.commandCalls(GetRoleCommand)).toHaveLength(1);
  });
});

describe('handler', () => {
  test('returns success when the role already exists', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [{ roleName, serviceName, description: 'some description' }],
    });
    iamClientMock.on(GetRoleCommand).resolves({ Role: role });

    const response = await handler(event);
    expect(response?.Status).toStrictEqual('SUCCESS');
  });
});

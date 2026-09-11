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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AwsClientStub, mockClient } from 'aws-sdk-client-mock';
import type { DescribeAccountCommandOutput } from '@aws-sdk/client-organizations';
import { DescribeAccountCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { getAccountStateValidationError } from '../../lib/lambdas/validate-environment';

// Fast poll settings so the bounded-wait tests do not sleep for real.
const fastPoll = { pollIntervalMs: 0, maxAttempts: 3 };

describe('validate-environment account lifecycle validation', () => {
  let orgsMock: AwsClientStub<OrganizationsClient>;
  let orgClient: OrganizationsClient;

  beforeEach(() => {
    orgsMock = mockClient(OrganizationsClient);
    orgClient = new OrganizationsClient({});
  });

  afterEach(() => {
    orgsMock.restore();
  });

  it('prefers State over Status and passes an ACTIVE account without polling', async () => {
    await expect(
      getAccountStateValidationError(
        'Mandatory',
        'account@example.com',
        { State: 'ACTIVE', Status: 'SUSPENDED' },
        orgClient,
      ),
    ).resolves.toBeUndefined();
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBe(0);
  });

  it('falls back to Status when State is absent (ACTIVE passes)', async () => {
    await expect(
      getAccountStateValidationError('Workload', 'account@example.com', { Status: 'ACTIVE' }, orgClient),
    ).resolves.toBeUndefined();
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBe(0);
  });

  it('polls a PENDING_ACTIVATION account and passes once it becomes ACTIVE', async () => {
    orgsMock
      .on(DescribeAccountCommand)
      .resolvesOnce({
        Account: { Id: '111122223333', State: 'PENDING_ACTIVATION' },
      } as unknown as DescribeAccountCommandOutput)
      .resolves({ Account: { Id: '111122223333', State: 'ACTIVE' } } as unknown as DescribeAccountCommandOutput);

    await expect(
      getAccountStateValidationError(
        'Mandatory',
        'pending@example.com',
        { Id: '111122223333', State: 'PENDING_ACTIVATION', Status: 'ACTIVE' },
        orgClient,
        fastPoll,
      ),
    ).resolves.toBeUndefined();
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBeGreaterThanOrEqual(1);
  });

  it('reports an error if a PENDING_ACTIVATION account never activates within the bound', async () => {
    orgsMock.on(DescribeAccountCommand).resolves({
      Account: { Id: '111122223333', State: 'PENDING_ACTIVATION' },
    } as unknown as DescribeAccountCommandOutput);

    await expect(
      getAccountStateValidationError(
        'Mandatory',
        'pending@example.com',
        { Id: '111122223333', State: 'PENDING_ACTIVATION' },
        orgClient,
        fastPoll,
      ),
    ).resolves.toMatch(/did not reach ACTIVE/);
    // Polled the full bound.
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBe(fastPoll.maxAttempts);
  });

  it('reports (without polling) an account that transitions to a terminal state while waiting', async () => {
    orgsMock
      .on(DescribeAccountCommand)
      .resolvesOnce({
        Account: { Id: '111122223333', State: 'PENDING_ACTIVATION' },
      } as unknown as DescribeAccountCommandOutput)
      .resolves({ Account: { Id: '111122223333', State: 'SUSPENDED' } } as unknown as DescribeAccountCommandOutput);

    await expect(
      getAccountStateValidationError(
        'Workload',
        'suspending@example.com',
        { Id: '111122223333', State: 'PENDING_ACTIVATION' },
        orgClient,
        fastPoll,
      ),
    ).resolves.toBe('Workload account suspending@example.com is in SUSPENDED');
  });

  it('reports other non-ACTIVE and missing lifecycle states immediately', async () => {
    await expect(
      getAccountStateValidationError(
        'Workload',
        'suspended@example.com',
        { State: 'SUSPENDED', Status: 'ACTIVE' },
        orgClient,
      ),
    ).resolves.toBe('Workload account suspended@example.com is in SUSPENDED');
    await expect(
      getAccountStateValidationError('Workload', 'closing@example.com', { State: 'PENDING_CLOSURE' }, orgClient),
    ).resolves.toBe('Workload account closing@example.com is in PENDING_CLOSURE');
    await expect(getAccountStateValidationError('Mandatory', 'unknown@example.com', {}, orgClient)).resolves.toBe(
      'Mandatory account unknown@example.com is in undefined',
    );
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBe(0);
  });

  it('reports a PENDING_ACTIVATION account with no account id without polling', async () => {
    await expect(
      getAccountStateValidationError('Mandatory', 'noid@example.com', { State: 'PENDING_ACTIVATION' }, orgClient),
    ).resolves.toBe('Mandatory account noid@example.com is in PENDING_ACTIVATION and has no account id to poll');
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBe(0);
  });

  it('stops polling once the shared activation deadline has passed, regardless of maxAttempts', async () => {
    orgsMock.on(DescribeAccountCommand).resolves({
      Account: { Id: '111122223333', State: 'PENDING_ACTIVATION' },
    } as unknown as DescribeAccountCommandOutput);

    await expect(
      getAccountStateValidationError(
        'Mandatory',
        'pending@example.com',
        { Id: '111122223333', State: 'PENDING_ACTIVATION' },
        orgClient,
        // Deadline already elapsed and a high per-account attempt cap: the shared deadline must stop it.
        { pollIntervalMs: 0, maxAttempts: 10, deadlineEpochMs: Date.now() - 1 },
      ),
    ).resolves.toMatch(/did not reach ACTIVE/);
    // One authoritative check, then the shared deadline halts further polling (not 10 attempts).
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBe(1);
  });
});

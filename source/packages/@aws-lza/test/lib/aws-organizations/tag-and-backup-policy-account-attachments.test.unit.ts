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
  AttachPolicyCommand,
  DetachPolicyCommand,
  ListPoliciesCommand,
  ListTargetsForPolicyCommand,
} from '@aws-sdk/client-organizations';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const mockSend = vi.fn();
const mockLoggerError = vi.hoisted(() => vi.fn<(message: string, prefix?: string) => void>());
const mockLoggerWarn = vi.hoisted(() => vi.fn<(message: string, prefix?: string) => void>());

vi.mock('@aws-sdk/client-organizations', async () => ({
  ...(await vi.importActual('@aws-sdk/client-organizations')),
  OrganizationsClient: class {
    send = mockSend;
  },
}));

vi.mock('../../../lib/common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    processStart: vi.fn(),
    processEnd: vi.fn(),
    info: vi.fn(),
    warn: mockLoggerWarn,
    error: mockLoggerError,
  })),
}));

vi.mock('../../../lib/common/utility', async () => ({
  ...(await vi.importActual('../../../lib/common/utility')),
  setRetryStrategy: vi.fn(() => ({})),
}));

import { manageTagAndBackupPolicyAccountAttachments } from '../../../lib/aws-organizations/tag-and-backup-policy-account-attachments';
import {
  ITagAndBackupPolicyAccountAttachmentConfig,
  ITagAndBackupPolicyAccountAttachmentsModuleRequest,
} from '../../../lib/aws-organizations/interfaces';
import { MODULE_STATE_CODE } from '../../../lib/common/types';

const ACCOUNT_A = '111111111111';
const ACCOUNT_B = '222222222222';
const ACCOUNT_C = '333333333333';
const ACCOUNT_D = '444444444444';
const ACCOUNT_E = '555555555555';
const UNMANAGED_LOG_MESSAGE_PREFIX =
  'Direct ACCOUNT attachments are not managed by LZA configuration and will be preserved; consider adding them to deploymentTargets.accounts to let LZA manage them: ';

interface IUnmanagedAttachmentLog {
  readonly logPrefix?: string;
  readonly details: {
    readonly policyName: string;
    readonly policyType: string;
    readonly policyId: string;
    readonly accountIds: string[];
  };
}

function request(
  policies: ITagAndBackupPolicyAccountAttachmentConfig[],
  dryRun = false,
): ITagAndBackupPolicyAccountAttachmentsModuleRequest {
  return {
    operation: 'tag-and-backup-policy-account-attachments',
    partition: 'aws',
    region: 'us-east-1',
    globalRegion: 'us-east-1',
    invokingAccountId: '999999999999',
    dryRun,
    configuration: {
      policies,
    },
  };
}

function policy(
  policyName = 'TagPolicy',
  policyType: 'TAG_POLICY' | 'BACKUP_POLICY' = 'TAG_POLICY',
  accountIds: string[] = [ACCOUNT_A],
  ownedAccountIds: string[] = accountIds,
  cleanupOnly = false,
): ITagAndBackupPolicyAccountAttachmentConfig {
  return { policyName, policyType, accountIds, ownedAccountIds, cleanupOnly };
}

function commandCalls<T>(commandType: new (...args: never[]) => T): T[] {
  return mockSend.mock.calls.map(([command]) => command).filter(command => command instanceof commandType);
}

function unmanagedAttachmentLogs(): IUnmanagedAttachmentLog[] {
  return mockLoggerWarn.mock.calls
    .filter(([message]) => message.startsWith(UNMANAGED_LOG_MESSAGE_PREFIX))
    .map(([message, logPrefix]) => ({
      logPrefix,
      details: JSON.parse(message.slice(UNMANAGED_LOG_MESSAGE_PREFIX.length)) as IUnmanagedAttachmentLog['details'],
    }));
}

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

function policyAttachmentQuotaError(): Error & { Reason: string } {
  return Object.assign(namedError('ConstraintViolationException'), {
    Reason: 'MAX_POLICY_TYPE_ATTACHMENT_LIMIT_EXCEEDED',
  });
}

function mockOrganizationState(
  targetsByPolicy: Record<string, Array<{ TargetId: string; Type: 'ACCOUNT' | 'ORGANIZATIONAL_UNIT' | 'ROOT' }>>,
  options?: {
    onAttach?: (accountId: string, policyId: string) => Promise<object>;
    onDetach?: (accountId: string, policyId: string) => Promise<object>;
  },
) {
  mockSend.mockImplementation(command => {
    if (command instanceof ListPoliciesCommand) {
      const policies =
        command.input.Filter === 'TAG_POLICY'
          ? [
              { Id: 'p-tag', Name: 'TagPolicy' },
              { Id: 'p-other', Name: 'OtherTagPolicy' },
            ]
          : [{ Id: 'p-backup', Name: 'BackupPolicy' }];
      return Promise.resolve({ Policies: policies });
    }
    if (command instanceof ListTargetsForPolicyCommand) {
      return Promise.resolve({ Targets: targetsByPolicy[command.input.PolicyId ?? ''] ?? [] });
    }
    if (command instanceof AttachPolicyCommand) {
      return options?.onAttach?.(command.input.TargetId ?? '', command.input.PolicyId ?? '') ?? Promise.resolve({});
    }
    if (command instanceof DetachPolicyCommand) {
      return options?.onDetach?.(command.input.TargetId ?? '', command.input.PolicyId ?? '') ?? Promise.resolve({});
    }
    return Promise.reject(new Error('Unexpected command'));
  });
}

function mockTagPolicyTargetPreflightFailure() {
  const accessDenied = new Error('target discovery denied');
  accessDenied.name = 'AccessDeniedException';
  mockSend.mockImplementation(command => {
    if (command instanceof ListPoliciesCommand) {
      return Promise.resolve({
        Policies:
          command.input.Filter === 'TAG_POLICY'
            ? [{ Id: 'p-tag', Name: 'TagPolicy' }]
            : [{ Id: 'p-backup', Name: 'BackupPolicy' }],
      });
    }
    if (command instanceof ListTargetsForPolicyCommand) {
      return command.input.PolicyId === 'p-tag'
        ? Promise.reject(accessDenied)
        : Promise.resolve({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });
    }
    return Promise.reject(new Error('Unexpected command'));
  });
}

async function runModule(moduleRequest: ITagAndBackupPolicyAccountAttachmentsModuleRequest) {
  const resultPromise = manageTagAndBackupPolicyAccountAttachments(moduleRequest);
  await vi.runAllTimersAsync();
  return resultPromise;
}

describe('manageTagAndBackupPolicyAccountAttachments', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('attaches an account-only tag policy target', async () => {
    mockOrganizationState({ 'p-tag': [] });

    const result = await runModule(request([policy()]));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(1);
    expect(result.response?.perPolicyResults[0].accountResults[0]).toMatchObject({
      accountId: ACCOUNT_A,
      operation: 'attach',
      status: 'attached',
    });
  });

  test('compares only account targets in mixed OU and account state', async () => {
    mockOrganizationState({
      'p-tag': [
        { TargetId: 'ou-abcd-12345678', Type: 'ORGANIZATIONAL_UNIT' },
        { TargetId: 'r-abcd', Type: 'ROOT' },
        { TargetId: ACCOUNT_A, Type: 'ACCOUNT' },
      ],
    });

    const result = await runModule(request([policy()]));

    expect(result.response?.perPolicyResults[0].status).toBe('no-change');
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('reports only live direct account attachments outside desired and previous ownership', async () => {
    mockOrganizationState({
      'p-tag': [
        { TargetId: ACCOUNT_A, Type: 'ACCOUNT' },
        { TargetId: ACCOUNT_B, Type: 'ACCOUNT' },
        { TargetId: ACCOUNT_C, Type: 'ACCOUNT' },
        { TargetId: 'ou-abcd-12345678', Type: 'ORGANIZATIONAL_UNIT' },
        { TargetId: 'r-abcd', Type: 'ROOT' },
      ],
    });

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A], [ACCOUNT_A, ACCOUNT_B])]));

    expect(unmanagedAttachmentLogs()).toEqual([
      {
        logPrefix: '999999999999:us-east-1',
        details: {
          policyName: 'TagPolicy',
          policyType: 'TAG_POLICY',
          policyId: 'p-tag',
          accountIds: [ACCOUNT_C],
        },
      },
    ]);
    expect(mockLoggerWarn).toHaveBeenCalled();
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(result.response?.perPolicyResults[0].unmanagedAccountIds).toEqual([ACCOUNT_C]);
  });

  test('returns no-change when direct account attachments already match', async () => {
    mockOrganizationState({ 'p-backup': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });

    const result = await runModule(request([policy('BackupPolicy', 'BACKUP_POLICY')]));

    expect(result.response?.perPolicyResults[0]).toMatchObject({ policyId: 'p-backup', status: 'no-change' });
    expect(result.response?.perPolicyResults[0].unmanagedAccountIds).toEqual([]);
  });

  test('discovers same-type policies with one paginated scan per attempt', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        if (!command.input.NextToken) {
          return Promise.resolve({
            Policies: [
              { Id: 'p-tag-suffix', Name: 'TagPolicySuffix' },
              { Id: 'p-tag', Name: 'TagPolicy' },
            ],
            NextToken: 'tag-page-2',
          });
        }
        return Promise.resolve({ Policies: [{ Id: 'p-other', Name: 'OtherTagPolicy' }] });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return Promise.resolve({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy(), policy('OtherTagPolicy', 'TAG_POLICY')]));

    expect(commandCalls(ListPoliciesCommand)).toHaveLength(2);
    expect(commandCalls(ListPoliciesCommand).map(command => command.input.NextToken)).toEqual([
      undefined,
      'tag-page-2',
    ]);
    expect(result.response?.perPolicyResults.map(item => [item.policyName, item.policyId])).toEqual([
      ['TagPolicy', 'p-tag'],
      ['OtherTagPolicy', 'p-other'],
    ]);
  });

  test('paces every policy read page across concurrent workers at five requests per second', async () => {
    const readStarts: Array<{ operation: string; token?: string; time: number }> = [];
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        readStarts.push({
          operation: `policies:${command.input.Filter}`,
          token: command.input.NextToken,
          time: Date.now(),
        });
        if (command.input.Filter === 'TAG_POLICY') {
          return command.input.NextToken
            ? Promise.resolve({ Policies: [{ Id: 'p-other', Name: 'OtherTagPolicy' }] })
            : Promise.resolve({
                Policies: [{ Id: 'p-tag', Name: 'TagPolicy' }],
                NextToken: 'tag-policy-page-2',
              });
        }
        return command.input.NextToken
          ? Promise.resolve({ Policies: [{ Id: 'p-backup', Name: 'BackupPolicy' }] })
          : Promise.resolve({ Policies: [], NextToken: 'backup-policy-page-2' });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        const policyId = command.input.PolicyId ?? '';
        readStarts.push({
          operation: `targets:${policyId}`,
          token: command.input.NextToken,
          time: Date.now(),
        });
        return command.input.NextToken
          ? Promise.resolve({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] })
          : Promise.resolve({ Targets: [], NextToken: `${policyId}-target-page-2` });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(
      request([
        policy('TagPolicy', 'TAG_POLICY'),
        policy('OtherTagPolicy', 'TAG_POLICY'),
        policy('BackupPolicy', 'BACKUP_POLICY'),
      ]),
    );

    expect(readStarts.map(item => [item.operation, item.token])).toEqual([
      ['policies:TAG_POLICY', undefined],
      ['policies:TAG_POLICY', 'tag-policy-page-2'],
      ['policies:BACKUP_POLICY', undefined],
      ['policies:BACKUP_POLICY', 'backup-policy-page-2'],
      ['targets:p-tag', undefined],
      ['targets:p-other', undefined],
      ['targets:p-backup', undefined],
      ['targets:p-tag', 'p-tag-target-page-2'],
      ['targets:p-other', 'p-other-target-page-2'],
      ['targets:p-backup', 'p-backup-target-page-2'],
    ]);
    for (let index = 1; index < readStarts.length; index++) {
      expect(readStarts[index].time - readStarts[index - 1].time).toBeGreaterThanOrEqual(200);
    }
    expect(result.response?.perPolicyResults.map(item => [item.policyName, item.status])).toEqual([
      ['TagPolicy', 'no-change'],
      ['OtherTagPolicy', 'no-change'],
      ['BackupPolicy', 'no-change'],
    ]);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('creates an independent policy read limiter for each invocation', async () => {
    const readStarts: number[] = [];
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        readStarts.push(Date.now());
        return Promise.resolve({ Policies: [{ Id: 'p-tag', Name: 'TagPolicy' }] });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        readStarts.push(Date.now());
        return Promise.resolve({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    await runModule(request([policy()]));
    await runModule(request([policy()]));

    expect(readStarts).toHaveLength(4);
    expect(readStarts[1] - readStarts[0]).toBe(200);
    expect(readStarts[2] - readStarts[1]).toBe(0);
    expect(readStarts[3] - readStarts[2]).toBe(200);
  });

  test('reads every target page before reconciling direct accounts', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        return Promise.resolve({ Policies: [{ Id: 'p-tag', Name: 'TagPolicy' }] });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return command.input.NextToken
          ? Promise.resolve({
              Targets: [
                { TargetId: ACCOUNT_B, Type: 'ACCOUNT' },
                { TargetId: 'r-abcd', Type: 'ROOT' },
              ],
            })
          : Promise.resolve({
              Targets: [
                { TargetId: ACCOUNT_A, Type: 'ACCOUNT' },
                { TargetId: 'ou-abcd-12345678', Type: 'ORGANIZATIONAL_UNIT' },
              ],
              NextToken: 'target-page-2',
            });
      }
      if (command instanceof DetachPolicyCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A], [ACCOUNT_A, ACCOUNT_B])]));

    expect(commandCalls(ListTargetsForPolicyCommand).map(command => command.input.NextToken)).toEqual([
      undefined,
      'target-page-2',
    ]);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)[0].input.TargetId).toBe(ACCOUNT_B);
    expect(result.response?.perPolicyResults[0].status).toBe('reconciled');
  });

  test('limits target discovery to five policies and waits before the next batch', async () => {
    vi.useFakeTimers();
    const policyNames = ['Policy1', 'Policy2', 'Policy3', 'Policy4', 'Policy5', 'Policy6'];
    const startedPolicyIds: string[] = [];
    const targetResolvers = new Map<
      string,
      (value: { Targets: Array<{ TargetId: string; Type: 'ACCOUNT' }> }) => void
    >();

    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        return Promise.resolve({
          Policies: policyNames.map((name, index) => ({ Id: `p-${index + 1}`, Name: name })),
        });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        const policyId = command.input.PolicyId ?? '';
        startedPolicyIds.push(policyId);
        return new Promise<{ Targets: Array<{ TargetId: string; Type: 'ACCOUNT' }> }>(resolve => {
          targetResolvers.set(policyId, resolve);
        });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const resultPromise = manageTagAndBackupPolicyAccountAttachments(request(policyNames.map(name => policy(name))));
    await vi.advanceTimersByTimeAsync(0);

    expect(startedPolicyIds).toEqual([]);
    await vi.advanceTimersByTimeAsync(999);
    expect(startedPolicyIds).toEqual(['p-1', 'p-2', 'p-3', 'p-4']);
    await vi.advanceTimersByTimeAsync(1);
    expect(startedPolicyIds).toEqual(['p-1', 'p-2', 'p-3', 'p-4', 'p-5']);

    for (const policyId of [...startedPolicyIds].reverse()) {
      targetResolvers.get(policyId)?.({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });
    }
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(999);
    expect(startedPolicyIds).toHaveLength(5);

    await vi.advanceTimersByTimeAsync(1);
    expect(startedPolicyIds).toEqual(['p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6']);
    targetResolvers.get('p-6')?.({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });
    await vi.advanceTimersByTimeAsync(0);

    const result = await resultPromise;
    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.perPolicyResults.map(item => item.policyName)).toEqual(policyNames);
  });

  test('attaches a missing desired account without changing existing accounts', async () => {
    mockOrganizationState({ 'p-tag': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });

    await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A, ACCOUNT_B])]));

    expect(commandCalls(AttachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(AttachPolicyCommand)[0]).toMatchObject({ input: { PolicyId: 'p-tag', TargetId: ACCOUNT_B } });
  });

  test('first run preserves manual live attachments and only adds desired accounts', async () => {
    mockOrganizationState({
      'p-tag': [
        { TargetId: ACCOUNT_A, Type: 'ACCOUNT' },
        { TargetId: ACCOUNT_B, Type: 'ACCOUNT' },
      ],
    });

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A, ACCOUNT_C], [])]));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(AttachPolicyCommand)[0]).toMatchObject({ input: { TargetId: ACCOUNT_C } });
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
    expect(unmanagedAttachmentLogs().map(log => log.details.accountIds)).toEqual([[ACCOUNT_B]]);
    expect(result.response?.perPolicyResults[0].unmanagedAccountIds).toEqual([ACCOUNT_B]);
  });

  test('detaches a stale direct-account target', async () => {
    mockOrganizationState({
      'p-tag': [
        { TargetId: ACCOUNT_A, Type: 'ACCOUNT' },
        { TargetId: ACCOUNT_B, Type: 'ACCOUNT' },
        { TargetId: ACCOUNT_C, Type: 'ACCOUNT' },
      ],
    });

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A], [ACCOUNT_A, ACCOUNT_B])]));

    expect(commandCalls(DetachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)[0]).toMatchObject({ input: { PolicyId: 'p-tag', TargetId: ACCOUNT_B } });
    expect(result.response?.perPolicyResults[0].accountResults[0].status).toBe('detached');
  });

  test('propagates a non-race detachment failure to the account, policy, and module results', async () => {
    const accessDenied = new Error('detach denied');
    accessDenied.name = 'AccessDeniedException';
    mockOrganizationState(
      { 'p-tag': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] },
      { onDetach: () => Promise.reject(accessDenied) },
    );

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [], [ACCOUNT_A])]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)[0]).toMatchObject({
      input: { PolicyId: 'p-tag', TargetId: ACCOUNT_A },
    });
    expect(result.response?.perPolicyResults[0]).toMatchObject({
      policyName: 'TagPolicy',
      status: 'failed',
      error: { name: 'AccessDeniedException', message: 'detach denied' },
      accountResults: [
        {
          accountId: ACCOUNT_A,
          operation: 'detach',
          status: 'failed',
          error: { name: 'AccessDeniedException', message: 'detach denied' },
        },
      ],
    });
    expect(result.error).toEqual({ name: 'AccessDeniedException', message: 'detach denied' });
  });

  test('cleans up only previous-owned attachments for a policy removed from current configuration', async () => {
    mockOrganizationState({
      'p-tag': [
        { TargetId: ACCOUNT_A, Type: 'ACCOUNT' },
        { TargetId: ACCOUNT_B, Type: 'ACCOUNT' },
      ],
    });

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [], [ACCOUNT_A], true)]));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)[0]).toMatchObject({ input: { TargetId: ACCOUNT_A } });
    expect(unmanagedAttachmentLogs().map(log => log.details.accountIds)).toEqual([[ACCOUNT_B]]);
    expect(result.response?.perPolicyResults[0].unmanagedAccountIds).toEqual([ACCOUNT_B]);
  });

  test('does not report partial unmanaged targets when a later target page fails', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        return Promise.resolve({ Policies: [{ Id: 'p-tag', Name: 'TagPolicy' }] });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return command.input.NextToken
          ? Promise.reject(namedError('AccessDeniedException'))
          : Promise.resolve({
              Targets: [{ TargetId: ACCOUNT_C, Type: 'ACCOUNT' }],
              NextToken: 'target-page-2',
            });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy()]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(unmanagedAttachmentLogs()).toEqual([]);
    expect(result.response?.perPolicyResults[0].unmanagedAccountIds).toEqual([]);
  });

  test('sorts, deduplicates, and batches unmanaged account logs at one hundred IDs', async () => {
    const accountIds = Array.from({ length: 205 }, (_, index) => String(700000000000 + index));
    const liveAccountIds = [...accountIds].reverse().concat(accountIds[50], accountIds[150]);
    mockOrganizationState({
      'p-tag': liveAccountIds.map(accountId => ({ TargetId: accountId, Type: 'ACCOUNT' })),
    });

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [], [])]));

    const logs = unmanagedAttachmentLogs();
    const loggedAccountIds = logs.flatMap(log => log.details.accountIds);
    expect(logs.map(log => log.details.accountIds.length)).toEqual([100, 100, 5]);
    expect(logs.map(log => log.logPrefix)).toEqual([
      '999999999999:us-east-1',
      '999999999999:us-east-1',
      '999999999999:us-east-1',
    ]);
    expect(loggedAccountIds).toEqual(accountIds);
    expect(new Set(loggedAccountIds)).toHaveLength(205);
    expect(result.response?.perPolicyResults[0].unmanagedAccountIds).toEqual(accountIds);
  });

  test('treats a cleanup-only policy as deleted after bounded discovery is exhausted', async () => {
    mockOrganizationState({});

    const result = await runModule(request([policy('RemovedPolicy', 'TAG_POLICY', [], [ACCOUNT_A], true)]));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.perPolicyResults[0]).toMatchObject({
      policyName: 'RemovedPolicy',
      status: 'no-change',
    });
    expect(result.response?.perPolicyResults[0].message).toContain('already cleaned up');
    expect(commandCalls(ListPoliciesCommand)).toHaveLength(5);
    expect(commandCalls(ListTargetsForPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('retries cleanup-only discovery before detaching from a temporarily omitted policy', async () => {
    let discoveryAttempts = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        discoveryAttempts++;
        return Promise.resolve({
          Policies: discoveryAttempts >= 3 ? [{ Id: 'p-removed', Name: 'RemovedPolicy' }] : [],
        });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return Promise.resolve({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });
      }
      if (command instanceof DetachPolicyCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy('RemovedPolicy', 'TAG_POLICY', [], [ACCOUNT_A], true)]));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(commandCalls(ListPoliciesCommand)).toHaveLength(3);
    expect(commandCalls(ListTargetsForPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)[0]).toMatchObject({
      input: { PolicyId: 'p-removed', TargetId: ACCOUNT_A },
    });
  });

  test('does not retry a missing cleanup-only policy during dry-run', async () => {
    mockOrganizationState({});

    const result = await runModule(request([policy('RemovedPolicy', 'TAG_POLICY', [], [ACCOUNT_A], true)], true));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.perPolicyResults[0].status).toBe('no-change');
    expect(commandCalls(ListPoliciesCommand)).toHaveLength(1);
    expect(commandCalls(ListTargetsForPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('treats PolicyNotFound during cleanup target discovery as already cleaned up', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        return Promise.resolve({ Policies: [{ Id: 'p-removed', Name: 'RemovedPolicy' }] });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return Promise.reject(namedError('PolicyNotFoundException'));
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy('RemovedPolicy', 'TAG_POLICY', [], [ACCOUNT_A], true)]));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.perPolicyResults[0].status).toBe('no-change');
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('fails cleanup-only target discovery on errors other than a missing policy', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        return Promise.resolve({ Policies: [{ Id: 'p-removed', Name: 'RemovedPolicy' }] });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return Promise.reject(namedError('AccessDeniedException'));
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy('RemovedPolicy', 'TAG_POLICY', [], [ACCOUNT_A], true)]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.perPolicyResults[0].error?.name).toBe('AccessDeniedException');
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('treats PolicyNotFound during cleanup detachment as an idempotent race', async () => {
    mockOrganizationState(
      { 'p-tag': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] },
      { onDetach: () => Promise.reject(namedError('PolicyNotFoundException')) },
    );

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [], [ACCOUNT_A], true)]));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.perPolicyResults[0].accountResults).toEqual([
      expect.objectContaining({ accountId: ACCOUNT_A, operation: 'detach', status: 'no-change' }),
    ]);
  });

  test('preserves OU and root targets and converges on a rerun', async () => {
    vi.useFakeTimers();
    mockOrganizationState({
      'p-tag': [
        { TargetId: 'ou-abcd-12345678', Type: 'ORGANIZATIONAL_UNIT' },
        { TargetId: 'r-abcd', Type: 'ROOT' },
        { TargetId: ACCOUNT_A, Type: 'ACCOUNT' },
      ],
    });

    const firstRunPromise = manageTagAndBackupPolicyAccountAttachments(
      request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_B], [ACCOUNT_A])]),
    );
    await vi.runAllTimersAsync();
    await firstRunPromise;

    const writeCommands = mockSend.mock.calls
      .map(([command]) => command)
      .filter(command => command instanceof AttachPolicyCommand || command instanceof DetachPolicyCommand);
    expect(writeCommands[0]).toBeInstanceOf(AttachPolicyCommand);
    expect(writeCommands[1]).toBeInstanceOf(DetachPolicyCommand);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)[0]).toMatchObject({ input: { TargetId: ACCOUNT_A } });

    mockSend.mockClear();
    mockOrganizationState({
      'p-tag': [
        { TargetId: 'ou-abcd-12345678', Type: 'ORGANIZATIONAL_UNIT' },
        { TargetId: 'r-abcd', Type: 'ROOT' },
        { TargetId: ACCOUNT_B, Type: 'ACCOUNT' },
      ],
    });

    const rerun = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_B])]));

    expect(rerun.response?.perPolicyResults[0].status).toBe('no-change');
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('globally limits policy writes to two and preserves add-before-remove ordering', async () => {
    vi.useFakeTimers();
    const startedWrites: string[] = [];
    const writeResolvers = new Map<string, () => void>();
    const write = (operation: 'attach' | 'detach', accountId: string, policyId: string) => {
      const key = `${operation}:${policyId}:${accountId}`;
      startedWrites.push(key);
      return new Promise<object>(resolve => {
        writeResolvers.set(key, () => resolve({}));
      });
    };

    mockOrganizationState(
      {
        'p-tag': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }],
        'p-other': [{ TargetId: ACCOUNT_C, Type: 'ACCOUNT' }],
        'p-backup': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }],
      },
      {
        onAttach: (accountId, policyId) => write('attach', accountId, policyId),
        onDetach: (accountId, policyId) => write('detach', accountId, policyId),
      },
    );

    const resultPromise = manageTagAndBackupPolicyAccountAttachments(
      request([
        policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_B], [ACCOUNT_A]),
        policy('OtherTagPolicy', 'TAG_POLICY', [ACCOUNT_D], [ACCOUNT_C]),
        policy('BackupPolicy', 'BACKUP_POLICY', [ACCOUNT_E], [ACCOUNT_A]),
      ]),
    );
    await vi.advanceTimersByTimeAsync(800);

    expect(startedWrites).toEqual([`attach:p-tag:${ACCOUNT_B}`, `attach:p-other:${ACCOUNT_D}`]);
    writeResolvers.get(`attach:p-other:${ACCOUNT_D}`)?.();
    writeResolvers.get(`attach:p-tag:${ACCOUNT_B}`)?.();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(999);
    expect(startedWrites).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(startedWrites[2]).toBe(`attach:p-backup:${ACCOUNT_E}`);

    writeResolvers.get(`attach:p-backup:${ACCOUNT_E}`)?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(startedWrites).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(startedWrites.slice(3)).toEqual([`detach:p-tag:${ACCOUNT_A}`, `detach:p-other:${ACCOUNT_C}`]);

    writeResolvers.get(`detach:p-other:${ACCOUNT_C}`)?.();
    writeResolvers.get(`detach:p-tag:${ACCOUNT_A}`)?.();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(startedWrites).toHaveLength(5);
    await vi.advanceTimersByTimeAsync(1);
    expect(startedWrites[5]).toBe(`detach:p-backup:${ACCOUNT_A}`);

    writeResolvers.get(`detach:p-backup:${ACCOUNT_A}`)?.();
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(
      result.response?.perPolicyResults.map(item =>
        item.accountResults.map(accountResult => `${accountResult.operation}:${accountResult.accountId}`),
      ),
    ).toEqual([
      [`attach:${ACCOUNT_B}`, `detach:${ACCOUNT_A}`],
      [`attach:${ACCOUNT_D}`, `detach:${ACCOUNT_C}`],
      [`attach:${ACCOUNT_E}`, `detach:${ACCOUNT_A}`],
    ]);
  });

  test('retains the old target when an A-to-B attachment fails', async () => {
    mockOrganizationState(
      { 'p-tag': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] },
      { onAttach: () => Promise.reject(new Error('attach failed')) },
    );

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_B], [ACCOUNT_A])]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
    expect(result.response?.perPolicyResults[0].accountResults).toEqual([
      expect.objectContaining({ accountId: ACCOUNT_B, operation: 'attach', status: 'failed' }),
      expect.objectContaining({ accountId: ACCOUNT_A, operation: 'detach', status: 'deferred' }),
    ]);
  });

  test('explains the two-deployment flow when an account reaches the policy-type attachment quota', async () => {
    mockOrganizationState(
      { 'p-tag': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] },
      { onAttach: () => Promise.reject(policyAttachmentQuotaError()) },
    );

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_B], [ACCOUNT_A])]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(1);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
    expect(result.response?.perPolicyResults[0].accountResults).toEqual([
      expect.objectContaining({
        accountId: ACCOUNT_B,
        operation: 'attach',
        status: 'failed',
        message: expect.stringContaining('one deployment'),
        error: {
          name: 'ConstraintViolationException',
          message: expect.stringContaining('second deployment'),
        },
      }),
      expect.objectContaining({ accountId: ACCOUNT_A, operation: 'detach', status: 'deferred' }),
    ]);
  });

  test('defers detachments across every policy when one policy attachment fails', async () => {
    mockOrganizationState(
      {
        'p-tag': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }],
        'p-backup': [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }],
      },
      {
        onAttach: (_accountId, policyId) =>
          policyId === 'p-backup' ? Promise.reject(new Error('backup attach failed')) : Promise.resolve({}),
      },
    );

    const result = await runModule(
      request([
        policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_B], [ACCOUNT_A]),
        policy('BackupPolicy', 'BACKUP_POLICY', [ACCOUNT_B], [ACCOUNT_A]),
      ]),
    );

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(2);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
    expect(
      result.response?.perPolicyResults
        .flatMap(item => item.accountResults)
        .filter(item => item.operation === 'detach'),
    ).toEqual([
      expect.objectContaining({ accountId: ACCOUNT_A, status: 'deferred' }),
      expect.objectContaining({ accountId: ACCOUNT_A, status: 'deferred' }),
    ]);
  });

  test('treats duplicate and not-attached write races idempotently', async () => {
    vi.useFakeTimers();
    mockOrganizationState(
      {
        'p-tag': [{ TargetId: ACCOUNT_B, Type: 'ACCOUNT' }],
        'p-backup': [],
      },
      {
        onAttach: () => Promise.reject(namedError('DuplicatePolicyAttachmentException')),
        onDetach: () => Promise.reject(namedError('PolicyNotAttachedException')),
      },
    );

    const resultPromise = manageTagAndBackupPolicyAccountAttachments(
      request([
        policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A], [ACCOUNT_B]),
        policy('BackupPolicy', 'BACKUP_POLICY', [ACCOUNT_B], []),
      ]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.perPolicyResults.flatMap(item => item.accountResults).map(item => item.status)).toEqual([
      'no-change',
      'no-change',
      'no-change',
    ]);
  });

  test('fails when a policy disappears during an attachment write', async () => {
    mockOrganizationState(
      { 'p-tag': [] },
      {
        onAttach: () => Promise.reject(namedError('PolicyNotFoundException')),
      },
    );

    const result = await runModule(request([policy()]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.perPolicyResults[0].status).toBe('failed');
    expect(result.response?.perPolicyResults[0].accountResults[0].error?.name).toBe('PolicyNotFoundException');
  });

  test('dry-run reports changes without attach or detach calls', async () => {
    mockOrganizationState({
      'p-tag': [
        { TargetId: ACCOUNT_B, Type: 'ACCOUNT' },
        { TargetId: ACCOUNT_C, Type: 'ACCOUNT' },
      ],
    });

    const result = await runModule(request([policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A], [ACCOUNT_B])], true));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(result.response?.perPolicyResults[0].status).toBe('dry-run');
    expect(result.summary).toBe(
      'tag-and-backup-policy-account-attachments dry run completed successfully - 1 policy(s) evaluated, 1 attachment(s) planned, 1 detachment(s) planned, 0 attachment(s) pending policy creation',
    );
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
    expect(unmanagedAttachmentLogs().map(log => log.details.accountIds)).toEqual([[ACCOUNT_C]]);
    expect(result.response?.perPolicyResults[0].unmanagedAccountIds).toEqual([ACCOUNT_C]);
  });

  test('dry-run reports a missing policy as pending creation without retrying', async () => {
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        return Promise.resolve({ Policies: [] });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy('NewTagPolicy', 'TAG_POLICY', [ACCOUNT_A, ACCOUNT_B])], true));

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(commandCalls(ListPoliciesCommand)).toHaveLength(1);
    expect(result.summary).toBe(
      'tag-and-backup-policy-account-attachments dry run completed successfully - 1 policy(s) evaluated, 0 attachment(s) planned, 0 detachment(s) planned, 2 attachment(s) pending policy creation',
    );
    expect(result.response?.perPolicyResults[0]).toMatchObject({
      policyName: 'NewTagPolicy',
      status: 'pending-create',
      accountResults: [
        { accountId: ACCOUNT_A, operation: 'attach', status: 'pending-create' },
        { accountId: ACCOUNT_B, operation: 'attach', status: 'pending-create' },
      ],
    });
  });

  test('retries policy discovery and recovers when the policy becomes visible', async () => {
    vi.useFakeTimers();
    let discoveryAttempts = 0;
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        discoveryAttempts++;
        return Promise.resolve({
          Policies: discoveryAttempts >= 3 ? [{ Id: 'p-tag', Name: 'TagPolicy' }] : [],
        });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return Promise.resolve({ Targets: [] });
      }
      if (command instanceof AttachPolicyCommand) {
        return Promise.resolve({});
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const resultPromise = manageTagAndBackupPolicyAccountAttachments(request([policy()]));
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.SUCCESS);
    expect(commandCalls(ListPoliciesCommand)).toHaveLength(3);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(1);
  });

  test('isolates a policy-type discovery failure and preserves configuration order', async () => {
    const accessDenied = new Error('policy discovery denied');
    accessDenied.name = 'AccessDeniedException';
    mockSend.mockImplementation(command => {
      if (command instanceof ListPoliciesCommand) {
        return command.input.Filter === 'TAG_POLICY'
          ? Promise.reject(accessDenied)
          : Promise.resolve({ Policies: [{ Id: 'p-backup', Name: 'BackupPolicy' }] });
      }
      if (command instanceof ListTargetsForPolicyCommand) {
        return Promise.resolve({ Targets: [{ TargetId: ACCOUNT_A, Type: 'ACCOUNT' }] });
      }
      return Promise.reject(new Error('Unexpected command'));
    });

    const result = await runModule(request([policy(), policy('BackupPolicy', 'BACKUP_POLICY')]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(commandCalls(ListPoliciesCommand).map(command => command.input.Filter)).toEqual([
      'TAG_POLICY',
      'BACKUP_POLICY',
    ]);
    expect(result.response?.perPolicyResults.map(item => [item.policyName, item.status])).toEqual([
      ['TagPolicy', 'failed'],
      ['BackupPolicy', 'no-change'],
    ]);
    expect(result.error).toEqual({ name: 'AccessDeniedException', message: 'policy discovery denied' });
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('defers a healthy policy detachment when another policy has a generic target preflight failure', async () => {
    mockTagPolicyTargetPreflightFailure();

    const result = await runModule(request([policy(), policy('BackupPolicy', 'BACKUP_POLICY', [], [ACCOUNT_A])]));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.perPolicyResults.map(item => [item.policyName, item.status])).toEqual([
      ['TagPolicy', 'failed'],
      ['BackupPolicy', 'deferred'],
    ]);
    expect(result.error).toEqual({ name: 'AccessDeniedException', message: 'target discovery denied' });
    expect(result.response?.perPolicyResults[1]).toMatchObject({
      policyName: 'BackupPolicy',
      status: 'deferred',
      message: 'Policy p-backup destructive changes were deferred by the global add-before-remove safety gate',
      accountResults: [
        {
          accountId: ACCOUNT_A,
          operation: 'detach',
          status: 'deferred',
          message:
            `detach policy for account ${ACCOUNT_A} deferred: ` +
            'Detach deferred because at least one policy preflight or account attachment failed during this execution',
        },
      ],
    });
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('reports a healthy policy detachment as deferred during dry-run after a hard preflight failure', async () => {
    mockTagPolicyTargetPreflightFailure();

    const result = await runModule(request([policy(), policy('BackupPolicy', 'BACKUP_POLICY', [], [ACCOUNT_A])], true));

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(result.response?.perPolicyResults.map(item => [item.policyName, item.status])).toEqual([
      ['TagPolicy', 'failed'],
      ['BackupPolicy', 'deferred'],
    ]);
    expect(result.error).toEqual({ name: 'AccessDeniedException', message: 'target discovery denied' });
    expect(result.response?.perPolicyResults[1]).toMatchObject({
      policyName: 'BackupPolicy',
      status: 'deferred',
      message: 'Policy p-backup destructive changes were deferred by the global add-before-remove safety gate',
      accountResults: [
        {
          accountId: ACCOUNT_A,
          operation: 'detach',
          status: 'deferred',
          message:
            `detach policy for account ${ACCOUNT_A} deferred: ` +
            'Detach would be deferred because at least one policy preflight failed',
        },
      ],
    });
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(commandCalls(DetachPolicyCommand)).toHaveLength(0);
  });

  test('isolates account and policy failures and continues reconciliation', async () => {
    vi.useFakeTimers();
    mockOrganizationState(
      {
        'p-tag': [],
        'p-backup': [],
      },
      {
        onAttach: accountId =>
          accountId === ACCOUNT_A ? Promise.reject(new Error('attach failed')) : Promise.resolve({}),
      },
    );

    const resultPromise = manageTagAndBackupPolicyAccountAttachments(
      request([
        policy('TagPolicy', 'TAG_POLICY', [ACCOUNT_A, ACCOUNT_B]),
        policy('BackupPolicy', 'BACKUP_POLICY', [ACCOUNT_B]),
      ]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(commandCalls(AttachPolicyCommand)).toHaveLength(3);
    expect(result.response?.perPolicyResults[0].status).toBe('failed');
    expect(result.response?.perPolicyResults[1].status).toBe('reconciled');
  });

  test('exhausts bounded policy discovery retries before failing the missing policy', async () => {
    vi.useFakeTimers();
    mockOrganizationState({});

    const resultPromise = manageTagAndBackupPolicyAccountAttachments(
      request([policy('MissingPolicy'), policy('MissingPolicy2'), policy('BackupPolicy', 'BACKUP_POLICY')]),
    );
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe(MODULE_STATE_CODE.FAILED);
    expect(commandCalls(ListPoliciesCommand).filter(command => command.input.Filter === 'TAG_POLICY')).toHaveLength(5);
    expect(commandCalls(ListPoliciesCommand).map(command => command.input.Filter)).toEqual([
      'TAG_POLICY',
      'BACKUP_POLICY',
      'TAG_POLICY',
      'TAG_POLICY',
      'TAG_POLICY',
      'TAG_POLICY',
    ]);
    expect(result.response?.perPolicyResults[0].error?.name).toBe('PolicyNotFound');
    expect(result.response?.perPolicyResults[1].error?.name).toBe('PolicyNotFound');
    expect(result.response?.perPolicyResults[2].status).toBe('reconciled');
    expect(result.response?.perPolicyResults.map(item => item.policyName)).toEqual([
      'MissingPolicy',
      'MissingPolicy2',
      'BackupPolicy',
    ]);
  });
});

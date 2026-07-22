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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import {
  OrganizationsClient,
  DescribePolicyCommand,
  AttachPolicyCommand,
  DetachPolicyCommand,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

// Mock config loaders before importing the handler
vi.mock('@aws-accelerator/config/lib/accounts-config', () => ({
  AccountsConfig: {
    load: vi.fn().mockReturnValue({
      loadAccountIds: vi.fn(),
      accountIds: [{ accountId: '111111111111' }],
    }),
  },
}));

const ignoredOuNames = new Set<string>(['IgnoredOu']);

vi.mock('@aws-accelerator/config/lib/organization-config', () => ({
  OrganizationConfig: {
    loadRawOrganizationsConfig: vi.fn().mockReturnValue({
      loadOrganizationalUnitIds: vi.fn(),
      serviceControlPolicies: [{ name: 'TestPolicy', policy: '../../../../test/aws-events/fixtures/test-policy.json' }],
      organizationalUnitIds: [
        { id: 'ou-1234-abcdef', name: 'ManagedOu' },
        { id: 'ou-1234-ignored', name: 'IgnoredOu' },
      ],
      isIgnored: (name: string) => ignoredOuNames.has(name),
    }),
  },
}));

let orgsMock: AwsClientStub<OrganizationsClient>;
let snsMock: AwsClientStub<SNSClient>;

// Set required env vars before importing handler
process.env['ACCELERATOR_PREFIX'] = 'AWSAccelerator';
process.env['SNS_TOPIC_ARN'] = 'arn:aws:sns:us-east-1:111111111111:TestTopic';
process.env['AWS_PARTITION'] = 'aws';
process.env['HOME_REGION'] = 'us-east-1';
process.env['ORGANIZATIONS_ENABLED'] = 'true';
process.env['SINGLE_ACCOUNT_MODE'] = 'false';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handler: any;

beforeEach(async () => {
  orgsMock = mockClient(OrganizationsClient);
  snsMock = mockClient(SNSClient);
  snsMock.on(PublishCommand).resolves({ MessageId: 'test-msg-id' });

  // Dynamic import to pick up mocks
  const mod = await import('../../lib/aws-events/revert-scp-changes/index');
  handler = mod.handler;
});

afterEach(() => {
  orgsMock.restore();
  snsMock.restore();
  vi.resetModules();
});

function makeEvent(eventName: string, policyId: string, userArn: string, targetId?: string) {
  return {
    detail: {
      eventName,
      requestParameters: { policyId, ...(targetId && { targetId }) },
      userIdentity: { arn: userArn },
    },
  };
}

describe('revert-scp-changes handler', () => {
  it('should exit gracefully when policy has been deleted (PolicyNotFoundException)', async () => {
    const error = new Error('Policy not found');
    error.name = 'PolicyNotFoundException';
    orgsMock.on(DescribePolicyCommand).rejects(error);

    const event = makeEvent(
      'DetachPolicy',
      'p-deleted123',
      'arn:aws:iam::111111111111:role/ManualRole',
      'ou-1234-abcdef',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    // No SNS error notification should be sent
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('should send error notification with generic policy wording on non-PolicyNotFoundException errors', async () => {
    const error = new Error('Access denied');
    error.name = 'AccessDeniedException';
    orgsMock.on(DescribePolicyCommand).rejects(error);

    const event = makeEvent('UpdatePolicy', 'p-error456', 'arn:aws:iam::111111111111:role/ManualRole');

    await expect(handler(event)).rejects.toThrow('Error fetching policy details for policy p-error456');

    const snsCalls = snsMock.commandCalls(PublishCommand);
    expect(snsCalls).toHaveLength(1);
    const message = snsCalls[0].args[0].input.Message;
    expect(message).toContain('organizational policy');
    expect(message).toContain('p-error456');
    expect(message).not.toContain('SCP');
  });

  it('should exit early when change is made by an accelerator assumed-role session', async () => {
    // CloudTrail emits the assumed-role form for role-based callers (Lambda/CodeBuild/pipeline).
    // This is the shape the accelerator's own revert Lambda call surfaces as, so it MUST be
    // recognized as accelerator-made to avoid reverting legitimate changes and to guard the
    // revert Lambda's own UpdatePolicy from re-triggering the EventBridge rule (revert loop).
    const event = makeEvent(
      'UpdatePolicy',
      'p-abc123',
      'arn:aws:sts::111111111111:assumed-role/AWSAccelerator-SomeRole/AWSCodeBuild-1234567890',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(DescribePolicyCommand)).toHaveLength(0);
  });

  it('should exit early when change is made by a direct accelerator IAM role ARN', async () => {
    const event = makeEvent('UpdatePolicy', 'p-abc123', 'arn:aws:iam::111111111111:role/AWSAccelerator-SomeRole');
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(DescribePolicyCommand)).toHaveLength(0);
  });

  it('should NOT exit early when an IAM user name merely starts with the accelerator prefix', async () => {
    // Regression test for the weak principal check: an IAM user (not a role) whose name starts
    // with "AWSAccelerator" must not be treated as an accelerator-made change.
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-spoof1', Name: 'BackupPolicy', Type: 'BACKUP_POLICY' },
        Content: '{}',
      },
    });

    const event = makeEvent('UpdatePolicy', 'p-spoof1', 'arn:aws:iam::111111111111:user/AWSAccelerator-imposter');
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    // Handler must have proceeded past the accelerator check and fetched policy details.
    expect(orgsMock.commandCalls(DescribePolicyCommand)).toHaveLength(1);
  });

  it('should NOT exit early when an SSO assumed-role session name starts with the accelerator prefix', async () => {
    // An IAM Identity Center principal whose session name starts with "AWSAccelerator" must not
    // bypass the revert - the extracted role name (AWSReservedSSO_Admin_abc123) does not start
    // with the accelerator prefix, so only a genuine accelerator role name qualifies.
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-spoof2', Name: 'BackupPolicy', Type: 'BACKUP_POLICY' },
        Content: '{}',
      },
    });

    const event = makeEvent(
      'UpdatePolicy',
      'p-spoof2',
      'arn:aws:sts::111111111111:assumed-role/AWSReservedSSO_Admin_abc123/AWSAccelerator-imposter',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(DescribePolicyCommand)).toHaveLength(1);
  });

  it('should NOT exit early when a direct IAM role ARN uses a path segment that starts with the accelerator prefix', async () => {
    // A role created under a path whose first segment starts with "AWSAccelerator" must not bypass
    // the revert. The role name is the final ARN segment (AttackerRole), not the path prefix, so
    // the extracted role name does not start with the accelerator prefix.
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-spoof3', Name: 'BackupPolicy', Type: 'BACKUP_POLICY' },
        Content: '{}',
      },
    });

    const event = makeEvent(
      'UpdatePolicy',
      'p-spoof3',
      'arn:aws:iam::111111111111:role/AWSAccelerator-Admin/AttackerRole',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(DescribePolicyCommand)).toHaveLength(1);
  });

  it('should exit early when a direct accelerator IAM role ARN uses a path', async () => {
    // The role name is the final segment after any path, so a genuine accelerator role deployed
    // under a path is still recognized as accelerator-made.
    const event = makeEvent(
      'UpdatePolicy',
      'p-abc123',
      'arn:aws:iam::111111111111:role/some/path/AWSAccelerator-SomeRole',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(DescribePolicyCommand)).toHaveLength(0);
  });

  it('should reattach a detached SCP and send success notification with updated subject', async () => {
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-scp789', Name: 'TestPolicy', Type: 'SERVICE_CONTROL_POLICY' },
        Content: '{}',
      },
    });
    orgsMock.on(AttachPolicyCommand).resolves({});

    const event = makeEvent('DetachPolicy', 'p-scp789', 'arn:aws:iam::111111111111:role/ManualRole', 'ou-1234-abcdef');
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(AttachPolicyCommand)).toHaveLength(1);

    const snsCalls = snsMock.commandCalls(PublishCommand);
    expect(snsCalls).toHaveLength(1);
    expect(snsCalls[0].args[0].input.Subject).toBe('Organization Policy Remediation Success');
    expect(snsCalls[0].args[0].input.Message).toContain('p-scp789');
  });

  it('should not reattach an SCP detached from an OU flagged ignore: true', async () => {
    // Policy is not managed by accelerator and the target OU is ignored, so the change is left alone
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-unmanaged1', Name: 'UnmanagedPolicy', Type: 'SERVICE_CONTROL_POLICY' },
        Content: '{}',
      },
    });
    orgsMock.on(AttachPolicyCommand).resolves({});

    const event = makeEvent(
      'DetachPolicy',
      'p-unmanaged1',
      'arn:aws:iam::111111111111:role/ManualRole',
      'ou-1234-ignored',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('should not reattach an accelerator-managed SCP detached from an OU flagged ignore: true', async () => {
    // Policy is managed by accelerator but the target OU is ignored, so the change is left alone
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-scp-ignored', Name: 'TestPolicy', Type: 'SERVICE_CONTROL_POLICY' },
        Content: '{}',
      },
    });
    orgsMock.on(AttachPolicyCommand).resolves({});

    const event = makeEvent(
      'DetachPolicy',
      'p-scp-ignored',
      'arn:aws:iam::111111111111:role/ManualRole',
      'ou-1234-ignored',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(AttachPolicyCommand)).toHaveLength(0);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('should not detach an accelerator-managed SCP attached to an OU flagged ignore: true', async () => {
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-scp-ignored', Name: 'TestPolicy', Type: 'SERVICE_CONTROL_POLICY' },
        Content: '{}',
      },
    });
    orgsMock.on(DetachPolicyCommand).resolves({});

    const event = makeEvent(
      'AttachPolicy',
      'p-scp-ignored',
      'arn:aws:iam::111111111111:role/ManualRole',
      'ou-1234-ignored',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(DetachPolicyCommand)).toHaveLength(0);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it('should reattach an SCP detached from a managed (non-ignored) OU', async () => {
    // Policy is not managed by accelerator but the target OU is managed, so the change is reverted
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-unmanaged2', Name: 'UnmanagedPolicy', Type: 'SERVICE_CONTROL_POLICY' },
        Content: '{}',
      },
    });
    orgsMock.on(AttachPolicyCommand).resolves({});

    const event = makeEvent(
      'DetachPolicy',
      'p-unmanaged2',
      'arn:aws:iam::111111111111:role/ManualRole',
      'ou-1234-abcdef',
    );
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(AttachPolicyCommand)).toHaveLength(1);
  });

  it('should revert updates to an accelerator-managed SCP', async () => {
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-scp-update', Name: 'TestPolicy', Type: 'SERVICE_CONTROL_POLICY' },
        Content: '{"Version":"modified"}',
      },
    });
    orgsMock.on(UpdatePolicyCommand).resolves({});

    const event = makeEvent('UpdatePolicy', 'p-scp-update', 'arn:aws:iam::111111111111:role/ManualRole');
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(orgsMock.commandCalls(UpdatePolicyCommand)).toHaveLength(1);
    expect(orgsMock.commandCalls(UpdatePolicyCommand)[0].args[0].input).toEqual({
      Content: JSON.stringify({ Version: '2012-10-17', Statement: [] }),
      PolicyId: 'p-scp-update',
    });
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
  });

  it('should exit when policy type is not SERVICE_CONTROL_POLICY', async () => {
    orgsMock.on(DescribePolicyCommand).resolves({
      Policy: {
        PolicySummary: { Id: 'p-backup1', Name: 'BackupPolicy', Type: 'BACKUP_POLICY' },
        Content: '{}',
      },
    });

    const event = makeEvent('UpdatePolicy', 'p-backup1', 'arn:aws:iam::111111111111:role/ManualRole');
    const result = await handler(event);

    expect(result).toEqual({ statusCode: 200 });
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });
});

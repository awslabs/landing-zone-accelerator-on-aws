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
import { OrganizationsClient, DescribePolicyCommand, AttachPolicyCommand } from '@aws-sdk/client-organizations';
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

vi.mock('@aws-accelerator/config/lib/organization-config', () => ({
  OrganizationConfig: {
    loadRawOrganizationsConfig: vi.fn().mockReturnValue({
      loadOrganizationalUnitIds: vi.fn(),
      serviceControlPolicies: [{ name: 'TestPolicy', policy: 'test-policy.json' }],
      organizationalUnitIds: [{ id: 'ou-1234-abcdef' }],
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

  it('should exit early when change is made by accelerator role', async () => {
    const event = makeEvent('UpdatePolicy', 'p-abc123', 'arn:aws:iam::111111111111:role/AWSAccelerator-OrgRole');
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

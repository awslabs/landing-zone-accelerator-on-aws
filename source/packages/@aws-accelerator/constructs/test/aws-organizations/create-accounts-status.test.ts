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
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import type { DescribeAccountCommandOutput } from '@aws-sdk/client-organizations';
import {
  DescribeAccountCommand,
  DescribeCreateAccountStatusCommand,
  CreateAccountCommand,
  ListRootsCommand,
  MoveAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildAccountOrgInfo,
  handler,
  isAccountLifecycleActive,
} from '../../lib/aws-organizations/create-accounts-status';

describe('create-accounts-status account cache serialization', () => {
  it('writes State to the compatible status key and falls back to Status', () => {
    expect(
      buildAccountOrgInfo('account@example.com', '111111111111', {
        State: 'ACTIVE',
        Status: 'SUSPENDED',
      }),
    ).toEqual({
      email: 'account@example.com',
      accountId: '111111111111',
      status: 'ACTIVE',
      orgsApiResponse: {
        State: 'ACTIVE',
        Status: 'SUSPENDED',
      },
    });
    expect(
      buildAccountOrgInfo('legacy@example.com', '222222222222', {
        Status: 'ACTIVE',
      }).status,
    ).toBe('ACTIVE');
  });
});

describe('create-accounts-status account activation gate', () => {
  it('treats an account as active when State is ACTIVE', () => {
    expect(isAccountLifecycleActive({ State: 'ACTIVE', Status: 'ACTIVE' })).toBe(true);
  });

  it('does NOT treat a newly created account as active while State is still PENDING_ACTIVATION, even if legacy Status is ACTIVE (ADC race)', () => {
    expect(isAccountLifecycleActive({ State: 'PENDING_ACTIVATION', Status: 'ACTIVE' })).toBe(false);
  });

  it('falls back to legacy Status when State is not populated', () => {
    expect(isAccountLifecycleActive({ Status: 'ACTIVE' })).toBe(true);
    expect(isAccountLifecycleActive({ Status: 'SUSPENDED' })).toBe(false);
  });

  it('treats an undefined account as not active', () => {
    expect(isAccountLifecycleActive(undefined)).toBe(false);
  });
});

describe('create-accounts-status handler activation gate', () => {
  let orgsMock: AwsClientStub<OrganizationsClient>;
  let ddbMock: AwsClientStub<DynamoDBDocumentClient>;

  const accountId = '111122223333';
  const email = 'new-account@example.com';
  const event = { RequestType: 'Update' } as unknown as Parameters<typeof handler>[0];
  const context = {
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:createAccountsStatus',
  } as unknown as Parameters<typeof handler>[1];

  beforeEach(() => {
    orgsMock = mockClient(OrganizationsClient);
    ddbMock = mockClient(DynamoDBDocumentClient);

    // Default every SDK call to a benign 200 response; specific commands are overridden below.
    orgsMock.resolves({ $metadata: { httpStatusCode: 200 } });
    ddbMock.resolves({ $metadata: { httpStatusCode: 200 } });

    // One account is queued for creation and already past CreateAccount (createRequestId set), so the
    // handler takes the status-poll branch where the ACTIVE gate lives.
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          accountConfig: {
            S: JSON.stringify({
              name: 'NewAccount',
              description: 'test',
              email,
              enableGovCloud: 'false',
              organizationalUnitId: 'ou-1111-11111111',
              createRequestId: 'car-request-id',
            }),
          },
        },
      ],
    });
    ddbMock.on(GetCommand).resolves({
      Item: { dataType: 'workloadAccount', acceleratorKey: email, awsKey: '' },
      $metadata: { httpStatusCode: 200 },
    });
    orgsMock.on(DescribeCreateAccountStatusCommand).resolves({
      CreateAccountStatus: { State: 'SUCCEEDED', AccountId: accountId },
    });
    orgsMock.on(ListRootsCommand).resolves({
      Roots: [{ Name: 'Root', Id: 'r-1111' }],
      $metadata: { httpStatusCode: 200 },
    });
  });

  afterEach(() => {
    orgsMock.restore();
    ddbMock.restore();
  });

  it('defers (IsComplete:false) and does not move the account while it is PENDING_ACTIVATION', async () => {
    orgsMock.on(DescribeAccountCommand).resolves({
      Account: { Id: accountId, Email: email, State: 'PENDING_ACTIVATION', Status: 'ACTIVE' },
    } as unknown as DescribeAccountCommandOutput);

    const result = await handler(event, context);

    expect(result).toEqual({ IsComplete: false });
    // The account lifecycle was actually checked...
    expect(orgsMock.commandCalls(DescribeAccountCommand).length).toBeGreaterThanOrEqual(1);
    // ...and completion was withheld: the account was NOT moved to its OU.
    expect(orgsMock.commandCalls(MoveAccountCommand).length).toBe(0);
    expect(orgsMock.commandCalls(ListRootsCommand).length).toBe(0);
  });

  it('proceeds to completion (moves the account) once it is ACTIVE', async () => {
    orgsMock.on(DescribeAccountCommand).resolves({
      Account: { Id: accountId, Email: email, State: 'ACTIVE', Status: 'ACTIVE' },
    } as unknown as DescribeAccountCommandOutput);

    const result = await handler(event, context);

    expect(result).toEqual({ IsComplete: false });
    // handleSucceededAccountCreation ran: the account was moved to its OU.
    expect(orgsMock.commandCalls(MoveAccountCommand).length).toBe(1);
  });

  it('on the direct-create path, persists createRequestId and defers when the new account is PENDING_ACTIVATION', async () => {
    // No createRequestId in the queued config -> handler takes the direct-create branch.
    ddbMock.on(ScanCommand).resolves({
      Items: [
        {
          accountConfig: {
            S: JSON.stringify({
              name: 'NewAccount',
              description: 'test',
              email,
              enableGovCloud: false,
              organizationalUnitId: 'ou-1111-11111111',
            }),
          },
        },
      ],
    });
    orgsMock.on(CreateAccountCommand).resolves({
      CreateAccountStatus: { State: 'SUCCEEDED', Id: 'car-new-id', AccountId: accountId },
    });
    orgsMock.on(DescribeAccountCommand).resolves({
      Account: { Id: accountId, Email: email, State: 'PENDING_ACTIVATION', Status: 'ACTIVE' },
    } as unknown as DescribeAccountCommandOutput);

    const result = await handler(event, context);

    expect(result).toEqual({ IsComplete: false });
    // Completion withheld: the account was NOT moved to its OU.
    expect(orgsMock.commandCalls(MoveAccountCommand).length).toBe(0);
    // The create request id was persisted so the next poll resumes via the status-poll branch
    // instead of re-running CreateAccount (which would fail EMAIL_ALREADY_EXISTS and orphan it).
    const putCalls = ddbMock.commandCalls(PutCommand);
    expect(putCalls.length).toBeGreaterThanOrEqual(1);
    const persisted = JSON.parse(putCalls[putCalls.length - 1].args[0].input.Item!.accountConfig as string);
    expect(persisted.createRequestId).toBe('car-new-id');
  });
});

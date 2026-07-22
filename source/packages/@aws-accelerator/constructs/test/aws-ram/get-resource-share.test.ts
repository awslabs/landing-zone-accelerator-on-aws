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
/* eslint @typescript-eslint/no-explicit-any: 0 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AcceptResourceShareInvitationCommand,
  GetResourceShareInvitationsCommand,
  GetResourceSharesCommand,
  RAMClient,
} from '@aws-sdk/client-ram';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import type { CloudFormationCustomResourceCreateEvent } from '@aws-accelerator/utils/lib/common-types';

// Make delay() a counted no-op so backoff timing can be asserted without real waits.
vi.mock('@aws-accelerator/utils/lib/throttle', () => ({
  throttlingBackOff: vi.fn(<T>(fn: () => Promise<T>) => fn()),
  delay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@aws-accelerator/utils/lib/common-functions', () => ({
  setRetryStrategy: vi.fn(() => ({})),
}));

import { handler } from '../../lib/aws-ram/get-resource-share';
import { delay } from '@aws-accelerator/utils/lib/throttle';

const OWNING_ACCOUNT_ID = '111111111111';
const SHARE_NAME = 'test-resource-share';
const RESOURCE_SHARE_ARN = 'arn:aws:ram:us-east-1:111111111111:resource-share/abcd-1234';
const INVITATION_ARN = 'arn:aws:ram:us-east-1:111111111111:resource-share-invitation/efgh-5678';

const baseEvent: CloudFormationCustomResourceCreateEvent = {
  RequestType: 'Create',
  ResponseURL: 'https://example.com',
  ServiceToken: 'example-service-token',
  StackId: 'example-stack-id',
  RequestId: 'example-request-id',
  ResourceType: 'Custom::GetResourceShare',
  LogicalResourceId: 'example-logical-resource-id',
  ResourceProperties: {
    ServiceToken: 'example-service-token',
    resourceOwner: 'OTHER-ACCOUNTS',
    owningAccountId: OWNING_ACCOUNT_ID,
    name: SHARE_NAME,
  },
};

const pendingInvitation = {
  status: 'PENDING',
  senderAccountId: OWNING_ACCOUNT_ID,
  resourceShareName: SHARE_NAME,
  resourceShareInvitationArn: INVITATION_ARN,
};

const matchingShare = {
  owningAccountId: OWNING_ACCOUNT_ID,
  name: SHARE_NAME,
  resourceShareArn: RESOURCE_SHARE_ARN,
};

function makeUnauthorized(): Error {
  // RAM throws this while a freshly-created share is still propagating to the target account.
  return Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedException' });
}

const delayMock = delay as unknown as ReturnType<typeof vi.fn>;
let ramMock: AwsClientStub<RAMClient>;

beforeEach(() => {
  vi.clearAllMocks();
  ramMock = mockClient(RAMClient);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  ramMock.restore();
});

describe('get-resource-share — RAM invitation-fetch eventual-consistency retry (issue #4700)', () => {
  describe('fix: transient UnauthorizedException on the first invitation fetch', () => {
    it('retries when the first GetResourceShareInvitations throws UnauthorizedException, then succeeds', async () => {
      ramMock
        .on(GetResourceShareInvitationsCommand)
        .rejectsOnce(makeUnauthorized())
        .resolves({ resourceShareInvitations: [] });
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [matchingShare] });

      const result = await handler(baseEvent);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
      // attempt 0 (delay 0) fails unauthorized; attempt 1 (delay 1000) succeeds
      expect(delayMock.mock.calls.map(c => c[0])).toEqual([0, 1000]);
      expect(ramMock.commandCalls(GetResourceShareInvitationsCommand).length).toBe(2);
    });

    it('recovers mid-window (third attempt) and still returns SUCCESS', async () => {
      ramMock
        .on(GetResourceShareInvitationsCommand)
        .rejectsOnce(makeUnauthorized())
        .rejectsOnce(makeUnauthorized())
        .resolves({ resourceShareInvitations: [] });
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [matchingShare] });

      const result = await handler(baseEvent);

      expect(result).toMatchObject({ Status: 'SUCCESS', PhysicalResourceId: 'abcd-1234' });
      expect(delayMock.mock.calls.map(c => c[0])).toEqual([0, 1000, 4000]);
      expect(ramMock.commandCalls(GetResourceShareInvitationsCommand).length).toBe(3);
    });

    it('throws after MAX_ATTEMPTS=6 when UnauthorizedException never resolves (no masking)', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).rejects(makeUnauthorized());

      await expect(handler(baseEvent)).rejects.toThrow(/Unauthorized/);

      // quadratic schedule: 0, 1, 4, 9, 16, 25 seconds
      expect(delayMock.mock.calls.map(c => c[0])).toEqual([0, 1000, 4000, 9000, 16000, 25000]);
      expect(ramMock.commandCalls(GetResourceShareInvitationsCommand).length).toBe(6);
    });

    it('accepts a PENDING invitation that appears only after the share propagates', async () => {
      ramMock
        .on(GetResourceShareInvitationsCommand)
        .rejectsOnce(makeUnauthorized())
        .resolves({ resourceShareInvitations: [pendingInvitation] });
      ramMock.on(AcceptResourceShareInvitationCommand).resolves({});
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [matchingShare] });

      const result = await handler(baseEvent);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
      expect(ramMock.commandCalls(AcceptResourceShareInvitationCommand).length).toBe(1);
      expect(ramMock.commandCalls(AcceptResourceShareInvitationCommand)[0].args[0].input).toEqual({
        resourceShareInvitationArn: INVITATION_ARN,
      });
    });
  });

  describe('scope: only transient UnauthorizedException is retried', () => {
    it('rethrows a non-UnauthorizedException error immediately without retrying', async () => {
      const boom = Object.assign(new Error('boom'), { name: 'ValidationException' });
      ramMock.on(GetResourceShareInvitationsCommand).rejects(boom);

      await expect(handler(baseEvent)).rejects.toThrow('boom');

      // first attempt only (delay 0); no further retries for a non-transient error
      expect(delayMock.mock.calls.map(c => c[0])).toEqual([0]);
      expect(ramMock.commandCalls(GetResourceShareInvitationsCommand).length).toBe(1);
    });
  });

  describe('preservation: existing behavior is unchanged for non-buggy inputs', () => {
    it('accepts a PENDING invitation, validates it, and returns the share ARN', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).resolves({ resourceShareInvitations: [pendingInvitation] });
      ramMock.on(AcceptResourceShareInvitationCommand).resolves({});
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [matchingShare] });

      const result = await handler(baseEvent);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
      expect(ramMock.commandCalls(AcceptResourceShareInvitationCommand).length).toBe(1);
    });

    it('returns the share when there is no pending invitation to accept', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).resolves({ resourceShareInvitations: [] });
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [matchingShare] });

      const result = await handler(baseEvent);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
      expect(ramMock.commandCalls(AcceptResourceShareInvitationCommand).length).toBe(0);
    });

    it('throws "not accepted successfully" when validateResourceShare never finds the share', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).resolves({ resourceShareInvitations: [pendingInvitation] });
      ramMock.on(AcceptResourceShareInvitationCommand).resolves({});
      // validateResourceShare keeps getting empty results -> found stays false
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [] });

      await expect(handler(baseEvent)).rejects.toThrow(`Resource share ${SHARE_NAME} not accepted successfully`);
    });

    it('throws "not found" when no matching resource share exists after the lookup loop', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).resolves({ resourceShareInvitations: [] });
      ramMock.on(GetResourceSharesCommand).resolves({
        resourceShares: [{ owningAccountId: '999999999999', name: 'other-share', resourceShareArn: 'arn:x/zzz' }],
      });

      await expect(handler(baseEvent)).rejects.toThrow(`Resource share ${SHARE_NAME} not found`);
    });

    it('pages through resource shares via nextToken during lookup', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).resolves({ resourceShareInvitations: [] });
      ramMock
        .on(GetResourceSharesCommand)
        .resolvesOnce({ resourceShares: [], nextToken: 'page-2' })
        .resolves({ resourceShares: [matchingShare] });

      const result = await handler(baseEvent);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
      expect(ramMock.commandCalls(GetResourceSharesCommand).length).toBe(2);
    });

    it('does not accept invitations that do not match the owning account and share name', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).resolves({
        resourceShareInvitations: [
          {
            status: 'PENDING',
            senderAccountId: '999999999999',
            resourceShareName: SHARE_NAME,
            resourceShareInvitationArn: 'arn:x',
          },
          {
            status: 'ACCEPTED',
            senderAccountId: OWNING_ACCOUNT_ID,
            resourceShareName: SHARE_NAME,
            resourceShareInvitationArn: 'arn:y',
          },
        ],
      });
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [matchingShare] });

      const result = await handler(baseEvent);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
      expect(ramMock.commandCalls(AcceptResourceShareInvitationCommand).length).toBe(0);
    });

    it('handles Update events the same way as Create events', async () => {
      ramMock.on(GetResourceShareInvitationsCommand).resolves({ resourceShareInvitations: [] });
      ramMock.on(GetResourceSharesCommand).resolves({ resourceShares: [matchingShare] });

      const updateEvent = { ...baseEvent, RequestType: 'Update' as const, PhysicalResourceId: 'abcd-1234' };
      const result = await handler(updateEvent as any);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
    });

    it('Delete event short-circuits without calling RAM or delay', async () => {
      const deleteEvent = { ...baseEvent, RequestType: 'Delete' as const, PhysicalResourceId: 'abcd-1234' };

      const result = await handler(deleteEvent as any);

      expect(result).toEqual({ PhysicalResourceId: 'abcd-1234', Status: 'SUCCESS' });
      expect(delayMock).not.toHaveBeenCalled();
      expect(ramMock.commandCalls(GetResourceShareInvitationsCommand).length).toBe(0);
    });
  });
});

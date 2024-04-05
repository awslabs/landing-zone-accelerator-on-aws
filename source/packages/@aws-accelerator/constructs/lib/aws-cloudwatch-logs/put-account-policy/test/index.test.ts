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
  CloudWatchLogsClient,
  PutAccountPolicyCommand,
  DescribeAccountPoliciesCommand,
  PolicyType,
  Scope,
  DeleteAccountPolicyCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { describe, beforeEach, expect, test } from '@jest/globals';
import { handler } from '../index';
import { AcceleratorMockClient, EventType } from '../../../../test/unit-test/common/resources';

import { StaticInput } from './static-input';

import { AcceleratorUnitTest } from '../../../../test/unit-test/accelerator-unit-test';

const client = AcceleratorMockClient(CloudWatchLogsClient);

describe('No existing Policy found.', () => {
  beforeEach(() => {
    client.reset();
  });
  test('Create/Update Success - No Override Existing policy .', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.createEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [],
      });

    client
      .on(PutAccountPolicyCommand, {
        policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
        scope: Scope.ALL,
      })
      .resolves({ accountPolicy: StaticInput.createOperationOutput });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });

  test('Delete Success - No Override Existing policy.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [StaticInput.createEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [],
      });

    client
      .on(DeleteAccountPolicyCommand, {
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });

  test('Create/Update Success - Override Existing policy.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.overrideExistingCreateEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [],
      });

    client
      .on(PutAccountPolicyCommand, {
        policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
        scope: Scope.ALL,
      })
      .resolves({ accountPolicy: StaticInput.createOperationOutput });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });

  test('Delete Success - Override Existing policy.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [StaticInput.overrideExistingCreateEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [],
      });

    client
      .on(DeleteAccountPolicyCommand, {
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });
});

describe('Existing Policy found.', () => {
  beforeEach(() => {
    client.reset();
  });

  test('Create/Update Success - No Override Existing policy', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.createEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [
          {
            policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
            policyName: StaticInput.policyName,
            policyType: PolicyType.DATA_PROTECTION_POLICY,
            scope: Scope.ALL,
            accountId: StaticInput.accountId,
          },
        ],
      });

    client
      .on(PutAccountPolicyCommand, {
        policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
        scope: Scope.ALL,
      })
      .resolves({ accountPolicy: StaticInput.createOperationOutput });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });

  test('Delete Success - No Override Existing policy.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [StaticInput.createEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [
          {
            policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
            policyName: StaticInput.policyName,
            policyType: PolicyType.DATA_PROTECTION_POLICY,
            scope: Scope.ALL,
            accountId: StaticInput.accountId,
          },
        ],
      });

    client
      .on(DeleteAccountPolicyCommand, {
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });

  test('Create/Update Success - Override Existing policy', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.UPDATE, {
      new: [StaticInput.overrideExistingUpdateEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [
          {
            policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
            policyName: StaticInput.policyName,
            policyType: PolicyType.DATA_PROTECTION_POLICY,
            scope: Scope.ALL,
            accountId: StaticInput.accountId,
          },
        ],
      });

    client
      .on(PutAccountPolicyCommand, {
        policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
        scope: Scope.ALL,
      })
      .resolves({ accountPolicy: StaticInput.createOperationOutput });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });

  test('Delete Success - Override Existing policy.', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.DELETE, {
      new: [StaticInput.overrideExistingCreateEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: [
          {
            policyDocument: JSON.stringify(StaticInput.createEventPolicyDocument),
            policyName: StaticInput.policyName,
            policyType: PolicyType.DATA_PROTECTION_POLICY,
            scope: Scope.ALL,
            accountId: StaticInput.accountId,
          },
        ],
      });

    client
      .on(DeleteAccountPolicyCommand, {
        policyName: StaticInput.policyName,
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({ $metadata: { httpStatusCode: 200 } });

    const response = await handler(event);
    expect(response).toStrictEqual(StaticInput.operationOutput);
  });
});

describe('Exception.', () => {
  beforeEach(() => {
    client.reset();
  });

  test('DescribeAccountPolicies accountPolicies undefined', async () => {
    const event = AcceleratorUnitTest.getEvent(EventType.CREATE, {
      new: [StaticInput.createEventProps],
    });

    client
      .on(DescribeAccountPoliciesCommand, {
        policyType: PolicyType.DATA_PROTECTION_POLICY,
      })
      .resolves({
        accountPolicies: undefined,
      });

    await expect(handler(event)).rejects.toThrow(StaticInput.missingAccountPolicies);
  });
});

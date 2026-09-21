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
import { DeleteCommand, DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  cleanupNotInUseOrganizationalUnits,
  putOrganizationConfigInTable,
} from '../../lib/lambdas/load-config-table/index';

const CONFIG_TABLE = 'AWSAccelerator-Config-test';

// Minimal OrganizationConfig-like stub carrying only the field the functions under test read.
function organizationConfigWith(ouNames: string[]): Parameters<typeof cleanupNotInUseOrganizationalUnits>[1] {
  return {
    organizationalUnits: ouNames.map(name => ({ name })),
  } as unknown as Parameters<typeof cleanupNotInUseOrganizationalUnits>[1];
}

describe('load-config-table cleanupNotInUseOrganizationalUnits', () => {
  let ddbMock: AwsClientStub<DynamoDBDocumentClient>;

  beforeEach(() => {
    ddbMock = mockClient(DynamoDBDocumentClient);
  });

  afterEach(() => {
    ddbMock.restore();
  });

  it('deletes an organization row that is not present in the config', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { dataType: 'organization', acceleratorKey: 'Sandbox' },
        { dataType: 'organization', acceleratorKey: 'OldOu' },
      ],
    });

    await cleanupNotInUseOrganizationalUnits(CONFIG_TABLE, organizationConfigWith(['Sandbox']));

    const deletes = ddbMock.commandCalls(DeleteCommand);
    expect(deletes.length).toBe(1);
    expect(deletes[0].args[0].input).toEqual({
      TableName: CONFIG_TABLE,
      Key: { dataType: 'organization', acceleratorKey: 'OldOu' },
    });
  });

  it('never deletes the synthetic Root row even though it is not in organizationalUnits', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { dataType: 'organization', acceleratorKey: 'Root' },
        { dataType: 'organization', acceleratorKey: 'Sandbox' },
      ],
    });

    await cleanupNotInUseOrganizationalUnits(CONFIG_TABLE, organizationConfigWith(['Sandbox']));

    expect(ddbMock.commandCalls(DeleteCommand).length).toBe(0);
  });

  it('compares nested OU rows by their exact path key', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { dataType: 'organization', acceleratorKey: 'Sandbox' },
        { dataType: 'organization', acceleratorKey: 'Sandbox/Nested' },
        { dataType: 'organization', acceleratorKey: 'Sandbox/Gone' },
      ],
    });

    await cleanupNotInUseOrganizationalUnits(CONFIG_TABLE, organizationConfigWith(['Sandbox', 'Sandbox/Nested']));

    const deletes = ddbMock.commandCalls(DeleteCommand);
    expect(deletes.length).toBe(1);
    expect(deletes[0].args[0].input.Key).toEqual({ dataType: 'organization', acceleratorKey: 'Sandbox/Gone' });
  });

  it('paginates the scan across LastEvaluatedKey', async () => {
    ddbMock
      .on(ScanCommand)
      .resolvesOnce({
        Items: [{ dataType: 'organization', acceleratorKey: 'OldOu' }],
        LastEvaluatedKey: { dataType: 'organization', acceleratorKey: 'OldOu' },
      })
      .resolves({
        Items: [{ dataType: 'organization', acceleratorKey: 'AlsoGone' }],
      });

    await cleanupNotInUseOrganizationalUnits(CONFIG_TABLE, organizationConfigWith(['Sandbox']));

    const scans = ddbMock.commandCalls(ScanCommand);
    expect(scans.length).toBe(2);
    expect(scans[1].args[0].input.ExclusiveStartKey).toEqual({
      dataType: 'organization',
      acceleratorKey: 'OldOu',
    });
    expect(ddbMock.commandCalls(DeleteCommand).length).toBe(2);
  });

  it('deletes nothing when every organization row is in the config', async () => {
    ddbMock.on(ScanCommand).resolves({
      Items: [
        { dataType: 'organization', acceleratorKey: 'Root' },
        { dataType: 'organization', acceleratorKey: 'Sandbox' },
      ],
    });

    await cleanupNotInUseOrganizationalUnits(CONFIG_TABLE, organizationConfigWith(['Sandbox']));

    expect(ddbMock.commandCalls(DeleteCommand).length).toBe(0);
  });
});

describe('load-config-table putOrganizationConfigInTable', () => {
  let ddbMock: AwsClientStub<DynamoDBDocumentClient>;

  beforeEach(() => {
    ddbMock = mockClient(DynamoDBDocumentClient);
    ddbMock.on(UpdateCommand).resolves({});
  });

  afterEach(() => {
    ddbMock.restore();
  });

  it('sets awsKey when the OU exists in AWS Organizations', async () => {
    await putOrganizationConfigInTable({ name: 'Sandbox' } as never, CONFIG_TABLE, 'ou-abcd-11111111', 'commit-1', {
      name: 'Sandbox',
      id: 'ou-abcd-11111111',
    } as never);

    const updates = ddbMock.commandCalls(UpdateCommand);
    expect(updates.length).toBe(1);
    expect(updates[0].args[0].input.UpdateExpression).toContain('#awsKey = :v_awsKey');
    expect(updates[0].args[0].input.UpdateExpression).not.toContain('remove');
    expect(updates[0].args[0].input.ExpressionAttributeValues?.[':v_awsKey']).toBe('ou-abcd-11111111');
  });

  it('removes a stale awsKey when the OU is not found in AWS Organizations (empty awsKey)', async () => {
    await putOrganizationConfigInTable({ name: 'Sandbox' } as never, CONFIG_TABLE, '', 'commit-2', {
      name: 'Sandbox',
      id: '',
    } as never);

    const updates = ddbMock.commandCalls(UpdateCommand);
    expect(updates.length).toBe(1);
    const expression = updates[0].args[0].input.UpdateExpression ?? '';
    // The stale awsKey must be actively removed so create-organizational-units recreates the OU.
    expect(expression).toContain('remove #awsKey');
    expect(expression).not.toContain(':v_awsKey');
    expect(updates[0].args[0].input.ExpressionAttributeNames?.['#awsKey']).toBe('awsKey');
  });
});

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
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';
import { DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getColumnFromConfigTable } from '../lib/get-column-from-config-table';
import { DynamoDBOperationError } from '../lib/common-resources';
import { expect, it, beforeEach, afterEach, describe } from 'vitest';

let ddbMock: AwsClientStub<DynamoDBDocumentClient>;

beforeEach(() => {
  ddbMock = mockClient(DynamoDBDocumentClient);
});

afterEach(() => {
  ddbMock.reset();
});

describe('getColumnFromConfigTable', () => {
  const tableName = 'test-table';
  const dataType = 'mandatoryAccount';
  const acceleratorKey = 'test@example.com';
  const columnName = 'awsKey';

  it('should successfully retrieve column value', async () => {
    // Given
    const expectedValue = 'test-aws-key';
    ddbMock.on(GetCommand).resolves({
      Item: {
        [columnName]: expectedValue,
        dataType: dataType,
        acceleratorKey: acceleratorKey,
      },
    });

    // When
    const result = await getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName);

    // Then
    expect(result).toBe(expectedValue);
  });

  it('should handle missing item', async () => {
    // Given
    ddbMock.on(GetCommand).resolves({
      Item: undefined,
    });

    // When/Then
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      DynamoDBOperationError,
    );
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      `Item not found or missing awsKey in table "${tableName}" for dataType "${dataType}" and acceleratorKey "${acceleratorKey}"`,
    );
  });

  it('should handle item with missing column', async () => {
    // Given
    ddbMock.on(GetCommand).resolves({
      Item: {
        dataType: dataType,
        acceleratorKey: acceleratorKey,
      },
    });

    // When/Then
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      DynamoDBOperationError,
    );
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      `Item not found or missing awsKey in table "${tableName}" for dataType "${dataType}" and acceleratorKey "${acceleratorKey}"`,
    );
  });

  it('should handle DynamoDB service exceptions', async () => {
    // Given
    ddbMock.on(GetCommand).rejects(
      new DynamoDBServiceException({
        name: 'ResourceNotFoundException',
        $metadata: {},
        message: 'Table not found',
        $fault: 'server',
      }),
    );

    // When/Then
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      DynamoDBOperationError,
    );
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      'DynamoDB service error: ResourceNotFoundException - Table not found',
    );
  });

  it('should handle unknown errors', async () => {
    // Given
    ddbMock.on(GetCommand).rejects(new Error('Unknown error'));

    // When/Then
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      DynamoDBOperationError,
    );
    await expect(getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName)).rejects.toThrow(
      'Unknown error retrieving data from DynamoDB: Unknown error',
    );
  });

  it('should use provided credentials when available', async () => {
    // Given
    const expectedValue = 'test-aws-key';
    const credentials = {
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      sessionToken: 'test-token',
    };

    ddbMock.on(GetCommand).resolves({
      Item: {
        [columnName]: expectedValue,
        dataType: dataType,
        acceleratorKey: acceleratorKey,
      },
    });

    // When
    const result = await getColumnFromConfigTable(tableName, dataType, acceleratorKey, columnName, credentials);

    // Then
    expect(result).toBe(expectedValue);
  });
});

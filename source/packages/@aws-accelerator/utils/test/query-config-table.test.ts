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
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { queryConfigTable } from '../lib/query-config-table';
import { DynamoDBOperationError } from '../lib/common-resources';
import { expect, it, beforeEach, afterEach, describe } from 'vitest';

let ddbMock: AwsClientStub<DynamoDBDocumentClient>;

beforeEach(() => {
  ddbMock = mockClient(DynamoDBDocumentClient);
});

afterEach(() => {
  ddbMock.reset();
});

describe('queryConfigTable', () => {
  const tableName = 'test-table';
  const dataType = 'mandatoryAccount';

  it('should successfully retrieve items', async () => {
    // Given
    const expectedItems = [
      { dataType: 'mandatoryAccount', acceleratorKey: 'test1@example.com', awsKey: 'key1' },
      { dataType: 'mandatoryAccount', acceleratorKey: 'test2@example.com', awsKey: 'key2' },
    ];

    ddbMock.resolves({
      Items: expectedItems,
    });

    // When
    const result = await queryConfigTable(tableName, dataType);

    // Then
    expect(result).toEqual(expectedItems);
  });

  it('should handle empty results', async () => {
    // Given
    ddbMock.resolves({
      Items: [],
    });

    // When
    const result = await queryConfigTable(tableName, dataType);

    // Then
    expect(result).toEqual([]);
  });

  it('should use projection expression when provided', async () => {
    // Given
    const projectionExpression = 'acceleratorKey, awsKey';
    const expectedItems = [{ acceleratorKey: 'test1@example.com', awsKey: 'key1' }];

    ddbMock.resolves({
      Items: expectedItems,
    });

    // When
    const result = await queryConfigTable(tableName, dataType, projectionExpression);

    // Then
    expect(result).toEqual(expectedItems);
  });

  it('should handle DynamoDB service exceptions', async () => {
    // Given
    ddbMock.rejects(
      new DynamoDBServiceException({
        name: 'ResourceNotFoundException',
        $metadata: {},
        message: 'Table not found',
        $fault: 'server',
      }),
    );

    // When/Then
    await expect(queryConfigTable(tableName, dataType)).rejects.toThrow(DynamoDBOperationError);
    await expect(queryConfigTable(tableName, dataType)).rejects.toThrow(
      'DynamoDB service error: ResourceNotFoundException - Table not found',
    );
  });

  it('should handle unknown errors', async () => {
    // Given
    ddbMock.rejects(new Error('Unknown error'));

    // When/Then
    await expect(queryConfigTable(tableName, dataType)).rejects.toThrow(DynamoDBOperationError);
    await expect(queryConfigTable(tableName, dataType)).rejects.toThrow(
      'Unknown error querying DynamoDB: Unknown error',
    );
  });

  it('should use provided credentials when available', async () => {
    // Given
    const expectedItems = [{ dataType: 'mandatoryAccount', awsKey: 'key1' }];
    const credentials = {
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      sessionToken: 'test-token',
    };

    ddbMock.resolves({
      Items: expectedItems,
    });

    // When
    const result = await queryConfigTable(tableName, dataType, undefined, credentials);

    // Then
    expect(result).toEqual(expectedItems);
  });
  it('should filter by commitId when provided', async () => {
    // Given
    const commitId = 'abc123';
    const expectedItems = [{ dataType: 'mandatoryAccount', acceleratorKey: 'test1@example.com', commitId: 'abc123' }];

    ddbMock.resolves({
      Items: expectedItems,
    });

    // When
    const result = await queryConfigTable(tableName, dataType, undefined, undefined, commitId);

    // Then
    expect(result).toEqual(expectedItems);
  });
});

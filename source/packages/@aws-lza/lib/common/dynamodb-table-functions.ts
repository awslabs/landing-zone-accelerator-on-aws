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

/**
 * @fileoverview DynamoDB Query and Scan Utilities - Advanced DynamoDB operations with filtering
 *
 * Provides comprehensive DynamoDB query and scan operations with advanced filtering capabilities,
 * expression building, and error handling. Supports complex query patterns including partition keys,
 * sort keys, filter expressions, and various DynamoDB operators.
 *
 * Key features:
 * - Flexible query and scan operations
 * - Advanced filter expression building
 * - Support for all DynamoDB operators
 * - Automatic expression attribute value management
 * - Comprehensive error handling and validation
 */

import path from 'path';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  QueryCommand,
  BatchWriteCommand,
  BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { executeApi } from './utility';
import { createLogger } from './logger';
import { IDynamoDBPartitionKey, IDynamoDBSortKey, IDynamoDBFilter } from './interfaces';
import { DynamoDBFilterOperator, DynamoDBLogicalOperator, MODULE_EXCEPTIONS } from './types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Validates that a DynamoDB table exists and is accessible
 * @param client - DynamoDB client instance
 * @param tableName - Name of the table to validate
 * @param logPrefix - Prefix for logging messages
 * @throws {Error} When table does not exist or is not accessible
 */
async function validateTableExists(client: DynamoDBClient, tableName: string, logPrefix: string): Promise<void> {
  await executeApi(
    'DescribeTableCommand',
    { TableName: tableName },
    () => client.send(new DescribeTableCommand({ TableName: tableName })),
    logger,
    logPrefix,
  );
}

/**
 * Performs advanced DynamoDB query or scan operations with comprehensive filtering support
 * @param options - Configuration object for the DynamoDB operation
 * @param options.client - DynamoDB client instance
 * @param options.logPrefix - Prefix for logging messages
 * @param options.tableName - Name of the DynamoDB table
 * @param options.partitionKey - Optional partition key for query operations
 * @param options.sortKey - Optional sort key with operator support
 * @param options.filters - Optional array of filter conditions
 * @param options.filterOperator - Logical operator for combining filters (AND/OR)
 * @param options.scanIndexForward - Sort order for query results
 * @param options.limit - Maximum number of items to return
 * @returns Promise resolving to array of items or undefined if no results
 */
export async function queryDynamoDBTable(options: {
  client: DynamoDBClient;
  logPrefix: string;
  tableName: string;
  partitionKey?: IDynamoDBPartitionKey;
  sortKey?: IDynamoDBSortKey;
  filters?: IDynamoDBFilter[];
  filterOperator?: DynamoDBLogicalOperator;
  scanIndexForward?: boolean;
  limit?: number;
}): Promise<{ [key: string]: unknown }[] | undefined> {
  const docClient = DynamoDBDocumentClient.from(options.client);

  await validateTableExists(options.client, options.tableName, options.logPrefix);

  if (!options.partitionKey && !options.filters) {
    const scanResponse = await executeApi(
      'ScanCommand',
      { TableName: options.tableName, Limit: options.limit },
      () => docClient.send(new ScanCommand({ TableName: options.tableName, Limit: options.limit })),
      logger,
      options.logPrefix,
    );

    if (!scanResponse.Items || scanResponse.Items.length === 0) {
      return undefined;
    }

    return scanResponse.Items;
  }

  const expressionAttributeValues: { [key: string]: unknown } = {};
  let valueCounter = 0;

  if (options.partitionKey) {
    expressionAttributeValues[':pk'] = options.partitionKey.value;
    let keyConditionExpression = `${options.partitionKey.name} = :pk`;

    if (options.sortKey) {
      const operator = options.sortKey.operator ?? DynamoDBFilterOperator.EQUALS;
      const skValue = `:sk${++valueCounter}`;
      expressionAttributeValues[skValue] = options.sortKey.value;

      if (operator === 'begins_with') {
        keyConditionExpression += ` AND begins_with(${options.sortKey.name}, ${skValue})`;
      } else if (operator === 'between') {
        const skValue2 = `:sk${++valueCounter}`;
        expressionAttributeValues[skValue2] = options.sortKey.value2;
        keyConditionExpression += ` AND ${options.sortKey.name} BETWEEN ${skValue} AND ${skValue2}`;
      } else {
        keyConditionExpression += ` AND ${options.sortKey.name} ${operator} ${skValue}`;
      }
    }

    let filterExpression = '';
    if (options.filters && options.filters.length > 0) {
      const filterConditions = options.filters
        .map(filter => {
          const operator = filter.operator ?? DynamoDBFilterOperator.EQUALS;
          const valueKey = `:val${++valueCounter}`;

          switch (operator) {
            case 'attribute_exists':
              return `attribute_exists(${filter.name})`;
            case 'attribute_not_exists':
              return `attribute_not_exists(${filter.name})`;
            case 'begins_with':
              expressionAttributeValues[valueKey] = filter.value;
              return `begins_with(${filter.name}, ${valueKey})`;
            case 'contains':
              expressionAttributeValues[valueKey] = filter.value;
              return `contains(${filter.name}, ${valueKey})`;
            case 'attribute_type':
              expressionAttributeValues[valueKey] = filter.value;
              return `attribute_type(${filter.name}, ${valueKey})`;
            case 'size':
              expressionAttributeValues[valueKey] = filter.value;
              return `size(${filter.name}) = ${valueKey}`;
            case 'between':
              const valueKey2 = `:val${++valueCounter}`;
              expressionAttributeValues[valueKey] = filter.value;
              expressionAttributeValues[valueKey2] = filter.value2;
              return `${filter.name} BETWEEN ${valueKey} AND ${valueKey2}`;
            case 'in':
              if (filter.values) {
                const inValues = filter.values.map((_, index) => {
                  const inValueKey = `:val${++valueCounter}`;
                  expressionAttributeValues[inValueKey] = filter.values![index];
                  return inValueKey;
                });
                return `${filter.name} IN (${inValues.join(', ')})`;
              }
              return '';
            default:
              expressionAttributeValues[valueKey] = filter.value;
              return `${filter.name} ${operator} ${valueKey}`;
          }
        })
        .filter(condition => condition);

      if (filterConditions.length > 0) {
        filterExpression = filterConditions.join(` ${options.filterOperator ?? 'AND'} `);
      }
    }

    const queryParameters = {
      TableName: options.tableName,
      KeyConditionExpression: keyConditionExpression,
      ...(Object.keys(expressionAttributeValues).length > 0 && {
        ExpressionAttributeValues: expressionAttributeValues,
      }),
      FilterExpression: filterExpression ?? undefined,
      ScanIndexForward: options.scanIndexForward,
      Limit: options.limit,
    };

    const queryResponse = await executeApi(
      'QueryCommand',
      queryParameters,
      () => docClient.send(new QueryCommand(queryParameters)),
      logger,
      options.logPrefix,
    );

    if (!queryResponse.Items || queryResponse.Items.length === 0) {
      return undefined;
    }

    return queryResponse.Items;
  }

  if (options.filters && options.filters.length > 0) {
    const filterConditions = options.filters
      .map(filter => {
        const operator = filter.operator ?? DynamoDBFilterOperator.EQUALS;
        const valueKey = `:val${++valueCounter}`;

        switch (operator) {
          case 'attribute_exists':
            return `attribute_exists(${filter.name})`;
          case 'attribute_not_exists':
            return `attribute_not_exists(${filter.name})`;
          case 'begins_with':
            expressionAttributeValues[valueKey] = filter.value;
            return `begins_with(${filter.name}, ${valueKey})`;
          case 'contains':
            expressionAttributeValues[valueKey] = filter.value;
            return `contains(${filter.name}, ${valueKey})`;
          case 'between':
            const valueKey2 = `:val${++valueCounter}`;
            expressionAttributeValues[valueKey] = filter.value;
            expressionAttributeValues[valueKey2] = filter.value2;
            return `${filter.name} BETWEEN ${valueKey} AND ${valueKey2}`;
          case 'in':
            if (filter.values) {
              const inValues = filter.values.map((_, index) => {
                const inValueKey = `:val${++valueCounter}`;
                expressionAttributeValues[inValueKey] = filter.values![index];
                return inValueKey;
              });
              return `${filter.name} IN (${inValues.join(', ')})`;
            }
            return '';
          default:
            expressionAttributeValues[valueKey] = filter.value;
            return `${filter.name} ${operator} ${valueKey}`;
        }
      })
      .filter(condition => condition);

    const scanParameters = {
      TableName: options.tableName,
      FilterExpression: filterConditions.join(` ${options.filterOperator ?? 'AND'} `),
      ...(Object.keys(expressionAttributeValues).length > 0 && {
        ExpressionAttributeValues: expressionAttributeValues,
      }),
      Limit: options.limit,
    };

    const scanResponse = await executeApi(
      'ScanCommand',
      scanParameters,
      () => docClient.send(new ScanCommand(scanParameters)),
      logger,
      options.logPrefix,
    );

    if (!scanResponse.Items || scanResponse.Items.length === 0) {
      return undefined;
    }

    return scanResponse.Items;
  }

  return undefined;
}
/**
 * Puts an array of items into a DynamoDB table using batch write operations.
 * Handles batching, retries for unprocessed items, and comprehensive validation.
 * Items with the same primary key will be replaced (upsert behavior).
 *
 * @param options - Configuration object for the batch put operation
 * @param options.client - DynamoDB client instance
 * @param options.tableName - Name of the DynamoDB table
 * @param options.items - Array of items to insert/update in the table
 * @param options.dryRun - Whether to perform dry run without making changes
 * @param options.logPrefix - Prefix for logging messages
 * @returns Promise that resolves when all items are processed
 *
 * @throws {Error} When table does not exist (MODULE_EXCEPTIONS.INVALID_INPUT)
 * @throws {Error} When items contain invalid data (MODULE_EXCEPTIONS.INVALID_INPUT)
 * @throws {Error} When unprocessed items remain after retries (MODULE_EXCEPTIONS.SERVICE_EXCEPTION)
 *
 * @example
 * ```typescript
 * // Basic usage
 * await putItemsBatch({
 *   client: dynamoClient,
 *   tableName: 'MyTable',
 *   items: [
 *     { id: '1', name: 'Item 1', status: 'active' },
 *     { id: '2', name: 'Item 2', status: 'inactive' }
 *   ],
 *   dryRun: false,
 *   logPrefix: 'BatchInsert:us-east-1'
 * });
 *
 * // Dry run mode
 * await putItemsBatch({
 *   client: dynamoClient,
 *   tableName: 'MyTable',
 *   items: items,
 *   dryRun: true,
 *   logPrefix: 'TestRun'
 * });
 * ```
 */
export async function putItemsBatch(options: {
  client: DynamoDBClient;
  tableName: string;
  items: Record<string, unknown>[];
  dryRun: boolean;
  logPrefix: string;
}): Promise<void> {
  const docClient = DynamoDBDocumentClient.from(options.client);

  // Validate table exists
  await validateTableExists(options.client, options.tableName, options.logPrefix);

  // Handle empty items array
  if (!options.items || options.items.length === 0) {
    logger.warn(`No items provided for batch put operation on table ${options.tableName}`, options.logPrefix);
    return;
  }

  // Validate each item
  const validationErrors: string[] = [];
  for (let i = 0; i < options.items.length; i++) {
    const item = options.items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      validationErrors.push(`Item at index ${i} is not a valid object`);
    }
  }

  if (validationErrors.length > 0) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: ${validationErrors.join(', ')}`;
    logger.error(message, options.logPrefix);
    throw new Error(message);
  }

  logger.info(`Processing ${options.items.length} items for table ${options.tableName}`, options.logPrefix);

  // Chunk items into batches of 25 (DynamoDB limit)
  const batchSize = 25;
  const batches: Record<string, unknown>[][] = [];
  for (let i = 0; i < options.items.length; i += batchSize) {
    batches.push(options.items.slice(i, i + batchSize));
  }

  logger.info(`Split into ${batches.length} batches for processing`, options.logPrefix);

  // Process each batch
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    await processBatch(docClient, options.tableName, batch, options.dryRun, options.logPrefix, batchIndex + 1);
  }

  logger.info(`Successfully processed all ${options.items.length} items`, options.logPrefix);
}

/**
 * Processes a single batch of items with retry logic for unprocessed items
 * @param docClient - DynamoDB document client instance
 * @param tableName - Name of the DynamoDB table
 * @param items - Batch of items to process
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Prefix for logging messages
 * @param batchNumber - Batch number for logging
 * @returns Promise that resolves when batch is processed
 */
async function processBatch(
  docClient: DynamoDBDocumentClient,
  tableName: string,
  items: Record<string, unknown>[],
  dryRun: boolean,
  logPrefix: string,
  batchNumber: number,
): Promise<void> {
  const requestItems: BatchWriteCommandInput['RequestItems'] = {
    [tableName]: items.map(item => ({
      PutRequest: {
        Item: item,
      },
    })),
  };

  const commandName = 'BatchWriteCommand';
  const parameters = { RequestItems: requestItems };

  if (dryRun) {
    logger.dryRun(commandName, { ...parameters, ItemCount: items.length, BatchNumber: batchNumber }, logPrefix);
    return;
  }

  let unprocessedItems: typeof requestItems = requestItems;
  let retryCount = 0;
  const maxRetries = 3;

  while (Object.keys(unprocessedItems).length > 0 && retryCount <= maxRetries) {
    const response = await executeApi(
      commandName,
      { ItemCount: items.length, BatchNumber: batchNumber, RetryAttempt: retryCount },
      () => docClient.send(new BatchWriteCommand({ RequestItems: unprocessedItems })),
      logger,
      logPrefix,
    );

    if (response.UnprocessedItems && Object.keys(response.UnprocessedItems).length > 0) {
      unprocessedItems = response.UnprocessedItems;
      retryCount++;

      if (retryCount <= maxRetries) {
        const unprocessedCount = unprocessedItems[tableName]?.length || 0;
        logger.warn(
          `Batch ${batchNumber}: ${unprocessedCount} unprocessed items, retrying (attempt ${retryCount}/${maxRetries})`,
          logPrefix,
        );
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    } else {
      unprocessedItems = {};
    }
  }

  // Check if there are still unprocessed items after all retries
  if (Object.keys(unprocessedItems).length > 0) {
    const unprocessedCount = unprocessedItems[tableName]?.length || 0;
    const message = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to process all items in batch ${batchNumber} after ${maxRetries} retries. ${unprocessedCount} items remain unprocessed`;
    logger.error(message, logPrefix);
    throw new Error(message);
  }

  logger.info(`Successfully processed batch ${batchNumber} with ${items.length} items`, logPrefix);
}

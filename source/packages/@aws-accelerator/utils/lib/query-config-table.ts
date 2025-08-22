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
import { DynamoDBClient, DynamoDBServiceException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, paginateQuery, QueryCommandInput } from '@aws-sdk/lib-dynamodb';
import { Credentials } from '@aws-sdk/types';
import { createLogger } from './logger';
import { setRetryStrategy } from './common-functions';
import { DynamoDBOperationError } from './common-resources';
import * as path from 'path';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Query items from DynamoDB table using dataType as partition key
 * @param {string} tableName - Name of the DynamoDB table
 * @param {string} dataType - Partition key value (e.g., "mandatoryAccount")
 * @param {string} [projectionExpression] - Optional projection expression to limit returned attributes
 * @param {Credentials} [credentials] - Optional AWS credentials
 * @returns {Promise<Record<string, unknown>[]>} - Returns array of items
 * @throws {DynamoDBOperationError} - Throws a custom error with details about the failure
 */
export async function queryConfigTable(
  tableName: string,
  dataType: string,
  projectionExpression?: string,
  credentials?: Credentials,
): Promise<Record<string, unknown>[]> {
  const clientOptions = credentials
    ? { credentials, retryStrategy: setRetryStrategy() }
    : { retryStrategy: setRetryStrategy() };

  const client = new DynamoDBClient(clientOptions);
  const documentClient = DynamoDBDocumentClient.from(client);

  const params: QueryCommandInput = {
    TableName: tableName,
    KeyConditionExpression: 'dataType = :pk',
    ExpressionAttributeValues: { ':pk': dataType },
  };

  if (projectionExpression) {
    params.ProjectionExpression = projectionExpression;
  }

  try {
    logger.debug(`Querying table: ${tableName} with dataType: ${dataType}`);

    const items: Record<string, unknown>[] = [];
    const paginator = paginateQuery({ client: documentClient }, params);

    for await (const page of paginator) {
      if (page.Items) {
        items.push(...page.Items);
      }
    }

    logger.debug(`Successfully retrieved ${items.length} items for dataType: ${dataType}`);
    return items;
  } catch (error) {
    if (error instanceof DynamoDBServiceException) {
      logger.error(`DynamoDB Service Error: ${error.name} - ${error.message} with params ${JSON.stringify(params)}`);
      throw new DynamoDBOperationError(
        `DynamoDB service error: ${error.name} - ${error.message} with params ${JSON.stringify(params)}`,
        error,
        tableName,
        dataType,
        '',
      );
    } else {
      logger.error(`Unknown error querying DynamoDB: ${error}`);
      throw new DynamoDBOperationError(
        `Unknown error querying DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
        error,
        tableName,
        dataType,
        '',
      );
    }
  }
}

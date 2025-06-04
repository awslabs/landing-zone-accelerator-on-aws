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
import { DynamoDBDocumentClient, GetCommand, GetCommandInput, GetCommandOutput } from '@aws-sdk/lib-dynamodb';
import { Credentials } from '@aws-sdk/types';
import { createLogger } from './logger';
import { setRetryStrategy } from './common-functions';
import { throttlingBackOff } from './throttle';
import * as path from 'path';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Custom error class for DynamoDB operations
 */
export class DynamoDBOperationError extends Error {
  readonly originalError: unknown;
  readonly tableName: string;
  readonly dataType: string;
  readonly acceleratorKey: string;

  constructor(message: string, originalError: unknown, tableName: string, dataType: string, acceleratorKey: string) {
    super(message);
    this.name = 'DynamoDBOperationError';
    this.originalError = originalError;
    this.tableName = tableName;
    this.dataType = dataType;
    this.acceleratorKey = acceleratorKey;
  }
}

/**
 * Get AWS account key from DynamoDB table using dataType as partition key and acceleratorKey as sort key
 * @param {string} tableName - Name of the DynamoDB table
 * @param {string} dataType - Partition key value (e.g., "mandatoryAccount")
 * @param {string} acceleratorKey - Sort key value (e.g., email address)
 * @param {Credentials} [credentials] - Optional AWS credentials
 * @returns {Promise<string>} - Returns the AWS account key
 * @throws {DynamoDBOperationError} - Throws a custom error with details about the failure
 */
export async function getColumnFromConfigTable(
  tableName: string,
  dataType: string,
  acceleratorKey: string,
  columnName: string,
  credentials?: Credentials,
): Promise<string> {
  // Initialize DynamoDB client with optional credentials
  const clientOptions = credentials
    ? { credentials, retryStratergy: setRetryStrategy() }
    : { retryStratergy: setRetryStrategy() };

  const client = new DynamoDBClient(clientOptions);

  // Create DocumentClient from the base client
  const documentClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      convertEmptyValues: true,
      removeUndefinedValues: true,
    },
  });

  // Define parameters for GetCommand
  const params: GetCommandInput = {
    TableName: tableName,
    Key: {
      dataType: dataType,
      acceleratorKey: acceleratorKey,
    },
  };

  try {
    logger.debug(`Retrieving ${columnName} from table: ${tableName} with dataType: ${dataType}`);

    // Execute the GetCommand
    const command = new GetCommand(params);
    const response: GetCommandOutput = await throttlingBackOff(() => documentClient.send(command));

    // Check if item exists and has awsKey
    if (response.Item && response.Item[columnName]) {
      logger.debug(`Successfully retrieved ${columnName} for acceleratorKey: ${acceleratorKey}`);
      return response.Item[columnName];
    } else {
      throw new DynamoDBOperationError(
        `Item not found or missing awsKey in table "${tableName}" for dataType "${dataType}" and acceleratorKey "${acceleratorKey}"`,
        new Error('Item not found or missing field'),
        tableName,
        dataType,
        acceleratorKey,
      );
    }
  } catch (error) {
    // Type-safe error handling
    if (error instanceof DynamoDBOperationError) {
      // Our custom error is already formatted correctly, just re-throw it
      throw error;
    } else if (error instanceof DynamoDBServiceException) {
      // AWS DynamoDB Service exception
      logger.error(`DynamoDB Service Error: ${error.name} - ${error.message}`);
      throw new DynamoDBOperationError(
        `DynamoDB service error: ${error.name} - ${error.message}`,
        error,
        tableName,
        dataType,
        acceleratorKey,
      );
    } else {
      // Unknown error type
      logger.error('Unknown error retrieving data from DynamoDB:', error);
      throw new DynamoDBOperationError(
        `Unknown error retrieving data from DynamoDB: ${error instanceof Error ? error.message : String(error)}`,
        error,
        tableName,
        dataType,
        acceleratorKey,
      );
    }
  }
}

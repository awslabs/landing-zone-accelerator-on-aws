/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'License' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { DeleteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { createLogger } from 'aws-lza';
import path from 'node:path';
import { ResolvedEnvironment } from './types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Delete only the latest persisted execution state for one integration-tested module.
 *
 * The helper removes `PK=MODULE#<serviceName>` / `SK=EXECUTION#latest` from the
 * environment's module-state table. Timestamped history rows are intentionally
 * retained and remain governed by the table's existing TTL policy. DynamoDB
 * service, credential, throttling, and network errors are not suppressed.
 *
 * @param environment Resolved integration environment providing the management-account credentials, Region, and table
 * @param serviceName Module service name used to build the exact DynamoDB partition key
 * @returns A promise that resolves after the idempotent latest-state deletion succeeds
 * @throws The original DynamoDB error when the delete request fails
 */
export async function resetModuleLatestState(environment: ResolvedEnvironment, serviceName: string): Promise<void> {
  const tableName = environment.moduleInfrastructure.stateTableName;
  const client = new DynamoDBClient({
    region: environment.region,
    credentials: environment.managementAccountCredentials,
  });
  logger.info(`Deleting latest module state for ${serviceName} from ${tableName}`);
  await client.send(
    new DeleteItemCommand({
      TableName: tableName,
      Key: marshall({
        PK: `MODULE#${serviceName}`,
        SK: 'EXECUTION#latest',
      }),
    }),
  );
  logger.info(`Latest module state reset completed for ${serviceName}`);
}

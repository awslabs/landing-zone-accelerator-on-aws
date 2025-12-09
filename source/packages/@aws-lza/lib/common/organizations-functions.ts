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
 * @fileoverview AWS Organizations Utility Functions - Account management and organization operations
 *
 * Provides comprehensive utilities for AWS Organizations operations including account retrieval,
 * management account validation, and organization data source integration. Supports both direct
 * AWS Organizations API calls and DynamoDB-based data sources for account information.
 *
 * Key capabilities:
 * - AWS Organizations account enumeration
 * - Management account identification and validation
 * - DynamoDB-based organization data retrieval
 * - Account data validation and transformation
 * - Comprehensive error handling for organization operations
 */

import path from 'path';
import {
  Account,
  AccountJoinedMethod,
  AccountStatus,
  AWSOrganizationsNotInUseException,
  DescribeOrganizationCommand,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import { createLogger } from './logger';
import { executeApi } from './utility';
import { queryDynamoDBTable } from './dynamodb-table-functions';
import { IModuleOrganizationsDataSource } from './interfaces';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { MODULE_EXCEPTIONS } from './types';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Retrieves all AWS Organizations accounts using paginated API calls
 * @param client - AWS Organizations client instance
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to array of organization accounts
 */
export async function getOrganizationAccounts(client: OrganizationsClient, logPrefix: string): Promise<Account[]> {
  const accounts: Account[] = [];
  logger.info(`Getting all AWS Organizations accounts`, logPrefix);
  const command = 'paginateListAccounts';
  const parameter = { MaxResults: 20 };
  logger.commandExecution(command, parameter, logPrefix);
  const paginator = paginateListAccounts({ client }, parameter);
  for await (const page of paginator) {
    for (const account of page.Accounts ?? []) {
      accounts.push(account);
    }
  }
  logger.commandSuccess(command, parameter, logPrefix);

  return accounts;
}

/**
 * Determines if the specified account is the AWS Organizations management account
 * @param client - AWS Organizations client instance
 * @param accountId - Account ID to check
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to true if account is management account
 */
export async function isManagementAccount(
  client: OrganizationsClient,
  accountId: string,
  logPrefix: string,
): Promise<boolean> {
  try {
    const response = await executeApi(
      'DescribeOrganizationCommand',
      {},
      () => client.send(new DescribeOrganizationCommand({})),
      logger,
      logPrefix,
      [AWSOrganizationsNotInUseException],
    );

    return response.Organization?.MasterAccountId === accountId;
  } catch (error: unknown) {
    if (error instanceof AWSOrganizationsNotInUseException) {
      return false;
    }
    throw error;
  }
}

/**
 * Validates if the account data type is supported
 * @param dataType - Account data type from source table
 * @returns Boolean indicating if account type is valid
 */
function isValidAccountType(dataType: string): boolean {
  return dataType === 'mandatoryAccount' || dataType === 'workloadAccount';
}

/**
 * Validates required fields in account data item
 * @param item - Account data item from source table
 * @param logPrefix - Prefix for logging messages
 * @throws Error if required fields are missing
 */
function validateRequiredFields(item: { [key: string]: unknown }, logPrefix: string): void {
  if (!item['awsKey']) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Missing required field 'awsKey' for account item in source table`;
    logger.error(message, logPrefix);
    throw new Error(message);
  }
}

/**
 * Builds an AWS Organizations Account object from DynamoDB item data
 * @param item - Account data item from source table
 * @returns AWS Organizations Account object
 * @throws Error if required fields are missing or invalid
 */
function buildAccountFromItem(item: { [key: string]: unknown }): Account {
  if (!item['awsKey']) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Missing required field 'awsKey' for account item in source table, unable to get account id`;
    logger.error(message);
    throw new Error(message);
  }
  if (!item['acceleratorKey']) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Missing required field 'acceleratorKey' for account item in source table, unable to get account email`;
    logger.error(message);
    throw new Error(message);
  }
  if (!item['dataBag']) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Missing required field 'dataBag' for account item in source table, unable to get account details`;
    logger.error(message);
    throw new Error(message);
  }

  const account: Account = {
    Id: item['awsKey'] as string,
  };

  if (item['acceleratorKey']) {
    account.Email = item['acceleratorKey'] as string;
  }

  let dataBag: { [key: string]: unknown };
  try {
    dataBag = JSON.parse(item['dataBag'] as string);
  } catch (error: unknown) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid JSON in dataBag field for account ${item['acceleratorKey']}: ${error}`;
    logger.error(message);
    throw new Error(message);
  }

  if (dataBag['name']) {
    account.Name = dataBag['name'] as string;
  }
  if (dataBag['arn']) {
    account.Arn = dataBag['arn'] as string;
  }
  if (dataBag['status']) {
    account.Status = dataBag['status'] as AccountStatus;
  }
  if (dataBag['joinedMethod']) {
    account.JoinedMethod = dataBag['joinedMethod'] as AccountJoinedMethod;
  }
  if (dataBag['joinedTimestamp']) {
    account.JoinedTimestamp = new Date(dataBag['joinedTimestamp'] as string);
  }

  return account;
}

/**
 * Retrieves AWS Organizations accounts from a DynamoDB source table
 * @param options - Configuration object for the operation
 * @param options.client - DynamoDB client instance
 * @param options.organizationsDataSource - Data source configuration
 * @param options.logPrefix - Prefix for logging messages
 * @returns Promise resolving to array of organization accounts
 * @throws Error if no accounts found or data validation fails
 */
export async function getOrganizationAccountsFromSourceTable(options: {
  client: DynamoDBClient;
  organizationsDataSource: IModuleOrganizationsDataSource;
  logPrefix: string;
}): Promise<Account[]> {
  const accounts: Account[] = [];

  const tableData = await queryDynamoDBTable({
    client: options.client,
    tableName: options.organizationsDataSource.tableName,
    logPrefix: options.logPrefix,
    filters: options.organizationsDataSource.filters,
    filterOperator: options.organizationsDataSource.filterOperator,
  });

  if (!tableData) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: No organization accounts found in source table ${options.organizationsDataSource.tableName} (${options.organizationsDataSource.filters?.length || 0} filters applied)`;
    logger.error(message, options.logPrefix);
    throw new Error(message);
  }

  for (const item of tableData) {
    if (!isValidAccountType(item['dataType'] as string)) {
      continue;
    }

    validateRequiredFields(item, options.logPrefix);
    logger.info(`Found account ${item['acceleratorKey']} in source table`, options.logPrefix);

    const account = buildAccountFromItem(item);
    accounts.push(account);
  }

  logger.info(`Retrieved ${accounts.length} accounts from source table`, options.logPrefix);
  return accounts;
}

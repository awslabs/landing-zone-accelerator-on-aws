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

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  Account,
  AccountJoinedMethod,
  AccountNotRegisteredException,
  AccountState,
  AccountStatus,
  AWSOrganizationsNotInUseException,
  DeregisterDelegatedAdministratorCommand,
  DescribeOrganizationCommand,
  ListDelegatedAdministratorsCommand,
  Organization,
  OrganizationsClient,
  paginateListAccounts,
} from '@aws-sdk/client-organizations';
import path from 'node:path';
import { queryDynamoDBTable } from './dynamodb-table-functions';
import { IModuleOrganizationsDataSource } from './interfaces';
import { createLogger } from './logger';
import { MODULE_EXCEPTIONS, SdkClientPropsType } from './types';
import { executeApi, setRetryStrategy } from './utility';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Returns true when an account's State (or legacy Status) is ACTIVE.
 * Accounts without either lifecycle field are also treated as active for
 * compatibility with legacy cached records that did not persist lifecycle state.
 * Non-active lifecycle states cannot accept
 * cross-account `AssumeRole`, so downstream modules must skip them.
 */
function isAccountActive(account: Account): boolean {
  const accountState = account.State ?? account.Status;
  return accountState === undefined || accountState === AccountState.ACTIVE;
}

/**
 * Retrieves all AWS Organizations accounts using paginated API calls.
 *
 * Only ACTIVE accounts are returned; suspended and pending-closure accounts
 * are filtered out so that downstream modules don't attempt cross-account
 * `AssumeRole` calls into accounts that cannot accept them.
 *
 * @param logPrefix - Prefix for logging messages
 * @param client - Optional AWS Organizations client instance
 * @param clientProps - Optional client configuration properties
 * @returns Promise resolving to array of ACTIVE organization accounts
 */
export async function getOrganizationAccounts(
  logPrefix: string,
  client?: OrganizationsClient,
  clientProps?: SdkClientPropsType,
): Promise<Account[]> {
  const organizationClient: OrganizationsClient =
    client ??
    new OrganizationsClient({
      region: clientProps?.region,
      customUserAgent: clientProps?.customUserAgent,
      retryStrategy: setRetryStrategy(),
      credentials: clientProps?.credentials,
    });

  const allAccounts: Account[] = [];
  logger.info(`Getting all AWS Organizations accounts`, logPrefix);

  const command = 'paginateListAccounts';
  const parameter = { MaxResults: 20 };
  logger.commandExecution(command, parameter, logPrefix);
  const paginator = paginateListAccounts({ client: organizationClient }, parameter);
  for await (const page of paginator) {
    for (const account of page.Accounts ?? []) {
      allAccounts.push(account);
    }
  }
  logger.commandSuccess(command, parameter, logPrefix);

  const activeAccounts = allAccounts.filter(isAccountActive);
  const skipped = allAccounts.filter(account => !isAccountActive(account));
  if (skipped.length > 0) {
    const summary = skipped
      .map(account => `${account.Id ?? 'unknown'} (${account.State ?? account.Status ?? 'unknown'})`)
      .join(', ');
    logger.warn(
      `Skipping ${skipped.length} non-ACTIVE AWS Organizations account(s) from module execution: ${summary}`,
      logPrefix,
    );
  }

  return activeAccounts;
}

/**
 * Retrieves AWS Organizations details using the DescribeOrganization API
 * @param logPrefix - Prefix for logging messages
 * @param client - Optional AWS Organizations client instance
 * @param clientProps - Optional client configuration properties
 * @returns Promise resolving to Organization details or undefined if not configured
 */
export async function getOrganizationDetails(
  logPrefix: string,
  client?: OrganizationsClient,
  clientProps?: SdkClientPropsType,
): Promise<Organization | undefined> {
  const organizationClient: OrganizationsClient =
    client ??
    new OrganizationsClient({
      region: clientProps?.region,
      customUserAgent: clientProps?.customUserAgent,
      retryStrategy: setRetryStrategy(),
      credentials: clientProps?.credentials,
    });

  const response = await executeApi(
    'DescribeOrganizationCommand',
    {},
    () => organizationClient.send(new DescribeOrganizationCommand({})),
    logger,
    logPrefix,
    [AWSOrganizationsNotInUseException],
  );

  if (!response) {
    // Expected exception occurred (AWSOrganizationsNotInUseException)
    logger.warn(`AWS Organizations is not configured`, logPrefix);
    return undefined;
  }

  if (!response.Organization) {
    throw new Error(`AWS Organization couldn't fetch organization details`);
  }

  return response.Organization;
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
  const response = await executeApi(
    'DescribeOrganizationCommand',
    {},
    () => client.send(new DescribeOrganizationCommand({})),
    logger,
    logPrefix,
    [AWSOrganizationsNotInUseException],
  );

  if (!response) {
    // Expected exception occurred (AWSOrganizationsNotInUseException)
    return false;
  }

  return response.Organization?.MasterAccountId === accountId;
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

  let orgInfo: { [key: string]: unknown } = {};
  if (item['orgInfo']) {
    try {
      orgInfo = JSON.parse(item['orgInfo'] as string);
    } catch (error: unknown) {
      const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid JSON in orgInfo field for account ${item['acceleratorKey']}: ${error}`;
      logger.error(message);
      throw new Error(message);
    }
  }

  const orgsApiResponse =
    typeof orgInfo['orgsApiResponse'] === 'object' && orgInfo['orgsApiResponse'] !== null
      ? (orgInfo['orgsApiResponse'] as { [key: string]: unknown })
      : {};

  if (dataBag['name']) {
    account.Name = dataBag['name'] as string;
  }
  if (dataBag['arn']) {
    account.Arn = dataBag['arn'] as string;
  }
  const state = orgsApiResponse['State'];
  if (state) {
    account.State = state as AccountState;
  } else {
    const status = orgInfo['status'] ?? orgsApiResponse['Status'] ?? dataBag['status'];
    if (status) {
      account.Status = status as AccountStatus;
    }
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

  const result = await queryDynamoDBTable({
    client: options.client,
    tableName: options.organizationsDataSource.tableName,
    logPrefix: options.logPrefix,
    filters: options.organizationsDataSource.filters,
    filterOperator: options.organizationsDataSource.filterOperator,
    pagination: { enabled: true },
  });

  if (!result.items) {
    const message = `${MODULE_EXCEPTIONS.INVALID_INPUT}: No organization accounts found in source table ${options.organizationsDataSource.tableName} (${options.organizationsDataSource.filters?.length || 0} filters applied)`;
    logger.error(message, options.logPrefix);
    throw new Error(message);
  }

  const skipped: Account[] = [];
  for (const item of result.items) {
    if (!isValidAccountType(item['dataType'] as string)) {
      continue;
    }

    validateRequiredFields(item, options.logPrefix);
    logger.info(`Found account ${item['acceleratorKey']} in source table`, options.logPrefix);

    const account = buildAccountFromItem(item);
    if (isAccountActive(account)) {
      accounts.push(account);
    } else {
      skipped.push(account);
    }
  }

  if (skipped.length > 0) {
    const summary = skipped
      .map(account => `${account.Id ?? 'unknown'} (${account.State ?? account.Status ?? 'unknown'})`)
      .join(', ');
    logger.warn(
      `Skipping ${skipped.length} non-ACTIVE AWS Organizations account(s) from source table: ${summary}`,
      options.logPrefix,
    );
  }

  logger.info(`Retrieved ${accounts.length} accounts from source table`, options.logPrefix);
  return accounts;
}

/**
 * Retrieves the delegated administrator account ID for a specific AWS service
 * @param client - AWS Organizations client instance
 * @param servicePrincipal - Service principal (e.g., 'macie.amazonaws.com', 'securityhub.amazonaws.com')
 * @param logPrefix - Prefix for logging messages
 * @returns Promise resolving to delegated admin account ID or undefined if none set
 * @throws Error if multiple delegated administrators are found for the service
 */
export async function getDelegatedAdministratorAccountId(
  client: OrganizationsClient,
  servicePrincipal: string,
  logPrefix: string,
): Promise<string | undefined> {
  const commandName = 'ListDelegatedAdministratorsCommand';
  const parameters = { ServicePrincipal: servicePrincipal };

  const response = await executeApi(
    commandName,
    parameters,
    () => client.send(new ListDelegatedAdministratorsCommand(parameters)),
    logger,
    logPrefix,
  );

  const delegatedAdmins = response.DelegatedAdministrators || [];

  if (delegatedAdmins.length === 0) {
    logger.info(`No delegated administrator found for service ${servicePrincipal}`, logPrefix);
    return undefined;
  }

  if (delegatedAdmins.length > 1) {
    const accountIds = delegatedAdmins.map(admin => admin.Id).join(', ');
    const message = `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Multiple delegated administrators found for service ${servicePrincipal}: ${accountIds}`;
    logger.error(message, logPrefix);
    throw new Error(message);
  }

  const adminAccountId = delegatedAdmins[0].Id;
  logger.info(`Found delegated administrator ${adminAccountId} for service ${servicePrincipal}`, logPrefix);
  return adminAccountId;
}

/**
 * Deregisters a delegated administrator account for a specific AWS service
 * @param client - AWS Organizations client instance
 * @param accountId - Account ID to deregister as delegated administrator
 * @param servicePrincipal - Service principal (e.g., 'macie.amazonaws.com', 'securityhub.amazonaws.com')
 * @param dryRun - Whether to perform dry run without making changes
 * @param logPrefix - Prefix for logging messages
 * @returns Promise that resolves when deregistration is complete
 */
export async function deregisterDelegatedAdministrator(
  client: OrganizationsClient,
  accountId: string,
  servicePrincipal: string,
  dryRun: boolean,
  logPrefix: string,
): Promise<void> {
  const commandName = 'DeregisterDelegatedAdministratorCommand';
  const parameters = {
    AccountId: accountId,
    ServicePrincipal: servicePrincipal,
  };

  if (dryRun) {
    logger.dryRun(commandName, parameters, logPrefix);
    return;
  }

  logger.info(`Deregistering delegated administrator ${accountId} for service ${servicePrincipal}`, logPrefix);

  try {
    await executeApi(
      commandName,
      parameters,
      () => client.send(new DeregisterDelegatedAdministratorCommand(parameters)),
      logger,
      logPrefix,
      [AccountNotRegisteredException],
    );

    logger.info(
      `Successfully deregistered delegated administrator ${accountId} for service ${servicePrincipal}`,
      logPrefix,
    );
  } catch (error: unknown) {
    // Handle AccountNotRegisteredException as expected behavior - account was already not a delegated admin
    if (error instanceof AccountNotRegisteredException) {
      logger.info(
        `Account ${accountId} is not a registered delegated administrator for service ${servicePrincipal} - no action needed`,
        logPrefix,
      );
      return;
    }
    // Re-throw any other unexpected errors
    throw error;
  }
}

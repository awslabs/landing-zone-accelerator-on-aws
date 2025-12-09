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
 * @fileoverview Amazon Macie Main Module - Orchestrates complete Macie setup across AWS Organizations
 *
 * Provides the main orchestration logic for Amazon Macie deployment and configuration across
 * AWS Organizations. Handles multi-account, multi-region operations with proper dependency
 * management, boundary resolution, and comprehensive error handling.
 *
 * Key capabilities:
 * - Complete Macie organization setup and teardown
 * - Multi-account batch processing with dependency ordering
 * - Regional boundary resolution and filtering
 * - Delegated administrator account management
 * - Member account lifecycle management
 * - Session configuration across all accounts
 * - Comprehensive response tracking and reporting
 */

import {
  AccountSetupHandler,
  processEnableOperations,
  processDisableOperations,
  processAccountBatch,
  ServiceOperationHandler,
} from '../common/batch-processor';
import { Macie2Client } from '@aws-sdk/client-macie2';
import { createLogger } from '../common/logger';
import { BoundaryResolver, BoundaryType } from '../common/boundary-resolver';
import {
  IMacieDelegatedAccountResponse,
  IMacieModuleRequest,
  IMacieModuleResponse,
  IMacieOrganizationAdminResponse,
  IMacieSessionResponse,
} from './interfaces';
import { OrganizationsDelegatedAdminAccount } from './organizations-delegated-admin-account';
import path from 'path';
import { setRetryStrategy, validateRegionFilters } from '../common/utility';
import { disableMacie, enableMacie, isMacieEnabled } from './functions';
import {
  getOrganizationAccounts,
  getOrganizationAccountsFromSourceTable,
  isManagementAccount,
} from '../common/organizations-functions';
import { Account, OrganizationsClient } from '@aws-sdk/client-organizations';
import { AcceleratorModuleName, IModuleResponse } from '../common/interfaces';
import { getCredentials } from '../common/sts-functions';
import { MacieMembers } from './macie-members';
import { MacieSession } from './macie-session';
import { MODULE_STATE_CODE, OrderedAccountListType, SecurityModuleOperationType } from '../common/types';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

const moduleResponse: IMacieModuleResponse = {
  organizationAdminConfig: [],
  delegatedAdminAccountConfig: [],
  sessionConfig: [],
};

/**
 * Main entry point for configuring Amazon Macie across AWS Organizations
 * @param props - Macie module request containing configuration and context
 * @returns Promise resolving to module response with operation results
 */
export async function configureMacie(props: IMacieModuleRequest): Promise<IModuleResponse<IMacieModuleResponse>> {
  const moduleName = props.moduleName ?? AcceleratorModuleName.AMAZON_MACIE;
  const dryRun = props.dryRun ?? false;

  try {
    logger.processStart(`Starting ${moduleName} module`);
    logger.info(`Execution invoked from ${props.invokingAccountId} in ${props.region} region.`);

    const invokerLogPrefix = `Invoker:${props.region}`;

    logger.info(`Validating region filter configuration`, invokerLogPrefix);
    validateRegionFilters(props.configuration.enable, logger, invokerLogPrefix, props.configuration.regionFilters);
    logger.info(`Region filter configuration validated successfully`, invokerLogPrefix);

    const client = new OrganizationsClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials: props.credentials,
    });

    const managementAccount = await isManagementAccount(client, props.invokingAccountId, invokerLogPrefix);

    if (!managementAccount) {
      const message = `Account ${props.invokingAccountId} is not the AWS Organizations Management Account. Amazon Macie ${props.operation} cannot be performed from non-management accounts.`;
      logger.error(message);
      throw new Error(message);
    }

    logger.info(`Management account verified, proceeding with Amazon Macie ${props.operation}`);
    const managementAccountId = props.invokingAccountId;

    logger.info(`Get Organizations Accounts`);
    const organizationAccounts: Account[] = [];
    if (props.configuration.dataSources?.organizations) {
      logger.info(
        `Get Organizations Accounts from DataSource Table: ${props.configuration.dataSources.organizations.tableName}`,
      );
      const client = new DynamoDBClient({
        region: props.region,
        customUserAgent: props.solutionId,
        retryStrategy: setRetryStrategy(),
        credentials: props.credentials,
      });
      organizationAccounts.push(
        ...(await getOrganizationAccountsFromSourceTable({
          client,
          organizationsDataSource: props.configuration.dataSources.organizations,
          logPrefix: invokerLogPrefix,
        })),
      );
    } else {
      logger.info(`Get Organizations Accounts from Organizations API`);
      organizationAccounts.push(...(await getOrganizationAccounts(client, props.region)));
    }

    const boundaries = await BoundaryResolver.calculateBoundaries(
      BoundaryType.REGIONS,
      props.configuration.enable,
      {
        partition: props.partition,
        region: props.region,
        solutionId: props.solutionId,
        credentials: props.credentials,
      },
      props.configuration.boundary?.regions,
      props.configuration.regionFilters,
    );

    const enabledRegions = boundaries.enabledBoundaries;
    const disabledRegions = boundaries.disabledBoundaries;

    logger.info(`Macie will be enabled in regions: [${enabledRegions.join(', ')}]`);
    logger.info(`Macie will be disabled in regions: [${disabledRegions.join(', ')}]`);

    const enableOrderAccounts = sortAccountsForEnable(managementAccountId, organizationAccounts, props);
    const disableOrderAccounts = sortAccountsForDisable(managementAccountId, organizationAccounts, props);
    const finalCleanupAccounts = [
      organizationAccounts.find(acc => acc.Id === props.configuration.delegatedAdminAccountId),
      organizationAccounts.find(acc => acc.Id === managementAccountId),
    ].filter(Boolean) as Account[];

    const operations: Promise<void[]>[] = [];

    if (enabledRegions.length > 0) {
      operations.push(
        processEnableOperations<IMacieModuleRequest, void>(
          moduleName,
          managementAccountId,
          enableOrderAccounts,
          enabledRegions,
          props,
          dryRun,
          macieEnableHandler,
          props.configuration.concurrency,
          macieAccountSetup,
          organizationAccounts,
        ),
      );
    }

    if (disabledRegions.length > 0) {
      operations.push(
        processDisableOperations(
          moduleName,
          managementAccountId,
          disableOrderAccounts,
          disabledRegions,
          props,
          dryRun,
          macieDisableHandler,
          props.configuration.concurrency,
          macieAccountSetup,
          organizationAccounts,
        ),
      );
    }

    await Promise.all(operations);

    // Perform final cleanup on Management and Delegated Admin account due to service dependencies
    await performFinalServiceCleanup(
      moduleName,
      managementAccountId,
      finalCleanupAccounts,
      disabledRegions,
      props,
      dryRun,
    );

    logger.processEnd(`Successfully completed ${moduleName} module`);

    const statusMessage = dryRun
      ? `Amazon Macie ${props.operation} (dry-run) completed`
      : `Amazon Macie ${props.operation} completed`;

    return {
      status: MODULE_STATE_CODE.COMPLETED,
      summary: statusMessage,
      timestamp: new Date().toISOString(),
      moduleName: moduleName,
      dryRun: dryRun,
      response: moduleResponse,
    };
  } catch (error: unknown) {
    let errorMessage = String(error);
    let errorName = 'UnknownError';
    if (error instanceof Error) {
      errorMessage = error.message;
      errorName = error.name;
    }
    const summary = `Amazon Macie ${props.operation} failed with error : ${errorMessage}`;
    logger.error(summary);

    return {
      error: {
        name: errorName,
        message: errorMessage,
      },
      status: MODULE_STATE_CODE.FAILED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName: moduleName,
      dryRun: dryRun,
      response: moduleResponse,
    };
  }
}

/**
 * Account setup handler for cross-account credential management
 * @param targetAccount - Target AWS account for operations
 * @param managementAccountId - Management account ID
 * @param props - Macie module request properties
 * @returns Promise resolving to updated props with appropriate credentials
 */
const macieAccountSetup: AccountSetupHandler<IMacieModuleRequest> = async (
  targetAccount: Account,
  managementAccountId: string,
  props: IMacieModuleRequest,
): Promise<IMacieModuleRequest> => {
  // Use original credentials for management account
  if (targetAccount.Id === managementAccountId) {
    return props;
  }

  // Assume role for target accounts (called only once per account)
  const credentials = await getCredentials({
    partition: props.partition,
    accountId: targetAccount.Id!,
    region: props.region,
    logPrefix: `Invoker:${props.region}`,
    solutionId: props.solutionId,
    assumeRoleName: props.configuration.accountAccessRoleName,
    credentials: props.credentials,
  });

  return { ...props, credentials }; // Return props with target account credentials
};

/**
 * Service operation handler for enabling Macie across accounts and regions
 * @param managementAccountId - Management account ID
 * @param targetAccount - Target account for the operation
 * @param targetRegion - Target region for the operation
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix for the operation
 * @param props - Macie module request properties
 * @param organizationAccounts - Optional list of organization accounts
 * @returns Promise that resolves when enable operation completes
 */
const macieEnableHandler: ServiceOperationHandler<IMacieModuleRequest, void> = async (
  managementAccountId: string,
  targetAccount: Account,
  targetRegion: string,
  dryRun: boolean,
  logPrefix: string,
  props: IMacieModuleRequest,
  organizationAccounts?: Account[],
): Promise<void> => {
  await enableService(
    targetAccount,
    targetRegion,
    managementAccountId,
    dryRun,
    logPrefix,
    props,
    organizationAccounts ?? [],
  );
};

/**
 * Service operation handler for disabling Macie across accounts and regions
 * @param managementAccountId - Management account ID
 * @param targetAccount - Target account for the operation
 * @param targetRegion - Target region for the operation
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix for the operation
 * @param props - Macie module request properties
 * @param organizationAccounts - Optional list of organization accounts
 * @returns Promise that resolves when disable operation completes
 */
const macieDisableHandler: ServiceOperationHandler<IMacieModuleRequest, void> = async (
  managementAccountId: string,
  targetAccount: Account,
  targetRegion: string,
  dryRun: boolean,
  logPrefix: string,
  props: IMacieModuleRequest,
  organizationAccounts?: Account[],
): Promise<void> => {
  await disableService(
    targetAccount,
    targetRegion,
    managementAccountId,
    dryRun,
    logPrefix,
    props,
    organizationAccounts ?? [],
  );
};

/**
 * Final cleanup handler for disabling Macie in management and delegated admin accounts
 * @param _managementAccountId - Management account ID (unused)
 * @param targetAccount - Target account for cleanup
 * @param targetRegion - Target region for cleanup
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix for the operation
 * @param props - Macie module request properties
 * @returns Promise that resolves when cleanup completes
 */
const macieFinalCleanupHandler: ServiceOperationHandler<IMacieModuleRequest, void> = async (
  _managementAccountId: string,
  targetAccount: Account,
  targetRegion: string,
  dryRun: boolean,
  logPrefix: string,
  props: IMacieModuleRequest,
): Promise<void> => {
  const client = new Macie2Client({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  const macieEnabled = await isMacieEnabled(client, logPrefix);

  if (!macieEnabled) {
    logger.info(`Macie is already disabled in ${targetRegion}.`, logPrefix);
    return;
  } else {
    if (!dryRun) {
      logger.info(`Disabling Macie in ${targetRegion} for ${targetAccount.Name} account (final cleanup).`, logPrefix);
    }
    await disableMacie(client, dryRun, logPrefix);
    addSessionSetting('disabled', targetRegion, targetAccount.Id!);
  }
};

/**
 * Sorts accounts into dependency order for Macie enablement operations
 * @param managementAccountId - Management account ID
 * @param accounts - List of organization accounts
 * @param props - Macie module request properties
 * @returns Ordered account list with proper dependency sequence
 */
function sortAccountsForEnable(
  managementAccountId: string,
  accounts: Account[],
  props: IMacieModuleRequest,
): OrderedAccountListType[] {
  const sortedList: OrderedAccountListType[] = [];
  const managementAccount = accounts.find(acc => acc.Id === managementAccountId);

  if (!managementAccount) {
    throw new Error(`Management account ${managementAccountId} not found in the list of Organizations accounts`);
  }
  const delegatedAdminAccount = accounts.find(acc => acc.Id === props.configuration.delegatedAdminAccountId);
  if (!delegatedAdminAccount) {
    throw new Error(
      `Delegated admin account ${props.configuration.delegatedAdminAccountId} not found in the list of Organizations accounts`,
    );
  }

  const workLoadAccounts = accounts.filter(
    acc => acc.Id !== managementAccountId && acc.Id !== props.configuration.delegatedAdminAccountId,
  );

  sortedList.push({ name: 'Management', order: 1, accounts: [managementAccount] });
  sortedList.push({ name: 'DelegatedAdmin', order: 2, accounts: [delegatedAdminAccount] });
  sortedList.push({ name: 'WorkLoads', order: 3, accounts: workLoadAccounts });

  return sortedList;
}

/**
 * Sorts accounts into dependency order for Macie disablement operations
 * @param managementAccountId - Management account ID
 * @param accounts - List of organization accounts
 * @param props - Macie module request properties
 * @returns Ordered account list with proper dependency sequence for disable
 */
function sortAccountsForDisable(
  managementAccountId: string,
  accounts: Account[],
  props: IMacieModuleRequest,
): OrderedAccountListType[] {
  const sortedList: OrderedAccountListType[] = [];
  const managementAccount = accounts.find(acc => acc.Id === managementAccountId);

  if (!managementAccount) {
    throw new Error(`Management account ${managementAccountId} not found in the list of Organizations accounts`);
  }
  const delegatedAdminAccount = accounts.find(acc => acc.Id === props.configuration.delegatedAdminAccountId);
  if (!delegatedAdminAccount) {
    throw new Error(
      `Delegated admin account ${props.configuration.delegatedAdminAccountId} not found in the list of Organizations accounts`,
    );
  }
  const workLoadAccounts = accounts.filter(
    acc => acc.Id !== managementAccountId && acc.Id !== props.configuration.delegatedAdminAccountId,
  );

  sortedList.push({ name: 'DelegatedAdmin', order: 1, accounts: [delegatedAdminAccount] });
  sortedList.push({ name: 'Management', order: 2, accounts: [managementAccount] });
  sortedList.push({ name: 'WorkLoads', order: 3, accounts: workLoadAccounts });

  return sortedList;
}

/**
 * Enables Macie service for a specific account and region with role-based configuration
 * @param targetAccount - Target account for enablement
 * @param targetRegion - Target region for enablement
 * @param managementAccountId - Management account ID
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @param props - Macie module request properties
 * @param organizationAccounts - List of organization accounts
 * @returns Promise that resolves when service is enabled
 */
async function enableService(
  targetAccount: Account,
  targetRegion: string,
  managementAccountId: string,
  dryRun: boolean,
  logPrefix: string,
  props: IMacieModuleRequest,
  organizationAccounts: Account[],
): Promise<void> {
  const client = new Macie2Client({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  const macieEnabled = await isMacieEnabled(client, logPrefix);
  if (!macieEnabled) {
    await enableMacie(client, dryRun, logPrefix);
  }

  // Process Management Account
  if (targetAccount.Id === managementAccountId) {
    await enableDelegatedAdminAccount(props, client, dryRun, logPrefix);
    addOrganizationSetting('enabled', targetRegion, targetAccount.Id, props.configuration.delegatedAdminAccountId);
  }

  // Process Delegated Admin Account
  if (targetAccount.Id === props.configuration.delegatedAdminAccountId) {
    await MacieMembers.enable(client, organizationAccounts, targetAccount.Id, dryRun, logPrefix);
    const memberAccountIds = organizationAccounts.map(acc => acc.Id!).filter(Boolean);
    addDelegatedAccountSetting('enabled', targetRegion, targetAccount.Id, memberAccountIds);
  }

  // Process Workload Accounts except Management and Audit
  if (![managementAccountId, props.configuration.delegatedAdminAccountId].includes(targetAccount.Id!)) {
    await MacieSession.configure(
      { accountId: targetAccount.Id!, region: targetRegion },
      client,
      props.configuration.s3Destination,
      props.configuration.policyFindingsPublishingFrequency,
      props.configuration.publishSensitiveDataFindings,
      props.configuration.publishPolicyFindings,
      dryRun,
      logPrefix,
    );

    addSessionSetting('enabled', targetRegion, targetAccount.Id!, props);
  }
}

/**
 * Enables delegated administrator account for Macie organization management
 * @param props - Macie module request properties
 * @param client - Macie2 client instance
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @returns Promise that resolves when delegated admin is configured
 */
async function enableDelegatedAdminAccount(
  props: IMacieModuleRequest,
  client: Macie2Client,
  dryRun: boolean,
  logPrefix: string,
): Promise<void> {
  const currentAdmin = await OrganizationsDelegatedAdminAccount.getOrganizationAdminAccountId(client, logPrefix);

  logger.info(
    `Current delegated admin account id: ${currentAdmin || 'none'}, Target delegated admin: ${props.configuration.delegatedAdminAccountId}`,
    logPrefix,
  );

  // Only set delegated admin if it's different from current or none is set
  if (currentAdmin !== props.configuration.delegatedAdminAccountId) {
    // If there's a different admin account, disable it first
    if (currentAdmin && currentAdmin !== props.configuration.delegatedAdminAccountId) {
      logger.info(`Disabling current delegated admin ${currentAdmin} before setting new one`, logPrefix);
      await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(client, dryRun, currentAdmin, logPrefix);
    }

    // Set the new delegated admin
    await OrganizationsDelegatedAdminAccount.enableOrganizationAdminAccount(
      client,
      dryRun,
      props.configuration.delegatedAdminAccountId,
      logPrefix,
    );
  }
}

/**
 * Disables Macie service for a specific account and region with proper cleanup
 * @param targetAccount - Target account for disablement
 * @param targetRegion - Target region for disablement
 * @param managementAccountId - Management account ID
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @param props - Macie module request properties
 * @param organizationAccounts - List of organization accounts
 * @returns Promise that resolves when service is disabled
 */
async function disableService(
  targetAccount: Account,
  targetRegion: string,
  managementAccountId: string,
  dryRun: boolean,
  logPrefix: string,
  props: IMacieModuleRequest,
  organizationAccounts: Account[],
): Promise<void> {
  const client = new Macie2Client({
    region: targetRegion,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  const macieEnabled = await isMacieEnabled(client, logPrefix);

  if (!macieEnabled) {
    logger.info(`Macie is already disabled in ${targetRegion}.`, logPrefix);
    return;
  }

  // Process Delegated Admin Account
  if (targetAccount.Id === props.configuration.delegatedAdminAccountId) {
    await MacieMembers.disable(client, organizationAccounts, targetAccount.Id, dryRun, logPrefix);
    const memberAccountIds = organizationAccounts.map(acc => acc.Id!).filter(Boolean);
    addDelegatedAccountSetting('disabled', targetRegion, targetAccount.Id, memberAccountIds);
  }

  // Process Management Account
  if (targetAccount.Id === managementAccountId) {
    await disableDelegatedAdminAccount(client, dryRun, logPrefix);
    addOrganizationSetting('disabled', targetRegion, targetAccount.Id, props.configuration.delegatedAdminAccountId);
  }

  // Process Workload Accounts except Management and Audit
  if (![managementAccountId, props.configuration.delegatedAdminAccountId].includes(targetAccount.Id!)) {
    logger.info(`Disabling Macie in ${targetRegion} for ${targetAccount.Name} account.`, logPrefix);
    await disableMacie(client, dryRun, logPrefix);
    addSessionSetting('disabled', targetRegion, targetAccount.Id!);
  }
}

/**
 * Performs final cleanup operations for management and delegated admin accounts
 * @param service - Service name for logging
 * @param managementAccountId - Management account ID
 * @param targetAccounts - Accounts requiring final cleanup
 * @param targetRegions - Regions for cleanup operations
 * @param props - Macie module request properties
 * @param dryRun - Whether to perform dry run
 * @returns Promise that resolves when cleanup is complete
 */
async function performFinalServiceCleanup(
  service: string,
  managementAccountId: string,
  targetAccounts: Account[],
  targetRegions: string[],
  props: IMacieModuleRequest,
  dryRun: boolean,
): Promise<void> {
  if (targetRegions.length === 0) {
    return;
  }

  if (targetAccounts.length === 0) {
    return;
  }

  const accounts = targetAccounts.map(item => item.Name ?? item.Id).join(',');

  logger.processStart(`Starting final Macie cleanup for [${accounts}] accounts`);

  await processAccountBatch(
    service,
    'disable',
    managementAccountId,
    targetAccounts,
    targetRegions,
    props,
    dryRun,
    macieFinalCleanupHandler,
    props.configuration.concurrency,
    macieAccountSetup,
  );

  logger.processEnd(`Successfully completed final Macie cleanup for [${accounts}] accounts`);
}

/**
 * Disables the current delegated administrator account for Macie
 * @param client - Macie2 client instance
 * @param dryRun - Whether to perform dry run
 * @param logPrefix - Logging prefix
 * @returns Promise that resolves when delegated admin is disabled
 */
async function disableDelegatedAdminAccount(client: Macie2Client, dryRun: boolean, logPrefix: string): Promise<void> {
  const delegatedAdminAccountId = await OrganizationsDelegatedAdminAccount.getOrganizationAdminAccountId(
    client,
    logPrefix,
  );

  if (delegatedAdminAccountId) {
    await OrganizationsDelegatedAdminAccount.disableOrganizationAdminAccount(
      client,
      dryRun,
      delegatedAdminAccountId,
      logPrefix,
    );
  }
}

/**
 * Adds organization-level configuration to module response
 * @param operation - Type of operation (enabled/disabled)
 * @param targetRegion - Target region for the setting
 * @param managementAccountId - Management account ID
 * @param delegatedAdminAccountId - Delegated administrator account ID
 */
function addOrganizationSetting(
  operation: SecurityModuleOperationType,
  targetRegion: string,
  managementAccountId: string,
  delegatedAdminAccountId: string,
): void {
  logger.info(`Adding organization setting for ${managementAccountId} in ${targetRegion} in response`);
  const existing = moduleResponse.organizationAdminConfig.find(
    setting => setting.operation === operation && setting.managementAccountId === managementAccountId,
  );

  if (existing) {
    logger.info(`Organization setting for ${managementAccountId} in ${targetRegion} already exists in response`);
    existing.regions.push(targetRegion);
  } else {
    if (operation === 'enabled') {
      logger.info(`Creating new organization setting for ${managementAccountId} in ${targetRegion} in response`);
      const newResponse: IMacieOrganizationAdminResponse = {
        operation: 'enabled',
        regions: [targetRegion],
        managementAccountId,
        delegatedAdminAccountId,
      };
      moduleResponse.organizationAdminConfig.push(newResponse);
    } else {
      logger.info(`Creating new organization setting for ${managementAccountId} in ${targetRegion} in response`);
      const newResponse: IMacieOrganizationAdminResponse = {
        operation: 'disabled',
        regions: [targetRegion],
        managementAccountId,
        delegatedAdminAccountId,
      };
      moduleResponse.organizationAdminConfig.push(newResponse);
    }
  }
}

/**
 * Adds delegated account configuration to module response
 * @param operation - Type of operation (enabled/disabled)
 * @param targetRegion - Target region for the setting
 * @param delegatedAdminAccountId - Delegated administrator account ID
 * @param memberAccountIds - List of member account IDs
 */
function addDelegatedAccountSetting(
  operation: SecurityModuleOperationType,
  targetRegion: string,
  delegatedAdminAccountId: string,
  memberAccountIds: string[],
): void {
  logger.info(`Adding delegated account setting for ${delegatedAdminAccountId} in ${targetRegion} in response`);
  const existing = moduleResponse.delegatedAdminAccountConfig.find(
    setting => setting.operation === operation && setting.adminAccountId === delegatedAdminAccountId,
  );

  if (existing) {
    logger.info(
      `Delegated account setting for ${delegatedAdminAccountId} in ${targetRegion} already exists in response`,
    );
    existing.regions.push(targetRegion);
  } else {
    if (operation === 'enabled') {
      logger.info(
        `Creating new delegated account setting for ${delegatedAdminAccountId} in ${targetRegion} in response`,
      );
      const newResponse: IMacieDelegatedAccountResponse = {
        operation: 'enabled',
        regions: [targetRegion],
        adminAccountId: delegatedAdminAccountId,
        memberAccountIds,
      };
      moduleResponse.delegatedAdminAccountConfig.push(newResponse);
    } else {
      logger.info(
        `Creating new delegated account setting for ${delegatedAdminAccountId} in ${targetRegion} in response`,
      );
      const newResponse: IMacieDelegatedAccountResponse = {
        operation: 'disabled',
        regions: [targetRegion],
        adminAccountId: delegatedAdminAccountId,
        memberAccountIds,
      };
      moduleResponse.delegatedAdminAccountConfig.push(newResponse);
    }
  }
}

/**
 * Adds session-level configuration to module response
 * @param operation - Type of operation (enabled/disabled)
 * @param targetRegion - Target region for the setting
 * @param accountId - Account ID for the session
 * @param props - Optional Macie module request properties for configuration details
 */
function addSessionSetting(
  operation: SecurityModuleOperationType,
  targetRegion: string,
  accountId: string,
  props?: IMacieModuleRequest,
): void {
  logger.info(`Adding session setting for ${accountId} in ${targetRegion} in response`);
  const existing = moduleResponse.sessionConfig.find(setting => setting.operation === operation);

  if (existing) {
    logger.info(`Session setting for ${accountId} in ${targetRegion} already exists in response`);
    if (!existing.accountIds.includes(accountId)) {
      logger.info(`Adding account ${accountId} to session setting for ${operation} operation in response`);
      existing.accountIds.push(accountId);
    }
    if (!existing.regions.includes(targetRegion)) {
      logger.info(`Adding region ${targetRegion} to session setting for ${operation} operation in response`);
      existing.regions.push(targetRegion);
    }
  } else {
    logger.info(`Creating new session setting for ${accountId} in ${targetRegion} in response`);
    const newResponse: IMacieSessionResponse = {
      operation,
      regions: [targetRegion],
      accountIds: [accountId],
    };

    if (operation === 'enabled' && props) {
      logger.info(`Adding configuration to session setting for ${accountId} in ${targetRegion} in response`);
      newResponse.publishSensitiveDataFindings = props.configuration.publishSensitiveDataFindings;
      newResponse.findingPublishingFrequency = props.configuration.policyFindingsPublishingFrequency;
      newResponse.s3Destination = props.configuration.s3Destination;
    }
    moduleResponse.sessionConfig.push(newResponse);
  }
}

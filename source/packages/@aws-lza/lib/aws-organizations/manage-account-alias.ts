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
 * @fileoverview Manages IAM account aliases across the organization.
 *
 * @description
 * Reconciles the desired IAM account alias for every account in the request.
 * IAM `CreateAccountAlias` runs inside the target account's credentials
 * context, so the module assumes a cross-account role for every
 * non-management account before invoking the API. The management account
 * uses the credentials carried on the request directly.
 *
 * On alias conflicts (another AWS account has already claimed the desired
 * alias globally), the module restores the previous alias so the account is
 * not left without one.
 */

import path from 'node:path';
import {
  CreateAccountAliasCommand,
  DeleteAccountAliasCommand,
  EntityAlreadyExistsException,
  IAMClient,
  ListAccountAliasesCommand,
} from '@aws-sdk/client-iam';

import { AssumeRoleCredentialType, IModuleResponse } from '../common/interfaces';
import { createLogger } from '../common/logger';
import { runPerAccount } from '../common/organizations/account-targets';
import { getCredentials } from '../common/sts-functions';
import { throttlingBackOff } from '../common/throttle';
import { MODULE_EXCEPTIONS, MODULE_STATE_CODE } from '../common/types';
import { setRetryStrategy } from '../common/utility';
import {
  IAccountAliasConfig,
  IManageAccountAliasModuleRequest,
  IManageAccountAliasModuleResponse,
  IManageAccountAliasPerAccountResult,
} from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

const MODULE_NAME_DEFAULT = 'manage-account-alias';

/**
 * IAM account alias format:
 *   - 3 to 63 characters
 *   - lowercase letters, digits, hyphens only
 *   - must start and end with a letter or digit
 *   - no consecutive hyphens
 *
 * @see https://docs.aws.amazon.com/IAM/latest/UserGuide/console_account-alias.html
 */
const ALIAS_FORMAT = /^[a-z0-9]([a-z0-9]|-(?!-))*[a-z0-9]$/;
const ALIAS_MIN_LENGTH = 3;
const ALIAS_MAX_LENGTH = 63;

/**
 * Reconcile IAM account aliases across the organization.
 *
 * @description
 * Orchestrates alias reconciliation across every account in the request
 * configuration. Returns a single {@link IModuleResponse} whose `response`
 * payload aggregates per-account outcomes so operators can see what
 * happened for each account even when some accounts fail.
 *
 * Cross-account role assumption is handled inside this function — callers
 * only need to pass management-account credentials and the role name.
 */
export async function manageAccountAlias(
  props: IManageAccountAliasModuleRequest,
): Promise<IModuleResponse<IManageAccountAliasModuleResponse>> {
  const moduleName = props.moduleName ?? MODULE_NAME_DEFAULT;
  const dryRun = props.dryRun ?? false;
  const logPrefix = `${props.invokingAccountId}:${props.region}`;

  logger.processStart(`Starting ${moduleName} module`, logPrefix);

  if (props.configuration.accounts.length === 0) {
    const summary = `No accounts supplied — nothing to reconcile`;
    logger.info(summary, logPrefix);
    return successResponse(moduleName, dryRun, summary, []);
  }

  const perAccountResults = await runPerAccount(
    props.configuration.accounts.map(a => ({ accountId: a.accountId, accountName: a.accountName })),
    async target => {
      const accountConfig = props.configuration.accounts.find(a => a.accountId === target.accountId)!;
      return reconcileAccountAlias(accountConfig, props, dryRun, logPrefix);
    },
  );

  const failures = perAccountResults.filter(r => r.status === 'failed');

  if (failures.length > 0) {
    const summary = `${moduleName} completed with ${failures.length} failure(s) across ${perAccountResults.length} account(s)`;
    logger.error(summary, logPrefix);
    return {
      status: MODULE_STATE_CODE.FAILED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      error: failures[0].error,
      response: { perAccountResults },
    };
  }

  const summary = `${moduleName} completed successfully across ${perAccountResults.length} account(s)`;
  logger.processEnd(summary, logPrefix);
  return successResponse(moduleName, dryRun, summary, perAccountResults);
}

/**
 * Reconcile the IAM account alias for a single account.
 */
async function reconcileAccountAlias(
  config: IAccountAliasConfig,
  props: IManageAccountAliasModuleRequest,
  dryRun: boolean,
  logPrefix: string,
): Promise<IManageAccountAliasPerAccountResult> {
  const { accountId, accountName, alias } = config;

  try {
    const validation = validateAlias(alias);

    const credentials = await resolveAccountCredentials(config, props, logPrefix);
    const client = new IAMClient({
      region: props.region,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
      credentials,
    });

    const currentAlias = await getCurrentAlias(client);

    if (dryRun) {
      return buildDryRunResult(accountId, accountName, alias, currentAlias, validation.errorMessage);
    }

    if (!validation.isValid && validation.errorMessage) {
      return {
        accountId,
        accountName,
        status: 'validation-error',
        currentAlias,
        message: validation.errorMessage,
        error: { name: 'ValidationError', message: validation.errorMessage },
      };
    }

    if (currentAlias === alias) {
      const message = `Account alias "${alias}" is already set for this account`;
      logger.info(message, logPrefix);
      return { accountId, accountName, status: 'no-change', currentAlias, message };
    }

    return applyAlias(client, accountId, accountName, alias, currentAlias, logPrefix);
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : 'UnknownError';
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Account ${accountId}: alias reconciliation failed: ${message}`, logPrefix);
    return {
      accountId,
      accountName,
      status: 'failed',
      message,
      error: { name, message },
    };
  }
}

/**
 * Resolve the IAM credentials to use against a single account.
 *
 * @description
 * The management account uses the credentials carried on the request. Every
 * other account requires an STS role assumption into the configured access
 * role so the IAM call lands inside the target account's context.
 */
async function resolveAccountCredentials(
  config: IAccountAliasConfig,
  props: IManageAccountAliasModuleRequest,
  logPrefix: string,
): Promise<AssumeRoleCredentialType | undefined> {
  if (config.accountId === props.configuration.managementAccountId) {
    return props.credentials;
  }
  return await getCredentials({
    accountId: config.accountId,
    region: props.region,
    partition: props.partition,
    solutionId: props.solutionId,
    assumeRoleName: props.configuration.accountAccessRoleName,
    credentials: props.credentials,
    sessionPolicy: props.sessionPolicy,
    requireSessionPolicy: !!props.sessionPolicy,
    logPrefix,
  });
}

/**
 * Apply the desired alias by deleting the existing one (if any) and creating
 * the new one. Handles global-uniqueness conflicts with rollback.
 */
async function applyAlias(
  client: IAMClient,
  accountId: string,
  accountName: string,
  desiredAlias: string,
  currentAlias: string | undefined,
  logPrefix: string,
): Promise<IManageAccountAliasPerAccountResult> {
  const messages: string[] = [];

  if (currentAlias) {
    try {
      await throttlingBackOff(() => client.send(new DeleteAccountAliasCommand({ AccountAlias: currentAlias })));
      messages.push(`Successfully deleted existing account alias "${currentAlias}"`);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : 'UnknownError';
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to delete alias "${currentAlias}": ${message}`, logPrefix);
      return {
        accountId,
        accountName,
        status: 'failed',
        previousAlias: currentAlias,
        message,
        error: { name, message },
      };
    }
  }

  try {
    await throttlingBackOff(() => client.send(new CreateAccountAliasCommand({ AccountAlias: desiredAlias })));
    const message = `Account alias "${desiredAlias}" successfully set.`;
    logger.info(message, logPrefix);
    messages.push(message);
    return {
      accountId,
      accountName,
      status: currentAlias ? 'replaced' : 'created',
      previousAlias: currentAlias,
      currentAlias: desiredAlias,
      message: messages.join('\n'),
    };
  } catch (err: unknown) {
    if (err instanceof EntityAlreadyExistsException) {
      const conflictMsg = `Alias "${desiredAlias}" is already taken by another AWS account. Aliases must be unique across all AWS accounts globally.`;
      logger.error(conflictMsg, logPrefix);
      messages.push(conflictMsg);

      if (currentAlias) {
        messages.push(await rollback(client, currentAlias, logPrefix));
      }

      return {
        accountId,
        accountName,
        status: 'conflict',
        previousAlias: currentAlias,
        currentAlias,
        message: messages.join('\n'),
        error: { name: 'EntityAlreadyExistsException', message: conflictMsg },
      };
    }

    const name = err instanceof Error ? err.name : 'UnknownError';
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to create alias "${desiredAlias}": ${message}`,
      logPrefix,
    );

    if (currentAlias) {
      messages.push(await rollback(client, currentAlias, logPrefix));
    }

    return {
      accountId,
      accountName,
      status: 'failed',
      previousAlias: currentAlias,
      currentAlias,
      message: messages.join('\n') || message,
      error: { name, message },
    };
  }
}

/**
 * Attempts to restore the previous alias after a failed create.
 */
async function rollback(client: IAMClient, previousAlias: string, logPrefix: string): Promise<string> {
  try {
    await throttlingBackOff(() => client.send(new CreateAccountAliasCommand({ AccountAlias: previousAlias })));
    const message = `Reverted to previous account alias "${previousAlias}"`;
    logger.info(message, logPrefix);
    return message;
  } catch (err: unknown) {
    const message = `Failed to revert to previous alias "${previousAlias}". Account left without alias.`;
    logger.error(`${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ${message}: ${err}`, logPrefix);
    return message;
  }
}

async function getCurrentAlias(client: IAMClient): Promise<string | undefined> {
  const response = await throttlingBackOff(() => client.send(new ListAccountAliasesCommand({})));
  return response.AccountAliases?.[0];
}

function validateAlias(alias: string): { isValid: boolean; errorMessage?: string } {
  if (!ALIAS_FORMAT.test(alias) || alias.length < ALIAS_MIN_LENGTH || alias.length > ALIAS_MAX_LENGTH) {
    const errorMessage = `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid alias format "${alias}" - must be 3-63 chars, lowercase alphanumeric with hyphens, no consecutive hyphens`;
    return { isValid: false, errorMessage };
  }
  return { isValid: true };
}

function buildDryRunResult(
  accountId: string,
  accountName: string,
  desiredAlias: string,
  currentAlias: string | undefined,
  validationErrorMessage?: string,
): IManageAccountAliasPerAccountResult {
  if (validationErrorMessage) {
    const message = `Will experience ${validationErrorMessage}`;
    return { accountId, accountName, status: 'dry-run', currentAlias, message };
  }
  if (currentAlias === desiredAlias) {
    const message = `Account alias "${desiredAlias}" is already set for this account`;
    return { accountId, accountName, status: 'dry-run', currentAlias, message };
  }
  if (currentAlias) {
    const message = `Will delete existing account alias "${currentAlias}" and set new alias "${desiredAlias}"`;
    return { accountId, accountName, status: 'dry-run', previousAlias: currentAlias, message };
  }
  const message = `Will set account alias "${desiredAlias}" (no existing alias)`;
  return { accountId, accountName, status: 'dry-run', message };
}

function successResponse(
  moduleName: string,
  dryRun: boolean,
  summary: string,
  perAccountResults: IManageAccountAliasPerAccountResult[],
): IModuleResponse<IManageAccountAliasModuleResponse> {
  return {
    status: MODULE_STATE_CODE.SUCCESS,
    summary,
    timestamp: new Date().toISOString(),
    moduleName,
    dryRun,
    response: { perAccountResults },
  };
}

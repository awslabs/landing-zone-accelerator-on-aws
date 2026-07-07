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
 * @fileoverview Unified accounts module — orchestrates all account-level operations.
 *
 * @description
 * Single entry point for account management operations (alias, tags). Delegates
 * to the existing `manageAccountAlias` and `manageAccountTags` module functions
 * internally, aggregating their results into a single response. This matches the
 * pattern used by Amazon Macie where one module function owns all sub-operations.
 *
 * Future account-level operations (e.g., account quotas, service access) can be
 * added here without creating new modules.
 */

import path from 'node:path';

import { AcceleratorModuleName, IModuleResponse } from '../common/interfaces';
import { createLogger } from '../common/logger';
import { MODULE_STATE_CODE } from '../common/types';
import {
  IAccountsModuleRequest,
  IAccountsModuleResponse,
  IAccountsPerAccountResult,
  IManageAccountAliasPerAccountResult,
  IManageAccountTagsPerAccountResult,
} from './interfaces';
import { manageAccountAlias } from './manage-account-alias';
import { manageAccountTags } from './manage-account-tags';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Unified accounts module entry point.
 *
 * @description
 * Orchestrates alias and tag reconciliation across all accounts in a single
 * call. Internally delegates to the existing `manageAccountAlias` and
 * `manageAccountTags` functions, then merges their per-account results into
 * a unified response.
 *
 * Operations are run sequentially (alias first, then tags) because they are
 * independent and the total account count is bounded. If either sub-operation
 * fails for any account, the overall module reports a failure but still
 * includes all per-account results for observability.
 */
export async function configureAccounts(
  props: IAccountsModuleRequest,
): Promise<IModuleResponse<IAccountsModuleResponse>> {
  const moduleName = props.moduleName ?? AcceleratorModuleName.ACCOUNTS;
  const dryRun = props.dryRun ?? false;
  const logPrefix = `${props.invokingAccountId}:${props.region}`;

  logger.processStart(`Starting ${moduleName} module`, logPrefix);

  if (props.configuration.accounts.length === 0) {
    const summary = `No accounts supplied — nothing to reconcile`;
    logger.info(summary, logPrefix);
    return successResponse(moduleName, dryRun, summary, []);
  }

  // Partition accounts by which sub-operations they need
  const accountsWithAlias = props.configuration.accounts.filter(a => a.alias && a.alias.length > 0);
  const accountsWithTags = props.configuration.accounts.filter(a => a.tags !== undefined && a.tags.length > 0);

  // Run alias sub-operation
  const aliasResults: Map<string, IManageAccountAliasPerAccountResult> = new Map();
  if (accountsWithAlias.length > 0) {
    const aliasResponse = await manageAccountAlias({
      operation: 'manage-account-alias',
      moduleName: `${moduleName}/alias`,
      partition: props.partition,
      region: props.region,
      globalRegion: props.globalRegion,
      invokingAccountId: props.invokingAccountId,
      solutionId: props.solutionId,
      credentials: props.credentials,
      sessionPolicy: props.sessionPolicy,
      dryRun,
      configuration: {
        accounts: accountsWithAlias.map(a => ({
          accountId: a.accountId,
          accountName: a.accountName,
          alias: a.alias!,
        })),
        accountAccessRoleName: props.configuration.accountAccessRoleName,
        managementAccountId: props.configuration.managementAccountId,
      },
    });
    if (aliasResponse.response) {
      for (const result of aliasResponse.response.perAccountResults) {
        aliasResults.set(result.accountId, result);
      }
    }
  }

  // Run tags sub-operation
  const tagsResults: Map<string, IManageAccountTagsPerAccountResult> = new Map();
  if (accountsWithTags.length > 0) {
    const tagsResponse = await manageAccountTags({
      operation: 'manage-account-tags',
      moduleName: `${moduleName}/tags`,
      partition: props.partition,
      region: props.region,
      globalRegion: props.globalRegion,
      invokingAccountId: props.invokingAccountId,
      solutionId: props.solutionId,
      credentials: props.credentials,
      dryRun,
      configuration: {
        accounts: accountsWithTags.map(a => ({
          accountId: a.accountId,
          accountName: a.accountName,
          tags: a.tags!,
        })),
      },
    });
    if (tagsResponse.response) {
      for (const result of tagsResponse.response.perAccountResults) {
        tagsResults.set(result.accountId, result);
      }
    }
  }

  // Merge results per account
  const allAccountIds = new Set(props.configuration.accounts.map(a => a.accountId));
  const perAccountResults: IAccountsPerAccountResult[] = [];

  for (const account of props.configuration.accounts) {
    const result: IAccountsPerAccountResult = {
      accountId: account.accountId,
      accountName: account.accountName,
      aliasResult: aliasResults.get(account.accountId),
      tagsResult: tagsResults.get(account.accountId),
    };
    perAccountResults.push(result);
  }

  // Determine overall status
  const aliasFailures = perAccountResults.filter(r => r.aliasResult?.status === 'failed');
  const tagsFailures = perAccountResults.filter(r => r.tagsResult?.status === 'failed');
  const totalFailures = aliasFailures.length + tagsFailures.length;

  if (totalFailures > 0) {
    const summary = `${moduleName} completed with ${totalFailures} failure(s) across ${allAccountIds.size} account(s)`;
    logger.error(summary, logPrefix);
    const firstError = aliasFailures[0]?.aliasResult?.error ?? tagsFailures[0]?.tagsResult?.error;
    return {
      status: MODULE_STATE_CODE.FAILED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      error: firstError,
      response: { perAccountResults },
    };
  }

  const aliasCount = aliasResults.size;
  const tagsApplied = [...tagsResults.values()].reduce((sum, r) => sum + (r.appliedCount ?? 0), 0);
  const summary = `${moduleName} completed successfully — ${allAccountIds.size} account(s) reconciled (${aliasCount} alias, ${tagsApplied} tag(s) applied)`;
  logger.processEnd(summary, logPrefix);
  return successResponse(moduleName, dryRun, summary, perAccountResults);
}

function successResponse(
  moduleName: string,
  dryRun: boolean,
  summary: string,
  perAccountResults: IAccountsPerAccountResult[],
): IModuleResponse<IAccountsModuleResponse> {
  return {
    status: MODULE_STATE_CODE.SUCCESS,
    summary,
    timestamp: new Date().toISOString(),
    moduleName,
    dryRun,
    response: { perAccountResults },
  };
}

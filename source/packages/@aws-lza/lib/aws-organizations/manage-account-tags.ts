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
 * @fileoverview Manages AWS Organizations account tags across the organization.
 *
 * @description
 * Additive-only reconciliation: creates missing tags and updates changed
 * values; never removes existing tags. Enforces the 50-tag-per-account
 * AWS Organizations limit before any write. Runs from the management
 * account using Organizations APIs — no cross-account role assumption is
 * needed because Organizations APIs accept a target account ID.
 */

import path from 'node:path';
import { ListTagsForResourceCommand, OrganizationsClient, TagResourceCommand } from '@aws-sdk/client-organizations';

import { IModuleResponse } from '../common/interfaces';
import { createLogger } from '../common/logger';
import { throttlingBackOff } from '../common/throttle';
import { runPerAccount } from '../common/organizations/account-targets';
import { MODULE_STATE_CODE } from '../common/types';
import { setRetryStrategy } from '../common/utility';
import {
  IAccountTagsConfig,
  IManageAccountTagsModuleRequest,
  IManageAccountTagsModuleResponse,
  IManageAccountTagsPerAccountResult,
} from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

const MODULE_NAME_DEFAULT = 'manage-account-tags';

/**
 * AWS Organizations per-account tag limit.
 *
 * @description
 * Organizations caps tags per resource at 50. The module checks this bound
 * before calling TagResource so a request that would exceed the limit
 * surfaces a structured failure rather than a raw API error.
 *
 * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_tagging.html
 */
const MAX_TAGS_PER_ACCOUNT = 50;

/**
 * Reconcile AWS Organizations account tags across the organization.
 *
 * @description
 * Orchestrates tag reconciliation across every account in the request
 * configuration. Returns a single {@link IModuleResponse} whose `response`
 * payload aggregates per-account outcomes so operators can see what happened
 * for each account even when some accounts fail.
 *
 * The module function owns the per-account loop — callers pass the full list
 * of accounts as `configuration.accounts` and receive one aggregated result
 * back. This matches the pattern used by Amazon Macie and other LZA modules.
 */
export async function manageAccountTags(
  props: IManageAccountTagsModuleRequest,
): Promise<IModuleResponse<IManageAccountTagsModuleResponse>> {
  const moduleName = props.moduleName ?? MODULE_NAME_DEFAULT;
  const dryRun = props.dryRun ?? false;
  const logPrefix = `${props.invokingAccountId}:${props.region}`;

  logger.processStart(`Starting ${moduleName} module`, logPrefix);

  if (props.configuration.accounts.length === 0) {
    const summary = `No accounts supplied — nothing to reconcile`;
    logger.info(summary, logPrefix);
    return successResponse(moduleName, dryRun, summary, []);
  }

  const client = new OrganizationsClient({
    region: props.region,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });

  const perAccountResults = await runPerAccount(
    props.configuration.accounts.map(a => ({ accountId: a.accountId, accountName: a.accountName })),
    async target => {
      const accountConfig = props.configuration.accounts.find(a => a.accountId === target.accountId)!;
      return reconcileAccountTags(client, accountConfig, dryRun, logPrefix);
    },
  );

  const failures = perAccountResults.filter(r => r.status === 'failed');
  const appliedCount = perAccountResults.reduce((sum, r) => sum + (r.appliedCount ?? 0), 0);

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

  const summary = `${moduleName} completed successfully — ${perAccountResults.length} account(s) reconciled, ${appliedCount} tag(s) applied`;
  logger.processEnd(summary, logPrefix);
  return successResponse(moduleName, dryRun, summary, perAccountResults);
}

/**
 * Reconcile tags for a single account.
 *
 * @description
 * Additive-only: only tags whose key is new or whose value differs from the
 * live state are applied; existing tags not in the desired set are preserved
 * so operators can add account-local tags without having LZA wipe them on the
 * next run.
 */
async function reconcileAccountTags(
  client: OrganizationsClient,
  config: IAccountTagsConfig,
  dryRun: boolean,
  logPrefix: string,
): Promise<IManageAccountTagsPerAccountResult> {
  const { accountId, accountName, tags: desiredTags } = config;

  try {
    const currentResponse = await throttlingBackOff(() =>
      client.send(new ListTagsForResourceCommand({ ResourceId: accountId })),
    );
    const currentMap = new Map((currentResponse.Tags ?? []).map(t => [t.Key!, t.Value!]));

    const tagsToApply = desiredTags.filter(t => currentMap.get(t.key) !== t.value);

    // Enforce the Organizations 50-tag-per-account limit before any write.
    // Only newly-introduced keys count toward the limit increase; value updates
    // on existing keys leave the total tag count unchanged.
    const newKeyCount = tagsToApply.filter(t => !currentMap.has(t.key)).length;
    const totalAfterApply = currentMap.size + newKeyCount;
    if (totalAfterApply > MAX_TAGS_PER_ACCOUNT) {
      const message = `applying tags would result in ${totalAfterApply} tags, exceeding the AWS Organizations limit of ${MAX_TAGS_PER_ACCOUNT}`;
      return {
        accountId,
        accountName,
        status: 'failed',
        message,
        error: { name: 'TagLimitExceeded', message },
      };
    }

    if (tagsToApply.length === 0) {
      const message = `Account ${accountId}: tags already match desired state, no changes needed.`;
      logger.info(message, logPrefix);
      return { accountId, accountName, status: 'no-change', message };
    }

    if (dryRun) {
      const message = `Account ${accountId}: will apply ${tagsToApply.length} tag(s).`;
      logger.info(`[dry-run] ${message}`, logPrefix);
      return { accountId, accountName, status: 'dry-run', appliedCount: tagsToApply.length, message };
    }

    await throttlingBackOff(() =>
      client.send(
        new TagResourceCommand({
          ResourceId: accountId,
          Tags: tagsToApply.map(t => ({ Key: t.key, Value: t.value })),
        }),
      ),
    );

    const message = `Account ${accountId}: applied ${tagsToApply.length} tag(s).`;
    logger.info(message, logPrefix);
    return { accountId, accountName, status: 'applied', appliedCount: tagsToApply.length, message };
  } catch (err: unknown) {
    const name = err instanceof Error ? err.name : 'UnknownError';
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Account ${accountId}: tag reconciliation failed: ${message}`, logPrefix);
    return {
      accountId,
      accountName,
      status: 'failed',
      message,
      error: { name, message },
    };
  }
}

function successResponse(
  moduleName: string,
  dryRun: boolean,
  summary: string,
  perAccountResults: IManageAccountTagsPerAccountResult[],
): IModuleResponse<IManageAccountTagsModuleResponse> {
  return {
    status: MODULE_STATE_CODE.SUCCESS,
    summary,
    timestamp: new Date().toISOString(),
    moduleName,
    dryRun,
    response: { perAccountResults },
  };
}

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

import {
  AttachPolicyCommand,
  DetachPolicyCommand,
  ListPoliciesCommand,
  ListTargetsForPolicyCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import path from 'node:path';

import { IModuleResponse } from '../common/interfaces';
import { createLogger } from '../common/logger';
import { throttlingBackOff } from '../common/throttle';
import { MODULE_STATE_CODE } from '../common/types';
import { processInBatches, setRetryStrategy } from '../common/utility';
import {
  ITagAndBackupPolicyAccountAttachmentConfig,
  ITagAndBackupPolicyAccountAttachmentPolicyResult,
  ITagAndBackupPolicyAccountAttachmentResult,
  ITagAndBackupPolicyAccountAttachmentsModuleRequest,
  ITagAndBackupPolicyAccountAttachmentsModuleResponse,
  TagAndBackupPolicyType,
} from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const MODULE_NAME_DEFAULT = 'tag-and-backup-policy-account-attachments';
const POLICY_DISCOVERY_MAX_ATTEMPTS = 5;
const POLICY_DISCOVERY_RETRY_DELAY_MS = 2000;
const POLICY_READ_REQUEST_INTERVAL_MS = 200;
const POLICY_TARGET_READ_BATCH_SIZE = 5;
const POLICY_WRITE_BATCH_SIZE = 2;
const POLICY_API_BATCH_DELAY_MS = 1000;
const UNMANAGED_ACCOUNT_LOG_BATCH_SIZE = 100;
const MAX_POLICY_TYPE_ATTACHMENT_LIMIT_EXCEEDED = 'MAX_POLICY_TYPE_ATTACHMENT_LIMIT_EXCEEDED';

/**
 * Internal state of a policy reconciliation plan.
 */
type PolicyAccountAttachmentPlanStatus = 'ready' | 'pending-create' | 'failed';

/**
 * Read-before-write plan for one policy's direct-account attachments.
 */
interface IPolicyAccountAttachmentPlan {
  /** Desired policy and direct-account attachment configuration */
  readonly config: ITagAndBackupPolicyAccountAttachmentConfig;
  /** Organizations policy ID when discovery succeeded */
  readonly policyId?: string;
  /** Desired account IDs that are not currently direct targets */
  readonly accountIdsToAttach: ReadonlyArray<string>;
  /** Current direct account IDs that are no longer desired */
  readonly accountIdsToDetach: ReadonlyArray<string>;
  /** Stable-sorted live direct account IDs outside current desired and previous LZA ownership */
  readonly unmanagedAccountIds: ReadonlyArray<string>;
  /** Preflight outcome controlling whether this plan may write */
  readonly status: PolicyAccountAttachmentPlanStatus;
  /** Human-readable preflight outcome */
  readonly message?: string;
  /** Preflight error details when the plan failed */
  readonly error?: {
    /** Error class or stable module error name */
    readonly name: string;
    /** Error detail suitable for logs and module output */
    readonly message: string;
  };
  /** Account-level outcomes accumulated while the plan is applied */
  readonly accountResults: ITagAndBackupPolicyAccountAttachmentResult[];
}

/**
 * Policy IDs and type-level discovery failures collected across bounded attempts.
 */
interface IPolicyDiscoveryResult {
  /** Exact policy name to ID mappings grouped by policy type */
  readonly policyIdsByType: ReadonlyMap<TagAndBackupPolicyType, ReadonlyMap<string, string>>;
  /** Discovery error shared by every configured policy of the affected type */
  readonly errorsByType: ReadonlyMap<TagAndBackupPolicyType, { readonly name: string; readonly message: string }>;
}

/**
 * Invocation-local gate for Organizations policy read request starts.
 */
interface IPolicyReadRequestLimiter {
  /** Wait until the next policy read request may start */
  waitForRequestStart(): Promise<void>;
}

/**
 * One policy target read that can be processed independently.
 */
interface IPolicyTargetRead {
  /** Position in the configuration-ordered plan array */
  readonly planIndex: number;
  /** Policy attachment configuration */
  readonly config: ITagAndBackupPolicyAccountAttachmentConfig;
  /** Discovered Organizations policy ID */
  readonly policyId: string;
}

/**
 * One account attachment mutation and its eventual result.
 */
interface IPolicyAccountAttachmentOperation {
  /** Plan that owns the account result */
  readonly plan: IPolicyAccountAttachmentPlan;
  /** Discovered Organizations policy ID */
  readonly policyId: string;
  /** Target account ID */
  readonly accountId: string;
  /** Attachment operation */
  readonly operation: 'attach' | 'detach';
  /** Result populated by the bounded batch worker */
  result?: ITagAndBackupPolicyAccountAttachmentResult;
}

/**
 * Reconcile direct-account attachments for configured tag and backup policies.
 *
 * OU and root targets are intentionally excluded from comparison and are never
 * modified by this module. Every changed policy is validated before writes,
 * all missing attachments are attempted first, and no stale attachment is
 * removed when any policy preflight or attachment fails.
 *
 * @param props Normalized module request containing policies and desired account IDs
 * @returns Structured module response with per-policy and per-account outcomes
 */
export async function manageTagAndBackupPolicyAccountAttachments(
  props: ITagAndBackupPolicyAccountAttachmentsModuleRequest,
): Promise<IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse>> {
  const moduleName = props.moduleName ?? MODULE_NAME_DEFAULT;
  const dryRun = props.dryRun ?? false;
  const logPrefix = `${props.invokingAccountId}:${props.region}`;

  logger.processStart(`Starting ${moduleName} module`, logPrefix);

  if (props.configuration.policies.length === 0) {
    const summary = 'No tag or backup policies supplied - nothing to reconcile';
    logger.processEnd(summary, logPrefix);
    return successResponse(moduleName, dryRun, summary, []);
  }

  const client = new OrganizationsClient({
    region: props.region,
    customUserAgent: props.solutionId,
    retryStrategy: setRetryStrategy(),
    credentials: props.credentials,
  });
  const policyReadRequestLimiter = createPolicyReadRequestLimiter(POLICY_READ_REQUEST_INTERVAL_MS);

  const perPolicyResults = await syncPolicyAccountAttachments(
    client,
    policyReadRequestLimiter,
    props.configuration.policies,
    dryRun,
    logPrefix,
  );
  const failures = perPolicyResults.filter(result => result.status === 'failed');
  const accountChanges = perPolicyResults.flatMap(result => result.accountResults);
  const attached = accountChanges.filter(result => result.status === 'attached').length;
  const detached = accountChanges.filter(result => result.status === 'detached').length;
  const deferred = accountChanges.filter(result => result.status === 'deferred').length;
  const plannedAttachments = accountChanges.filter(
    result => result.operation === 'attach' && result.status === 'dry-run',
  ).length;
  const plannedDetachments = accountChanges.filter(
    result => result.operation === 'detach' && result.status === 'dry-run',
  ).length;
  const pendingCreateAttachments = accountChanges.filter(
    result => result.operation === 'attach' && result.status === 'pending-create',
  ).length;

  if (failures.length > 0) {
    const deferredSummary = deferred > 0 ? `; ${deferred} operation(s) safely deferred` : '';
    const plannedSummary = dryRun
      ? `; ${plannedAttachments} attachment(s) planned, ${plannedDetachments} detachment(s) planned, ${pendingCreateAttachments} attachment(s) pending policy creation`
      : '';
    const summary = `${moduleName} completed with ${failures.length} policy failure(s) across ${perPolicyResults.length} policy(s)${plannedSummary}${deferredSummary}`;
    logger.error(summary, logPrefix);
    return {
      status: MODULE_STATE_CODE.FAILED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      error: failures[0].error ?? accountChanges.find(result => result.error)?.error,
      response: { perPolicyResults },
    };
  }

  const summary = dryRun
    ? `${moduleName} dry run completed successfully - ${perPolicyResults.length} policy(s) evaluated, ${plannedAttachments} attachment(s) planned, ${plannedDetachments} detachment(s) planned, ${pendingCreateAttachments} attachment(s) pending policy creation`
    : `${moduleName} completed successfully - ${perPolicyResults.length} policy(s) reconciled, ${attached} attachment(s) added, ${detached} attachment(s) removed`;
  logger.processEnd(summary, logPrefix);
  return successResponse(moduleName, dryRun, summary, perPolicyResults);
}

/**
 * Synchronize direct-account targets using a global add-before-remove safety gate.
 *
 * @param client Organizations client using management-account credentials
 * @param policyReadRequestLimiter Shared invocation-local policy read request limiter
 * @param configs Policy names, types, and desired direct account IDs
 * @param dryRun Whether changes should be reported without being applied
 * @param logPrefix Prefix used for module logs
 * @returns Reconciliation results in configuration order
 */
async function syncPolicyAccountAttachments(
  client: OrganizationsClient,
  policyReadRequestLimiter: IPolicyReadRequestLimiter,
  configs: ReadonlyArray<ITagAndBackupPolicyAccountAttachmentConfig>,
  dryRun: boolean,
  logPrefix: string,
): Promise<ITagAndBackupPolicyAccountAttachmentPolicyResult[]> {
  const plans = await buildPolicyAccountAttachmentPlans(client, policyReadRequestLimiter, configs, dryRun, logPrefix);

  if (dryRun) {
    recordDryRunResults(plans);
    return plans.map(plan => policyResult(plan));
  }

  for (const plan of plans.filter(item => item.status === 'failed')) {
    deferPlanOperations(plan, `Preflight failed for policy ${plan.config.policyName}; no writes were attempted`);
  }

  const attachmentOperations = collectPolicyOperations(plans, 'attach');
  await applyPolicyOperations(client, attachmentOperations, logPrefix);

  const hasPreflightOrAttachmentFailure = plans.some(
    plan => plan.status === 'failed' || plan.accountResults.some(result => result.status === 'failed'),
  );
  if (hasPreflightOrAttachmentFailure) {
    for (const plan of plans) {
      deferPolicyDetachments(
        plan,
        'Detach deferred because at least one policy preflight or account attachment failed during this execution',
      );
    }
  } else {
    const detachmentOperations = collectPolicyOperations(plans, 'detach');
    if (attachmentOperations.length > 0 && detachmentOperations.length > 0) {
      await sleep(POLICY_API_BATCH_DELAY_MS);
    }
    await applyPolicyOperations(client, detachmentOperations, logPrefix);
  }

  return plans.map(plan => policyResult(plan));
}

/**
 * Discover configured policies and build configuration-ordered reconciliation plans.
 *
 * @param client Organizations client using management-account credentials
 * @param policyReadRequestLimiter Shared invocation-local policy read request limiter
 * @param configs Policy names, types, and desired direct account IDs
 * @param dryRun Whether missing policies may be pending CDK work
 * @param logPrefix Prefix used for module logs
 * @returns Preflight plans in configuration order
 */
async function buildPolicyAccountAttachmentPlans(
  client: OrganizationsClient,
  policyReadRequestLimiter: IPolicyReadRequestLimiter,
  configs: ReadonlyArray<ITagAndBackupPolicyAccountAttachmentConfig>,
  dryRun: boolean,
  logPrefix: string,
): Promise<IPolicyAccountAttachmentPlan[]> {
  const discovery = await discoverPolicyIds(client, policyReadRequestLimiter, configs, !dryRun, logPrefix);
  const targetReads: IPolicyTargetRead[] = [];
  const plans: IPolicyAccountAttachmentPlan[] = configs.map((config, planIndex) => {
    const discoveryError = discovery.errorsByType.get(config.policyType);
    if (discoveryError) {
      logger.error(`Policy ${config.policyName} reconciliation failed: ${discoveryError.message}`, logPrefix);
      return failedPlan(config, discoveryError.message, discoveryError.name);
    }

    const policyId = discovery.policyIdsByType.get(config.policyType)?.get(config.policyName);
    if (!policyId) {
      const message = `Policy "${config.policyName}" of type ${config.policyType} was not found`;
      if (config.cleanupOnly) {
        return completedCleanupPlan(config, `${message}; previous attachment ownership is already cleaned up`);
      }
      if (dryRun) {
        return {
          config,
          accountIdsToAttach: [...config.accountIds],
          accountIdsToDetach: [],
          unmanagedAccountIds: [],
          status: 'pending-create' as const,
          message: `${message}; Organizations CDK is expected to create it before deployment reconciliation`,
          accountResults: [],
        };
      }
      return failedPlan(config, message, 'PolicyNotFound', undefined, [...config.accountIds], []);
    }

    targetReads.push({ planIndex, config, policyId });
    return {
      config,
      policyId,
      accountIdsToAttach: [],
      accountIdsToDetach: [],
      unmanagedAccountIds: [],
      status: 'ready' as const,
      accountResults: [],
    };
  });

  await processInBatches(
    targetReads,
    POLICY_TARGET_READ_BATCH_SIZE,
    async targetRead => {
      plans[targetRead.planIndex] = await buildPolicyAccountAttachmentPlan(
        client,
        policyReadRequestLimiter,
        targetRead,
        logPrefix,
      );
    },
    logger,
    logPrefix,
    POLICY_API_BATCH_DELAY_MS,
  );

  return plans;
}

/**
 * Build one policy plan from a discovered policy ID without modifying Organizations state.
 *
 * @param client Organizations client using management-account credentials
 * @param policyReadRequestLimiter Shared invocation-local policy read request limiter
 * @param targetRead Discovered policy and its configuration position
 * @param logPrefix Prefix used for module logs
 * @returns Preflight plan for the policy
 */
async function buildPolicyAccountAttachmentPlan(
  client: OrganizationsClient,
  policyReadRequestLimiter: IPolicyReadRequestLimiter,
  targetRead: IPolicyTargetRead,
  logPrefix: string,
): Promise<IPolicyAccountAttachmentPlan> {
  try {
    const accountTargets = await listDirectAccountTargets(client, policyReadRequestLimiter, targetRead.policyId);
    const desiredAccountIds = new Set(targetRead.config.accountIds);
    const currentAccountIds = new Set(accountTargets);
    const ownedAccountIds = new Set(targetRead.config.ownedAccountIds);
    const unmanagedAccountIds = [...currentAccountIds]
      .filter(accountId => !desiredAccountIds.has(accountId) && !ownedAccountIds.has(accountId))
      .sort();
    for (let index = 0; index < unmanagedAccountIds.length; index += UNMANAGED_ACCOUNT_LOG_BATCH_SIZE) {
      logger.warn(
        `Direct ACCOUNT attachments are not managed by LZA configuration and will be preserved; consider adding them to deploymentTargets.accounts to let LZA manage them: ${JSON.stringify(
          {
            policyName: targetRead.config.policyName,
            policyType: targetRead.config.policyType,
            policyId: targetRead.policyId,
            accountIds: unmanagedAccountIds.slice(index, index + UNMANAGED_ACCOUNT_LOG_BATCH_SIZE),
          },
        )}`,
        logPrefix,
      );
    }
    const missingAccountIds = [...desiredAccountIds].filter(accountId => !currentAccountIds.has(accountId));
    const staleAccountIds = [...ownedAccountIds].filter(
      accountId => !desiredAccountIds.has(accountId) && currentAccountIds.has(accountId),
    );

    if (missingAccountIds.length === 0 && staleAccountIds.length === 0) {
      return {
        config: targetRead.config,
        policyId: targetRead.policyId,
        accountIdsToAttach: [],
        accountIdsToDetach: [],
        unmanagedAccountIds,
        status: 'ready',
        accountResults: [],
      };
    }

    return {
      config: targetRead.config,
      policyId: targetRead.policyId,
      accountIdsToAttach: missingAccountIds,
      accountIdsToDetach: staleAccountIds,
      unmanagedAccountIds,
      status: 'ready',
      accountResults: [],
    };
  } catch (error: unknown) {
    const details = errorDetails(error);
    if (targetRead.config.cleanupOnly && details.name === 'PolicyNotFoundException') {
      return completedCleanupPlan(
        targetRead.config,
        `Policy "${targetRead.config.policyName}" no longer exists; previous attachment ownership is already cleaned up`,
      );
    }
    logger.error(`Policy ${targetRead.config.policyName} reconciliation failed: ${details.message}`, logPrefix);
    return failedPlan(targetRead.config, details.message, details.name, targetRead.policyId, [], []);
  }
}

/**
 * Discover exact policy names by type with bounded eventual-consistency retry.
 *
 * @param client Organizations client using management-account credentials
 * @param policyReadRequestLimiter Shared invocation-local policy read request limiter
 * @param configs Policy names and types to locate
 * @param retryMissing Whether an empty exact-name lookup should be retried
 * @param logPrefix Prefix used for module logs
 * @returns Discovered policy IDs and type-level errors
 */
async function discoverPolicyIds(
  client: OrganizationsClient,
  policyReadRequestLimiter: IPolicyReadRequestLimiter,
  configs: ReadonlyArray<ITagAndBackupPolicyAccountAttachmentConfig>,
  retryMissing: boolean,
  logPrefix: string,
): Promise<IPolicyDiscoveryResult> {
  const policyNamesByType = new Map<TagAndBackupPolicyType, Set<string>>();
  const policyIdsByType = new Map<TagAndBackupPolicyType, Map<string, string>>();
  const errorsByType = new Map<TagAndBackupPolicyType, { name: string; message: string }>();
  for (const config of configs) {
    const names = policyNamesByType.get(config.policyType) ?? new Set<string>();
    names.add(config.policyName);
    policyNamesByType.set(config.policyType, names);
    if (!policyIdsByType.has(config.policyType)) {
      policyIdsByType.set(config.policyType, new Map<string, string>());
    }
  }

  const maxAttempts = retryMissing ? POLICY_DISCOVERY_MAX_ATTEMPTS : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    for (const [policyType, configuredNames] of policyNamesByType) {
      const knownIds = policyIdsByType.get(policyType);
      if (!knownIds) {
        continue;
      }
      const hasMissingNames = [...configuredNames].some(policyName => !knownIds.has(policyName));
      if (!hasMissingNames || errorsByType.has(policyType)) {
        continue;
      }

      try {
        const discoveredIds = await listPolicyIdsByName(client, policyReadRequestLimiter, policyType);
        for (const policyName of configuredNames) {
          const policyId = discoveredIds.get(policyName);
          if (policyId) {
            knownIds.set(policyName, policyId);
          }
        }
      } catch (error: unknown) {
        errorsByType.set(policyType, errorDetails(error));
      }
    }

    const missingConfigs = configs.filter(
      config => !errorsByType.has(config.policyType) && !policyIdsByType.get(config.policyType)?.has(config.policyName),
    );
    if (missingConfigs.length === 0 || attempt === maxAttempts) {
      break;
    }
    for (const config of missingConfigs) {
      logger.info(
        `Policy "${config.policyName}" of type ${config.policyType} is not visible yet; retrying discovery (${attempt}/${maxAttempts})`,
        logPrefix,
      );
    }
    await sleep(POLICY_DISCOVERY_RETRY_DELAY_MS);
  }

  return { policyIdsByType, errorsByType };
}

/**
 * Scan every policy page for one type and build an exact-name lookup.
 *
 * @param client Organizations client using management-account credentials
 * @param policyReadRequestLimiter Shared invocation-local policy read request limiter
 * @param policyType Policy type to scan
 * @returns Exact policy name to ID map
 */
async function listPolicyIdsByName(
  client: OrganizationsClient,
  policyReadRequestLimiter: IPolicyReadRequestLimiter,
  policyType: TagAndBackupPolicyType,
): Promise<Map<string, string>> {
  const policyIdsByName = new Map<string, string>();
  let nextToken: string | undefined;
  do {
    const page = await executePolicyRead(policyReadRequestLimiter, () =>
      client.send(new ListPoliciesCommand({ Filter: policyType, NextToken: nextToken })),
    );
    for (const policy of page.Policies ?? []) {
      if (policy.Name && policy.Id && !policyIdsByName.has(policy.Name)) {
        policyIdsByName.set(policy.Name, policy.Id);
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return policyIdsByName;
}

/**
 * Create a request-start limiter scoped to one module invocation.
 *
 * Concurrent callers are serialized only until they receive a start slot.
 * Requests may remain in flight concurrently after their start time.
 *
 * @param minimumIntervalMs Minimum interval between request starts in milliseconds
 * @returns Invocation-local request-start limiter
 */
function createPolicyReadRequestLimiter(minimumIntervalMs: number): IPolicyReadRequestLimiter {
  let lastRequestStartTime: number | undefined;
  let requestStartQueue = Promise.resolve();

  return {
    waitForRequestStart(): Promise<void> {
      const requestStart = requestStartQueue.then(async () => {
        if (lastRequestStartTime !== undefined) {
          const remainingDelay = minimumIntervalMs - (Date.now() - lastRequestStartTime);
          if (remainingDelay > 0) {
            await sleep(remainingDelay);
          }
        }
        lastRequestStartTime = Date.now();
      });
      requestStartQueue = requestStart.catch(() => undefined);
      return requestStart;
    },
  };
}

/**
 * Execute one Organizations policy read after obtaining a shared request-start slot.
 *
 * The limiter is inside the backoff callback so each retry attempt obtains a
 * separate slot.
 *
 * @template T AWS SDK response type
 * @param policyReadRequestLimiter Shared invocation-local policy read request limiter
 * @param request AWS SDK policy read request
 * @returns AWS SDK policy read response
 */
async function executePolicyRead<T>(
  policyReadRequestLimiter: IPolicyReadRequestLimiter,
  request: () => Promise<T>,
): Promise<T> {
  return throttlingBackOff(async () => {
    await policyReadRequestLimiter.waitForRequestStart();
    return request();
  });
}

/**
 * Wait between policy discovery attempts.
 *
 * @param milliseconds Delay duration in milliseconds
 * @returns Promise resolved after the delay
 */
async function sleep(milliseconds: number): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

/**
 * List only direct account targets for a policy.
 *
 * @param client Organizations client using management-account credentials
 * @param policyReadRequestLimiter Shared invocation-local policy read request limiter
 * @param policyId Organizations policy ID
 * @returns Direct account IDs; OU and root targets are excluded
 */
async function listDirectAccountTargets(
  client: OrganizationsClient,
  policyReadRequestLimiter: IPolicyReadRequestLimiter,
  policyId: string,
): Promise<string[]> {
  const accountIds: string[] = [];
  let nextToken: string | undefined;
  do {
    const page = await executePolicyRead(policyReadRequestLimiter, () =>
      client.send(new ListTargetsForPolicyCommand({ PolicyId: policyId, NextToken: nextToken })),
    );
    for (const target of page.Targets ?? []) {
      if (target.Type === 'ACCOUNT' && target.TargetId) {
        accountIds.push(target.TargetId);
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return accountIds;
}

/**
 * Populate account-level results for a dry-run without issuing writes.
 *
 * @param plans Preflight plans for every configured policy
 */
function recordDryRunResults(plans: IPolicyAccountAttachmentPlan[]): void {
  const hasHardPreflightFailure = plans.some(plan => plan.status === 'failed');

  for (const plan of plans) {
    if (plan.status === 'pending-create') {
      for (const accountId of plan.accountIdsToAttach) {
        plan.accountResults.push({
          accountId,
          operation: 'attach',
          status: 'pending-create',
          message: `Attach account ${accountId} after Organizations CDK creates policy ${plan.config.policyName}`,
        });
      }
      continue;
    }

    if (plan.status === 'failed') {
      deferPlanOperations(plan, `Preflight failed for policy ${plan.config.policyName}; no writes would be attempted`);
      continue;
    }

    for (const accountId of plan.accountIdsToAttach) {
      plan.accountResults.push(dryRunResult(plan.policyId!, accountId, 'attach'));
    }
    for (const accountId of plan.accountIdsToDetach) {
      if (hasHardPreflightFailure) {
        appendDeferredResult(
          plan,
          accountId,
          'detach',
          'Detach would be deferred because at least one policy preflight failed',
        );
      } else {
        plan.accountResults.push(dryRunResult(plan.policyId!, accountId, 'detach'));
      }
    }
  }
}

/**
 * Collect all ready operations across policies in configuration order.
 *
 * @param plans Reconciliation plans
 * @param operation Attachment operation to collect
 * @returns Global operation queue
 */
function collectPolicyOperations(
  plans: ReadonlyArray<IPolicyAccountAttachmentPlan>,
  operation: 'attach' | 'detach',
): IPolicyAccountAttachmentOperation[] {
  const operations: IPolicyAccountAttachmentOperation[] = [];
  for (const plan of plans) {
    if (plan.status !== 'ready' || !plan.policyId) {
      continue;
    }
    const accountIds = operation === 'attach' ? plan.accountIdsToAttach : plan.accountIdsToDetach;
    for (const accountId of accountIds) {
      operations.push({ plan, policyId: plan.policyId, accountId, operation });
    }
  }
  return operations;
}

/**
 * Apply a global queue at the Organizations policy mutation baseline rate.
 *
 * @param client Organizations client using management-account credentials
 * @param operations Configuration-ordered account attachment operations
 * @param logPrefix Prefix used for module logs
 */
async function applyPolicyOperations(
  client: OrganizationsClient,
  operations: IPolicyAccountAttachmentOperation[],
  logPrefix: string,
): Promise<void> {
  await processInBatches(
    operations,
    POLICY_WRITE_BATCH_SIZE,
    async operation => {
      operation.result =
        operation.operation === 'attach'
          ? await attachPolicy(client, operation.policyId, operation.accountId, logPrefix)
          : await detachPolicy(
              client,
              operation.policyId,
              operation.accountId,
              operation.plan.config.cleanupOnly,
              logPrefix,
            );
    },
    logger,
    logPrefix,
    POLICY_API_BATCH_DELAY_MS,
  );

  for (const operation of operations) {
    if (operation.result) {
      operation.plan.accountResults.push(operation.result);
    }
  }
}

/**
 * Record every unexecuted operation in a plan as deferred.
 *
 * @param plan Policy plan whose writes are blocked
 * @param reason Safety reason for deferral
 */
function deferPlanOperations(plan: IPolicyAccountAttachmentPlan, reason: string): void {
  for (const accountId of plan.accountIdsToAttach) {
    appendDeferredResult(plan, accountId, 'attach', reason);
  }
  deferPolicyDetachments(plan, reason);
}

/**
 * Record all unexecuted detachments in a plan as deferred.
 *
 * @param plan Policy plan whose destructive writes are blocked
 * @param reason Safety reason for deferral
 */
function deferPolicyDetachments(plan: IPolicyAccountAttachmentPlan, reason: string): void {
  for (const accountId of plan.accountIdsToDetach) {
    appendDeferredResult(plan, accountId, 'detach', reason);
  }
}

/**
 * Append one deferred operation unless the operation already has a result.
 *
 * @param plan Policy plan receiving the result
 * @param accountId Target account ID
 * @param operation Planned attachment operation
 * @param reason Safety reason for deferral
 */
function appendDeferredResult(
  plan: IPolicyAccountAttachmentPlan,
  accountId: string,
  operation: 'attach' | 'detach',
  reason: string,
): void {
  if (plan.accountResults.some(result => result.accountId === accountId && result.operation === operation)) {
    return;
  }
  plan.accountResults.push({
    accountId,
    operation,
    status: 'deferred',
    message: `${operation} policy for account ${accountId} deferred: ${reason}`,
  });
}

/**
 * Build a dry-run result for one planned operation.
 *
 * @param policyId Organizations policy ID
 * @param accountId Target account ID
 * @param operation Planned attachment operation
 * @returns Dry-run account result
 */
function dryRunResult(
  policyId: string,
  accountId: string,
  operation: 'attach' | 'detach',
): ITagAndBackupPolicyAccountAttachmentResult {
  return {
    accountId,
    operation,
    status: 'dry-run',
    message: `${operation === 'attach' ? 'Attach' : 'Detach'} policy ${policyId} ${
      operation === 'attach' ? 'to' : 'from'
    } account ${accountId}`,
  };
}

/**
 * Attach one policy to one account.
 *
 * @param client Organizations client using management-account credentials
 * @param policyId Organizations policy ID
 * @param accountId Target account ID
 * @param logPrefix Prefix used for module logs
 * @returns Per-account attachment result
 */
async function attachPolicy(
  client: OrganizationsClient,
  policyId: string,
  accountId: string,
  logPrefix: string,
): Promise<ITagAndBackupPolicyAccountAttachmentResult> {
  const message = `Attach policy ${policyId} to account ${accountId}`;
  try {
    await throttlingBackOff(() => client.send(new AttachPolicyCommand({ PolicyId: policyId, TargetId: accountId })));
    logger.info(message, logPrefix);
    return { accountId, operation: 'attach', status: 'attached', message };
  } catch (error: unknown) {
    if (isRaceError(error, ['DuplicatePolicyAttachmentException'])) {
      return raceResult(accountId, 'attach', error);
    }
    if (isPolicyTypeAttachmentQuotaError(error)) {
      return policyTypeAttachmentQuotaFailure(accountId, error);
    }
    return accountFailure(accountId, 'attach', error);
  }
}

/**
 * Determine whether an attachment exceeded the per-target policy-type quota.
 *
 * @param error Caught AWS Organizations error
 * @returns True for the documented policy attachment quota reason
 */
function isPolicyTypeAttachmentQuotaError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === 'ConstraintViolationException' &&
    'Reason' in error &&
    error.Reason === MAX_POLICY_TYPE_ATTACHMENT_LIMIT_EXCEEDED
  );
}

/**
 * Build an actionable failure for an account already at its policy-type quota.
 *
 * @param accountId Target account ID
 * @param error AWS Organizations quota exception
 * @returns Failed attachment result directing the operator to use two deployments
 */
function policyTypeAttachmentQuotaFailure(
  accountId: string,
  error: unknown,
): ITagAndBackupPolicyAccountAttachmentResult {
  const details = errorDetails(error);
  const message = `Account ${accountId} is already at the Organizations policy attachment limit for this policy type. Remove an obsolete attachment in one deployment, then add the desired policy in a second deployment`;
  return {
    accountId,
    operation: 'attach',
    status: 'failed',
    message,
    error: { name: details.name, message },
  };
}

/**
 * Detach one policy from one direct account target.
 *
 * @param client Organizations client using management-account credentials
 * @param policyId Organizations policy ID
 * @param accountId Target account ID
 * @param cleanupOnly Whether a missing policy means cleanup is already complete
 * @param logPrefix Prefix used for module logs
 * @returns Per-account detachment result
 */
async function detachPolicy(
  client: OrganizationsClient,
  policyId: string,
  accountId: string,
  cleanupOnly: boolean,
  logPrefix: string,
): Promise<ITagAndBackupPolicyAccountAttachmentResult> {
  const message = `Detach policy ${policyId} from account ${accountId}`;
  try {
    await throttlingBackOff(() => client.send(new DetachPolicyCommand({ PolicyId: policyId, TargetId: accountId })));
    logger.info(message, logPrefix);
    return { accountId, operation: 'detach', status: 'detached', message };
  } catch (error: unknown) {
    if (
      isRaceError(error, [
        'PolicyNotAttachedException',
        'TargetNotFoundException',
        ...(cleanupOnly ? ['PolicyNotFoundException'] : []),
      ])
    ) {
      return raceResult(accountId, 'detach', error);
    }
    return accountFailure(accountId, 'detach', error);
  }
}

/**
 * Aggregate account-level outcomes into one policy result.
 *
 * @param plan Applied policy reconciliation plan
 * @returns Aggregated policy result
 */
function policyResult(plan: IPolicyAccountAttachmentPlan): ITagAndBackupPolicyAccountAttachmentPolicyResult {
  const failed = plan.accountResults.find(result => result.status === 'failed');
  const deferred = plan.accountResults.some(result => result.status === 'deferred');
  const dryRun = plan.accountResults.some(result => result.status === 'dry-run');
  const changed = plan.accountResults.some(result => result.status === 'attached' || result.status === 'detached');
  const status =
    plan.status === 'failed' || failed
      ? 'failed'
      : plan.status === 'pending-create'
        ? 'pending-create'
        : deferred
          ? 'deferred'
          : dryRun
            ? 'dry-run'
            : changed
              ? 'reconciled'
              : 'no-change';
  const policyLabel = plan.policyId ? `Policy ${plan.policyId}` : `Policy "${plan.config.policyName}"`;

  return {
    policyName: plan.config.policyName,
    policyType: plan.config.policyType,
    policyId: plan.policyId,
    status,
    accountResults: plan.accountResults,
    unmanagedAccountIds: plan.unmanagedAccountIds,
    message:
      plan.message ??
      (status === 'failed'
        ? `${policyLabel} reconciliation completed with account-level failures`
        : status === 'deferred'
          ? `${policyLabel} destructive changes were deferred by the global add-before-remove safety gate`
          : status === 'dry-run'
            ? `${policyLabel} direct-account attachment changes are planned`
            : plan.accountResults.length === 0
              ? `${policyLabel} direct-account attachments already match desired state`
              : `${policyLabel} direct-account attachments reconciled`),
    error: plan.error ?? failed?.error,
  };
}

/**
 * Build a failed policy preflight plan.
 *
 * @param config Desired policy attachment configuration
 * @param message Failure message
 * @param name Failure name
 * @param policyId Organizations policy ID when already discovered
 * @param accountIdsToAttach Planned account attachments known at failure time
 * @param accountIdsToDetach Planned account detachments known at failure time
 * @returns Failed policy plan
 */
function failedPlan(
  config: ITagAndBackupPolicyAccountAttachmentConfig,
  message: string,
  name: string,
  policyId?: string,
  accountIdsToAttach: ReadonlyArray<string> = [],
  accountIdsToDetach: ReadonlyArray<string> = [],
): IPolicyAccountAttachmentPlan {
  return {
    config,
    policyId,
    accountIdsToAttach,
    accountIdsToDetach,
    unmanagedAccountIds: [],
    status: 'failed',
    accountResults: [],
    message,
    error: { name, message },
  };
}

/**
 * Build a no-change plan when a previous-only policy has already been deleted.
 *
 * @param config Cleanup-only policy attachment configuration
 * @param message Cleanup completion detail
 * @returns Ready plan with no remaining attachment operations
 */
function completedCleanupPlan(
  config: ITagAndBackupPolicyAccountAttachmentConfig,
  message: string,
): IPolicyAccountAttachmentPlan {
  return {
    config,
    accountIdsToAttach: [],
    accountIdsToDetach: [],
    unmanagedAccountIds: [],
    status: 'ready',
    accountResults: [],
    message,
  };
}

/**
 * Build a failed account operation result.
 *
 * @param accountId Target account ID
 * @param operation Attachment operation
 * @param error Caught value
 * @returns Failed account result
 */
function accountFailure(
  accountId: string,
  operation: 'attach' | 'detach',
  error: unknown,
): ITagAndBackupPolicyAccountAttachmentResult {
  const details = errorDetails(error);
  return {
    accountId,
    operation,
    status: 'failed',
    message: `Failed to ${operation} policy for account ${accountId}: ${details.message}`,
    error: details,
  };
}

/**
 * Build a no-change result for an idempotent AWS race.
 *
 * @param accountId Target account ID
 * @param operation Attachment operation
 * @param error AWS exception indicating the desired state already exists
 * @returns No-change account result
 */
function raceResult(
  accountId: string,
  operation: 'attach' | 'detach',
  error: unknown,
): ITagAndBackupPolicyAccountAttachmentResult {
  const details = errorDetails(error);
  return {
    accountId,
    operation,
    status: 'no-change',
    message: `${operation} for account ${accountId} was already satisfied during reconciliation (${details.name})`,
  };
}

/**
 * Determine whether an exception is an accepted idempotent race.
 *
 * @param error Caught value
 * @param names Accepted AWS exception names
 * @returns True when the exception is accepted
 */
function isRaceError(error: unknown, names: string[]): boolean {
  return names.includes(errorDetails(error).name);
}

/**
 * Normalize an unknown exception for module responses.
 *
 * @param error Caught value
 * @returns Error name and message
 */
function errorDetails(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: 'UnknownError', message: String(error) };
}

/**
 * Build a successful module response.
 *
 * @param moduleName Module Runner module name
 * @param dryRun Whether the module ran without writes
 * @param summary Human-readable execution summary
 * @param perPolicyResults Policy-level outcomes
 * @returns Successful structured module response
 */
function successResponse(
  moduleName: string,
  dryRun: boolean,
  summary: string,
  perPolicyResults: ITagAndBackupPolicyAccountAttachmentPolicyResult[],
): IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse> {
  return {
    status: MODULE_STATE_CODE.SUCCESS,
    summary,
    timestamp: new Date().toISOString(),
    moduleName,
    dryRun,
    response: { perPolicyResults },
  };
}

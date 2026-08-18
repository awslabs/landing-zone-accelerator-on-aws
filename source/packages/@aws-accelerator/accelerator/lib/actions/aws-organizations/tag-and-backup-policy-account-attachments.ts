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
  createLogger,
  createStatusLogger,
  IModuleResponse,
  ITagAndBackupPolicyAccountAttachmentConfig,
  ITagAndBackupPolicyAccountAttachmentPolicyResult,
  ITagAndBackupPolicyAccountAttachmentsModuleRequest,
  ITagAndBackupPolicyAccountAttachmentsModuleResponse,
  type TagAndBackupPolicyType,
  manageTagAndBackupPolicyAccountAttachments,
  MODULE_STATE_CODE,
} from 'aws-lza';
import path from 'node:path';

import { AcceleratorModules, ModuleParams } from '../../types';
import { registerDiffFormatter } from '../utils/module-diff-formatter';
import { logModuleExecutionResult } from '../utils/module-logging';
import { saveModuleExecutionState } from '../utils/module-state';
import { compressOwnedResources, loadOwnedResources } from '../utils/resource-ownership-state';

const DIFF_SEPARATOR = '='.repeat(70);
const ACCOUNT_ID_PATTERN = /^\d{12}$/;
const OWNED_RESOURCE_PREFIX = 'policy-account-attachment';

/**
 * Persisted ownership for one Organizations policy.
 */
interface IPolicyAttachmentOwnership {
  /** Organizations policy type */
  readonly policyType: TagAndBackupPolicyType;
  /** Exact Organizations policy name */
  readonly policyName: string;
  /** Direct account attachment IDs owned by this module */
  readonly accountIds: ReadonlyArray<string>;
}

/**
 * Module Runner action for direct-account tag and backup policy attachments.
 */
export abstract class TagAndBackupPolicyAccountAttachments {
  private static readonly logger = createLogger([path.parse(path.basename(__filename)).name]);
  private static readonly statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Translate organization configuration and invoke account attachment reconciliation.
   *
   * @param params Module Runner parameters
   * @returns Structured module response
   */
  public static async configure(
    params: ModuleParams,
  ): Promise<IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse>> {
    const moduleName = params.moduleItem.name;
    const dryRun = params.runnerParameters.dryRun;
    const { sessionContext } = params.runnerParameters;
    const { globalConfig, organizationConfig } = params.moduleRunnerParameters.configs;
    const logPrefix = `${sessionContext.invokingAccountId}:${sessionContext.region}`;

    this.statusLogger.processStart(`Starting ${moduleName} module`, logPrefix);

    if (!organizationConfig.enable) {
      const summary = `Skipping module ${moduleName} because AWS Organizations is disabled.`;
      this.statusLogger.info(summary, logPrefix);
      const response: IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse> = {
        status: MODULE_STATE_CODE.SKIPPED,
        summary,
        timestamp: new Date().toISOString(),
        moduleName,
        dryRun,
        response: { perPolicyResults: [] },
      };
      logModuleExecutionResult(response, moduleName, logPrefix, this.logger, this.statusLogger);
      return response;
    }

    const currentPolicies = this.getPolicies(params);
    const currentConfig = {
      policies: currentPolicies.map(({ policyName, policyType, accountIds }) => ({
        policyName,
        policyType,
        accountIds,
      })),
    };
    const currentOwnedResources = this.buildOwnedResourceIds(currentPolicies);

    let previousOwnedResources: string[];
    let previousOwnership: IPolicyAttachmentOwnership[];
    try {
      previousOwnedResources = await loadOwnedResources(
        params,
        AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
        logPrefix,
      );
      previousOwnership = this.parseOwnedResourceIds(previousOwnedResources);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failed = this.failureResponse(
        moduleName,
        dryRun,
        `State management failure: ${errorMessage}`,
        'StateManagementError',
        errorMessage,
      );
      this.statusLogger.error(failed.summary, logPrefix);
      logModuleExecutionResult(failed, moduleName, logPrefix, this.logger, this.statusLogger);
      return failed;
    }

    const request: ITagAndBackupPolicyAccountAttachmentsModuleRequest = {
      operation: 'tag-and-backup-policy-account-attachments',
      moduleName,
      partition: sessionContext.partition,
      region: globalConfig.homeRegion,
      globalRegion: sessionContext.globalRegion,
      invokingAccountId: sessionContext.invokingAccountId,
      solutionId: params.runnerParameters.solutionId,
      credentials: params.moduleRunnerParameters.managementAccountCredentials,
      dryRun,
      configuration: {
        policies: this.buildReconciliationPolicies(currentPolicies, previousOwnership),
      },
    };

    const response = await manageTagAndBackupPolicyAccountAttachments(request);
    const executionSucceeded =
      response.status === MODULE_STATE_CODE.SUCCESS || response.status === MODULE_STATE_CODE.COMPLETED;
    const moduleResponse: IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse> = executionSucceeded
      ? {
          ...response,
          response: {
            perPolicyResults: response.response?.perPolicyResults ?? [],
            ownedResources: currentOwnedResources,
          },
        }
      : response;

    if (!dryRun) {
      const persistedResponse = executionSucceeded
        ? {
            ...moduleResponse,
            response: {
              perPolicyResults: moduleResponse.response?.perPolicyResults ?? [],
              ownedResources: compressOwnedResources(currentOwnedResources),
            },
          }
        : moduleResponse;

      await saveModuleExecutionState(
        {
          serviceName: AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS,
          config: currentConfig,
          status: moduleResponse.status,
          response: persistedResponse,
          dryRun: false,
        },
        params,
        logPrefix,
      );
    }

    logModuleExecutionResult(moduleResponse, moduleName, logPrefix, this.logger, this.statusLogger);
    return moduleResponse;
  }

  /**
   * Build normalized Tag Policy and Backup Policy attachment configurations.
   *
   * @param params Module Runner parameters
   * @returns Configured policies with direct account names resolved to IDs
   */
  private static getPolicies(params: ModuleParams): ITagAndBackupPolicyAccountAttachmentConfig[] {
    const { accountsConfig, organizationConfig } = params.moduleRunnerParameters.configs;

    const taggingPolicies = organizationConfig.taggingPolicies.map(policy => ({
      policyName: policy.name,
      policyType: 'TAG_POLICY' as const,
      accountIds: this.getDirectAccountIds(
        policy.deploymentTargets.accounts,
        policy.deploymentTargets.excludedAccounts,
        accountName => accountsConfig.getAccountId(accountName),
      ),
      ownedAccountIds: [],
      cleanupOnly: false,
    }));
    const backupPolicies = organizationConfig.backupPolicies.map(policy => ({
      policyName: policy.name,
      policyType: 'BACKUP_POLICY' as const,
      accountIds: this.getDirectAccountIds(
        policy.deploymentTargets.accounts,
        policy.deploymentTargets.excludedAccounts,
        accountName => accountsConfig.getAccountId(accountName),
      ),
      ownedAccountIds: [],
      cleanupOnly: false,
    }));

    return [...taggingPolicies, ...backupPolicies];
  }

  /**
   * Resolve explicit account targets while honoring excluded accounts.
   *
   * @param accountNames Explicit deployment target account names
   * @param excludedAccountNames Account names excluded from the deployment target
   * @param getAccountId Resolver from account name to account ID
   * @returns Unique direct account IDs
   */
  private static getDirectAccountIds(
    accountNames: ReadonlyArray<string> | undefined,
    excludedAccountNames: ReadonlyArray<string> | undefined,
    getAccountId: (accountName: string) => string,
  ): string[] {
    const excludedAccounts = new Set(excludedAccountNames ?? []);
    return [
      ...new Set((accountNames ?? []).filter(accountName => !excludedAccounts.has(accountName)).map(getAccountId)),
    ];
  }

  /**
   * Build the current and previous policy union for live reconciliation.
   *
   * Current policies retain configuration order. Previous-only policies are
   * appended in their stable ledger order.
   *
   * @param currentPolicies Current desired policy attachments
   * @param previous Previous persisted ownership
   * @returns Policies carrying both desired and previously owned account IDs
   */
  private static buildReconciliationPolicies(
    currentPolicies: ReadonlyArray<ITagAndBackupPolicyAccountAttachmentConfig>,
    previous: ReadonlyArray<IPolicyAttachmentOwnership>,
  ): ITagAndBackupPolicyAccountAttachmentConfig[] {
    const previousByPolicy = new Map(previous.map(policy => [this.policyKey(policy), policy]));
    const currentPolicyKeys = new Set(currentPolicies.map(policy => this.policyKey(policy)));
    const currentRequests = currentPolicies.map(policy => ({
      policyName: policy.policyName,
      policyType: policy.policyType,
      accountIds: policy.accountIds,
      ownedAccountIds: previousByPolicy.get(this.policyKey(policy))?.accountIds ?? [],
      cleanupOnly: false,
    }));
    const cleanupRequests = previous
      .filter(policy => !currentPolicyKeys.has(this.policyKey(policy)))
      .map(policy => ({
        policyName: policy.policyName,
        policyType: policy.policyType,
        accountIds: [],
        ownedAccountIds: policy.accountIds,
        cleanupOnly: true,
      }));

    return [...currentRequests, ...cleanupRequests];
  }

  /**
   * Build deterministic ownership resource IDs for the current desired attachments.
   *
   * @param policies Current policy attachment configurations
   * @returns Deduplicated and stably sorted ownership resource IDs
   */
  private static buildOwnedResourceIds(
    policies: ReadonlyArray<
      Pick<ITagAndBackupPolicyAccountAttachmentConfig, 'policyName' | 'policyType' | 'accountIds'>
    >,
  ): string[] {
    return [
      ...new Set(
        policies.flatMap(policy =>
          policy.accountIds.map(accountId =>
            this.buildOwnedResourceId(policy.policyType, policy.policyName, accountId),
          ),
        ),
      ),
    ].sort();
  }

  /**
   * Parse persisted resource IDs into normalized policy ownership.
   *
   * @param resourceIds Persisted ownership resource IDs
   * @returns Deduplicated and stably sorted ownership by policy
   */
  private static parseOwnedResourceIds(resourceIds: ReadonlyArray<string>): IPolicyAttachmentOwnership[] {
    const policiesByKey = new Map<string, { policy: IPolicyAttachmentOwnership; accountIds: Set<string> }>();

    for (const resourceId of resourceIds) {
      const policy = this.parseOwnedResourceId(resourceId);
      const policyKey = this.policyKey(policy);
      const existing = policiesByKey.get(policyKey);
      if (existing) {
        for (const accountId of policy.accountIds) {
          existing.accountIds.add(accountId);
        }
        continue;
      }
      policiesByKey.set(policyKey, {
        policy,
        accountIds: new Set(policy.accountIds),
      });
    }

    return [...policiesByKey.values()]
      .map(({ policy, accountIds }) => ({
        policyName: policy.policyName,
        policyType: policy.policyType,
        accountIds: [...accountIds].sort(),
      }))
      .sort(this.comparePolicies);
  }

  /**
   * Build a reversible policy/account ownership resource ID.
   *
   * @param policyType Organizations policy type
   * @param policyName Exact Organizations policy name
   * @param accountId Direct account attachment ID
   * @returns Encoded ownership resource ID
   */
  private static buildOwnedResourceId(
    policyType: TagAndBackupPolicyType,
    policyName: string,
    accountId: string,
  ): string {
    if (!ACCOUNT_ID_PATTERN.test(accountId)) {
      throw new TypeError(`Invalid policy attachment ownership account ID: ${accountId}`);
    }
    return `${OWNED_RESOURCE_PREFIX}:${policyType}:${encodeURIComponent(policyName)}:${accountId}`;
  }

  /**
   * Parse and validate one policy/account ownership resource ID.
   *
   * @param resourceId Encoded ownership resource ID
   * @returns Parsed policy ownership with one account ID
   */
  private static parseOwnedResourceId(resourceId: string): IPolicyAttachmentOwnership {
    const parts = resourceId.split(':');
    if (parts.length !== 4 || parts[0] !== OWNED_RESOURCE_PREFIX) {
      throw new TypeError(`Invalid policy attachment ownership resource ID: ${resourceId}`);
    }

    const policyType = parts[1];
    if (policyType !== 'TAG_POLICY' && policyType !== 'BACKUP_POLICY') {
      throw new TypeError(`Invalid policy attachment ownership policy type: ${policyType}`);
    }

    const accountId = parts[3];
    if (!ACCOUNT_ID_PATTERN.test(accountId)) {
      throw new TypeError(`Invalid policy attachment ownership account ID: ${accountId}`);
    }

    let policyName: string;
    try {
      policyName = decodeURIComponent(parts[2]);
    } catch (error: unknown) {
      throw new TypeError(`Invalid encoded policy name in ownership resource ID ${resourceId}: ${String(error)}`);
    }
    if (policyName.length === 0) {
      throw new TypeError(`Invalid empty policy name in ownership resource ID: ${resourceId}`);
    }

    return {
      policyName,
      policyType,
      accountIds: [accountId],
    };
  }

  /**
   * Build a stable identity for one policy.
   *
   * @param policy Policy name and type
   * @returns Stable policy ownership key
   */
  private static policyKey(policy: Pick<IPolicyAttachmentOwnership, 'policyName' | 'policyType'>): string {
    return `${policy.policyType}\u0000${policy.policyName}`;
  }

  /**
   * Sort Tag Policies before Backup Policies, then by exact policy name.
   *
   * @param left Left policy
   * @param right Right policy
   * @returns Array sort comparison
   */
  private static comparePolicies(
    left: Pick<IPolicyAttachmentOwnership, 'policyName' | 'policyType'>,
    right: Pick<IPolicyAttachmentOwnership, 'policyName' | 'policyType'>,
  ): number {
    const typeOrder: Record<TagAndBackupPolicyType, number> = { TAG_POLICY: 0, BACKUP_POLICY: 1 };
    return typeOrder[left.policyType] - typeOrder[right.policyType] || left.policyName.localeCompare(right.policyName);
  }

  /**
   * Build a module failure response before Organizations reconciliation.
   *
   * @param moduleName Module Runner module name
   * @param dryRun Whether this execution is a dry run
   * @param summary Human-readable failure summary
   * @param errorName Stable failure name
   * @param errorMessage Failure detail
   * @returns Failed module response with no policy results
   */
  private static failureResponse(
    moduleName: string,
    dryRun: boolean,
    summary: string,
    errorName: string,
    errorMessage: string,
  ): IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse> {
    return {
      status: MODULE_STATE_CODE.FAILED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      error: { name: errorName, message: errorMessage },
      response: { perPolicyResults: [] },
    };
  }
}

/**
 * Format Tag Policy and Backup Policy account attachment dry-run results.
 *
 * @param response Policy account attachment module response
 * @returns Human-readable module diff
 */
function formatTagAndBackupPolicyAccountAttachmentsDiff(
  response: IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse>,
): string {
  const lines = [DIFF_SEPARATOR, `Module: ${response.moduleName}`, `Mode: ${formatDiffMode(response.status)}`, ''];

  if (response.status === MODULE_STATE_CODE.SKIPPED) {
    lines.push(`Reason: ${response.summary}`, '', 'No changes', DIFF_SEPARATOR);
    return lines.join('\n');
  }

  let changeCount = 0;
  let deferredCount = 0;
  let pendingCount = 0;
  let unchangedCount = 0;
  const policies = response.response?.perPolicyResults ?? [];

  for (const policy of policies) {
    const unmanagedAccountIds = policy.unmanagedAccountIds ?? [];
    if (policy.accountResults.length === 0 && policy.status === 'no-change' && unmanagedAccountIds.length === 0) {
      unchangedCount++;
      continue;
    }

    lines.push(`  ${policy.policyName} (${policy.policyType}):`);
    if (policy.status === 'failed' || policy.status === 'pending-create' || policy.status === 'deferred') {
      lines.push(`    ${formatPolicyResult(policy)}`);
      if (policy.status === 'pending-create') {
        pendingCount++;
      }
    }
    if (policy.accountResults.length === 0) {
      if (policy.status !== 'failed' && policy.status !== 'pending-create' && policy.status !== 'deferred') {
        lines.push(`    ${formatPolicyResult(policy)}`);
      }
    }
    for (const accountId of unmanagedAccountIds) {
      lines.push(
        `    [!] account ${accountId}: not managed by LZA configuration, will be preserved; consider adding it to deploymentTargets.accounts to let LZA manage it`,
      );
    }
    if (policy.accountResults.length === 0) {
      continue;
    }

    for (const accountResult of policy.accountResults) {
      if (accountResult.status === 'dry-run') {
        const marker = accountResult.operation === 'attach' ? '[+]' : '[-]';
        lines.push(`    ${marker} ${accountResult.operation} account ${accountResult.accountId}`);
        changeCount++;
      } else if (accountResult.status === 'pending-create') {
        lines.push(`    [+] attach account ${accountResult.accountId} (pending policy creation)`);
        changeCount++;
      } else if (accountResult.status === 'deferred') {
        lines.push(`    [~] ${accountResult.message}`);
        deferredCount++;
      } else if (accountResult.status === 'no-change') {
        lines.push(`    [=] account ${accountResult.accountId}: ${accountResult.message}`);
        unchangedCount++;
      } else if (accountResult.status === 'failed') {
        lines.push(`    [!] account ${accountResult.accountId}: ${accountResult.message}`);
      }
    }
  }

  if (changeCount === 0 && deferredCount === 0 && pendingCount === 0 && !hasDiffFailure(response)) {
    lines.push('No changes');
  }
  if (deferredCount > 0) {
    lines.push(`  [~] ${deferredCount} operation(s) deferred by a safety gate`);
  }
  if (unchangedCount > 0) {
    lines.push(`  [=] ${unchangedCount} policy/account result(s) unchanged`);
  }

  if (response.error) {
    lines.push('', `Error: ${response.error.name}`, `Message: ${response.error.message}`);
  }
  lines.push('', response.summary, DIFF_SEPARATOR);
  return lines.join('\n');
}

/**
 * Format the dry-run mode label for a module response.
 *
 * @param status Module response status
 * @returns Diff viewer mode label
 */
function formatDiffMode(status: string): string {
  return status === MODULE_STATE_CODE.FAILED ? 'Dry Run - FAILED' : 'Dry Run';
}

/**
 * Format a policy result that has no account-level records.
 *
 * @param policy Policy reconciliation result
 * @returns One diff line
 */
function formatPolicyResult(policy: ITagAndBackupPolicyAccountAttachmentPolicyResult): string {
  if (policy.status === 'failed') {
    return `[!] ${policy.message}`;
  }
  if (policy.status === 'pending-create' || policy.status === 'deferred') {
    return `[~] ${policy.message}`;
  }
  return `[=] ${policy.message}`;
}

/**
 * Determine whether a response contains a module-level or policy-level failure.
 *
 * @param response Policy account attachment module response
 * @returns True when any failure is present
 */
function hasDiffFailure(response: IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse>): boolean {
  if (response.status === MODULE_STATE_CODE.FAILED) {
    return true;
  }
  return (response.response?.perPolicyResults ?? []).some(
    policy => policy.status === 'failed' || policy.accountResults.some(result => result.status === 'failed'),
  );
}

registerDiffFormatter(AcceleratorModules.TAG_AND_BACKUP_POLICY_ACCOUNT_ATTACHMENTS, response =>
  formatTagAndBackupPolicyAccountAttachmentsDiff(
    response as IModuleResponse<ITagAndBackupPolicyAccountAttachmentsModuleResponse>,
  ),
);

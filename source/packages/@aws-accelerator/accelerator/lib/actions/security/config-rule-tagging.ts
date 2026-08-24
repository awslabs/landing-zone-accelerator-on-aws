/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import {
  analyzeConfigRuleGlobalTags,
  DeploymentTargets,
  getConfigRuleTagDiagnosticKey,
  IConfigRuleSkippedGlobalTag,
  IConfigRuleTagInput,
  ResourcePolicyEnforcementConfig,
} from '@aws-accelerator/config';
import {
  createLogger,
  createStatusLogger,
  IConfigRuleTag,
  IConfigRuleTaggingModuleResponse,
  IConfigRuleTaggingModuleRequest,
  IConfigRuleTaggingRuleResult,
  IConfigRuleTaggingTargetResult,
  IModuleResponse,
  MODULE_STATE_CODE,
  tagConfigRules,
} from 'aws-lza';
import path from 'node:path';
import { AcceleratorModules, ModuleParams } from '../../types';
import { registerDiffFormatter, SEPARATOR } from '../utils/module-diff-formatter';
import { logModuleExecutionResult } from '../utils/module-logging';
import { saveModuleExecutionState } from '../utils/module-state';
import { compressOwnedResources, loadOwnedResources } from '../utils/resource-ownership-state';

const ACCOUNT_ID_PATTERN = /^\d{12}$/;
const OWNED_RESOURCE_PREFIX = 'tag';
const OWNED_RESOURCE_KEY_SEPARATOR = ',';

interface IRuleDefinition {
  readonly ruleName: string;
  readonly tags: IConfigRuleTag[];
  readonly externallyManagedTagKeys: string[];
}

interface IPlanRuleDefinition extends IRuleDefinition {
  readonly skippedGlobalTags: readonly IConfigRuleSkippedGlobalTag[];
}

interface IReconciliationRuleDefinition extends IRuleDefinition {
  readonly ownedTagKeys: Set<string>;
  readonly cleanupOnly?: boolean;
}

interface ITargetAccumulator<T> {
  readonly accountId: string;
  readonly region: string;
  readonly rules: Map<string, T>;
}

interface IOwnedTagKey {
  readonly accountId: string;
  readonly region: string;
  readonly ruleName: string;
  readonly tagKey: string;
}

interface IConfigRuleTaggingWarning {
  readonly code: 'skipped-global-tag';
  readonly ruleName: string;
  readonly tagKey: string;
  readonly reason: string;
  readonly message: string;
}

interface IConfigRuleTaggingActionResponse extends IConfigRuleTaggingModuleResponse {
  readonly warnings: IConfigRuleTaggingWarning[];
}

interface IConfigRuleTaggingPlan {
  readonly targets: Map<string, ITargetAccumulator<IReconciliationRuleDefinition>>;
  readonly suppressedOwnershipKeysByRule: Map<string, Set<string>>;
  readonly suppressedOwnershipRules: Set<string>;
  readonly warnings: IConfigRuleTaggingWarning[];
  readonly activeAccountIds: Set<string>;
  readonly enabledRegions: Set<string>;
}

/** State-safe tag metadata persisted without configured values. */
interface IConfigRuleTaggingStateTag {
  readonly key: string;
  readonly valueType: 'static' | 'dynamic';
}

/** State-safe rule metadata persisted for change tracking. */
interface IConfigRuleTaggingStateRule {
  readonly ruleName: string;
  readonly tags: IConfigRuleTaggingStateTag[];
  readonly externallyManagedTagKeys: string[];
}

/** State-safe account and Region scope persisted for change tracking. */
interface IConfigRuleTaggingStateScope {
  readonly accountIds: string[];
  readonly regions: string[];
  readonly rules: IConfigRuleTaggingStateRule[];
}

/**
 * Translates LZA configuration into normalized AWS Config rule tagging targets.
 */
export abstract class ConfigRuleTagging {
  private static readonly logger = createLogger([path.parse(path.basename(__filename)).name]);
  private static readonly statusLogger = createStatusLogger([path.parse(path.basename(__filename)).name]);

  /**
   * Translate accelerator configuration and invoke Config rule tag reconciliation.
   *
   * @param params Module Runner parameters
   * @returns Structured module response
   */
  public static async configure(params: ModuleParams): Promise<IModuleResponse<IConfigRuleTaggingActionResponse>> {
    const logPrefix = `${params.runnerParameters.sessionContext.invokingAccountId}:${params.runnerParameters.sessionContext.region}`;
    this.statusLogger.processStart(`Starting ${params.moduleItem.name} module`, logPrefix);

    const plan = buildPlan(params);
    // Captured before previous ownership adds cleanup-only rules to the plan targets.
    const stateConfig = createStateConfig(plan.targets);

    let previousOwnership: IOwnedTagKey[];
    try {
      previousOwnership = filterPreviousOwnership(
        await loadOwnedResources(params, AcceleratorModules.CONFIG_RULE_TAGGING, logPrefix),
        plan,
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const failed = createFailureResponse(
        params,
        'StateManagementError',
        `State management failure: ${errorMessage}`,
        errorMessage,
      );
      logModuleExecutionResult(failed, params.moduleItem.name, logPrefix, this.logger, this.statusLogger);
      return failed;
    }

    addPreviousOwnership(plan.targets, previousOwnership);
    removeUnreconcilableTargets(plan.targets);

    const response = await this.reconcile(params, plan, previousOwnership);
    (response.response?.warnings ?? []).forEach(warning => this.logger.warn(warning.message, logPrefix));

    if (!params.runnerParameters.dryRun) {
      await saveModuleExecutionState(
        {
          serviceName: AcceleratorModules.CONFIG_RULE_TAGGING,
          config: stateConfig,
          status: response.status,
          response: buildStateResponse(response),
          dryRun: false,
        },
        params,
        logPrefix,
      );
    }

    logModuleExecutionResult(response, params.moduleItem.name, logPrefix, this.logger, this.statusLogger);
    return response;
  }

  /**
   * Reconcile the planned targets, or skip when no target requires reconciliation.
   *
   * @param params Module Runner parameters
   * @param plan Current reconciliation plan
   * @param previousOwnership Tag-key ownership from the previous successful run
   * @returns Structured module response including the refreshed ownership ledger
   */
  private static async reconcile(
    params: ModuleParams,
    plan: IConfigRuleTaggingPlan,
    previousOwnership: readonly IOwnedTagKey[],
  ): Promise<IModuleResponse<IConfigRuleTaggingActionResponse>> {
    if (plan.targets.size === 0) {
      return {
        status: MODULE_STATE_CODE.SKIPPED,
        summary: `Skipping module ${params.moduleItem.name} as no Config rules require global tag reconciliation.`,
        timestamp: new Date().toISOString(),
        moduleName: params.moduleItem.name,
        dryRun: params.runnerParameters.dryRun,
        response: { targets: [], ownedResources: [], warnings: plan.warnings },
      };
    }

    const moduleResponse = await tagConfigRules(createModuleRequest(params, plan.targets));
    const targets = moduleResponse.response?.targets ?? [];
    const successful =
      moduleResponse.status === MODULE_STATE_CODE.SUCCESS || moduleResponse.status === MODULE_STATE_CODE.COMPLETED;

    return {
      ...moduleResponse,
      response: {
        targets,
        warnings: mergeWarnings(plan.warnings, createRuntimeSkippedWarnings(targets)),
        ...(successful ? { ownedResources: createOwnedResourceIds(targets, previousOwnership) } : {}),
      },
    };
  }
}

/**
 * Build reconciliation targets, protected ownership keys, and compatibility warnings.
 *
 * @param params Module Runner parameters
 * @returns Complete reconciliation plan for the current configuration
 */
function buildPlan(params: ModuleParams): IConfigRuleTaggingPlan {
  const { accountsConfig, globalConfig, organizationConfig, securityConfig } = params.moduleRunnerParameters.configs;
  // Single account mode deploys every rule to the management account only, matching stack synthesis.
  const activeAccountIds = new Set(
    process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
      ? [accountsConfig.getManagementAccountId()]
      : accountsConfig.getActiveAccountIds(organizationConfig.getIgnoredOus()),
  );
  const planTargets = new Map<string, ITargetAccumulator<IPlanRuleDefinition>>();
  const tagContext = {
    globalTags: globalConfig.tags,
    partition: params.runnerParameters.sessionContext.partition,
    acceleratorPrefix: params.moduleRunnerParameters.resourcePrefixes.accelerator,
  };

  for (const ruleSet of securityConfig.awsConfig.ruleSets) {
    const rules = ruleSet.rules.map(rule => createRulePlan(rule.name, rule.tags, tagContext));
    addPlanTargets(planTargets, ruleSet.deploymentTargets, rules, params, activeAccountIds);
  }

  const resourcePolicyEnforcement = securityConfig.resourcePolicyEnforcement;
  if (resourcePolicyEnforcement?.enable) {
    const generatedRule = createRulePlan(
      `${params.moduleRunnerParameters.resourcePrefixes.accelerator}-${ResourcePolicyEnforcementConfig.DEFAULT_RULE_NAME}`,
      [],
      tagContext,
    );
    for (const policySet of resourcePolicyEnforcement.policySets) {
      addPlanTargets(planTargets, policySet.deploymentTargets, [generatedRule], params, activeAccountIds);
    }
  }

  return createConfigRuleTaggingPlan(planTargets, activeAccountIds, new Set(globalConfig.enabledRegions));
}

/**
 * Add account and Region targets selected by one deployment scope.
 *
 * @param targets Mutable plan target accumulator
 * @param deploymentTargets Configured account, OU, and Region selection
 * @param rules Rule plans declared by the scope
 * @param params Module Runner parameters
 * @param activeAccountIds Active accounts eligible for reconciliation
 */
function addPlanTargets(
  targets: Map<string, ITargetAccumulator<IPlanRuleDefinition>>,
  deploymentTargets: DeploymentTargets,
  rules: IPlanRuleDefinition[],
  params: ModuleParams,
  activeAccountIds: Set<string>,
): void {
  const { accountsConfig, globalConfig } = params.moduleRunnerParameters.configs;
  const accountIds = accountsConfig
    .getAccountIdsFromDeploymentTarget(deploymentTargets)
    .filter(accountId => activeAccountIds.has(accountId));
  const regions = globalConfig.enabledRegions.filter(region => !deploymentTargets.excludedRegions?.includes(region));

  for (const accountId of new Set(accountIds)) {
    for (const region of new Set(regions)) {
      const key = getTargetKey(accountId, region);
      const target = targets.get(key) ?? { accountId, region, rules: new Map<string, IPlanRuleDefinition>() };
      rules.forEach(rule => target.rules.set(rule.ruleName, rule));
      targets.set(key, target);
    }
  }
}

/**
 * Analyze one rule and translate its global tags into module-managed inputs.
 *
 * @param ruleName Config rule name
 * @param ruleTags Rule-specific tags retained by the custom resource
 * @param tagContext Global tags, partition, and Accelerator prefix
 * @returns Rule plan with module tags, protected keys, and skipped globals
 */
function createRulePlan(
  ruleName: string,
  ruleTags: readonly IConfigRuleTagInput[],
  tagContext: {
    readonly globalTags: readonly IConfigRuleTagInput[];
    readonly partition: string;
    readonly acceleratorPrefix: string;
  },
): IPlanRuleDefinition {
  const analysis = analyzeConfigRuleGlobalTags({ ruleName, ruleTags, ...tagContext });
  return {
    ruleName,
    tags: analysis.moduleTags.map(tag =>
      tag.dynamicValue !== undefined
        ? { key: tag.key, dynamicValue: tag.dynamicValue }
        : { key: tag.key, value: tag.value },
    ),
    externallyManagedTagKeys: [...analysis.externallyManagedTagKeys],
    skippedGlobalTags: analysis.skippedGlobalTags,
  };
}

/**
 * Convert plan targets into reconciliation targets, protected ownership keys, and warnings.
 *
 * @param planTargets Account and Region targets containing analyzed rule plans
 * @param activeAccountIds Active accounts eligible for reconciliation
 * @param enabledRegions Regions enabled for the accelerator
 * @returns Complete reconciliation plan
 */
function createConfigRuleTaggingPlan(
  planTargets: Map<string, ITargetAccumulator<IPlanRuleDefinition>>,
  activeAccountIds: Set<string>,
  enabledRegions: Set<string>,
): IConfigRuleTaggingPlan {
  const targets = new Map<string, ITargetAccumulator<IReconciliationRuleDefinition>>();
  const suppressedOwnershipKeysByRule = new Map<string, Set<string>>();
  const suppressedOwnershipRules = new Set<string>();
  const warnings: IConfigRuleTaggingWarning[] = [];

  for (const [targetKey, planTarget] of planTargets) {
    const rules = new Map<string, IReconciliationRuleDefinition>();
    for (const rule of planTarget.rules.values()) {
      const ruleKey = getRuleKey(planTarget.accountId, planTarget.region, rule.ruleName);
      rules.set(rule.ruleName, {
        ruleName: rule.ruleName,
        tags: rule.tags,
        externallyManagedTagKeys: rule.externallyManagedTagKeys,
        ownedTagKeys: new Set<string>(),
      });
      if (rule.skippedGlobalTags.some(tag => tag.reason === 'dynamic-rule-key')) {
        suppressedOwnershipRules.add(ruleKey);
      }
      const suppressedKeys = new Set([...rule.externallyManagedTagKeys, ...rule.skippedGlobalTags.map(tag => tag.key)]);
      if (suppressedKeys.size > 0 && !suppressedOwnershipRules.has(ruleKey)) {
        suppressedOwnershipKeysByRule.set(ruleKey, suppressedKeys);
      }
      warnings.push(
        ...rule.skippedGlobalTags.map(tag => createSkippedGlobalWarning(rule.ruleName, tag.key, tag.reason)),
      );
    }
    targets.set(targetKey, { accountId: planTarget.accountId, region: planTarget.region, rules });
  }

  return {
    targets,
    suppressedOwnershipKeysByRule,
    suppressedOwnershipRules,
    warnings: mergeWarnings(warnings),
    activeAccountIds,
    enabledRegions,
  };
}

/**
 * Build the normalized SDK request from reconciliation targets.
 *
 * Supported plaintext SSM templates exist only in the returned in-memory request and are excluded from
 * logger output, module responses, diffs, and persisted state.
 *
 * @param params Module Runner parameters and credentials
 * @param targets Reconciliation targets including cleanup-only ownership
 * @returns Config rule tagging module request
 */
function createModuleRequest(
  params: ModuleParams,
  targets: Map<string, ITargetAccumulator<IReconciliationRuleDefinition>>,
): IConfigRuleTaggingModuleRequest {
  const { accountsConfig, globalConfig } = params.moduleRunnerParameters.configs;

  return {
    ...params.runnerParameters.sessionContext,
    operation: 'tag',
    moduleName: params.moduleItem.name,
    solutionId: params.runnerParameters.solutionId,
    credentials: params.moduleRunnerParameters.managementAccountCredentials,
    dryRun: params.runnerParameters.dryRun,
    sessionPolicy: params.moduleRunnerParameters.sessionPolicy,
    configuration: {
      managementAccountId: accountsConfig.getManagementAccountId(),
      accountAccessRoleName: globalConfig.managementAccountAccessRole,
      targets: [...targets.values()]
        .map(target => ({
          accountId: target.accountId,
          region: target.region,
          rules: [...target.rules.values()]
            .map(rule => ({
              ruleName: rule.ruleName,
              tags: rule.tags,
              externallyManagedTagKeys: rule.externallyManagedTagKeys,
              ownedTagKeys: [...rule.ownedTagKeys].sort(),
              cleanupOnly: rule.cleanupOnly,
            }))
            .sort((left, right) => left.ruleName.localeCompare(right.ruleName)),
        }))
        .sort((left, right) =>
          getTargetKey(left.accountId, left.region).localeCompare(getTargetKey(right.accountId, right.region)),
        ),
    },
  };
}

/**
 * Select previous ownership entries still eligible for reconciliation.
 *
 * @param previousOwnedResources Serialized ownership entries from the previous successful run
 * @param plan Current reconciliation plan
 * @returns Ownership entries for active accounts, enabled Regions, and rules and keys safe to reconcile
 */
function filterPreviousOwnership(previousOwnedResources: string[], plan: IConfigRuleTaggingPlan): IOwnedTagKey[] {
  return parseOwnedResources(previousOwnedResources).filter(owned => {
    const ruleKey = getRuleKey(owned.accountId, owned.region, owned.ruleName);
    return (
      plan.activeAccountIds.has(owned.accountId) &&
      plan.enabledRegions.has(owned.region) &&
      !plan.suppressedOwnershipRules.has(ruleKey) &&
      !plan.suppressedOwnershipKeysByRule.get(ruleKey)?.has(owned.tagKey)
    );
  });
}

/**
 * Add previous tag-key ownership and cleanup-only rules to reconciliation targets.
 *
 * @param targets Mutable reconciliation targets
 * @param previousOwnership Ownership entries eligible for reconciliation
 */
function addPreviousOwnership(
  targets: Map<string, ITargetAccumulator<IReconciliationRuleDefinition>>,
  previousOwnership: readonly IOwnedTagKey[],
): void {
  for (const owned of previousOwnership) {
    const key = getTargetKey(owned.accountId, owned.region);
    const target = targets.get(key) ?? {
      accountId: owned.accountId,
      region: owned.region,
      rules: new Map<string, IReconciliationRuleDefinition>(),
    };
    const currentRule = target.rules.get(owned.ruleName);

    if (currentRule) {
      currentRule.ownedTagKeys.add(owned.tagKey);
    } else {
      target.rules.set(owned.ruleName, {
        ruleName: owned.ruleName,
        tags: [],
        externallyManagedTagKeys: [],
        ownedTagKeys: new Set([owned.tagKey]),
        cleanupOnly: true,
      });
    }
    targets.set(key, target);
  }
}

/**
 * Drop rules without module-managed tags or previous ownership, and targets left without rules.
 *
 * @param targets Mutable reconciliation targets
 */
function removeUnreconcilableTargets(targets: Map<string, ITargetAccumulator<IReconciliationRuleDefinition>>): void {
  for (const [targetKey, target] of targets) {
    for (const [ruleName, rule] of target.rules) {
      if (rule.tags.length === 0 && rule.ownedTagKeys.size === 0) {
        target.rules.delete(ruleName);
      }
    }
    if (target.rules.size === 0) {
      targets.delete(targetKey);
    }
  }
}

/**
 * Build the ownership ledger from keys managed by target reconciliation.
 *
 * A previously owned key that the module skipped at runtime keeps its ownership so that a transient
 * capacity or resolution failure does not relinquish a live tag.
 *
 * @param targets Per-target reconciliation results
 * @param previousOwnership Ownership entries eligible for reconciliation
 * @returns Stable-sorted serialized ownership IDs
 */
function createOwnedResourceIds(
  targets: readonly IConfigRuleTaggingTargetResult[],
  previousOwnership: readonly IOwnedTagKey[],
): string[] {
  const previousTagKeysByRule = new Map<string, Set<string>>();
  for (const owned of previousOwnership) {
    const ruleKey = getRuleKey(owned.accountId, owned.region, owned.ruleName);
    const tagKeys = previousTagKeysByRule.get(ruleKey) ?? new Set<string>();
    tagKeys.add(owned.tagKey);
    previousTagKeysByRule.set(ruleKey, tagKeys);
  }

  const resourceIds: string[] = [];
  for (const target of targets) {
    for (const rule of target.rules) {
      const previousTagKeys = previousTagKeysByRule.get(getRuleKey(target.accountId, target.region, rule.ruleName));
      const tagKeys = new Set(rule.managedTagKeys ?? []);
      if (rule.status === 'missing') {
        previousTagKeys?.forEach(tagKey => tagKeys.add(tagKey));
      } else {
        for (const skipped of rule.skippedTagKeys ?? []) {
          if (previousTagKeys?.has(skipped.key)) {
            tagKeys.add(skipped.key);
          }
        }
      }
      if (tagKeys.size > 0) {
        resourceIds.push(createOwnedResourceId(target.accountId, target.region, rule.ruleName, [...tagKeys]));
      }
    }
  }
  return resourceIds.sort();
}

/**
 * Serialize the tag keys owned for one Config rule in one account and Region.
 *
 * @param accountId AWS account ID
 * @param region AWS Region
 * @param ruleName Config rule name
 * @param tagKeys Owned tag keys
 * @returns Serialized ownership resource ID
 */
function createOwnedResourceId(accountId: string, region: string, ruleName: string, tagKeys: string[]): string {
  return [
    OWNED_RESOURCE_PREFIX,
    accountId,
    region,
    encodeURIComponent(ruleName),
    tagKeys
      .sort()
      .map(tagKey => encodeURIComponent(tagKey))
      .join(OWNED_RESOURCE_KEY_SEPARATOR),
  ].join(':');
}

/**
 * Parse serialized Config rule tag ownership, ignoring unparsable entries.
 *
 * @param resourceIds Serialized ownership resource IDs
 * @returns One entry per owned account, Region, rule, and tag key
 */
function parseOwnedResources(resourceIds: readonly string[]): IOwnedTagKey[] {
  const ownedTagKeys: IOwnedTagKey[] = [];

  for (const resourceId of resourceIds) {
    const [prefix, accountId, region, encodedRuleName, encodedTagKeys, ...remainder] = resourceId.split(':');
    if (
      prefix !== OWNED_RESOURCE_PREFIX ||
      !ACCOUNT_ID_PATTERN.test(accountId ?? '') ||
      !region ||
      !encodedRuleName ||
      !encodedTagKeys ||
      remainder.length > 0
    ) {
      continue;
    }

    try {
      const ruleName = decodeURIComponent(encodedRuleName);
      const tagKeys = encodedTagKeys.split(OWNED_RESOURCE_KEY_SEPARATOR).map(tagKey => decodeURIComponent(tagKey));
      if (!ruleName) {
        continue;
      }
      ownedTagKeys.push(...tagKeys.filter(tagKey => tagKey).map(tagKey => ({ accountId, region, ruleName, tagKey })));
    } catch {
      continue;
    }
  }

  return ownedTagKeys;
}

/**
 * Convert target-level skipped keys into user-facing compatibility warnings.
 *
 * @param targets Per-target reconciliation results
 * @returns Deduplicated skipped-global-tag warnings
 */
function createRuntimeSkippedWarnings(targets: readonly IConfigRuleTaggingTargetResult[]): IConfigRuleTaggingWarning[] {
  return mergeWarnings(
    targets.flatMap(target =>
      target.rules.flatMap(rule =>
        (rule.skippedTagKeys ?? []).map(tag => createSkippedGlobalWarning(rule.ruleName, tag.key, tag.reason)),
      ),
    ),
  );
}

/**
 * Create one redacted skipped-global-tag warning.
 *
 * @param ruleName Config rule name
 * @param tagKey Configured tag key
 * @param reason Stable skip reason
 * @returns Warning safe for logs, responses, and persisted state
 */
function createSkippedGlobalWarning(ruleName: string, tagKey: string, reason: string): IConfigRuleTaggingWarning {
  const diagnosticKey = getConfigRuleTagDiagnosticKey(tagKey);
  return {
    code: 'skipped-global-tag',
    ruleName,
    tagKey: diagnosticKey,
    reason,
    message: `Config rule "${ruleName}" skipped global tag "${diagnosticKey}" because ${reason}`,
  };
}

/**
 * Deduplicate and stable-sort warning collections.
 *
 * @param warningLists Warning collections from planning and runtime resolution
 * @returns Unique warnings sorted by message
 */
function mergeWarnings(...warningLists: readonly IConfigRuleTaggingWarning[][]): IConfigRuleTaggingWarning[] {
  const warnings = new Map<string, IConfigRuleTaggingWarning>();
  for (const warning of warningLists.flat()) {
    warnings.set(`${warning.ruleName}:${warning.tagKey}:${warning.reason}`, warning);
  }
  return [...warnings.values()].sort((left, right) => left.message.localeCompare(right.message));
}

/**
 * Build metadata-only state configuration grouped by identical rule sets.
 *
 * Tag values and plaintext SSM templates are never persisted.
 *
 * @param targets Current reconciliation targets
 * @returns State-safe scopes containing only targeting, rule names, tag keys, and value classifications
 */
function createStateConfig(
  targets: ReadonlyMap<string, ITargetAccumulator<IReconciliationRuleDefinition>>,
): IConfigRuleTaggingStateScope[] {
  const groups = new Map<
    string,
    { readonly rules: IConfigRuleTaggingStateRule[]; readonly regionsByAccount: Map<string, Set<string>> }
  >();

  for (const target of targets.values()) {
    const rules = [...target.rules.values()]
      .map(rule => ({
        ruleName: rule.ruleName,
        tags: rule.tags.map(tag => ({
          key: tag.key,
          valueType: tag.dynamicValue !== undefined ? ('dynamic' as const) : ('static' as const),
        })),
        externallyManagedTagKeys: [...rule.externallyManagedTagKeys],
      }))
      .sort((left, right) => left.ruleName.localeCompare(right.ruleName));
    const group = groups.get(JSON.stringify(rules)) ?? { rules, regionsByAccount: new Map<string, Set<string>>() };
    const regions = group.regionsByAccount.get(target.accountId) ?? new Set<string>();
    regions.add(target.region);
    group.regionsByAccount.set(target.accountId, regions);
    groups.set(JSON.stringify(rules), group);
  }

  const scopes: IConfigRuleTaggingStateScope[] = [];
  for (const group of groups.values()) {
    const accountIdsByRegions = new Map<string, string[]>();
    for (const [accountId, regions] of group.regionsByAccount) {
      const regionKey = [...regions].sort().join(',');
      accountIdsByRegions.set(regionKey, [...(accountIdsByRegions.get(regionKey) ?? []), accountId]);
    }
    for (const [regionKey, accountIds] of accountIdsByRegions) {
      scopes.push({ accountIds: accountIds.sort(), regions: regionKey.split(','), rules: group.rules });
    }
  }

  return scopes.sort((left, right) => getScopeKey(left).localeCompare(getScopeKey(right)));
}

/**
 * Reduce a module response to the compressed ownership ledger persisted in module state.
 *
 * @param response Runtime module response
 * @returns Response carrying only compressed ownership
 */
function buildStateResponse(
  response: IModuleResponse<IConfigRuleTaggingActionResponse>,
): IModuleResponse<{ readonly ownedResources?: string | string[] }> {
  const ownedResources = response.response?.ownedResources;
  return {
    ...response,
    response: ownedResources ? { ownedResources: compressOwnedResources(ownedResources) } : {},
  };
}

/**
 * Create a module-level failure response.
 *
 * @param params Module Runner parameters
 * @param errorName Stable state error name
 * @param summary Human-readable summary
 * @param message Error detail
 * @returns Failed module response
 */
function createFailureResponse(
  params: ModuleParams,
  errorName: 'StateManagementError',
  summary: string,
  message: string,
): IModuleResponse<IConfigRuleTaggingActionResponse> {
  return {
    status: MODULE_STATE_CODE.FAILED,
    summary,
    timestamp: new Date().toISOString(),
    moduleName: params.moduleItem.name,
    dryRun: params.runnerParameters.dryRun,
    error: { name: errorName, message },
  };
}

/**
 * Build a stable target map key.
 *
 * @param accountId AWS account ID
 * @param region AWS Region
 * @returns Target map key
 */
function getTargetKey(accountId: string, region: string): string {
  return `${accountId}:${region}`;
}

/**
 * Build a stable per-rule key for one account and Region.
 *
 * @param accountId AWS account ID
 * @param region AWS Region
 * @param ruleName Config rule name
 * @returns Rule key
 */
function getRuleKey(accountId: string, region: string, ruleName: string): string {
  return `${accountId}:${region}:${encodeURIComponent(ruleName)}`;
}

/**
 * Build a stable ordering key for one persisted state scope.
 *
 * @param scope Persisted state scope
 * @returns Scope ordering key
 */
function getScopeKey(scope: IConfigRuleTaggingStateScope): string {
  return `${scope.accountIds.join(',')}:${scope.regions.join(',')}`;
}

/**
 * Format Config rule tagging dry-run results for the module diff viewer.
 *
 * @param response Config rule tagging module response
 * @returns Human-readable module diff
 */
function formatConfigRuleTaggingDiff(response: IModuleResponse<IConfigRuleTaggingActionResponse>): string {
  const lines = [SEPARATOR, `Module: ${response.moduleName}`, `Mode: ${formatDiffMode(response.status)}`, ''];
  const warnings = response.response?.warnings ?? [];

  if (response.status === MODULE_STATE_CODE.SKIPPED) {
    lines.push(`Reason: ${response.summary}`);
    lines.push(...formatCompatibilityWarnings(warnings), '', 'No changes', SEPARATOR);
    return lines.join('\n');
  }

  let changeCount = 0;
  let unchangedCount = 0;
  const targets = response.response?.targets ?? [];

  for (const target of targets) {
    const displayedRules = target.rules.filter(
      rule => rule.status !== 'no-change' || (rule.unmanagedTagKeys?.length ?? 0) > 0,
    );
    unchangedCount += target.rules.filter(rule => rule.status === 'no-change').length;
    if (displayedRules.length === 0) {
      continue;
    }

    lines.push(`  Account ${target.accountId} / ${target.region}:`);
    for (const rule of displayedRules) {
      lines.push(...formatRuleResult(rule).map(line => `    ${line}`));
      if (rule.status === 'dry-run' || rule.status === 'tagged' || rule.status === 'pending-create') {
        changeCount++;
      }
    }
  }

  if (changeCount === 0 && unchangedCount === 0 && targets.length === 0) {
    lines.push('No changes');
  } else {
    if (changeCount === 0 && !hasDiffFailure(response)) {
      lines.push('No changes');
    }
    if (unchangedCount > 0) {
      lines.push(`  [=] ${unchangedCount} rule target(s) unchanged`);
    }
  }

  if (response.error) {
    lines.push('', `Error: ${response.error.name}`, `Message: ${response.error.message}`);
  }
  lines.push(...formatCompatibilityWarnings(warnings));
  lines.push('', response.summary, SEPARATOR);
  return lines.join('\n');
}

/**
 * Format compatibility warnings for the module diff viewer.
 *
 * @param warnings Redacted compatibility warnings
 * @returns Diff lines, including a separating blank line when warnings exist
 */
function formatCompatibilityWarnings(warnings: readonly IConfigRuleTaggingWarning[]): string[] {
  return warnings.length > 0 ? ['', ...warnings.map(warning => `[!] ${warning.code}: ${warning.message}`)] : [];
}

/**
 * Format the dry-run mode label for a module response.
 *
 * @param status Module response status
 * @returns Diff viewer mode label
 */
function formatDiffMode(status: string): string {
  if (status === MODULE_STATE_CODE.FAILED) {
    return 'Dry Run — FAILED';
  }
  return status === MODULE_STATE_CODE.SKIPPED ? 'Dry Run — SKIPPED' : 'Dry Run';
}

/**
 * Format one Config rule reconciliation result.
 *
 * @param rule Per-rule reconciliation result
 * @returns Diff lines for tag updates, removals, unmanaged tag attention, or failure
 */
function formatRuleResult(rule: IConfigRuleTaggingRuleResult): string[] {
  let lines: string[];

  if (rule.status === 'pending-create') {
    const changedKeys = rule.changedTagKeys ?? [];
    lines = [
      `[+] ${rule.ruleName} (pending creation): ${changedKeys.length > 0 ? changedKeys.join(', ') : 'no module-managed tags'}`,
    ];
  } else if (rule.status === 'dry-run' || rule.status === 'tagged') {
    lines = [];
    const changedTagKeys = rule.changedTagKeys ?? [];
    const removedTagKeys = rule.removedTagKeys ?? [];
    if (changedTagKeys.length > 0) {
      lines.push(`[~] ${rule.ruleName}: ${changedTagKeys.join(', ')}`);
    }
    if (removedTagKeys.length > 0) {
      lines.push(`[-] ${rule.ruleName}: ${removedTagKeys.join(', ')}`);
    }
    if (lines.length === 0) {
      lines.push(`[~] ${rule.ruleName}`);
    }
  } else if (rule.status === 'no-change') {
    lines = [];
  } else {
    lines = [`[!] ${rule.ruleName}: ${rule.message}`];
  }

  const unmanagedTagKeys = rule.unmanagedTagKeys ?? [];
  if (unmanagedTagKeys.length > 0) {
    lines.push(
      `[!] ${rule.ruleName}: ${unmanagedTagKeys.join(', ')} - not managed by LZA configuration, ` +
        `will be preserved; consider adding them to configuration to let LZA manage them`,
    );
  }

  return lines;
}

/**
 * Determine whether a response contains a module-level or per-rule failure.
 *
 * @param response Config rule tagging module response
 * @returns True when any failure is present
 */
function hasDiffFailure(response: IModuleResponse<IConfigRuleTaggingActionResponse>): boolean {
  if (response.status === MODULE_STATE_CODE.FAILED) {
    return true;
  }
  return (response.response?.targets ?? []).some(target =>
    target.rules.some(rule => ['failed', 'validation-error'].includes(rule.status)),
  );
}

registerDiffFormatter(AcceleratorModules.CONFIG_RULE_TAGGING, response =>
  formatConfigRuleTaggingDiff(response as IModuleResponse<IConfigRuleTaggingActionResponse>),
);

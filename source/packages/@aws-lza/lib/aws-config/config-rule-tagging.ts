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
  ConfigServiceClient,
  DescribeConfigRulesCommand,
  ListTagsForResourceCommand,
  TagResourceCommand,
  UntagResourceCommand,
} from '@aws-sdk/client-config-service';
import { SSMClient } from '@aws-sdk/client-ssm';
import path from 'node:path';
import { processWithWorkerPool } from '../common/batch-processor';
import { AssumeRoleCredentialType, IModuleResponse } from '../common/interfaces';
import { createLogger } from '../common/logger';
import { resolvePublicMetadataDynamicReferences } from '../common/public-metadata-dynamic-references';
import { getCredentials } from '../common/sts-functions';
import { throttlingBackOff } from '../common/throttle';
import { MODULE_STATE_CODE } from '../common/types';
import { setRetryStrategy } from '../common/utility';
import {
  IConfigRuleSkippedTagKey,
  IConfigRuleStaticTag,
  IConfigRuleTaggingModuleRequest,
  IConfigRuleTaggingModuleResponse,
  IConfigRuleTaggingRule,
  IConfigRuleTaggingRuleResult,
  IConfigRuleTaggingTarget,
  IConfigRuleTaggingTargetResult,
} from './interfaces';

const logger = createLogger([path.parse(path.basename(__filename)).name]);
const MODULE_NAME_DEFAULT = 'config-rule-tagging';
const DESCRIBE_RULE_BATCH_SIZE = 25;
const RULE_DISCOVERY_MAX_ATTEMPTS = 4;
const RULE_DISCOVERY_RETRY_DELAY_MS = 5_000;
const MAX_CONCURRENT_TARGETS = 10;
const MAX_TAGS = 50;
const MAX_UNTAG_KEYS = 50;
const MAX_TAG_KEY_LENGTH = 128;
const MAX_TAG_VALUE_LENGTH = 256;
const TAG_CHARACTERS = /^[\p{L}\p{Z}\p{N}_.:/=+\-@]*$/u;

/**
 * Count Unicode code points for AWS Config tag length validation.
 *
 * @param value Tag key or value
 * @returns Number of Unicode characters in the value
 */
function getTagCharacterLength(value: string): number {
  return Array.from(value).length;
}

interface IResolvedConfigRuleTaggingRule extends Omit<IConfigRuleTaggingRule, 'tags'> {
  readonly tags: IConfigRuleStaticTag[];
  readonly skippedTagKeys: IConfigRuleSkippedTagKey[];
}

interface IConfigRuleTagSelection {
  readonly managedTags: IConfigRuleStaticTag[];
  readonly skippedTagKeys: IConfigRuleSkippedTagKey[];
}

/**
 * Reconcile configured tags on LZA-created AWS Config rules.
 *
 * @param props Normalized module request containing account, region, rule, and tag targets
 * @returns Structured module response with per-target and per-rule outcomes
 */
export async function tagConfigRules(
  props: IConfigRuleTaggingModuleRequest,
): Promise<IModuleResponse<IConfigRuleTaggingModuleResponse>> {
  const moduleName = props.moduleName ?? MODULE_NAME_DEFAULT;
  const dryRun = props.dryRun ?? false;
  const logPrefix = `${props.invokingAccountId}:${props.region}`;

  logger.processStart(`Starting ${moduleName} module - dryRun: ${dryRun}`, logPrefix);

  const targetTasks = props.configuration.targets.map(target => () => reconcileTarget(target, props, dryRun));
  const targets = await processWithWorkerPool(targetTasks, MAX_CONCURRENT_TARGETS);
  const ruleResults = targets.flatMap(target => target.rules);
  const failures = ruleResults.filter(result => result.status === 'failed' || result.status === 'validation-error');
  const pendingCreateCount = ruleResults.filter(result => result.status === 'pending-create').length;
  const missingCount = ruleResults.filter(result => result.status === 'missing').length;
  const notes = [
    ...(pendingCreateCount > 0 ? [`${pendingCreateCount} rule(s) are pending creation`] : []),
    ...(missingCount > 0 ? [`${missingCount} rule(s) were not found`] : []),
  ];
  const summary =
    failures.length > 0
      ? `${moduleName} completed with ${failures.length} failure(s) across ${ruleResults.length} rule target(s)`
      : `${moduleName} completed across ${ruleResults.length} rule target(s)${notes.map(note => `; ${note}`).join('')}`;

  if (failures.length > 0) {
    logger.error(summary, logPrefix);
    return {
      status: MODULE_STATE_CODE.FAILED,
      summary,
      timestamp: new Date().toISOString(),
      moduleName,
      dryRun,
      error: failures[0].error ?? { name: 'ValidationError', message: failures[0].message },
      response: { targets },
    };
  }

  logger.processEnd(summary, logPrefix);
  return {
    status: MODULE_STATE_CODE.SUCCESS,
    summary,
    timestamp: new Date().toISOString(),
    moduleName,
    dryRun,
    response: { targets },
  };
}

/**
 * Reconcile every configured rule for a single account and region.
 *
 * @param target Account and region target with its expected Config rules
 * @param props Module request containing credentials and role configuration
 * @param dryRun Whether writes should be reported without being applied
 * @returns Per-rule results for the target
 */
async function reconcileTarget(
  target: IConfigRuleTaggingTarget,
  props: IConfigRuleTaggingModuleRequest,
  dryRun: boolean,
): Promise<IConfigRuleTaggingTargetResult> {
  if (target.rules.length === 0) {
    return { accountId: target.accountId, region: target.region, rules: [] };
  }

  const logPrefix = `${target.accountId}:${target.region}`;

  try {
    const credentials = await resolveTargetCredentials(target, props);
    const client = new ConfigServiceClient({
      region: target.region,
      credentials,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
    });
    const ssmClient = new SSMClient({
      region: target.region,
      credentials,
      customUserAgent: props.solutionId,
      retryStrategy: setRetryStrategy(),
    });
    const resolvedRules = await resolveTargetRules(target.rules, ssmClient);
    const discovery = await discoverRuleArns(client, resolvedRules, dryRun, logPrefix);
    const rules: IConfigRuleTaggingRuleResult[] = [];

    for (const rule of resolvedRules) {
      // A discovery error may be recorded for a batch after an earlier page already
      // returned this rule, so a known ARN takes precedence over that error.
      const resourceArn = discovery.ruleArns.get(rule.ruleName);
      if (resourceArn) {
        rules.push(await reconcileRule(client, resourceArn, rule, dryRun, logPrefix));
        continue;
      }

      const discoveryError = discovery.errors.get(rule.ruleName);
      if (discoveryError) {
        rules.push({
          ruleName: rule.ruleName,
          status: 'failed',
          skippedTagKeys: rule.skippedTagKeys,
          message: discoveryError.message,
          error: discoveryError,
        });
        continue;
      }

      rules.push(buildUndiscoveredRuleResult(rule, dryRun));
    }

    warnMissingRules(rules, logPrefix);

    return { accountId: target.accountId, region: target.region, rules };
  } catch (error: unknown) {
    const failure = getError(error);
    return {
      accountId: target.accountId,
      region: target.region,
      rules: target.rules.map(rule => ({
        ruleName: rule.ruleName,
        status: 'failed',
        message: failure.message,
        error: failure,
      })),
    };
  }
}

/**
 * Build the result for a configured rule that discovery did not find.
 *
 * @param rule Resolved rule and tag configuration
 * @param dryRun Whether discovery ran before deployment
 * @returns Cleanup-only, pending-create, validation-error, or missing result
 */
function buildUndiscoveredRuleResult(
  rule: IResolvedConfigRuleTaggingRule,
  dryRun: boolean,
): IConfigRuleTaggingRuleResult {
  if (rule.cleanupOnly) {
    return {
      ruleName: rule.ruleName,
      status: 'no-change',
      managedTagKeys: [],
      skippedTagKeys: rule.skippedTagKeys,
      message: `Config rule "${rule.ruleName}" no longer exists; no owned tags require cleanup`,
    };
  }

  if (dryRun) {
    const desiredTags = normalizeDesiredTags(rule.tags);
    const validationError = validateTags(desiredTags);
    if (validationError) {
      return {
        ruleName: rule.ruleName,
        status: 'validation-error',
        skippedTagKeys: rule.skippedTagKeys,
        message: validationError,
        error: { name: 'ValidationError', message: validationError },
      };
    }

    const selection = selectManagedTagsForCapacity(
      desiredTags,
      new Map<string, string>(),
      [],
      rule.externallyManagedTagKeys ?? [],
    );
    const managedTagKeys = selection.managedTags.map(tag => tag.key).sort();
    return {
      ruleName: rule.ruleName,
      status: 'pending-create',
      managedTagKeys,
      skippedTagKeys: deduplicateSkippedTagKeys([...rule.skippedTagKeys, ...selection.skippedTagKeys]),
      changedTagKeys: managedTagKeys,
      message: `Config rule "${rule.ruleName}" is pending creation and would receive ${managedTagKeys.length} configured tag(s)`,
    };
  }

  return {
    ruleName: rule.ruleName,
    status: 'missing',
    skippedTagKeys: rule.skippedTagKeys,
    message:
      `Config rule "${rule.ruleName}" was not found after ${RULE_DISCOVERY_MAX_ATTEMPTS} discovery attempts ` +
      `and was not tagged; it may not be deployed to this account and Region`,
  };
}

/**
 * Warn about configured rules that do not exist in the target account and Region.
 *
 * @param rules Per-rule results for one target
 * @param logPrefix Account and Region context for log messages
 */
function warnMissingRules(rules: readonly IConfigRuleTaggingRuleResult[], logPrefix: string): void {
  const missingRuleNames = rules.filter(rule => rule.status === 'missing').map(rule => rule.ruleName);
  if (missingRuleNames.length > 0) {
    logger.warn(
      `Config rule(s) not found and not tagged: ${missingRuleNames.join(', ')}; rules that are not deployed to ` +
        `every enabled account and Region, or that are still deploying, are expected to be absent`,
      logPrefix,
    );
  }
}

/**
 * Resolve target-local dynamic global values and protect externally managed keys.
 *
 * @param rules Config rule definitions for one account and Region
 * @param ssmClient SSM client using the target credentials
 * @returns Rules containing only resolved static tags plus redacted skipped-key reasons
 */
async function resolveTargetRules(
  rules: readonly IConfigRuleTaggingRule[],
  ssmClient: SSMClient,
): Promise<IResolvedConfigRuleTaggingRule[]> {
  const dynamicValues = [
    ...new Set(
      rules.flatMap(rule => {
        const externallyManagedTagKeys = new Set(rule.externallyManagedTagKeys ?? []);
        return rule.tags.flatMap(tag =>
          !externallyManagedTagKeys.has(tag.key) && tag.dynamicValue !== undefined ? [tag.dynamicValue] : [],
        );
      }),
    ),
  ];
  const resolutionResults = await resolvePublicMetadataDynamicReferences(dynamicValues, ssmClient);
  const resolutions = new Map(dynamicValues.map((value, index) => [value, resolutionResults[index]]));

  return rules.map(rule => {
    const externallyManagedTagKeys = new Set(rule.externallyManagedTagKeys ?? []);
    const tags = new Map<string, IConfigRuleStaticTag>();
    const skippedTagKeys: IConfigRuleSkippedTagKey[] = [];

    for (const tag of rule.tags) {
      if (externallyManagedTagKeys.has(tag.key)) {
        skippedTagKeys.push({ key: tag.key, reason: 'externally-managed' });
      } else if (tag.value !== undefined) {
        tags.set(tag.key, { key: tag.key, value: tag.value });
      } else {
        const resolution = resolutions.get(tag.dynamicValue);
        if (!resolution || resolution.status === 'skipped') {
          skippedTagKeys.push({
            key: tag.key,
            reason: resolution?.reason ?? 'ssm-resolution-failed',
          });
          continue;
        }

        const valueReason = validateTagValue(resolution.value);
        if (valueReason) {
          skippedTagKeys.push({ key: tag.key, reason: 'ssm-resolved-value-invalid' });
          continue;
        }
        tags.set(tag.key, { key: tag.key, value: resolution.value });
      }
    }

    return {
      ...rule,
      tags: [...tags.values()],
      externallyManagedTagKeys: [...externallyManagedTagKeys].sort(),
      skippedTagKeys: deduplicateSkippedTagKeys(skippedTagKeys),
    };
  });
}

/**
 * Deduplicate and stable-sort skipped tag-key results.
 *
 * @param skippedTagKeys Skipped keys collected while resolving one target
 * @returns Unique skipped key and reason combinations in stable order
 */
function deduplicateSkippedTagKeys(skippedTagKeys: readonly IConfigRuleSkippedTagKey[]): IConfigRuleSkippedTagKey[] {
  const skipped = new Map<string, IConfigRuleSkippedTagKey>();
  for (const item of skippedTagKeys) {
    skipped.set(`${item.key}:${item.reason}`, item);
  }
  return [...skipped.values()].sort(
    (left, right) => left.key.localeCompare(right.key) || left.reason.localeCompare(right.reason),
  );
}

/**
 * Resolve credentials for the target account.
 *
 * @param target Account and region being reconciled
 * @param props Module request containing management credentials and role settings
 * @returns Management credentials or assumed-role credentials for the target
 */
async function resolveTargetCredentials(
  target: IConfigRuleTaggingTarget,
  props: IConfigRuleTaggingModuleRequest,
): Promise<AssumeRoleCredentialType | undefined> {
  if (target.accountId === props.configuration.managementAccountId) {
    return props.credentials;
  }

  return await getCredentials({
    accountId: target.accountId,
    region: target.region,
    partition: props.partition,
    solutionId: props.solutionId,
    assumeRoleName: props.configuration.accountAccessRoleName,
    sessionName: 'ConfigRuleTagging',
    credentials: props.credentials,
    sessionPolicy: props.sessionPolicy,
    requireSessionPolicy: !!props.sessionPolicy,
    logPrefix: `${target.accountId}:${target.region}`,
  });
}

/**
 * Discover Config rule ARNs, retrying only unresolved names after deployment.
 *
 * @param client AWS Config client for the target account and region
 * @param rules Configured rules whose ARNs are required
 * @param dryRun Whether discovery is running before deployment, which uses a single pass
 * @param logPrefix Account and Region context for log messages
 * @returns Discovered ARNs and per-rule discovery errors
 */
async function discoverRuleArns(
  client: ConfigServiceClient,
  rules: IConfigRuleTaggingRule[],
  dryRun: boolean,
  logPrefix: string,
): Promise<{
  ruleArns: Map<string, string>;
  errors: Map<string, { name: string; message: string }>;
}> {
  const ruleArns = new Map<string, string>();
  const errors = new Map<string, { name: string; message: string }>();
  let unresolvedRules = rules;
  const maxAttempts = dryRun ? 1 : RULE_DISCOVERY_MAX_ATTEMPTS;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const discovery = await describeRuleArns(client, unresolvedRules);
    discovery.ruleArns.forEach((arn, ruleName) => ruleArns.set(ruleName, arn));
    discovery.errors.forEach((error, ruleName) => errors.set(ruleName, error));
    unresolvedRules = unresolvedRules.filter(rule => !ruleArns.has(rule.ruleName) && !errors.has(rule.ruleName));

    if (unresolvedRules.length === 0 || attempt === maxAttempts) {
      break;
    }

    logger.info(
      `Waiting ${RULE_DISCOVERY_RETRY_DELAY_MS}ms before retrying discovery for ${unresolvedRules.length} Config rule(s) (attempt ${
        attempt + 1
      }/${maxAttempts})`,
      logPrefix,
    );
    await sleep(RULE_DISCOVERY_RETRY_DELAY_MS);
  }

  return { ruleArns, errors };
}

/**
 * Discover Config rule ARNs in API-sized batches.
 *
 * @param client AWS Config client for the target account and region
 * @param rules Configured rules whose ARNs are required
 * @returns Discovered ARNs and per-rule discovery errors
 */
async function describeRuleArns(
  client: ConfigServiceClient,
  rules: IConfigRuleTaggingRule[],
): Promise<{
  ruleArns: Map<string, string>;
  errors: Map<string, { name: string; message: string }>;
}> {
  const ruleArns = new Map<string, string>();
  const errors = new Map<string, { name: string; message: string }>();
  const ruleNames = [...new Set(rules.map(rule => rule.ruleName))];

  for (let index = 0; index < ruleNames.length; index += DESCRIBE_RULE_BATCH_SIZE) {
    const batch = ruleNames.slice(index, index + DESCRIBE_RULE_BATCH_SIZE);

    try {
      await collectRuleArns(client, batch, ruleArns);
    } catch (error: unknown) {
      const failure = getError(error);
      if (failure.name !== 'NoSuchConfigRuleException' || batch.length === 1) {
        if (failure.name !== 'NoSuchConfigRuleException') {
          batch.forEach(ruleName => errors.set(ruleName, failure));
        }
        continue;
      }

      // A single absent name fails the whole named batch, so retry individually to
      // reconcile the rules that do exist.
      for (const ruleName of batch) {
        try {
          await collectRuleArns(client, [ruleName], ruleArns);
        } catch (individualError: unknown) {
          const individualFailure = getError(individualError);
          if (individualFailure.name !== 'NoSuchConfigRuleException') {
            errors.set(ruleName, individualFailure);
          }
        }
      }
    }
  }

  return { ruleArns, errors };
}

/**
 * Collect Config rule ARNs for one named request, following pagination.
 *
 * @param client AWS Config client for the target account and region
 * @param ruleNames Config rule names, limited to the API maximum of 25
 * @param ruleArns Map populated with discovered rule names and ARNs
 */
async function collectRuleArns(
  client: ConfigServiceClient,
  ruleNames: string[],
  ruleArns: Map<string, string>,
): Promise<void> {
  let nextToken: string | undefined;
  do {
    const response = await throttlingBackOff(() =>
      client.send(new DescribeConfigRulesCommand({ ConfigRuleNames: ruleNames, NextToken: nextToken })),
    );
    for (const rule of response.ConfigRules ?? []) {
      if (rule.ConfigRuleName && rule.ConfigRuleArn) {
        ruleArns.set(rule.ConfigRuleName, rule.ConfigRuleArn);
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);
}

/**
 * Pause between eventual-consistency discovery attempts.
 *
 * @param milliseconds Delay duration in milliseconds
 * @returns Promise that resolves after the delay
 */
async function sleep(milliseconds: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, milliseconds));
}

/**
 * Reconcile desired and previously owned tags for one Config rule.
 *
 * @param client AWS Config client for the target account and region
 * @param resourceArn ARN of the Config rule
 * @param rule Desired rule and tag configuration
 * @param dryRun Whether writes should be reported without being applied
 * @param logPrefix Account and Region context for log messages
 * @returns Structured result for the rule
 */
async function reconcileRule(
  client: ConfigServiceClient,
  resourceArn: string,
  rule: IResolvedConfigRuleTaggingRule,
  dryRun: boolean,
  logPrefix: string,
): Promise<IConfigRuleTaggingRuleResult> {
  let unmanagedTagKeys: string[] | undefined;
  let skippedTagKeys = rule.skippedTagKeys;

  try {
    const desiredTags = normalizeDesiredTags(rule.cleanupOnly ? [] : rule.tags);
    const currentTags = await listTags(client, resourceArn);
    const desiredTagKeys = new Set(desiredTags.map(tag => tag.key));
    const ownedTagKeys = new Set(rule.ownedTagKeys ?? []);
    const protectedTagKeys = new Set([
      ...(rule.externallyManagedTagKeys ?? []),
      ...rule.skippedTagKeys.map(tag => tag.key),
    ]);
    unmanagedTagKeys = [...currentTags.keys()]
      .filter(
        key =>
          !key.toLowerCase().startsWith('aws:') &&
          !desiredTagKeys.has(key) &&
          !ownedTagKeys.has(key) &&
          !protectedTagKeys.has(key),
      )
      .sort((left, right) => left.localeCompare(right));

    if (unmanagedTagKeys.length > 0) {
      logger.warn(
        `Config rule "${rule.ruleName}" has tag keys that are not managed by LZA configuration and will be preserved: ` +
          `${unmanagedTagKeys.join(', ')}; consider adding them to configuration to let LZA manage them`,
        logPrefix,
      );
    }

    const validationError = validateTags(desiredTags);
    if (validationError) {
      return {
        ruleName: rule.ruleName,
        status: 'validation-error',
        skippedTagKeys,
        unmanagedTagKeys,
        message: validationError,
        error: { name: 'ValidationError', message: validationError },
      };
    }

    const removedTagKeys = [...currentTags.keys()]
      .filter(
        key =>
          ownedTagKeys.has(key) &&
          !desiredTagKeys.has(key) &&
          !protectedTagKeys.has(key) &&
          !key.toLowerCase().startsWith('aws:'),
      )
      .sort();
    const selection = selectManagedTagsForCapacity(
      desiredTags,
      currentTags,
      removedTagKeys,
      rule.externallyManagedTagKeys ?? [],
    );
    skippedTagKeys = deduplicateSkippedTagKeys([...rule.skippedTagKeys, ...selection.skippedTagKeys]);
    const managedTagKeys = selection.managedTags.map(tag => tag.key).sort();
    const changedTags = selection.managedTags.filter(tag => currentTags.get(tag.key) !== tag.value);
    const changedTagKeys = changedTags.map(tag => tag.key).sort();
    if (changedTags.length === 0 && removedTagKeys.length === 0) {
      return {
        ruleName: rule.ruleName,
        status: 'no-change',
        managedTagKeys,
        skippedTagKeys,
        unmanagedTagKeys,
        message: `Config rule "${rule.ruleName}" already has the desired tags`,
      };
    }

    if (dryRun) {
      return {
        ruleName: rule.ruleName,
        status: 'dry-run',
        managedTagKeys,
        skippedTagKeys,
        changedTagKeys,
        removedTagKeys,
        unmanagedTagKeys,
        message: `Config rule "${rule.ruleName}" would update ${changedTagKeys.length} tag(s) and remove ${removedTagKeys.length} tag(s)`,
      };
    }

    for (let index = 0; index < removedTagKeys.length; index += MAX_UNTAG_KEYS) {
      await throttlingBackOff(() =>
        client.send(
          new UntagResourceCommand({
            ResourceArn: resourceArn,
            TagKeys: removedTagKeys.slice(index, index + MAX_UNTAG_KEYS),
          }),
        ),
      );
    }

    if (changedTags.length > 0) {
      await throttlingBackOff(() =>
        client.send(
          new TagResourceCommand({
            ResourceArn: resourceArn,
            Tags: changedTags.map(tag => ({ Key: tag.key, Value: tag.value })),
          }),
        ),
      );
    }

    return {
      ruleName: rule.ruleName,
      status: 'tagged',
      managedTagKeys,
      skippedTagKeys,
      changedTagKeys,
      removedTagKeys,
      unmanagedTagKeys,
      message: `Config rule "${rule.ruleName}" updated ${changedTagKeys.length} tag(s) and removed ${removedTagKeys.length} tag(s)`,
    };
  } catch (error: unknown) {
    const failure = getError(error);
    if (rule.cleanupOnly && failure.name === 'ResourceNotFoundException') {
      return {
        ruleName: rule.ruleName,
        status: 'no-change',
        managedTagKeys: [],
        skippedTagKeys,
        unmanagedTagKeys,
        message: `Config rule "${rule.ruleName}" no longer exists; no owned tags require cleanup`,
      };
    }
    return {
      ruleName: rule.ruleName,
      status: 'failed',
      skippedTagKeys,
      message: failure.message,
      error: failure,
    };
  }
}

/**
 * List all tags currently associated with a Config resource.
 *
 * @param client AWS Config client for the target account and region
 * @param resourceArn ARN of the Config resource
 * @returns Map of current tag keys to values
 */
async function listTags(client: ConfigServiceClient, resourceArn: string): Promise<Map<string, string>> {
  const tags = new Map<string, string>();
  let nextToken: string | undefined;

  do {
    const response = await throttlingBackOff(() =>
      client.send(new ListTagsForResourceCommand({ ResourceArn: resourceArn, NextToken: nextToken })),
    );
    for (const tag of response.Tags ?? []) {
      if (tag.Key) {
        tags.set(tag.Key, tag.Value ?? '');
      }
    }
    nextToken = response.NextToken;
  } while (nextToken);

  return tags;
}

/**
 * Deduplicate desired tags using last-key-wins semantics.
 *
 * @param tags Desired tags
 * @returns Deduplicated tag list
 */
function normalizeDesiredTags(tags: IConfigRuleStaticTag[]): IConfigRuleStaticTag[] {
  const normalized = new Map<string, string>();
  tags.forEach(tag => normalized.set(tag.key, tag.value));
  return [...normalized].map(([key, value]) => ({ key, value }));
}

/**
 * Select desired module tags that fit the tag quota after preserving live and externally managed keys.
 *
 * @param desiredTags Validated module-managed tags
 * @param currentTags Live tags on the Config rule
 * @param removedTagKeys Previous-owned keys planned for removal
 * @param externallyManagedTagKeys Rule-specific keys reserved for the custom resource
 * @returns Managed tags and missing desired keys skipped for capacity
 */
function selectManagedTagsForCapacity(
  desiredTags: readonly IConfigRuleStaticTag[],
  currentTags: ReadonlyMap<string, string>,
  removedTagKeys: readonly string[],
  externallyManagedTagKeys: readonly string[],
): IConfigRuleTagSelection {
  const removedTagKeySet = new Set(removedTagKeys);
  const occupiedTagKeys = new Set(
    [...currentTags.keys()].filter(key => !key.toLowerCase().startsWith('aws:') && !removedTagKeySet.has(key)),
  );
  for (const key of externallyManagedTagKeys) {
    if (!key.toLowerCase().startsWith('aws:')) {
      occupiedTagKeys.add(key);
    }
  }

  const managedTags: IConfigRuleStaticTag[] = [];
  const skippedTagKeys: IConfigRuleSkippedTagKey[] = [];
  for (const tag of [...desiredTags].sort((left, right) => left.key.localeCompare(right.key))) {
    if (occupiedTagKeys.has(tag.key)) {
      managedTags.push(tag);
    } else if (occupiedTagKeys.size < MAX_TAGS) {
      managedTags.push(tag);
      occupiedTagKeys.add(tag.key);
    } else {
      skippedTagKeys.push({ key: tag.key, reason: 'tag-limit' });
    }
  }

  return { managedTags, skippedTagKeys };
}

/**
 * Validate desired tag key and value constraints.
 *
 * @param desiredTags Desired module-managed tags
 * @returns Validation message, or undefined when valid
 */
function validateTags(desiredTags: IConfigRuleStaticTag[]): string | undefined {
  for (const tag of desiredTags) {
    const keyLength = getTagCharacterLength(tag.key);
    const valueLength = getTagCharacterLength(tag.value);

    if (keyLength < 1 || keyLength > MAX_TAG_KEY_LENGTH) {
      return `Tag key must contain between 1 and ${MAX_TAG_KEY_LENGTH} characters`;
    }
    if (valueLength > MAX_TAG_VALUE_LENGTH) {
      return `Tag value for "${tag.key}" exceeds ${MAX_TAG_VALUE_LENGTH} characters`;
    }
    if (tag.key.toLowerCase().startsWith('aws:')) {
      return `Tag key "${tag.key}" uses the reserved aws: prefix`;
    }
    if (tag.value.toLowerCase().startsWith('aws:')) {
      return `Tag value for "${tag.key}" uses the reserved aws: prefix`;
    }
    if (!TAG_CHARACTERS.test(tag.key) || !TAG_CHARACTERS.test(tag.value)) {
      return `Tag "${tag.key}" contains characters that AWS Config does not allow`;
    }
  }

  return undefined;
}

/**
 * Validate one target-resolved tag value without exposing it in the result.
 *
 * @param value Resolved plaintext value
 * @returns Stable validation reason, or undefined when valid
 */
function validateTagValue(value: string): string | undefined {
  if (getTagCharacterLength(value) > MAX_TAG_VALUE_LENGTH) {
    return 'value-too-long';
  }
  if (value.toLowerCase().startsWith('aws:')) {
    return 'reserved-prefix';
  }
  if (!TAG_CHARACTERS.test(value)) {
    return 'unsupported-characters';
  }
  return undefined;
}

/**
 * Normalize an unknown exception for module responses.
 *
 * @param error Caught value
 * @returns Error name and message
 */
function getError(error: unknown): { name: string; message: string } {
  return {
    name: error instanceof Error ? error.name : 'UnknownError',
    message: error instanceof Error ? error.message : String(error),
  };
}

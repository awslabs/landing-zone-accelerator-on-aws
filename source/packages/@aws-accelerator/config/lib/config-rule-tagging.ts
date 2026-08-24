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

import { isAcceleratorTaggingEnabled } from '@aws-accelerator/utils';

const MAX_CONFIG_RULE_TAGS = 50;
const MAX_CONFIG_RULE_TAG_KEY_LENGTH = 128;
const MAX_CONFIG_RULE_TAG_VALUE_LENGTH = 256;
const CONFIG_RULE_TAG_CHARACTERS = /^[\p{L}\p{Z}\p{N}_.:/=+\-@]*$/u;
const DYNAMIC_REFERENCE_MARKER = '{{resolve:';
const PLAINTEXT_SSM_DYNAMIC_REFERENCE_SOURCE = String.raw`\{\{resolve:ssm:([a-zA-Z0-9_.\-/]+)(?::(\d+))?\}\}`;

/**
 * Stable reason codes emitted by Config rule tag analysis and validation.
 */
export type ConfigRuleTagDiagnosticReason =
  | 'unsupported-dynamic-reference'
  | 'dynamic-rule-key'
  | 'empty-key'
  | 'key-too-long'
  | 'value-too-long'
  | 'reserved-key-prefix'
  | 'reserved-value-prefix'
  | 'unsupported-characters'
  | 'too-many-configured-tags';

/**
 * Compatibility-safe validation reasons enforced before the existing custom-resource path.
 */
type ConfigRuleTagErrorReason = 'empty-key' | 'key-too-long' | 'value-too-long' | 'reserved-key-prefix';

const CONFIG_RULE_TAG_ERROR_REASONS = new Set<string>([
  'empty-key',
  'key-too-long',
  'value-too-long',
  'reserved-key-prefix',
]);

/**
 * Minimal tag shape accepted by the analyzer.
 */
export interface IConfigRuleTagInput {
  /** Tag key. */
  readonly key: string;
  /** Tag value. */
  readonly value: string;
}

/**
 * Static global tag managed by Module Runner.
 */
export interface IConfigRuleAnalyzedStaticGlobalTag {
  /** Tag key supplied to AWS Config. */
  readonly key: string;
  /** Static literal value. */
  readonly value: string;
  /** Static tags do not carry a target-resolved template. */
  readonly dynamicValue?: never;
}

/**
 * Target-resolved global tag managed by Module Runner.
 */
export interface IConfigRuleAnalyzedDynamicGlobalTag {
  /** Tag key supplied to AWS Config. */
  readonly key: string;
  /** Dynamic tags do not carry a static value. */
  readonly value?: never;
  /** Plaintext SSM template passed ephemerally for target account and Region resolution. */
  readonly dynamicValue: string;
}

/**
 * Static or target-resolved global tag managed by Module Runner.
 */
export type IConfigRuleAnalyzedGlobalTag = IConfigRuleAnalyzedStaticGlobalTag | IConfigRuleAnalyzedDynamicGlobalTag;

/**
 * Describes an inherited global tag omitted from Module Runner.
 */
export interface IConfigRuleSkippedGlobalTag {
  /** Original tag key. */
  readonly key: string;
  /** Reason the tag cannot be managed through the AWS Config API. */
  readonly reason: ConfigRuleTagDiagnosticReason;
}

/**
 * Describes a hard configuration failure.
 */
export interface IConfigRuleTaggingError {
  /** Tag key when the error is scoped to one tag. */
  readonly key?: string;
  /** Stable failure reason. */
  readonly reason: ConfigRuleTagDiagnosticReason;
  /** Sanitized message containing no tag value or parameter path. */
  readonly message: string;
}

/**
 * Input for analyzing global tags for one Config rule.
 */
export interface IAnalyzeConfigRuleGlobalTagsProps {
  /** Config rule name used in validation messages. */
  readonly ruleName: string;
  /** Global tags considered for Module Runner management. */
  readonly globalTags?: readonly IConfigRuleTagInput[];
  /** Rule-specific tags permanently managed by the legacy custom resource. */
  readonly ruleTags?: readonly IConfigRuleTagInput[];
  /** AWS partition where the rule is deployed. */
  readonly partition: string;
  /** Accelerator prefix used for the default Accelerator tag. */
  readonly acceleratorPrefix: string;
}

/**
 * Result of global-tag analysis for one Config rule.
 */
export interface IConfigRuleGlobalTagAnalysis {
  /** Static and target-resolved tags managed by Module Runner. */
  readonly moduleTags: readonly IConfigRuleAnalyzedGlobalTag[];
  /** Rule-specific static keys protected from Module Runner changes and unmanaged reporting. */
  readonly externallyManagedTagKeys: readonly string[];
  /** Inherited globals omitted without blocking deployment. */
  readonly skippedGlobalTags: readonly IConfigRuleSkippedGlobalTag[];
}

/**
 * Analyze global Config rule tags while preserving rule-specific custom-resource ownership.
 *
 * @param props Global tags, rule tags, partition, and Accelerator prefix
 * @returns Module tags, external keys, and skipped globals
 */
export function analyzeConfigRuleGlobalTags(props: IAnalyzeConfigRuleGlobalTagsProps): IConfigRuleGlobalTagAnalysis {
  const externallyManagedTagKeys = new Set<string>();
  const skippedGlobalTags: IConfigRuleSkippedGlobalTag[] = [];
  let hasDynamicRuleTagKey = false;

  for (const tag of deduplicateTagsByKey(props.ruleTags).values()) {
    if (containsDynamicReference(tag.key)) {
      hasDynamicRuleTagKey = true;
      skippedGlobalTags.push({ key: tag.key, reason: 'dynamic-rule-key' });
      continue;
    }
    externallyManagedTagKeys.add(tag.key);
  }

  const moduleTags = new Map<string, IConfigRuleAnalyzedGlobalTag>();
  // An unresolved rule tag key may collide with any module-managed key, so the module manages nothing on that rule.
  if (!hasDynamicRuleTagKey && isAcceleratorTaggingEnabled(props.partition)) {
    moduleTags.set('Accelerator', { key: 'Accelerator', value: props.acceleratorPrefix });

    for (const tag of props.globalTags ?? []) {
      if (containsDynamicReference(tag.key)) {
        skippedGlobalTags.push({ key: tag.key, reason: 'unsupported-dynamic-reference' });
        continue;
      }

      const keyReason = getStaticKeyValidationReasons(tag.key)[0];
      if (keyReason) {
        skippedGlobalTags.push({ key: tag.key, reason: keyReason });
        continue;
      }

      if (containsDynamicReference(tag.value)) {
        if (!isPlaintextSsmDynamicReferenceTemplate(tag.value)) {
          skippedGlobalTags.push({ key: tag.key, reason: 'unsupported-dynamic-reference' });
          continue;
        }
        moduleTags.set(tag.key, { key: tag.key, dynamicValue: tag.value });
        continue;
      }

      const valueReason = getStaticValueValidationReasons(tag.value)[0];
      if (valueReason) {
        skippedGlobalTags.push({ key: tag.key, reason: valueReason });
        continue;
      }
      moduleTags.set(tag.key, { key: tag.key, value: tag.value });
    }
  }

  for (const key of externallyManagedTagKeys) {
    moduleTags.delete(key);
  }

  return {
    moduleTags: [...moduleTags.values()].sort((left, right) => left.key.localeCompare(right.key)),
    externallyManagedTagKeys: [...externallyManagedTagKeys].sort(),
    skippedGlobalTags: deduplicateSkippedTags(skippedGlobalTags),
  };
}

/**
 * Validate the config-time compatibility-safe subset of rule-specific Config rule tags.
 *
 * @param ruleName Config rule name used in sanitized messages
 * @param ruleTags Rule-specific tags declared in security configuration
 * @returns Hard validation errors for statically decidable failures
 */
export function getConfigRuleTagValidationErrors(
  ruleName: string,
  ruleTags?: readonly IConfigRuleTagInput[],
): IConfigRuleTaggingError[] {
  const errors: IConfigRuleTaggingError[] = [];
  const normalizedRuleTags = deduplicateTagsByKey(ruleTags);

  for (const tag of normalizedRuleTags.values()) {
    // Preserve the existing custom-resource compatibility boundary for dynamic keys and values.
    if (containsDynamicReference(tag.key)) {
      continue;
    }

    const reasons = getStaticKeyValidationReasons(tag.key);
    if (!containsDynamicReference(tag.value)) {
      reasons.push(...getStaticValueValidationReasons(tag.value));
    }

    errors.push(
      ...reasons
        .filter((reason): reason is ConfigRuleTagErrorReason => CONFIG_RULE_TAG_ERROR_REASONS.has(reason))
        .map(reason => ({
          key: tag.key,
          reason,
          message: getStaticValidationMessage(ruleName, tag.key, reason),
        })),
    );
  }

  if (normalizedRuleTags.size > MAX_CONFIG_RULE_TAGS) {
    errors.push({
      reason: 'too-many-configured-tags',
      message:
        `AWS Config rule "${ruleName}" has ${normalizedRuleTags.size} rule-specific tag keys, ` +
        `exceeding the limit of ${MAX_CONFIG_RULE_TAGS}`,
    });
  }

  return errors;
}

/**
 * Return a tag key safe for logs and dry-run output.
 *
 * @param key Original tag key
 * @returns Original key, or a redacted marker for dynamic keys
 */
export function getConfigRuleTagDiagnosticKey(key: string): string {
  return containsDynamicReference(key) ? '<dynamic-reference>' : key;
}

/**
 * Deduplicate tags by key so that the last declaration wins.
 *
 * @param tags Configured tags
 * @returns Tags keyed by their original tag key
 */
function deduplicateTagsByKey(tags?: readonly IConfigRuleTagInput[]): Map<string, IConfigRuleTagInput> {
  const normalizedTags = new Map<string, IConfigRuleTagInput>();
  (tags ?? []).forEach(tag => normalizedTags.set(tag.key, tag));
  return normalizedTags;
}

/**
 * Determine whether every dynamic reference in a global value is plaintext SSM.
 *
 * @param value Global tag value template
 * @returns True when the template contains only complete plaintext SSM dynamic references
 */
function isPlaintextSsmDynamicReferenceTemplate(value: string): boolean {
  const pattern = new RegExp(PLAINTEXT_SSM_DYNAMIC_REFERENCE_SOURCE, 'g');
  let cursor = 0;
  let matched = false;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (value.slice(cursor, match.index).includes(DYNAMIC_REFERENCE_MARKER)) {
      return false;
    }
    matched = true;
    cursor = match.index + match[0].length;
  }

  return matched && !value.slice(cursor).includes(DYNAMIC_REFERENCE_MARKER);
}

/**
 * Collect AWS Config validation reasons for a static tag key.
 *
 * @param key Static tag key
 * @returns Stable validation reasons
 */
function getStaticKeyValidationReasons(key: string): ConfigRuleTagDiagnosticReason[] {
  const reasons: ConfigRuleTagDiagnosticReason[] = [];
  const keyLength = Array.from(key).length;
  if (keyLength < 1) {
    reasons.push('empty-key');
  } else if (keyLength > MAX_CONFIG_RULE_TAG_KEY_LENGTH) {
    reasons.push('key-too-long');
  }
  if (key.toLowerCase().startsWith('aws:')) {
    reasons.push('reserved-key-prefix');
  }
  if (!CONFIG_RULE_TAG_CHARACTERS.test(key)) {
    reasons.push('unsupported-characters');
  }
  return reasons;
}

/**
 * Collect AWS Config validation reasons for a static tag value.
 *
 * @param value Static tag value
 * @returns Stable validation reasons
 */
function getStaticValueValidationReasons(value: string): ConfigRuleTagDiagnosticReason[] {
  const reasons: ConfigRuleTagDiagnosticReason[] = [];
  if (Array.from(value).length > MAX_CONFIG_RULE_TAG_VALUE_LENGTH) {
    reasons.push('value-too-long');
  }
  if (value.toLowerCase().startsWith('aws:')) {
    reasons.push('reserved-value-prefix');
  }
  if (!CONFIG_RULE_TAG_CHARACTERS.test(value)) {
    reasons.push('unsupported-characters');
  }
  return reasons;
}

/**
 * Format a sanitized validation message for one tag failure.
 *
 * @param ruleName Config rule name
 * @param key Tag key used for diagnostic context
 * @param reason Stable validation reason
 * @returns Human-readable validation message without tag values
 */
function getStaticValidationMessage(ruleName: string, key: string, reason: ConfigRuleTagErrorReason): string {
  const ruleContext = `AWS Config rule "${ruleName}"`;
  const diagnosticKey = getConfigRuleTagDiagnosticKey(key);
  switch (reason) {
    case 'value-too-long':
      return `${ruleContext} tag value for "${diagnosticKey}" exceeds ${MAX_CONFIG_RULE_TAG_VALUE_LENGTH} characters`;
    case 'reserved-key-prefix':
      return `${ruleContext} tag key "${diagnosticKey}" uses the reserved aws: prefix`;
    default:
      return `${ruleContext} tag key "${diagnosticKey}" must contain between 1 and ${MAX_CONFIG_RULE_TAG_KEY_LENGTH} characters`;
  }
}

/**
 * Determine whether text contains the start of a CloudFormation dynamic reference.
 *
 * @param value Tag key or value
 * @returns True when a dynamic reference marker is present
 */
function containsDynamicReference(value: string): boolean {
  return value.includes(DYNAMIC_REFERENCE_MARKER);
}

/**
 * Deduplicate and stable-sort skipped global-tag diagnostics.
 *
 * @param skippedTags Skipped inherited global tags
 * @returns Unique key and reason combinations in stable order
 */
function deduplicateSkippedTags(skippedTags: readonly IConfigRuleSkippedGlobalTag[]): IConfigRuleSkippedGlobalTag[] {
  const tags = new Map<string, IConfigRuleSkippedGlobalTag>();
  for (const tag of skippedTags) {
    tags.set(`${tag.key}:${tag.reason}`, tag);
  }
  return [...tags.values()].sort(
    (left, right) => left.key.localeCompare(right.key) || left.reason.localeCompare(right.reason),
  );
}

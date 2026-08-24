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

import { IModuleRequest } from '../common/interfaces';

/**
 * Static desired tag for an AWS Config rule.
 */
export interface IConfigRuleStaticTag {
  /** Tag key supplied to AWS Config. */
  readonly key: string;
  /** Static tag value. */
  readonly value: string;
  /** Static tags do not contain a target-resolved template. */
  readonly dynamicValue?: never;
}

/**
 * Target-resolved plaintext SSM tag for an AWS Config rule.
 */
export interface IConfigRuleDynamicTag {
  /** Tag key supplied to AWS Config. */
  readonly key: string;
  /** Dynamic tags do not carry a resolved value in requests or responses. */
  readonly value?: never;
  /**
   * Ephemeral plaintext SSM template resolved only with target account and Region credentials.
   *
   * This template is request-only input and must not enter logs, responses, diffs, or persisted state.
   */
  readonly dynamicValue: string;
}

/**
 * Static or target-resolved tag managed by Module Runner.
 */
export type IConfigRuleTag = IConfigRuleStaticTag | IConfigRuleDynamicTag;

/**
 * Redacted reason a configured global tag was skipped for one target.
 */
export interface IConfigRuleSkippedTagKey {
  /** Configured tag key. */
  readonly key: string;
  /** Stable reason code with no value or parameter path. */
  readonly reason: string;
}

/**
 * A rule, its module-managed tags, external tag keys, and previous ownership.
 */
export interface IConfigRuleTaggingRule {
  /** AWS Config rule name. */
  readonly ruleName: string;
  /**
   * Global and default Accelerator tags considered for Module Runner management.
   *
   * Dynamic entries contain only ephemeral plaintext SSM templates. Secure, Secrets Manager,
   * unknown, and malformed references must be removed before request construction.
   */
  readonly tags: IConfigRuleTag[];
  /** Rule-specific tag keys managed by the legacy custom resource. */
  readonly externallyManagedTagKeys?: string[];
  /**
   * Tag keys declared by the previous successful Module Runner execution.
   *
   * Only these keys are eligible for removal when they are no longer desired.
   * An empty or omitted list adopts the current configuration without removing tags.
   */
  readonly ownedTagKeys?: string[];
  /**
   * Whether the rule exists only in previous ownership state.
   *
   * A missing cleanup-only rule is treated as already cleaned up rather than as
   * a rule that is pending creation or failed discovery. Desired tags are
   * ignored for cleanup-only rules.
   */
  readonly cleanupOnly?: boolean;
}

/**
 * Normalized account and Region target supplied by the accelerator.
 */
export interface IConfigRuleTaggingTarget {
  /** AWS account containing the Config rules. */
  readonly accountId: string;
  /** AWS Region containing the Config rules. */
  readonly region: string;
  /** Config rules to reconcile in this account and Region. */
  readonly rules: IConfigRuleTaggingRule[];
}

/**
 * Configuration required to reconcile Config rule tags.
 */
export interface IConfigRuleTaggingConfiguration {
  /** Organizations management account ID. */
  readonly managementAccountId: string;
  /** IAM role assumed in non-management target accounts. */
  readonly accountAccessRoleName: string;
  /** Normalized account and Region targets. */
  readonly targets: IConfigRuleTaggingTarget[];
}

/**
 * Config rule tagging module request.
 *
 * Plaintext SSM templates may appear only as ephemeral in-memory inputs for target resolution.
 * They must not be logged, returned, diffed, or persisted.
 */
export interface IConfigRuleTaggingModuleRequest extends IModuleRequest {
  /** Config rule tagging configuration. */
  readonly configuration: IConfigRuleTaggingConfiguration;
}

/**
 * Result status for one Config rule.
 *
 * - `tagged`: The desired tag additions, updates, or removals were applied.
 * - `no-change`: The desired tags already match and no previous-owned key requires removal.
 * - `dry-run`: The rule exists and its proposed tag changes were calculated without being applied.
 * - `pending-create`: The rule does not exist during dry-run and its complete desired keys are reported.
 * - `missing`: The rule does not exist in the target account and Region after discovery retries were exhausted.
 *   Rules are deployed per deployment target and may still be deploying, so this state does not fail the module.
 * - `validation-error`: A desired tag key or value violates AWS Config constraints.
 * - `failed`: An AWS API or credential operation failed for the rule.
 */
export type ConfigRuleTaggingStatus =
  | 'tagged'
  | 'no-change'
  | 'dry-run'
  | 'pending-create'
  | 'missing'
  | 'validation-error'
  | 'failed';

/**
 * Reconciliation result for one Config rule.
 */
export interface IConfigRuleTaggingRuleResult {
  /** AWS Config rule name. */
  readonly ruleName: string;
  /** Outcome of reconciling or discovering the rule. */
  readonly status: ConfigRuleTaggingStatus;
  /** Stable-sorted keys successfully managed in this target execution. */
  readonly managedTagKeys?: string[];
  /** Stable-sorted configured keys skipped for this target with redacted reasons. */
  readonly skippedTagKeys?: IConfigRuleSkippedTagKey[];
  /** Stable-sorted keys changed or pending creation. */
  readonly changedTagKeys?: string[];
  /** Stable-sorted keys removed or planned for removal. */
  readonly removedTagKeys?: string[];
  /**
   * Stable-sorted live non-AWS tag keys that are neither module-managed, externally managed, skipped, nor previously
   * owned. Values are intentionally excluded.
   */
  readonly unmanagedTagKeys?: string[];
  /** Human-readable reconciliation or discovery summary. */
  readonly message: string;
  /** Error details when reconciliation did not succeed. */
  readonly error?: {
    /** Error class or stable module error name. */
    readonly name: string;
    /** Error detail suitable for logs and module output. */
    readonly message: string;
  };
}

/**
 * Reconciliation results for one account and Region.
 */
export interface IConfigRuleTaggingTargetResult {
  /** AWS account containing the reconciled Config rules. */
  readonly accountId: string;
  /** AWS Region containing the reconciled Config rules. */
  readonly region: string;
  /** Per-rule reconciliation outcomes. */
  readonly rules: IConfigRuleTaggingRuleResult[];
}

/**
 * Structured Config rule tagging response.
 */
export interface IConfigRuleTaggingModuleResponse {
  /** Results for every normalized account and Region target. */
  readonly targets: IConfigRuleTaggingTargetResult[];
  /** Stable-sorted Config rule tag ownership IDs attached by the accelerator action. */
  readonly ownedResources?: string[];
}

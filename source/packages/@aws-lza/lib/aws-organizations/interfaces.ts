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
 * @fileoverview Interface definitions for AWS Organizations modules.
 *
 * @description
 * Module interfaces are co-located here, matching the pattern used by Amazon
 * Macie where interfaces live alongside the implementation in `lib/` rather
 * than in a top-level `interfaces/` directory.
 */

import { IModuleRequest } from '../common/interfaces';

// ─── Unified Accounts Module ────────────────────────────────────────────────

/**
 * Configuration for a single account in the unified accounts module.
 *
 * @description
 * Combines alias and tag management into a single per-account descriptor.
 * The module handles all account-level operations (alias, tags) in one pass.
 */
export interface IAccountConfig {
  /** The AWS account ID */
  readonly accountId: string;
  /** Human-readable account name from accounts-config.yaml */
  readonly accountName: string;
  /**
   * The desired IAM account alias.
   *
   * Must be 3–63 characters, lowercase alphanumeric with hyphens, no
   * consecutive hyphens, and must start and end with a letter or digit.
   * Omit to skip alias management for this account.
   */
  readonly alias?: string;
  /** The desired set of tags for the account (omit to skip tag management) */
  readonly tags?: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

/**
 * Complete configuration for the unified accounts module.
 */
export interface IAccountsConfiguration {
  /** One entry per account that should be reconciled */
  readonly accounts: ReadonlyArray<IAccountConfig>;
  /**
   * IAM role name to assume inside each non-management account.
   *
   * @description
   * The IAM `CreateAccountAlias` API runs inside the target account's
   * credentials context, so the module must assume this role for every
   * non-management account. Tag operations use the Organizations API
   * from the management account and do not require role assumption.
   */
  readonly accountAccessRoleName: string;
  /** Account ID of the management account — skipped for role assumption */
  readonly managementAccountId: string;
}

/**
 * Module request for the unified accounts module.
 */
export interface IAccountsModuleRequest extends IModuleRequest {
  readonly configuration: IAccountsConfiguration;
}

/**
 * Per-account result from the unified accounts module
 */
export interface IAccountsPerAccountResult {
  readonly accountId: string;
  readonly accountName: string;
  /** Alias sub-operation result (undefined if alias was not configured for this account) */
  readonly aliasResult?: IManageAccountAliasPerAccountResult;
  /** Tags sub-operation result (undefined if tags were not configured for this account) */
  readonly tagsResult?: IManageAccountTagsPerAccountResult;
}

/**
 * Module response payload carried inside {@link IModuleResponse}
 */
export interface IAccountsModuleResponse {
  readonly perAccountResults: readonly IAccountsPerAccountResult[];
}

// ─── Account Alias ──────────────────────────────────────────────────────────

/**
 * Desired alias for a single AWS account
 */
export interface IAccountAliasConfig {
  /** The AWS account ID that the alias applies to */
  readonly accountId: string;
  /** Human-readable account name from accounts-config.yaml */
  readonly accountName: string;
  /**
   * The desired account alias.
   *
   * Must be 3–63 characters, lowercase alphanumeric with hyphens, no
   * consecutive hyphens, and must start and end with a letter or digit.
   */
  readonly alias: string;
}

/**
 * Complete configuration for the alias operation.
 */
export interface IManageAccountAliasConfiguration {
  /** One entry per account that should have its alias reconciled */
  readonly accounts: ReadonlyArray<IAccountAliasConfig>;
  /**
   * IAM role name to assume inside each non-management account.
   */
  readonly accountAccessRoleName: string;
  /** Account ID of the management account — skipped for role assumption */
  readonly managementAccountId: string;
}

/**
 * Module request for the alias operation.
 */
export interface IManageAccountAliasModuleRequest extends IModuleRequest {
  readonly configuration: IManageAccountAliasConfiguration;
}

/**
 * Outcome for a single account's alias reconciliation
 */
export type ManageAccountAliasPerAccountStatus =
  | 'no-change'
  | 'created'
  | 'replaced'
  | 'conflict'
  | 'validation-error'
  | 'dry-run'
  | 'failed';

/**
 * Per-account result for alias reconciliation
 */
export interface IManageAccountAliasPerAccountResult {
  readonly accountId: string;
  readonly accountName: string;
  readonly status: ManageAccountAliasPerAccountStatus;
  /** Alias in place before this operation (if any) */
  readonly previousAlias?: string;
  /** Alias in place after this operation */
  readonly currentAlias?: string;
  /** Human-readable summary of what happened for this account */
  readonly message: string;
  /** Error details when status is `failed`, `conflict`, or `validation-error` */
  readonly error?: { readonly name: string; readonly message: string };
}

/**
 * Response payload for the alias operation
 */
export interface IManageAccountAliasModuleResponse {
  readonly perAccountResults: readonly IManageAccountAliasPerAccountResult[];
}

// ─── Account Tags ───────────────────────────────────────────────────────────

/**
 * Desired tags for a single AWS account
 */
export interface IAccountTagsConfig {
  /** The AWS account ID to manage tags for */
  readonly accountId: string;
  /** Human-readable account name from accounts-config.yaml */
  readonly accountName: string;
  /** The desired set of tags for the account */
  readonly tags: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

/**
 * Complete configuration for the tags operation.
 */
export interface IManageAccountTagsConfiguration {
  /** One entry per account that should have its tags reconciled */
  readonly accounts: ReadonlyArray<IAccountTagsConfig>;
}

/**
 * Module request for the tags operation.
 */
export interface IManageAccountTagsModuleRequest extends IModuleRequest {
  readonly configuration: IManageAccountTagsConfiguration;
}

/**
 * Outcome for a single account's tag reconciliation
 */
export type ManageAccountTagsPerAccountStatus = 'no-change' | 'applied' | 'dry-run' | 'failed';

/**
 * Per-account result for tag reconciliation
 */
export interface IManageAccountTagsPerAccountResult {
  readonly accountId: string;
  readonly accountName: string;
  readonly status: ManageAccountTagsPerAccountStatus;
  /** Number of tags applied (populated when status is `applied` or `dry-run`) */
  readonly appliedCount?: number;
  /** Human-readable summary of what happened for this account */
  readonly message: string;
  /** Error details when status is `failed` */
  readonly error?: { readonly name: string; readonly message: string };
}

/**
 * Response payload for the tags operation
 */
export interface IManageAccountTagsModuleResponse {
  readonly perAccountResults: readonly IManageAccountTagsPerAccountResult[];
}

// ─── Tag and Backup Policy Account Attachments ─────────────────────────────

/**
 * Organizations policy types supported by direct-account reconciliation.
 */
export type TagAndBackupPolicyType = 'TAG_POLICY' | 'BACKUP_POLICY';

/**
 * Desired direct-account attachments for one LZA-managed Organizations policy.
 */
export interface ITagAndBackupPolicyAccountAttachmentConfig {
  /** Exact Organizations policy name */
  readonly policyName: string;
  /** Organizations policy type */
  readonly policyType: TagAndBackupPolicyType;
  /** Complete desired set of direct account target IDs */
  readonly accountIds: ReadonlyArray<string>;
  /**
   * Direct account target IDs owned by the previous successful module configuration.
   *
   * Only these account IDs are eligible for detachment when they are no longer
   * present in {@link accountIds}.
   */
  readonly ownedAccountIds: ReadonlyArray<string>;
  /**
   * Whether the policy exists only in the previous ownership state.
   *
   * A missing cleanup-only policy is considered already cleaned up after
   * bounded discovery because the Organizations stack may have deleted it.
   */
  readonly cleanupOnly: boolean;
}

/**
 * Configuration for Tag Policy and Backup Policy account attachments.
 */
export interface ITagAndBackupPolicyAccountAttachmentsConfiguration {
  /** Policies whose direct account targets must be reconciled */
  readonly policies: ReadonlyArray<ITagAndBackupPolicyAccountAttachmentConfig>;
}

/**
 * Module request for direct account policy attachment reconciliation.
 */
export interface ITagAndBackupPolicyAccountAttachmentsModuleRequest extends IModuleRequest {
  /** Tag Policy and Backup Policy attachment configuration */
  readonly configuration: ITagAndBackupPolicyAccountAttachmentsConfiguration;
}

/**
 * Outcome for one account attachment operation.
 */
export type TagAndBackupPolicyAccountAttachmentStatus =
  | 'no-change'
  | 'attached'
  | 'detached'
  | 'dry-run'
  | 'deferred'
  | 'pending-create'
  | 'failed';

/**
 * Result of one direct account attachment operation.
 */
export interface ITagAndBackupPolicyAccountAttachmentResult {
  /** Target AWS account ID */
  readonly accountId: string;
  /** Attachment operation evaluated for the account */
  readonly operation: 'attach' | 'detach';
  /**
   * Outcome of the attachment operation.
   *
   * `deferred` means the safety gate intentionally retained current coverage,
   * while `pending-create` means Organizations CDK must create the policy
   * before the attachment can be applied.
   */
  readonly status: TagAndBackupPolicyAccountAttachmentStatus;
  /** Human-readable operation summary */
  readonly message: string;
  /** Error details when the operation failed */
  readonly error?: {
    /** Error class or stable module error name */
    readonly name: string;
    /** Error detail suitable for logs and module output */
    readonly message: string;
  };
}

/**
 * Aggregated direct-account attachment result for one policy.
 */
export interface ITagAndBackupPolicyAccountAttachmentPolicyResult {
  /** Exact Organizations policy name */
  readonly policyName: string;
  /** Organizations policy type */
  readonly policyType: TagAndBackupPolicyType;
  /** Organizations policy ID when discovery succeeded */
  readonly policyId?: string;
  /**
   * Aggregated outcome across the policy's direct account targets.
   *
   * `pending-create` is a non-failing approval dry-run state for work expected
   * from the Organizations CDK deployment.
   * `deferred` means destructive operations were retained by the global
   * add-before-remove safety gate.
   */
  readonly status: 'no-change' | 'reconciled' | 'dry-run' | 'deferred' | 'pending-create' | 'failed';
  /** Per-account attachment outcomes */
  readonly accountResults: ReadonlyArray<ITagAndBackupPolicyAccountAttachmentResult>;
  /**
   * Stable-sorted live direct account IDs outside the current desired configuration and previous LZA ownership.
   *
   * These attachments are preserved and are not represented as planned attachment changes.
   */
  readonly unmanagedAccountIds: ReadonlyArray<string>;
  /** Human-readable policy reconciliation summary */
  readonly message: string;
  /** Error details when policy reconciliation failed */
  readonly error?: {
    /** Error class or stable module error name */
    readonly name: string;
    /** Error detail suitable for logs and module output */
    readonly message: string;
  };
}

/**
 * Structured response payload for direct account policy attachment reconciliation.
 */
export interface ITagAndBackupPolicyAccountAttachmentsModuleResponse {
  /** Reconciliation results for every configured Tag Policy and Backup Policy */
  readonly perPolicyResults: ReadonlyArray<ITagAndBackupPolicyAccountAttachmentPolicyResult>;
  /**
   * Complete resource IDs owned by the successful execution.
   *
   * Omitted from failed responses so a retry cannot use partial results to authorize detachments.
   */
  readonly ownedResources?: ReadonlyArray<string>;
}

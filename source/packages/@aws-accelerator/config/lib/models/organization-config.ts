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

import * as t from '../common/types';

/**
 * *{@link OrganizationConfig} / {@link OrganizationalUnitConfig}*
 *
 * @description
 * AWS Organizational Unit (OU) configuration
 *
 * @example
 * ```
 * organizationalUnits:
 *   - name: Sandbox
 *   - name: Suspended
 *     ignore: true
 * ```
 */
export interface IOrganizationalUnitConfig {
  /**
   * The name and nested path that you want to assign to the OU.
   * When referring to OU's in the other configuration files ensure
   * that the name matches what has been provided here.
   * For example if you wanted an OU directly off of root just supply the OU name.
   * Always configure all of the OUs in the path.
   * A nested OU configuration would be like this
   * - name: Sandbox
   * - name: Sandbox/Pipeline
   * - name: Sandbox/Development
   * - name: Sandbox/Development/Application1
   */
  readonly name: t.NonEmptyString;
  /**
   * Optional property used to ignore organizational unit and
   * the associated accounts
   * Default value is false
   */
  readonly ignore?: boolean;
}

/**
 * *{@link OrganizationConfig} / {@link OrganizationalUnitIdConfig}
 *
 * @description
 * Organizational unit id configuration
 *
 * @example
 * ```
 * organizationalUnitIds:
 *   - name: Sandbox
 *     id: o-abc123
 *     arn: <ARN_of_OU>
 * ```
 */
export interface IOrganizationalUnitIdConfig {
  /**
   * A name for the OU
   */
  readonly name: t.NonEmptyString;
  /**
   * OU id
   */
  readonly id: t.NonEmptyString;
  /**
   * OU arn
   */
  readonly arn: t.NonEmptyString;
}

/**
 * *{@link OrganizationConfig} / {@link QuarantineNewAccountsConfig}*
 *
 * @description
 * Quarantine SCP application configuration
 *
 * @example
 * ```
 * quarantineNewAccounts:
 *   enable: true
 *   scpPolicyName: QuarantineAccounts
 * ```
 */
export interface IQuarantineNewAccountsConfig {
  /**
   * Indicates where or not a Quarantine policy is applied
   * when new accounts are created. If enabled all accounts created by
   * any means will have the configured policy applied.
   */
  readonly enable: boolean;
  /**
   * The policy to apply to new accounts. This value must exist
   * if the feature is enabled. The name must also match
   * a policy that is defined in the serviceControlPolicy section.
   */
  readonly scpPolicyName?: t.NonEmptyString;
}

/**
 * *{@link OrganizationConfig} / {@link ServiceControlPolicyConfig}*
 *
 * @description
 * Service control policy configuration
 *
 * @example
 * ```
 * serviceControlPolicies:
 *   - name: QuarantineAccounts
 *     description: Quarantine accounts
 *     policy: path/to/policy.json
 *     type: customerManaged
 *     deploymentTargets:
 *       organizationalUnits: []
 * ```
 */
export interface IServiceControlPolicyConfig {
  /**
   * The friendly name to assign to the policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * A description to assign to the policy.
   */
  readonly description: t.NonEmptyString;
  /**
   * Service control definition json file. This file must be present in config repository
   */
  readonly policy: t.NonEmptyString;
  /**
   * Kind of service control policy
   */
  readonly type: 'awsManaged' | 'customerManaged';
  /**
   * Service control policy deployment targets
   */
  readonly strategy?: 'deny-list' | 'allow-list';
  /**
   * Service control policy strategy.
   * https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_strategies.html
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link OrganizationConfig} / {@link TaggingPolicyConfig}*
 *
 * @description
 * Organizations tag policy.
 *
 * Tag policies help you standardize tags on all tagged resources across your organization.
 * You can use tag policies to define tag keys (including how they should be capitalized) and their allowed values.
 *
 * @example
 * ```
 * taggingPolicies:
 *   - name: TagPolicy
 *     description: Organization Tagging Policy
 *     policy: tagging-policies/org-tag-policy.json
 *     deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export interface ITaggingPolicyConfig {
  /**
   * The friendly name to assign to the policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * A description to assign to the policy.
   */
  readonly description: t.NonEmptyString;
  /**
   * Tagging policy definition json file. This file must be present in config repository
   */
  readonly policy: t.NonEmptyString;
  /**
   * Tagging policy deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link OrganizationConfig} / {@link TaggingPolicyConfig}*
 *
 * @description
 * Chatbot policy.
 *
 * Chatbot policies allow you to control access to an organization's accounts
 * from chat applications such as Slack and Microsoft Teams.
 *
 * @example
 * ```
 * chatbotPolicies:
 *   - name: ChatbotPolicy
 *     description: Organization Chatbot Policy
 *     policy: chatbot-policies/org-chatbot-policy.json
 *     deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export interface IChatbotPolicyConfig {
  /**
   * The friendly name to assign to the policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * A description to assign to the policy.
   */
  readonly description: t.NonEmptyString;
  /**
   * Chatbot policy definition json file. This file must be present in config repository
   */
  readonly policy: t.NonEmptyString;
  /**
   * Chatbot policy deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link OrganizationConfig} / {@link BackupPolicyConfig}*
 *
 * @description
 * Organization backup policy
 *
 * Backup policies enable you to deploy organization-wide backup plans to help ensure compliance across your organization's accounts.
 * Using policies helps ensure consistency in how you implement your backup plans
 *
 * @example
 * ```
 * backupPolicies:
 *   - name: BackupPolicy
 *     description: Organization Backup Policy
 *     policy: backup-policies/org-backup-policies.json
 *     deploymentTargets:
 *         organizationalUnits:
 *           - Root
 * ```
 */
export interface IBackupPolicyConfig {
  /**
   * The friendly name to assign to the policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * A description to assign to the policy.
   */
  readonly description: t.NonEmptyString;
  /**
   * Backup policy definition json file. This file must be present in config repository
   */
  readonly policy: t.NonEmptyString;
  /**
   * Backup policy deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * Organization configuration
 */
export interface IOrganizationConfig {
  /**
   * Indicates whether AWS Organization enabled.
   *
   */
  readonly enable: boolean;
  /**
   * A Record of Organizational Unit configurations
   *
   * @see OrganizationalUnitConfig
   *
   * To create Security and Infrastructure OU in root , you need to provide following values for this parameter.
   * Nested OU's start at root and configure all of the ou's in the path
   *
   * @example
   * ```
   * organizationalUnits:
   *   - name: Security
   *   - name: Infrastructure
   *   - name: Sandbox
   *   - name: Sandbox/Pipeline
   *   - name: Sandbox/Development
   *   - name: Sandbox/Development/Application1
   * ```
   */
  readonly organizationalUnits: IOrganizationalUnitConfig[];
  /**
   * Optionally provide a list of Organizational Unit IDs to bypass the usage of the
   * AWS Organizations Client lookup. This is not a readonly member since we
   * will initialize it with values if it is not provided
   */
  readonly organizationalUnitIds?: IOrganizationalUnitIdConfig[];
  /**
   * A record of Quarantine New Accounts configuration
   * @see QuarantineNewAccountsConfig
   */
  readonly quarantineNewAccounts?: IQuarantineNewAccountsConfig;
  /**
   * A Record of Service Control Policy configurations
   *
   * @see ServiceControlPolicyConfig
   *
   * To create service control policy named DenyDeleteVpcFlowLogs from service-control-policies/deny-delete-vpc-flow-logs.json file in config repository, you need to provide following values for this parameter.
   *
   * @example
   * ```
   * serviceControlPolicies:
   *   - name: DenyDeleteVpcFlowLogs
   *     description: >
   *       This SCP prevents users or roles in any affected account from deleting
   *       Amazon Elastic Compute Cloud (Amazon EC2) flow logs or CloudWatch log
   *       groups or log streams.
   *     policy: service-control-policies/deny-delete-vpc-flow-logs.json
   *     type: customerManaged
   *     strategy: deny-list # defines SCP strategy - deny-list or allow-list. See https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_strategies.html
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Security
   * ```
   */
  readonly serviceControlPolicies: IServiceControlPolicyConfig[];
  /**
   * A Record of Tagging Policy configurations
   *
   * @see TaggingPolicyConfig
   *
   * To create tagging policy named TagPolicy from tagging-policies/org-tag-policy.json file in config repository, you need to provide following values for this parameter.
   *
   * @example
   * ```
   * taggingPolicies:
   *   - name: TagPolicy
   *     description: Organization Tagging Policy
   *     policy: tagging-policies/org-tag-policy.json
   *     deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   */
  readonly taggingPolicies: ITaggingPolicyConfig[];
  /**
   * A list of Chatbot Policy configurations
   *
   * @see ChatbotPolicyConfig
   *
   * To create chatbot policy named ChatbotPolicy from chatbot-policies/org-chatbot-policy.json file in config repository, you need to provide following values for this parameter.
   *
   * @example
   * ```
   * chatbotPolicies:
   *   - name: ChatbotPolicy
   *     description: Organization Chatbot Policy
   *     policy: chatbot-policies/org-chatbot-policy.json
   *     deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   */
  readonly chatbotPolicies?: IChatbotPolicyConfig[];
  /**
   * A Record of Backup Policy configurations
   *
   * @see BackupPolicyConfig
   *
   * To create backup policy named BackupPolicy from backup-policies/org-backup-policies.json file in config repository, you need to provide following values for this parameter.
   *
   * @example
   * ```
   * backupPolicies:
   *   - name: BackupPolicy
   *     description: Organization Backup Policy
   *     policy: backup-policies/org-backup-policies.json
   *     deploymentTargets:
   *         organizationalUnits:
   *           - Root
   * ```
   */
  readonly backupPolicies: IBackupPolicyConfig[];
}

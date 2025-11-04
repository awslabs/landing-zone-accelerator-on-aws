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
import { OrganizationalUnit, Root } from '@aws-sdk/client-organizations';

/**
 * *{@link OrganizationConfig} / {@link OrganizationalUnitConfig}*
 *
 * @description
 * Configuration for defining organizational units within your AWS organization structure.
 * Organizational units provide hierarchical grouping of accounts and enable targeted application of governance policies.
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
   * Name and hierarchical path for the organizational unit.
   * Supports nested structures using forward slash notation (e.g., "Sandbox/Development/Application1").
   * This name is used as a reference in other configuration sections.
   * Always configure all of the OUs in the path.
   *
   * A nested OU configuration would be like this
   * - name: Sandbox
   * - name: Sandbox/Pipeline
   * - name: Sandbox/Development
   * - name: Sandbox/Development/Application1
   */
  readonly name: t.NonEmptyString;
  /**
   * When set to true, excludes this organizational unit and its associated accounts from processing.
   * Defaults to false if not specified.
   */
  readonly ignore?: boolean;
}

/**
 * *{@link OrganizationConfig} / {@link OrganizationalUnitIdConfig}
 *
 * @description
 * Configuration for mapping organizational unit names to their AWS identifiers.
 * Provides a way to bypass AWS Organizations API lookups by explicitly defining OU IDs and ARNs.
 *
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
   * The logical name that identifies the organizational unit.
   * Used as a reference key for mapping to the corresponding OU ID and ARN.
   */
  readonly name: t.NonEmptyString;
  /**
   * AWS Organizations unique identifier for the organizational unit.
   */
  readonly id: t.NonEmptyString;
  /**
   * Amazon Resource Name (ARN) of the organizational unit.
   */
  readonly arn: t.NonEmptyString;
  /**
   * Optional AWS Organizations API response data.
   * Contains the raw response from the Organizations service.
   */
  readonly orgsApiResponse?: OrganizationalUnit | Root;
}

/**
 * *{@link OrganizationConfig} / {@link QuarantineNewAccountsConfig}*
 *
 * @description
 * Configuration for automatically applying quarantine policies to newly created accounts.
 * When enabled, applies a specified Service Control Policy to all new accounts for security isolation until proper setup is completed.
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
   * Controls whether quarantine policies are automatically applied to newly created accounts.
   * When enabled, all accounts created by any means will have the specified SCP applied for security isolation.
   */
  readonly enable: boolean;
  /**
   * Name of the Service Control Policy to apply to new accounts for quarantine purposes.
   * This value is required when quarantine is enabled and must match a policy defined in the serviceControlPolicies section.
   */
  readonly scpPolicyName?: t.NonEmptyString;
}
/**
 * *{@link OrganizationConfig} / {@link DeclarativePolicyConfig}*
 *
 * @description
 * Configuration structure for declarative policies that manage AWS service settings.
 *
 * @example
 * ```
 * declarativePolicies:
 *   - name: DeclarativePolicy
 *     description: Declarative Policy Controls
 *     policy: path/to/declarative-policy.json
 *     deploymentTargets:
 *       organizationalUnits: []
 * ```
 */
export interface IDeclarativePolicyConfig {
  /**
   * Unique identifier for the declarative policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable description explaining what AWS service settings this policy manages.
   * Helps administrators understand the policy's purpose and scope.
   */
  readonly description: t.NonEmptyString;
  /**
   * Path to the JSON file containing the declarative policy definition.
   * File must exist in the configuration repository and define the desired AWS service states.
   */
  readonly policy: t.NonEmptyString;
  /**
   * Specifies which organizational units or accounts this declarative policy will be applied to.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}
/**
 * *{@link OrganizationConfig} / {@link ResourceControlPolicyConfig}*
 *
 * @description
 * Configuration structure for resource control policies that establish data perimeters and control resource access.
 *
 * @example
 * ```
 * resourceControlPolicies:
 *   - name: DataPerimeterControls
 *     description: Data Perimeter Controls
 *     policy: path/to/data-perimeter.json
 *     deploymentTargets:
 *       organizationalUnits: []
 * ```
 */
export interface IResourceControlPolicyConfig {
  /**
   * Unique identifier for the resource control policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable description explaining what data perimeter controls this policy enforces.
   * Helps administrators understand the policy's security purpose and scope.
   */
  readonly description: t.NonEmptyString;
  /**
   * Path to the JSON file containing the resource control policy definition.
   * File must exist in the configuration repository and define resource access restrictions.
   */
  readonly policy: t.NonEmptyString;
  /**
   * Defines how the resource control policy is evaluated - either deny-list (default) or allow-list.
   * Deny-list blocks specified resources, allow-list only permits specified resources.
   * https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps_evaluation.html
   */
  readonly strategy?: 'deny-list' | 'allow-list';
  /**
   * Specifies which organizational units this resource control policy will be applied to.
   * Determines the scope of data perimeter enforcement.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}
/**
 * *{@link OrganizationConfig} / {@link ServiceControlPolicyConfig}*
 *
 * @description
 * Configuration structure for service control policies that define permission guardrails for AWS accounts.
 * SCPs help establish security boundaries by controlling what actions users and roles can perform.
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
   * Unique identifier for the service control policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable description explaining what permissions this policy controls.
   * Helps administrators understand the policy's security purpose and scope.
   */
  readonly description: t.NonEmptyString;
  /**
   * Path to the JSON file containing the service control policy definition.
   * File must exist in the configuration repository and define permission restrictions.
   */
  readonly policy: t.NonEmptyString;
  /**
   * Specifies whether this is an AWS-managed or customer-managed policy.
   * AWS-managed policies are predefined by AWS, customer-managed policies are custom.
   */
  readonly type: 'awsManaged' | 'customerManaged';
  /**
   * Defines how the service control policy is evaluated - either deny-list (default) or allow-list.
   * Deny-list blocks specified actions, allow-list only permits specified actions.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_strategies.html
   */
  readonly strategy?: 'deny-list' | 'allow-list';
  /**
   * Specifies which organizational units this service control policy will be applied to.
   * Determines the scope of permission enforcement.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link OrganizationConfig} / {@link ITaggingPolicyConfig}*
 *
 * @description
 * Configuration structure for tagging policies that enforce consistent tag standards across your organization.
 * Tagging policies help standardize tag keys, values, and capitalization on all tagged resources and define what values are allowed.
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
   * Unique identifier for the tagging policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable description explaining what tagging standards this policy enforces.
   * Helps administrators understand the policy's compliance and governance purpose.
   */
  readonly description: t.NonEmptyString;
  /**
   * Path to the JSON file containing the tagging policy definition.
   * File must exist in the configuration repository and define required tags and allowed values.
   */
  readonly policy: t.NonEmptyString;
  /**
   * Specifies which organizational units this tagging policy will be applied to.
   * Determines the scope of tag standardization enforcement.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link OrganizationConfig} / {@link IChatbotPolicyConfig}*
 *
 * @description
 * Configuration structure for chatbot policies that control AWS account access from chat applications.
 * Chatbot policies help manage permissions and security for integrations with Slack, Microsoft Teams, and other chat platforms.
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
   * Unique identifier for the chatbot policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable description explaining what chatbot access controls this policy enforces.
   * Helps administrators understand the policy's security and integration purpose.
   */
  readonly description: t.NonEmptyString;
  /**
   * Path to the JSON file containing the chatbot policy definition.
   * File must exist in the configuration repository and define chat application access permissions.
   */
  readonly policy: t.NonEmptyString;
  /**
   * Specifies which organizational units this chatbot policy will be applied to.
   * Determines the scope of chat application access control.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link OrganizationConfig} / {@link BackupPolicyConfig}*
 *
 * @description
 * Configuration structure for backup policies that enforce consistent data protection across your organization.
 * Backup policies help deploy organization-wide backup plans to ensure compliance and data recovery capabilities.
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
   * Unique identifier for the backup policy.
   * The regex pattern that is used to validate this parameter is a string of any of the characters in the ASCII character range.
   */
  readonly name: t.NonEmptyString;
  /**
   * Human-readable description explaining what backup requirements this policy enforces.
   * Helps administrators understand the policy's data protection and compliance purpose.
   */
  readonly description: t.NonEmptyString;
  /**
   * Path to the JSON file containing the backup policy definition.
   * File must exist in the configuration repository and define backup plans and schedules.
   */
  readonly policy: t.NonEmptyString;
  /**
   * Specifies which organizational units this backup policy will be applied to.
   * Determines the scope of backup requirement enforcement.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * Organization configuration
 *
 * @category Organization Configuration
 */
export interface IOrganizationConfig {
  /**
   * Declarative policy configurations that manage AWS service settings across organizational units.
   * The policy content is loaded from a JSON file from the path specified.
   * File must exist in the configuration repository.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_declarative.html
   *
   * @example
   * ```
   * declarativePolicies:
   *   - name: ResrictHttpsConnection
   *     description: >
   *       This policy restricts making AMIs public and enable serial console access
   *     policy: declarative-policies/ec2-settings.json
   *     type: customerManaged
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Infrastructure
   * ```
   */
  readonly declarativePolicies?: IDeclarativePolicyConfig[];
  /**
   * Controls whether AWS Organizations features are enabled for the management account.
   * When set to true, enables the organizational structure and policies defined in this configuration.
   *
   */
  readonly enable: boolean;
  /**
   * List of Organizational Units to be created or managed. Supports nested organizational unit structures using forward slash notation.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous.html
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
   * will initialize it with values if it is not provided.
   */
  readonly organizationalUnitIds?: IOrganizationalUnitIdConfig[];
  /**
   * Configuration for automatically applying quarantine policies to newly created accounts.
   * When enabled, applies a specified Service Control Policy to all new accounts for security isolation.
   */
  readonly quarantineNewAccounts?: IQuarantineNewAccountsConfig;
  /**
   * Resource Control Policy configurations for controlling access to AWS resources.
   * RCPs help establish data perimeters and restrict resource access patterns.
   * The policy content is loaded from a JSON file from the path specified and deployed to the specified organizational units.
   * File must exist in the configuration repository.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps.html
   *
   * @example
   * ```
   * resourceControlPolicies:
   *   - name: ResrictHttpsConnection
   *     description: >
   *       This RCP restricts access to only HTTPS connections to your resources.
   *     policy: resource-control-policies/restrict-https-connections.json
   *     type: customerManaged
   *     strategy: deny-list # defines RCP strategy - deny-list or allow-list. See https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_rcps_evaluation.html#how_rcps_deny
   *     deploymentTargets:
   *       organizationalUnits:
   *         - Security
   * ```
   */
  readonly resourceControlPolicies?: IResourceControlPolicyConfig[];
  /**
   * Service Control Policy configurations that define maximum permissions for users and roles.
   * SCPs act as guardrails to prevent certain actions.
   * The policy content is loaded from a JSON file from the path specified and deployed to the specified organizational units.
   * File must exist in the configuration repository.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html
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
   * Tagging policy configurations that standardize tags across resources in organizational units.
   * The policy content is loaded from a JSON file from the path specified and deployed to the specified organizational units.
   * File must exist in the configuration repository.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_tag-policies.html
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
   * Chat applications policy configurations that control access to organization accounts from chat applications.
   * These policies enforce which chat applications can be used and restrict access to specific workspaces and channels.
   * The policy content is loaded from a JSON file from the path specified and deployed to the specified organizational units.
   * File must exist in the configuration repository.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_chatbot.html
   *
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
   * Backup policy configurations that enforce organization-wide backup requirements across organizational units.
   * These policies ensure consistent backup strategies and compliance across accounts.
   * The policy content is loaded from a JSON file from the path specified and deployed to the specified organizational units.
   * File must exist in the configuration repository.
   *
   * @see https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_backup.html
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

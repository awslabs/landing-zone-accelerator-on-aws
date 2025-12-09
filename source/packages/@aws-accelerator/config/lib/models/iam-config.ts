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
 * *{@link IamConfig} / {@link PolicySetConfig} / {@link PolicyConfig}*
 *
 * @description
 * Defines an AWS IAM Customer managed policy that will be created and managed by the accelerator.
 * IAM managed policies are standalone identity-based policies that you can attach to multiple
 * users, groups, or roles in your AWS account. Unlike inline policies, managed policies have
 * their own Amazon Resource Name (ARN) and can be versioned.
 *
 * The policy document content is read from a JSON file in your configuration repository,
 * allowing you to define complex permissions using standard IAM policy syntax.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html | Managed Policies vs Inline Policies}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html | IAM Policy Elements Reference}
 *
 * @example
 * ```
 * - name: Default-Boundary-Policy
 *   policy: path/to/policy.json
 * ```
 */
export interface IPolicyConfig {
  /**
   * The logical name for this managed policy resource. This name will be used as the policy name in AWS IAM.
   *
   * @remarks
   * This name must be unique within the deployment target scope. The name can contain alphanumeric
   * characters and the following characters: +=,.@-_
   */
  readonly name: t.NonEmptyString;
  /**
   * Path to a JSON file containing the IAM policy document.
   *
   * @remarks
   * The JSON file must contain a valid IAM policy document that defines the permissions for this
   * managed policy. The policy document uses standard IAM policy syntax with statements that
   * specify allowed or denied actions on AWS resources.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html | IAM Policy Elements Reference}
   */
  readonly policy: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link SamlProviderConfig}*
 *
 * @description
 * Defines a Security Assertion Markup Language (SAML) 2.0 identity provider configuration for AWS IAM.
 * SAML providers enable federated access to AWS resources by allowing users to authenticate with
 * external identity providers (such as Microsoft Active Directory, Okta, or Azure AD)
 * and assume AWS IAM roles without needing separate AWS credentials.
 *
 * This configuration creates an IAM SAML identity provider that can be referenced in role trust
 * policies to enable single sign-on (SSO) access to AWS.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_saml.html | Creating SAML Identity Providers}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_enable-console-saml.html | Enabling SAML 2.0 Federated Users}
 *
 * @example
 * ```
 * providers:
 *   - name: accelerator-provider
 *     metadataDocument: path/to/metadata.xml
 * ```
 */
export interface ISamlProviderConfig {
  /**
   * The logical name for this SAML identity provider. This name will be used to reference
   * the provider in IAM role trust policies and other AWS configurations.
   *
   * @remarks
   * The name must be between 1 and 128 characters and can contain alphanumeric characters
   * and the following characters: _+=,.@-
   *
   * @default a CloudFormation generated name
   */
  readonly name: t.NonEmptyString;
  /**
   * The SAML metadata document XML file containing the identity provider's configuration.
   *
   * @remarks
   * This XML file must be present in your configuration repository and contain valid SAML 2.0
   * metadata as provided by your identity provider. The metadata includes certificates, endpoints,
   * and other configuration details needed for SAML federation.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_saml.html#saml_metadata-document | SAML Metadata Document Requirements}
   */
  readonly metadataDocument: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link UserSetConfig} / {@link UserConfig}*
 *
 * @description
 * Defines an AWS IAM user configuration. IAM users are identities with long-term credentials
 * that can be used to access AWS services and resources. Each user has a unique name within
 * the AWS account and can be assigned to groups, have policies attached directly, and optionally
 * have AWS Management Console access with a password.
 *
 * IAM users are typically used for individual people or applications that need programmatic
 * access to AWS services with either the AWS Console, AWS CLI or AWS SDK. For console access,
 * users can be granted a password to sign in to the AWS Management Console.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users.html | IAM Users}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users_create.html | Creating IAM Users}
 *
 * @example
 * ```
 * - username: accelerator-user
 *   boundaryPolicy: Default-Boundary-Policy
 *   group: Admins
 * ```
 */
export interface IUserConfig {
  /**
   * The name for the IAM user. This will be the user's sign-in name for the AWS Management Console
   * and the name used in API calls.
   *
   * @remarks
   * The username must be unique within the AWS account and can contain alphanumeric characters
   * and the following characters: +=,.@-_
   *
   * Length must be between 1 and 64 characters.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html#reference_iam-quotas-names | IAM Name Requirements}
   */
  readonly username: t.NonEmptyString;
  /**
   * The name of the IAM group to add this user to. The group must be defined in the same
   * deployment target scope as this user.
   *
   * @remarks
   * Groups provide a way to specify permissions for multiple users. When a user is added to a group,
   * the user inherits all the permissions assigned to that group through attached policies.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_groups.html | IAM Groups}
   */
  readonly group: t.NonEmptyString;
  /**
   * The name of an IAM managed policy to use as a permissions boundary for this user.
   *
   * @remarks
   * A permissions boundary is an advanced feature that sets the maximum permissions that an
   * identity-based policy can grant to an IAM entity (user or role). The entity's permissions
   * boundary allows it to perform only the actions that are allowed by both its identity-based
   * policies and its permissions boundaries.
   *
   * The policy must be defined in the policySets configuration and deployed to the same target
   * accounts as this user.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | Permissions Boundaries}
   */
  readonly boundaryPolicy?: t.NonEmptyString;

  /**
   * Controls whether the user can access the AWS Management Console with a password.
   *
   * @remarks
   * When set to true, the user will not have console access and no password will be generated.
   * When set to false or undefined, a password will be generated and stored in AWS Secrets Manager
   * for console access.
   *
   * The generated password is stored in Secrets Manager with the path:
   * `/{accelerator-prefix}/iam-user/{username}`
   *
   * @default false (console access enabled)
   */
  readonly disableConsoleAccess?: boolean;
}

/**
 * *{@link IamConfig} / {@link UserSetConfig}*
 *
 * @description
 * Defines a collection of IAM users to be deployed to specific AWS accounts or organizational units.
 * User sets provide a way to consistently deploy the same set of users across multiple accounts
 * in your AWS organization, ensuring standardized access patterns and user management.
 *
 * This is particularly useful for creating break-glass users, service accounts, or other
 * administrative users that need to exist across multiple accounts with consistent configurations.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users.html | IAM Users}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-individual-users | Creating Individual Users}
 *
 * ```
 * userSets:
 *   - deploymentTargets:
 *       accounts:
 *         - Management
 *     users:
 *       - username: accelerator-user
 *         boundaryPolicy: Default-Boundary-Policy
 *         group: Admins
 * ```
 */
export interface IUserSetConfig {
  /**
   * Specifies the AWS accounts and/or organizational units where these users will be created.
   *
   * @remarks
   * Users will be created in all accounts that match the deployment targets. This allows you to
   * ensure consistent user access across your organization.
   *
   * You can target specific accounts by name (as defined in accounts-config.yaml) or target
   * entire organizational units to automatically include all accounts in those OUs.
   *
   * @see {@link https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_accounts.html | Managing AWS Accounts}
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * List of IAM users to create in the targeted accounts.
   *
   * @remarks
   * Each user will be created with the same configuration in all targeted accounts. Users will
   * be added to the specified groups (which must also be deployed to the same accounts) and
   * will inherit the permissions of those groups.
   *
   * @see {@link IamConfig} / {@link UserSetConfig} / {@link UserConfig}
   */
  readonly users: IUserConfig[];
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig} / {@link CustomerManagedPolicyReferenceConfig}*
 *
 * @description
 * Defines a reference to a customer managed IAM policy to use as a permissions boundary for
 * Identity Center permission sets. This configuration specifies the name and path of an existing
 * customer managed policy that will limit the maximum permissions granted by the permission set.
 *
 * @example
 * ```
 * permissionsBoundary:
      customerManagedPolicy:
        name: AcceleratorManagedPolicy
        path: /
 * ```
 */
export interface ICustomerManagedPolicyReferenceConfig {
  /**
   * The name of the customer managed IAM policy to use as a permissions boundary.
   *
   * @remarks
   * This must be the exact name of an existing customer managed policy in each AWS account
   * where the permission set will be assigned. The policy defines the maximum permissions
   * that the permission set can grant.
   *
   * If you want to reference a policy created by the Landing Zone Accelerator, specify the
   * policy name from the policySets configuration in your iam-config.yaml file. The accelerator
   * will ensure the policy exists before creating the permission set.
   *
   * Policy names are case-sensitive and must match exactly.
   *
   * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-sso-permissionset-customermanagedpolicyreference.html#cfn-sso-permissionset-customermanagedpolicyreference-name | CustomerManagedPolicyReference Name}
   */
  readonly name: t.NonEmptyString;
  /**
   * The path to the IAM policy that you have configured in each account where you want to deploy your permission set.
   *
   * @remarks The default is `/` . For more information, see [Friendly names and paths](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-friendly-names) in the *IAM User Guide*
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-friendly-names | CustomerManagedPolicyReference path}
   */
  readonly path?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig}*
 *
 * @description
 * Defines a permissions boundary configuration for Identity Center permission sets. A permissions
 * boundary is an advanced IAM feature that sets the maximum permissions that an identity-based
 * policy can grant to an IAM entity. When applied to a permission set, it limits the effective
 * permissions to the intersection of the permission set's policies and the permissions boundary.
 *
 * Permissions boundaries are useful for delegating permission management while maintaining
 * security guardrails. They allow you to grant users the ability to create and manage IAM
 * entities while ensuring those entities cannot exceed certain permission limits.
 *
 * Specify either customerManagedPolicy to use the name and path of a customer managed policy,
 * or managedPolicy to use the ARN of an AWS managed policy.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | Permissions Boundaries}
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html | Permission Sets}
 *
 * @example
 * ```
 *  permissionsBoundary:
 *    customerManagedPolicy:
 *      name: AcceleratorManagedPolicy
 *      path: /
 * ```
 */
export interface IPermissionsBoundaryConfig {
  /**
   * The name of an AWS managed policy to use as the permissions boundary.
   *
   * @remarks
   * AWS managed policies are predefined policies created and maintained by AWS.
   *
   * You can specify either the policy name or the full ARN.
   * Use this option when you want to use a standard AWS-provided permissions boundary.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_job-functions.html | AWS Managed Policies for Job Functions}
   */
  readonly awsManagedPolicyName?: t.NonEmptyString;
  /**
   * Configuration for a customer managed policy to use as the permissions boundary.
   * This specifies the name and path of a customer managed policy.
   *
   * @remarks
   * Customer managed policies provide more granular control over permissions boundaries
   * and can be customized for your specific security requirements. The policy must exist
   * in all AWS accounts where the permission set will be assigned.
   *
   * Use this option when you need custom permissions boundary logic that isn't available
   * in AWS managed policies.
   * @see {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-sso-permissionset-permissionsboundary.html#cfn-sso-permissionset-permissionsboundary-customermanagedpolicyreference | CustomerManagedPolicyReference}
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig} / {@link CustomerManagedPolicyReferenceConfig}
   */
  readonly customerManagedPolicy?: ICustomerManagedPolicyReferenceConfig;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPoliciesConfig}*
 *
 * @description
 * Defines the policy configuration for an Identity Center permission set. This configuration
 * specifies which policies will be attached to the permission set to define the permissions
 * that users will have when they assume roles created from this permission set.
 *
 * Identity Center supports multiple types of policies that can be combined to create the exact
 * permissions needed: AWS managed policies (maintained by AWS), customer managed policies
 * (maintained by you), accelerator managed policies (created by the Landing Zone Accelerator),
 * inline policies (embedded directly in the permission set), and permissions boundaries
 * (to limit maximum permissions).
 *
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html | Permission Sets}
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/howtopermissionset.html | Creating Permission Sets}
 *
 * @example
 * ```
 *     policies:
 *       awsManaged:
 *         - arn:aws:iam::aws:policy/AdministratorAccess
 *         - PowerUserAccess
 *       customerManaged:
 *         - ResourceConfigurationCollectorPolicy
 *       acceleratorManaged:
 *         - AcceleratorManagedPolicy01
 *         - AcceleratorManagedPolicy02
 *       inlinePolicy: iam-policies/sso-permissionSet1-inline-policy.json
 *       permissionsBoundary:
 *         customerManagedPolicy:
 *           name: AcceleratorManagedPolicy
 *           path: /
 *         awsManagedPolicyName: PowerUserAccess
 * ```
 */
export interface IIdentityCenterPoliciesConfig {
  /**
   * List of AWS managed policies to attach to this permission set.
   *
   * @remarks
   * AWS managed policies are predefined policies created and maintained by AWS. You can specify
   * them using either the full policy ARN or just the policy name.
   *
   * These policies are automatically updated by AWS when new services or features are released,
   * ensuring your permission sets stay current with AWS capabilities.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html#aws-managed-policies | AWS Managed Policies}
   */
  readonly awsManaged?: t.NonEmptyString[];
  /**
   * List of customer managed policy names to attach to this permission set.
   *
   * @remarks
   * These policies must already exist in the target AWS accounts where the permission set will
   * be assigned. Customer managed policies provide more granular control over permissions and
   * can be customized for your specific use cases.
   *
   * The accelerator expects these policies to be present prior to deployment and will not create them.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html#customer-managed-policies | Customer Managed Policies}
   */
  readonly customerManaged?: t.NonEmptyString[];
  /**
   * List of accelerator-managed policy names to attach to this permission set.
   *
   * @remarks
   * These are custom managed policies created by the Landing Zone Accelerator solution. The policies
   * must be defined in the policySets configuration of the iam-config.yaml file with the
   * identityCenterDependency flag set to true.
   *
   * The accelerator will create these policies before attaching them to the permission set, ensuring
   * proper dependency ordering during deployment.
   *
   * @see {@link IamConfig} / {@link PolicySetConfig}
   */
  readonly acceleratorManaged?: t.NonEmptyString[];
  /**
   * Path to a JSON file containing an inline policy to embed directly in the permission set.
   *
   * @remarks
   * Inline policies are embedded directly in the permission set and are not standalone resources.
   * The JSON file must contain a valid IAM policy document and be present in your configuration
   * repository.
   *
   * Use inline policies for permissions that are specific to this permission set and won't be
   * reused elsewhere.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html#inline-policies | Inline policy Documentation}
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/howtopermissionset.html | Creating Permission Sets}
   */
  readonly inlinePolicy?: t.NonEmptyString;
  /**
   * Permissions boundary configuration to set the maximum permissions for this permission set.
   *
   * @remarks
   * A permissions boundary defines the maximum permissions that the permission set can have.
   * The effective permissions are the intersection of the permission set's policies and its
   * permissions boundary.
   *
   * You can specify either an AWS managed policy or a customer managed policy as the boundary.
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig}
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | Permissions Boundaries}
   */
  readonly permissionsBoundary?: IPermissionsBoundaryConfig;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPermissionSetConfig}*
 *
 * @description
 * Defines an AWS Identity Center permission set configuration. Permission sets are templates that
 * define a collection of policies and permissions that determine what users and groups can access
 * within AWS accounts. They act as a bridge between your identity source (users and groups) and
 * AWS accounts, defining what level of access identities have when they access AWS resources.
 *
 * Permission sets are assigned to users or groups for specific AWS accounts, creating the actual
 * access permissions. When users sign in through Identity Center, they can assume roles based on
 * their permission set assignments to access AWS resources.
 *
 * Each permission set can include AWS managed policies, customer managed policies, inline policies,
 * and permissions boundaries to provide fine-grained access control.
 *
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html | Permission Sets}
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/howitworks.html | How Identity Center Works}
 *
 * @example
 * ```
 * name: identityCenter1
 * identityCenterPermissionSets:
 *   - name: PermissionSet1
 *     policies:
 *       awsManaged:
 *         - arn:aws:iam::aws:policy/AdministratorAccess
 *         - PowerUserAccess
 *       customerManaged:
 *         - ResourceConfigurationCollectorPolicy
 *       acceleratorManaged:
 *         - AcceleratorManagedPolicy01
 *         - AcceleratorManagedPolicy02
 *       inlinePolicy: iam-policies/sso-permissionSet1-inline-policy.json
 *       permissionsBoundary:
 *         customerManagedPolicy:
 *           name: AcceleratorManagedPolicy
 *           path: /
 *         awsManagedPolicyName: PowerUserAccess
 *     sessionDuration: 60
 * ```
 */
export interface IIdentityCenterPermissionSetConfig {
  /**
   * The name for this permission set configuration. This name will be used to reference the permission
   * set in Identity Center assignments and will be visible to users in the AWS access portal.
   *
   * @remarks
   * The permission set name must be unique within the Identity Center instance and can contain
   * alphanumeric characters and the following characters: +=,.@-_
   *
   * Length must be between 1 and 32 characters.
   */
  readonly name: t.NonEmptyString;
  /**
   * The policy config that define the permissions for this permission set.
   *
   * @remarks
   * Policies determine what actions users can perform when they assume roles created from this
   * permission set. You can combine multiple types of policies to create the exact permissions
   * needed for your use case.
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPoliciesConfig}
   */
  readonly policies?: IIdentityCenterPoliciesConfig;
  /**
   * The length of time (in minutes) that users can stay signed in to their AWS session.
   *
   * @remarks
   * This setting controls how long the temporary credentials issued by Identity Center remain valid.
   * After this time expires, users will need to sign in again through the Identity Center portal.
   *
   * Valid range: 15 minutes to 12 hours (720 minutes) in the ISO-8601 standard.
   *
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/howtosessionduration.html | Session Duration}
   *
   * @default 60 minutes
   */
  readonly sessionDuration?: number;

  /**
   * A human-readable description of what this permission set is intended for.
   *
   * @remarks
   * The description helps administrators and users understand the purpose and scope of the
   * permission set. This description is visible in the Identity Center console and can help
   * with governance and compliance documentation.
   *
   * Maximum length: 700 characters
   *
   * @default undefined
   */
  readonly description?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link GroupConfig} | {@link RoleConfig} / {@link PoliciesConfig}*
 *
 * @description
 * Defines the IAM policies to attach to a group or role. Policies grant permissions by defining
 * what actions are allowed or denied on which AWS resources. This configuration supports both
 * AWS managed policies (created and maintained by AWS) and customer managed policies (created
 * and maintained by you).
 *
 * AWS managed policies are standalone policies that are created and maintained by AWS. They
 * typically grant permissions for common use cases and are updated by AWS when new services
 * or features are released.
 *
 * Customer managed policies are standalone policies that you create and maintain in your AWS
 * account. They provide more precise control over permissions than AWS managed policies.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html | Managed Policies vs Inline Policies}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_job-functions.html | AWS Managed Policies for Job Functions}
 *
 * @example
 * ```
 * awsManaged:
 *   - AdministratorAccess
 * customerManaged:
 *   - PolicyName
 * ```
 */
export interface IPoliciesConfig {
  /**
   * List of AWS managed policies to attach. Values can be policy ARNs or policy names.
   *
   * @remarks
   * AWS managed policies are predefined policies created and maintained by AWS. You can specify
   * them using either:
   * - Policy name only (e.g., 'AdministratorAccess', 'PowerUserAccess')
   * - Full policy ARN (e.g., 'arn:aws:iam::aws:policy/AdministratorAccess')
   *
   * When using policy names, the accelerator will automatically construct the full ARN.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html#aws-managed-policies | AWS Managed Policies}
   */
  readonly awsManaged?: t.NonEmptyString[];
  /**
   * List of customer managed policy names to attach.
   *
   * @remarks
   * These policies must already exist in the target AWS accounts or can be defined in the
   * policySets configuration of this same iam-config.yaml file.
   *
   * Customer managed policies provide more granular control over permissions and can be
   * customized for your specific use cases.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html#customer-managed-policies | Customer Managed Policies}
   */
  readonly customerManaged?: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link GroupSetConfig} / {@link GroupConfig}*
 *
 * @description
 * Defines an AWS IAM group configuration. IAM groups are collections of IAM users that make it
 * easier to manage permissions for multiple users. Instead of attaching policies to individual
 * users, you can attach policies to groups and then add users to the appropriate groups.
 *
 * Groups provide a way to organize users and apply common permissions. When you add a user to
 * a group, the user inherits all the permissions assigned to that group through attached policies.
 * Users can belong to multiple groups and will have the combined permissions of all their groups.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_groups.html | IAM Groups}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#use-groups-for-permissions | Using Groups for Permissions}
 *
 * @example
 * ```
 * - name: Admins
 *   policies:
 *     awsManaged:
 *       - AdministratorAccess
 * ```
 */
export interface IGroupConfig {
  /**
   * The logical name for this IAM group. This name will be used as the group name in AWS IAM
   * and can be referenced when assigning users to groups.
   *
   * @remarks
   * The group name must be unique within the AWS account and can contain alphanumeric characters
   * and the following characters: +=,.@-_
   *
   * Length must be between 1 and 128 characters. For valid values, see the GroupName parameter
   * for the CreateGroup action in the IAM API Reference.
   *
   * If you specify a name, you must specify the CAPABILITY_NAMED_IAM value to acknowledge your template's capabilities.
   * For more information, see Acknowledging IAM Resources in AWS CloudFormation Templates.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html#reference_iam-quotas-names | IAM Name Requirements}
   */
  readonly name: t.NonEmptyString;
  /**
   * IAM policies to attach to this group, defining the permissions that group members will inherit.
   *
   * @remarks
   * All users added to this group will inherit the permissions defined by these policies.
   * You can attach both AWS managed policies and customer managed policies to a group.
   *
   * @see {@link IamConfig} / {@link GroupConfig} | {@link RoleConfig} / {@link PoliciesConfig}
   */
  readonly policies?: IPoliciesConfig;
}

/**
 * *{@link IamConfig} / {@link GroupSetConfig}*
 *
 * @description
 * Defines a collection of IAM groups to be deployed to specific AWS accounts or organizational units.
 * Group sets provide a way to consistently deploy the same set of groups with their associated
 * policies across multiple accounts in your AWS organization, ensuring standardized permission
 * structures and access management.
 *
 * This is particularly useful for establishing consistent organizational roles (like Administrators,
 * Developers, ReadOnly users) across all accounts in your organization with the same permissions
 * and access patterns.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_groups.html | IAM Groups}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#use-groups-for-permissions | Using Groups for Permissions}
 *
 * @example
 * ```
 * groupSets:
 *   - deploymentTargets:
 *       accounts:
 *         - Management
 *     groups:
 *       - name: Admins
 *         policies:
 *           awsManaged:
 *             - AdministratorAccess
 * ```
 */
export interface IGroupSetConfig {
  /**
   * Specifies the AWS accounts and/or organizational units where these groups will be created.
   *
   * @remarks
   * Groups will be created in all accounts that match the deployment targets. This allows you to
   * ensure consistent group structures and permissions across your organization.
   *
   * You can target specific accounts by name (as defined in accounts-config.yaml) or target
   * entire organizational units to automatically include all accounts in those OUs.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * List of IAM groups to create in the targeted accounts.
   *
   * @remarks
   * Each group will be created with the same configuration and attached policies in all targeted
   * accounts. Users can then be added to these groups to inherit the group's permissions.
   *
   * @see {@link IamConfig} / {@link GroupSetConfig} / {@link GroupConfig}
   */
  readonly groups: IGroupConfig[];
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig} / {@link AssumedByConfig}*
 *
 * @description
 * Defines the trust relationship for an IAM role by specifying which principals (entities)
 * can assume the role. The trust relationship is a key component of IAM roles that determines
 * who or what can use the role to access AWS resources.
 *
 * This configuration creates the trust policy (assume role policy) that gets attached to the
 * IAM role, allowing the specified principals to call the AWS Security Token Service (STS)
 * AssumeRole API operation.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_terms-and-concepts.html#iam-term-trust-policy | Trust Policies}
 * @see {@link https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html | AssumeRole API}
 *
 * Service principal:
 * @example
 * ```
 * - principal: ec2.amazonaws.com
 *   type: service
 * ```
 *
 * Account principals can be defined using either the account ID (with quotes), the account arn or the name assigned to the account in the accounts-config.yaml.
 *
 *
 * @example
 * ```
 * assumedBy:
 *   - type: account
 *     principal: '111111111111'
 * ```
 * @example
 * ```
 * assumedBy:
 *   - type: account
 *     principal: Audit
 * ```
 * @example
 * ```
 * assumedBy:
 *   - type: account
 *     principal: 'arn:aws:iam::111111111111:root'
 * ``
 * @example
 * ```
 * assumedBy:
 *   - type: principalArn
 *     principal: 'arn:aws:iam::111122223333:role/path/role-name'
 * ``
 * @remarks In order to use a Principal ARN in the assume role policy, the principal must exist.
 *
 */
export interface IAssumedByConfig {
  /**
   * The type of principal that can assume this role.
   *
   * @remarks
   * Valid values:
   * - `service`: AWS service principals (e.g., 'ec2.amazonaws.com', 'lambda.amazonaws.com')
   * - `account`: AWS account principals (account ID with quotes, or account ARN)
   * - `principalArn`: Specific IAM principal ARNs (users, roles, etc.)
   * - `provider`: Identity providers (SAML, OIDC providers)
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html | Principal Element}
   */
  readonly type: t.AssumedByType;
  /**
   * The principal identifier that can assume this role. The format depends on the type specified.
   *
   * @remarks
   * Format by type:
   * - `service`: Service principal name (e.g., 'ec2.amazonaws.com', 'sns.amazonaws.com')
   * - `account`: Account ID with quotes ('123456789012') or account ARN
   * - `principalArn`: Full ARN of the principal (e.g., 'arn:aws:iam::123456789012:role/MyRole')
   * - `provider`: ARN of the identity provider
   *
   */
  readonly principal?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig}*
 *
 * @description
 * Defines an AWS IAM role configuration. IAM roles are AWS identities with specific permissions
 * that can be assumed by trusted entities such as AWS services, users, or applications. Unlike
 * IAM users, roles don't have permanent credentials - instead, they provide temporary security
 * credentials when assumed.
 *
 * Roles are commonly used for cross-account access, service-to-service authentication, and
 * providing temporary access to AWS resources without embedding long-term credentials.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html | IAM Roles}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use.html | Using IAM Roles}
 *
 * @example
 * ```
 * - name: EC2-Default-SSM-AD-Role
 *   assumedBy:
 *     - principal: ec2.amazonaws.com
 *       type: service
 *   boundaryPolicy: Default-Boundary-Policy
 *   instanceProfile: true
 *   policies:
 *     awsManaged:
 *       - AmazonSSMManagedInstanceCore
 *       - AmazonSSMDirectoryServiceAccess
 *       - CloudWatchAgentServerPolicy
 * ```
 */
export interface IRoleConfig {
  /**
   * The logical name for this IAM role. This name will be used as the role name in AWS IAM
   * and can be referenced by other AWS resources and services.
   *
   * @remarks
   * The role name must be unique within the AWS account and can contain alphanumeric characters
   * and the following characters: +=,.@-_
   *
   */
  readonly name: t.NonEmptyString;
  /**
   * Specifies whether to create an EC2 instance profile for this role.
   *
   * @remarks
   * An instance profile is a container for an IAM role that you can use to pass role information
   * to an EC2 instance when the instance starts. Set this to true if the role will be used by
   * EC2 instances to access AWS services.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_switch-role-ec2_instance-profiles.html | Using Instance Profiles}
   *
   * @default false
   */
  readonly instanceProfile?: boolean;
  /**
   * List of external IDs that must be provided when assuming this role.
   *
   * @remarks
   * External IDs provide an additional layer of security when granting third parties access to
   * assume roles in your AWS account. The external ID is a secret between you and the third party
   * that must be provided when assuming the role.
   *
   * This is used when granting access to third-party services or partners.
   *
   * When specified, the assume role policy will include a condition requiring one of these external IDs:
   * ```
   * "Condition": {"StringEquals": {"sts:ExternalId": "your-external-id"}}
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html | Using External IDs}
   *
   * @example
   * ```
   * - name: Test-Arn-Role
   *   assumedBy:
   *     - type: principalArn
   *       principal: "arn:aws:iam::555555555555:user/TestUser"
   *    externalIds:
   *      - "777777777777"
   * ```
   */
  readonly externalIds?: t.NonEmptyString[];
  /**
   * List of principals that can assume this role and their trust relationship configuration.
   *
   * @remarks
   * This defines the trust policy for the role by specifying which entities can assume it.
   * At least one assumedBy configuration is required for every role.
   *
   * Multiple assumedBy entries create an OR condition in the trust policy, meaning any of the
   * specified principals can assume the role.
   *
   * @see {@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig} / {@link AssumedByConfig}
   */
  readonly assumedBy: IAssumedByConfig[];
  /**
   * IAM policies to attach to this role, providing the permissions the role will have when assumed.
   *
   * @remarks
   * Policies define what actions the role can perform on which AWS resources. You can attach
   * both AWS managed policies and customer managed policies to a role.
   *
   * @see {@link IamConfig} / {@link GroupConfig} | {@link RoleConfig} / {@link PoliciesConfig}
   */
  readonly policies?: IPoliciesConfig;
  /**
   * The name of an IAM managed policy to use as a permissions boundary for this role.
   *
   * @remarks
   * A permissions boundary sets the maximum permissions that the role can have. The effective
   * permissions for the role are the intersection of the role's identity-based policies and
   * its permissions boundary.
   *
   * The boundary policy must be defined in the policySets configuration and deployed to the
   * same target accounts as this role.
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | Permissions Boundaries}
   */
  readonly boundaryPolicy?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig}*
 *
 * @description
 * Defines a collection of IAM roles to be deployed to specific AWS accounts or organizational units.
 * Role sets provide a way to consistently deploy the same set of roles with their trust relationships
 * and permissions across multiple accounts in your AWS organization, ensuring standardized access
 * patterns for services, cross-account access, and federated users.
 *
 * This is particularly useful for creating service roles (like EC2 instance roles), cross-account
 * access roles, or federated access roles that need to exist across multiple accounts with
 * consistent configurations.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html | IAM Roles}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios.html | Common Role Scenarios}
 *
 * @example
 * ```
 * roleSets:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *     roles:
 *       - name: EC2-Default-SSM-AD-Role
 *         assumedBy:
 *           - principal: ec2.amazonaws.com
 *             type: service
 *         boundaryPolicy: Default-Boundary-Policy
 *         instanceProfile: true
 *         policies:
 *           awsManaged:
 *             - AmazonSSMManagedInstanceCore
 *             - AmazonSSMDirectoryServiceAccess
 *             - CloudWatchAgentServerPolicy
 * ```
 */
export interface IRoleSetConfig {
  /**
   * Specifies the AWS accounts and/or organizational units where these roles will be created.
   *
   * @remarks
   * Roles will be created in all accounts that match the deployment targets. This allows you to
   * ensure consistent role access patterns across your organization.
   *
   * You can target specific accounts by name (as defined in accounts-config.yaml) or target
   * entire organizational units to automatically include all accounts in those OUs.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * The path for all roles in this set.
   *
   * @remarks
   * The path is used to organize roles and can be used in IAM policies to reference groups of roles.
   * If specified, all roles in this set will be created with this path prefix.
   *
   * The path must begin and end with a forward slash (/) and can contain alphanumeric characters
   * and the following characters: +=,.@-_/
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-friendly-names | Friendly Names and Paths}
   *
   * @default / (root path)
   */
  readonly path?: t.NonEmptyString;
  /**
   * List of IAM roles to create in the targeted accounts.
   *
   * @remarks
   * Each role will be created with the same configuration, trust relationships, and attached
   * policies in all targeted accounts. This ensures consistent access patterns across your organization.
   *
   * @see {@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig}
   */
  readonly roles: IRoleConfig[];
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentPrincipalConfig}*
 *
 * @description
 * Defines a principal (user or group) for Identity Center permission set assignments. Principals
 * are the identities from your identity source that will be granted access to AWS accounts through
 * Identity Center assignments.
 *
 * This configuration allows you to specify principals by their human-readable names rather than
 * internal IDs, making the configuration more maintainable and easier to understand. The accelerator
 * will resolve these names to the appropriate internal identifiers during deployment.
 *
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/useraccess.html | User Access and Assignments}
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/users-groups-provisioning.html | Users and Groups}
 *
 * @example
 * ```
 * principals:
 *   - type: USER
 *     name: accelerator
 *   - type: GROUP
 *     name: admin
 * ```
 */
export interface IIdentityCenterAssignmentPrincipalConfig {
  /**
   * The type of principal being specified.
   *
   * @remarks
   * Valid values:
   * - `USER`: An individual user from your identity source
   * - `GROUP`: A group of users from your identity source
   *
   * When you assign a permission set to a group, all members of that group inherit the permissions
   * defined in the permission set for the target AWS accounts.
   */
  readonly type: t.NonEmptyString;
  /**
   * The name of the principal from your identity source.
   *
   * @remarks
   * This should be the display name or username of the user or group as it appears in your
   * identity source (such as Active Directory, Azure AD, or the Identity Center identity store).
   *
   * The accelerator will look up this name in your identity source to find the corresponding
   * internal ID needed for the assignment.
   *
   * For users: Use the username or email address as configured in your identity source
   * For groups: Use the group name as configured in your identity source
   */
  readonly name: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentConfig}*
 *
 * @description
 * Defines an Identity Center assignment that grants users or groups access to AWS accounts with
 * specific permissions. Assignments are the mechanism that connects your identity source (users
 * and groups) with AWS accounts and the level of access they should have (permission sets).
 *
 * When you create an assignment, Identity Center creates an IAM role in the target AWS account
 * based on the permission set configuration. Users or groups can then assume this role to access
 * AWS resources with the permissions defined in the permission set.
 *
 * Assignments can target specific AWS accounts or entire organizational units, and can be made
 * to individual users or groups of users.
 *
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/useraccess.html | User Access and Assignments}
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/howitworks.html | How Identity Center Works}
 *
 * @example
 * ```
 * identityCenterAssignments:
 *   - name: Assignment1
 *     permissionSetName: PermissionSet1
 *     principals:
 *       - type: USER
 *         name: accelerator
 *       - type: GROUP
 *         name: admin
 *     principalId: "a4e81468-1001-70f0-9c12-56a6aa967ca4"
 *     principalType: USER
 *     deploymentTargets:
 *       accounts:
 *         - LogArchive
 *   - name: Assignment2
 *     permissionSetName: PermissionSet2
 *     principals:
 *       - type: USER
 *         name: accelerator
 *       - type: GROUP
 *         name: admin
 *     principalId: "a4e81468-1001-70f0-9c12-56a6aa967ca4"
 *     principalType: GROUP
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Security
 * ```
 */
export interface IIdentityCenterAssignmentConfig {
  /**
   * The logical name for this assignment configuration.
   *
   * @remarks
   * This name is used for identification and tracking purposes within the accelerator configuration.
   * It should be descriptive of what access the assignment provides.
   *
   */
  readonly name: t.NonEmptyString;
  /**
   * The name of the permission set to assign to the principals.
   *
   * @remarks
   * The permission set must be defined in the identityCenterPermissionSets configuration of the
   * same Identity Center instance. This permission set defines what level of access the principals
   * will have in the target AWS accounts.
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPermissionSetConfig}
   */
  readonly permissionSetName: t.NonEmptyString;
  /**
   * The unique identifier of the principal (user or group) to grant access to.
   *
   * @deprecated
   * This property is deprecated and will be removed in a future version. Use the `principals`
   * property instead to specify principal names, which provides better maintainability and
   * readability.
   *
   * @remarks
   * This is the unique ID from your identity source (such as Active Directory or the Identity
   * Center identity store).
   */
  readonly principalId?: t.NonEmptyString;
  /**
   * The type of principal being granted access.
   *
   * @deprecated
   * This property is deprecated and will be removed in a future version. Use the `principals`
   * property instead to specify both principal type and name in a more maintainable format.
   *
   * @remarks
   * Valid values are 'USER' for individual users or 'GROUP' for groups of users.
   */
  readonly principalType?: t.PrincipalType;
  /**
   * List of principals (users or groups) to grant access to the specified AWS accounts.
   *
   * @remarks
   * This is the preferred way to specify principals for assignments. Each principal entry includes
   * both the type (USER or GROUP) and the name of the principal from your identity source.
   *
   * Using names instead of IDs makes the configuration more readable and maintainable. The
   * accelerator will resolve the names to the appropriate IDs during deployment.
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentPrincipalConfig}
   *
   * @example
   * ```
   * principals:
   *   - type: USER
   *     name: accelerator
   *   - type: GROUP
   *     name: admin
   * ```
   */
  readonly principals?: IIdentityCenterAssignmentPrincipalConfig[];
  /**
   * Specifies the AWS accounts and/or organizational units where this assignment will be created.
   *
   * @remarks
   * The assignment will grant the specified principals access to all accounts that match the
   * deployment targets. This allows you to efficiently grant access across multiple accounts
   * or entire organizational units.
   *
   * You can target specific accounts by name (as defined in accounts-config.yaml) or target
   * entire organizational units to automatically include all accounts in those OUs.
   */
  readonly deploymentTargets: t.IDeploymentTargets;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig}*
 *
 * @description
 * Defines AWS Identity Center (formerly known as AWS Single Sign-On (SSO) Identity Center) configuration
 * for centralized access management across your AWS organization.
 * Identity Center enables you to create or connect your workforce identities and
 * centrally manage their access to multiple AWS accounts and applications.
 *
 * Identity Center provides a single place where you can create users and groups, or connect to
 * your existing identity source (such as Microsoft Active Directory), and assign their level
 * of access to each AWS account in your organization. Users get a user portal where they can
 * find and access all their assigned AWS accounts and applications in one place.
 *
 * This configuration allows you to define permission sets (collections of policies) and
 * assignments (which users/groups get which permissions in which accounts).
 *
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html | What is AWS SSO Identity Center}
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html | Permission Sets}
 * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/useraccess.html | User Access and Assignments}
 *
 * @example
 * ```
 * identityCenter:
 *  name: identityCenter1
 *  delegatedAdminAccount: Audit
 *  identityCenterPermissionSets:
 *    - name: PermissionSet1
 *      policies:
 *        awsManaged:
 *          - arn:aws:iam::aws:policy/AdministratorAccess
 *          - PowerUserAccess
 *        customerManaged:
 *          - ResourceConfigurationCollectorPolicy
 *        acceleratorManaged:
 *          - AcceleratorManagedPolicy01
 *          - AcceleratorManagedPolicy02
 *        inlinePolicy: iam-policies/sso-permissionSet1-inline-policy.json
 *        permissionsBoundary:
 *          customerManagedPolicy:
 *            name: AcceleratorManagedPolicy
 *            path: /
 *          awsManagedPolicyName: PowerUserAccess
 *      sessionDuration: 60
 *  identityCenterAssignments:
 *   - name: Assignment1
 *     permissionSetName: PermissionSet1
 *     principals:
 *       - type: USER
 *         name: accelerator
 *       - type: GROUP
 *         name: admin
 *     deploymentTargets:
 *       accounts:
 *         - LogArchive
 * ```
 */
export interface IIdentityCenterConfig {
  /**
   * The logical name for this Identity Center configuration. This name is used to reference
   * this Identity Center instance in other accelerator configurations.
   *
   * @remarks
   * This name is used for identification purposes within the accelerator configuration.
   */
  readonly name: t.NonEmptyString;
  /**
   * The AWS account that will serve as the delegated administrator for Identity Center operations.
   * This serves as an override for the Delegated Admin account.
   *
   * @remarks
   * The delegated administrator account manages Identity Center on behalf of the organization.
   * This account will have permissions to create and manage permission sets, assignments, and
   * other Identity Center resources across the organization.
   *
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/delegated-admin.html | Delegated Administration}
   */
  readonly delegatedAdminAccount?: t.NonEmptyString;
  /**
   * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPermissionSetConfig}*
   *
   * @description
   * List of permission sets to create in AWS Identity Center. Permission sets define collections of
   * policies that determine what actions users can perform when they access AWS accounts.
   *
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html | Manage AWS accounts with permission sets}
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsets.html | Create, manage, and delete permission sets}
   */
  readonly identityCenterPermissionSets?: IIdentityCenterPermissionSetConfig[];
  /**
   * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentConfig}*
   *
   * @description
   * List of assignments that grant users or groups access to AWS accounts using permission sets.
   * Assignments determine which users can access which accounts with what level of permissions.
   *
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/assignusers.html | Assign user or group access to AWS accounts}
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/useraccess.html | Single sign-on access to AWS accounts}
   */
  readonly identityCenterAssignments?: IIdentityCenterAssignmentConfig[];
}

/**
 * *{@link IamConfig} / {@link PolicySetConfig}*
 *
 * @description
 * Defines a collection of IAM managed policies to be deployed to specific AWS accounts or
 * organizational units. Policy sets provide a way to consistently deploy custom managed policies
 * across multiple accounts in your AWS organization, ensuring standardized permission definitions
 * that can be referenced by roles, groups, and users.
 *
 * Managed policies created through policy sets can be used as permissions boundaries, attached
 * to IAM entities, or referenced in Identity Center permission sets. This provides a centralized
 * way to define and maintain custom permissions across your organization.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html | Managed Policies vs Inline Policies}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html | Permissions Boundaries}
 *
 * @example
 * ```
 * policySets:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *     identityCenterDependency: false
 *     policies:
 *       - name: Default-Boundary-Policy
 *         policy: path/to/policy.json
 * ```
 */
export interface IPolicySetConfig {
  /**
   * Specifies the AWS accounts and/or organizational units where these policies will be created.
   *
   * @remarks
   * Policies will be created in all accounts that match the deployment targets. This allows you to
   * ensure consistent policy definitions across your organization that can be referenced by other
   * IAM resources.
   *
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * Indicates whether these policies are used in AWS Identity Center permission set assignments.
   *
   * @remarks
   * When set to true, policies are created in a dependency stack that runs before Identity Center
   * resources. This ensures the policies exist before they are referenced in Identity Center
   * permission sets.
   *
   * When policies are used in Identity Center permission set assignments, they must be present
   * in all deployment target accounts of the Identity Center assignments that reference them.
   *
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html | Permission Sets}
   *
   * @default false
   */
  readonly identityCenterDependency?: boolean;
  /**
   * List of IAM managed policies to create in the targeted accounts.
   *
   * @remarks
   * Each policy will be created with the same configuration in all targeted accounts. The policy
   * content is read from JSON files in your configuration repository, allowing you to define
   * complex permissions using standard IAM policy syntax.
   *
   * @see {@link IamConfig} / {@link PolicySetConfig} / {@link PolicyConfig}
   */
  readonly policies: IPolicyConfig[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryUserConfig}*
 *
 * @description
 * Defines a user account to be created in the AWS Managed Microsoft Active Directory. These users
 * can be used for human authentication, service accounts for AWS integrations, or connector accounts
 * for AWS services that need to authenticate to the directory.
 *
 * Users created through this configuration will be standard Active Directory user accounts with
 * the specified group memberships and email attributes. They can be used for authentication to
 * AWS services through Identity Center.
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_manage_users_groups.html | Managing Users and Groups}
 */
export interface IActiveDirectoryUserConfig {
  /**
   * The username for the Active Directory user account.
   *
   * @remarks
   * This will be the user's logon name in the Active Directory domain. The username should follow
   * your organization's naming conventions and Active Directory naming requirements.
   *
   * The username must be unique within the domain and should not contain special characters that
   * are not allowed in Active Directory usernames.
   *
   */
  readonly name: t.NonEmptyString;
  /**
   * The email address for the Active Directory user account.
   *
   * @remarks
   * This email address will be stored in the user's Active Directory profile and can be used
   * by applications and services that integrate with the directory. It's also useful for
   * administrative purposes and user identification.
   *
   * The email address should be valid and follow your organization's email domain conventions.
   *
   */
  readonly email: t.NonEmptyString;
  /**
   * List of Active Directory groups that this user should be added to.
   *
   * @remarks
   * The user will be made a member of all specified groups, inheriting any permissions and
   * access rights associated with those groups. Groups must exist in the directory (either
   * created through the adGroups or adPerAccountGroups configuration, or pre-existing).
   *
   * Group names can include wildcard patterns (like "*-Admin") that will be resolved to
   * actual group names based on account names in your organization.
   *
   */
  readonly groups: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryPasswordPolicyConfig}*
 *
 * @description
 * Defines the password policy configuration for the AWS Managed Microsoft Active Directory domain.
 * Password policies enforce security requirements for user passwords, including complexity requirements,
 * expiration settings, and account lockout policies to protect against brute force attacks.
 *
 * These settings apply to all user accounts in the domain and help ensure compliance with
 * organizational security standards and regulatory requirements. The policy is enforced by
 * the domain controllers and affects both interactive logons and programmatic authentication.
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_password_policies.html | Password Policies}
 * @see {@link https://docs.microsoft.com/en-us/windows/security/threat-protection/security-policy-settings/password-policy | Windows Password Policy}
 */
export interface IActiveDirectoryPasswordPolicyConfig {
  /**
   * Number of previous passwords to remember and prevent reuse.
   *
   * @remarks
   * This setting prevents users from reusing their recent passwords, forcing them to create
   * new passwords when required to change. A higher value provides better security by preventing
   * password cycling.
   *
   * Recommended range: 12-24 passwords for most organizations.
   *
   * @default 24
   */
  readonly history: number;
  /**
   * Maximum password age in days before users must change their password.
   *
   * @remarks
   * After this period, users will be required to change their password at next logon. Setting
   * this too low can lead to user frustration and weaker passwords, while setting it too high
   * may increase security risks.
   *
   * Common values: 60-90 days for most organizations, or 0 to disable password expiration.
   *
   * @default 90
   */
  readonly maximumAge: number;
  /**
   * Minimum password age in days before users can change their password again.
   *
   * @remarks
   * This prevents users from rapidly changing their password multiple times to circumvent
   * the password history requirement. Users must wait this many days before changing their
   * password again.
   *
   * Typical value: 1 day to prevent immediate password cycling.
   *
   * @default 1
   */
  readonly minimumAge: number;
  /**
   * Minimum password length in characters.
   *
   * @remarks
   * Longer passwords are generally more secure against brute force attacks. This setting
   * enforces a minimum character count for all user passwords in the domain.
   *
   * Recommended minimum: 12-14 characters for strong security.
   *
   * @default 14
   */
  readonly minimumLength: number;
  /**
   * Whether password complexity requirements are enforced.
   *
   * @remarks
   * Complexity requirements help ensure passwords are not easily guessable.
   *
   * @default true
   */
  readonly complexity: boolean;
  /**
   * Whether passwords can be stored using reversible encryption.
   *
   * @remarks
   * Reversible encryption is essentially the same as storing passwords in plain text. This
   * setting should almost always be false unless required by specific legacy applications
   * that need access to the user's password.
   *
   * Security recommendation: Keep this set to false unless absolutely necessary.
   *
   * @default false
   */
  readonly reversible: boolean;
  /**
   * Number of failed login attempts before the account is locked out.
   *
   * @remarks
   * Account lockout helps protect against brute force password attacks by temporarily
   * disabling accounts after too many failed login attempts.
   *
   * @default 6
   */
  readonly failedAttempts: number;
  /**
   * Account lockout duration in minutes.
   *
   * @remarks
   * This is how long an account remains locked after exceeding the failed login attempt
   * threshold. After this time, the account is automatically unlocked. Setting this to 0
   * means accounts remain locked until manually unlocked by an administrator.
   *
   * @default 30
   */
  readonly lockoutDuration: number;
  /**
   * Time in minutes after which the failed login attempt counter is reset.
   *
   * @remarks
   * This determines how long the system remembers failed login attempts. If a user has
   * some failed attempts but then waits this long without another failed attempt, the
   * counter resets to zero.
   *
   * This should typically be the same as or longer than the lockout duration.
   *
   * @default 30
   */
  readonly lockoutAttemptsReset: number;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryConfigurationInstanceUserDataConfig}*
 *
 * @description
 * Defines a PowerShell script that will be executed on the Active Directory configuration instance
 * during startup. These scripts automate the setup and configuration of the AWS Managed Microsoft
 * Active Directory, including tasks like domain joining, user creation, group setup, and policy
 * configuration.
 *
 * The scripts are executed in the order they are specified in the userDataScripts array. The
 * Landing Zone Accelerator provides sample scripts for common Active Directory setup tasks,
 * but you can customize these or provide your own scripts to meet specific requirements.
 *
 * All scripts must be PowerShell scripts (.ps1 or .psm1 files) and must be present in your
 * configuration repository at the specified paths.
 *
 * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html#ec2-windows-user-data | User Data Scripts}
 * @see {@link https://docs.microsoft.com/en-us/powershell/ | PowerShell Documentation}
 *
 * Accelerator can provision users and/or groups when the following user data scripts are provided.
 * These scripts are part of the Accelerator sample configuration
 *
 *  @example
 * ```
 *      userDataScripts:
 *        - scriptName: JoinDomain
 *          scriptFilePath: ad-config-scripts/Join-Domain.ps1
 *        - scriptName: InitializeRDGW ## Do not Need
 *          scriptFilePath: ad-config-scripts/Initialize-RDGW.ps1
 *        - scriptName: AWSQuickStart
 *          scriptFilePath: ad-config-scripts/AWSQuickStart.psm1
 *        - scriptName: ADGroupSetup
 *          scriptFilePath: ad-config-scripts/AD-group-setup.ps1
 *        - scriptName: ADUserSetup
 *          scriptFilePath: ad-config-scripts/AD-user-setup.ps1
 *        - scriptName: ADUserGroupSetup
 *          scriptFilePath: ad-config-scripts/AD-user-group-setup.ps1
 *        - scriptName: ADGroupGrantPermissionsSetup
 *          scriptFilePath: ad-config-scripts/AD-group-grant-permissions-setup.ps1
 *        - scriptName: ADConnectorPermissionsSetup
 *          scriptFilePath: ad-config-scripts/AD-connector-permissions-setup.ps1
 *        - scriptName: ConfigurePasswordPolicy
 *          scriptFilePath: ad-config-scripts/Configure-password-policy.ps1
 * ```
 */
export interface IActiveDirectoryConfigurationInstanceUserDataConfig {
  /**
   * A descriptive name for the PowerShell script that will be executed.
   *
   * @remarks
   * This name is used for identification and logging purposes. It should be descriptive of what
   * the script does (e.g., "JoinDomain", "CreateUsers", "SetupGroups").
   *
   * The script name helps with troubleshooting and understanding the configuration process when
   * reviewing logs or debugging issues.
   */
  readonly scriptName: t.NonEmptyString;
  /**
   * The file path to the PowerShell script in your configuration repository.
   *
   * @remarks
   * The path is relative to your configuration repository root and must point to a valid
   * PowerShell script file (.ps1 or .psm1). The script will be downloaded and executed on
   * the configuration instance during startup.
   *
   * @example
   * ```
   * scriptFilePath: "ad-config-scripts/Join-Domain.ps1"
   * scriptFilePath: "custom-scripts/setup-users.ps1"
   * ```
   */
  readonly scriptFilePath: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig}*
 *
 * @description
 * Defines the configuration for an Amazon EC2 Windows instance that will automatically configure
 * and manage the AWS Managed Microsoft Active Directory. This instance acts as a domain-joined
 * management server that runs PowerShell scripts to set up users, groups, organizational units,
 * password policies, and other Active Directory configurations.
 *
 * The configuration instance provides automated setup of the directory structure, eliminating
 * the need for manual Active Directory administration. It can create standardized user accounts,
 * security groups, and organizational structures that integrate with AWS services like Identity
 * Center and AWS Directory Service connectors.
 *
 * This approach ensures consistent directory configuration across deployments and provides
 * infrastructure-as-code management of Active Directory resources.
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_manage_users_groups.html | Managing Users and Groups}
 * @see {@link https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-windows-instances.html | Windows Instances}
 *
 * @example
 *
 * ```
 *    activeDirectoryConfigurationInstance:
 *      instanceType: t3.large
 *      vpcName: MyVpc
 *      subnetName: subnet
 *      imagePath: /aws/service/ami-windows-latest/Windows_Server-2016-English-Full-Base
 *      securityGroupInboundSources:
 *        - 10.0.0.0/16
 *      instanceRole: EC2-Default-SSM-AD-Role
 *      enableTerminationProtection: false
 *      userDataScripts:
 *        - scriptName: JoinDomain
 *          scriptFilePath: ad-config-scripts/Join-Domain.ps1
 *        - scriptName: InitializeRDGW ## Do not Need
 *          scriptFilePath: ad-config-scripts/Initialize-RDGW.ps1
 *        - scriptName: AWSQuickStart
 *          scriptFilePath: ad-config-scripts/AWSQuickStart.psm1
 *        - scriptName: ADGroupSetup
 *          scriptFilePath: ad-config-scripts/AD-group-setup.ps1
 *        - scriptName: ADUserSetup
 *          scriptFilePath: ad-config-scripts/AD-user-setup.ps1
 *        - scriptName: ADUserGroupSetup
 *          scriptFilePath: ad-config-scripts/AD-user-group-setup.ps1
 *        - scriptName: ADGroupGrantPermissionsSetup
 *          scriptFilePath: ad-config-scripts/AD-group-grant-permissions-setup.ps1
 *        - scriptName: ADConnectorPermissionsSetup
 *          scriptFilePath: ad-config-scripts/AD-connector-permissions-setup.ps1
 *        - scriptName: ConfigurePasswordPolicy
 *          scriptFilePath: ad-config-scripts/Configure-password-policy.ps1
 *      adGroups:
 *        - aws-Provisioning
 *        - aws-Billing
 *      adPerAccountGroups:
 *        - "*-Admin"
 *        - "*-PowerUser"
 *        - "*-View"
 *      adConnectorGroup: ADConnector-grp
 *      sharedAccounts:
 *        - Management
 *        - Audit
 *        - LogArchive
 *      adPasswordPolicy:
 *        history: 24
 *        maximumAge: 90
 *        minimumAge: 1
 *        minimumLength: 14
 *        complexity: true
 *        reversible: false
 *        failedAttempts: 6
 *        lockoutDuration: 30
 *        lockoutAttemptsReset: 30
 *      adUsers:
 *        - name: adconnector-usr
 *          email: example-adconnector-usr@example.com
 *          groups:
 *            - ADConnector-grp
 *        - name: user1
 *          email: example-user1@example.com
 *          groups:
 *            - aws-Provisioning
 *            - "*-View"
 *            - "*-Admin"
 *            - "*-PowerUser"
 *            - AWS Delegated Administrators
 *        - name: user2
 *          email: example-user2@example.com
 *          groups:
 *            - aws-Provisioning
 *            - "*-View"
 * ```
 */
export interface IActiveDirectoryConfigurationInstanceConfig {
  /**
   * The EC2 instance type for the Active Directory configuration instance.
   *
   * @remarks
   * Choose an instance type with sufficient CPU and memory for running PowerShell scripts and
   * Active Directory management tasks. The instance will be domain-joined and will need to
   * communicate with the managed Active Directory domain controllers.
   *
   * Recommended instance types: t3.medium, t3.large, or m5.large for most use cases.
   *
   * @see {@link https://docs.aws.amazon.com/ec2/latest/instancetypes/ | EC2 Instance Types}
   */
  readonly instanceType: t.NonEmptyString;
  /**
   * The logical name of the VPC where the configuration instance will be deployed.
   *
   * @remarks
   * This must be the same VPC where the managed Active Directory is deployed, or have network connectivity
   * to the directory's VPC.
   *
   * The instance needs network access to the managed Active Directory domain controllers for
   * domain join and management operations.
   */
  readonly vpcName: t.NonEmptyString;
  /**
   * The path to the Amazon Machine Image (AMI) for the Windows instance.
   *
   * @remarks
   * This should be a Windows Server AMI that supports PowerShell and Active Directory management
   * tools. The path can be an AMI ID or an AWS Systems Manager parameter path that resolves to
   * the latest Windows Server AMI.
   *
   * @see {@link https://docs.aws.amazon.com/systems-manager/latest/userguide/parameter-store-public-parameters.html | Public Parameters}
   */
  readonly imagePath: t.NonEmptyString;
  /**
   * List of CIDR blocks or IP addresses that are allowed inbound access to the configuration instance.
   *
   * @remarks
   * These sources will be added to the security group for the instance, allowing network access
   * for management and monitoring. Typically, this should include your corporate network ranges
   * or VPC CIDR blocks.
   *
   * The instance will also need outbound internet access for downloading updates and accessing
   * AWS services.
   *
   */
  readonly securityGroupInboundSources: t.NonEmptyString[];
  /**
   * The name of the IAM role to attach to the configuration instance.
   *
   * @remarks
   * The role name must match a role defined in your IAM configuration that will be deployed
   * to the same account as the instance.
   */
  readonly instanceRole: t.NonEmptyString;
  /**
   * Whether to enable termination protection for the configuration instance.
   *
   * @remarks
   * When enabled, the instance cannot be terminated through the EC2 console or API without
   * first disabling termination protection. This helps prevent accidental deletion of the
   * configuration instance.
   *
   * For production environments, consider enabling this protection to prevent accidental
   * termination of the directory management instance.
   *
   * @default false
   */
  readonly enableTerminationProtection?: boolean;
  /**
   * The logical name of the subnet where the configuration instance will be deployed.
   *
   * @remarks
   * Consider using a private subnet with NAT gateway for outbound access to improve security.
   */
  readonly subnetName: t.NonEmptyString;
  /**
   * List of PowerShell scripts that will be executed on the configuration instance to set up
   * the Active Directory environment.
   *
   * @remarks
   * These scripts are executed in the order specified and handle tasks such as domain joining,
   * user creation, group setup, and policy configuration. The scripts must be present in your
   * configuration repository at the specified paths.
   *
   * The accelerator provides sample scripts that cover common Active Directory setup tasks.
   * You can customize these scripts or provide your own to meet specific requirements.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryConfigurationInstanceUserDataConfig}
   */
  readonly userDataScripts: IActiveDirectoryConfigurationInstanceUserDataConfig[];
  /**
   * List of Active Directory security groups to create in the managed directory.
   *
   * @remarks
   * These groups will be created as standard Active Directory security groups and can be used
   * for organizing users and assigning permissions. The groups can be referenced in AWS services
   * that integrate with Active Directory.
   *
   * Common examples include groups for different AWS service access levels or organizational roles.
   */
  readonly adGroups: t.NonEmptyString[];
  /**
   * List of per-account Active Directory groups to create.
   *
   * @remarks
   * These groups use wildcard patterns where "*" is replaced with account names from your
   * organization. This creates standardized groups across all accounts for consistent access
   * management.
   *
   * For example, "*-Admin" creates groups like "Production-Admin", "Development-Admin", etc.
   * for each account in your organization.
   *
   * @example
   * ```
   * adPerAccountGroups:
   *   - "*-Admin"      # Creates Production-Admin, Development-Admin, etc.
   *   - "*-PowerUser"  # Creates Production-PowerUser, Development-PowerUser, etc.
   *   - "*-ReadOnly"   # Creates Production-ReadOnly, Development-ReadOnly, etc.
   * ```
   */
  readonly adPerAccountGroups: t.NonEmptyString[];
  /**
   * The name of the Active Directory group that will be used for AWS Directory Service connector permissions.
   *
   * @remarks
   * This group is granted the necessary permissions to allow AWS services (like Identity Center)
   * to read user and group information from the managed Active Directory. Members of this group
   * can authenticate AWS services to the directory.
   *
   */
  readonly adConnectorGroup: t.NonEmptyString;
  /**
   * List of Active Directory users to create in the managed directory.
   *
   * @remarks
   * These users will be created with the specified attributes and group memberships. Users can
   * be service accounts for AWS integrations or human users for directory authentication.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryUserConfig}
   */
  readonly adUsers: IActiveDirectoryUserConfig[];
  /**
   * Password policy configuration for the managed Active Directory domain.
   *
   * @remarks
   * This defines the password complexity requirements, expiration settings, and lockout policies
   * for all users in the domain. The policy helps ensure strong authentication security and
   * compliance with organizational security standards.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryPasswordPolicyConfig}
   */
  readonly adPasswordPolicy: IActiveDirectoryPasswordPolicyConfig;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectoryVpcSettingsConfig}*
 *
 * @description
 * Defines the VPC network configuration for AWS Managed Microsoft Active Directory. The directory
 * requires network connectivity within a VPC to provide domain services to EC2 instances and other
 * AWS resources. The directory domain controllers will be deployed in the specified subnets and
 * will provide DNS and authentication services to resources in the VPC.
 *
 * For high availability and fault tolerance, the directory requires at least two subnets in
 * different Availability Zones. The directory will automatically deploy domain controllers
 * across these subnets to ensure service availability.
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_getting_started_create_directory.html | Creating a Directory}
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_networking.html | Networking Requirements}
 *
 * @example
 * ```
 * vpcSettings:
 *  vpcName: MyVpc
 *  subnets:
 *    - subnet1
 *    - subnet2
 * ```
 */
export interface IManagedActiveDirectoryVpcSettingsConfig {
  /**
   * The logical name of the VPC where the managed Active Directory will be deployed.
   *
   * @remarks
   * This VPC must have appropriate routing and security group configurations to allow directory traffic.
   *
   * The directory will create Elastic Network Interfaces (ENIs) in the specified subnets and
   * will use these for communication with domain clients.
   */
  readonly vpcName: t.NonEmptyString;
  /**
   * List of subnet names where the directory domain controllers will be deployed.
   *
   * @remarks
   * At least two subnets are required, and they must be in different Availability Zones for
   *
   * Each subnet should have sufficient available IP addresses for the directory domain controllers
   * and any future growth. The directory will consume at least 2 IP addresses per subnet.
   *
   * Subnets should have appropriate routing to allow communication between domain controllers
   * and with domain clients throughout your network.
   */
  readonly subnets: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectoryLogConfig}*
 *
 * @description
 * Defines the logging configuration for AWS Managed Microsoft Active Directory. Directory logging
 * captures security events, authentication attempts, group policy applications, and other directory
 * activities in Amazon CloudWatch Logs for monitoring, troubleshooting, and compliance auditing.
 *
 * Directory logs provide valuable insights into user authentication patterns, failed login attempts,
 * group membership changes, and other security-relevant events. This information is essential for
 * security monitoring, incident response, and meeting compliance requirements.
 *
 * Logs are automatically forwarded from the directory domain controllers to the specified CloudWatch
 * log group, where they can be searched, filtered, and analyzed using CloudWatch Logs Insights or
 * exported to other analysis tools.
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_enable_log_forwarding.html | Enable Log Forwarding}
 * @see {@link https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/WhatIsCloudWatchLogs.html | Amazon CloudWatch Logs}
 */
export interface IManagedActiveDirectoryLogConfig {
  /**
   * The name of the CloudWatch log group that will receive directory security logs.
   *
   * @remarks
   * This log group will be created automatically if it doesn't exist. AWS recommends using the
   * naming convention `/aws/directoryservice/` followed by your directory name for consistency
   * with other AWS service logs.
   *
   * The log group will receive various types of directory events including:
   * - Authentication successes and failures
   * - Account lockouts and password changes
   * - Group membership modifications
   * - Group policy applications
   * - Directory service events
   *
   * If not specified, the accelerator will automatically create a log group name using the pattern
   * `/aws/directoryservice/{DirectoryServiceName}`.
   *
   * @example
   * ```
   * groupName: "/aws/directoryservice/corp-directory"
   * groupName: "/aws/directoryservice/AcceleratorManagedActiveDirectory"
   * ```
   *
   * @default `/aws/directoryservice/{DirectoryServiceName}`
   */
  readonly groupName: t.NonEmptyString;
  /**
   * The number of days to retain log events in the CloudWatch log group.
   *
   * @remarks
   * After this retention period, log events are automatically deleted to manage storage costs.
   * Choose a retention period that meets your compliance and operational requirements.
   *
   * Valid values: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 2192,
   * 2557, 2922, 3288, 3653, or never expire (by omitting this property).
   *
   * Consider your organization's compliance requirements when setting retention periods. Some
   * regulations require log retention for specific periods (e.g., 90 days, 1 year, 7 years).
   *
   * @default Never expire (logs retained indefinitely)
   */
  readonly retentionInDays?: number;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySecretConfig}*
 *
 * @description
 * Defines the configuration for storing AWS Managed Microsoft Active Directory administrator
 * credentials in AWS Secrets Manager. When a managed directory is created, AWS automatically
 * generates administrator credentials that can be securely stored and retrieved from Secrets Manager.
 *
 * This configuration allows you to specify where the administrator secret should be stored,
 * providing secure access to directory administration capabilities without hardcoding credentials
 * in your infrastructure code.
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_getting_started_admin_account.html | Admin Account}
 * @see {@link https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html | AWS Secrets Manager}
 *
 * @example
 *
 * ```
 * secretConfig:
 *  account: Audit
 *  region: us-east-1
 *  adminSecretName: admin
 * ```
 */
export interface IManagedActiveDirectorySecretConfig {
  /**
   * The AWS account where the administrator secret will be stored.
   *
   * @remarks
   * If not specified, the secret will be stored in the same account where the managed Active
   * Directory is deployed. For security and governance reasons, you may want to store secrets
   * in a dedicated security or audit account.
   *
   * Important: Do not use the Management account for storing directory administrator secrets
   * as this violates security best practices.
   *
   * @default Same account as the managed Active Directory
   */
  readonly account?: t.NonEmptyString;
  /**
   * The AWS region where the administrator secret will be stored.
   *
   * @remarks
   * If not specified, the secret will be stored in the same region where the managed Active
   * Directory is deployed. You may want to store secrets in a specific region for compliance
   * or operational reasons.
   *
   * @default Same region as the managed Active Directory
   */
  readonly region?: string;
  /**
   * The name for the administrator secret in AWS Secrets Manager.
   *
   * @remarks
   * This will be the name used to identify and retrieve the secret from Secrets Manager.
   * The secret will contain the username and password for the directory administrator account.
   *
   * If not specified, the accelerator will generate a default name based on the directory name.
   *
   * @default Generated based on directory name
   */
  readonly adminSecretName?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySharedOuConfig}*
 *
 * @description
 * Defines the organizational unit (OU) sharing configuration for AWS Managed Microsoft Active Directory.
 * Directory sharing allows other AWS accounts in your organization to use the managed Active Directory
 * for authentication and authorization, enabling centralized identity management across multiple accounts.
 *
 * When you share a directory with other accounts, those accounts can:
 * - Join EC2 instances to the domain
 * - Use the directory for AWS Single Sign-On (Identity Center) authentication
 * - Access directory information for applications and services
 * - Authenticate users and groups from the shared directory
 *
 * This configuration allows you to specify which organizational units should have access to the
 * directory, with optional exclusions for specific accounts that should not have access.
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_directory_sharing.html | Directory Sharing}
 * @see {@link https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_ous.html | Organizational Units}
 *
 * @example
 * ```
 * sharedOrganizationalUnits:
 *  organizationalUnits:
 *    - root
 *  excludedAccounts:
 *    - Audit
 * ```
 */
export interface IManagedActiveDirectorySharedOuConfig {
  /**
   * List of organizational unit names that should have access to the managed Active Directory.
   *
   * @remarks
   * All AWS accounts within these organizational units will be granted access to use the managed
   * Active Directory for authentication and domain services. The OU names must match those defined
   * in your organization structure.
   *
   * Sharing with organizational units provides a scalable way to grant directory access as new
   * accounts are added to the OUs automatically receive access without additional configuration.
   *
   * Common patterns:
   * - Share with "Root" to grant access to all accounts in the organization
   * - Share with specific OUs like "Production", "Development", "Shared Services"
   * - Use multiple OUs for granular control over directory access
   *
   * @example
   * ```
   * organizationalUnits:
   *   - "Root"                    # All accounts in organization
   *   - "Production"              # Only production accounts
   *   - "Shared Services"         # Shared infrastructure accounts
   * ```
   */
  readonly organizationalUnits: t.NonEmptyString[];
  /**
   * List of AWS account names that should be excluded from directory sharing, even if they
   * are in the specified organizational units.
   *
   * @remarks
   * This provides fine-grained control over directory access by excluding specific accounts
   *
   * Common exclusions include:
   * - Management account (for security isolation)
   * - Log Archive account (may not need directory access)
   * - Audit account (may have different authentication requirements)
   * - Sandbox accounts (for testing isolation)
   *
   * @example
   * ```
   * excludedAccounts:
   *   - "Management"              # Exclude management account
   *   - "Audit"                   # Exclude audit account
   *   - "LogArchive"              # Exclude log archive account
   *   - "Sandbox"                 # Exclude sandbox accounts
   * ```
   *
   * @default undefined (no accounts excluded)
   */
  readonly excludedAccounts?: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig}*
 *
 * @description
 * Defines an AWS Managed Microsoft Active Directory configuration. AWS Managed Microsoft AD is a
 * fully managed Microsoft Active Directory service in the AWS Cloud. It provides a highly available,
 * resilient Active Directory infrastructure that can be used for user authentication, group policies,
 * and integration with other AWS services.
 *
 * This service enables you to run directory-aware workloads in the AWS Cloud, including Microsoft
 * SharePoint, Microsoft SQL Server Always On Availability Groups, and .NET applications. It also
 * supports integration with AWS services like Amazon WorkSpaces, Amazon QuickSight, and AWS Single
 * Sign-On (Identity Center).
 *
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/directory_microsoft_ad.html | AWS Managed Microsoft AD}
 * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_getting_started.html | Getting Started with AWS Managed Microsoft AD}
 *
 * @example
 * ```
 * managedActiveDirectories:
 *  - name: AcceleratorManagedActiveDirectory
 *    type: AWS Managed Microsoft AD
 *    account: Network
 *    region: us-east-1
 *    dnsName: example.com
 *    netBiosDomainName: example
 *    description: Example managed active directory
 *    edition: Enterprise
 *    resolverRuleName: example-com-rule
 *    vpcSettings:
 *      vpcName: ManagedAdVpc
 *      subnets:
 *        - subnet1
 *        - subnet2
 *    secretConfig:
 *      account: Audit
 *      region: us-east-1
 *      adminSecretName: admin
 *    sharedOrganizationalUnits:
 *      organizationalUnits:
 *        - Root
 *      excludedAccounts:
 *        - Management
 *    logs:
 *      groupName: /aws/directoryservice/AcceleratorManagedActiveDirectory
 *      retentionInDays: 30
 * ```
 */
export interface IManagedActiveDirectoryConfig {
  /**
   * The logical name for this managed Active Directory instance.
   *
   * @remarks
   * This name will be used to reference the directory in other configurations and will be part
   * of the directory's resource name in AWS. It should be descriptive of the directory's purpose.
   *
   */
  readonly name: t.NonEmptyString;
  /**
   * The AWS account where the managed Active Directory will be deployed.
   *
   * @remarks
   * This should typically be a centralized networking or shared services account that can provide
   * directory services to other accounts in your organization. The account name must match an
   */
  readonly account: t.NonEmptyString;
  /**
   * The AWS region where the managed Active Directory will be deployed.
   *
   * @remarks
   * The directory will be deployed in this region and can be accessed by resources in the same
   * region. For multi-region access, you may need to set up directory trusts or additional
   * directory instances.
   *
   * @default us-east-1
   */
  readonly region: string;
  /**
   * The fully qualified domain name (FQDN) for the managed Active Directory.
   *
   * @remarks
   * This domain name will be used for DNS resolution within your VPC and for Active Directory
   * authentication. It should be a domain name that you control and that doesn't conflict with
   * existing DNS infrastructure.
   *
   * The domain name doesn't need to be publicly resolvable but should follow standard DNS naming
   * conventions (e.g., 'corp.example.com', 'ad.mycompany.local').
   *
   * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_getting_started_create_directory.html | Creating a Directory}
   */
  readonly dnsName: t.NonEmptyString;
  /**
   * The NetBIOS name for the Active Directory domain.
   *
   * @remarks
   * The NetBIOS name is a shorter identifier for the domain, typically used by older Windows
   * applications and for backward compatibility. It should be 15 characters or less and contain
   * only alphanumeric characters.
   *
   * Common practice is to use the first part of your DNS name (e.g., if DNS name is
   * 'corp.example.com', NetBIOS name might be 'CORP').
   */
  readonly netBiosDomainName: t.NonEmptyString;
  /**
   * A human-readable description of the managed Active Directory.
   *
   * @remarks
   * This description helps identify the purpose and scope of the directory instance. It's visible
   * in the AWS console and can help with documentation and governance.
   */
  readonly description?: t.NonEmptyString;
  /**
   * The edition of AWS Managed Microsoft AD to deploy.
   *
   * @remarks
   * AWS Managed Microsoft AD is available in two editions:
   * - `Standard`: Supports up to 5,000 users and provides 1 GB of directory storage
   * - `Enterprise`: Supports up to 500,000 users and provides 17 GB of directory storage
   *
   * Choose the edition based on your expected number of users and storage requirements.
   *
   * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_getting_started_what_gets_created.html | What Gets Created}
   */
  readonly edition: 'Standard' | 'Enterprise';
  /**
   * VPC configuration specifying where the managed Active Directory will be deployed.
   *
   * @remarks
   * The directory requires at least two subnets in different Availability Zones for high
   * availability. The subnets should have sufficient IP addresses available for the directory
   * domain controllers and any client connections.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryVpcSettingsConfig}
   */
  readonly vpcSettings: IManagedActiveDirectoryVpcSettingsConfig;
  /**
   * The name of a Route 53 resolver rule to update with the directory's DNS server IP addresses.
   *
   * @remarks
   * When specified, the accelerator will automatically update the specified resolver rule with
   * the IP addresses of the managed Active Directory domain controllers. This enables DNS
   * resolution for the directory domain across your network.
   *
   * The resolver rule must be defined in your network-config.yaml file and should be configured
   * to forward DNS queries for your Active Directory domain.
   *
   * @see {@link https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver.html | Route 53 Resolver}
   */
  readonly resolverRuleName?: t.NonEmptyString;
  /**
   * Configuration for storing the directory administrator credentials in AWS Secrets Manager.
   *
   * @remarks
   * The administrator credentials are automatically generated when the directory is created and
   * can be stored in Secrets Manager for secure access. This is recommended for production
   * environments to avoid hardcoding credentials.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySecretConfig}
   */
  readonly secretConfig?: IManagedActiveDirectorySecretConfig;
  /**
   * Configuration for sharing the directory with other AWS accounts in your organization.
   *
   * @remarks
   * Directory sharing allows other AWS accounts to use the managed Active Directory for
   * authentication and authorization. This is useful for centralized identity management
   * across multiple AWS accounts.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySharedOuConfig}
   */
  readonly sharedOrganizationalUnits?: IManagedActiveDirectorySharedOuConfig;
  /**
   * List of AWS account names to share the directory with directly.
   *
   * @remarks
   * These accounts will be granted access to use the managed Active Directory for authentication
   *
   * This provides an alternative to organizational unit-based sharing for more granular control.
   */
  readonly sharedAccounts?: t.NonEmptyString[];
  /**
   * Configuration for directory logging to Amazon CloudWatch Logs.
   *
   * @remarks
   * Directory logs provide detailed information about authentication events, group policy
   * applications, and other directory activities. This is valuable for security monitoring,
   * troubleshooting, and compliance auditing.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectoryLogConfig}
   */
  readonly logs?: IManagedActiveDirectoryLogConfig;
  /**
   * Configuration for an EC2 instance that will automatically configure users, groups, and
   * organizational units in the managed Active Directory.
   *
   * @remarks
   * The configuration instance is a Windows EC2 instance that runs PowerShell scripts to set up
   * the directory structure, create users and groups, configure password policies, and establish
   * the necessary permissions for AWS services integration.
   *
   * This is optional but recommended for automated directory setup. Without this, you would need
   * to manually configure the directory using traditional Active Directory management tools.
   *
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig}
   */
  readonly activeDirectoryConfigurationInstance?: IActiveDirectoryConfigurationInstanceConfig;
}

/**
 * *{@link IamConfig}*
 *
 * @description
 * AWS Identity and Access Management (IAM) configuration for the Landing Zone Accelerator.
 * This configuration defines IAM identities (users, groups, roles), policies, and related
 * services like SAML providers, AWS Managed Microsoft AD, and AWS Identity Center.
 *
 * IAM enables you to manage access to AWS services and resources securely. Using IAM, you can
 * create and manage AWS users and groups, and use permissions to allow and deny their access
 * to AWS resources.
 *
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html | Policies and permissions in AWS Identity and Access Management}
 * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id.html | IAM Identities}
 *
 * @category IAM Configuration
 */
export interface IIamConfig {
  /**
   * The primary AWS region where global IAM resources will be managed and deployed.
   *
   * @remarks
   * This region serves as the control plane for IAM operations across your organization.
   * Global IAM resources like roles and policies are replicated to all regions, but this
   * setting determines where the accelerator manages these resources from.
   *
   * @example
   * ```
   * homeRegion: &HOME_REGION us-east-1
   * ```
   */
  readonly homeRegion?: string;
  /**
   * SAML identity provider configuration for federated access to AWS.
   *
   * @remarks
   * SAML providers enable users from external identity systems to access AWS resources without
   * creating IAM users. This is useful for organizations that want to use their existing identity
   * infrastructure for AWS access.
   *
   * The metadata document file must be present in your configuration repository and contain valid
   * SAML 2.0 metadata from your identity provider.
   *
   * @example
   * ```
   * providers:
   *  - name: <PROVIDER_NAME>
   *    metadataDocument: <METADATA_DOCUMENT_FILE>
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_saml.html | Creating SAML identity providers}
   * @see {@link IamConfig} / {@link SamlProviderConfig}
   */
  readonly providers?: ISamlProviderConfig[];
  /**
   * IAM managed policy sets configuration.
   *
   * @remarks
   * Policy sets allow you to deploy custom managed policies consistently across multiple AWS accounts
   * and organizational units. Managed policies are standalone identity-based policies that you can
   * attach to multiple users, groups, and roles in your AWS account.
   *
   * Each policy set defines a collection of managed policies and specifies where they should be deployed
   * using deployment targets.
   *
   * @example
   *```
   * policySets:
   *   - deploymentTargets:
   *       organizationalUnits:
   *         - Root
   *     identityCenterDependency: false
   *     policies:
   *       - name: Default-Boundary-Policy
   *         policy: iam-policies/boundary-policy.json
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_managed-vs-inline.html | Managed policies and inline policies}
   * @see {@link IamConfig} / {@link PolicySetConfig}
   */
  readonly policySets?: IPolicySetConfig[];
  /**
   * Role sets configuration
   *
   * @remarks To configure EC2-Default-SSM-AD-Role role to be assumed by ec2 service into Root and Infrastructure organizational units,
   * you need to provide the following values for this parameter.
   * This role will have the AmazonSSMManagedInstanceCore, AmazonSSMDirectoryServiceAccess and CloudWatchAgentServerPolicy policies
   * with permission boundaries defined by Default-Boundary-Policy.
   *
   * @example
   * ```
   * roleSets:
   *   - deploymentTargets:
   *       organizationalUnits:
   *         - Root
   *     roles:
   *       - name: EC2-Default-SSM-AD-Role
   *         assumedBy:
   *           - type: service
   *             principal: ec2.amazonaws.com
   *         policies:
   *           awsManaged:
   *             - AmazonSSMManagedInstanceCore
   *             - AmazonSSMDirectoryServiceAccess
   *             - CloudWatchAgentServerPolicy
   *         boundaryPolicy: Default-Boundary-Policy
   * ```
   *
   * @see {@link IamConfig} / {@link RoleSetConfig}
   */
  readonly roleSets?: IRoleSetConfig[];
  /**
   * IAM group sets configuration.
   *
   * @remarks
   * Group sets allow you to deploy IAM groups consistently across multiple AWS accounts and
   * organizational units. IAM groups are collections of IAM users that you can manage as a unit
   * by attaching policies to the group.
   *
   * Groups make it easier to manage permissions for multiple users. When you attach a policy to
   * a group, all users in that group receive the permissions specified in the policy.
   *
   * @example
   * ```
   * groupSets:
   *   - deploymentTargets:
   *       organizationalUnits:
   *         - Root
   *     groups:
   *       - name: Administrators
   *         policies:
   *           awsManaged:
   *             - AdministratorAccess
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_groups.html | IAM user groups}
   * @see {@link IamConfig} / {@link GroupSetConfig}
   */
  readonly groupSets?: IGroupSetConfig[];
  /**
   * IAM user sets configuration.
   *
   * @remarks
   * User sets allow you to deploy IAM users consistently across multiple AWS accounts and
   * organizational units. IAM users represent individual people or applications that interact
   * with AWS resources.
   *
   * Each user has a unique name and can be assigned to groups, have policies attached directly,
   * and have permissions boundaries applied. Users are typically used for break-glass access
   * scenarios or service accounts.
   *
   * @example
   * ```
   * userSets:
   *   - deploymentTargets:
   *       accounts:
   *         - Management
   *     users:
   *       - username: breakGlassUser01
   *         group: Administrators
   *         boundaryPolicy: Default-Boundary-Policy
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/IAM/latest/UserGuide/id_users.html | IAM users}
   * @see {@link IamConfig} / {@link UserSetConfig}
   */
  readonly userSets?: IUserSetConfig[];
  /**
   * AWS Managed Microsoft AD configuration.
   *
   * @description
   * AWS Managed Microsoft AD creates a fully managed Microsoft Active Directory in the AWS Cloud.
   * It enables you to run directory-aware workloads in AWS, including Microsoft SharePoint,
   * Microsoft SQL Server Always On Availability Groups, and .NET applications.
   *
   * @remarks
   * AWS Managed Microsoft AD is built on actual Microsoft Active Directory and does not require
   * you to synchronize or replicate data from your existing Active Directory to the cloud. You can
   * use standard Active Directory administration tools and take advantage of built-in Active Directory
   * features such as Group Policy, trusts, and single sign-on.
   *
   * The accelerator can optionally provision an EC2 instance to help configure users, groups, and
   * policies in the managed directory.
   * You need to provide the following values for this parameter.
   *
   * @example
   * ```
   * managedActiveDirectories:
   *  - name: AcceleratorManagedActiveDirectory
   *    type: AWS Managed Microsoft AD
   *    account: Network
   *    region: us-east-1
   *    dnsName: example.com
   *    netBiosDomainName: example
   *    description: Example managed active directory
   *    edition: Enterprise
   *    resolverRuleName: example-com-rule
   *    vpcSettings:
   *      vpcName: ManagedAdVpc
   *      subnets:
   *        - subnet1
   *        - subnet2
   *    secretConfig:
   *      account: Audit
   *      region: us-east-1
   *      adminSecretName: admin
   *    sharedOrganizationalUnits:
   *      organizationalUnits:
   *        - Root
   *      excludedAccounts:
   *        - Management
   *    logs:
   *      groupName: /aws/directoryservice/AcceleratorManagedActiveDirectory
   *      retentionInDays: 30
   *    activeDirectoryConfigurationInstance:
   *      instanceType: t3.large
   *      vpcName: MyVpc
   *      subnetName: subnet
   *      imagePath: /aws/service/ami-windows-latest/Windows_Server-2016-English-Full-Base
   *      securityGroupInboundSources:
   *        - 10.0.0.0/16
   *      instanceRole: EC2-Default-SSM-AD-Role
   *      enableTerminationProtection: false
   *      userDataScripts:
   *        - scriptName: JoinDomain
   *          scriptFilePath: ad-config-scripts/Join-Domain.ps1
   *        - scriptName: InitializeRDGW ## Do not Need
   *          scriptFilePath: ad-config-scripts/Initialize-RDGW.ps1
   *        - scriptName: AWSQuickStart
   *          scriptFilePath: ad-config-scripts/AWSQuickStart.psm1
   *        - scriptName: ADGroupSetup
   *          scriptFilePath: ad-config-scripts/AD-group-setup.ps1
   *        - scriptName: ADUserSetup
   *          scriptFilePath: ad-config-scripts/AD-user-setup.ps1
   *        - scriptName: ADUserGroupSetup
   *          scriptFilePath: ad-config-scripts/AD-user-group-setup.ps1
   *        - scriptName: ADGroupGrantPermissionsSetup
   *          scriptFilePath: ad-config-scripts/AD-group-grant-permissions-setup.ps1
   *        - scriptName: ADConnectorPermissionsSetup
   *          scriptFilePath: ad-config-scripts/AD-connector-permissions-setup.ps1
   *        - scriptName: ConfigurePasswordPolicy
   *          scriptFilePath: ad-config-scripts/Configure-password-policy.ps1
   *      adGroups:
   *        - aws-Provisioning
   *        - aws-Billing
   *      adPerAccountGroups:
   *        - "*-Admin"
   *        - "*-PowerUser"
   *        - "*-View"
   *      adConnectorGroup: ADConnector-grp
   *      sharedAccounts:
   *        - Management
   *        - Audit
   *        - LogArchive
   *      adPasswordPolicy:
   *        history: 24
   *        maximumAge: 90
   *        minimumAge: 1
   *        minimumLength: 14
   *        complexity: true
   *        reversible: false
   *        failedAttempts: 6
   *        lockoutDuration: 30
   *        lockoutAttemptsReset: 30
   *      adUsers:
   *        - name: adconnector-usr
   *          email: example-adconnector-usr@example.com
   *          groups:
   *            - ADConnector-grp
   *        - name: user1
   *          email: example-user1@example.com
   *          groups:
   *            - aws-Provisioning
   *            - "*-View"
   *            - "*-Admin"
   *            - "*-PowerUser"
   *            - AWS Delegated Administrators
   *        - name: user2
   *          email: example-user2@example.com
   *          groups:
   *            - aws-Provisioning
   *            - "*-View"
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/directory_microsoft_ad.html | AWS Managed Microsoft AD}
   * @see {@link https://docs.aws.amazon.com/directoryservice/latest/admin-guide/ms_ad_manage_users_groups.html | User and group management in AWS Managed Microsoft AD}
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig}
   */
  readonly managedActiveDirectories?: IManagedActiveDirectoryConfig[];
  /**
   * AWS Identity Center configuration.
   *
   * @description
   * AWS Identity Center (successor to AWS Single Sign-On) helps you securely create or connect
   * your workforce identities and manage their access centrally across AWS accounts and applications.
   * Identity Center provides a unified administration experience to define, customize, and assign
   * fine-grained permissions.
   *
   * @remarks
   * Identity Center enables single sign-on access to multiple AWS accounts and cloud applications.
   * You can create permission sets that define the level of access users have to AWS resources,
   * and then assign these permission sets to users or groups for specific AWS accounts.
   *
   * The accelerator can manage permission sets and assignments to ensure consistent access patterns
   * across your organization. You need to provide the following values for this parameter.
   *
   * @example
   * ```
   * identityCenter:
   *  name: identityCenter1
   *  delegatedAdminAccount: Audit
   *  identityCenterPermissionSets:
   *    - name: PermissionSet1
   *      policies:
   *        awsManaged:
   *          - arn:aws:iam::aws:policy/AdministratorAccess
   *          - PowerUserAccess
   *        customerManaged:
   *          - ResourceConfigurationCollectorPolicy
   *        acceleratorManaged:
   *          - AcceleratorManagedPolicy01
   *          - AcceleratorManagedPolicy02
   *        inlinePolicy: iam-policies/sso-permissionSet1-inline-policy.json
   *        permissionsBoundary:
   *          customerManagedPolicy:
   *            name: AcceleratorManagedPolicy
   *            path: /
   *          awsManagedPolicyName: PowerUserAccess
   *      sessionDuration: 60
   *   identityCenterAssignments:
   *     - name: Assignment1
   *       permissionSetName: PermissionSet1
   *       principals:
   *         - type: USER
   *           name: accelerator
   *         - type: GROUP
   *           name: admin
   *       deploymentTargets:
   *         accounts:
   *           - LogArchive
   * ```
   *
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html | What is IAM Identity Center?}
   * @see {@link https://docs.aws.amazon.com/singlesignon/latest/userguide/permissionsetsconcept.html | Manage AWS accounts with permission sets}
   * @see {@link IamConfig} / {@link IdentityCenterConfig}
   */
  readonly identityCenter?: IIdentityCenterConfig;
}

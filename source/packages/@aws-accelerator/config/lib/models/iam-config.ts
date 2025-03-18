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
 * Use this configuration to define accelerator managed IAM managed policies.
 *
 * @remarks Initial set of permissions to add to this policy document are read from the input file provided in policy JSON file.
 *
 * @example
 * ```
 * - name: Default-Boundary-Policy
 *   policy: path/to/policy.json
 * ```
 */
export interface IPolicyConfig {
  /**
   * The name of the managed policy.
   */
  readonly name: t.NonEmptyString;
  /**
   * A JSON file containing policy boundary definition.
   */
  readonly policy: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link SamlProviderConfig}*
 *
 * @description
 * SAML provider configuration
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
   * The name of the provider to create.
   *
   * This parameter allows a string of characters consisting of upper and lowercase alphanumeric characters with no spaces. You can also include any of the following characters: _+=,.@-
   *
   * Length must be between 1 and 128 characters.
   *
   * @default a CloudFormation generated name
   */
  readonly name: t.NonEmptyString;
  /**
   * SAML metadata document XML file, this file must be present in config repository
   */
  readonly metadataDocument: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link UserSetConfig} / {@link UserConfig}*
 *
 * @description
 * IAM User configuration
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
   * A name for the IAM user. For valid values, see the UserName parameter for the CreateUser action in the IAM API Reference.
   * If you don't specify a name, AWS CloudFormation generates a unique physical ID and uses that ID for the user name.
   *
   * If you specify a name, you cannot perform updates that require replacement of this resource.
   * You can perform updates that require no or some interruption. If you must replace the resource, specify a new name.
   */
  readonly username: t.NonEmptyString;
  /**
   * Group to add this user to.
   */
  readonly group: t.NonEmptyString;
  /**
   * AWS supports permissions boundaries for IAM entities (users or roles).
   * A permissions boundary is an advanced feature for using a managed policy to set the maximum permissions that an identity-based policy can grant to an IAM entity.
   * An entity's permissions boundary allows it to perform only the actions that are allowed by both its identity-based policies and its permissions boundaries.
   *
   * Permission boundary is derived from iam-policies/boundary-policy.json file in config repository
   */
  readonly boundaryPolicy?: t.NonEmptyString;

  /**
   * A boolean value to define if the user should have access to the AWS console.
   * True will disable console access, False will enable it.
   * defaults to False.
   */
  readonly disableConsoleAccess?: boolean;
}

/**
 * *{@link IamConfig} / {@link UserSetConfig}*
 *
 * @description
 * User set configuration
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
   * User set's deployment target
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * List os user objects
   */
  readonly users: IUserConfig[];
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig} / {@link CustomerManagedPolicyReferenceConfig}*
 *
 * @description
 * Customer Managed Policy Reference Config
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
   * Identity Center PermissionSet permissions boundary customer managed policy name.
   *
   * @remarks The name of the IAM policy that you have configured in each account where you want to deploy your permission set.
   * If you want use accelerator deployed customer managed policy, specify the name from policySets object of iam-config.yaml file.
   *
   * {@link http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-sso-permissionset-customermanagedpolicyreference.html#cfn-sso-permissionset-customermanagedpolicyreference-name | CustomerManagedPolicyReference} name.
   */
  readonly name: t.NonEmptyString;
  /**
   * The path to the IAM policy that you have configured in each account where you want to deploy your permission set.
   *
   * @remarks The default is `/` . For more information, see [Friendly names and paths](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_identifiers.html#identifiers-friendly-names) in the *IAM User Guide* .
   */
  readonly path?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig}*
 *
 * @description
 * Specify either customerManagedPolicy to use the name and path of a customer managed policy, or managedPolicy to use the ARN of an AWS managed policy.
 *
 * @example
 * ```
 *  permissionsBoundary:
 *    customerManagedPolicy:
 *      name: AcceleratorManagedPolicy
 *      path: /
 *      awsManagedPolicyName: PowerUserAccess
 * ```
 */
export interface IPermissionsBoundaryConfig {
  /**
   * The AWS managed policy name that you want to attach to a permission set as a permissions boundary.
   *
   * @remarks You must have an IAM policy that matches the name and path in each AWS account where you want to deploy your permission set.
   *
   */
  readonly awsManagedPolicyName?: t.NonEmptyString;
  /**
   * Specifies the name and path of a customer managed policy.
   *
   * @remarks You must have an IAM policy that matches the name and path in each AWS account where you want to deploy your permission set.
   *
   * {@link https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-sso-permissionset-permissionsboundary.html#cfn-sso-permissionset-permissionsboundary-customermanagedpolicyreference | CustomerManagedPolicyReference}
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig} / {@link CustomerManagedPolicyReferenceConfig}
   */
  readonly customerManagedPolicy?: ICustomerManagedPolicyReferenceConfig;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPoliciesConfig}*
 *
 * @description
 * Identity Center Permission Set Policy Configuration
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
   * List of AWS managed policies that would be attached to permission set.
   *
   * @remarks This list can contain policy name or policy arn
   */
  readonly awsManaged?: t.NonEmptyString[];
  /**
   * List of the names and paths of the customer managed policies that would be attached to permission set.
   *
   * @remarks This list can contain only existing customer managed policy names, Accelerator expect these policies would be present prior deployment.
   */
  readonly customerManaged?: t.NonEmptyString[];
  /**
   * List of the names customer managed policies that would be attached to permission set.
   *
   * @remarks Specify the names of policies created by Accelerator solution. Solution will create these policies before attaching to permission set.
   * To create policies through Accelerator and attach to permission set, you need to specify policies in policySets object of iam-config.yaml file with identityCenterDependency flag on.
   * Accelerator managed policy name must be part of policySets object of iam-config.yaml file.
   */
  readonly acceleratorManaged?: t.NonEmptyString[];
  /**
   * The inline policy that is attached to the permission set.
   *
   * {@link http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-sso-permissionset.html#cfn-sso-permissionset-inlinepolicy | InlinePolicy} reference
   */
  readonly inlinePolicy?: t.NonEmptyString;
  /**
   *
   * Specifies the configuration of the AWS managed or customer managed policy that you want to set as a permissions boundary.
   *
   * @remarks Specify either customerManagedPolicy to use the name and path of a customer managed policy, or managedPolicy name to use the ARN of an AWS managed policy.
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link PermissionsBoundaryConfig}
   */
  readonly permissionsBoundary?: IPermissionsBoundaryConfig;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPermissionSetConfig}*
 *
 * @description
 * Identity Center Permission Set Configuration
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
   * A name for the Identity Center Permission Set Configuration
   */
  readonly name: t.NonEmptyString;
  /**
   * Policy Configuration for Customer Managed Permissions and AWS Managed Permissions
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPoliciesConfig}
   */
  readonly policies?: IIdentityCenterPoliciesConfig;
  /**
   * A number value (in minutes). The length of time that the application user sessions are valid for in the ISO-8601 standard.
   * @default undefined
   */
  readonly sessionDuration?: number;

  /**
   * A description string for the Permission Set
   * @default undefined
   */
  readonly description?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link GroupConfig} | {@link RoleConfig} / {@link PoliciesConfig}*
 *
 * @description
 * IAM policies configuration
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
   * List of AWS managed policies. Values can be policy arn or policy name
   */
  readonly awsManaged?: t.NonEmptyString[];
  /**
   * List of Customer managed policies
   */
  readonly customerManaged?: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link GroupSetConfig} / {@link GroupConfig}*
 *
 * @description
 * IAM group configuration
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
   * A name for the IAM group. For valid values, see the GroupName parameter for the CreateGroup action in the IAM API Reference.
   * If you don't specify a name, AWS CloudFormation generates a unique physical ID and uses that ID for the group name.
   *
   * If you specify a name, you must specify the CAPABILITY_NAMED_IAM value to acknowledge your template's capabilities.
   * For more information, see Acknowledging IAM Resources in AWS CloudFormation Templates.
   */
  readonly name: t.NonEmptyString;
  /**
   * List of policy objects
   */
  readonly policies?: IPoliciesConfig;
}

/**
 * *{@link IamConfig} / {@link GroupSetConfig}*
 *
 * @description
 * IAM group set configuration
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
   * Group set's deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * List of IAM group objects
   */
  readonly groups: IGroupConfig[];
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig} / {@link AssumedByConfig}*
 *
 * @description
 * AssumedBy configuration
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
   * IAM principal of either service, account, principalArn or provider type.
   *
   * IAM principal of sns service type (i.e. new ServicePrincipal('sns.amazonaws.com')), which can assume this role.
   */
  readonly type: t.AssumedByType;
  /**
   * Type of IAM principal type like service, account, principalArn or provider, which can assume this role.
   */
  readonly principal?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig}*
 *
 * @description
 * IAM Role configuration
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
   * A name for the role
   */
  readonly name: t.NonEmptyString;
  /**
   * Indicates whether role is used for EC2 instance profile
   */
  readonly instanceProfile?: boolean;
  /**
   * List of IDs that the role assumer needs to provide one of when assuming this role
   * @remarks For more information about granting third party access to assume an IAM Role, please reference the [documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-user_externalid.html).
   * From the documentation, this will apply a similar stanza in the assume role policy document of your IAM role.
   *
   * ```
   * "Principal": {"AWS": "Example Corp's AWS account ID"},
   * "Condition": {"StringEquals": {"sts:ExternalId": "Unique ID Assigned by Example Corp"}}
   * ```
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
   * AssumedBy configuration
   */
  readonly assumedBy: IAssumedByConfig[];
  /**
   * List of policies for the role
   */
  readonly policies?: IPoliciesConfig;
  /**
   * A permissions boundary configuration
   */
  readonly boundaryPolicy?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig}*
 *
 * @description
 * Role set configuration
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
   * Role set deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * The path to the role
   */
  readonly path?: t.NonEmptyString;
  /**
   * List of role objects
   */
  readonly roles: IRoleConfig[];
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentPrincipalConfig}*
 *
 * @description
 * Identity Center Permission Set Assignment Principal Configuration
 *
 * @remarks Use this configuration to provide principals of USER or GROUP type for assignment.
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
   * Assignment principal type
   *
   * @remarks Possible value for this property can be USER or GROUP
   */
  readonly type: t.NonEmptyString;
  /**
   * Name of the principal
   *
   * @remarks Identity Center user or group name
   */
  readonly name: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentConfig}*
 *
 * @description
 * Identity Center Assignment Configuration
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
   * Permission Set name that will be used for the Assignment.
   */
  readonly permissionSetName: t.NonEmptyString;
  /**
   * PrincipalId that will be used for the Assignment
   *
   * @deprecated
   * This is a temporary property and it has been deprecated.
   * Please use principals property to specify principal name for assignment.
   */
  readonly principalId?: t.NonEmptyString;
  /**
   * PrincipalType that will be used for the Assignment
   *
   * @deprecated
   * This is a temporary property and it has been deprecated.
   * Please use principals property to specify principal type for assignment.
   */
  readonly principalType?: t.PrincipalType;
  /**
   * Assignment principal configuration list.
   *
   * @remarks
   * Assignment principal's type can be either USER or GROUP.
   * Every principal in the list needs type and the name of principal.
   *
   * @example
   * ```
   * principal:
   *   - type: USER
   *     name: accelerator
   *   - type: GROUP
   *     name: admin
   * ```
   *
   * @see {@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentPrincipalConfig}
   */
  readonly principals?: IIdentityCenterAssignmentPrincipalConfig[];
  /**
   * Identity Center assignment deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * The Name for the Assignment.
   */
  readonly name: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig}*
 *
 * @description
 * Identity Center Configuration
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
   * A name for the Identity Center Configuration
   */
  readonly name: t.NonEmptyString;
  /**
   * Override for Delegated Admin Account
   *
   *  @remarks All Accelerator managed Identity Center Permission Sets and Assignments must be removed before changing the service's delegated administrator. To change this property:
   *
   *  Remove or comment out the existing PermissionSets and Assignments from identityCenter configuration from iam-config.yaml.
   *  Important: You must leave identityCenter, name, and delegatedAdminAccount.
   *  Run the pipeline to remove the resources.
   *  Add or uncomment the desired identityCenter configuration to iam-config.yaml.
   *  Set the delegatedAdminAccount property to the desired new delegated administrator account.
   *  Run the pipeline to update the delegated admin and create Identity Center resources.
   */
  readonly delegatedAdminAccount?: t.NonEmptyString;
  /**
   * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPermissionSetConfig}*
   *
   * @description
   * List of PermissionSets
   */
  readonly identityCenterPermissionSets?: IIdentityCenterPermissionSetConfig[];
  /**
   * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentConfig}*
   *
   * @description
   * List of Assignments
   */
  readonly identityCenterAssignments?: IIdentityCenterAssignmentConfig[];
}

/**
 * *{@link IamConfig} / {@link PolicySetConfig}*
 *
 * @description
 * Policy set configuration
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
   * Policy set deployment targets
   */
  readonly deploymentTargets: t.IDeploymentTargets;
  /**
   * Flag indicates if the policy is used in Identity Center PermissionSet assignments.
   *
   * @remarks When the policy is used in Identity Center PermissionSet assignments, policy must be present in each deployment target accounts of identityCenterAssignments.
   * When this flag is set to true policy is created in dependency stack.
   */
  readonly identityCenterDependency?: boolean;
  /**
   * List of Policies
   *
   * @remarks Use this configuration to define accelerator managed IAM managed policies.
   *
   * @see {@link IamConfig} / {@link PolicySetConfig} / {@link PolicyConfig}
   */
  readonly policies: IPolicyConfig[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryUserConfig}*
 *
 * @description
 * Active directory user configuration
 */
export interface IActiveDirectoryUserConfig {
  /**
   * Active directory user name
   */
  readonly name: t.NonEmptyString;
  /**
   * Active directory user email
   */
  readonly email: t.NonEmptyString;
  /**
   * Active directory user group names
   */
  readonly groups: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryPasswordPolicyConfig}*
 *
 * @description
 * Managed active directory user password policy configuration
 */
export interface IActiveDirectoryPasswordPolicyConfig {
  readonly history: number;
  readonly maximumAge: number;
  readonly minimumAge: number;
  readonly minimumLength: number;
  readonly complexity: boolean;
  readonly reversible: boolean;
  readonly failedAttempts: number;
  readonly lockoutDuration: number;
  readonly lockoutAttemptsReset: number;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryConfigurationInstanceUserDataConfig}*
 *
 * @description
 * User data scripts to create users, groups, password policy.
 *
 * Accelerator can provision users, groups when following user data scripts are provided, these scripts are part of Accelerator sample configuration
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
   * Friendly name for the user data script
   */
  readonly scriptName: t.NonEmptyString;
  /**
   * Script file path
   */
  readonly scriptFilePath: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig}*
 *
 * @description
 * Active directory configuration instance configuration. The machine will be used to configure and manage active directory configuration.
 * Accelerator can create user, groups when following configuration provided
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
   * Ec2 instance type
   */
  readonly instanceType: t.NonEmptyString;
  /**
   * Ec2 instance vpc name
   */
  readonly vpcName: t.NonEmptyString;
  /**
   * Ec2 image path
   */
  readonly imagePath: t.NonEmptyString;
  /**
   * Ec2 security group inbound sources
   *
   */
  readonly securityGroupInboundSources: t.NonEmptyString[];
  /**
   * Ec2 instance role name
   */
  readonly instanceRole: t.NonEmptyString;
  /**
   * Flag for Ec2 instance enable api termination protection
   * @default false
   */
  readonly enableTerminationProtection?: boolean;
  /**
   * Ec2 instance subnet name
   */
  readonly subnetName: t.NonEmptyString;
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryConfigurationInstanceUserDataConfig}*
   *
   * @description
   * Instance user data script configuration
   */
  readonly userDataScripts: IActiveDirectoryConfigurationInstanceUserDataConfig[];
  /**
   * Active directory group list
   */
  readonly adGroups: t.NonEmptyString[];
  /**
   * Active directory per account group list
   */
  readonly adPerAccountGroups: t.NonEmptyString[];
  /**
   * Active directory connector group
   */
  readonly adConnectorGroup: t.NonEmptyString;
  /**
   * Active directory user list
   */
  readonly adUsers: IActiveDirectoryUserConfig[];
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} {@link ActiveDirectoryPasswordPolicyConfig}*
   *
   * @description
   * Active directory user password policy
   */
  readonly adPasswordPolicy: IActiveDirectoryPasswordPolicyConfig;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectoryVpcSettingsConfig}*
 *
 * @description
 * Specifies the VPC settings of the Microsoft AD directory server in AWS
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
   * Friendly name of the vpc where active directory will be deployed
   */
  readonly vpcName: t.NonEmptyString;
  /**
   * Friendly name of the vpc subnets, where active directory will be deployed
   *
   * Minimum of two subnets from two different availability zone is required
   */
  readonly subnets: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig}*
 *
 * @description
 * Active directory logs configuration
 */
export interface IManagedActiveDirectoryLogConfig {
  /**
   * Active directory log group name,  that will be used to receive the security logs from your domain controllers. We recommend pre-pending the name with /aws/directoryservice/, but that is not required.
   *
   * @default undefined, Accelerator will create log group name as /aws/directoryservice/DirectoryServiceName
   */
  readonly groupName: t.NonEmptyString;
  /**
   * Log group retention in days
   */
  readonly retentionInDays?: number;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySecretConfig}*
 *
 * @description
 * Active directory admin user secret configuration.
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
   * Active directory admin user secret account name. When no account name provided Accelerator will create the secret into the account MAD exists
   *
   * Note: Please do not use the Management account for the admin user secret account name.
   */
  readonly account?: t.NonEmptyString;
  /**
   * Active directory admin user secret region name. When no region name provided Accelerator will create the secret into the region MAD exists
   */
  readonly region?: t.Region;
  /**
   * Active directory admin user secret account name. When no account name provided Accelerator will create the secret into the account MAD exists
   *
   * Note: Please do not use the Management account for the admin user secret account name.
   */
  readonly adminSecretName?: t.NonEmptyString;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySharedOuConfig}*
 *
 * @description
 * Active directory shared ou configuration.
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
  readonly organizationalUnits: t.NonEmptyString[];
  readonly excludedAccounts?: t.NonEmptyString[];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig}*
 *
 * @description
 * Managed Active directory configuration.
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
   * Friendly name for the active directory
   */
  readonly name: t.NonEmptyString;
  /**
   * Active directory deploy target account
   */
  readonly account: t.NonEmptyString;
  /**
   * Active directory deploy target region
   */
  readonly region: t.Region;
  /**
   * A fully qualified domain name. This name will resolve inside your VPC only. It does not need to be publicly resolvable.
   */
  readonly dnsName: t.NonEmptyString;
  /**
   * A short identifier for your Net BIOS domain name.
   */
  readonly netBiosDomainName: t.NonEmptyString;
  /**
   * Descriptive text that appears on the details page after the directory has been created.
   */
  readonly description?: t.NonEmptyString;
  /**
   * Active directory edition, example AWS Managed Microsoft AD is available in two editions: Standard and Enterprise
   */
  readonly edition: 'Standard' | 'Enterprise';
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryVpcSettingsConfig}*
   *
   * @description
   * Specifies the VPC settings of the Microsoft AD directory server in AWS
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
  readonly vpcSettings: IManagedActiveDirectoryVpcSettingsConfig;
  /**
   * (OPTIONAL) Active directory route 53 resolver rule name
   *
   * @remarks
   * This is the `name` property of a Route 53 resolver rule as defined in
   * network-config.yaml {@link ResolverRuleConfig}. When this property is defined,
   * the configured resolver rule will be updated with the IP addresses of the Managed AD instances.
   */
  readonly resolverRuleName?: t.NonEmptyString;
  /**
   * (OPTIONAL) Active directory admin user secret configuration.
   *
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySecretConfig}
   */
  readonly secretConfig?: IManagedActiveDirectorySecretConfig;
  /**
   * (OPTIONAL) Active directory shared ou configuration.
   *
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySharedOuConfig}
   */
  readonly sharedOrganizationalUnits?: IManagedActiveDirectorySharedOuConfig;
  /**
   * (OPTIONAL) Active directory shared account name list.
   */
  readonly sharedAccounts?: t.NonEmptyString[];
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectoryLogConfig}
   *
   * @description
   * (OPTIONAL) Active directory logs configuration
   */
  readonly logs?: IManagedActiveDirectoryLogConfig;
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig}*
   *
   * @description
   * (OPTIONAL) Active directory instance to configure active directory
   */
  readonly activeDirectoryConfigurationInstance?: IActiveDirectoryConfigurationInstanceConfig;
}

/**
 * IAM configuration
 */
export interface IIamConfig {
  /**
   * Accelerator home region name.
   *
   * @example
   * ```
   * homeRegion: &HOME_REGION us-east-1
   * ```
   */
  readonly homeRegion?: t.Region;
  /**
   * SAML provider configuration
   * To configure SAML configuration, you need to provide the following values for this parameter.
   * Replace provider name and metadata document file. Document file must be in config repository
   *
   * @example
   * ```
   * providers:
   *  - name: <PROVIDER_NAME>
   *    metadataDocument: <METADATA_DOCUMENT_FILE>
   * ```
   *
   * @see {@link IamConfig} / {@link SamlProviderConfig}
   */
  readonly providers?: ISamlProviderConfig[];
  /**
   * Policy set configuration.
   *
   * To configure IAM policy named Default-Boundary-Policy with permission boundary defined in iam-policies/boundary-policy.json file, you need to provide following values for this parameter.
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
   * @see {@link IamConfig} / {@link PolicySetConfig}
   */
  readonly policySets?: IPolicySetConfig[];
  /**
   * Role sets configuration
   *
   * @remarks To configure EC2-Default-SSM-AD-Role role to be assumed by ec2 service into Root and Infrastructure organizational units,
   * you need to provide following values for this parameter. This role will have AmazonSSMManagedInstanceCore, AmazonSSMDirectoryServiceAccess and CloudWatchAgentServerPolicy policy
   * with permission boundary defined by Default-Boundary-Policy
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
   * Group set configuration
   *
   * @remarks To configure IAM group named Administrators into Root and Infrastructure organizational units, you need to provide following values for this parameter.
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
   * @see {@link IamConfig} / {@link GroupSetConfig}
   */
  readonly groupSets?: IGroupSetConfig[];
  /**
   * User set configuration
   *
   * @remarks To configure breakGlassUser01 user into Administrators in Management account, you need to provide following values for this parameter.
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
   * @see {@link IamConfig} / {@link UserSetConfig}
   *
   */
  readonly userSets?: IUserSetConfig[];
  /**
   * @description
   * Managed active directory configuration
   *
   * @remarks To configure AWS Microsoft managed active directory of enterprise edition, along with accelerator provisioned EC2 instance to pre configure directory users. group,
   * you need to provide following values for this parameter.
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
   * @see {@link IamConfig} / {@link ManagedActiveDirectoryConfig}
   */
  readonly managedActiveDirectories?: IManagedActiveDirectoryConfig[];
  /**
   *
   * Identity Center configuration
   *
   * @remarks To configure Identity Center, you need to provide following values for this parameter.
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
   * @see {@link IamConfig} / {@link IdentityCenterConfig}
   */
  readonly identityCenter?: IIdentityCenterConfig;
}

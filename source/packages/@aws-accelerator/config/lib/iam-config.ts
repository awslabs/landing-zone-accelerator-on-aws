/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils';

import { AccountsConfig } from './accounts-config';
import * as t from './common-types';

const logger = createLogger(['iam-config']);

/**
 * IAM Configuration items.
 */
export class IamConfigTypes {
  /**
   * SAML provider configuration
   */
  static readonly samlProviderConfig = t.interface({
    name: t.nonEmptyString,
    metadataDocument: t.nonEmptyString,
  });

  /**
   * IAM user configuration
   */
  static readonly userConfig = t.interface({
    username: t.nonEmptyString,
    group: t.nonEmptyString,
    boundaryPolicy: t.optional(t.nonEmptyString),
  });

  /**
   * User set configuration
   */
  static readonly userSetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    users: t.array(this.userConfig),
  });

  /**
   * IAM policies config
   */
  static readonly policiesConfig = t.interface({
    awsManaged: t.optional(t.array(t.nonEmptyString)),
    customerManaged: t.optional(t.array(t.nonEmptyString)),
  });

  /**
   * IAM group configuration
   */
  static readonly groupConfig = t.interface({
    name: t.nonEmptyString,
    policies: t.optional(this.policiesConfig),
  });

  /**
   * Group set configuration
   */
  static readonly groupSetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    groups: t.array(this.groupConfig),
  });

  /**
   * An enum for assume by configuration
   *
   * Possible values service, account or provider
   */
  static readonly assumedByTypeEnum = t.enums('AssumedByConfigType', ['service', 'account', 'provider']);

  /**
   * AssumedBy configuration
   */
  static readonly assumedByConfig = t.interface({
    /**
     * Type of IAM principal like service, account or provider, which can assume this role.
     */
    type: this.assumedByTypeEnum,
    /**
     * IAM principal of either service, account or provider type.
     *
     * Service principals are defined by the service and follow the pattern service.domain for example:
     *
     * ```
     * sns.amazonaws.com
     * ```
     * or
     * ```
     * sns.amazonaws.com.cn
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
     * ```
     * @example
     * ```
     * assumedBy:
     *   - type: service
     *     principal: 'ssm.amazonaws.com'
     * ```
     */
    principal: t.optional(t.nonEmptyString),
  });

  /**
   * IAM role configuration
   */
  static readonly roleConfig = t.interface({
    /**
     * A name for the IAM role. For valid values, see the RoleName parameter for the CreateRole action in the IAM API Reference.
     *
     */
    name: t.nonEmptyString,
    /**
     * Indicates whether role is used for EC2 instance profile
     */
    instanceProfile: t.optional(t.boolean),
    /**
     * AssumedBy configuration
     */
    assumedBy: t.array(this.assumedByConfig),
    /**
     * Policies configuration
     */
    policies: t.optional(this.policiesConfig),
    /**
     * A permissions boundary configuration
     */
    boundaryPolicy: t.optional(t.nonEmptyString),
  });

  /**
   * IAM role set configuration
   */
  static readonly roleSetConfig = t.interface({
    /**
     * Role set deployment targets
     */
    deploymentTargets: t.deploymentTargets,
    /**
     * The path to the role
     */
    path: t.optional(t.nonEmptyString),
    /**
     * List of role objects
     */
    roles: t.array(this.roleConfig),
  });

  /**
   * IAM policy configuration
   */
  static readonly policyConfig = t.interface({
    name: t.nonEmptyString,
    policy: t.nonEmptyString,
  });

  /**
   * Identity Center Permission Set configuration
   */
  static readonly identityCenterPermissionSetConfig = t.interface({
    name: t.nonEmptyString,
    policies: t.optional(this.policiesConfig),
    sessionDuration: t.optional(t.number),
  });

  /**
   * An enum for assume by configuration
   *
   * Possible values user or group
   */
  static readonly principalTypeEnum = t.enums('PrincipalType', ['USER', 'GROUP']);

  /**
   * Identity Center Assignment configuration
   */
  static readonly identityCenterAssignmentConfig = t.interface({
    permissionSetName: t.nonEmptyString,
    principalId: t.nonEmptyString,
    principalType: this.principalTypeEnum,
    deploymentTargets: t.deploymentTargets,
    name: t.nonEmptyString,
  });

  /**
   * Identity Center configuration
   */
  static readonly identityCenterConfig = t.interface({
    name: t.nonEmptyString,
    delegatedAdminAccount: t.optional(t.nonEmptyString),
    identityCenterPermissionSets: t.optional(t.array(this.identityCenterPermissionSetConfig)),
    identityCenterAssignments: t.optional(t.array(this.identityCenterAssignmentConfig)),
  });

  /**
   * IAM policy set configuration
   */
  static readonly policySetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    policies: t.array(this.policyConfig),
  });

  /**
   * Managed active directory user configuration
   */
  static activeDirectoryUserConfig = t.interface({
    name: t.nonEmptyString,
    email: t.nonEmptyString,
    groups: t.array(t.nonEmptyString),
  });

  /**
   * Managed active directory user password policy
   */
  static activeDirectoryPasswordPolicyConfig = t.interface({
    history: t.number,
    maximumAge: t.number,
    minimumAge: t.number,
    minimumLength: t.number,
    complexity: t.boolean,
    reversible: t.boolean,
    failedAttempts: t.number,
    lockoutDuration: t.number,
    lockoutAttemptsReset: t.number,
  });

  /**
   * Managed active directory configuration instance user data script configuration
   */
  static activeDirectoryConfigurationInstanceUserDataConfig = t.interface({
    scriptName: t.nonEmptyString,
    scriptFilePath: t.nonEmptyString,
  });

  /**
   * Managed active directory configuration instance config
   */
  static activeDirectoryConfigurationInstanceConfig = t.interface({
    instanceType: t.nonEmptyString,
    vpcName: t.nonEmptyString,
    imagePath: t.nonEmptyString,
    securityGroupInboundSources: t.array(t.nonEmptyString),
    instanceRole: t.nonEmptyString,
    enableTerminationProtection: t.optional(t.boolean),
    subnetName: t.nonEmptyString,
    userDataScripts: t.array(this.activeDirectoryConfigurationInstanceUserDataConfig),
    adGroups: t.array(t.nonEmptyString),
    adPerAccountGroups: t.array(t.nonEmptyString),
    adConnectorGroup: t.nonEmptyString,
    adUsers: t.array(this.activeDirectoryUserConfig),
    adPasswordPolicy: this.activeDirectoryPasswordPolicyConfig,
  });

  /**
   * Managed active directory vpc settings config
   */
  static readonly managedActiveDirectoryVpcSettingsConfig = t.interface({
    vpcName: t.nonEmptyString,
    subnets: t.array(t.nonEmptyString),
  });

  static readonly managedActiveDirectoryLogConfig = t.interface({
    groupName: t.nonEmptyString,
    retentionInDays: t.optional(t.number),
  });

  static readonly managedActiveDirectorySecretConfig = t.interface({
    account: t.optional(t.nonEmptyString),
    region: t.optional(t.region),
    adminSecretName: t.optional(t.nonEmptyString),
  });

  static readonly managedActiveDirectorySharedOuConfig = t.interface({
    organizationalUnits: t.array(t.nonEmptyString),
    excludedAccounts: t.optional(t.array(t.nonEmptyString)),
  });

  /**
   * Managed active directory config
   */
  static readonly managedActiveDirectoryConfig = t.interface({
    name: t.nonEmptyString,
    account: t.nonEmptyString,
    region: t.region,
    dnsName: t.nonEmptyString,
    netBiosDomainName: t.nonEmptyString,
    description: t.optional(t.nonEmptyString),
    edition: t.enums('DirectorySize', ['Standard', 'Enterprise']),
    vpcSettings: IamConfigTypes.managedActiveDirectoryVpcSettingsConfig,
    resolverRuleName: t.nonEmptyString,
    secretConfig: t.optional(this.managedActiveDirectorySecretConfig),
    sharedOrganizationalUnits: t.optional(this.managedActiveDirectorySharedOuConfig),
    sharedAccounts: t.optional(t.array(t.nonEmptyString)),
    logs: t.optional(IamConfigTypes.managedActiveDirectoryLogConfig),
    activeDirectoryConfigurationInstance: t.optional(this.activeDirectoryConfigurationInstanceConfig),
  });

  /**
   * IAM configuration
   */
  static readonly iamConfig = t.interface({
    providers: t.optional(t.array(this.samlProviderConfig)),
    policySets: t.optional(t.array(this.policySetConfig || [])),
    roleSets: t.optional(t.array(this.roleSetConfig)),
    groupSets: t.optional(t.array(this.groupSetConfig)),
    userSets: t.optional(t.array(this.userSetConfig)),
    managedActiveDirectories: t.optional(t.array(this.managedActiveDirectoryConfig)),
    identityCenter: t.optional(this.identityCenterConfig),
  });
}

/**
 * Active directory shared ou configuration.
 *
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySharedOuConfig}*
 *
 * @example
 *
 * ```
 * sharedOrganizationalUnits:
 *  organizationalUnits:
 *    - root
 *  excludedAccounts:
 *    - Audit
 * ```
 */
export class ManagedActiveDirectorySharedOuConfig
  implements t.TypeOf<typeof IamConfigTypes.managedActiveDirectorySharedOuConfig>
{
  readonly organizationalUnits: string[] = [];
  readonly excludedAccounts: string[] | undefined = undefined;
}

/**
 * Active directory admin user secret configuration.
 *
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySecretConfig}*
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
export class ManagedActiveDirectorySecretConfig
  implements t.TypeOf<typeof IamConfigTypes.managedActiveDirectorySecretConfig>
{
  /**
   * Active directory admin user secret name. LZA will prefix /accelerator/ad-user/<DirectoryName>/ for the secret name
   * For example when secret name value was given as admin-secret and directory name is AcceleratorManagedActiveDirectory
   * LZA will create secret name as /accelerator/ad-user/AcceleratorManagedActiveDirectory/admin-secret
   */
  readonly adminSecretName: string | undefined = undefined;
  /**
   * Active directory admin user secret account name. When no account name provided LZA will create the secret into the account MAD exists
   */
  readonly account: string | undefined = undefined;
  /**
   * Active directory admin user secret region name. When no region name provided LZA will create the secret into the region MAD exists
   */
  readonly region: t.Region = 'us-east-1';
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryConfigurationInstanceUserDataConfig}*
 *
 * User data scripts to create users, groups, password policy.
 *
 * LZA can be provision users, groups when following user data scripts are provided, these scripts are part of LZA best practices
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
export class ActiveDirectoryConfigurationInstanceUserDataConfig
  implements t.TypeOf<typeof IamConfigTypes.activeDirectoryConfigurationInstanceUserDataConfig>
{
  /**
   * Friendly name for the user data script
   */
  readonly scriptName = '';
  /**
   * Script file path
   */
  readonly scriptFilePath = '';
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryPasswordPolicyConfig}*
 *
 * Managed active directory user password policy configuration
 */
export class ActiveDirectoryPasswordPolicyConfig
  implements t.TypeOf<typeof IamConfigTypes.activeDirectoryPasswordPolicyConfig>
{
  readonly history = 24;
  readonly maximumAge = 90;
  readonly minimumAge = 1;
  readonly minimumLength = 14;
  readonly complexity = true;
  readonly reversible = false;
  readonly failedAttempts = 6;
  readonly lockoutDuration = 30;
  readonly lockoutAttemptsReset = 30;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryUserConfig}*
 *
 *
 * Active directory user configuration
 */
export class ActiveDirectoryUserConfig implements t.TypeOf<typeof IamConfigTypes.activeDirectoryUserConfig> {
  /**
   * Active directory user name
   */
  readonly name = '';
  /**
   * Active directory user email
   */
  readonly email = '';
  /**
   * Active directory user group names
   */
  readonly groups = [];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig}*
 *
 * Active directory configuration instance configuration. The machine will be used to configure and manage active directory configuration.
 * LZA can create user, groups when following configuration provided
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
export class ActiveDirectoryConfigurationInstanceConfig
  implements t.TypeOf<typeof IamConfigTypes.activeDirectoryConfigurationInstanceConfig>
{
  /**
   * Ec2 instance type
   */
  readonly instanceType = '';
  /**
   * Ec2 instance vpc name
   */
  readonly vpcName = '';
  /**
   * Ec2 image path
   */
  readonly imagePath = '';
  /**
   * Ec2 security group inbound sources
   *
   */
  readonly securityGroupInboundSources = [];
  /**
   * Ec2 instance role name
   */
  readonly instanceRole = '';
  /**
   * Flag for Ec2 instance enable api termination protection
   * @default false
   */
  readonly enableTerminationProtection: boolean | undefined = undefined;
  /**
   * Ec2 instance subnet name
   */
  readonly subnetName = '';
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} / {@link ActiveDirectoryConfigurationInstanceUserDataConfig}*
   *
   * Instance user data script configuration
   */
  readonly userDataScripts: ActiveDirectoryConfigurationInstanceUserDataConfig[] = [];
  /**
   * Active directory group list
   */
  readonly adGroups: string[] = [];
  /**
   * Active directory per account group list
   */
  readonly adPerAccountGroups: string[] = [];
  /**
   * Active directory connector group
   */
  readonly adConnectorGroup = '';
  /**
   * Active directory user list
   */
  readonly adUsers: ActiveDirectoryUserConfig[] = [];
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig} {@link ActiveDirectoryPasswordPolicyConfig}*
   *
   * Active directory user password policy
   */
  readonly adPasswordPolicy: ActiveDirectoryPasswordPolicyConfig = new ActiveDirectoryPasswordPolicyConfig();
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig}*
 *
 * Active directory logs configuration
 */
export class ManagedActiveDirectoryLogConfig
  implements t.TypeOf<typeof IamConfigTypes.managedActiveDirectoryLogConfig>
{
  /**
   * Active directory log group name,  that will be used to receive the security logs from your domain controllers. We recommend pre-pending the name with /aws/directoryservice/, but that is not required.
   *
   * @default undefined, LZA will create log group name as /aws/directoryservice/DirectoryServiceName
   */
  readonly groupName = '';
  /**
   * Log group retention in days
   */
  readonly retentionInDays: number | undefined = undefined;
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectoryVpcSettingsConfig}*
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
export class ManagedActiveDirectoryVpcSettingsConfig
  implements t.TypeOf<typeof IamConfigTypes.managedActiveDirectoryVpcSettingsConfig>
{
  /**
   * Friendly name of the vpc where active directory will be deployed
   */
  readonly vpcName = '';
  /**
   * Friendly name of the vpc subnets, where active directory will be deployed
   *
   * Minimum of two subnets from two different availability zone is required
   */
  readonly subnets = [];
}

/**
 * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig}*
 *
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
export class ManagedActiveDirectoryConfig implements t.TypeOf<typeof IamConfigTypes.managedActiveDirectoryConfig> {
  /**
   * Friendly name for the active directory
   */
  readonly name = '';
  /**
   * Active directory deploy target account
   */
  readonly account = '';
  /**
   * Active directory deploy target region
   */
  readonly region: t.Region = 'us-east-1';
  /**
   * A fully qualified domain name. This name will resolve inside your VPC only. It does not need to be publicly resolvable.
   */
  readonly dnsName = '';
  /**
   * A short identifier for your Net BIOS domain name.
   */
  readonly netBiosDomainName = '';
  /**
   * Descriptive text that appears on the details page after the directory has been created.
   */
  readonly description: string | undefined = undefined;
  /**
   * Active directory edition, example AWS Managed Microsoft AD is available in two editions: Standard and Enterprise
   */
  readonly edition = 'Standard';
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryVpcSettingsConfig}*
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
  readonly vpcSettings: ManagedActiveDirectoryVpcSettingsConfig = new ManagedActiveDirectoryVpcSettingsConfig();
  /**
   * Active directory route 53 resolver rule name
   */
  readonly resolverRuleName = '';
  /**
   * Active directory admin user secret configuration.
   *
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySecretConfig}
   */
  readonly secretConfig: ManagedActiveDirectorySecretConfig | undefined = undefined;
  /**
   * Active directory shared ou configuration.
   *
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectorySharedOuConfig}
   */
  readonly sharedOrganizationalUnits: ManagedActiveDirectorySharedOuConfig | undefined = undefined;
  /**
   * Active directory shared account name list.
   */
  readonly sharedAccounts: string[] | undefined = undefined;
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ManagedActiveDirectoryLogConfig}
   *
   * Active directory logs configuration
   */
  readonly logs: ManagedActiveDirectoryLogConfig | undefined = undefined;
  /**
   * *{@link IamConfig} / {@link ManagedActiveDirectoryConfig} / {@link ActiveDirectoryConfigurationInstanceConfig}*
   *
   * Active directory instance to configure active directory
   */
  readonly activeDirectoryConfigurationInstance: ActiveDirectoryConfigurationInstanceConfig | undefined = undefined;
}

/**
 * *{@link IamConfig} / {@link SamlProviderConfig}*
 *
 * SAML provider configuration
 *
 * @example
 * ```
 * providers:
 *   - name: accelerator-provider
 *     metadataDocument: path/to/metadata.xml
 * ```
 */
export class SamlProviderConfig implements t.TypeOf<typeof IamConfigTypes.samlProviderConfig> {
  /**
   * The name of the provider to create.
   *
   * This parameter allows a string of characters consisting of upper and lowercase alphanumeric characters with no spaces. You can also include any of the following characters: _+=,.@-
   *
   * Length must be between 1 and 128 characters.
   *
   * @default a CloudFormation generated name
   */
  readonly name: string = '';
  /**
   * SAML metadata document XML file, this file must be present in config repository
   */
  readonly metadataDocument: string = '';
}

/**
 * *{@link IamConfig} / {@link UserSetConfig} / {@link UserConfig}*
 *
 * IAM User configuration
 *
 * @example
 * ```
 * - username: accelerator-user
 *   boundaryPolicy: Default-Boundary-Policy
 *   group: Admins
 * ```
 */
export class UserConfig implements t.TypeOf<typeof IamConfigTypes.userConfig> {
  /**
   * A name for the IAM user. For valid values, see the UserName parameter for the CreateUser action in the IAM API Reference.
   * If you don't specify a name, AWS CloudFormation generates a unique physical ID and uses that ID for the user name.
   *
   * If you specify a name, you cannot perform updates that require replacement of this resource.
   * You can perform updates that require no or some interruption. If you must replace the resource, specify a new name.
   */
  readonly username: string = '';
  /**
   * AWS supports permissions boundaries for IAM entities (users or roles).
   * A permissions boundary is an advanced feature for using a managed policy to set the maximum permissions that an identity-based policy can grant to an IAM entity.
   * An entity's permissions boundary allows it to perform only the actions that are allowed by both its identity-based policies and its permissions boundaries.
   *
   * Permission boundary is derived from iam-policies/boundary-policy.json file in config repository
   */
  readonly boundaryPolicy: string = '';
  /**
   * Group to add this user to.
   */
  readonly group: string = '';
}

/**
 * *{@link IamConfig} / {@link UserSetConfig}*
 *
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
export class UserSetConfig implements t.TypeOf<typeof IamConfigTypes.userSetConfig> {
  /**
   * User set's deployment target
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * List os user objects
   */
  readonly users: UserConfig[] = [];
}

/**
 * *{@link IamConfig} / {@link GroupConfig} | {@link RoleConfig} / {@link PoliciesConfig}*
 *
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
export class PoliciesConfig implements t.TypeOf<typeof IamConfigTypes.policiesConfig> {
  /**
   * List of AWS managed policies
   */
  readonly awsManaged: string[] = [];
  /**
   * List of Customer managed policies
   */
  readonly customerManaged: string[] = [];
}

/**
 * *{@link IamConfig} / {@link GroupSetConfig} / {@link GroupConfig}*
 *
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
export class GroupConfig implements t.TypeOf<typeof IamConfigTypes.groupConfig> {
  /**
   * A name for the IAM group. For valid values, see the GroupName parameter for the CreateGroup action in the IAM API Reference.
   * If you don't specify a name, AWS CloudFormation generates a unique physical ID and uses that ID for the group name.
   *
   * If you specify a name, you must specify the CAPABILITY_NAMED_IAM value to acknowledge your template's capabilities.
   * For more information, see Acknowledging IAM Resources in AWS CloudFormation Templates.
   */
  readonly name: string = '';
  /**
   * List of policy objects
   */
  readonly policies: PoliciesConfig | undefined = undefined;
}

/**
 * *{@link IamConfig} / {@link GroupSetConfig}*
 *
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
export class GroupSetConfig implements t.TypeOf<typeof IamConfigTypes.groupSetConfig> {
  /**
   * Group set's deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * List of IAM group objects
   */
  readonly groups: GroupConfig[] = [];
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig} / {@link AssumedByConfig}*
 *
 * AssumedBy configuration
 *
 * @example
 * ```
 * - principal: ec2.amazonaws.com
 *   type: service
 * ```
 */
export class AssumedByConfig implements t.TypeOf<typeof IamConfigTypes.assumedByConfig> {
  /**
   * IAM principal of either service, account or provider type.
   *
   * IAM principal of sns service type (i.e. new ServicePrincipal('sns.amazonaws.com')), which can assume this role.
   */
  readonly principal: string = '';
  /**
   * Type of IAM principal type like service, account or provider, which can assume this role.
   */
  readonly type!: t.TypeOf<typeof IamConfigTypes.assumedByTypeEnum>;
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig} / {@link RoleConfig}*
 *
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
export class RoleConfig implements t.TypeOf<typeof IamConfigTypes.roleConfig> {
  /**
   * AssumedBy configuration
   */
  readonly assumedBy: AssumedByConfig[] = [];
  /**
   * Indicates whether role is used for EC2 instance profile
   */
  readonly instanceProfile: boolean | undefined = undefined;
  /**
   * A permissions boundary configuration
   */
  readonly boundaryPolicy: string = '';
  /**
   * A name for the role
   */
  readonly name: string = '';
  /**
   * List of policies for the role
   */
  readonly policies: PoliciesConfig | undefined = undefined;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig}*
 *
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
 *        customerManaged:
 *          - ResourceConfigurationCollectorPolicy
 *      sessionDuration: 60
 *  identityCenterAssignments:
 *    - name: Assignment1
 *      permissionSetName: PermissionSet1
 *      principalId: "a4e81468-1001-70f0-9c12-56a6aa967ca4"
 *      principalType: USER
 *      deploymentTargets:
 *        accounts:
 *          - LogArchive
 * ```
 */

export class IdentityCenterConfig implements t.TypeOf<typeof IamConfigTypes.identityCenterConfig> {
  /**
   * A name for the Identity Center Configuration
   */
  readonly name: string = '';

  /**
   * Override for Delegated Admin Account
   * 
   *  All LZA-managed Identity Center Permission Sets and Assignments must be removed before changing the service's delegated administrator. To change this property:

   *  Remove or comment out the existing PermissionSets and Assignments from identityCenter configuration from iam-config.yaml.
   *  Important: You must leave identityCenter, name, and delegatedAdminAccount. 
   *  Run the pipeline to remove the resources.
   *  Add or uncomment the desired identityCenter configuration to iam-config.yaml.
   *  Set the delegatedAdminAccount property to the desired new delegated administrator account.
   *  Run the pipeline to update the delegated admin and create Identity Center resources.
  */
  readonly delegatedAdminAccount: string = '';

  /**
   * List of PermissionSets
   */
  readonly identityCenterPermissionSets: IdentityCenterPermissionSetConfig[] = [];

  /**
   * List of Assignments
   */
  readonly identityCenterAssignments: IdentityCenterAssignmentConfig[] = [];
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterPermissionSetConfig}*
 *
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
 *       customerManaged:
 *         - ResourceConfigurationCollectorPolicy
 *     sessionDuration: 60
 * ```
 */
export class IdentityCenterPermissionSetConfig
  implements t.TypeOf<typeof IamConfigTypes.identityCenterPermissionSetConfig>
{
  /**
   * A name for the Identity Center Permission Set Configuration
   */
  readonly name: string = '';

  /**
   * Policy Configuration for Customer Managed Permissions and AWS Managed Permissions
   */
  readonly policies: PoliciesConfig | undefined = undefined;

  /**
   * A number value (in minutes) for length of SSO session Duration association with Permissions Set (Defaults to 60).
   */
  readonly sessionDuration: number = 60;
}

/**
 * *{@link IamConfig} / {@link IdentityCenterConfig} / {@link IdentityCenterAssignmentConfig}*
 *
 * Identity Center Assignment Configuration
 *
 * @example
 * ```
 * identityCenterAssignments:
 *   - name: Assignment1
 *     permissionSetName: PermissionSet1
 *     principalId: "a4e81468-1001-70f0-9c12-56a6aa967ca4"
 *     principalType: USER
 *     deploymentTargets:
 *       accounts:
 *         - LogArchive
 *   - name: Assignment2
 *     permissionSetName: PermissionSet2
 *     principalId: "a4e81468-1001-70f0-9c12-56a6aa967ca4"
 *     principalType: GROUP
 *     deploymentTargets:
 *       organizationalUnits:
 *         - Security
 * ```
 */
export class IdentityCenterAssignmentConfig implements t.TypeOf<typeof IamConfigTypes.identityCenterAssignmentConfig> {
  /**
   * The Name for the Assignment
   */
  readonly name: string = '';

  /**
   * Arn of the Permission Set that will be used for the Assignment
   */
  readonly permissionSetName: string = '';

  /**
   * PrincipalId that will be used for the Assignment
   */
  readonly principalId: string = '';

  /**
   * PrincipalType that will be used for the Assignment
   */
  readonly principalType: t.TypeOf<typeof IamConfigTypes.principalTypeEnum> = 'USER';

  /**
   * Role set deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
}

/**
 * *{@link IamConfig} / {@link RoleSetConfig}*
 *
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
export class RoleSetConfig implements t.TypeOf<typeof IamConfigTypes.roleSetConfig> {
  /**
   * Role set deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  /**
   * The path to the role
   */
  readonly path: string | undefined = undefined;
  /**
   * List of role objects
   */
  readonly roles: RoleConfig[] = [];
}

/**
 * *{@link IamConfig} / {@link PolicySetConfig} / {@link PolicyConfig}*
 *
 * IAM policy configuration
 *
 * @example
 * ```
 * - name: Default-Boundary-Policy
 *   policy: path/to/policy.json
 * ```
 */
export class PolicyConfig implements t.TypeOf<typeof IamConfigTypes.policyConfig> {
  /**
   * A name for the policy
   */
  readonly name: string = '';
  /**
   * A JSON file containing policy boundary definition
   */
  readonly policy: string = '';
}

/**
 * *{@link IamConfig} / {@link PolicySetConfig}*
 *
 * Policy set configuration
 *
 * @example
 * ```
 * policySets:
 *   - deploymentTargets:
 *       organizationalUnits:
 *         - Root
 *     policies:
 *       - name: Default-Boundary-Policy
 *         policy: path/to/policy.json
 * ```
 */
export class PolicySetConfig implements t.TypeOf<typeof IamConfigTypes.policySetConfig> {
  /**
   * Policy set deployment targets
   */
  readonly deploymentTargets: t.DeploymentTargets = new t.DeploymentTargets();
  readonly policies: PolicyConfig[] = [];
}

/**
 * IAM configuration
 */
export class IamConfig implements t.TypeOf<typeof IamConfigTypes.iamConfig> {
  /**
   * A name for the iam config file in config repository
   *
   * @default iam-config.yaml
   */
  static readonly FILENAME = 'iam-config.yaml';

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
   */
  readonly providers: SamlProviderConfig[] = [];

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
   *     policies:
   *       - name: Default-Boundary-Policy
   *         policy: iam-policies/boundary-policy.json
   * ```
   */
  readonly policySets: PolicySetConfig[] = [];

  /**
   * Role sets configuration
   *
   * To configure EC2-Default-SSM-AD-Role role to be assumed by ec2 service into Root and Infrastructure organizational units,
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
   */
  readonly roleSets: RoleSetConfig[] = [];

  /**
   * Group set configuration
   *
   * To configure IAM group named Administrators into Root and Infrastructure organizational units, you need to provide following values for this parameter.
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
   */
  readonly groupSets: GroupSetConfig[] = [];

  /**
   * User set configuration
   *
   * To configure breakGlassUser01 user into Administrators in Management account, you need to provide following values for this parameter.
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
   */
  readonly userSets: UserSetConfig[] = [];

  /**
   * Identity Center configuration
   *
   * To configure Identity Center, you need to provide following values for this parameter.
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
   *        customerManaged:
   *          - ResourceConfigurationCollectorPolicy
   *      sessionDuration: 60
   *  identityCenterAssignments:
   *    - name: Assignment1
   *      permissionSetName: PermissionSet1
   *      principalId: "a4e81468-1001-70f0-9c12-56a6aa967ca4"
   *      principalType: USER
   *      deploymentTargets:
   *        accounts:
   *          - LogArchive
   * ```
   */

  readonly identityCenter: IdentityCenterConfig | undefined = undefined;

  /**
   * Managed active directory configuration
   *
   * To configure AWS Microsoft managed active directory of enterprise edition, along with LZA provisioned EC2 instance to pre configure directory users. group,
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
   */
  readonly managedActiveDirectories: ManagedActiveDirectoryConfig[] | undefined = undefined;

  /**
   *
   * @param values
   */
  constructor(values?: t.TypeOf<typeof IamConfigTypes.iamConfig>) {
    Object.assign(this, values);
  }

  /**
   * Load from config file content
   * @param dir
   * @returns
   */
  static load(dir: string): IamConfig {
    const buffer = fs.readFileSync(path.join(dir, IamConfig.FILENAME), 'utf8');
    const values = t.parse(IamConfigTypes.iamConfig, yaml.load(buffer));
    return new IamConfig(values);
  }

  /**
   * Load from string content
   * @param content
   */
  static loadFromString(content: string): IamConfig | undefined {
    try {
      const values = t.parse(IamConfigTypes.iamConfig, yaml.load(content));
      return new IamConfig(values);
    } catch (e) {
      logger.error('Error parsing input, iam config undefined');
      logger.error(`${e}`);
      throw new Error('Could not load iam configuration');
    }
  }

  public getManageActiveDirectoryAdminSecretName(directoryName: string): string {
    let directoryFound = false;
    for (const managedActiveDirectory of this.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.name === directoryName) {
        directoryFound = true;
        if (managedActiveDirectory.secretConfig) {
          if (managedActiveDirectory.secretConfig.adminSecretName) {
            return managedActiveDirectory.secretConfig.adminSecretName;
          }
        }
      }
    }
    if (directoryFound) {
      return 'admin';
    }
    logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
    throw new Error('configuration validation failed.');
  }

  public getManageActiveDirectorySecretAccountName(directoryName: string): string {
    let directoryFound = false;
    let directoryAccount = '';
    for (const managedActiveDirectory of this.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.name === directoryName) {
        directoryFound = true;
        directoryAccount = managedActiveDirectory.account;
        if (managedActiveDirectory.secretConfig) {
          if (managedActiveDirectory.secretConfig.account) {
            return managedActiveDirectory.secretConfig.account;
          } else {
            managedActiveDirectory.account;
          }
        }
      }
    }
    if (directoryFound) {
      return directoryAccount;
    }
    logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
    throw new Error('configuration validation failed.');
  }

  public getManageActiveDirectorySecretRegion(directoryName: string): string {
    let directoryFound = false;
    let directoryRegion = '';
    for (const managedActiveDirectory of this.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.name === directoryName) {
        directoryFound = true;
        directoryRegion = managedActiveDirectory.account;
        if (managedActiveDirectory.secretConfig) {
          if (managedActiveDirectory.secretConfig.region) {
            return managedActiveDirectory.secretConfig.region;
          } else {
            managedActiveDirectory.region;
          }
        }
      }
    }

    if (directoryFound) {
      return directoryRegion;
    }
    logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
    throw new Error('configuration validation failed.');
  }

  public getManageActiveDirectorySharedAccountNames(directoryName: string, configDir: string): string[] {
    const sharedAccounts: string[] = [];

    let directoryFound = false;
    let directoryAccount: string | undefined;
    for (const managedActiveDirectory of this.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.name === directoryName) {
        directoryFound = true;
        directoryAccount = managedActiveDirectory.account;

        if (managedActiveDirectory.sharedOrganizationalUnits) {
          const accountsConfig = AccountsConfig.load(configDir);
          const allAccountItems = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts];
          const allAccounts: string[] = [];
          for (const account of allAccountItems ?? []) {
            allAccounts.push(account.name);
          }
          const excludedAccounts = managedActiveDirectory.sharedOrganizationalUnits.excludedAccounts ?? [];
          const includedAccounts = allAccounts.filter(item => !excludedAccounts.includes(item));

          for (const ou of managedActiveDirectory.sharedOrganizationalUnits.organizationalUnits) {
            if (ou === 'Root') {
              sharedAccounts.push(...includedAccounts);
            } else {
              for (const account of allAccountItems ?? []) {
                if (ou === account.organizationalUnit && includedAccounts.includes(account.name)) {
                  sharedAccounts.push(account.name);
                }
              }
            }
          }
        }

        if (managedActiveDirectory.sharedAccounts) {
          sharedAccounts.push(...managedActiveDirectory.sharedAccounts);
        }
      }
    }

    if (directoryFound) {
      // mad account can't be part of shared account
      return sharedAccounts.filter(item => item !== directoryAccount!);
    }
    logger.error(`getManageActiveDirectoryAdminSecretName Directory ${directoryName} not found in iam-config file`);
    throw new Error('configuration validation failed.');
  }
}

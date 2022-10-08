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

import * as t from './common-types';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

import { OrganizationConfig } from './organization-config';
import { AccountsConfig } from './accounts-config';

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
   * Assumedby configuration
   */
  static readonly assumedByConfig = t.interface({
    /**
     * Type of IAM principal like service, account or provider, which can assume this role.
     */
    type: this.assumedByTypeEnum,
    /**
     * IAM principal of either service, account or provider type.
     *
     * IAM principal of sns service type (i.e. new ServicePrincipal('sns.amazonaws.com')), which can assume this role.
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
   * IAM policy set configuration
   */
  static readonly policySetConfig = t.interface({
    deploymentTargets: t.deploymentTargets,
    policies: t.array(this.policyConfig),
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
  });
}

/**
 * SAML provider configuration
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
 * IAM User configuration
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
 * User set configuration
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
 * IAM policies configuration
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
 * IAM group configuration
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
 * IAM group set configuration
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
 * Assumedby configuration
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
 * IAM Role configuration
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
 * Role set configuration
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
 * IAM policy configuration
 */
export class PolicyConfig implements t.TypeOf<typeof IamConfigTypes.policyConfig> {
  /**
   * A name for the policy
   */
  readonly name: string = '';
  /**
   * A XML file containing policy boundary definition
   */
  readonly policy: string = '';
}

/**
 * Policy set configuration
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
   *  name: <PROVIDER_NAME>,
   *  metadataDocument: <METADATA_DOCUMENT_FILE>,
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
   *
   * @param values
   * @param configDir
   * @param validateConfig
   */
  constructor(values?: t.TypeOf<typeof IamConfigTypes.iamConfig>, configDir?: string, validateConfig?: boolean) {
    const errors: string[] = [];
    const ouIdNames: string[] = ['Root'];
    const accountNames: string[] = [];

    //
    // Validation errors
    //
    if (values) {
      //
      // Validation
      if (configDir && validateConfig) {
        //
        // Get list of OU ID names from organization config file
        this.getOuIdNames(configDir, ouIdNames);

        //
        // Get list of Account names from account config file
        this.getAccountNames(configDir, accountNames);

        //
        // Validate policy file existence
        //
        this.validatePolicyFileExists(configDir, values, errors);

        // Validate target OU names
        this.validateDeploymentTargetOUs(values, ouIdNames, errors);

        // Validate target account names
        this.validateDeploymentTargetAccountNames(values, accountNames, errors);
      }

      if (errors.length) {
        throw new Error(`${IamConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
      }

      Object.assign(this, values);
    }
  }

  /**
   * Prepare list of OU ids from organization config file
   * @param configDir
   */
  private getOuIdNames(configDir: string, ouIdNames: string[]) {
    for (const organizationalUnit of OrganizationConfig.load(configDir).organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
    }
  }

  /**
   * Prepare list of Account names from account config file
   * @param configDir
   */
  private getAccountNames(configDir: string, accountNames: string[]) {
    for (const accountItem of [
      ...AccountsConfig.load(configDir).mandatoryAccounts,
      ...AccountsConfig.load(configDir).workloadAccounts,
    ]) {
      accountNames.push(accountItem.name);
    }
  }

  /**
   * Validate policy file existence
   * @param configDir
   * @param values
   * @returns
   */
  private validatePolicyFileExists(
    configDir: string,
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    errors: string[],
  ) {
    const policies: { name: string; policyFile: string }[] = [];
    for (const policySet of values.policySets ?? []) {
      for (const policy of policySet.policies) {
        policies.push({ name: policy.name, policyFile: policy.policy });
      }
    }

    for (const policy of policies) {
      if (!fs.existsSync(path.join(configDir, policy.policyFile))) {
        errors.push(`Policy definition file ${policy.policyFile} not found, for ${policy.name} !!!`);
      }
    }
  }

  /**
   * Function to validate existence of policy sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validatePolicySetsAccountNames(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const policySet of values.policySets ?? []) {
      for (const account of policySet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for policy sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of role sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateRoleSetsAccountNames(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const roleSet of values.roleSets ?? []) {
      for (const account of roleSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for role sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of group sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateGroupSetsAccountNames(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const groupSet of values.groupSets ?? []) {
      for (const account of groupSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for group sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of user sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateUserSetsAccountNames(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const userSet of values.userSets ?? []) {
      for (const account of userSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for user sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate Deployment targets OU name for IAM services
   * @param values
   */
  private validateDeploymentTargetAccountNames(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    //
    // Validate policy sets account name
    //
    this.validatePolicySetsAccountNames(values, accountNames, errors);

    //
    // Validate role sets account name
    //
    this.validateRoleSetsAccountNames(values, accountNames, errors);

    //
    // Validate group sets account name
    //
    this.validateGroupSetsAccountNames(values, accountNames, errors);

    //
    // Validate user sets account name
    //
    this.validateUserSetsAccountNames(values, accountNames, errors);
  }

  /**
   * Function to validate existence of policy sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validatePolicySetsDeploymentTargetOUs(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const policySet of values.policySets ?? []) {
      for (const ou of policySet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for policy set does not exists in organization-config.yaml file.`);
        }
      }
    }
  }

  /**
   * Function to validate existence of role sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateRoleSetsDeploymentTargetOUs(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const roleSet of values.roleSets ?? []) {
      for (const ou of roleSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for role set does not exists in organization-config.yaml file.`);
        }
      }
    }
  }

  /**
   * Function to validate existence of group sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateGroupSetsDeploymentTargetOUs(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const groupSet of values.groupSets ?? []) {
      for (const ou of groupSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for group set does not exists in organization-config.yaml file.`);
        }
      }
    }
  }

  /**
   * Function to validate existence of user sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateUserSetsDeploymentTargetOUs(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const userSet of values.userSets ?? []) {
      for (const ou of userSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for user set does not exists in organization-config.yaml file.`);
        }
      }
    }
  }

  /**
   * Function to validate Deployment targets OU name for IAM services
   * @param values
   */
  private validateDeploymentTargetOUs(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    //
    // Validate policy sets OU name
    //
    this.validatePolicySetsDeploymentTargetOUs(values, ouIdNames, errors);

    //
    // Validate role sets OU name
    //
    this.validateRoleSetsDeploymentTargetOUs(values, ouIdNames, errors);

    //
    // Validate group sets OU name
    //
    this.validateGroupSetsDeploymentTargetOUs(values, ouIdNames, errors);

    //
    // Validate user sets OU name
    //
    this.validateUserSetsDeploymentTargetOUs(values, ouIdNames, errors);
  }

  /**
   * Load from config file content
   * @param dir
   * @param validateConfig
   * @returns
   */
  static load(dir: string, validateConfig?: boolean): IamConfig {
    const buffer = fs.readFileSync(path.join(dir, IamConfig.FILENAME), 'utf8');
    const values = t.parse(IamConfigTypes.iamConfig, yaml.load(buffer));
    return new IamConfig(values, dir, validateConfig);
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
      console.log('[iam-config] Error parsing input, global config undefined');
      console.log(`${e}`);
      return undefined;
    }
  }
}

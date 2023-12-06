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
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils';

import { AccountsConfig } from '../lib/accounts-config';
import { CommonValidatorFunctions } from './common/common-validator-functions';
import * as t from '../lib/common-types';
import { IamConfig, IamConfigTypes, PolicySetConfig } from '../lib/iam-config';
import { NetworkConfig } from '../lib/network-config';
import { OrganizationConfig } from '../lib/organization-config';
import { SecurityConfig } from '../lib/security-config';
import { hasDuplicates } from './utils/common-validator-functions';

type VpcSubnetListsType = {
  vpcName: string;
  subnetName: string;
  subnetAz: string | number;
};

/**
 * IAM Configuration validator.
 * Validates iam configuration
 */
export class IamConfigValidator {
  constructor(
    values: IamConfig,
    accountsConfig: AccountsConfig,
    networkConfig: NetworkConfig,
    organizationConfig: OrganizationConfig,
    securityConfig: SecurityConfig,
    configDir: string,
  ) {
    const ouIdNames: string[] = ['Root'];
    const keyNames: string[] = [];

    const errors: string[] = [];
    const logger = createLogger(['iam-config-validator']);

    logger.info(`${IamConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    ouIdNames.push(...this.getOuIdNames(organizationConfig));

    //
    // Get list of Account names from account config file
    const accountNames = this.getAccountNames(accountsConfig);

    //
    // Get list of Kms key names from security config file
    this.getKmsKeyNames(keyNames, securityConfig);

    //
    // Get Vpc and subnet lists
    //
    const vpcSubnetLists = this.getVpcSubnetLists(networkConfig);

    //
    // Start Validation

    //
    // Validate IAM policies
    //
    this.validatePolicies(configDir, values, errors);
    //
    // Validate IAM roles
    //
    this.validateRoles(values, errors);

    // Validate target OU names
    this.validateDeploymentTargetOUs(values, ouIdNames, errors);

    // Validate target account names
    this.validateDeploymentTargetAccountNames(values, accountNames, errors);

    // Validate Identity Center Object
    this.validateIdentityCenter(values, accountsConfig, errors);

    //
    // Validate IAM principal assignments for roles
    //
    this.validateIamPolicyTargets(values, accountsConfig, errors);

    // Validate Managed active directory
    new ManagedActiveDirectoryValidator(values, vpcSubnetLists, ouIdNames, accountNames, errors);

    if (errors.length) {
      throw new Error(`${IamConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
  }

  /**
   * Prepare list of OU ids from organization config file
   * @param organizationConfig
   * @returns
   */
  private getOuIdNames(organizationConfig: OrganizationConfig): string[] {
    const ouIdNames: string[] = [];
    for (const organizationalUnit of organizationConfig.organizationalUnits) {
      ouIdNames.push(organizationalUnit.name);
    }
    return ouIdNames;
  }

  /**
   * Prepare list of Account names from account config file
   * @param accountsConfig
   * @returns
   */
  private getAccountNames(accountsConfig: AccountsConfig): string[] {
    const accountNames: string[] = [];
    for (const accountItem of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
      accountNames.push(accountItem.name);
    }
    return accountNames;
  }

  /**
   * Prepare list of kms key names from security config file
   * @param configDir
   */
  private getKmsKeyNames(keyNames: string[], securityConfig: SecurityConfig) {
    const keySets = securityConfig.keyManagementService?.keySets;
    if (!keySets) {
      return;
    }
    for (const keySet of keySets) {
      keyNames.push(keySet.name);
    }
  }

  /**
   * Function to create vpc and subnet lists
   * @param networkConfig
   * @returns
   */
  private getVpcSubnetLists(networkConfig: NetworkConfig): VpcSubnetListsType[] {
    const vpcSubnetLists: VpcSubnetListsType[] = [];
    const vpcs = [...networkConfig.vpcs, ...(networkConfig.vpcTemplates ?? [])];
    for (const vpc of vpcs) {
      for (const subnet of vpc.subnets ?? []) {
        vpcSubnetLists.push({
          vpcName: vpc.name,
          subnetName: subnet.name,
          subnetAz: subnet.availabilityZone ? subnet.availabilityZone : '',
        });
      }
    }
    return vpcSubnetLists;
  }

  /**
   * Validate IAM policies
   * @param configDir
   * @param values
   * @param errors
   */
  private validatePolicies(configDir: string, values: IamConfig, errors: string[]) {
    //
    // Validate policy file existence
    //
    this.validatePolicyFileExists(configDir, values, errors);
    //
    // Validate policy names
    //
    this.validatePolicyNames(values, errors);
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
   * Checks policy names for duplicate values
   * @param values
   * @param errors
   */
  private validatePolicyNames(values: IamConfig, errors: string[]) {
    const policyNames: string[] = [];

    values.policySets?.forEach(policySet => {
      policySet.policies?.forEach(policy => {
        policyNames.push(policy.name);
      });
    });

    // Check names for duplicates
    if (hasDuplicates(policyNames)) {
      errors.push(`Duplicate policy names defined. Policy names must be unique. Policy names defined: ${policyNames}`);
    }
  }

  /**
   * Validate IAM roles
   * @param values
   * @param errors
   */
  private validateRoles(values: IamConfig, errors: string[]) {
    //
    // Validate role names
    //
    this.validateRoleNames(values, errors);
  }

  /**
   * Checks role names for duplicate values
   * @param values
   * @param errors
   */
  private validateRoleNames(values: IamConfig, errors: string[]) {
    const roleNames: string[] = [];

    values.roleSets?.forEach(roleSet => {
      roleSet.roles?.forEach(role => {
        roleNames.push(role.name);
      });
    });

    // Check names for duplicates
    if (hasDuplicates(roleNames)) {
      errors.push(`Duplicate role names defined. Role names must be unique. Role names defined: ${roleNames}`);
    }
  }

  /**
   * Function to validate managed policy availability for IAM resources
   * @param values
   * @param accountsConfig
   * @param errors
   */
  private validateIamPolicyTargets(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    for (const policyItem of values.policySets ?? []) {
      // Validate IAM Users
      this.validateIamUserTarget(values, accountsConfig, policyItem as PolicySetConfig, errors);

      // Validate IAM Roles
      this.validateIamRoleTarget(values, accountsConfig, policyItem as PolicySetConfig, errors);

      // Validate IAM Groups
      this.validateIamGroupTarget(values, accountsConfig, policyItem as PolicySetConfig, errors);
    }
  }

  /**
   * Function to validate managed policy availability for IAM users
   * @param values
   * @param accountsConfig
   * @param policyItem PolicySetConfig
   * @param errors
   */
  private validateIamUserTarget(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountsConfig: AccountsConfig,
    policyItem: PolicySetConfig,
    errors: string[],
  ) {
    const invalidIamUserTargets: string[] = [];
    for (const iamItem of values.userSets ?? []) {
      for (const userItem of iamItem.users) {
        if (userItem.boundaryPolicy) {
          policyItem.policies.find(item => {
            if (userItem.boundaryPolicy === item.name) {
              const userDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                iamItem.deploymentTargets as t.DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                policyItem.deploymentTargets as t.DeploymentTargets,
              );
              // Check the policies and validate that they're deployment is available for respective user boundary-policy configuration.
              for (const targetItem of userDeploymentTargetSets ?? []) {
                if (policyTargets.indexOf(targetItem) === -1) {
                  if (!invalidIamUserTargets.includes(userItem.username)) {
                    invalidIamUserTargets.push(userItem.username);
                  }
                }
              }
            }
          });
        }
      }
    }
    if (invalidIamUserTargets.length > 0) {
      errors.push(
        `Deployment target account(s) for the following user(s): ${invalidIamUserTargets.join(
          ', ',
        )} reference policies that are not available in the target accounts.`,
      );
    }
  }

  /**
   * Function to validate managed policy availability for IAM Roles
   * @param values
   * @param accountsConfig
   * @param policyItem PolicySetConfig
   * @param errors
   */
  private validateIamRoleTarget(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountsConfig: AccountsConfig,
    policyItem: PolicySetConfig,
    errors: string[],
  ) {
    const invalidIamRoleTargets: string[] = [];
    for (const iamItem of values.roleSets ?? []) {
      for (const roleItem of iamItem.roles) {
        if (roleItem.boundaryPolicy) {
          policyItem.policies.find(item => {
            if (roleItem.boundaryPolicy === item.name) {
              const userDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                iamItem.deploymentTargets as t.DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                policyItem.deploymentTargets as t.DeploymentTargets,
              );
              // Check the boundary policy and validate that it's deployment is available for respective role boundary-policy configuration.
              for (const targetItem of userDeploymentTargetSets ?? []) {
                if (policyTargets.indexOf(targetItem) === -1) {
                  if (!invalidIamRoleTargets.includes(roleItem.name)) {
                    invalidIamRoleTargets.push(roleItem.name);
                  }
                }
              }
            }
          });
        }
        // Check the customer managed policies and validate that it's deployment is available for configurations..
        for (const customerPolicy of roleItem.policies?.customerManaged ?? []) {
          policyItem.policies.find(item => {
            if (customerPolicy === item.name) {
              const userDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                iamItem.deploymentTargets as t.DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                policyItem.deploymentTargets as t.DeploymentTargets,
              );
              // Check the policies and validate that they're deployment is available for respective user boundary-policy configuration.
              for (const targetItem of userDeploymentTargetSets ?? []) {
                if (policyTargets.indexOf(targetItem) === -1) {
                  if (!invalidIamRoleTargets.includes(roleItem.name)) {
                    invalidIamRoleTargets.push(roleItem.name);
                  }
                }
              }
            }
          });
        }
      }
    }
    if (invalidIamRoleTargets.length > 0) {
      errors.push(
        `Deployment target account(s) for the following role(s): ${invalidIamRoleTargets.join(
          ', ',
        )} reference policies that are not available in the target accounts.`,
      );
    }
  }

  /**
   * Function to validate managed policy availability for IAM Groups
   * @param values
   * @param accountsConfig
   * @param policyItem PolicySetConfig
   * @param errors
   */
  private validateIamGroupTarget(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountsConfig: AccountsConfig,
    policyItem: PolicySetConfig,
    errors: string[],
  ) {
    const invalidIamGroupTargets: string[] = [];
    for (const iamItem of values.groupSets ?? []) {
      for (const groupItem of iamItem.groups) {
        // Check the customer managed policies and validate that it's deployment is available for configurations..
        for (const customerPolicy of groupItem.policies?.customerManaged ?? []) {
          policyItem.policies.find(item => {
            if (customerPolicy === item.name) {
              const userDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                iamItem.deploymentTargets as t.DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                accountsConfig,
                policyItem.deploymentTargets as t.DeploymentTargets,
              );
              // Check the policies and validate that they're deployment is available for respective group policy configuration.
              for (const targetItem of userDeploymentTargetSets ?? []) {
                if (policyTargets.indexOf(targetItem) === -1) {
                  if (!invalidIamGroupTargets.includes(groupItem.name)) {
                    invalidIamGroupTargets.push(groupItem.name);
                  }
                }
              }
            }
          });
        }
      }
    }
    if (invalidIamGroupTargets.length > 0) {
      errors.push(
        `Deployment target account(s) for the following group(s): ${invalidIamGroupTargets.join(
          ', ',
        )} reference policies that are not available in the target accounts.`,
      );
    }
  }

  /**
   * Function to validate Identity Center object
   * @param values
   * @param errors
   */
  private validateIdentityCenter(
    iamConfig: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    //
    //Function to validate PermissionSet and Assignment names are unique
    //
    this.validateIdentityCenterPermissionSetNameForUniqueness(iamConfig, errors);

    //
    // Validate Identity Center PermissionSet policies
    //
    this.validateIdentityCenterPermissionSetPolicies(iamConfig, accountsConfig, errors);

    //
    // Validate Identity Center PermissionSet names
    //
    this.validateIdentityCenterPermissionSetInAssignments(iamConfig, errors);

    //
    // Validate PermissionSet permissions boundary
    //
    this.validateIdentityCenterPermissionSetPermissionsBoundary(iamConfig, errors);
  }

  /**
   * Function to validate PermissionSet and Assignment names are unique
   * @param values
   */
  private validateIdentityCenterPermissionSetNameForUniqueness(
    iamConfig: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    errors: string[],
  ) {
    const identityCenter = iamConfig.identityCenter;
    const assignmentNames = [...(identityCenter?.identityCenterAssignments ?? [])].map(item => item.name);
    const permissionSetNames = [...(identityCenter?.identityCenterPermissionSets ?? [])].map(item => item.name);

    if (hasDuplicates(assignmentNames)) {
      errors.push(`Duplicate Identity Center Assignment names defined [${assignmentNames}].`);
    }

    if (hasDuplicates(permissionSetNames)) {
      errors.push(`Duplicate Identity Center Permission Set names defined [${permissionSetNames}].`);
    }
  }

  /**
   * Function to validate Identity Center Permission set names in assignment
   * @param iamConfig
   * @param errors
   */
  private validateIdentityCenterPermissionSetInAssignments(
    iamConfig: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    errors: string[],
  ) {
    if (iamConfig.identityCenter) {
      const permissionSetNames = [...(iamConfig.identityCenter?.identityCenterPermissionSets ?? [])].map(
        item => item.name,
      );

      this.validateIdentityCenterPermissionSetAssignmentsForManagement(iamConfig, errors);

      const identityCenterAssignments = iamConfig.identityCenter.identityCenterAssignments ?? [];
      for (const identityCenterAssignment of identityCenterAssignments) {
        if (!permissionSetNames.includes(identityCenterAssignment.permissionSetName)) {
          errors.push(
            `Identity center ${iamConfig.identityCenter.name} assignments ${
              identityCenterAssignment.name
            } uses permission set ${
              identityCenterAssignment.permissionSetName
            }, which is not found in identityCenterPermissionSets, available permission names are [${permissionSetNames.join(
              ',',
            )}].`,
          );
        }

        const principals = identityCenterAssignment.principals ?? [];
        const groups: string[] = [];
        const users: string[] = [];
        for (const principal of principals) {
          if (principal.type === 'USER') {
            users.push(principal.name);
          }
          if (principal.type === 'GROUP') {
            groups.push(principal.name);
          }
        }

        // check duplicates for groups in principals
        if (hasDuplicates(groups)) {
          errors.push(
            `Duplicate groups in principals [${groups.join(',')}] defined in IdentityCenter ${
              iamConfig.identityCenter.name
            } for assignment ${identityCenterAssignment.name} `,
          );
        }

        // check duplicates for users in principals
        if (hasDuplicates(users)) {
          errors.push(
            `Duplicate users in principals [${users.join(',')}] defined in IdentityCenter ${
              iamConfig.identityCenter.name
            } for assignment ${identityCenterAssignment.name} `,
          );
        }
      }
    }
  }

  /**
   * Function to validate Identity Center Permission set assignments are not deployed to management account
   * @param iamConfig
   * @param errors
   */
  private validateIdentityCenterPermissionSetAssignmentsForManagement(
    iamConfig: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    errors: string[],
  ) {
    const identityCenterAssignments = iamConfig!.identityCenter?.identityCenterAssignments ?? [];
    for (const identityCenterAssignment of identityCenterAssignments ?? []) {
      const excludedAccounts = identityCenterAssignment?.deploymentTargets?.excludedAccounts ?? [];
      if (!excludedAccounts.includes('Management')) {
        if (identityCenterAssignment.deploymentTargets.accounts?.includes('Management')) {
          errors.push(
            `Cannot create permissionSetAssignment for Management account in delegated administrator account, remove Management account from deployment targets`,
          );
        }

        if (identityCenterAssignment.deploymentTargets.organizationalUnits?.includes('Root')) {
          errors.push(
            `Cannot create permissionSetAssignment for Management account in delegated administrator account, remove Root OU from deployment targets or add Management as an excluded account.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate Identity Center Permission set permissionsBoundary
   * @param iamConfig
   * @param errors
   */
  private validateIdentityCenterPermissionSetPermissionsBoundary(
    iamConfig: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    errors: string[],
  ) {
    if (iamConfig.identityCenter) {
      for (const identityCenterPermissionSet of iamConfig.identityCenter.identityCenterPermissionSets ?? []) {
        if (identityCenterPermissionSet.policies?.permissionsBoundary) {
          if (
            identityCenterPermissionSet.policies.permissionsBoundary.customerManagedPolicy &&
            identityCenterPermissionSet.policies.permissionsBoundary.awsManagedPolicyName
          ) {
            errors.push(
              `Identity center ${iamConfig.identityCenter.name} permission set ${identityCenterPermissionSet.name} permissions boundary can either have customerManagedPolicy or managedPolicy, both the properties can't be defined.`,
            );
          }
        }
      }
    }
  }

  private validateIdentityCenterPermissionSetPolicies(
    iamConfig: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    if (iamConfig.identityCenter) {
      const policies: { name: string; accountNames: string[] }[] = [];
      for (const policySet of iamConfig.policySets ?? []) {
        for (const policyItem of policySet.policies) {
          policies.push({
            name: policyItem.name,
            accountNames: CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
              accountsConfig,
              policySet.deploymentTargets as t.DeploymentTargets,
            ),
          });
        }
      }

      const identityCenter = iamConfig.identityCenter;
      for (const identityCenterPermissionSet of identityCenter.identityCenterPermissionSets ?? []) {
        // check duplicates for awsManaged polices
        const awsManagedPolicies = identityCenterPermissionSet.policies?.awsManaged ?? [];
        if (hasDuplicates(awsManagedPolicies)) {
          errors.push(
            `Duplicate AWS managed policy names [${awsManagedPolicies.join(',')}] defined in IdentityCenter ${
              identityCenter.name
            } for permission set ${identityCenterPermissionSet.name} `,
          );
        }
        // check duplicates for customerManaged polices
        const customerManagedPolicies = identityCenterPermissionSet.policies?.customerManaged ?? [];
        if (hasDuplicates(customerManagedPolicies)) {
          errors.push(
            `Duplicate customer managed policy names [${customerManagedPolicies.join(',')}] defined in IdentityCenter ${
              identityCenter.name
            } for permission set ${identityCenterPermissionSet.name} `,
          );
        }
        // check duplicates for customerManaged polices
        const acceleratorManagedPolicies = identityCenterPermissionSet.policies?.acceleratorManaged ?? [];
        if (hasDuplicates(acceleratorManagedPolicies)) {
          errors.push(
            `Duplicate lza managed policy names [${acceleratorManagedPolicies.join(',')}] defined in IdentityCenter ${
              identityCenter.name
            } for permission set ${identityCenterPermissionSet.name} `,
          );
        }
        for (const lzaManagedPolicy of acceleratorManagedPolicies) {
          const filteredPolicyItem = policies.find(item => item.name === lzaManagedPolicy);
          if (!filteredPolicyItem) {
            errors.push(
              `Identity Center ${iamConfig.identityCenter.name}, permission set ${identityCenterPermissionSet.name}, lza managed policy  ${lzaManagedPolicy} not found in policySets of iam-config.yaml file !!!`,
            );
          } else {
            // Validate LZA managed policy deploy target match assignment deploy target accounts
            const assignmentAccountNames = this.getIdentityCenterAssignmentDeployAccountNames(
              identityCenter,
              accountsConfig,
              identityCenterPermissionSet.name,
            );

            if (!assignmentAccountNames.every(item => filteredPolicyItem.accountNames.includes(item))) {
              errors.push(
                `Identity Center ${iamConfig.identityCenter.name}, permission set ${
                  identityCenterPermissionSet.name
                } assignments target deploy accounts [${assignmentAccountNames.join(
                  ',',
                )}], are not part of lza managed policy  ${lzaManagedPolicy} deploy target accounts [${filteredPolicyItem.accountNames.join(
                  ',',
                )}] !!!`,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Function to get Identity Center Assignment deploy target account names
   * @param identityCenter
   * @param accountsConfig
   * @param identityCenterPermissionSetName
   * @returns
   */
  private getIdentityCenterAssignmentDeployAccountNames(
    identityCenter: t.TypeOf<typeof IamConfigTypes.identityCenterConfig>,
    accountsConfig: AccountsConfig,
    identityCenterPermissionSetName: string,
  ): string[] {
    const accountNames: string[] = [];
    for (const identityCenterAssignmentItem of identityCenter.identityCenterAssignments ?? []) {
      if (identityCenterAssignmentItem.permissionSetName === identityCenterPermissionSetName) {
        accountNames.push(
          ...CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
            accountsConfig,
            identityCenterAssignmentItem.deploymentTargets as t.DeploymentTargets,
          ),
        );
      }
    }

    return [...new Set(accountNames)];
  }

  /**
   * Function to validate existence of Assignment target account names
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateAssignmentAccountNames(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    const identityCenter = values.identityCenter;
    for (const assignment of identityCenter?.identityCenterAssignments ?? []) {
      for (const account of assignment.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for user sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of Assignment target account names exist for IAM policies or that arn or account ids match correct format
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateAssignmentPrincipalsForIamRoles(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const roleSetItem of values.roleSets!) {
      for (const roleItem of roleSetItem.roles) {
        for (const assumedByItem of roleItem.assumedBy) {
          if (assumedByItem.type === 'account') {
            const accountIdRegex = /^\d{12}$/;
            const accountArnRegex = new RegExp('^arn:.*$');
            // test if principal length exceeds IAM Role length limit of 2048 characters.
            // Ref: https://docs.aws.amazon.com/IAM/latest/APIReference/API_Role.html
            // this will mitigate polynomial regular expression used on uncontrolled data
            if (assumedByItem.principal!.length > 2048) {
              errors.push(`The account ID defined in arn ${assumedByItem.principal} is too long`);
            } else if (accountIdRegex.test(assumedByItem.principal!)) {
              continue;
            } else if (accountArnRegex.test(assumedByItem.principal!)) {
              const accountArnGetIdRegex = new RegExp('^arn:.*:.*::(.*):.*$');
              const accountId = accountArnGetIdRegex.exec(assumedByItem.principal!);
              if (!accountIdRegex.test(accountId![1])) {
                errors.push(`Account ID defined in arn ${assumedByItem.principal} is not a valid account ID`);
              }
              const accountArnRegex = new RegExp('^arn:.+:.+::\\d{12}:(root$|.*user.*(:|/).*$|.*role.*(:|/).*$)');
              if (!accountArnRegex.test(assumedByItem.principal!)) {
                errors.push(`The arn ${assumedByItem.principal} is not a valid arn for a trust policy`);
              }
            } else {
              const account = assumedByItem.principal;
              if (accountNames.indexOf(account!) === -1) {
                errors.push(`Cannot find an account with the name ${account} in accounts-config.yaml`);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Function to validate existence of Assignment deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateAssignmentDeploymentTargetOUs(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    const identityCenter = values.identityCenter;
    for (const assignment of identityCenter?.identityCenterAssignments ?? []) {
      for (const ou of assignment.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for assignment does not exist in organization-config.yaml file.`);
        }
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

    //
    // Validate Identity Center assignments account name
    //
    this.validateAssignmentAccountNames(values, accountNames, errors);

    //
    // Validate IAM principal assignments for roles
    //
    this.validateAssignmentPrincipalsForIamRoles(values, accountNames, errors);
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
   * @param ouIdNames
   * @param errors
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

    this.validateAssignmentDeploymentTargetOUs(values, ouIdNames, errors);
  }
}

/**
 * Class to validate managed active directory
 */
class ManagedActiveDirectoryValidator {
  private readonly validConfigSets: string[] = [
    'JoinDomain',
    'AWSQuickStart',
    'ADGroupSetup',
    'ADUserSetup',
    'ADUserGroupSetup',
    'ADConnectorPermissionsSetup',
    'ConfigurePasswordPolicy',
    'ADGroupGrantPermissionsSetup',
  ];
  constructor(
    values: IamConfig,
    vpcSubnetLists: VpcSubnetListsType[],
    ouIdNames: string[],
    accountNames: string[],
    errors: string[],
  ) {
    //
    // Validate mandatory user data scripts
    //
    this.validateMandatoryUserDataScripts(values, errors);

    //
    // Validate instance security group source list
    //
    this.validateSecurityGroupInboundSources(values, errors);

    //
    // Validate ad user groups
    //
    this.validateAdUserGroups(values, errors);

    this.validateMadVpcSettings(values, vpcSubnetLists, errors);

    //
    // Validate MAD sharing configuration
    //
    this.validateMadSharingConfig(values, ouIdNames, accountNames, errors);

    //
    // Validate MAD secret configuration
    //
    this.validateMadSecretConfig(values, errors);
  }

  /**
   * Function to validate instance security group inbound sources
   * @param values
   * @param errors
   */
  private validateSecurityGroupInboundSources(values: IamConfig, errors: string[]) {
    for (const managedActiveDirectory of values.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.activeDirectoryConfigurationInstance) {
        if (managedActiveDirectory.activeDirectoryConfigurationInstance.securityGroupInboundSources.length === 0) {
          errors.push(
            `[Managed Active Directory: ${managedActiveDirectory.name}]: instance security group inbound source list empty !!!`,
          );
        }
      }
    }
  }

  /**
   * Function to validate mandatory user data scripts for AD configuration
   * @param values
   * @param errors
   */
  private validateMandatoryUserDataScripts(values: IamConfig, errors: string[]) {
    for (const managedActiveDirectory of values.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.activeDirectoryConfigurationInstance) {
        for (const configSet of this.validConfigSets) {
          const foundScriptObject = managedActiveDirectory.activeDirectoryConfigurationInstance.userDataScripts.find(
            item => item.scriptName === configSet,
          );
          if (foundScriptObject) {
            if (configSet === 'AWSQuickStart' && path.extname(foundScriptObject.scriptFilePath) !== '.psm1') {
              errors.push(
                `[Managed Active Directory: ${managedActiveDirectory.name}]: configuration instance user data script ${configSet} is a powerShell module, file extension must be .psm1 !!!`,
              );
            }
            if (configSet !== 'AWSQuickStart' && path.extname(foundScriptObject.scriptFilePath) !== '.ps1') {
              errors.push(
                `[Managed Active Directory: ${managedActiveDirectory.name}]: configuration instance user data script ${configSet} is a powerShell script, file extension must be .ps1 !!!`,
              );
            }
          } else {
            errors.push(
              `[Managed Active Directory: ${managedActiveDirectory.name}]: configuration instance missing ${configSet} user data script !!!`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate ad user's valid group names
   * @param values
   * @param errors
   */
  private validateAdUserGroups(values: IamConfig, errors: string[]) {
    for (const managedActiveDirectory of values.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.activeDirectoryConfigurationInstance) {
        const allGroups = managedActiveDirectory.activeDirectoryConfigurationInstance.adGroups;
        allGroups.push(
          ...managedActiveDirectory.activeDirectoryConfigurationInstance.adPerAccountGroups,
          managedActiveDirectory.activeDirectoryConfigurationInstance.adConnectorGroup,
          'AWS Delegated Administrators',
        );
        for (const adUser of managedActiveDirectory.activeDirectoryConfigurationInstance.adUsers) {
          const allValidGroups = adUser.groups.every(item => {
            return allGroups.includes(item);
          });

          if (!allValidGroups) {
            errors.push(
              `[Managed Active Directory: ${managedActiveDirectory.name}]: ad user ${
                adUser.name
              } groups ${adUser.groups.join(',')} are not part of ad groups ${allGroups.join(',')} !!!`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate ad vpc settings
   * @param values
   * @param vpcSubnetLists
   * @param errors
   */
  private validateMadVpcSettings(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    vpcSubnetLists: { vpcName: string; subnetName: string; subnetAz: string | number }[],
    errors: string[],
  ) {
    for (const managedActiveDirectory of values.managedActiveDirectories ?? []) {
      const madVpc = vpcSubnetLists.filter(item => item.vpcName === managedActiveDirectory.vpcSettings.vpcName);
      if (madVpc.length === 0) {
        errors.push(
          `Managed active directory ${managedActiveDirectory.name} vpc ${managedActiveDirectory.vpcSettings.vpcName} not found in network-config file`,
        );
      } else {
        const madSubnets: {
          vpcName: string;
          subnetName: string;
          subnetAz: string | number;
        }[] = [];

        if (managedActiveDirectory.vpcSettings.subnets.length < 2) {
          errors.push(
            `Managed active directory ${managedActiveDirectory.name} needs minimum of 2 subnets from 2 different availability zone `,
          );
        } else {
          for (const madSubnet of managedActiveDirectory.vpcSettings.subnets ?? []) {
            const madSubnetItem = madVpc.find(item => item.subnetName === madSubnet);
            if (madSubnetItem) {
              madSubnets.push(madSubnetItem);
            } else {
              errors.push(
                `Managed active directory ${managedActiveDirectory.name} subnet ${madSubnet} not found for vpc ${managedActiveDirectory.vpcSettings.vpcName} in network-config file`,
              );
            }
          }
          if (managedActiveDirectory.vpcSettings.subnets.length !== madSubnets.length) {
            errors.push(
              `Number of subnets for managed active directory ${managedActiveDirectory.name} does not match with vpc configuration in network-config file.`,
            );
          }

          // now check subnets are of different availability zones
          const madSubnetAzs: (string | number)[] = [];
          for (const madSubnetName of madSubnets) {
            madSubnetAzs.push(madSubnetName.subnetAz);
          }

          const subnetSet = new Set(madSubnetAzs);

          if (subnetSet.size === 1) {
            errors.push(
              `Managed active directory ${managedActiveDirectory.name} subnets must be from two different availability zone, subnets defined are from "${madSubnetAzs[0]}" availability zone`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate managed active directory sharing configuration
   * @param values
   * @param ouIdNames
   * @param accountNames
   * @param errors
   */
  private validateMadSharingConfig(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    ouIdNames: string[],
    accountNames: string[],
    errors: string[],
  ) {
    for (const managedActiveDirectory of values.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.sharedOrganizationalUnits) {
        if (managedActiveDirectory.sharedOrganizationalUnits.organizationalUnits.length === 0) {
          errors.push(`No shared target OU listed for managed active directory ${managedActiveDirectory.name}.`);
        } else {
          for (const ou of managedActiveDirectory.sharedOrganizationalUnits.organizationalUnits) {
            if (ouIdNames.indexOf(ou) === -1) {
              errors.push(
                `Shared target OU ${ou} for managed active directory ${managedActiveDirectory.name} does not exists in organization-config.yaml file.`,
              );
            }
          }
        }
      }

      if (managedActiveDirectory.sharedAccounts) {
        if (managedActiveDirectory.sharedAccounts.length === 0) {
          errors.push(`No shared target account listed for managed active directory ${managedActiveDirectory.name}.`);
        } else {
          for (const account of managedActiveDirectory.sharedAccounts) {
            if (accountNames.indexOf(account) === -1) {
              errors.push(
                `Shared target account ${account} for managed active directory ${managedActiveDirectory.name} does not exists in accounts-config.yaml file.`,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Function to validate managed active directory secret configuration
   * @param values
   * @param ouIdNames
   * @param accountNames
   * @param errors
   */
  private validateMadSecretConfig(values: t.TypeOf<typeof IamConfigTypes.iamConfig>, errors: string[]) {
    for (const managedActiveDirectory of values.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.account === 'Management') {
        if (
          managedActiveDirectory.secretConfig?.account === 'Management' ||
          !managedActiveDirectory.secretConfig?.account
        ) {
          errors.push(
            `[Managed Active Directory: ${managedActiveDirectory.name}]: secretConfig needs to specify an account that isn't the Management account.`,
          );
        }
      }
      if (managedActiveDirectory.secretConfig?.account === 'Management') {
        errors.push(
          `[Managed Active Directory: ${managedActiveDirectory.name}]: secretConfig needs to specify an account that isn't the Management account.`,
        );
      }
    }
  }
}

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
import * as fs from 'fs';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils/lib/logger';

import { AccountsConfig } from '../lib/accounts-config';
import { CommonValidatorFunctions } from './common/common-validator-functions';
import { DeploymentTargets } from '../lib/common';
import { IamConfig, PolicySetConfig } from '../lib/iam-config';
import { IIamConfig, IIdentityCenterConfig } from '../lib/models/iam-config';
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
  private readonly iamConfig: IamConfig;
  private readonly accountsConfig: AccountsConfig;
  private readonly networkConfig: NetworkConfig;
  private readonly organizationConfig: OrganizationConfig;
  private readonly securityConfig: SecurityConfig;
  private readonly configDir: string;
  private readonly logger = createLogger(['iam-config-validator']);

  constructor(
    values: IamConfig,
    accountsConfig: AccountsConfig,
    networkConfig: NetworkConfig,
    organizationConfig: OrganizationConfig,
    securityConfig: SecurityConfig,
    configDir: string,
  ) {
    this.iamConfig = values;
    this.accountsConfig = accountsConfig;
    this.networkConfig = networkConfig;
    this.organizationConfig = organizationConfig;
    this.securityConfig = securityConfig;
    this.configDir = configDir;
  }

  /**
   * Main validation function that orchestrates all IAM configuration validations
   */
  public validate(): void {
    const ouIdNames: string[] = ['Root'];
    const keyNames: string[] = [];

    const errors: string[] = [];

    this.logger.info(`${IamConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    ouIdNames.push(...this.getOuIdNames(this.organizationConfig));

    //
    // Get list of Account names from account config file
    const accountNames = this.getAccountNames(this.accountsConfig);

    //
    // Get list of Kms key names from security config file
    this.getKmsKeyNames(keyNames, this.securityConfig);

    //
    // Get Vpc and subnet lists
    //
    const vpcSubnetLists = this.getVpcSubnetLists(this.networkConfig);

    //
    // Start Validation

    //
    // Validate IAM policies
    //
    errors.push(...this.validatePolicies());
    //
    // Validate IAM roles
    //
    errors.push(...this.validateRoles());

    // Validate target OU names
    errors.push(...this.validateDeploymentTargetOUs(ouIdNames));

    // Validate target account names
    errors.push(...this.validateDeploymentTargetAccountNames(accountNames));

    // Validate Identity Center Object
    errors.push(...this.validateIdentityCenter());

    //
    // Validate IAM principal assignments for roles
    //
    errors.push(...this.validateIamPolicyTargets());

    // Validate Managed active directory
    const madErrors: string[] = [];
    new ManagedActiveDirectoryValidator(this.iamConfig, vpcSubnetLists, ouIdNames, accountNames, madErrors);
    errors.push(...madErrors);

    if (errors.length) {
      throw new Error(`${IamConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
    }
  }

  /**
   * Prepare list of OU ids from organization config file
   * @param organizationConfig - Organization configuration
   * @returns Array of organizational unit names
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
   * @param accountsConfig - Accounts configuration
   * @returns Array of account names
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
   * @param keyNames - Array to populate with key names
   * @param securityConfig - Security configuration
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
   * @param networkConfig - Network configuration
   * @returns Array of VPC subnet information
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
   * @returns Array of validation errors
   */
  private validatePolicies(): string[] {
    const errors: string[] = [];
    //
    // Validate policy file existence
    //
    errors.push(...this.validatePolicyFileExists());
    //
    // Validate policy names
    //
    errors.push(...this.validatePolicyNames());
    return errors;
  }

  /**
   * Validate policy file existence
   * @returns Array of validation errors
   */
  private validatePolicyFileExists(): string[] {
    const errors: string[] = [];
    const policies: { name: string; policyFile: string }[] = [];
    for (const policySet of this.iamConfig.policySets ?? []) {
      for (const policy of policySet.policies) {
        policies.push({ name: policy.name, policyFile: policy.policy });
      }
    }

    for (const policy of policies) {
      if (!fs.existsSync(path.join(this.configDir, policy.policyFile))) {
        errors.push(`Policy definition file ${policy.policyFile} not found, for ${policy.name} !!!`);
      }
    }
    return errors;
  }

  /**
   * Checks policy names for duplicate values
   * @returns Array of validation errors
   */
  private validatePolicyNames(): string[] {
    const errors: string[] = [];
    const policyNames: string[] = [];

    this.iamConfig.policySets?.forEach(policySet => {
      policySet.policies?.forEach(policy => {
        policyNames.push(policy.name);
      });
    });

    // Check names for duplicates
    if (hasDuplicates(policyNames)) {
      errors.push(`Duplicate policy names defined. Policy names must be unique. Policy names defined: ${policyNames}`);
    }
    return errors;
  }

  /**
   * Validate IAM roles
   * @returns Array of validation errors
   */
  private validateRoles(): string[] {
    //
    // Validate role names
    //
    return this.validateRoleNames();
  }

  /**
   * Checks role names for duplicate values
   * @returns Array of validation errors
   */
  public validateRoleNames(): string[] {
    const errors: string[] = [];
    // For each account, maintain a set of role names
    const accountRoleMap = new Map<string, Set<string>>();

    this.iamConfig.roleSets?.forEach(roleSet => {
      // Get all account names for this roleSet's deployment targets
      const targetAccounts = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
        this.accountsConfig,
        roleSet.deploymentTargets,
      );

      roleSet.roles?.forEach(role => {
        const normalizedName = role.name.trim().toUpperCase();

        // Check each target account for this role
        targetAccounts.forEach(accountName => {
          if (!accountRoleMap.has(accountName)) {
            accountRoleMap.set(accountName, new Set());
          }

          const accountRoles = accountRoleMap.get(accountName)!;
          if (accountRoles.has(normalizedName)) {
            errors.push(
              `Duplicate role names defined. Role names must be unique in each AWS account. Role name: ${role.name}`,
            );
          } else {
            accountRoles.add(normalizedName);
          }
        });
      });
    });
    return errors;
  }

  /**
   * Function to validate managed policy availability for IAM resources
   * @returns Array of validation errors
   */
  private validateIamPolicyTargets(): string[] {
    const errors: string[] = [];
    for (const policyItem of this.iamConfig.policySets ?? []) {
      // Validate IAM Users
      errors.push(...this.validateIamUserTarget(policyItem as PolicySetConfig));

      // Validate IAM Roles
      errors.push(...this.validateIamRoleTarget(policyItem as PolicySetConfig));

      // Validate IAM Groups
      errors.push(...this.validateIamGroupTarget(policyItem as PolicySetConfig));
    }
    return errors;
  }

  /**
   * Function to validate managed policy availability for IAM users
   * @param policyItem - Policy set configuration
   * @returns Array of validation errors
   */
  private validateIamUserTarget(policyItem: PolicySetConfig): string[] {
    const errors: string[] = [];
    const invalidIamUserTargets: string[] = [];
    for (const iamItem of this.iamConfig.userSets ?? []) {
      for (const userItem of iamItem.users) {
        if (userItem.boundaryPolicy) {
          policyItem.policies.find(item => {
            if (userItem.boundaryPolicy === item.name) {
              const userDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                this.accountsConfig,
                iamItem.deploymentTargets as DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                this.accountsConfig,
                policyItem.deploymentTargets as DeploymentTargets,
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
    return errors;
  }

  /**
   * Function to validate managed policy availability for IAM Roles
   * @param policyItem - Policy set configuration
   * @returns Array of validation errors
   */
  private validateIamRoleTarget(policyItem: PolicySetConfig): string[] {
    const errors: string[] = [];
    const invalidIamRoleTargets: string[] = [];
    for (const iamItem of this.iamConfig.roleSets ?? []) {
      for (const roleItem of iamItem.roles) {
        if (roleItem.boundaryPolicy) {
          policyItem.policies.find(item => {
            if (roleItem.boundaryPolicy === item.name) {
              const userDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                this.accountsConfig,
                iamItem.deploymentTargets as DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                this.accountsConfig,
                policyItem.deploymentTargets as DeploymentTargets,
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
                this.accountsConfig,
                iamItem.deploymentTargets as DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                this.accountsConfig,
                policyItem.deploymentTargets as DeploymentTargets,
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
    return errors;
  }

  /**
   * Function to validate managed policy availability for IAM Groups
   * @param policyItem - Policy set configuration
   * @returns Array of validation errors
   */
  private validateIamGroupTarget(policyItem: PolicySetConfig): string[] {
    const errors: string[] = [];
    const invalidIamGroupTargets: string[] = [];
    for (const iamItem of this.iamConfig.groupSets ?? []) {
      for (const groupItem of iamItem.groups) {
        // Check the customer managed policies and validate that it's deployment is available for configurations..
        for (const customerPolicy of groupItem.policies?.customerManaged ?? []) {
          policyItem.policies.find(item => {
            if (customerPolicy === item.name) {
              const userDeploymentTargetSets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                this.accountsConfig,
                iamItem.deploymentTargets as DeploymentTargets,
              );
              const policyTargets = CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
                this.accountsConfig,
                policyItem.deploymentTargets as DeploymentTargets,
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
    return errors;
  }

  /**
   * Function to validate Identity Center object
   * @returns Array of validation errors
   */
  private validateIdentityCenter(): string[] {
    const errors: string[] = [];
    //
    //Function to validate PermissionSet and Assignment names are unique
    //
    errors.push(...this.validateIdentityCenterPermissionSetNameForUniqueness());

    //
    // Validate Identity Center PermissionSet policies
    //
    errors.push(...this.validateIdentityCenterPermissionSetPolicies());

    //
    // Validate Identity Center PermissionSet names
    //
    errors.push(...this.validateIdentityCenterPermissionSetInAssignments());

    //
    // Validate PermissionSet permissions boundary
    //
    errors.push(...this.validateIdentityCenterPermissionSetPermissionsBoundary());

    //
    // Validate PermissionSet descriptions
    //
    errors.push(...this.validateIdentityCenterPermissionSetPermissionsDescriptions());

    //
    // validate PermissionSet name length
    //
    errors.push(...this.validateIdentityCenterPermissionSetName());

    return errors;
  }

  /**
   * Function to validate PermissionSet and Assignment names are unique
   * @returns Array of validation errors
   */
  private validateIdentityCenterPermissionSetNameForUniqueness(): string[] {
    const errors: string[] = [];
    const identityCenter = this.iamConfig.identityCenter;
    const assignmentNames = [...(identityCenter?.identityCenterAssignments ?? [])].map(item => item.name);
    const permissionSetNames = [...(identityCenter?.identityCenterPermissionSets ?? [])].map(item => item.name);

    if (hasDuplicates(assignmentNames)) {
      errors.push(`Duplicate Identity Center Assignment names defined [${assignmentNames}].`);
    }

    if (hasDuplicates(permissionSetNames)) {
      errors.push(`Duplicate Identity Center Permission Set names defined [${permissionSetNames}].`);
    }

    return errors;
  }

  private validateIdentityCenterPermissionSetName(): string[] {
    const errors: string[] = [];
    for (const permissionSet of this.iamConfig?.identityCenter?.identityCenterPermissionSets ?? []) {
      if (permissionSet.name.length > 32) {
        errors.push(`Identity Center Permission Set name exceeds limit of 32 characters [${permissionSet.name}].`);
      }
    }

    return errors;
  }

  /**
   * Function to validate Identity Center Permission set names in assignment
   * @returns Array of validation errors
   */
  private validateIdentityCenterPermissionSetInAssignments(): string[] {
    const errors: string[] = [];
    if (this.iamConfig.identityCenter) {
      const permissionSetNames = [...(this.iamConfig.identityCenter?.identityCenterPermissionSets ?? [])].map(
        item => item.name,
      );

      const identityCenterAssignments = this.iamConfig.identityCenter.identityCenterAssignments ?? [];
      for (const identityCenterAssignment of identityCenterAssignments) {
        if (!permissionSetNames.includes(identityCenterAssignment.permissionSetName)) {
          errors.push(
            `Identity center ${this.iamConfig.identityCenter.name} assignments ${
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
              this.iamConfig.identityCenter.name
            } for assignment ${identityCenterAssignment.name} `,
          );
        }

        // check duplicates for users in principals
        if (hasDuplicates(users)) {
          errors.push(
            `Duplicate users in principals [${users.join(',')}] defined in IdentityCenter ${
              this.iamConfig.identityCenter.name
            } for assignment ${identityCenterAssignment.name} `,
          );
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate Identity Center Permission set permissionsBoundary
   * @returns Array of validation errors
   */
  private validateIdentityCenterPermissionSetPermissionsBoundary(): string[] {
    const errors: string[] = [];
    if (this.iamConfig.identityCenter) {
      for (const identityCenterPermissionSet of this.iamConfig.identityCenter.identityCenterPermissionSets ?? []) {
        if (identityCenterPermissionSet.policies?.permissionsBoundary) {
          if (
            identityCenterPermissionSet.policies.permissionsBoundary.customerManagedPolicy &&
            identityCenterPermissionSet.policies.permissionsBoundary.awsManagedPolicyName
          ) {
            errors.push(
              `Identity center ${this.iamConfig.identityCenter.name} permission set ${identityCenterPermissionSet.name} permissions boundary can either have customerManagedPolicy or managedPolicy, both the properties can't be defined.`,
            );
          }
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate Identity Center Permission set descriptions
   * @returns Array of validation errors
   */
  private validateIdentityCenterPermissionSetPermissionsDescriptions(): string[] {
    const errors: string[] = [];
    if (this.iamConfig.identityCenter) {
      const identityCenter = this.iamConfig.identityCenter;
      for (const identityCenterPermissionSet of identityCenter.identityCenterPermissionSets ?? []) {
        if (identityCenterPermissionSet.description) {
          if (identityCenterPermissionSet.description.length > 700) {
            errors.push(
              `Identity center ${this.iamConfig.identityCenter.name} permission set ${identityCenterPermissionSet.name} description is too long.`,
            );
          }
          /* eslint-disable no-control-regex */
          /* Disabling no-control-regex because this is how it's defined at
             https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-sso-permissionset.html#cfn-sso-permissionset-description
          */
          const descriptionRegex = /^[\u0009\u000A\u000D\u0020-\u007E\u00A1-\u00FF]*$/;
          /* eslint-enable no-control-regex */
          if (!descriptionRegex.test(identityCenterPermissionSet.description)) {
            errors.push(
              `Identity center ${this.iamConfig.identityCenter.name} permission set ${identityCenterPermissionSet.name} description has invalid characters.`,
            );
          }
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate Identity Center Permission set policies
   * @returns Array of validation errors
   */
  private validateIdentityCenterPermissionSetPolicies(): string[] {
    const errors: string[] = [];
    if (this.iamConfig.identityCenter) {
      const policies: { name: string; accountNames: string[] }[] = [];
      for (const policySet of this.iamConfig.policySets ?? []) {
        for (const policyItem of policySet.policies) {
          policies.push({
            name: policyItem.name,
            accountNames: CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
              this.accountsConfig,
              policySet.deploymentTargets as DeploymentTargets,
            ),
          });
        }
      }

      const identityCenter = this.iamConfig.identityCenter;
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
              `Identity Center ${this.iamConfig.identityCenter.name}, permission set ${identityCenterPermissionSet.name}, lza managed policy  ${lzaManagedPolicy} not found in policySets of iam-config.yaml file !!!`,
            );
          } else {
            // Validate LZA managed policy deploy target match assignment deploy target accounts
            const assignmentAccountNames = this.getIdentityCenterAssignmentDeployAccountNames(
              identityCenter,
              identityCenterPermissionSet.name,
            );

            if (!assignmentAccountNames.every(item => filteredPolicyItem.accountNames.includes(item))) {
              errors.push(
                `Identity Center ${this.iamConfig.identityCenter.name}, permission set ${
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
    return errors;
  }

  /**
   * Function to get Identity Center Assignment deploy target account names
   * @param identityCenter - Identity Center configuration
   * @param identityCenterPermissionSetName - Permission set name
   * @returns Array of account names
   */
  private getIdentityCenterAssignmentDeployAccountNames(
    identityCenter: IIdentityCenterConfig,
    identityCenterPermissionSetName: string,
  ): string[] {
    const accountNames: string[] = [];
    for (const identityCenterAssignmentItem of identityCenter.identityCenterAssignments ?? []) {
      if (identityCenterAssignmentItem.permissionSetName === identityCenterPermissionSetName) {
        accountNames.push(
          ...CommonValidatorFunctions.getAccountNamesFromDeploymentTargets(
            this.accountsConfig,
            identityCenterAssignmentItem.deploymentTargets as DeploymentTargets,
          ),
        );
      }
    }

    return [...new Set(accountNames)];
  }

  /**
   * Function to validate existence of Assignment target account names
   * Make sure deployment target accounts are part of account config file
   * @param accountNames - Array of valid account names
   * @returns Array of validation errors
   */
  private validateAssignmentAccountNames(accountNames: string[]): string[] {
    const errors: string[] = [];
    const identityCenter = this.iamConfig.identityCenter;
    for (const assignment of identityCenter?.identityCenterAssignments ?? []) {
      for (const account of assignment.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for user sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of Assignment target account names exist for IAM policies or that arn or account ids match correct format
   * Make sure deployment target accounts are part of account config file
   * @param accountNames - Array of valid account names
   * @returns Array of validation errors
   */
  private validateAssignmentPrincipalsForIamRoles(accountNames: string[]): string[] {
    const errors: string[] = [];
    for (const roleSetItem of this.iamConfig.roleSets!) {
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
          } else if (assumedByItem.type === 'principalArn') {
            const accountArnRegex = new RegExp('^arn:.+:iam::\\d{12}:(user|group|role)/.*$');
            if (!accountArnRegex.test(assumedByItem.principal!)) {
              errors.push(`The arn ${assumedByItem.principal} is not a valid principal arn for a trust policy`);
            }
            if (assumedByItem.principal!.length > 2048) {
              errors.push(`The principal defined in arn ${assumedByItem.principal} is too long`);
            }
          }
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of Assignment deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param ouIdNames - Array of valid OU names
   * @returns Array of validation errors
   */
  private validateAssignmentDeploymentTargetOUs(ouIdNames: string[]): string[] {
    const errors: string[] = [];
    const identityCenter = this.iamConfig.identityCenter;
    for (const assignment of identityCenter?.identityCenterAssignments ?? []) {
      for (const ou of assignment.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for assignment does not exist in organization-config.yaml file.`);
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of policy sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param accountNames - Array of valid account names
   * @returns Array of validation errors
   */
  private validatePolicySetsAccountNames(accountNames: string[]): string[] {
    const errors: string[] = [];
    for (const policySet of this.iamConfig.policySets ?? []) {
      for (const account of policySet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for policy sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of role sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param accountNames - Array of valid account names
   * @returns Array of validation errors
   */
  private validateRoleSetsAccountNames(accountNames: string[]): string[] {
    const errors: string[] = [];
    for (const roleSet of this.iamConfig.roleSets ?? []) {
      for (const account of roleSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for role sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of group sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param accountNames - Array of valid account names
   * @returns Array of validation errors
   */
  private validateGroupSetsAccountNames(accountNames: string[]): string[] {
    const errors: string[] = [];
    for (const groupSet of this.iamConfig.groupSets ?? []) {
      for (const account of groupSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for group sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of user sets target account names
   * Make sure deployment target accounts are part of account config file
   * @param accountNames - Array of valid account names
   * @returns Array of validation errors
   */
  private validateUserSetsAccountNames(accountNames: string[]): string[] {
    const errors: string[] = [];
    for (const userSet of this.iamConfig.userSets ?? []) {
      for (const account of userSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for user sets does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate Deployment targets account names for IAM services
   * @param accountNames - Array of valid account names
   * @returns Array of validation errors
   */
  private validateDeploymentTargetAccountNames(accountNames: string[]): string[] {
    const errors: string[] = [];
    //
    // Validate policy sets account name
    //
    errors.push(...this.validatePolicySetsAccountNames(accountNames));

    //
    // Validate role sets account name
    //
    errors.push(...this.validateRoleSetsAccountNames(accountNames));

    //
    // Validate group sets account name
    //
    errors.push(...this.validateGroupSetsAccountNames(accountNames));

    //
    // Validate user sets account name
    //
    errors.push(...this.validateUserSetsAccountNames(accountNames));

    //
    // Validate Identity Center assignments account name
    //
    errors.push(...this.validateAssignmentAccountNames(accountNames));

    //
    // Validate IAM principal assignments for roles
    //
    errors.push(...this.validateAssignmentPrincipalsForIamRoles(accountNames));
    return errors;
  }

  /**
   * Function to validate existence of policy sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param ouIdNames - Array of valid OU names
   * @returns Array of validation errors
   */
  private validatePolicySetsDeploymentTargetOUs(ouIdNames: string[]): string[] {
    const errors: string[] = [];
    for (const policySet of this.iamConfig.policySets ?? []) {
      for (const ou of policySet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for policy set does not exists in organization-config.yaml file.`);
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of role sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param ouIdNames - Array of valid OU names
   * @returns Array of validation errors
   */
  private validateRoleSetsDeploymentTargetOUs(ouIdNames: string[]): string[] {
    const errors: string[] = [];
    for (const roleSet of this.iamConfig.roleSets ?? []) {
      for (const ou of roleSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for role set does not exists in organization-config.yaml file.`);
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of group sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param ouIdNames - Array of valid OU names
   * @returns Array of validation errors
   */
  private validateGroupSetsDeploymentTargetOUs(ouIdNames: string[]): string[] {
    const errors: string[] = [];
    for (const groupSet of this.iamConfig.groupSets ?? []) {
      for (const ou of groupSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for group set does not exists in organization-config.yaml file.`);
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate existence of user sets deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param ouIdNames - Array of valid OU names
   * @returns Array of validation errors
   */
  private validateUserSetsDeploymentTargetOUs(ouIdNames: string[]): string[] {
    const errors: string[] = [];
    for (const userSet of this.iamConfig.userSets ?? []) {
      for (const ou of userSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(`Deployment target OU ${ou} for user set does not exists in organization-config.yaml file.`);
        }
      }
    }
    return errors;
  }

  /**
   * Function to validate Deployment targets OU names for IAM services
   * @param ouIdNames - Array of valid OU names
   * @returns Array of validation errors
   */
  private validateDeploymentTargetOUs(ouIdNames: string[]): string[] {
    const errors: string[] = [];
    //
    // Validate policy sets OU name
    //
    errors.push(...this.validatePolicySetsDeploymentTargetOUs(ouIdNames));

    //
    // Validate role sets OU name
    //
    errors.push(...this.validateRoleSetsDeploymentTargetOUs(ouIdNames));

    //
    // Validate group sets OU name
    //
    errors.push(...this.validateGroupSetsDeploymentTargetOUs(ouIdNames));

    //
    // Validate user sets OU name
    //
    errors.push(...this.validateUserSetsDeploymentTargetOUs(ouIdNames));

    errors.push(...this.validateAssignmentDeploymentTargetOUs(ouIdNames));
    return errors;
  }
}

/**
 * Class to validate managed active directory
 */
class ManagedActiveDirectoryValidator {
  static readonly validConfigSets: string[] = [
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
    ManagedActiveDirectoryValidator.validateMandatoryUserDataScripts(values, errors);

    //
    // Validate instance security group source list
    //
    ManagedActiveDirectoryValidator.validateSecurityGroupInboundSources(values, errors);

    //
    // Validate ad user groups
    //
    ManagedActiveDirectoryValidator.validateAdUserGroups(values, errors);

    ManagedActiveDirectoryValidator.validateMadVpcSettings(values, vpcSubnetLists, errors);

    //
    // Validate MAD sharing configuration
    //
    ManagedActiveDirectoryValidator.validateMadSharingConfig(values, ouIdNames, accountNames, errors);

    //
    // Validate MAD secret configuration
    //
    ManagedActiveDirectoryValidator.validateMadSecretConfig(values, errors);
  }

  /**
   * Function to validate instance security group inbound sources
   * @param values
   * @param errors
   */
  static validateSecurityGroupInboundSources(values: IamConfig, errors: string[]) {
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
  static validateMandatoryUserDataScripts(values: IamConfig, errors: string[]) {
    for (const managedActiveDirectory of values.managedActiveDirectories ?? []) {
      if (managedActiveDirectory.activeDirectoryConfigurationInstance) {
        for (const configSet of ManagedActiveDirectoryValidator.validConfigSets) {
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
  static validateAdUserGroups(values: IamConfig, errors: string[]) {
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
  static validateMadVpcSettings(
    values: IIamConfig,
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
  static validateMadSharingConfig(values: IIamConfig, ouIdNames: string[], accountNames: string[], errors: string[]) {
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
  static validateMadSecretConfig(values: IIamConfig, errors: string[]) {
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

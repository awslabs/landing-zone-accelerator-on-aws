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
import * as t from '../lib/common-types';
import { IamConfig, IamConfigTypes } from '../lib/iam-config';
import { NetworkConfig } from '../lib/network-config';
import { OrganizationConfig } from '../lib/organization-config';
import { SecurityConfig } from '../lib/security-config';

type VpcSubnetListsType = {
  vpcName: string;
  subnetName: string;
  subnetAz: string;
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
    // Validate policy file existence
    //
    this.validatePolicyFileExists(configDir, values, errors);

    // Validate target OU names
    this.validateDeploymentTargetOUs(values, ouIdNames, errors);

    // Validate target account names
    this.validateDeploymentTargetAccountNames(values, accountNames, errors);

    // Validate name uniqueness
    this.validateIdentityCenterResourceNameForUniqueness(values, errors);

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
   * Function to validate PermissionSet and Assignment names are unique
   * @param values
   */
  private validateIdentityCenterResourceNameForUniqueness(
    values: t.TypeOf<typeof IamConfigTypes.iamConfig>,
    errors: string[],
  ) {
    const identityCenter = values.identityCenter;
    const assignmentNames = [...(identityCenter?.identityCenterAssignments ?? [])].map(item => item.name);
    const permissionSetNames = [...(identityCenter?.identityCenterPermissionSets ?? [])].map(item => item.name);

    if (new Set(assignmentNames).size !== assignmentNames.length) {
      errors.push(`Duplicate Identity Center Assignment names defined [${assignmentNames}].`);
    }

    if (new Set(permissionSetNames).size !== permissionSetNames.length) {
      errors.push(`Duplicate Identity Center Permission Set names defined [${permissionSetNames}].`);
    }
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

            if (accountIdRegex.test(assumedByItem.principal!)) {
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
    // Validate IAM princiapl assignments for roles
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
    this.validateMadSharingConfig(values, ouIdNames, accountNames, errors);
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
    vpcSubnetLists: { vpcName: string; subnetName: string; subnetAz: string }[],
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
          subnetAz: string;
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
          const madSubnetAzs: string[] = [];
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
      if (
        managedActiveDirectory.sharedAccounts &&
        managedActiveDirectory.sharedOrganizationalUnits?.organizationalUnits
      ) {
        errors.push(
          `Managed active directory ${managedActiveDirectory.name} sharing can have only one option from sharedOrganizationalUnits and sharedAccounts, both can't be defined`,
        );
      }

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
}

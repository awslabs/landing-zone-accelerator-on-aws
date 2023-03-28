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
import {
  AppConfigItem,
  CustomizationsConfig,
  CustomizationsConfigTypes,
  NlbTargetTypeConfig,
} from '../lib/customizations-config';
import { GlobalConfig } from '../lib/global-config';
import { IamConfig } from '../lib/iam-config';
import { NetworkConfig, NetworkConfigTypes, VpcConfig, VpcTemplatesConfig } from '../lib/network-config';
import { OrganizationConfig } from '../lib/organization-config';
import { SecurityConfig } from '../lib/security-config';

/**
 * Customizations Configuration validator.
 * Validates customization configuration
 */
export class CustomizationsConfigValidator {
  constructor(
    values: CustomizationsConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    networkConfig: NetworkConfig,
    organizationConfig: OrganizationConfig,
    securityConfig: SecurityConfig,
    configDir: string,
  ) {
    const ouIdNames: string[] = ['Root'];

    const errors: string[] = [];
    const logger = createLogger(['customizations-config-validator']);

    logger.info(`${CustomizationsConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    ouIdNames.push(...this.getOuIdNames(organizationConfig));

    //
    // Get list of Account names from account config file
    const accountNames = this.getAccountNames(accountsConfig);

    //
    // Start Validation
    // Validate customizations
    new CustomizationValidator(
      values,
      accountsConfig,
      globalConfig,
      networkConfig,
      securityConfig,
      ouIdNames,
      configDir,
      accountNames,
      errors,
    );

    // Validate firewalls
    new FirewallValidator(values, networkConfig, securityConfig, configDir, errors);

    if (errors.length) {
      throw new Error(`${CustomizationsConfig.FILENAME} has ${errors.length} issues:\n${errors.join('\n')}`);
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
   * @param configDir
   */
  private getAccountNames(accountsConfig: AccountsConfig): string[] {
    const accountNames: string[] = [];

    for (const accountItem of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
      accountNames.push(accountItem.name);
    }
    return accountNames;
  }
}

/**
 * Class to validate customizations
 */
class CustomizationValidator {
  constructor(
    values: CustomizationsConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    ouIdNames: string[],
    configDir: string,
    accountNames: string[],
    errors: string[],
  ) {
    // Validate deployment target Account Names
    this.validateDeploymentTargetAccountNames(values, accountNames, errors);

    // Validate deployment target Organizational Unit Names
    this.validateDeploymentTargetOUs(values, ouIdNames, errors);

    // Validate stack name lengths
    this.validateStackNameLength(values, errors);

    // Validate stack names are unique
    this.validateStackNameForUniqueness(values, errors);

    // Validate presence of template file
    this.validateTemplateFile(configDir, values, errors);

    // Validate applications inputs
    this.validateApplicationsInputs(configDir, values, globalConfig, networkConfig, securityConfig, errors);

    // Validate Service Catalog portfolio inputs
    this.validateServiceCatalogInputs(values, accountsConfig, errors, accountNames, ouIdNames);
  }

  /**
   * Function to validate template file existence
   * @param configDir
   * @param values
   */
  private validateTemplateFile(
    configDir: string,
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    errors: string[],
  ) {
    for (const cloudFormationStack of values.customizations?.cloudFormationStacks ?? []) {
      if (!fs.existsSync(path.join(configDir, cloudFormationStack.template))) {
        errors.push(
          `Invalid or missing template file ${cloudFormationStack.template} for CloudFormation Stack ${cloudFormationStack.name} !!!`,
        );
      }
    }
    for (const cloudFormationStackSet of values.customizations?.cloudFormationStackSets ?? []) {
      if (!fs.existsSync(path.join(configDir, cloudFormationStackSet.template))) {
        errors.push(
          `Invalid or missing template file ${cloudFormationStackSet.template} for CloudFormation StackSet ${cloudFormationStackSet.name} !!!`,
        );
      }
    }
    for (const serviceCatalogPortfolio of values.customizations?.serviceCatalogPortfolios ?? []) {
      for (const serviceCatalogProduct of serviceCatalogPortfolio.products ?? []) {
        for (const productVersion of serviceCatalogProduct.versions ?? []) {
          if (!fs.existsSync(path.join(configDir, productVersion.template))) {
            errors.push(
              `Product version ${productVersion.name} template file ${productVersion.template} of portfolio ${serviceCatalogPortfolio.name} not found !!!`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate stack and stackset names
   * @param configDir
   * @param values
   */
  private validateStackNameLength(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    errors: string[],
  ) {
    for (const cloudFormationStack of values.customizations?.cloudFormationStacks ?? []) {
      if (cloudFormationStack.name.length > 128) {
        errors.push(
          `Provided CloudFormation Stack name ${cloudFormationStack.name} exceeds limit of 128 characters !!!`,
        );
      }
    }
    for (const cloudFormationStackSet of values.customizations?.cloudFormationStackSets ?? []) {
      if (cloudFormationStackSet.name.length > 128) {
        errors.push(
          `Provided CloudFormation StackSet name ${cloudFormationStackSet.name} exceeds limit of 128 characters !!!`,
        );
      }
    }
  }

  /**
   * Function to validate stack and stackset names are unique
   * @param values
   */
  private validateStackNameForUniqueness(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    errors: string[],
  ) {
    const stackNames = [...(values.customizations?.cloudFormationStacks ?? [])].map(item => item.name);
    const stackSetNames = [...(values.customizations?.cloudFormationStackSets ?? [])].map(item => item.name);

    if (new Set(stackNames).size !== stackNames.length) {
      errors.push(`Duplicate custom stack names defined [${stackNames}].`);
    }

    if (new Set(stackSetNames).size !== stackSetNames.length) {
      errors.push(`Duplicate custom stackset names defined [${stackSetNames}].`);
    }
  }

  /**
   * Function to validate existence of stack and stackset deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateDeploymentTargetOUs(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const stack of values.customizations?.cloudFormationStacks ?? []) {
      for (const ou of stack.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for CloudFormation Stack does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
    for (const stackSet of values.customizations?.cloudFormationStackSets ?? []) {
      for (const ou of stackSet.deploymentTargets.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for CloudFormation StackSet does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of stack and stackset target account names
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateDeploymentTargetAccountNames(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const stack of values.customizations?.cloudFormationStacks ?? []) {
      for (const account of stack.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for CloudFormation Stack does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
    for (const stackSet of values.customizations?.cloudFormationStackSets ?? []) {
      for (const account of stackSet.deploymentTargets.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for CloudFormation StackSet does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate the application config inputs.
   * Each app is taken and its VPC is checked.
   * Within the VPC, the subnets and security groups are checked.
   * If KMS is provided, kms key in security-config.yaml is checked.
   * @param configDir
   * @param values
   * @param errors
   */
  private validateApplicationsInputs(
    configDir: string,
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    globalConfig: GlobalConfig,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    errors: string[],
  ) {
    const helpers = new CustomizationHelperMethods();
    const appNames: string[] = [];
    for (const app of values.applications ?? []) {
      appNames.push(app.name);

      //check if appName with prefixes is over 128 characters
      // @ts-ignore
      this.checkAppName(app, globalConfig, errors);
      // check if vpc actually exists
      const vpcCheck = helpers.checkVpcInConfig(app.vpc, networkConfig);
      if (!vpcCheck) {
        errors.push(`[Application ${app.name}: VPC ${app.vpc} does not exist in file network-config.yaml]`);
      }
      // Validate app name
      if (!app.name) {
        errors.push(`[Application ${app.name}]: Application name is required`);
      }

      // Validate app vpc
      if (!app.vpc) {
        errors.push(`[Application ${app.vpc}]: Application vpc is required`);
      }

      if (vpcCheck) {
        // @ts-ignore
        this.checkAlb(app, vpcCheck, helpers, errors);
        // @ts-ignore
        this.checkNlb(app, vpcCheck, helpers, errors);
        // @ts-ignore
        this.checkLaunchTemplate(app, vpcCheck, helpers, securityConfig, errors);
        // @ts-ignore
        this.checkAutoScaling(app, vpcCheck, helpers, errors);
      }

      // Validate file
      if (app.launchTemplate) {
        if (!fs.existsSync(path.join(configDir, app.launchTemplate.userData!))) {
          errors.push(`Launch Template file ${app.launchTemplate.userData!} not found, for ${app.name} !!!`);
        }
      }
    }
    // Check for duplicate app names
    if (appNames.length > 1) {
      const duplicateAppNames = appNames.some(element => {
        return appNames.indexOf(element) !== appNames.lastIndexOf(element);
      });
      if (duplicateAppNames) {
        errors.push(`There are duplicates in application names. Application names: ${appNames}`);
      }
    }
  }
  private checkAppName(app: AppConfigItem, globalConfig: GlobalConfig, errors: string[]) {
    const allEnabledRegions = globalConfig.enabledRegions;
    let filteredRegions: t.Region[];
    if (app.deploymentTargets.excludedAccounts && app.deploymentTargets.excludedAccounts.length > 0) {
      filteredRegions = allEnabledRegions.filter(obj => !app.deploymentTargets.excludedAccounts.includes(obj));
    } else {
      filteredRegions = allEnabledRegions;
    }
    if (filteredRegions.length === 0) {
      errors.push(`[Application ${app.name}]: Has no deployment targets. Please consider removing this item.`);
    }
    this.checkAppNameLength(app.name, filteredRegions, errors);
  }
  private checkAppNameLength(appName: string, targetRegion: string[], errors: string[]) {
    for (const regionItem of targetRegion) {
      const stackName = `AWSAccelerator-App-${appName}-0123456789012-${regionItem}`;
      if (stackName.length > 128) {
        errors.push(`[Application ${appName}]: Application name ${stackName} is over 128 characters.`);
      }
    }
  }
  private checkLaunchTemplate(
    app: AppConfigItem,
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    helpers: CustomizationHelperMethods,
    loadSecurityConfig: SecurityConfig,
    errors: string[],
  ) {
    if (app.launchTemplate) {
      if (app.launchTemplate!.securityGroups.length === 0) {
        errors.push(
          `Launch Template ${app.launchTemplate!.name} does not have security groups in ${
            app.name
          }. At least one security group is required`,
        );
      }
      const ltSgCheck = helpers.checkSecurityGroupInConfig(app.launchTemplate!.securityGroups, vpcCheck);
      if (ltSgCheck === false) {
        errors.push(
          `Launch Template ${
            app.launchTemplate!.name
          } does not have security groups ${app.launchTemplate!.securityGroups.join(',')} in VPC ${app.vpc}.`,
        );
      }
      if (app.launchTemplate.blockDeviceMappings) {
        helpers.checkBlockDeviceMappings(
          app.launchTemplate.blockDeviceMappings,
          loadSecurityConfig,
          app.launchTemplate.name,
          errors,
        );
      }
    }
  }

  private checkAutoScaling(
    app: AppConfigItem,
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    if (app.autoscaling) {
      const allTargetGroupNames = app.targetGroups!.map(tg => tg.name);
      const asgTargetGroupNames = app.autoscaling.targetGroups ?? [];
      const compareTargetGroupNames = helpers.compareArrays(asgTargetGroupNames, allTargetGroupNames ?? []);
      if (compareTargetGroupNames.length > 0) {
        errors.push(
          `Autoscaling group ${
            app.autoscaling.name
          } has target groups that are not defined in application config. Autoscaling target groups: ${asgTargetGroupNames.join(
            ',',
          )} all target groups:  ${allTargetGroupNames.join(',')}`,
        );
      }
      const duplicateAsgSubnets = app.autoscaling.subnets.some(element => {
        return app.autoscaling!.subnets.indexOf(element) !== app.autoscaling!.subnets.lastIndexOf(element);
      });
      if (duplicateAsgSubnets) {
        errors.push(
          `There are duplicate subnets in Autoscaling group ${app.autoscaling.name} subnets in ${
            app.name
          }. Subnets: ${app.autoscaling!.subnets.join(',')}`,
        );
      }
      const asgSubnetsCheck = helpers.checkSubnetsInConfig(app.autoscaling!.subnets, vpcCheck);
      if (asgSubnetsCheck === false) {
        errors.push(
          `Autoscaling group ${app.autoscaling!.name} does not have subnets ${app.autoscaling!.subnets.join(
            ',',
          )} in VPC ${app.vpc}`,
        );
      }
    }
  }

  private checkNlb(
    app: AppConfigItem,
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    if (app.networkLoadBalancer) {
      if (app.networkLoadBalancer!.subnets.length < 1) {
        errors.push(
          `Network Load Balancer ${app.networkLoadBalancer!.name} does not have enough subnets in ${
            app.name
          }. At least one subnet is required.`,
        );
      }
      const duplicateNlbSubnets = app.networkLoadBalancer.subnets.some(element => {
        return (
          app.networkLoadBalancer!.subnets.indexOf(element) !== app.networkLoadBalancer!.subnets.lastIndexOf(element)
        );
      });
      if (duplicateNlbSubnets) {
        errors.push(
          `There are duplicates in Network Load Balancer ${app.networkLoadBalancer!.name} subnets in ${
            app.name
          }. Subnets: ${app.networkLoadBalancer!.subnets.join(',')}`,
        );
      }
      const nlbSubnetsCheck = helpers.checkSubnetsInConfig(app.networkLoadBalancer!.subnets, vpcCheck);
      if (nlbSubnetsCheck === false) {
        errors.push(
          `Network Load Balancer ${
            app.networkLoadBalancer!.name
          } does not have subnets ${app.networkLoadBalancer!.subnets.join(',')} in VPC ${app.vpc}`,
        );
      }
      const allTargetGroupNames = app.targetGroups!.map(tg => tg.name);
      const nlbTargetGroupNames = app.networkLoadBalancer!.listeners!.map(tg => tg.targetGroup);
      const compareTargetGroupNames = helpers.compareArrays(nlbTargetGroupNames ?? [], allTargetGroupNames ?? []);
      if (compareTargetGroupNames.length > 0) {
        errors.push(
          `Network Load Balancer ${
            app.networkLoadBalancer!.name
          } has target groups that are not defined in application config. NLB target groups: ${nlbTargetGroupNames.join(
            ',',
          )} all target groups:  ${allTargetGroupNames.join(',')}`,
        );
      }
    }
  }
  private checkAlb(
    app: AppConfigItem,
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    if (app.applicationLoadBalancer) {
      if (app.applicationLoadBalancer!.securityGroups.length === 0) {
        errors.push(
          `Application Load Balancer ${app.applicationLoadBalancer!.name} does not have security groups in ${
            app.name
          }. At least one security group is required`,
        );
      }
      const albSgCheck = helpers.checkSecurityGroupInConfig(app.applicationLoadBalancer!.securityGroups, vpcCheck);
      if (albSgCheck === false) {
        errors.push(
          `Application Load Balancer ${app.applicationLoadBalancer!.name} does not have security groups in VPC ${
            app.vpc
          }.`,
        );
      }
      if (app.applicationLoadBalancer!.subnets.length < 2) {
        errors.push(
          `Application Load Balancer ${app.applicationLoadBalancer!.name} does not have enough subnets in ${
            app.name
          }. At least two subnets are required in different AZs`,
        );
      }
      const duplicateAlbSubnets = app.applicationLoadBalancer.subnets.some(element => {
        return (
          app.applicationLoadBalancer!.subnets.indexOf(element) !==
          app.applicationLoadBalancer!.subnets.lastIndexOf(element)
        );
      });
      if (duplicateAlbSubnets) {
        errors.push(
          `There are duplicates in Application Load Balancer ${app.applicationLoadBalancer!.name} subnets in ${
            app.name
          }. Subnets: ${app.applicationLoadBalancer!.subnets.join(',')}`,
        );
      }
      const albSubnetsCheck = helpers.checkSubnetsInConfig(app.applicationLoadBalancer!.subnets, vpcCheck);
      if (albSubnetsCheck === false) {
        errors.push(
          `Application Load Balancer ${
            app.applicationLoadBalancer!.name
          } does not have subnets ${app.applicationLoadBalancer!.subnets.join(',')} in VPC ${app.vpc}`,
        );
      }

      const allTargetGroupNames = app.targetGroups!.map(tg => tg.name);
      const albTargetGroupNames = app.applicationLoadBalancer!.listeners!.map(tg => tg.targetGroup);
      const compareTargetGroupNames = helpers.compareArrays(albTargetGroupNames ?? [], allTargetGroupNames ?? []);
      if (compareTargetGroupNames.length > 0) {
        errors.push(
          `Application Load Balancer ${
            app.applicationLoadBalancer!.name
          } has target groups that are not defined in application config. ALB target groups: ${albTargetGroupNames.join(
            ',',
          )} all target groups:  ${allTargetGroupNames.join(',')}`,
        );
      }
    }
  }

  /**
   * Function to validate the service catalog config inputs.
   * @param configDir
   * @param values
   * @param errors
   */
  private validateServiceCatalogInputs(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    accountsConfig: AccountsConfig,
    errors: string[],
    accountNames: string[],
    ouIdNames: string[],
  ) {
    const managementAccount = accountsConfig.getManagementAccount().name;

    this.validateServiceCatalogShareTargetAccounts(values, accountNames, errors);

    this.validateServiceCatalogShareTargetOUs(values, ouIdNames, errors, managementAccount);

    // Validate portfolio names are unique
    this.validatePortfolioNameForUniqueness(values, errors);
  }

  /**
   * Function to validate portfolio names are unique
   * @param values
   */
  private validatePortfolioNameForUniqueness(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    errors: string[],
  ) {
    const portfolioNames = [...(values.customizations?.serviceCatalogPortfolios ?? [])].map(item => item.name);

    if (new Set(portfolioNames).size !== portfolioNames.length) {
      errors.push(`Duplicate Service Catalog Portfolio names defined [${portfolioNames}].`);
    }
  }

  /**
   * Function to validate existence of Service Catalog share target Accounts
   * Make sure deployment target Accounts are part of account config file
   * @param values
   */
  private validateServiceCatalogShareTargetAccounts(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const portfolio of values.customizations?.serviceCatalogPortfolios ?? []) {
      for (const account of portfolio?.shareTargets?.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Share target account ${account} for Service Catalog portfolio ${portfolio.name} does not exist in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of Service Catalog share target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateServiceCatalogShareTargetOUs(
    values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>,
    ouIdNames: string[],
    errors: string[],
    managementAccount: string,
  ) {
    for (const portfolio of values.customizations?.serviceCatalogPortfolios ?? []) {
      for (const ou of portfolio?.shareTargets?.organizationalUnits ?? []) {
        if (portfolio.account !== managementAccount) {
          errors.push(
            `Error sharing Service Catalog portfolio ${portfolio.name} with Organizational Unit ${ou}. Sharing portfolios to Organizational Units is only supported in the Management account.`,
          );
        }
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Share target OU ${ou} for Service Catalog portfolio ${portfolio.name} does not exist in accounts-config.yaml file.`,
          );
        }
      }
    }
  }
}

class CustomizationHelperMethods {
  /**
   * Validate if VPC name is in config file
   * @param string
   */
  public checkVpcInConfig(vpcName: string, values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>) {
    for (const vpcItem of values.vpcs ?? []) {
      if (vpcName === vpcItem.name) {
        // vpc name exists in network config. Return to function
        return vpcItem as VpcConfig;
      }
    }
    for (const vpcItem of values.vpcTemplates! ?? []) {
      if (vpcName === vpcItem.name) {
        // vpc name exists in network config. Return to function
        return vpcItem as VpcTemplatesConfig;
      }
    }
    // Looped through entire config and no matching vpc were found. Raise error
    return undefined;
  }
  /**
   * Validate if Security Group is in config file and if that security group is in the right vpc
   * @param string
   */
  public checkSecurityGroupInConfig(securityGroupNames: string[], vpcItem: VpcConfig | VpcTemplatesConfig) {
    // vpc name exists in network config.
    // Check within vpc to see if security group exists

    if (!vpcItem.securityGroups) {
      return false;
    }

    // Get all security group names
    const vpcSgs = vpcItem.securityGroups!.map(obj => {
      return obj.name;
    });

    // compare input to security groups in vpcs
    if (this.compareArrays(securityGroupNames, vpcSgs ?? []).length === 0) {
      return true;
    } else {
      return false;
    }
  }
  public compareArrays(array1: string[], array2: string[]) {
    return array1.filter(element => {
      return !array2.includes(element);
    });
  }
  public checkSubnetsInConfig(subnets: string[], vpcItem: VpcConfig | VpcTemplatesConfig) {
    // get all subnets within the vpc
    const vpcSubnets = vpcItem.subnets?.map(obj => {
      return obj.name;
    });
    // compare input to subnets in vpcs

    if (this.compareArrays(subnets, vpcSubnets ?? []).length === 0) {
      return true;
    } else {
      return false;
    }
  }

  public checkBlockDeviceMappings(
    blockDeviceMappings: t.TypeOf<typeof CustomizationsConfigTypes.blockDeviceMappingItem>[],
    securityConfig: SecurityConfig,
    launchTemplateName: string,
    errors: string[],
  ) {
    for (const blockDeviceMapping of blockDeviceMappings) {
      if (blockDeviceMapping.ebs && blockDeviceMapping.ebs.encrypted && blockDeviceMapping.ebs.kmsKeyId === undefined) {
        if (securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable === false) {
          errors.push(
            `EBS volume ${blockDeviceMapping.deviceName} in launch template ${launchTemplateName} is encrypted and no kmsKey is specified. Central Security ebs is disabled so no KMS key can be used.`,
          );
        }
      }
      if (blockDeviceMapping.ebs && blockDeviceMapping.ebs.encrypted && blockDeviceMapping.ebs.kmsKeyId) {
        const allKeys = securityConfig.keyManagementService?.keySets.map(obj => obj.name);
        const filterKey = allKeys?.find(obj => {
          return obj === blockDeviceMapping.ebs!.kmsKeyId;
        });
        if (!filterKey) {
          errors.push(
            `EBS volume ${
              blockDeviceMapping.deviceName
            } in launch template ${launchTemplateName} is encrypted and kmsKey ${
              blockDeviceMapping.ebs.kmsKeyId
            } specified does not exist. All keys: ${allKeys?.join(',')}.`,
          );
        }
      }
    }
  }

  public getIamUsersDeployedToAccount(iamConfig: IamConfig, accountsConfig: AccountsConfig, accountName: string) {
    const usernameList = [];
    for (const userSetItem of iamConfig.userSets ?? []) {
      const deploymentAccountNames = this.getAccountNamesFromDeploymentTarget(
        userSetItem.deploymentTargets,
        accountsConfig,
      );
      if (deploymentAccountNames.includes(accountName)) {
        usernameList.push(...userSetItem.users.map(a => a.username));
      }
    }
    return usernameList;
  }

  public getIamGroupsDeployedToAccount(iamConfig: IamConfig, accountsConfig: AccountsConfig, accountName: string) {
    const groupList = [];
    for (const groupSetItem of iamConfig.groupSets ?? []) {
      const deploymentAccountNames = this.getAccountNamesFromDeploymentTarget(
        groupSetItem.deploymentTargets,
        accountsConfig,
      );
      if (deploymentAccountNames.includes(accountName)) {
        groupList.push(...groupSetItem.groups.map(a => a.name));
      }
    }
    return groupList;
  }

  public getIamRolesDeployedToAccount(iamConfig: IamConfig, accountsConfig: AccountsConfig, accountName: string) {
    const roleList = [];
    for (const roleSetItem of iamConfig.roleSets ?? []) {
      const deploymentAccountNames = this.getAccountNamesFromDeploymentTarget(
        roleSetItem.deploymentTargets,
        accountsConfig,
      );
      if (deploymentAccountNames.includes(accountName)) {
        roleList.push(...roleSetItem.roles.map(a => a.name));
      }
    }
    return roleList;
  }

  private getAccountNamesFromDeploymentTarget(
    deploymentTargets: t.DeploymentTargets,
    accountsConfig: AccountsConfig,
  ): string[] {
    const accountNames: string[] = [];
    // Helper function to add an account to the list
    const addAccountName = (accountName: string) => {
      if (!accountNames.includes(accountName)) {
        accountNames.push(accountName);
      }
    };
    /**
     * @param configDir
     * @returns
     */

    for (const ou of deploymentTargets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          addAccountName(account.name);
        }
      } else {
        for (const account of [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts]) {
          if (ou === account.organizationalUnit) {
            addAccountName(account.name);
          }
        }
      }
    }

    for (const account of deploymentTargets.accounts ?? []) {
      addAccountName(account);
    }

    return accountNames;
  }
}

class FirewallValidator {
  constructor(
    values: CustomizationsConfig,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    configDir: string,
    errors: string[],
  ) {
    // Validate firewall instances
    this.validateFirewalls(values, networkConfig, securityConfig, configDir, errors);
  }

  private validateFirewalls(
    values: CustomizationsConfig,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    configDir: string,
    errors: string[],
  ) {
    // Load helper methods
    const helpers = new CustomizationHelperMethods();

    // Validate firewall instance configs
    this.validateFirewallInstances(values, helpers, configDir, networkConfig, securityConfig, errors);
    // Validate firewall ASG configs
    this.validateFirewallAsgs(values, helpers, configDir, networkConfig, securityConfig, errors);
    // Validate firewall target groups
    this.validateFirewallTargetGroups(values, helpers, errors);
  }

  /**
   * Validate firewall instances
   * @param values
   * @param helpers
   * @param configDir
   * @param networkConfig
   * @param securityConfig
   * @param errors
   */
  private validateFirewallInstances(
    values: CustomizationsConfig,
    helpers: CustomizationHelperMethods,
    configDir: string,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    errors: string[],
  ) {
    const firewallInstances = [...(values.firewalls?.instances ?? []), ...(values.firewalls?.managerInstances ?? [])];
    for (const firewall of firewallInstances) {
      // Validate VPC
      const vpc = helpers.checkVpcInConfig(firewall.vpc, networkConfig);
      if (!vpc) {
        errors.push(`[Firewall instance ${firewall.name}]: VPC ${firewall.vpc} does not exist in network-config.yaml`);
      }
      if (vpc && NetworkConfigTypes.vpcTemplatesConfig.is(vpc)) {
        errors.push(`[Firewall instance ${firewall.name}]: VPC templates are not supported`);
      }

      // Firewall instance launch templates must have network interface definitions
      if (!firewall.launchTemplate.networkInterfaces) {
        errors.push(
          `[Firewall instance ${firewall.name}]: launch template must include at least one network interface configuration`,
        );
      }

      // Validate launch template
      if (NetworkConfigTypes.vpcConfig.is(vpc) && firewall.launchTemplate.networkInterfaces) {
        this.validateLaunchTemplate(vpc, firewall, configDir, securityConfig, helpers, errors);
      }
    }
  }

  private validateFirewallAsgs(
    values: CustomizationsConfig,
    helpers: CustomizationHelperMethods,
    configDir: string,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    errors: string[],
  ) {
    for (const group of values.firewalls?.autoscalingGroups ?? []) {
      // Validate VPC
      const vpc = helpers.checkVpcInConfig(group.vpc, networkConfig);
      if (!vpc) {
        errors.push(`[Firewall ASG ${group.name}]: VPC ${group.vpc} does not exist in network-config.yaml`);
      }
      if (vpc && NetworkConfigTypes.vpcTemplatesConfig.is(vpc)) {
        errors.push(`[Firewall ASG ${group.name}]: VPC templates are not supported`);
      }

      // Validate EIP and source/dest check is not assigned to any interface
      if (group.launchTemplate.networkInterfaces) {
        if (group.launchTemplate.networkInterfaces.find(item => item.associateElasticIp)) {
          errors.push(
            `[Firewall ASG ${group.name}]: cannot define associateElasticIp property for ASG network interfaces`,
          );
        }
        if (group.launchTemplate.networkInterfaces.find(item => item.sourceDestCheck === false)) {
          errors.push(
            `[Firewall ASG ${group.name}]: cannot define sourceDestCheck property for ASG network interfaces`,
          );
        }
      }

      // Validate launch template
      if (NetworkConfigTypes.vpcConfig.is(vpc)) {
        this.validateLaunchTemplate(vpc, group, configDir, securityConfig, helpers, errors);
        this.validateAsgTargetGroups(values, group, errors);
      }
    }
  }

  private validateFirewallTargetGroups(
    values: CustomizationsConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    for (const group of values.firewalls?.targetGroups ?? []) {
      if (group.type !== 'instance') {
        errors.push(`[Firewall target group ${group.name}]: target group must be instance type`);
      }
      if (group.type === 'instance' && group.targets) {
        const instancesExist = this.checkTargetsInConfig(helpers, group.targets, values.firewalls?.instances ?? []);
        if (!instancesExist) {
          errors.push(
            `[Firewall target group ${group.name}]: target group references firewall instance that does not exist`,
          );
        }

        if (instancesExist) {
          this.checkInstanceVpcs(group, values.firewalls!.instances!, errors);
        }
      }
    }
  }

  private checkTargetsInConfig(
    helpers: CustomizationHelperMethods,
    targets: (string | NlbTargetTypeConfig)[],
    config: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>[],
  ): boolean {
    // Retrieve target groups
    const targetInstances = config.map(instance => {
      return instance.name;
    });

    const targetStrings = targets.filter(target => typeof target === 'string') as string[];

    // Compare arrays
    if (helpers.compareArrays(targetStrings, targetInstances).length === 0) {
      return true;
    }
    return false;
  }

  private checkInstanceVpcs(
    group: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupItem>,
    config: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>[],
    errors: string[],
  ) {
    // Retrieve instance configs
    const instances: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>[] = [];
    group.targets!.forEach(target => instances.push(config.find(item => item.name === target)!));

    // Map VPCs
    const vpcs = instances.map(item => {
      return item.vpc;
    });

    if (vpcs.some(vpc => vpc !== vpcs[0])) {
      errors.push(`[Firewall target group ${group.name}]: targeted instances are in separate VPCs`);
    }
  }

  /**
   * Validate a firewall launch template
   * @param vpc
   * @param firewall
   * @param configDir
   * @param securityConfig
   * @param helpers
   * @param errors
   */
  private validateLaunchTemplate(
    vpc: VpcConfig,
    firewall:
      | t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>
      | t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig>,
    configDir: string,
    securityConfig: SecurityConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    // Validate security groups
    this.validateLaunchTemplateSecurityGroups(vpc, firewall, helpers, errors);
    // Validate subnets
    this.validateLaunchTemplateSubnets(vpc, firewall, helpers, errors);
    // Validate block devices
    if (firewall.launchTemplate.blockDeviceMappings) {
      helpers.checkBlockDeviceMappings(
        firewall.launchTemplate.blockDeviceMappings,
        securityConfig,
        firewall.launchTemplate.name,
        errors,
      );
    }
    // Validate user data file exists
    if (firewall.launchTemplate.userData) {
      if (!fs.existsSync(path.join(configDir, firewall.launchTemplate.userData))) {
        errors.push(`[Firewall ${firewall.name}]: launch template user data file not found`);
      }
    }
  }

  /**
   * Validates that security groups are appropriately attached
   * to a launch template and that they exist in the target VPC
   * @param vpc
   * @param firewall
   * @param helpers
   * @param errors
   */
  private validateLaunchTemplateSecurityGroups(
    vpc: VpcConfig,
    firewall:
      | t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>
      | t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig>,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    const interfaces = firewall.launchTemplate.networkInterfaces;
    if (firewall.launchTemplate.securityGroups.length === 0) {
      // Validate network interfaces are configured
      if (!interfaces) {
        errors.push(
          `[Firewall ${firewall.name}]: network interfaces must be configured if launch template securityGroups property is empty`,
        );
      }
      // Validate network interfaces have at least one group assigned
      if (interfaces && !this.includesInterfaceGroups(interfaces)) {
        errors.push(
          `[Firewall ${firewall.name}]: security groups must be attached per network interface if launch template securityGroups property is empty`,
        );
      }
    }

    // Validate security groups
    if (!helpers.checkSecurityGroupInConfig(firewall.launchTemplate.securityGroups, vpc)) {
      errors.push(
        `[Firewall ${firewall.name}]: launch template references security groups that do not exist in VPC ${vpc.name}`,
      );
    }
    for (const interfaceItem of interfaces ?? []) {
      if (interfaceItem.groups) {
        if (!helpers.checkSecurityGroupInConfig(interfaceItem.groups, vpc)) {
          errors.push(
            `[Firewall ${firewall.name}]: launch template network interface references security group that does not exist in VPC ${vpc.name}`,
          );
        }
      }
    }
  }

  /**
   * Validates that there is at least one security group attached
   * to each network interface defined in a launch template
   * @param interfaces
   * @returns
   */
  private includesInterfaceGroups(
    interfaces: t.TypeOf<typeof CustomizationsConfigTypes.networkInterfaceItem>[],
  ): boolean {
    for (const interfaceItem of interfaces) {
      if (!interfaceItem.groups || interfaceItem.groups.length === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * Validate subnets in the firewall configuration
   * @param vpc
   * @param firewall
   * @param helpers
   * @param errors
   */
  private validateLaunchTemplateSubnets(
    vpc: VpcConfig,
    firewall:
      | t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>
      | t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig>,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    if (CustomizationsConfigTypes.ec2FirewallInstanceConfig.is(firewall)) {
      this.validateInstanceLaunchTemplateSubnets(vpc, firewall, helpers, errors);
    }
    if (CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig.is(firewall)) {
      this.validateAsgLaunchTemplateSubnets(vpc, firewall, helpers, errors);
    }
  }

  /**
   * Validate subnets for firewall instances
   * @param vpc
   * @param firewall
   * @param helpers
   * @param errors
   */
  private validateInstanceLaunchTemplateSubnets(
    vpc: VpcConfig,
    firewall: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    // Validate a subnet is associated with each network interface
    if (!this.includesSubnet(firewall.launchTemplate.networkInterfaces!)) {
      errors.push(
        `[Firewall instance ${firewall.name}]: launch template network interface configurations must include subnet attachments`,
      );
    }
    // Validate subnets are in the VPC
    const interfaceSubnets = firewall.launchTemplate.networkInterfaces!.map(interfaceItem => {
      return interfaceItem.subnetId!;
    });
    const subnetsExist = helpers.checkSubnetsInConfig(interfaceSubnets, vpc);
    if (!subnetsExist) {
      errors.push(
        `[Firewall instance ${firewall.name}]: launch template network interface references subnet that does not exist in VPC ${vpc.name}`,
      );
    }
    // Validate subnet AZs
    if (subnetsExist) {
      // Retrieve subnet configs
      const subnets: t.TypeOf<typeof NetworkConfigTypes.subnetConfig>[] = [];
      interfaceSubnets.forEach(subnet => subnets.push(vpc.subnets!.find(item => item.name === subnet)!));

      // Map AZs
      const subnetAzs = subnets.map(subnetItem => {
        return subnetItem.availabilityZone;
      });

      if (subnetAzs.some(az => az !== subnetAzs[0])) {
        errors.push(
          `[Firewall instance ${firewall.name}]: launch template network interfaces reference subnets that reside in different AZs in VPC ${vpc.name}`,
        );
      }
    }
  }

  /**
   * Validate subnets for firewall ASGs
   * @param vpc
   * @param firewall
   * @param helpers
   * @param errors
   */
  private validateAsgLaunchTemplateSubnets(
    vpc: VpcConfig,
    firewall: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig>,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    // Validate subnets are not defined in network interfaces
    if (firewall.launchTemplate.networkInterfaces) {
      if (this.includesSubnet(firewall.launchTemplate.networkInterfaces)) {
        errors.push(
          `[Firewall ASG ${firewall.name}]: launch template network interface configurations cannot include subnet attachments. Define subnets under the autoscaling property instead`,
        );
      }
    }
    // Validate subnets are in the VPC
    if (!helpers.checkSubnetsInConfig(firewall.autoscaling.subnets, vpc)) {
      errors.push(
        `[Firewall ASG ${firewall.name}]: autoscaling configuration references subnet that does not exist in VPC ${vpc.name}`,
      );
    }
    // Check for duplicate subnets
    const duplicateAsgSubnets = firewall.autoscaling.subnets.some(element => {
      return firewall.autoscaling!.subnets.indexOf(element) !== firewall.autoscaling!.subnets.lastIndexOf(element);
    });
    if (duplicateAsgSubnets) {
      errors.push(
        `There are duplicate subnets in Autoscaling group ${firewall.autoscaling.name} subnets in ${
          firewall.name
        }. Subnets: ${firewall.autoscaling!.subnets.join(',')}`,
      );
    }
  }

  private includesSubnet(interfaces: t.TypeOf<typeof CustomizationsConfigTypes.networkInterfaceItem>[]) {
    for (const interfaceItem of interfaces) {
      if (!interfaceItem.subnetId) {
        return false;
      }
    }
    return true;
  }

  private validateAsgTargetGroups(
    values: CustomizationsConfig,
    group: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig>,
    errors: string[],
  ) {
    if (group.autoscaling.targetGroups) {
      // Validate target groups are defined
      if (!values.firewalls?.targetGroups) {
        errors.push(
          `[Firewall ASG ${group.name}]: targetGroups property references a target group that does not exist`,
        );
      }
      // Validate length of array
      if (group.autoscaling.targetGroups.length > 1) {
        errors.push(
          `[Firewall ASG ${group.name}]: targetGroups property may only contain a single target group reference`,
        );
      }
      // Validate target group exists
      const targetGroup = values.firewalls?.targetGroups?.find(
        item => item.name === group.autoscaling.targetGroups![0],
      );
      if (group.autoscaling.targetGroups.length === 1 && !targetGroup) {
        errors.push(
          `[Firewall ASG ${group.name}]: targetGroups property references a target group that does not exist`,
        );
      }
      // Validate target group does not have instance targets
      if (targetGroup && targetGroup.targets) {
        errors.push(
          `[Firewall ASG ${group.name}]: targetGroups property references a target group with instance targets`,
        );
      }
      // Validate target group type
      if (targetGroup && targetGroup.type !== 'instance') {
        errors.push(`[Firewall ASG ${group.name}]: targetGroups property must reference an instance type target group`);
      }
    }
  }
}

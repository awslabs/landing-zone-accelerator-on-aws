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
import { DeploymentTargets, Region, ShareTargets, isCustomizationsType, isNetworkType } from '../lib/common';
import {
  AppConfigItem,
  ApplicationLoadBalancerConfig,
  CustomizationsConfig,
  Ec2FirewallAutoScalingGroupConfig,
  Ec2FirewallInstanceConfig,
  NetworkLoadBalancerConfig,
  NlbTargetTypeConfig,
  TargetGroupItemConfig,
} from '../lib/customizations-config';
import { GlobalConfig } from '../lib/global-config';
import { IamConfig } from '../lib/iam-config';
import {
  IBlockDeviceMappingItem,
  ICloudFormationStackSet,
  ICustomizationsConfig,
  IEc2FirewallAutoScalingGroupConfig,
  IEc2FirewallInstanceConfig,
  INetworkInterfaceItem,
  ITargetGroupItem,
} from '../lib/models/customizations-config';
import { INetworkConfig, ISubnetConfig } from '../lib/models/network-config';
import { NetworkConfig, VpcConfig, VpcTemplatesConfig } from '../lib/network-config';
import { OrganizationConfig } from '../lib/organization-config';
import { SecurityConfig } from '../lib/security-config';
import { CommonValidatorFunctions } from './common/common-validator-functions';
import { isIpV4, isIpV6 } from './common/ip-address-validation';
/**
 * Customizations Configuration validator.
 * Validates customization configuration
 */
export class CustomizationsConfigValidator {
  constructor(
    values: CustomizationsConfig,
    accountsConfig: AccountsConfig,
    globalConfig: GlobalConfig,
    iamConfig: IamConfig,
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
    // Instantiate helper methods
    const helpers = new CustomizationHelperMethods(accountsConfig, iamConfig, globalConfig);

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
      helpers,
      errors,
    );

    // Validate firewalls
    new FirewallValidator(values, networkConfig, securityConfig, accountsConfig, configDir, helpers, errors);

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
    helpers: CustomizationHelperMethods,
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

    // Validate circular dependencies between stacksets
    this.validateCircularDependencies(values, errors);

    // Validate presence of template file
    this.validateTemplateFile(configDir, values, errors);

    // Validate applications inputs
    this.validateApplicationsInputs(
      values,
      {
        configDir,
        accountsConfig,
        globalConfig,
        networkConfig,
        securityConfig,
      },
      helpers,
      errors,
    );

    // Validate Service Catalog portfolio inputs
    this.validateServiceCatalogInputs(values, accountsConfig, errors, accountNames, ouIdNames);

    /**
     * @remarks
     * Customizations require region validation for the following resources:
     * - Custom CloudFormation Stacks
     * - Custom CloudFormation StackSets
     * - Service Catalog Portfolios
     *
     * Region validation is not required for:
     * - Applications (region is already checked)
     * - Firewalls (not an option)
     */
    this.validateCustomizationsConfigRegions(values, errors, globalConfig);
  }

  /**
   * Validates that there are no circular dependencies between stacksets.
   *
   * This function is getting all the circular dependencies and checks that there are no circular dependencies between StackSets, i.e.
   * StackSet A depends on StackSet B and StackSet B depends on StackSet A. Circular dependency between StackSets can lead to infinite loop.
   *
   * @param values - The customizations configuration object.
   * @param errors - An array to store any validation errors.
   */
  private validateCircularDependencies(values: ICustomizationsConfig, errors: string[]) {
    for (const stackSet of values.customizations?.cloudFormationStackSets ?? []) {
      const stackSetDependencyChain: string[] = [];
      this.findCircularDependencyInSingleStack(
        stackSet,
        stackSetDependencyChain,
        values.customizations?.cloudFormationStackSets,
        errors,
      );
    }
  }

  /**
   * this function is checking the dependencies for a given stackSet. If the given stackSet is part of ciruclar dependency,
   * a validation error will be added into the errors array.
   * @param stackSet - The stackSet's dependencies to check
   * @param stackSetDependencyChain - parameter that contains all the stackset names of the dependency chain, i.e. Stackset A depends on StackSet B,
   * stackSetDependencyChain will be [stackSet A, stackSet B] accordingly
   * @param errors - An array to store any validation errors.
   */
  private findCircularDependencyInSingleStack(
    stackSet: ICloudFormationStackSet,
    stackSetDependencyChain: string[],
    cloudFormationStackSets: ICloudFormationStackSet[] | undefined,
    errors: string[],
  ) {
    if (stackSet?.dependsOn?.length == 0) {
      return;
    }

    for (const dependency of stackSet.dependsOn ?? []) {
      if (stackSetDependencyChain.includes(dependency)) {
        errors.push(`Found circular dependency between the stacks '${stackSet.name}' and '${dependency}'`);
        return;
      }
    }

    for (const dependency of stackSet.dependsOn ?? []) {
      const currentStackSetDependencyChain: string[] = Object.assign([], stackSetDependencyChain);
      currentStackSetDependencyChain.push(dependency);

      // pull the stackSet Obj to call the func in recusrsion with it
      const stacksetObjDependency: ICloudFormationStackSet | undefined = cloudFormationStackSets?.find(
        stackSet => stackSet.name == dependency,
      );

      if (stacksetObjDependency == undefined) {
        errors.push(`Dependency '${dependency}' defined in stackSet '${stackSet.name}' is not found!`);
        return;
      }

      this.findCircularDependencyInSingleStack(
        stacksetObjDependency as ICloudFormationStackSet,
        currentStackSetDependencyChain,
        cloudFormationStackSets,
        errors,
      );
    }
  }

  /**
   * Validates the regions specified in the customizations configuration.
   *
   * This function iterates through the CloudFormation stacks, CloudFormation stack sets, and Service Catalog portfolios
   * defined in the customizations configuration. For each of these, it calls the `validateCustomizationsRegions` function
   * to validate the regions specified for that resource.
   *
   * @param values - The customizations configuration object.
   * @param errors - An array to store any validation errors.
   * @param globalConfig - The global configuration object.
   */
  private validateCustomizationsConfigRegions(
    values: ICustomizationsConfig,
    errors: string[],
    globalConfig: GlobalConfig,
  ) {
    for (const stack of values.customizations?.cloudFormationStacks ?? []) {
      this.validateCustomizationsRegions(
        stack.name,
        'CloudFormation Stack',
        stack.regions,
        globalConfig.enabledRegions,
        errors,
      );
    }

    for (const stackSet of values.customizations?.cloudFormationStackSets ?? []) {
      this.validateCustomizationsRegions(
        stackSet.name,
        'CloudFormation StackSet',
        stackSet.regions,
        globalConfig.enabledRegions,
        errors,
      );
    }

    for (const serviceCatalogPortfolio of values.customizations?.serviceCatalogPortfolios ?? []) {
      this.validateCustomizationsRegions(
        serviceCatalogPortfolio.name,
        'Service Catalog Portfolio',
        serviceCatalogPortfolio.regions,
        globalConfig.enabledRegions,
        errors,
      );
    }
  }

  /**
   * Validates the regions specified for a given resource against the enabled regions.
   *
   * @param resourceName - The name of the resource being validated.
   * @param resourceType - The type of the resource being validated (e.g., CloudFormation Stack, CloudFormation StackSet, Service Catalog Portfolio).
   * @param regions - An array of regions specified for the resource.
   * @param enabledRegions - An array of enabled regions to validate against.
   * @param errors - An array to store any error messages generated during validation.
   */
  private validateCustomizationsRegions(
    resourceName: string,
    resourceType: string,
    regions: string[],
    enabledRegions: Region[],
    errors: string[],
  ) {
    for (const region of regions) {
      if (!enabledRegions.includes(region as Region)) {
        errors.push(
          `Invalid region ${region} specified for ${resourceType} ${resourceName}. Region must be part of enabled regions: ${enabledRegions}.`,
        );
      }
    }
  }

  /**
   * Function to validate template file existence
   * @param configDir
   * @param values
   */
  private validateTemplateFile(configDir: string, values: ICustomizationsConfig, errors: string[]) {
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
  private validateStackNameLength(values: ICustomizationsConfig, errors: string[]) {
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
  private validateStackNameForUniqueness(values: ICustomizationsConfig, errors: string[]) {
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
  private validateDeploymentTargetOUs(values: ICustomizationsConfig, ouIdNames: string[], errors: string[]) {
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
    values: ICustomizationsConfig,
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
    values: ICustomizationsConfig,
    configs: {
      configDir: string;
      accountsConfig: AccountsConfig;
      globalConfig: GlobalConfig;
      networkConfig: NetworkConfig;
      securityConfig: SecurityConfig;
    },
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    const appNames: string[] = [];
    for (const app of values.applications ?? []) {
      appNames.push(app.name);

      //check if appName with prefixes is over 128 characters
      this.checkAppName(app as AppConfigItem, configs.globalConfig, errors);
      // check if vpc actually exists
      const vpcCheck = helpers.checkVpcInConfig(app.vpc, configs.networkConfig);
      if (!vpcCheck) {
        errors.push(`Application ${app.name}: VPC ${app.vpc} does not exist in file network-config.yaml`);
      } else if (vpcCheck) {
        if (app.applicationLoadBalancer) {
          this.checkAlb(
            app.applicationLoadBalancer as ApplicationLoadBalancerConfig,
            vpcCheck,
            {
              networkConfig: configs.networkConfig,
              accountsConfig: configs.accountsConfig,
              globalConfig: configs.globalConfig,
            },
            {
              appName: app.name,
              appVpc: app.vpc,
              appTargetGroups: (app.targetGroups as TargetGroupItemConfig[]) ?? undefined,
              deploymentTargets: app.deploymentTargets as DeploymentTargets,
            },
            helpers,
            errors,
          );
        }
        if (app.networkLoadBalancer) {
          this.checkNlb(
            app.networkLoadBalancer as NetworkLoadBalancerConfig,
            vpcCheck,
            {
              networkConfig: configs.networkConfig,
              accountsConfig: configs.accountsConfig,
              globalConfig: configs.globalConfig,
            },
            {
              appName: app.name,
              appVpc: app.vpc,
              appTargetGroups: (app.targetGroups as TargetGroupItemConfig[]) ?? undefined,
              deploymentTargets: app.deploymentTargets as DeploymentTargets,
            },
            helpers,
            errors,
          );
        }
        this.checkLaunchTemplate(app as AppConfigItem, vpcCheck, helpers, configs.securityConfig, errors);
        this.checkAutoScaling(app as AppConfigItem, vpcCheck, helpers, configs.accountsConfig, errors);
      }
      // Validate file
      if (app.launchTemplate?.userData) {
        if (!fs.existsSync(path.join(configs.configDir, app.launchTemplate.userData))) {
          errors.push(`Launch Template file ${app.launchTemplate.userData} not found, for ${app.name} !!!`);
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
    // Validate app name
    if (!app.name) {
      errors.push(`[Application ${app.name}]: Application name is required`);
    }

    // Validate app vpc
    if (!app.vpc) {
      errors.push(`[Application ${app.vpc}]: Application vpc is required`);
    }

    const allEnabledRegions = globalConfig.enabledRegions;
    let filteredRegions: Region[];
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
      const solutionPrefix = process.env['ACCELERATOR_PREFIX'] ?? 'AWSAccelerator';
      const stackName = `${solutionPrefix}-App-${appName}-0123456789012-${regionItem}`;
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
      const launchTemplateSecurityGroups = app.launchTemplate.securityGroups ?? [];
      const ltSgCheck = helpers.checkSecurityGroupInConfig(launchTemplateSecurityGroups, vpcCheck);
      if (ltSgCheck === false) {
        errors.push(
          `Launch Template ${
            app.launchTemplate!.name
          } does not have security groups ${launchTemplateSecurityGroups.join(',')} in VPC ${app.vpc}.`,
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
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    if (app.autoscaling) {
      const allTargetGroupNames = app.targetGroups?.map(tg => tg.name);
      const asgTargetGroupNames = app.autoscaling.targetGroups ?? [];
      const compareTargetGroupNames = helpers.compareArrays(asgTargetGroupNames, allTargetGroupNames ?? []);
      if (compareTargetGroupNames.length > 0) {
        errors.push(
          `Autoscaling group ${
            app.autoscaling.name
          } has target groups that are not defined in application config. Autoscaling target groups: ${asgTargetGroupNames.join(
            ',',
          )} all target groups:  ${allTargetGroupNames?.join(',')}`,
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
      const asgSubnetsCheck = helpers.checkSubnetsInConfig(app.autoscaling.subnets, vpcCheck);
      if (asgSubnetsCheck === false) {
        errors.push(
          `Autoscaling group ${app.autoscaling.name} does not have subnets ${app.autoscaling!.subnets.join(
            ',',
          )} in VPC ${app.vpc}`,
        );
      }
      if (
        asgSubnetsCheck &&
        !this.checkSubnetsTarget(app.autoscaling.subnets, vpcCheck, app.deploymentTargets, accountsConfig, errors)
      ) {
        errors.push(
          `AutoScaling group ${app.autoscaling.name} has subnets ${app.autoscaling.subnets.join(
            ',',
          )} which are not created or shared in deploymentTargets`,
        );
      }
    }
  }

  private checkNlb(
    nlb: NetworkLoadBalancerConfig,
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    configs: {
      networkConfig: NetworkConfig;
      accountsConfig: AccountsConfig;
      globalConfig: GlobalConfig;
    },
    appInfo: {
      appName: string;
      appVpc: string;
      appTargetGroups: TargetGroupItemConfig[] | undefined;
      deploymentTargets: DeploymentTargets;
    },
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    if (nlb.subnets.length < 1) {
      errors.push(
        `Network Load Balancer ${nlb.name} does not have enough subnets in ${appInfo.appName}. At least one subnet is required.`,
      );
    }
    const duplicateNlbSubnets = nlb.subnets.some(element => {
      return nlb.subnets.indexOf(element) !== nlb.subnets.lastIndexOf(element);
    });
    if (duplicateNlbSubnets) {
      errors.push(
        `There are duplicates in Network Load Balancer ${nlb.name} subnets in ${
          appInfo.appName
        }. Subnets: ${nlb.subnets.join(',')}`,
      );
    }
    const nlbSubnetsCheck = helpers.checkSubnetsInConfig(nlb.subnets, vpcCheck);
    if (nlbSubnetsCheck === false) {
      errors.push(
        `Network Load Balancer ${nlb.name} does not have subnets ${nlb.subnets.join(',')} in VPC ${appInfo.appVpc}`,
      );
    }
    if (
      nlbSubnetsCheck &&
      !this.checkSubnetsTarget(nlb.subnets, vpcCheck, appInfo.deploymentTargets, configs.accountsConfig, errors)
    ) {
      errors.push(
        `Network Load Balancer ${nlb.name} has subnets ${nlb.subnets.join(
          ',',
        )} which are not created or shared in deploymentTargets`,
      );
    }
    const allTargetGroupNames = appInfo.appTargetGroups?.map(tg => tg.name);
    const nlbTargetGroupNames = nlb.listeners?.map(tg => tg.targetGroup);
    const compareTargetGroupNames = helpers.compareArrays(nlbTargetGroupNames ?? [], allTargetGroupNames ?? []);
    if (compareTargetGroupNames.length > 0) {
      errors.push(
        `Network Load Balancer ${
          nlb.name
        } has target groups that are not defined in application config. NLB target groups: ${nlbTargetGroupNames?.join(
          ',',
        )} all target groups:  ${allTargetGroupNames?.join(',')}`,
      );
    }
    const listenerNameCert = (nlb.listeners ?? [])
      .filter(obj => obj.certificate)
      .map(obj => {
        return { name: obj.name, certificate: obj.certificate };
      });
    if (listenerNameCert.length > 0) {
      this.checkListenerCerts(
        listenerNameCert,
        nlb.name,
        appInfo.appName,
        configs,
        appInfo.deploymentTargets,
        'Network Load Balancer',
        errors,
      );
    }
  }

  private checkAlb(
    alb: ApplicationLoadBalancerConfig,
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    configs: {
      networkConfig: NetworkConfig;
      accountsConfig: AccountsConfig;
      globalConfig: GlobalConfig;
    },
    appInfo: {
      appName: string;
      appVpc: string;
      appTargetGroups: TargetGroupItemConfig[] | undefined;
      deploymentTargets: DeploymentTargets;
    },
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    if (alb.securityGroups.length === 0) {
      errors.push(
        `Application Load Balancer ${alb.name} does not have security groups in ${appInfo.appName}. At least one security group is required`,
      );
    }
    const albSgCheck = helpers.checkSecurityGroupInConfig(alb.securityGroups, vpcCheck);
    if (albSgCheck === false) {
      errors.push(`Application Load Balancer ${alb.name} does not have security groups in VPC ${appInfo.appVpc}.`);
    }
    if (alb.subnets.length < 2) {
      errors.push(
        `Application Load Balancer ${alb.name} does not have enough subnets in ${appInfo.appName}. At least two subnets are required in different AZs`,
      );
    }
    const duplicateAlbSubnets = alb.subnets.some(element => {
      return alb.subnets.indexOf(element) !== alb.subnets.lastIndexOf(element);
    });
    if (duplicateAlbSubnets) {
      errors.push(
        `There are duplicates in Application Load Balancer ${alb.name} subnets in ${
          appInfo.appName
        }. Subnets: ${alb.subnets.join(',')}`,
      );
    }
    const albSubnetsCheck = helpers.checkSubnetsInConfig(alb.subnets, vpcCheck);
    if (albSubnetsCheck === false) {
      errors.push(
        `Application Load Balancer ${alb.name} does not have subnets ${alb.subnets.join(',')} in VPC ${appInfo.appVpc}`,
      );
    }

    if (
      albSubnetsCheck &&
      !this.checkSubnetsTarget(alb.subnets, vpcCheck, appInfo.deploymentTargets, configs.accountsConfig, errors)
    ) {
      errors.push(`Application Load Balancer ${alb.name} have invalid subnets configuration`);
    }
    const allTargetGroupNames = appInfo.appTargetGroups?.map(tg => tg.name);
    const albTargetGroupNames = alb.listeners?.map(tg => tg.targetGroup);
    const compareTargetGroupNames = helpers.compareArrays(albTargetGroupNames ?? [], allTargetGroupNames ?? []);
    if (compareTargetGroupNames.length > 0) {
      errors.push(
        `Application Load Balancer ${
          alb.name
        } has target groups that are not defined in application config. ALB target groups: ${albTargetGroupNames?.join(
          ',',
        )} all target groups:  ${allTargetGroupNames?.join(',')}`,
      );
    }
    const listenerNameCert = (alb.listeners ?? [])
      .filter(obj => obj.certificate)
      .map(obj => {
        return { name: obj.name, certificate: obj.certificate };
      });
    if (listenerNameCert.length > 0) {
      this.checkListenerCerts(
        listenerNameCert,
        alb.name,
        appInfo.appName,
        configs,
        appInfo.deploymentTargets,
        'Application Load Balancer',
        errors,
      );
    }
  }

  private checkListenerCerts(
    listeners: { name: string; certificate: string | undefined }[],
    albName: string,
    appName: string,
    configs: { networkConfig: NetworkConfig; accountsConfig: AccountsConfig; globalConfig: GlobalConfig },
    listenerDeploymentTargets: DeploymentTargets,
    loadBalancerType: string,
    errors: string[],
  ) {
    // check to see if certificates are used
    const getListenerWithCertificate = listeners.filter(obj => obj.certificate);

    if (getListenerWithCertificate.length > 0 && !configs.networkConfig.certificates) {
      errors.push(`Found listeners with certificates but no certificates specified in network-config.yaml`);
    } else if (getListenerWithCertificate.length > 0 && configs.networkConfig.certificates) {
      for (const listener of getListenerWithCertificate) {
        this.verifyCertDeployment(
          {
            listener,
            loadBalancerType,
            loadBalancerName: albName,
            deploymentTargets: listenerDeploymentTargets,
            appName,
          },
          configs,
          errors,
        );
      }
    }
  }

  private verifyCertDeployment(
    listenerData: {
      listener: { name: string; certificate: string | undefined };
      loadBalancerType: string;
      loadBalancerName: string;
      deploymentTargets: DeploymentTargets;
      appName: string;
    },
    configs: { networkConfig: NetworkConfig; accountsConfig: AccountsConfig; globalConfig: GlobalConfig },
    errors: string[],
  ) {
    // find listener cert in network cert
    const compareCertNames = configs.networkConfig.certificates!.find(
      obj => obj.name === listenerData.listener.certificate,
    );

    if (!compareCertNames) {
      errors.push(
        `Listener: ${listenerData.listener.name} has certificate: ${listenerData.listener.certificate} but no such certificate specified in network-config.yaml`,
      );
    } else {
      // check in the lookup cert where the deployment targets are and match that
      const listenerCert = configs.networkConfig.certificates!.find(
        obj => obj.name === listenerData.listener.certificate,
      );

      if (listenerCert?.deploymentTargets) {
        const listenerCertEnv = CommonValidatorFunctions.getEnvironmentsFromDeploymentTargets(
          configs.accountsConfig,
          listenerCert.deploymentTargets,
          configs.globalConfig,
        );
        const listenerInputEnv = CommonValidatorFunctions.getEnvironmentsFromDeploymentTargets(
          configs.accountsConfig,
          listenerData.deploymentTargets,
          configs.globalConfig,
        );
        const compareCertListener = CommonValidatorFunctions.compareDeploymentEnvironments(
          listenerInputEnv,
          listenerCertEnv,
        );

        if (!compareCertListener.match && compareCertListener.message === 'Source length exceeds target') {
          errors.push(
            `Listener ${listenerData.listener.name} under ${listenerData.loadBalancerType}: ${listenerData.loadBalancerName} in application ${listenerData.appName} with certificate: ${listenerData.listener.certificate} is being deployed across: ${listenerInputEnv} but certificate ${listenerCert.name} is only deployed to ${listenerCertEnv}`,
          );
        } else if (!compareCertListener.match && compareCertListener.message === 'Source not in target') {
          const missingCertEnv = listenerInputEnv.filter(certEnv => !listenerCertEnv.includes(certEnv));
          errors.push(
            `Listener ${listenerData.listener.name} under ${listenerData.loadBalancerType}: ${listenerData.loadBalancerName} in application ${listenerData.appName} is being deployed to ${listenerInputEnv}. Network config shows certificate: ${listenerCert.name} is deployed at ${listenerCertEnv}. Certificate is missing accounts-regions: ${missingCertEnv}`,
          );
        }
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
    values: ICustomizationsConfig,
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
  private validatePortfolioNameForUniqueness(values: ICustomizationsConfig, errors: string[]) {
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
    values: ICustomizationsConfig,
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
    values: ICustomizationsConfig,
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

  /**
   * Function to validate if subnet is available by local or shared target in deployment target.
   */
  private checkSubnetsTarget(
    subnets: string[],
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    deploymentTargets: DeploymentTargets,
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    let isValid = true;
    const subnetsInConfig: ISubnetConfig[] = subnets.map(
      (subnet: string) => vpcCheck.subnets!.find(item => item.name === subnet)!,
    );
    for (const subnet of subnetsInConfig) {
      const subnetTargets = new Set([
        ...CommonValidatorFunctions.getAccountNamesFromTargets(
          accountsConfig,
          (subnet.shareTargets ?? {}) as ShareTargets,
        ),
        ...('deploymentTargets' in vpcCheck
          ? CommonValidatorFunctions.getAccountNamesFromTargets(accountsConfig, vpcCheck.deploymentTargets)
          : [vpcCheck.account]),
      ]);
      const deploymentTargetAccounts = CommonValidatorFunctions.getAccountNamesFromTargets(
        accountsConfig,
        deploymentTargets,
      );

      for (const targetItem of deploymentTargetAccounts) {
        if (!subnetTargets.has(targetItem)) {
          isValid = false;
          errors.push(
            `Subnet ${subnet.name} defined in launchTemplate or autoScalingGroup is not created or shared in account ${targetItem}`,
          );
        }
      }
    }
    return isValid;
  }
}

export class CustomizationHelperMethods {
  private accountsConfig: AccountsConfig;
  private iamConfig: IamConfig;
  private globalConfig: GlobalConfig;

  constructor(accountsConfig: AccountsConfig, iamConfig: IamConfig, globalConfig: GlobalConfig) {
    this.accountsConfig = accountsConfig;
    this.iamConfig = iamConfig;
    this.globalConfig = globalConfig;
  }
  /**
   * Get regions of deploymentTargets
   */
  public getRegionsFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
    if (deploymentTargets.excludedRegions) {
      return this.globalConfig.enabledRegions.filter(obj => !deploymentTargets.excludedRegions.includes(obj));
    } else {
      return this.globalConfig.enabledRegions;
    }
  }
  /**
   * Validate if VPC name is in config file
   * @param string
   */
  public checkVpcInConfig(vpcName: string, values: INetworkConfig) {
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
    blockDeviceMappings: IBlockDeviceMappingItem[],
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

  public getIamUsersDeployedToAccount(accountName: string) {
    const usernameList = [];
    for (const userSetItem of this.iamConfig.userSets ?? []) {
      const deploymentAccountNames = this.getAccountNamesFromDeploymentTarget(userSetItem.deploymentTargets);
      if (deploymentAccountNames.includes(accountName)) {
        usernameList.push(...userSetItem.users.map(a => a.username));
      }
    }
    return usernameList;
  }

  public getIamGroupsDeployedToAccount(accountName: string) {
    const groupList = [];
    for (const groupSetItem of this.iamConfig.groupSets ?? []) {
      const deploymentAccountNames = this.getAccountNamesFromDeploymentTarget(groupSetItem.deploymentTargets);
      if (deploymentAccountNames.includes(accountName)) {
        groupList.push(...groupSetItem.groups.map(a => a.name));
      }
    }
    return groupList;
  }

  public getIamRolesDeployedToAccount(accountName: string) {
    const roleList = [];
    for (const roleSetItem of this.iamConfig.roleSets ?? []) {
      const deploymentAccountNames = this.getAccountNamesFromDeploymentTarget(roleSetItem.deploymentTargets);
      if (deploymentAccountNames.includes(accountName)) {
        roleList.push(...roleSetItem.roles.map(a => a.name));
      }
    }
    return roleList;
  }

  public getAccountNamesFromDeploymentTarget(deploymentTargets: DeploymentTargets): string[] {
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
        for (const account of [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts]) {
          addAccountName(account.name);
        }
      } else {
        for (const account of [...this.accountsConfig.mandatoryAccounts, ...this.accountsConfig.workloadAccounts]) {
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

export class FirewallValidator {
  constructor(
    values: CustomizationsConfig,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    accountsConfig: AccountsConfig,
    configDir: string,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    // Validate firewall instances
    this.validateFirewalls(values, networkConfig, securityConfig, accountsConfig, configDir, helpers, errors);
  }

  private validateFirewalls(
    values: CustomizationsConfig,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    accountsConfig: AccountsConfig,
    configDir: string,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    // Validate firewall instance configs
    this.validateFirewallInstances(values, helpers, configDir, networkConfig, securityConfig, accountsConfig, errors);
    // Validate firewall ASG configs
    this.validateFirewallAsgs(values, helpers, configDir, networkConfig, securityConfig, accountsConfig, errors);
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
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    const firewallInstances = [...(values.firewalls?.instances ?? []), ...(values.firewalls?.managerInstances ?? [])];
    for (const firewall of firewallInstances) {
      // Validate VPC
      const vpc = helpers.checkVpcInConfig(firewall.vpc, networkConfig);
      if (!vpc) {
        errors.push(`[Firewall instance ${firewall.name}]: VPC ${firewall.vpc} does not exist in network-config.yaml`);
      }
      if (vpc && isNetworkType('IVpcTemplatesConfig', vpc)) {
        errors.push(`[Firewall instance ${firewall.name}]: VPC templates are not supported`);
      }

      // Firewall instance launch templates must have network interface definitions
      if (!firewall.launchTemplate.networkInterfaces) {
        errors.push(
          `[Firewall instance ${firewall.name}]: launch template must include at least one network interface configuration`,
        );
      }

      if (firewall.configDir && firewall.configFile) {
        errors.push(
          `[Firewall instance ${firewall.name}]: Either configDir or configFile property should be provided but not both in configuration`,
        );
      }

      // Validate launch template
      if (isNetworkType<VpcConfig>('IVpcConfig', vpc) && firewall.launchTemplate.networkInterfaces) {
        this.validateLaunchTemplate(vpc, firewall, configDir, securityConfig, accountsConfig, helpers, errors);
        this.validateReplacementConfig(firewall, errors);
      }
    }
  }

  /**
   * Checks if the object structure is correct when static replacements are defined
   * @param firewall Ec2FirewallInstanceConfig | Ec2FirewallAutoScalingGroupConfig
   * @param errors string[]
   */
  private validateReplacementConfig(
    firewall: Ec2FirewallInstanceConfig | Ec2FirewallAutoScalingGroupConfig,
    errors: string[],
  ) {
    if (firewall.staticReplacements && !(firewall.configFile || firewall.configDir)) {
      errors.push(
        `[Firewall ${firewall.name}]: configFile or configDir property must be set when defining static firewall replacements configuration`,
      );
    }
  }

  private validateFirewallAsgs(
    values: CustomizationsConfig,
    helpers: CustomizationHelperMethods,
    configDir: string,
    networkConfig: NetworkConfig,
    securityConfig: SecurityConfig,
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    for (const group of values.firewalls?.autoscalingGroups ?? []) {
      // Validate VPC
      const vpc = helpers.checkVpcInConfig(group.vpc, networkConfig);
      if (!vpc) {
        errors.push(`[Firewall ASG ${group.name}]: VPC ${group.vpc} does not exist in network-config.yaml`);
      }
      if (vpc && isNetworkType<VpcTemplatesConfig>('IVpcTemplatesConfig', vpc)) {
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

      if (group.configDir && group.configFile) {
        errors.push(
          `[ASG ${group.name}]: Either configDir or configFile property should be provided but not both for ASG`,
        );
      }

      // Validate launch template
      if (isNetworkType<VpcConfig>('IVpcConfig', vpc)) {
        this.validateLaunchTemplate(vpc, group, configDir, securityConfig, accountsConfig, helpers, errors);
        this.validateReplacementConfig(group, errors);
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
      if (!['instance', 'ip'].includes(group.type)) {
        errors.push(`[Firewall target group ${group.name}]: target group must be of type 'instance' or 'ip'`);
        continue;
      }

      if (!group.targets?.length) {
        // If there are no targets we can skip the validation
        continue;
      }

      if (group.type === 'instance') {
        const instancesExist = this.checkInstanceTargetsInConfig(
          helpers,
          group.targets,
          values.firewalls?.instances ?? [],
        );
        if (!instancesExist) {
          errors.push(
            `[Firewall target group ${group.name}]: target group references firewall instance that does not exist`,
          );
        } else {
          this.validateInstanceVpcs(group, values.firewalls!.instances!, errors);
        }
      } else if (group.type === 'ip') {
        // Validate Ip Address
        this.validateIpTargetsInConfig(group.targets, errors);
      }
    }
  }

  private checkInstanceTargetsInConfig(
    helpers: CustomizationHelperMethods,
    targets: (string | NlbTargetTypeConfig)[],
    config: IEc2FirewallInstanceConfig[],
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

  private validateIpTargetsInConfig(targets: (string | NlbTargetTypeConfig)[], errors: string[]): void {
    const results = targets.map(target => ({
      target,
      isIpV4: isIpV4(target),
      isIpV6: isIpV6(target),
    }));

    const invalidTargets = results.filter(r => !r.isIpV4 && !r.isIpV6).map(r => r.target);

    if (invalidTargets.length) {
      errors.push(...invalidTargets.map(target => `'${target}' is not a valid ip address.`));
    } else {
      const ipV4List = results.filter(result => result.isIpV4);
      const ipV6List = results.filter(result => result.isIpV6);

      if (!!ipV4List.length && !!ipV6List.length) {
        errors.push(`Cannot mix IPv4 and IPv6 targets.`);
      }
    }
  }

  private validateInstanceVpcs(group: ITargetGroupItem, config: IEc2FirewallInstanceConfig[], errors: string[]) {
    // Retrieve instance configs
    const instances: IEc2FirewallInstanceConfig[] = [];
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
    firewall: IEc2FirewallInstanceConfig | IEc2FirewallAutoScalingGroupConfig,
    configDir: string,
    securityConfig: SecurityConfig,
    accountsConfig: AccountsConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    // Validate security groups
    this.validateLaunchTemplateSecurityGroups(vpc, firewall, helpers, errors);
    // Validate subnets
    this.validateLaunchTemplateSubnets(vpc, firewall, helpers, accountsConfig, errors);
    // Validate IAM instance profile
    this.validateIamInstanceProfile(vpc, firewall, helpers, errors);
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
    firewall: IEc2FirewallInstanceConfig | IEc2FirewallAutoScalingGroupConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    const interfaces = firewall.launchTemplate.networkInterfaces;
    const firewallLaunchTemplateSecurityGroups = firewall.launchTemplate.securityGroups ?? [];
    if (firewallLaunchTemplateSecurityGroups.length === 0) {
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
    if (!helpers.checkSecurityGroupInConfig(firewallLaunchTemplateSecurityGroups, vpc)) {
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
  private includesInterfaceGroups(interfaces: INetworkInterfaceItem[]): boolean {
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
    firewall: IEc2FirewallInstanceConfig | IEc2FirewallAutoScalingGroupConfig,
    helpers: CustomizationHelperMethods,
    accountsConfig: AccountsConfig,
    errors: string[],
  ) {
    if (isCustomizationsType<Ec2FirewallAutoScalingGroupConfig>('IEc2FirewallAutoScalingGroupConfig', firewall)) {
      this.validateAsgLaunchTemplateSubnets(vpc, firewall, helpers, errors);
    } else {
      this.validateInstanceLaunchTemplateSubnets(vpc, firewall, helpers, accountsConfig, errors);
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
    firewall: IEc2FirewallInstanceConfig,
    helpers: CustomizationHelperMethods,
    accountsConfig: AccountsConfig,
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
    // Subnet configs
    const subnets: ISubnetConfig[] = [];
    const subnetsExist = helpers.checkSubnetsInConfig(interfaceSubnets, vpc);
    if (!subnetsExist) {
      errors.push(
        `[Firewall instance ${firewall.name}]: launch template network interface references subnet that does not exist in VPC ${vpc.name}`,
      );
    }
    // Validate subnet AZs
    if (subnetsExist) {
      // Retrieve subnet configs
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
    const isFirewallLocal = !firewall.account || vpc.account === firewall.account;
    if (isFirewallLocal) {
      // No more validations to perform
      return;
    }
    const invalidInterfaceSubnets: string[] = [];
    subnets.map(
      subnet =>
        !CommonValidatorFunctions.getAccountNamesFromTargets(
          accountsConfig,
          (subnet.shareTargets ?? {}) as ShareTargets,
        ).includes(firewall.account!) && invalidInterfaceSubnets.push(subnet.name),
    );
    invalidInterfaceSubnets.forEach(subnetName =>
      errors.push(
        `[Firewall instance ${firewall.name}]: launch template network interface references Subnet ${subnetName} does not share to Account ${firewall.account}`,
      ),
    );
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
    firewall: IEc2FirewallAutoScalingGroupConfig,
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

  private includesSubnet(interfaces: INetworkInterfaceItem[]) {
    for (const interfaceItem of interfaces) {
      if (!interfaceItem.subnetId) {
        return false;
      }
    }
    return true;
  }

  /**
   * Validate firewall IAM instance profile
   * @param vpc
   * @param firewall
   * @param helpers
   * @param errors
   */
  private validateIamInstanceProfile(
    vpc: VpcConfig,
    firewall: IEc2FirewallInstanceConfig | IEc2FirewallAutoScalingGroupConfig,
    helpers: CustomizationHelperMethods,
    errors: string[],
  ) {
    //
    // Validate IAM instance profile exists if configFile, configDir or licenseFile are defined
    if (
      (firewall.configFile || firewall.licenseFile || firewall.configDir) &&
      !firewall.launchTemplate.iamInstanceProfile
    ) {
      errors.push(
        `[Firewall ${firewall.name}]: IAM instance profile must be defined in the launch template when either configFile, licenseFile or configDir properties are defined`,
      );
    }
    //
    // Validate IAM instance profile is deployed to the account
    if (firewall.launchTemplate.iamInstanceProfile) {
      const accountIamRoles = helpers.getIamRolesDeployedToAccount(vpc.account);
      if (!accountIamRoles.includes(firewall.launchTemplate.iamInstanceProfile)) {
        errors.push(
          `[Firewall ${firewall.name}]: IAM instance profile is not deployed to the firewall VPC target account. Target VPC account: ${vpc.account}`,
        );
      }
    }
  }

  private validateAsgTargetGroups(
    values: CustomizationsConfig,
    group: IEc2FirewallAutoScalingGroupConfig,
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

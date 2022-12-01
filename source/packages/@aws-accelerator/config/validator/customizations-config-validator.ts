import * as fs from 'fs';
import * as path from 'path';

import { AccountsConfig } from '../lib/accounts-config';
import * as t from '../lib/common-types';
import {
  AppConfigItem,
  CustomizationsConfig,
  CustomizationsConfigTypes,
  TargetEnvironmentConfig,
} from '../lib/customizations-config';
import { OrganizationConfig } from '../lib/organization-config';
import { NetworkConfig, NetworkConfigTypes, VpcConfig, VpcTemplatesConfig } from '../lib/network-config';
import console from 'console';
import { SecurityConfig, SecurityConfigTypes } from '../lib/security-config';

/**
 * Customizations Configuration validator.
 * Validates customization configuration
 */
export class CustomizationsConfigValidator {
  constructor(configDir: string) {
    const values = CustomizationsConfig.load(configDir);
    const ouIdNames: string[] = ['Root'];
    const accountNames: string[] = [];

    const errors: string[] = [];

    console.log(`[customizations-config-validator.ts]: ${CustomizationsConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    this.getOuIdNames(configDir, ouIdNames);

    //
    // Get list of Account names from account config file
    this.getAccountNames(configDir, accountNames);

    //
    // Start Validation
    // Validate customizations
    new CustomizationValidator(values, ouIdNames, configDir, accountNames, errors);

    if (errors.length) {
      throw new Error(`${CustomizationsConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
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
}

/**
 * Class to validate customizations
 */
class CustomizationValidator {
  constructor(
    values: CustomizationsConfig,
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
    this.validateStackName(values, errors);

    // Validate presence of template file
    this.validateTemplateFile(configDir, values, errors);

    // Validate applications inputs
    this.validateApplicationsInputs(configDir, values, errors);
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
  }

  /**
   * Function to validate stack and stackset names
   * @param configDir
   * @param values
   */
  private validateStackName(values: t.TypeOf<typeof CustomizationsConfigTypes.customizationsConfig>, errors: string[]) {
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
    errors: string[],
  ) {
    const loadNetworkConfig = NetworkConfig.load(configDir);
    const loadSecurityConfig = SecurityConfig.load(configDir);
    const appNames: string[] = [];
    for (const app of values.applications ?? []) {
      appNames.push(app.name);

      //check if appName with prefixes is over 128 characters
      this.checkAppName(app, errors);
      // check if vpc actually exists
      const vpcCheck = this.checkVpcInConfig(app.vpc, loadNetworkConfig);
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
        this.checkAlb(app, vpcCheck, errors);
        this.checkNlb(app, vpcCheck, errors);
        this.checkLaunchTemplate(app, vpcCheck, loadSecurityConfig, errors);
        this.checkAutoScaling(app, vpcCheck, errors);
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
  private checkAppName(app: AppConfigItem, errors: string[]) {
    for (const targetRegion of app.targetEnvironments) {
      this.checkAppNameLength(app.name, targetRegion, errors);
    }
  }
  private checkAppNameLength(appName: string, targetRegion: TargetEnvironmentConfig, errors: string[]) {
    for (const regionItem of targetRegion.region) {
      const stackName = `AWSAccelerator-App-${appName}-0123456789012-${regionItem}`;
      if (stackName.length > 128) {
        errors.push(`[Application ${appName}]: Application name ${stackName} is over 128 characters.`);
      }
    }
  }
  private checkLaunchTemplate(
    app: AppConfigItem,
    vpcCheck: VpcConfig | VpcTemplatesConfig,
    loadSecurityConfig: t.TypeOf<typeof SecurityConfigTypes.securityConfig>,
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
      const ltSgCheck = this.checkSecurityGroupInConfig(app.launchTemplate!.securityGroups, vpcCheck);
      if (ltSgCheck === false) {
        errors.push(
          `Launch Template ${
            app.launchTemplate!.name
          } does not have security groups ${app.launchTemplate!.securityGroups.join(',')} in VPC ${app.vpc}.`,
        );
      }
      if (app.launchTemplate.blockDeviceMappings) {
        for (const blockDeviceMapping of app.launchTemplate.blockDeviceMappings) {
          if (
            blockDeviceMapping.ebs &&
            blockDeviceMapping.ebs.encrypted &&
            blockDeviceMapping.ebs.kmsKeyId === undefined
          ) {
            if (loadSecurityConfig.centralSecurityServices.ebsDefaultVolumeEncryption.enable === false) {
              errors.push(
                `EBS volume ${blockDeviceMapping.deviceName} in launch template ${app.launchTemplate.name} is encrypted and no kmsKey is specified. Central Security ebs is disabled so no KMS key can be used.`,
              );
            }
          }
          if (blockDeviceMapping.ebs && blockDeviceMapping.ebs.encrypted && blockDeviceMapping.ebs.kmsKeyId) {
            const allKeys = loadSecurityConfig.keyManagementService?.keySets.map(obj => obj.name);
            const filterKey = allKeys?.find(obj => {
              return obj === blockDeviceMapping.ebs!.kmsKeyId;
            });
            if (!filterKey) {
              errors.push(
                `EBS volume ${blockDeviceMapping.deviceName} in launch template ${
                  app.launchTemplate.name
                } is encrypted and kmsKey ${
                  blockDeviceMapping.ebs.kmsKeyId
                } specified does not exist. All keys: ${allKeys?.join(',')}.`,
              );
            }
          }
        }
      }
    }
  }

  private checkAutoScaling(app: AppConfigItem, vpcCheck: VpcConfig | VpcTemplatesConfig, errors: string[]) {
    if (app.autoscaling) {
      const allTargetGroupNames = app.targetGroups!.map(tg => tg.name);
      const asgTargetGroupNames = app.autoscaling.targetGroups ?? [];
      const compareTargetGroupNames = this.compareArrays(asgTargetGroupNames, allTargetGroupNames ?? []);
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
      const asgSubnetsCheck = this.checkSubnetsInConfig(app.autoscaling!.subnets, vpcCheck);
      if (asgSubnetsCheck === false) {
        errors.push(
          `Autoscaling group ${app.autoscaling!.name} does not have subnets ${app.autoscaling!.subnets.join(
            ',',
          )} in VPC ${app.vpc}`,
        );
      }
    }
  }

  private checkNlb(app: AppConfigItem, vpcCheck: VpcConfig | VpcTemplatesConfig, errors: string[]) {
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
      const nlbSubnetsCheck = this.checkSubnetsInConfig(app.networkLoadBalancer!.subnets, vpcCheck);
      if (nlbSubnetsCheck === false) {
        errors.push(
          `Network Load Balancer ${
            app.networkLoadBalancer!.name
          } does not have subnets ${app.networkLoadBalancer!.subnets.join(',')} in VPC ${app.vpc}`,
        );
      }
      const allTargetGroupNames = app.targetGroups!.map(tg => tg.name);
      const nlbTargetGroupNames = app.networkLoadBalancer!.listeners!.map(tg => tg.targetGroup);
      const compareTargetGroupNames = this.compareArrays(nlbTargetGroupNames ?? [], allTargetGroupNames ?? []);
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
  private checkAlb(app: AppConfigItem, vpcCheck: VpcConfig | VpcTemplatesConfig, errors: string[]) {
    if (app.applicationLoadBalancer) {
      if (app.applicationLoadBalancer!.securityGroups.length === 0) {
        errors.push(
          `Application Load Balancer ${app.applicationLoadBalancer!.name} does not have security groups in ${
            app.name
          }. At least one security group is required`,
        );
      }
      const albSgCheck = this.checkSecurityGroupInConfig(app.applicationLoadBalancer!.securityGroups, vpcCheck);
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
      const albSubnetsCheck = this.checkSubnetsInConfig(app.applicationLoadBalancer!.subnets, vpcCheck);
      if (albSubnetsCheck === false) {
        errors.push(
          `Application Load Balancer ${
            app.applicationLoadBalancer!.name
          } does not have subnets ${app.applicationLoadBalancer!.subnets.join(',')} in VPC ${app.vpc}`,
        );
      }

      const allTargetGroupNames = app.targetGroups!.map(tg => tg.name);
      const albTargetGroupNames = app.applicationLoadBalancer!.listeners!.map(tg => tg.targetGroup);
      const compareTargetGroupNames = this.compareArrays(albTargetGroupNames ?? [], allTargetGroupNames ?? []);
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
   * Validate if VPC name is in config file
   * @param string
   */
  private checkVpcInConfig(vpcName: string, values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>) {
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
  private checkSecurityGroupInConfig(securityGroupNames: string[], vpcItem: VpcConfig | VpcTemplatesConfig) {
    // vpc name exists in network config.
    // Check within vpc to see if security group exists

    // Get all security group names
    const vpcSgs = vpcItem?.securityGroups!.map(obj => {
      return obj.name;
    });

    // compare input to securitygroups in vpcs
    if (this.compareArrays(securityGroupNames, vpcSgs ?? []).length === 0) {
      return true;
    } else {
      return false;
    }
  }
  private compareArrays(array1: string[], array2: string[]) {
    return array1.filter(element => {
      return !array2.includes(element);
    });
  }
  private checkSubnetsInConfig(subnets: string[], vpcItem: VpcConfig | VpcTemplatesConfig) {
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
}

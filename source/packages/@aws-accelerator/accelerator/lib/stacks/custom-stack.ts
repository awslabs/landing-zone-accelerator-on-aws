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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';

import {
  AccountsConfig,
  CloudFormationStackConfig,
  CustomizationsConfig,
  DeploymentTargets,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  Region,
  SecurityConfig,
  CfnParameter,
} from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils';

import { version } from '../../../../../package.json';

const logger = createLogger(['custom-stack']);

export interface CustomStackProps extends cdk.StackProps {
  readonly configDirPath: string;
  readonly accountsConfig: AccountsConfig;
  readonly globalConfig: GlobalConfig;
  readonly iamConfig: IamConfig;
  readonly networkConfig: NetworkConfig;
  readonly organizationConfig: OrganizationConfig;
  readonly securityConfig: SecurityConfig;
  readonly customizationsConfig: CustomizationsConfig;
  readonly partition: string;
  readonly qualifier?: string;
  readonly configCommitId?: string;
  readonly globalRegion?: string;
  readonly centralizedLoggingRegion: string;
  readonly runOrder: number;
  readonly stackName: string;
  readonly templateFile: string;
  readonly terminationProtection: boolean;
  readonly parameters?: CfnParameter[];
  readonly ssmParamNamePrefix: string;
}
export class CustomStack extends cdk.Stack {
  protected props: CustomStackProps;
  public runOrder: number;
  constructor(scope: Construct, id: string, props: CustomStackProps) {
    super(scope, id, props);
    this.props = props;
    this.runOrder = props.runOrder;

    new cdk.cloudformation_include.CfnInclude(this, props.stackName, {
      templateFile: path.join(props.configDirPath, props.templateFile),
      parameters: transformCfnParametersArrayToObject(props.parameters),
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `${props.ssmParamNamePrefix}/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    new cdk.aws_ssm.StringParameter(this, 'SsmParamAcceleratorVersion', {
      parameterName: `${props.ssmParamNamePrefix}/${cdk.Stack.of(this).stackName}/version`,
      stringValue: version,
    });
  }
}

export function isIncluded(
  deploymentTargets: DeploymentTargets,
  region: string,
  accountId: string,
  accountsConfig: AccountsConfig,
  organizationConfig: OrganizationConfig,
): boolean {
  // Explicit Denies
  if (
    isRegionExcluded(deploymentTargets.excludedRegions, region) ||
    isAccountExcluded(deploymentTargets.excludedAccounts, accountId, accountsConfig)
  ) {
    return false;
  }

  // Explicit Allows
  if (
    isAccountIncluded(deploymentTargets.accounts, accountId, accountsConfig, organizationConfig) ||
    isOrganizationalUnitIncluded(deploymentTargets.organizationalUnits, accountId, accountsConfig, organizationConfig)
  ) {
    return true;
  }

  // Implicit Deny
  return false;
}

export function isRegionExcluded(regions: string[], currentRegion: string): boolean {
  if (regions?.includes(currentRegion)) {
    logger.info(`[custom-stack] ${currentRegion} region explicitly excluded`);
    return true;
  }
  return false;
}

export function isAccountExcluded(accounts: string[], currentAccount: string, accountsConfig: AccountsConfig): boolean {
  for (const account of accounts ?? []) {
    if (currentAccount === accountsConfig.getAccountId(account)) {
      logger.info(`[custom-stack] ${account} account explicitly excluded`);
      return true;
    }
  }
  return false;
}

export function isAccountIncluded(
  accounts: string[],
  currentAccount: string,
  accountsConfig: AccountsConfig,
  organizationConfig: OrganizationConfig,
): boolean {
  for (const account of accounts ?? []) {
    if (currentAccount === accountsConfig.getAccountId(account)) {
      const accountConfig = accountsConfig.getAccount(account);
      if (organizationConfig.isIgnored(accountConfig.organizationalUnit)) {
        logger.info(
          `[custom-stack] Account ${account} was not included as it is a member of an ignored organizational unit.`,
        );
        return false;
      }
      logger.info(`[custom-stack] ${account} account explicitly included`);
      return true;
    }
  }
  return false;
}

export function isOrganizationalUnitIncluded(
  organizationalUnits: string[],
  currentAccount: string,
  accountsConfig: AccountsConfig,
  organizationConfig: OrganizationConfig,
): boolean {
  if (organizationalUnits) {
    // Full list of all accounts
    const accounts = [...accountsConfig.mandatoryAccounts, ...accountsConfig.workloadAccounts];

    // Find the account with the matching ID
    const account = accounts.find(item => accountsConfig.getAccountId(item.name) === currentAccount);

    if (account) {
      if (organizationalUnits.indexOf(account.organizationalUnit) != -1 || organizationalUnits.includes('Root')) {
        const ignored = organizationConfig.isIgnored(account.organizationalUnit);
        if (ignored) {
          logger.info(`[custom-stack] ${account.organizationalUnit} is ignored and not included`);
        }
        logger.info(`[custom-stack] ${account.organizationalUnit} organizational unit included`);
        return true;
      }
    }
  }

  return false;
}

export function mapRegionToString(regionList: Region[]): string[] {
  return regionList.map(item => {
    return item.toString();
  });
}

export type customStackMapping = {
  account: string;
  dependsOn: string[];
  region: string;
  runOrder: number;
  stackConfig: CloudFormationStackConfig;
  stackObj?: cdk.Stack;
};

//
// Identify which custom stacks should be deployed based on current account and region
//
export function generateCustomStackMappings(
  accountsConfig: AccountsConfig,
  organizationConfig: OrganizationConfig,
  customizationsConfig: CustomizationsConfig,
  accountId: string,
  region: string,
): customStackMapping[] {
  const customStackList = customizationsConfig.customizations.cloudFormationStacks;
  const mappingList = [];

  for (const stack of customStackList ?? []) {
    const deploymentRegions = mapRegionToString(stack.regions);

    if (
      isIncluded(stack.deploymentTargets ?? [], region, accountId, accountsConfig, organizationConfig) &&
      deploymentRegions.includes(region)
    ) {
      logger.debug(`New stack ${stack.name} mapped to account ${accountId} in region ${region}`);

      mappingList.push({
        account: accountId,
        dependsOn: [],
        region: region,
        runOrder: stack.runOrder,
        stackConfig: stack,
      });
    }
  }
  return getStackDependencies(mappingList);
}

//
// Sort stack mappings by runOrder property
//
export function sortStackMappings(stackMappingList: customStackMapping[]) {
  if (stackMappingList.length == 0) {
    return [];
  }
  stackMappingList.sort((a: customStackMapping, b: customStackMapping) => a.runOrder - b.runOrder);
  return stackMappingList;
}

//
// Determine if each stack should depend on other stacks based on runOrder
// This function supports discontinuous, non-unique arrays of runOrder values (ex. [1, 3, 3, 4])
//
export function getStackDependencies(stackMappings: customStackMapping[]): customStackMapping[] {
  // sort all mappings by runOrder
  const sortedMappings = sortStackMappings(stackMappings);
  // extract all runOrder values, including duplicates
  const runOrderList = sortedMappings.map(a => a.runOrder);
  // extract unique runOrder values
  const runOrderValues = [...new Set(runOrderList)];

  // if there is more than one stack, set dependencies
  if (runOrderValues.length > 1) {
    for (const mapping of sortedMappings) {
      // Get the index of the runOrder of the current stack
      const currentRunOrderIndex = runOrderValues.indexOf(mapping.runOrder);
      // If the stack has the lowest runOrder value, it will not depend on any other stacks
      if (currentRunOrderIndex !== 0) {
        // Get the index of the unique runOrder value immediately before the current stack
        const dependencyIndex = currentRunOrderIndex - 1;
        // Get the corresponding runOrder value
        const dependencyValue = runOrderValues[dependencyIndex];
        // Find all stacks with a matching runOrder value and add them as dependencies.
        const stackDependencies = sortedMappings.filter(e => e.runOrder == dependencyValue) ?? [];
        for (const stack of stackDependencies) {
          mapping.dependsOn.push(stack.stackConfig.name);
        }
      }
    }
  }
  return sortedMappings;
}

function transformCfnParametersArrayToObject(
  parameters?: CfnParameter[],
): { [parameterName: string]: string } | undefined {
  if (parameters) {
    const parameterObject: { [key: string]: string } = {};
    for (const parameter of parameters) {
      parameterObject[parameter.name] = parameter.value;
    }
    return parameterObject;
  }
  return undefined;
}

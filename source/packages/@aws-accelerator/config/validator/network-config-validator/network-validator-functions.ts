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
import { IPv4, IPv4CidrRange } from 'ip-num';
import { AccountConfig, GovCloudAccountConfig } from '../../lib/accounts-config';
import {
  NetworkConfig,
  VpcConfig,
  VpcTemplatesConfig,
  NetworkConfigTypes,
  SubnetConfig,
} from '../../lib/network-config';
import * as t from '../../lib/common-types';

/**
 * Class for helper functions
 */
export class NetworkValidatorFunctions {
  private ouIdNames: string[];
  private accountNames: string[];
  private accounts: (AccountConfig | GovCloudAccountConfig)[];
  private snsTopicNames: string[];
  private values: NetworkConfig;
  private enabledRegions: t.Region[];

  constructor(
    values: NetworkConfig,
    ouIdNames: string[],
    accounts: (AccountConfig | GovCloudAccountConfig)[],
    snsTopicNames: string[],
    enabledRegions: t.Region[],
  ) {
    this.ouIdNames = ouIdNames;
    this.accounts = accounts;
    this.snsTopicNames = snsTopicNames;
    this.accountNames = accounts.map(account => {
      return account.name;
    });
    this.enabledRegions = enabledRegions;
    this.values = values;
  }
  /**
   * Get deployment regions for a deployment target object
   * @param targets
   * @returns
   */
  public getRegionsFromDeploymentTarget(targets: t.DeploymentTargets): t.Region[] {
    const enabledRegions: t.Region[] = this.enabledRegions;

    return enabledRegions.filter(region => !targets.excludedRegions?.includes(region));
  }

  /**
   * Get account names for a share target or deployment target object
   * @param targets
   * @returns
   */
  public getAccountNamesFromTarget(targets: t.DeploymentTargets | t.ShareTargets): string[] {
    const accountNames: string[] = [];
    // Add accounts based on OU targets
    for (const ou of targets.organizationalUnits ?? []) {
      if (ou === 'Root') {
        this.accounts.forEach(rootOuItem => accountNames.push(rootOuItem.name));
      } else {
        this.accounts.forEach(account => {
          if (ou === account.organizationalUnit) {
            accountNames.push(account.name);
          }
        });
      }
    }
    // Add accounts based on explicit accounts names
    targets.accounts?.forEach(item => accountNames.push(item));

    return [...new Set(accountNames)];
  }

  /**
   * Get excluded account names for a deployment target object
   * @param deploymentTargets
   * @returns
   */
  private getExcludedAccountNames(deploymentTargets: t.DeploymentTargets): string[] {
    const accountIds: string[] = [];

    if (deploymentTargets.excludedAccounts) {
      deploymentTargets.excludedAccounts.forEach(account => accountIds.push(account));
    }

    return accountIds;
  }

  /**
   * Returns the deployment target account names
   * for a VPC or VPC template
   * @param vpcItem
   * @returns
   */
  public getVpcAccountNames(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
    let vpcAccountNames: string[];

    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      vpcAccountNames = [vpcItem.account];
    } else {
      const excludedAccountNames = this.getExcludedAccountNames(vpcItem.deploymentTargets);
      vpcAccountNames = this.getAccountNamesFromTarget(vpcItem.deploymentTargets).filter(
        item => !excludedAccountNames.includes(item),
      );
    }

    return vpcAccountNames;
  }

  /**
   * Returns target accounts for resources shared from the delegated admin account
   * @param targets
   * @returns
   */
  public getDelegatedAdminShareTargets(targets?: t.ShareTargets): string[] {
    return targets
      ? [...this.getAccountNamesFromTarget(targets), this.values.centralNetworkServices!.delegatedAdminAccount]
      : [this.values.centralNetworkServices!.delegatedAdminAccount];
  }

  /**
   * Given two arrays of account names, returns items in arr1 not included in arr2
   * @param arr1
   * @param arr2
   * @returns
   */
  public compareTargetAccounts(arr1: string[], arr2: string[]): string[] {
    return arr1.filter(item => !arr2.includes(item));
  }

  /**
   * Returns true if an array contains duplicate values
   * @param arr
   * @returns
   */
  public hasDuplicates(arr: string[]): boolean {
    return new Set(arr).size !== arr.length;
  }

  /**
   * Returns true if a given account name exists in accounts-config.yaml
   * @param account
   * @returns
   */
  public accountExists(account: string) {
    return this.accountNames.includes(account);
  }

  /**
   * Returns true if a given OU name exists in organization-config.yaml
   * @param ou
   * @returns
   */
  public ouExists(ou: string) {
    return this.ouIdNames.includes(ou);
  }

  /**
   * Returns true if a given SNS topic name exists in global-config.yaml or security-config.yaml
   * @param topic
   * @returns
   */
  public snsTopicExists(topic: string) {
    return this.snsTopicNames.includes(topic);
  }

  /**
   * Given a name, returns a VPC or VPC template config
   * @param values
   * @param vpcName
   * @returns
   */
  public getVpc(vpcName: string): VpcConfig | VpcTemplatesConfig | undefined {
    const vpcs = [...this.values.vpcs, ...(this.values.vpcTemplates ?? [])];
    return vpcs.find(item => item.name === vpcName);
  }

  /**
   * Given a VPC and subnet name, returns a subnet
   * @param vpc
   * @param subnetName
   * @returns
   */
  public getSubnet(vpc: VpcConfig | VpcTemplatesConfig, subnetName: string): SubnetConfig | undefined {
    return vpc.subnets?.find(item => item.name === subnetName);
  }

  /**
   * Returns true if the given CIDR is valid
   * @param cidr
   * @returns
   */
  public isValidIpv4Cidr(cidr: string): boolean {
    try {
      IPv4CidrRange.fromCidr(cidr);
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * Returns true if valid IPv4 address
   * @param ip
   * @returns
   */
  public isValidIpv4(ip: string): boolean {
    try {
      IPv4.fromString(ip);
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * Returns an array of object property keys that have a defined value
   * @param obj
   * @returns
   */
  public getObjectKeys(obj: object): string[] {
    const keys: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (val !== undefined) {
        keys.push(key);
      }
    }
    return keys;
  }

  /**
   * Returns true if a given value matches a regular expression
   * @param value
   * @param expression
   * @returns
   */
  public matchesRegex(value: string, expression: string): boolean {
    const regex = new RegExp(expression);
    return regex.test(value);
  }
}

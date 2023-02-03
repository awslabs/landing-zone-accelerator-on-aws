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
import { IPv4, IPv4CidrRange } from 'ip-num';
import * as path from 'path';

import { createLogger } from '@aws-accelerator/utils';

import { AccountConfig, AccountsConfig, GovCloudAccountConfig } from '../lib/accounts-config';
import * as t from '../lib/common-types';
import { CustomizationsConfig, CustomizationsConfigTypes } from '../lib/customizations-config';
import { GlobalConfig } from '../lib/global-config';
import {
  CustomerGatewayConfig,
  DhcpOptsConfig,
  DnsFirewallRuleGroupConfig,
  DnsFirewallRulesConfig,
  DnsQueryLogsConfig,
  GwlbConfig,
  IpamConfig,
  IpamPoolConfig,
  NetworkConfig,
  NetworkConfigTypes,
  NfwFirewallConfig,
  NfwFirewallPolicyConfig,
  NfwRuleGroupConfig,
  NfwRuleSourceCustomActionConfig,
  NfwRuleSourceStatefulRuleConfig,
  NfwRuleSourceStatefulRuleOptionsConfig,
  NfwRuleSourceStatelessMatchAttributesConfig,
  NfwRuleSourceStatelessRuleDefinitionConfig,
  NfwRuleVariableDefinitionConfig,
  NfwStatelessRulesAndCustomActionsConfig,
  ResolverEndpointConfig,
  ResolverRuleConfig,
  SubnetConfig,
  TransitGatewayRouteTableDxGatewayEntryConfig,
  TransitGatewayRouteTableVpcEntryConfig,
  TransitGatewayRouteTableVpnEntryConfig,
  VpcConfig,
  VpcTemplatesConfig,
  VpnConnectionConfig,
} from '../lib/network-config';
import { OrganizationConfig } from '../lib/organization-config';
import { SecurityConfig } from '../lib/security-config';

/**
 * Network Configuration validator.
 * Validates network configuration
 */
export class NetworkConfigValidator {
  constructor(configDir: string) {
    const values = NetworkConfig.load(configDir);
    const ouIdNames: string[] = ['Root'];
    const accounts: (AccountConfig | GovCloudAccountConfig)[] = [];
    const snsTopicNames: string[] = [];

    const errors: string[] = [];
    const logger = createLogger(['network-config-validator']);

    logger.info(`${NetworkConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    this.getOuIdNames(configDir, ouIdNames);

    //
    // Get list of Account names from account config file
    this.getAccounts(configDir, accounts);

    //
    // Get the list of sns topic names from global and security config files
    this.getSnsTopicNames(configDir, snsTopicNames);

    //
    // Instantiate helper method class
    const helpers = new NetworkValidatorFunctions(ouIdNames, accounts, snsTopicNames);

    //
    // Start Validation
    new CentralNetworkValidator(values, configDir, helpers, errors);
    new TransitGatewayValidator(values, helpers, errors);
    new DhcpOptionsValidator(values, helpers, errors);
    new EndpointPoliciesValidator(values, configDir, helpers, errors);
    new PrefixListValidator(values, helpers, errors);
    new VpcValidator(values, helpers, errors);
    new CustomerGatewaysValidator(values, helpers, errors);
    new DirectConnectGatewaysValidator(values, errors);
    new FirewallManagerValidator(values, helpers, errors);
    new CertificatesValidator(values, errors);

    if (errors.length) {
      throw new Error(`${NetworkConfig.FILENAME} has ${errors.length} issues: ${errors.join(' ')}`);
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
  private getAccounts(configDir: string, accounts: (AccountConfig | GovCloudAccountConfig)[]) {
    for (const accountItem of [
      ...AccountsConfig.load(configDir).mandatoryAccounts,
      ...AccountsConfig.load(configDir).workloadAccounts,
    ]) {
      accounts.push(accountItem);
    }
  }
  /**
   * Prepare list of SNS Topic names from global and security config files
   * @param configDir
   */
  private getSnsTopicNames(configDir: string, snsTopicNames: string[]) {
    const securityConfig = SecurityConfig.load(configDir);
    const globalConfig = GlobalConfig.load(configDir);
    const securtiySnsSubscriptions =
      securityConfig.centralSecurityServices.snsSubscriptions?.map(snsSubscription => snsSubscription.level) ?? [];
    const globalSnsSubscriptions = globalConfig.snsTopics?.topics.map(topic => topic.name) ?? [];
    snsTopicNames.push(...securtiySnsSubscriptions);
    snsTopicNames.push(...globalSnsSubscriptions);
  }
}

/**
 * Class for helper functions
 */
class NetworkValidatorFunctions {
  private ouIdNames: string[];
  private accountNames: string[];
  private accounts: (AccountConfig | GovCloudAccountConfig)[];
  private snsTopicNames: string[];

  constructor(ouIdNames: string[], accounts: (AccountConfig | GovCloudAccountConfig)[], snsTopicNames: string[]) {
    this.ouIdNames = ouIdNames;
    this.accounts = accounts;
    this.snsTopicNames = snsTopicNames;
    this.accountNames = accounts.map(account => {
      return account.name;
    });
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
   * Returns true if an array contains deplicate values
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
  public getVpc(values: NetworkConfig, vpcName: string): VpcConfig | VpcTemplatesConfig | undefined {
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
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
  public getObjectKeys(obj: Object): string[] {
    const keys: string[] = [];
    for (const [key, val] of Object.entries(obj)) {
      if (val) {
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

/**
 * Class to validate central network services
 */
class CentralNetworkValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    // Validate delegated admin account name
    this.validateDelegatedAdmin(values, helpers, errors);

    // Validate central network services
    new GatewayLoadBalancersValidator(values, configDir, helpers, errors);
    new IpamValidator(values, helpers, errors);
    new NetworkFirewallValidator(values, configDir, helpers, errors);
    new Route53ResolverValidator(values, configDir, helpers, errors);
  }

  /**
   * Validate delegated admin account exists
   * @param values
   * @param helpers
   * @param errors
   */
  private validateDelegatedAdmin(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    if (values.centralNetworkServices) {
      const delegatedAdmin = values.centralNetworkServices.delegatedAdminAccount;
      if (!helpers.accountExists(delegatedAdmin)) {
        errors.push(
          `Central network services delegated admin account ${delegatedAdmin} does not exist in accounts-config.yaml`,
        );
      }
    }
  }
}

/**
 * Class to validate transit gateway
 */
class TransitGatewayValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate transit gateways and route table used in peering configuration
    //
    this.validateTgwPeeringTransitGatewaysAndRouteTables(values, errors);

    //
    // Validate peering name used in route table
    //
    this.validateTgwPeeringName(values, errors);

    //
    // Validate TGW deployment target OUs
    //
    this.validateTgwShareTargetOUs(values, helpers, errors);

    //
    // Validate TGW deployment target account names
    //
    this.validateTgwShareTargetAccounts(values, helpers, errors);

    //
    // Validate Tgw account name
    //
    this.validateTgwAccountName(values, helpers, errors);
    //
    // Validate TGW configurations
    //
    this.validateTgwConfiguration(values, errors);
  }

  /**
   * Function to validate TGW route table transitGatewayPeeringName property value
   * Value for transitGatewayPeeringName must be from the list of transitGatewayPeering object
   * @param values
   * @param errors
   */
  private validateTgwPeeringName(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const transitGateway of values.transitGateways) {
      for (const routeTable of transitGateway.routeTables) {
        for (const route of routeTable.routes) {
          if (NetworkConfigTypes.transitGatewayRouteTableTgwPeeringEntryConfig.is(route.attachment)) {
            const attachment: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableTgwPeeringEntryConfig> =
              route.attachment;
            if (!values.transitGatewayPeering?.find(item => item.name === attachment.transitGatewayPeeringName)) {
              errors.push(
                `Transit gateway ${transitGateway.name} route table ${routeTable.name} validation error, transitGatewayPeeringName property value ${attachment.transitGatewayPeeringName} not found in transitGatewayPeering list!!!! `,
              );
            }
          }
        }
      }
    }
  }

  /**
   * Function to validate transit gateways and route tables used TGW Peering configuration
   * @param values
   * @param errors
   */
  private validateTgwPeeringTransitGatewaysAndRouteTables(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    values.transitGatewayPeering?.forEach(transitGatewayPeering => {
      // Accepter TGW validation
      const accepterTransitGateway = values.transitGateways.find(
        item =>
          item.account === transitGatewayPeering.accepter.account &&
          item.region === transitGatewayPeering.accepter.region &&
          item.name === transitGatewayPeering.accepter.transitGatewayName,
      );
      if (!accepterTransitGateway) {
        errors.push(
          `Transit gateway peering ${transitGatewayPeering.name} validation error, accepter transit gateway ${transitGatewayPeering.accepter.transitGatewayName} in ${transitGatewayPeering.accepter.account} account and ${transitGatewayPeering.accepter.region} not found!!!! `,
        );
      } else {
        if (
          !accepterTransitGateway.routeTables.find(
            item => item.name === transitGatewayPeering.accepter.routeTableAssociations,
          )
        ) {
          errors.push(
            `Transit gateway peering ${transitGatewayPeering.name} validation error, accepter transit gateway ${transitGatewayPeering.accepter.transitGatewayName} in ${transitGatewayPeering.accepter.account} account and ${transitGatewayPeering.accepter.region}, route table ${transitGatewayPeering.accepter.routeTableAssociations} not found!!!! `,
          );
        }
      }

      // Requester TGW validation
      const requesterTransitGateway = values.transitGateways.find(
        item =>
          item.account === transitGatewayPeering.requester.account &&
          item.region === transitGatewayPeering.requester.region &&
          item.name === transitGatewayPeering.requester.transitGatewayName,
      );
      if (!requesterTransitGateway) {
        errors.push(
          `Transit gateway peering ${transitGatewayPeering.name} validation error, requester transit gateway ${transitGatewayPeering.requester.transitGatewayName} in ${transitGatewayPeering.accepter.account} account and ${transitGatewayPeering.accepter.region} not found!!!! `,
        );
      } else {
        if (
          !requesterTransitGateway.routeTables.find(
            item => item.name === transitGatewayPeering.requester.routeTableAssociations,
          )
        ) {
          errors.push(
            `Transit gateway peering ${transitGatewayPeering.name} validation error, requester transit gateway ${transitGatewayPeering.accepter.transitGatewayName} in ${transitGatewayPeering.accepter.account} account and ${transitGatewayPeering.accepter.region}, route table ${transitGatewayPeering.requester.routeTableAssociations} not found!!!! `,
          );
        }
      }
    });
  }

  /**
   * Function to validate existence of Transit Gateway deployment target OUs
   * Make sure share target OUs are part of Organization config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateTgwShareTargetOUs(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const transitGateway of values.transitGateways ?? []) {
      for (const ou of transitGateway.shareTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for transit gateways ${transitGateway.name} does not exist in organization-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of transit deployment target accounts
   * Make sure share target accounts are part of account config file
   * @param values
   */
  private validateTgwShareTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const transitGateway of values.transitGateways ?? []) {
      for (const account of transitGateway.shareTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for transit gateway ${transitGateway.name} does not exist in accounts-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of transit gateway account name
   * Make sure target account is part of account config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateTgwAccountName(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const transitGateway of values.transitGateways ?? []) {
      if (!helpers.accountExists(transitGateway.account)) {
        errors.push(
          `Transit Gateway "${transitGateway.name}" account name "${transitGateway.account}" does not exist in accounts-config.yaml file`,
        );
      }
    }
  }

  /**
   * Function to validate transit gateway static route entries for VPC attachments
   * @param values
   * @param routeTableName
   * @param entry
   */
  private validateVpcStaticRouteEntry(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    routeTableName: string,
    entry: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteEntryConfig>,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig.is(entry.attachment)) {
      const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
      const vpcAttachment = entry.attachment as TransitGatewayRouteTableVpcEntryConfig;
      const vpc = vpcs.find(item => item.name === vpcAttachment.vpcName);
      if (!vpc) {
        errors.push(`[Transit Gateway route table ${routeTableName}]: cannot find VPC ${vpcAttachment.vpcName}`);
      }
    }
  }

  /**
   * Function to validate transit gateway static route entries for DX attachments
   * @param values
   * @param routeTableName
   * @param entry
   */
  private validateDxGatewayStaticRouteEntry(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    routeTableName: string,
    tgw: t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig>,
    entry: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteEntryConfig>,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableDxGatewayEntryConfig.is(entry.attachment)) {
      const dxgws = [...(values.directConnectGateways ?? [])];
      const dxAttachment = entry.attachment as TransitGatewayRouteTableDxGatewayEntryConfig;
      const dxgw = dxgws.find(item => item.name === dxAttachment.directConnectGatewayName);
      // Catch error if DXGW doesn't exist
      if (!dxgw) {
        errors.push(
          `[Transit Gateway route table ${routeTableName}]: cannot find DX Gateway ${dxAttachment.directConnectGatewayName}`,
        );
      }
      if (dxgw) {
        // Catch error if DXGW is not in the same account as the TGW
        if (dxgw.account !== tgw.account) {
          errors.push(
            `[Transit Gateway route table ${routeTableName}]: cannot add route entry for DX Gateway ${dxAttachment.directConnectGatewayName}. DX Gateway and TGW ${tgw.name} reside in separate accounts`,
          );
        }
        // Catch error if there is no association with the TGW
        if (!dxgw.transitGatewayAssociations || !dxgw.transitGatewayAssociations.find(item => item.name === tgw.name)) {
          errors.push(
            `[Transit Gateway route table ${routeTableName}]: cannot add route entry for DX Gateway ${dxAttachment.directConnectGatewayName}. DX Gateway and TGW ${tgw.name} are not associated`,
          );
        }
      }
    }
  }

  /**
   * Function to validate transit gateway static route entries for VPN attachments
   * @param values
   * @param routeTableName
   * @param entry
   */
  private validateVpnStaticRouteEntry(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    routeTableName: string,
    entry: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteEntryConfig>,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableVpnEntryConfig.is(entry.attachment)) {
      const vpnAttachment = entry.attachment as TransitGatewayRouteTableVpnEntryConfig;
      const vpn = values.customerGateways?.find(cgwItem =>
        cgwItem.vpnConnections?.find(vpnItem => vpnItem.name === vpnAttachment.vpnConnectionName),
      );
      if (!vpn) {
        errors.push(
          `[Transit Gateway route table ${routeTableName}]: cannot find VPN ${vpnAttachment.vpnConnectionName}`,
        );
      }
    }
  }

  /**
   * Function to validate TGW route table entries
   */
  private validateTgwStaticRouteEntries(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    tgw: t.TypeOf<typeof NetworkConfigTypes.transitGatewayConfig>,
    routeTable: t.TypeOf<typeof NetworkConfigTypes.transitGatewayRouteTableConfig>,
    errors: string[],
  ) {
    for (const entry of routeTable.routes ?? []) {
      // Catch error if an attachment and blackhole are both defined
      if (entry.attachment && entry.blackhole) {
        errors.push(
          `[Transit Gateway route table ${routeTable.name}]: cannot define both an attachment and blackhole target`,
        );
      }
      // Catch error if neither attachment or blackhole are defined
      if (!entry.attachment && !entry.blackhole) {
        errors.push(
          `[Transit Gateway route table ${routeTable.name}]: must define either an attachment or blackhole target`,
        );
      }
      // Catch error if destination CIDR and prefix list are both defined
      if (entry.destinationCidrBlock && entry.destinationPrefixList) {
        errors.push(
          `[Transit Gateway route table ${routeTable.name}]: cannot define both a destination CIDR and destination prefix list`,
        );
      }
      // Catch error if destination CIDR and prefix list are not defined
      if (!entry.destinationCidrBlock && !entry.destinationPrefixList) {
        errors.push(
          `[Transit Gateway route table ${routeTable.name}]: must define either a destination CIDR or destination prefix list`,
        );
      }
      // Validate VPC attachment routes
      this.validateVpcStaticRouteEntry(values, routeTable.name, entry, errors);

      // Validate DX Gateway routes
      this.validateDxGatewayStaticRouteEntry(values, routeTable.name, tgw, entry, errors);

      // Validate VPN static route entry
      this.validateVpnStaticRouteEntry(values, routeTable.name, entry, errors);
    }
  }

  /**
   * Function to validate conditional dependencies for TGW configurations
   * @param values
   */
  private validateTgwConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const tgw of values.transitGateways ?? []) {
      for (const routeTable of tgw.routeTables ?? []) {
        this.validateTgwStaticRouteEntries(values, tgw, routeTable, errors);
      }
    }
  }
}

/**
 * Class to validate DHCP options sets
 */
class DhcpOptionsValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate DHCP options names
    //
    this.validateDhcpOptNames(values, helpers, errors);
    //
    // Validate DHCP options names
    //
    this.validateDhcpOptAccountNames(values, helpers, errors);
    //
    // Validate DHCP configuration
    //
    this.validateDhcpOptConfiguration(values, helpers, errors);
  }

  private validateDhcpOptNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const setNames: string[] = [];
    values.dhcpOptions?.forEach(set => setNames.push(set.name));

    if (helpers.hasDuplicates(setNames)) {
      errors.push(
        `Duplicate DHCP options set names exist. DHCP options set names must be unique. DHCP options set names in file: ${setNames}`,
      );
    }
  }

  /**
   * Validate DHCP options account names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateDhcpOptAccountNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.dhcpOptions?.forEach(set => {
      set.accounts.forEach(account => {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Target account ${account} for DHCP options set ${set.name} does not exist in accounts-config.yaml file`,
          );
        }
      });
    });
  }

  private validateDhcpOptConfiguration(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.dhcpOptions?.forEach(set => {
      // Validate domain name
      this.validateDomainName(set, helpers, errors);
      // Validate IP addresses
      this.validateIpAddresses(set, helpers, errors);
    });
  }

  /**
   * Validate DHCP option set domain name
   * @param set
   * @param helpers
   * @param errors
   */
  private validateDomainName(set: DhcpOptsConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    // Validate regex
    if (set.domainName && !helpers.matchesRegex(set.domainName, '^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$')) {
      errors.push(
        `[DHCP options set ${set.name}]: domainName "${set.domainName}" is invalid. Domain names must match the pattern "^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$"`,
      );
    }
    // Validate regional domain names are not deployed to more than one region
    const isRegionalName = set.domainName
      ? set.domainName === 'ec2.internal' || helpers.matchesRegex(set.domainName, '^.+\\.compute\\.internal$')
      : false;
    if (set.regions.length > 1 && set.domainName && isRegionalName) {
      errors.push(
        `[DHCP options set ${set.name}]: domainName "${set.domainName}" is invalid. Domain name is deployed to multiple regions but specified Amazon-provided regional domain name`,
      );
    }
  }

  /**
   * Validate IP addresses defined for DHCP options set
   * @param set
   * @param helpers
   * @param errors
   */
  private validateIpAddresses(set: DhcpOptsConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    // Validate IP addresses are valid
    const ips = [...(set.domainNameServers ?? []), ...(set.netbiosNameServers ?? []), ...(set.ntpServers ?? [])];
    ips.forEach(ip => {
      if (ip !== 'AmazonProvidedDNS' && !helpers.isValidIpv4(ip)) {
        errors.push(
          `[DHCP options set ${set.name}]: IP address "${ip}" is invalid. Values must be either a valid IPv4 address or AmazonProvidedDNS`,
        );
      }
    });

    // Validate number of servers defined
    if (set.domainNameServers && set.domainNameServers.length > 4) {
      errors.push(
        `[DHCP options set ${set.name}]: domainNameServers has ${set.domainNameServers.length} servers defined. A maximum of 4 servers may be defined`,
      );
    }
    if (set.netbiosNameServers && set.netbiosNameServers.length > 4) {
      errors.push(
        `[DHCP options set ${set.name}]: netbiosNameServers has ${set.netbiosNameServers.length} servers defined. A maximum of 4 servers may be defined`,
      );
    }
    if (set.ntpServers && set.ntpServers.length > 4) {
      errors.push(
        `[DHCP options set ${set.name}]: ntpServers has ${set.ntpServers.length} servers defined. A maximum of 4 servers may be defined`,
      );
    }
  }
}

/**
 * Class to validate endpoint policies
 */
class EndpointPoliciesValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate endpoint policy names are unique
    //
    this.validateEndpointPolicyNames(values, helpers, errors);
    //
    // Validate endpoint policy document exists
    //
    this.validateEndpointPolicyDocumentFile(values, configDir, errors);
  }
  /**
   * Method to validate endpoint policy names are unique
   * @param values
   * @param helpers
   * @param errors
   */
  private validateEndpointPolicyNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const policyNames = values.endpointPolicies.map(policy => {
      return policy.name;
    });
    // Validate names are unique
    if (helpers.hasDuplicates(policyNames)) {
      errors.push(
        `Duplicate endpoint policy names exist. Endpoint policy names must be unique. Endpoint policy names in file: ${policyNames}`,
      );
    }
  }
  /**
   * Function to validate Endpoint policy document file existence
   * @param values
   * @param configDir
   * @param errors
   */
  private validateEndpointPolicyDocumentFile(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    configDir: string,
    errors: string[],
  ) {
    for (const policyItem of values.endpointPolicies ?? []) {
      if (!fs.existsSync(path.join(configDir, policyItem.document))) {
        errors.push(`Endpoint policy ${policyItem.name} document file ${policyItem.document} not found!`);
      }
    }
  }
}

/**
 * Class to validate customer-managed prefix lists
 */
class PrefixListValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate prefix list names
    //
    this.validatePrefixListNames(values, helpers, errors);
    //
    // Validate prefix list account names
    //
    this.validatePrefixListAccountNames(values, helpers, errors);
    //
    // Validate entries
    //
    this.validatePrefixListEntries(values, helpers, errors);
  }

  /**
   * Validate prefix list names
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePrefixListNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const listNames: string[] = [];
    values.prefixLists?.forEach(list => listNames.push(list.name));

    if (helpers.hasDuplicates(listNames)) {
      errors.push(
        `Duplicate prefix list names exist. Prefix list names must be unique. Prefix list names in file: ${listNames}`,
      );
    }
  }

  /**
   * Validate prefix list account names
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePrefixListAccountNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.prefixLists?.forEach(list => {
      list.accounts.forEach(account => {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Target account ${account} for prefix list ${list.name} does not exist in accounts-config.yaml file`,
          );
        }
      });
    });
  }

  /**
   * Validate prefix list entries
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePrefixListEntries(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.prefixLists?.forEach(list => {
      // Validate number of entries
      if (list.entries.length > list.maxEntries) {
        errors.push(
          `[Prefix list ${list.name}]: maximum number of entries exceeded. Number of entries defined: ${list.entries.length} Max entries allowed: ${list.maxEntries}`,
        );
      }
      // Validate CIDR ranges
      list.entries.forEach(entry => {
        if (!helpers.isValidIpv4Cidr(entry)) {
          errors.push(`[Prefix list ${list.name}]: entry "${entry}" is invalid. Value must be a valid IPv4 CIDR range`);
        }
      });
    });
  }
}

/**
 * Class to validate Route53Resolver
 */
class Route53ResolverValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    const domainLists: { name: string; document: string }[] = [];
    //
    // Prepare Custom domain list
    //
    this.prepareCustomDomainList(values, domainLists);
    //
    // Custom domain lists
    //
    this.validateCustomDomainListDocumentFile(configDir, domainLists, errors);
    //
    // Validate query logs
    //
    this.validateQueryLogs(values, helpers, errors);
    //
    // Validate DNS firewall rules
    //
    this.validateDnsFirewallRuleGroups(values, helpers, errors);
    //
    // Validate resolver endpoints
    //
    this.validateResolverEndpoints(values, helpers, errors);
    //
    // Validate resolver rules
    //
    this.validateResolverRules(values, helpers, errors);
  }

  /**
   * Function to prepare custom domain list
   * @param values
   */
  private prepareCustomDomainList(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    domainLists: { name: string; document: string }[],
  ) {
    for (const ruleGroup of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      for (const rule of ruleGroup.rules) {
        if (rule.customDomainList) {
          domainLists.push({ name: rule.name, document: rule.customDomainList });
        }
      }
    }
  }

  /**
   * Function to validate custom domain list document file existence
   * @param configDir
   */
  private validateCustomDomainListDocumentFile(
    configDir: string,
    domainLists: { name: string; document: string }[],
    errors: string[],
  ) {
    for (const list of domainLists) {
      if (!fs.existsSync(path.join(configDir, list.document))) {
        errors.push(`DNS firewall custom domain list ${list.name} document file ${list.document} not found!`);
      }
    }
  }

  private validateQueryLogs(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const queryLogs = values.centralNetworkServices?.route53Resolver?.queryLogs;

    if (queryLogs) {
      //
      // Validate query log destinations
      //
      this.validateQueryLogDestinations(queryLogs, helpers, errors);
      //
      // Validate query log share target OUs
      //
      this.validateQueryLogShareTargetOus(queryLogs, helpers, errors);
      //
      // Validate query log share target accounts
      //
      this.validateQueryLogShareTargetAccounts(queryLogs, helpers, errors);
    }
  }

  /**
   * Validate query log destinations
   * @param queryLogs
   * @param helpers
   * @param errors
   */
  private validateQueryLogDestinations(
    queryLogs: DnsQueryLogsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Validate there are no duplicates
    if (helpers.hasDuplicates(queryLogs.destinations)) {
      errors.push(
        `[Resolver query logs ${queryLogs.name}]: duplicate destinations configured. Destinations must be unique. Destinations in file: ${queryLogs.destinations}`,
      );
    }
  }

  /**
   * Validate query log share target OUs
   * @param queryLogs
   * @param helpers
   * @param errors
   */
  private validateQueryLogShareTargetOus(
    queryLogs: DnsQueryLogsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const ou of queryLogs.shareTargets?.organizationalUnits ?? []) {
      if (!helpers.ouExists(ou)) {
        errors.push(
          `Share target OU ${ou} for Resolver query logs ${queryLogs.name} does not exist in organization-config.yaml`,
        );
      }
    }
  }

  /**
   * Validate query logs share target accounts
   * @param queryLogs
   * @param helpers
   * @param errors
   */
  private validateQueryLogShareTargetAccounts(
    queryLogs: DnsQueryLogsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const account of queryLogs.shareTargets?.accounts ?? []) {
      if (!helpers.accountExists(account)) {
        errors.push(
          `Share target account ${account} for Resolver query logs ${queryLogs.name} does not exist in accounts-config.yaml`,
        );
      }
    }
  }

  /**
   * Validate firewall rule groups
   * @param values
   * @param helpers
   * @param errors
   */
  private validateDnsFirewallRuleGroups(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate firewall rule names
    //
    this.validateFirewallRuleNames(values, helpers, errors);
    //
    // Validate firewall share target OUs
    //
    this.validateFirewallRuleShareTargetOus(values, helpers, errors);
    //
    // Validate firewall share target OUs
    //
    this.validateFirewallRuleShareTargetAccounts(values, helpers, errors);
    //
    // Validate firewall rules
    //
    this.validateFirewallRules(values, helpers, errors);
  }

  /**
   * Validate firewall rule names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRuleNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.firewallRuleGroups?.forEach(rule => ruleNames.push(rule.name));

    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `Resolver firewall rule groups contain duplicate names. Rule group names must be unique. Rule group names in file: ${ruleNames}`,
      );
    }
  }

  /**
   * Validate firewall share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRuleShareTargetOus(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const rule of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      for (const ou of rule.shareTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Resolver firewall rule group ${rule.name} does not exist in organization-config.yaml`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRuleShareTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const rule of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      for (const account of rule.shareTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Resolver firewall rule group ${rule.name} does not exist in accounts-config.yaml`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall rule group rules
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const group of values.centralNetworkServices?.route53Resolver?.firewallRuleGroups ?? []) {
      //
      // Validate firewall rule names
      //
      this.validateRuleGroupRuleNames(group, helpers, errors);
      //
      // Validate firewall rule priorities
      //
      this.validateRuleGroupRulePriorities(group, helpers, errors);
      for (const rule of group.rules) {
        //
        // Validate shape of rule object
        //
        this.validateRuleStructure(rule, helpers, errors);
      }
    }
  }

  /**
   * Validate rule names in a rule group
   * @param group
   * @param helpers
   * @param errors
   */
  private validateRuleGroupRuleNames(
    group: DnsFirewallRuleGroupConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const ruleNames: string[] = [];
    group.rules.forEach(rule => ruleNames.push(rule.name));
    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `[Resolver firewall rule group ${group.name}]: duplicate rule names. Rule names must be unique for each rule group. Rule names in file: ${ruleNames}`,
      );
    }
  }

  /**
   * Validate rule priorities in a rule group
   * @param group
   * @param helpers
   * @param errors
   */
  private validateRuleGroupRulePriorities(
    group: DnsFirewallRuleGroupConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const priorities: string[] = [];
    group.rules.forEach(rule => priorities.push(rule.priority.toString()));
    if (helpers.hasDuplicates(priorities)) {
      errors.push(
        `[Resolver firewall rule group ${group.name}]: duplicate rule priorities. Rule priorities must be unique for each rule group. Rule priorities in file: ${priorities}`,
      );
    }
  }

  /**
   * Validate the shape of the rule object
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateRuleStructure(rule: DnsFirewallRulesConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const keys = helpers.getObjectKeys(rule);
    const blockKeys = ['blockResponse', 'blockOverrideDomain', 'blockOverrideTtl'];

    // Validate domain list
    if (rule.customDomainList && rule.managedDomainList) {
      errors.push(
        `[Resolver firewall rule ${rule.name}]: you may only specify one of customDomainList or managedDomainList`,
      );
    }
    if (!rule.customDomainList && !rule.managedDomainList) {
      errors.push(
        `[Resolver firewall rule ${rule.name}]: you must specify one of customDomainList or managedDomainList`,
      );
    }

    // Validate non-BLOCK actions
    if (rule.action !== 'BLOCK' && keys.some(key => blockKeys.includes(key))) {
      errors.push(
        `[Resolver firewall rule ${rule.name}]: cannot specify the following rule properties for ${rule.action} action: ${blockKeys}`,
      );
    }

    // Validate block actions
    if (rule.action === 'BLOCK') {
      this.validateBlockActions(rule, keys, errors);
    }
  }

  /**
   * Validate block actions for the rule object
   * @param rule
   * @param keys
   * @param errors
   */
  private validateBlockActions(rule: DnsFirewallRulesConfig, keys: string[], errors: string[]) {
    const blockOverrideKeys = ['blockOverrideDomain', 'blockOverrideTtl'];
    // Ensure the BLOCK action has a blockResponse
    if (!rule.blockResponse) {
      errors.push(`[Resolver firewall rule ${rule.name}]: BLOCK actions require the blockResponse property`);
    } else {
      // Validate non-OVERRIDE BLOCK actions
      if (rule.blockResponse !== 'OVERRIDE' && keys.some(key => blockOverrideKeys.includes(key))) {
        errors.push(
          `[Resolver firewall rule ${rule.name}]: cannot specify the following rule properties for BLOCK actions with ${rule.blockResponse} block response: ${blockOverrideKeys}`,
        );
      }
      // Validate OVERRIDE BLOCK actions
      if (rule.blockResponse === 'OVERRIDE' && !blockOverrideKeys.some(overrideKey => keys.includes(overrideKey))) {
        errors.push(
          `[Resolver firewall rule ${rule.name}]: must specify the following rule properties for BLOCK actions with OVERRIDE block response: ${blockOverrideKeys}`,
        );
      }
    }
  }

  private validateResolverEndpoints(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate endpoint names
    //
    this.validateResolverEndpointNames(values, helpers, errors);
    //
    // Validate resolver endpoint properties
    //
    this.validateResolverEndpointProps(values, helpers, errors);
  }

  /**
   * Validate resolver endpoint names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverEndpointNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const endpointNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => endpointNames.push(endpoint.name));

    // Valiadate there are no duplicates
    if (helpers.hasDuplicates(endpointNames)) {
      errors.push(
        `Resolver endpoints contain duplicate names. Endpoint names must be unique. Endpoint names in file: ${endpointNames}`,
      );
    }

    // Validate regex
    endpointNames.forEach(name => {
      if (!helpers.matchesRegex(name, '(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)')) {
        errors.push(
          `Resolver endpoint name "${name}" is invalid. Endpoint names must match the pattern "(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)"`,
        );
      }
    });
  }

  /**
   * Validate resolver endpoint properties
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverEndpointProps(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const endpoint of values.centralNetworkServices?.route53Resolver?.endpoints ?? []) {
      //
      // Validate endpoint object structure
      //
      const allValid = this.validateResolverEndpointStructure(endpoint, helpers, errors);
      //
      // Validate rules
      //
      if (allValid) {
        this.validateResolverEndpointVpcs(values, endpoint, helpers, errors);
      }
    }
  }

  /**
   * Validate structure and property values of the endpoint
   * @param endpoint
   * @param helpers
   * @param errors
   * @returns
   */
  private validateResolverEndpointStructure(
    endpoint: ResolverEndpointConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    let allValid = true;

    // Validate rules are not set on inbound endpoint
    if (endpoint.type === 'INBOUND' && endpoint.rules) {
      allValid = false;
      errors.push(`[Resolver endpoint ${endpoint.name}]: INBOUND endpoint type cannot have associated resolver rules`);
    }

    // Validate rule types
    if (endpoint.type === 'OUTBOUND') {
      endpoint.rules?.forEach(rule => {
        if (rule.ruleType && rule.ruleType !== 'FORWARD') {
          allValid = false;
          errors.push(
            `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: rules associated with OUTBOUND endpoints can only specify FORWARD rule type`,
          );
        }
      });
    }

    // Validate allowed CIDRs
    const cidrs: string[] = [];
    let cidrsValid = true;
    endpoint.allowedCidrs?.forEach(cidr => cidrs.push(cidr));

    cidrs.forEach(item => {
      if (!helpers.isValidIpv4Cidr(item)) {
        allValid = false;
        cidrsValid = false;
        errors.push(
          `[Resolver endpoint ${endpoint.name}]: allowedCidr "${item}" is invalid. Value must be a valid IPv4 CIDR range`,
        );
      }
    });

    if (cidrsValid && helpers.hasDuplicates(cidrs)) {
      allValid = false;
      errors.push(`[Resolver endpoint ${endpoint.name}]: endpoint has duplicate allowed CIDRs`);
    }
    return allValid;
  }

  /**
   * Validate endpoint target VPC attributes
   * @param values
   * @param endpoint
   * @param helpers
   * @param errors
   */
  private validateResolverEndpointVpcs(
    values: NetworkConfig,
    endpoint: ResolverEndpointConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const delegatedAdmin = values.centralNetworkServices!.delegatedAdminAccount;

    // Validate VPC
    const vpc = helpers.getVpc(values, endpoint.vpc);
    if (!vpc) {
      errors.push(`[Resolver endpoint ${endpoint.name}]: VPC "${endpoint.vpc}" does not exist`);
    } else {
      // Validate the target is not a VPC template
      if (NetworkConfigTypes.vpcTemplatesConfig.is(vpc)) {
        errors.push(
          `[Resolver endpoint ${endpoint.name}]: VPC templates are not a supported target VPC type for Resolver endpoints`,
        );
      }

      if (NetworkConfigTypes.vpcConfig.is(vpc)) {
        // Validate we are targeting delegated admin account
        if (vpc.account !== delegatedAdmin) {
          errors.push(
            `[Resolver endpoint ${endpoint.name}]: VPC "${vpc.name}" is not deployed to delegated admin account "${delegatedAdmin}". Resolver endpoints must be deployed to the delegated admin account`,
          );
        }
        // Validate VPC subnets
        this.validateResolverEndpointSubnets(endpoint, vpc, helpers, errors);
      }
    }
  }

  private validateResolverEndpointSubnets(
    endpoint: ResolverEndpointConfig,
    vpc: VpcConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const subnets: SubnetConfig[] = [];
    endpoint.subnets.forEach(item => {
      const subnet = helpers.getSubnet(vpc, item);
      // Validate subnet exists
      if (!subnet) {
        errors.push(`[Resolver endpoint ${endpoint.name}]: VPC "${vpc.name}" does not contain the subnet "${item}"`);
      } else {
        subnets.push(subnet);
      }
    });

    // Validate there are no duplicate subnets or AZs
    const subnetNames: string[] = [];
    const subnetAzs: string[] = [];
    subnets.forEach(subnetItem => {
      subnetNames.push(subnetItem.name);
      subnetAzs.push(subnetItem.availabilityZone);
    });

    if (helpers.hasDuplicates(subnetNames)) {
      errors.push(
        `[Resolver endpoint ${endpoint.name}]: endpoint has duplicate subnets defined. Subnets must be unique. Subnets in file: ${subnetNames}`,
      );
    }
    if (helpers.hasDuplicates(subnetAzs)) {
      errors.push(
        `[Resolver endpoint ${endpoint.name}]: endpoint has duplicate subnet AZs defined. AZs must be unique. AZs in file: ${subnetAzs}`,
      );
    }
  }

  private validateResolverRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate Resolver rule share target OUs
    //
    this.validateResolverRuleShareTargetOus(values, helpers, errors);
    //
    // Validate Resolver rule share target accounts
    //
    this.validateResolverRuleShareTargetAccounts(values, helpers, errors);
    //
    // Validate SYSTEM rules
    //
    this.validateSystemRules(values, helpers, errors);
    //
    // Validate FORWARD rules
    //
    this.validateForwardRules(values, helpers, errors);
  }

  /**
   * Validate Resolver rule share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverRuleShareTargetOus(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // SYSTEM rules
    values.centralNetworkServices?.route53Resolver?.rules?.forEach(systemRule => {
      systemRule.shareTargets?.organizationalUnits?.forEach(ou => {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Resolver rule ${systemRule.name} does not exist in organization-config.yaml`,
          );
        }
      });
    });

    // FORWARD rules
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => {
      endpoint.rules?.forEach(forwardRule => {
        forwardRule.shareTargets?.organizationalUnits?.forEach(ou => {
          if (!helpers.ouExists(ou)) {
            errors.push(
              `Share target OU ${ou} for Resolver endpoint ${endpoint.name} rule ${forwardRule.name} does not exist in organization-config.yaml`,
            );
          }
        });
      });
    });
  }

  /**
   * Validate Resolver rule share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validateResolverRuleShareTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // SYSTEM rules
    values.centralNetworkServices?.route53Resolver?.rules?.forEach(systemRule => {
      systemRule.shareTargets?.accounts?.forEach(account => {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Resolver rule ${systemRule.name} does not exist in accounts-config.yaml`,
          );
        }
      });
    });

    // FORWARD rules
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => {
      endpoint.rules?.forEach(forwardRule => {
        forwardRule.shareTargets?.accounts?.forEach(account => {
          if (!helpers.accountExists(account)) {
            errors.push(
              `Share target account ${account} for Resolver endpoint ${endpoint.name} rule ${forwardRule.name} does not exist in accounts-config.yaml`,
            );
          }
        });
      });
    });
  }

  /**
   * Validate SYSTEM rules
   * @param values
   * @param helpers
   * @param errors
   */
  private validateSystemRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    // Validate rule names
    this.validateSystemRuleNames(values, helpers, errors);

    // Validate rule properties
    for (const rule of values.centralNetworkServices?.route53Resolver?.rules ?? []) {
      // Validate only SYSTEM rules are created in this block
      if (rule.ruleType && rule.ruleType !== 'SYSTEM') {
        errors.push(`[Resolver rule ${rule.name}]: rules not defined under an endpoint must use the SYSTEM rule type`);
      }
      // Validate there are no targets for the SYSTEM rule
      if (rule.inboundEndpointTarget || rule.targetIps) {
        errors.push(`[Resolver rule ${rule.name}]: SYSTEM rule type cannot include targets`);
      }
      // Validate domain name regex
      if (!helpers.matchesRegex(rule.domainName, '(^\\.$)|(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)')) {
        errors.push(
          `[Resolver rule ${rule.name}]: domain name "${rule.domainName}" is invalid. Domain name must match the pattern "(^\\.$)|(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)"`,
        );
      }
    }
  }

  /**
   * Validate SYSTEM rule names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateSystemRuleNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.rules?.forEach(item => {
      ruleNames.push(item.name);
    });

    // Validate rule names are unique
    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `Resolver SYSTEM rules has duplicates. Resolver rule names must be unique. Rule names in file: ${ruleNames}`,
      );
    }

    // Validate regex
    ruleNames.forEach(name => {
      if (!helpers.matchesRegex(name, '(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)')) {
        errors.push(
          `Resolver SYSTEM rule name "${name}" is invalid. Resolver rule names must match the pattern "(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)"`,
        );
      }
    });
  }

  /**
   * Validate FORWARD rules
   * @param values
   * @param helpers
   * @param errors
   */
  private validateForwardRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const endpointMap = this.getResolverEndpoints(values);

    // Validate FORMWARD rule names
    this.validateForwardRuleNames(values, helpers, errors);

    // Validate FORWARD rule properties
    for (const endpoint of values.centralNetworkServices?.route53Resolver?.endpoints ?? []) {
      for (const rule of endpoint.rules ?? []) {
        const targetValid = this.validateForwardRuleProps(endpoint, rule, helpers, errors);

        if (targetValid) {
          this.validateForwardRuleTargets(endpoint, rule, endpointMap, helpers, errors);
        }
      }
    }
  }

  /**
   * Return a map of endpoint configurations
   * @param values
   * @returns
   */
  private getResolverEndpoints(values: NetworkConfig): Map<string, ResolverEndpointConfig> {
    const endpoints = new Map<string, ResolverEndpointConfig>();
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint =>
      endpoints.set(endpoint.name, endpoint),
    );
    return endpoints;
  }

  /**
   * Validate FORWARD rule names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateForwardRuleNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleNames: string[] = [];
    values.centralNetworkServices?.route53Resolver?.endpoints?.forEach(endpoint => {
      endpoint.rules?.forEach(rule => ruleNames.push(rule.name));
    });

    // Validate rule names are unique
    if (helpers.hasDuplicates(ruleNames)) {
      errors.push(
        `Resolver FORWARD rules has duplicates. Resolver rule names must be unique. Rule names in file: ${ruleNames}`,
      );
    }

    // Validate regex
    ruleNames.forEach(name => {
      if (!helpers.matchesRegex(name, '(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)')) {
        errors.push(
          `Resolver FORWARD rule name "${name}" is invalid. Resolver rule names must match the pattern "(?!^[0-9]+$)(^[a-zA-Z0-9-_]+$)"`,
        );
      }
    });
  }

  /**
   * Validate FORWARD rule props
   * @param endpoint
   * @param rule
   * @param helpers
   * @param errors
   * @returns
   */
  private validateForwardRuleProps(
    endpoint: ResolverEndpointConfig,
    rule: ResolverRuleConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    // Validate domain name
    if (!helpers.matchesRegex(rule.domainName, '(^\\.$)|(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)')) {
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: domain name ${rule.domainName} is invalid. Domain name must match the pattern "(^\\.$)(^[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$)"`,
      );
    }

    // Validate target type
    let targetValid = true;
    if (rule.targetIps && rule.inboundEndpointTarget) {
      targetValid = false;
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: cannot define a FORWARD rule with both targetIp and inboundEndpointTarget properties`,
      );
    }
    if (!rule.targetIps && !rule.inboundEndpointTarget) {
      targetValid = false;
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: FORWARD rule must be defined with one of targetIp or inboundEndpointTarget properties`,
      );
    }

    return targetValid;
  }

  /**
   * Validate FORWARD rule targets
   * @param endpoint
   * @param rule
   * @param endpointMap
   * @param helpers
   * @param errors
   */
  private validateForwardRuleTargets(
    endpoint: ResolverEndpointConfig,
    rule: ResolverRuleConfig,
    endpointMap: Map<string, ResolverEndpointConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Validate target IPs
    rule.targetIps?.forEach(target => {
      if (!helpers.isValidIpv4(target.ip)) {
        errors.push(
          `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: IP "${target.ip}" is invalid. Value must be a valid IPv4 address`,
        );
      }

      // Validate ports
      if (target.port) {
        if (!helpers.matchesRegex(target.port, '^\\d{1,5}$')) {
          errors.push(
            `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target port "${target.port}" is invalid. Port must be a valid port in range 0-65535`,
          );
        } else {
          if (parseInt(target.port) < 0 || parseInt(target.port) > 65535) {
            errors.push(
              `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target port "${target.port}" is invalid. Port must be a valid port in range 0-65535`,
            );
          }
        }
      }
    });

    if (rule.inboundEndpointTarget) {
      this.validateForwardRuleInboundTarget(endpoint, rule, endpointMap, errors);
    }
  }

  private validateForwardRuleInboundTarget(
    endpoint: ResolverEndpointConfig,
    rule: ResolverRuleConfig,
    endpointMap: Map<string, ResolverEndpointConfig>,
    errors: string[],
  ) {
    // Validate inbound endpoints
    const inboundTarget = endpointMap.get(rule.inboundEndpointTarget!);

    if (!inboundTarget) {
      errors.push(
        `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target endpoint "${rule.inboundEndpointTarget}" does not exist`,
      );
    } else {
      if (inboundTarget.type !== 'INBOUND') {
        errors.push(
          `[Resolver endpoint ${endpoint.name} rule ${rule.name}]: target endpoint "${rule.inboundEndpointTarget}" is not an INBOUND endpoint`,
        );
      }
    }
  }
}

/**
 * Class to validate network firewall
 */
class NetworkFirewallValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate rule groups
    //
    this.validateRuleGroups(values, helpers, errors);
    //
    // Valiodate rule variables
    //
    this.validateRuleVariables(values, helpers, errors);
    //
    // Validate suricata rule file
    //
    this.validateSuricataFile(values, configDir, errors);
    //
    // Validate policies
    //
    this.validatePolicies(values, helpers, errors);
    //
    // Validate firewalls
    //
    this.validateFirewalls(values, helpers, errors);
  }

  private validateRuleGroups(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate rule group names
    //
    this.validateRuleGroupNames(values, helpers, errors);
    //
    // Validate rule group share target OUs
    //
    this.validateRuleGroupShareTargetOus(values, helpers, errors);
    //
    // Validate rule group share target account names
    //
    this.validateRuleGroupShareTargetAccountNames(values, helpers, errors);
    //
    // Confirm that the rule group definition is valid
    //
    const allValid = this.validateRulesSourceDefinition(values, helpers, errors);

    if (allValid) {
      //
      // Validate rule group rules
      //
      this.validateRuleGroupRules(values, helpers, errors);
    }
  }

  /**
   * Validate uniqueness of rule group names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ruleGroups = values.centralNetworkServices?.networkFirewall?.rules;
    if (ruleGroups) {
      const ruleGroupNames = ruleGroups.map(group => {
        return group.name;
      });

      if (helpers.hasDuplicates(ruleGroupNames)) {
        errors.push(
          `Duplicate Network Firewall rule group names exist. Rule group names must be unique. Rule group names in file: ${ruleGroupNames}`,
        );
      }

      for (const name of ruleGroupNames) {
        if (!helpers.matchesRegex(name, '^[a-zA-Z0-9-]+$')) {
          errors.push(
            `Network Firewall rule group name "${name}" is invalid. Rule group names must match the pattern "^[a-zA-Z0-9-]+$"`,
          );
        }
      }
    }
  }

  /**
   * Validate rule group share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupShareTargetOus(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const group of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      for (const ou of group.shareTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Network Firewall rule group ${group.name} does not exist in organization-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate rule group share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupShareTargetAccountNames(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const group of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      for (const account of group.shareTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Network Firewall rule group ${group.name} does not exist in accounts-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate that each rule group only contains a single rule source
   * @param values
   * @param errors
   * @returns
   */
  private validateRulesSourceDefinition(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    let allValid = true;
    for (const rule of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      const ruleSource = rule.ruleGroup?.rulesSource;

      if (ruleSource) {
        const keys = helpers.getObjectKeys(ruleSource);

        if (keys.length > 1) {
          allValid = false;
          errors.push(
            `[Network Firewall rule group ${rule.name}]: rules source has multiple properties defined. Please only define a single rules source per rule group. Rules sources for this rule: ${keys}`,
          );
        }
      }
    }
    return allValid;
  }

  /**
   * Validate rules in each rule group type
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleGroupRules(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.centralNetworkServices?.networkFirewall?.rules.forEach(rule => {
      const rulesSource = rule.ruleGroup?.rulesSource;
      if (rulesSource) {
        // Validate stateless rules and custom actions
        if (rulesSource.statelessRulesAndCustomActions) {
          this.validateStatelessRuleGroups(rule, helpers, errors);
          this.validateCustomActions(rule, helpers, errors);
        }
        // Validate stateful rules
        if (rulesSource.statefulRules) {
          this.validateStatefulRuleGroups(rule, helpers, errors);
        }
        // Validate domain lists
        if (rulesSource.rulesSourceList) {
          this.validateDomainList(rule, helpers, errors);
        }
        // Validate rule strings
        if (rulesSource.rulesString) {
          this.validateRuleString(rule, errors);
        }
      }
    });
  }

  /**
   * Validate stateless rule groups
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateStatelessRuleGroups(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const statelessRules = rule.ruleGroup!.rulesSource.statelessRulesAndCustomActions!;
    // Validate the rule type is STATELESS
    if (rule.type !== 'STATELESS') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource statelessRulesAndCustomActions must be STATELESS`,
      );
    }

    // Validate priorities are unique
    const priorities = statelessRules.statelessRules.map(item => {
      return item.priority.toString();
    });
    if (helpers.hasDuplicates(priorities)) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: Duplicate priorities in rule group. Please assign unique priority values. Priorities in rule group: ${priorities}`,
      );
    }

    // Validate priorities are within constraints
    let allValid = true;
    for (const priority of priorities) {
      if (parseInt(priority) < 1 || parseInt(priority) > 65535) {
        allValid = false;
      }
    }

    if (!allValid) {
      errors.push(
        `[Network firewall rule group ${rule.name}]: Invalid priority value in rule group. Priority must be a number between 1 and 65535. Priorities in rule group: ${priorities}`,
      );
    }

    // Validate if the rule group includes options only available to stateful groups
    if (rule.ruleGroup?.ruleVariables || rule.ruleGroup?.statefulRuleOptions) {
      errors.push(
        `[Network firewall rule group ${rule.name}]: stateless rule groups cannot contain the ruleVariables or statefulRuleOptions properties`,
      );
    }

    // Validate rule definition
    this.validateStatelessRuleDefinitions(rule, statelessRules, helpers, errors);
  }

  /**
   * Validate stateless rule group definitions
   * @param rule
   * @param statelessRules
   * @param helpers
   * @param errors
   */
  private validateStatelessRuleDefinitions(
    rule: NfwRuleGroupConfig,
    statelessRules: NfwStatelessRulesAndCustomActionsConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const ruleItem of statelessRules.statelessRules) {
      const definition = ruleItem.ruleDefinition;

      // Validate ports and CIDRs
      this.validateStatelessRuleDefinitionHeader(rule, definition, helpers, errors);
    }
  }

  /**
   * Validate IP header details for stateless rule groups
   * @param rule
   * @param definition
   * @param helpers
   * @param errors
   */
  private validateStatelessRuleDefinitionHeader(
    rule: NfwRuleGroupConfig,
    definition: NfwRuleSourceStatelessRuleDefinitionConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const attributes = definition.matchAttributes;
    // Validate CIDRs
    const cidrs = [...(attributes.sources ?? []), ...(attributes.destinations ?? [])] ?? [];
    cidrs.forEach(cidr => {
      if (!helpers.isValidIpv4Cidr(cidr)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: invalid CIDR ${cidr} in matchAttributes configuration`,
        );
      }
    });

    // Validate ports
    if (attributes.destinationPorts || attributes.sourcePorts) {
      const isValidProtocol = attributes.protocols
        ? attributes.protocols.includes(6) || attributes.protocols.includes(17)
        : true;

      if (!isValidProtocol) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: matchAttributes protocols must include 6 (TCP) and/or 17 (UDP) if sourcePorts or destinationPorts are defined`,
        );
      }

      // Validate port range values
      this.validateStatelessRuleDefinitionPortRanges(rule, attributes, errors);
    }

    // Validate TCP flags
    if (attributes.tcpFlags) {
      this.validateStatelessRuleDefinitionTcpFlags(rule, attributes, errors);
    }
  }

  /**
   * Validate stateless rule group port ranges
   * @param rule
   * @param attributes
   * @param errors
   */
  private validateStatelessRuleDefinitionPortRanges(
    rule: NfwRuleGroupConfig,
    attributes: NfwRuleSourceStatelessMatchAttributesConfig,
    errors: string[],
  ) {
    // Validate protocol number
    const isTcpProtocol = attributes.protocols ? attributes.protocols.includes(6) : true;

    if (!isTcpProtocol) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: matchAttributes protocols must include 6 (TCP) if tcpFlags are defined`,
      );
    }
    // Validate attributes
    const portRanges = [...(attributes.destinationPorts ?? []), ...(attributes.sourcePorts ?? [])] ?? [];
    portRanges.forEach(portRange => {
      const isValidPortRange = portRange.fromPort <= portRange.toPort;
      const portRangeString = `fromPort: ${portRange.fromPort}, toPort: ${portRange.toPort}`;

      if (!isValidPortRange) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: fromPort must be less than or equal to toPort. Defined port range: ${portRangeString}`,
        );
      }

      if (isValidPortRange && (portRange.fromPort < 0 || portRange.fromPort > 65535)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: fromPort value must be between 0 and 65535. Defined port range: ${portRangeString}`,
        );
      }

      if (isValidPortRange && (portRange.toPort < 0 || portRange.toPort > 65535)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: toPort value must be between 0 and 65535. Defined port range: ${portRangeString}`,
        );
      }
    });
  }

  /**
   * Validate stateless rule definition TCP flags
   * @param rule
   * @param attributes
   * @param errors
   */
  private validateStatelessRuleDefinitionTcpFlags(
    rule: NfwRuleGroupConfig,
    attributes: NfwRuleSourceStatelessMatchAttributesConfig,
    errors: string[],
  ) {
    for (const flagItem of attributes.tcpFlags ?? []) {
      const nonMatchingFlags = flagItem.flags.filter(item => !flagItem.masks.includes(item));

      if (nonMatchingFlags.length > 0) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: invalid TCP flags contained in rule definition. If masks are defined, flags can only contain values also contained in masks. Flags: ${flagItem.flags}, Masks: ${flagItem.masks}`,
        );
      }
    }
  }

  /**
   * Validate stateless custom actions
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateCustomActions(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const customActions = rule.ruleGroup?.rulesSource.statelessRulesAndCustomActions?.customActions;
    const statelessRules = rule.ruleGroup?.rulesSource.statelessRulesAndCustomActions?.statelessRules;
    let allValid = true;

    for (const ruleItem of statelessRules ?? []) {
      for (const action of ruleItem.ruleDefinition.actions) {
        if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !customActions) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: ruleDefinition custom action "${action}" is invalid. No matching actionName defined under the customActions property`,
          );
        }
      }
    }

    if (customActions) {
      allValid = this.validateCustomActionNames(rule, customActions, helpers, errors);
    }

    if (customActions && allValid) {
      this.validateStatelessRuleActions(rule, customActions, errors);
    }
  }

  /**
   * Validate custom action names and dimensions
   * @param resource
   * @param customActions
   * @param helpers
   * @param errors
   * @returns
   */
  private validateCustomActionNames(
    resource: NfwRuleGroupConfig | NfwFirewallPolicyConfig,
    customActions: NfwRuleSourceCustomActionConfig[],
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const actionNames = customActions.map(item => {
      return item.actionName;
    });
    let allValid = true;
    const resourceType = NetworkConfigTypes.nfwRuleGroupConfig.is(resource) ? 'rule group' : 'policy';

    // Check if duplicate action names are defined
    if (helpers.hasDuplicates(actionNames)) {
      allValid = false;
      errors.push(
        `[Network Firewall ${resourceType} ${resource.name}]: customActions definition has duplicate actionNames defined. Please define unique actionNames. actionNames in file: ${actionNames}`,
      );
    }

    // Validate action name regex
    for (const actionName of actionNames) {
      if (!helpers.matchesRegex(actionName, '^[a-zA-Z0-9]+$')) {
        allValid = false;
        errors.push(
          `[Network Firewall ${resourceType} ${resource.name}]: customActions actionName "${actionName}" is invalid. actionName must match regular expression "^[a-zA-Z0-9]+$"`,
        );
      }
    }

    // Validate action definition regex
    for (const action of customActions) {
      for (const dimension of action.actionDefinition.publishMetricAction.dimensions) {
        if (!helpers.matchesRegex(dimension, '^[a-zA-Z0-9-_ ]+$')) {
          allValid = false;
          errors.push(
            `[Network Firewall ${resourceType} ${resource.name}]: customActions actionDefinition dimension "${dimension}" is invalid. Dimension must match regular expression "^[a-zA-Z0-9-_ ]+$"`,
          );
        }
      }
    }
    return allValid;
  }

  /**
   * Validate stateless custom actions defined in a rule definition
   * @param rule
   * @param customActions
   * @param errors
   */
  private validateStatelessRuleActions(
    rule: NfwRuleGroupConfig,
    customActions: NfwRuleSourceCustomActionConfig[],
    errors: string[],
  ) {
    const ruleDefinitions = rule.ruleGroup?.rulesSource.statelessRulesAndCustomActions?.statelessRules;
    const actionNames = customActions.map(item => {
      return item.actionName;
    });

    for (const definition of ruleDefinitions ?? []) {
      for (const action of definition.ruleDefinition.actions) {
        if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !actionNames.includes(action)) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: ruleDefinition custom action "${action}" is invalid. Custom actions must be defined under the customActions property`,
          );
        }
      }
    }
  }

  private validateStatefulRuleGroups(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const statefulRules = rule.ruleGroup!.rulesSource.statefulRules!;
    // Validate rule type
    if (rule.type !== 'STATEFUL') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource statefulRules must be STATEFUL`,
      );
    }

    // Validate sids are unique
    const allValid = this.validateStatefulSids(rule, statefulRules, helpers, errors);

    // Validate rule definitions
    if (allValid) {
      for (const ruleItem of statefulRules) {
        // Validate rule header
        this.validateStatefulRuleHeader(rule, ruleItem, helpers, errors);
        // Validate rule options
        this.validateStatefulRuleOptions(rule, ruleItem, helpers, errors);
      }
    }
  }

  /**
   * Returns true if stateful rules all have unique and valid sid options
   * @param rule
   * @param statefulRules
   * @param helpers
   * @param errors
   * @returns
   */
  private validateStatefulSids(
    rule: NfwRuleGroupConfig,
    statefulRules: NfwRuleSourceStatefulRuleConfig[],
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    let allValid = true;

    // Retrieve sids from rule options
    const sids: NfwRuleSourceStatefulRuleOptionsConfig[] = [];
    for (const ruleItem of statefulRules) {
      for (const optionItem of ruleItem.ruleOptions) {
        if (optionItem.keyword === 'sid') {
          sids.push(optionItem);
        }
      }
    }

    // Validate there is a sid for each rule
    if (sids.length < statefulRules.length) {
      allValid = false;
      errors.push(
        `[Network Firewall rule group ${rule.name}]: one or more stateful rule definition rule options does not include "sid" keyword. "sid" keyword is required for all stateful rules`,
      );
    }
    if (sids.length > statefulRules.length) {
      allValid = false;
      errors.push(
        `[Network Firewall rule group ${rule.name}]: one or more stateful rule definition rule options includes multiple "sid" keywords. Only one "sid" keyword may be defined for all stateful rules`,
      );
    }

    // Validate sid ids
    const idsValid = this.validateStatefulSidSettings(rule, sids, helpers, errors);
    if (!idsValid) {
      allValid = false;
    }

    if (idsValid) {
      // Validate sids are unique
      const ids = sids.map(item => {
        return item.settings![0];
      });

      if (helpers.hasDuplicates(ids)) {
        allValid = false;
        errors.push(
          `[Network Firewall rule group ${rule.name}]: stateful rule options "sid" IDs contain duplicates. "sid" IDs must be unique`,
        );
      }
    }
    return allValid;
  }

  /**
   * Returns true if sid settings values are unique and valid
   * @param rule
   * @param sids
   * @param helpers
   * @param errors
   * @returns
   */
  private validateStatefulSidSettings(
    rule: NfwRuleGroupConfig,
    sids: NfwRuleSourceStatefulRuleOptionsConfig[],
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    // Validate sid settings
    let idsValid = true;
    for (const sid of sids) {
      if (!sid.settings) {
        idsValid = false;
        errors.push(
          `[Network Firewall rule group ${rule.name}]: one or more stateful rule options "sid" keywords does not have a corresponding ID set in settings`,
        );
      }

      if (sid.settings && (sid.settings.length > 1 || !helpers.matchesRegex(sid.settings[0], '^\\d+$'))) {
        idsValid = false;
        errors.push(
          `[Network Firewall rule group ${rule.name}]: one or more stateful rule options "sid" IDs are invalid. "sid" IDs must be a number in string quotes`,
        );
      }
    }
    return idsValid;
  }

  /**
   * Validate stateful rule header object
   * @param rule
   * @param statefulRule
   * @param helpers
   * @param errors
   */
  private validateStatefulRuleHeader(
    rule: NfwRuleGroupConfig,
    statefulRule: NfwRuleSourceStatefulRuleConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const anyArray = ['any', 'ANY'];
    // Validate IP addresses
    [statefulRule.header.destination, statefulRule.header.source].forEach(cidr => {
      if (!anyArray.includes(cidr) && !helpers.isValidIpv4Cidr(cidr)) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: stateful rule header IP source/destination "${cidr}" is invalid. Valid values are a CIDR range or the string "ANY"`,
        );
      }
    });
    // Validate port ranges
    [statefulRule.header.destinationPort, statefulRule.header.sourcePort].forEach(port => {
      // Validate the port is using the correct format
      if (!anyArray.includes(port) && !helpers.matchesRegex(port, '^\\d{1,5}(:\\d{1,5})?$')) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port "${port}" is invalid. Valid values are a single port, port range separated by colon (1990:1994), or the string "ANY"`,
        );
      }
      // Validate port ranges
      if (helpers.matchesRegex(port, '^\\d{1,5}:\\d{1,5}$')) {
        const fromPort = parseInt(port.split(':')[0]);
        const toPort = parseInt(port.split(':')[1]);

        if (fromPort > toPort) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port range "${port}" is invalid. fromPort is greater than toPort`,
          );
        }

        if (fromPort < 0 || fromPort > 65535) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port range "${port}" is invalid. fromPort is outside range 0-65535`,
          );
        }

        if (toPort < 0 || toPort > 65535) {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: stateful rule header source/destination port range "${port}" is invalid. toPort is outside range 0-65535`,
          );
        }
      }
    });
  }

  /**
   * Validate stateful rule options
   * @param rule
   * @param statefulRule
   * @param helpers
   * @param errors
   */
  private validateStatefulRuleOptions(
    rule: NfwRuleGroupConfig,
    statefulRule: NfwRuleSourceStatefulRuleConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const keywords = statefulRule.ruleOptions.map(option => {
      return option.keyword;
    });

    // Validate there are not duplicate keywords
    if (helpers.hasDuplicates(keywords)) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: stateful rule options has duplicate keywords. Please define unique keywords. Keywords in file: ${keywords}`,
      );
    }
  }

  /**
   * Validate stateful domain lists
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateDomainList(rule: NfwRuleGroupConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const domainList = rule.ruleGroup!.rulesSource.rulesSourceList!;
    // Validate rule type
    if (rule.type !== 'STATEFUL') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource rulesSourceList must be STATEFUL`,
      );
    }
    // Validate targets
    for (const target of domainList.targets) {
      if (!helpers.matchesRegex(target, '^\\.?[-a-zA-Z0-9@:%._\\+~#=]{1,256}\\.[a-z]{2,8}$')) {
        errors.push(
          `[Network Firewall rule group ${rule.name}]: target "${target}" is invalid. Targets must be formatted ".example.com" for wildcard domains and "example.com" for explicit match domains `,
        );
      }
    }
  }

  /**
   * Validate stateful rule variables
   * @param values
   * @param helpers
   * @param errors
   */
  private validateRuleVariables(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const rule of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
      if (rule.ruleGroup?.ruleVariables) {
        if (rule.type !== 'STATEFUL') {
          errors.push(
            `[Network Firewall rule group ${rule.name}]: ruleVariables may only be applied to STATEFUL rule groups`,
          );
        } else {
          this.validateRuleVariableDefinitions(rule, helpers, errors);
        }
      }
    }
  }

  /**
   * Validate rule variable definitions
   * @param rule
   * @param helpers
   * @param errors
   */
  private validateRuleVariableDefinitions(
    rule: NfwRuleGroupConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const ipSets = this.getRuleVariableDefinitions(rule.ruleGroup!.ruleVariables!.ipSets);
    const portSets = this.getRuleVariableDefinitions(rule.ruleGroup!.ruleVariables!.portSets);

    // Validate CIDRs
    ipSets.forEach(ipSet => {
      ipSet.definition.forEach(cidr => {
        if (!helpers.isValidIpv4Cidr(cidr)) {
          errors.push(
            `[Network Firewall rule group ${rule.name} rule variable ${ipSet.name}]: invalid CIDR ${cidr}. Value must be a valid IPv4 CIDR range`,
          );
        }
      });
    });

    // Validate ports
    portSets.forEach(portSet => {
      portSet.definition.forEach(port => {
        if (!helpers.matchesRegex(port, '^\\d{1,5}$')) {
          errors.push(
            `[Network Firewall rule group ${rule.name} rule variable ${portSet.name}]: invalid port "${port}". Valid value is a single TCP/UDP port between 0-65535`,
          );
        }
        if (helpers.matchesRegex(port, '^\\d{1,5}$') && (parseInt(port) < 0 || parseInt(port) > 65535)) {
          errors.push(
            `[Network Firewall rule group ${rule.name} rule variable ${portSet.name}]: invalid port "${port}". Valid value is a single TCP/UDP port between 0-65535`,
          );
        }
      });
    });
  }

  /**
   * Returns an array of rule variable definitions
   * @param definition
   * @returns
   */
  private getRuleVariableDefinitions(
    definition: NfwRuleVariableDefinitionConfig | NfwRuleVariableDefinitionConfig[],
  ): NfwRuleVariableDefinitionConfig[] {
    const variableDefinitions: NfwRuleVariableDefinitionConfig[] = [];

    if (Array.isArray(definition)) {
      variableDefinitions.push(...definition);
    } else {
      variableDefinitions.push(definition);
    }
    return variableDefinitions;
  }

  private validateRuleString(rule: NfwRuleGroupConfig, errors: string[]) {
    if (rule.type !== 'STATEFUL') {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource rulesString must be STATEFUL`,
      );
    }

    const suricataRuleActionType = ['alert', 'pass', 'drop', 'reject', 'rejectsrc', 'rejectdst', 'rejectboth'];
    const ruleSplit = rule.ruleGroup!.rulesSource.rulesString!.split(' ');
    if (!suricataRuleActionType.includes(ruleSplit[0])) {
      errors.push(
        `[Network Firewall rule group ${rule.name}]: invalid rule string. String must start with one of the following valid Suricata actions: ${suricataRuleActionType}`,
      );
    }
  }

  /**
   * Function to validate Endpoint policy document file existence
   * @param configDir
   */
  private validateSuricataFile(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    configDir: string,
    errors: string[],
  ) {
    values.centralNetworkServices?.networkFirewall?.rules.forEach(rule => {
      if (rule.ruleGroup?.rulesSource.rulesFile) {
        if (!fs.existsSync(path.join(configDir, rule.ruleGroup?.rulesSource.rulesFile))) {
          errors.push(`Suricata rules file ${rule.ruleGroup?.rulesSource.rulesFile} not found !!`);
        } else {
          const fileContent = fs.readFileSync(path.join(configDir, rule.ruleGroup?.rulesSource.rulesFile), 'utf8');
          const rules: string[] = [];
          // Suricata supported action type list
          // @link https://suricata.readthedocs.io/en/suricata-6.0.2/rules/intro.html#action
          const suricataRuleActionType = ['alert', 'pass', 'drop', 'reject', 'rejectsrc', 'rejectdst', 'rejectboth'];
          fileContent.split(/\r?\n/).forEach(line => {
            const ruleAction = line.split(' ')[0];
            if (suricataRuleActionType.includes(ruleAction)) {
              rules.push(line);
            }
          });

          if (rules.length === 0) {
            errors.push(`No rule definition found in suricata rules file ${rule.ruleGroup?.rulesSource.rulesFile}!!`);
          }

          if (rule.type !== 'STATEFUL') {
            errors.push(
              `[Network Firewall rule group ${rule.name}]: rule group type for rulesSource rulesFile must be STATEFUL`,
            );
          }
        }
      }
    });
  }

  /**
   * Validate firewall policies
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicies(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate policy names
    //
    this.validatePolicyNames(values, helpers, errors);
    //
    // Validate policy share target OUs
    //
    this.validatePolicyShareTargetOus(values, helpers, errors);
    //
    // Validate policy share target accounts
    //
    this.validatePolicyShareTargetAccounts(values, helpers, errors);
    //
    // Validate policy rule groups
    //
    this.validatePolicyRuleGroups(values, helpers, errors);
    //
    // Validate policy custom actions
    //
    this.validatePolicyCustomActions(values, helpers, errors);
  }

  /**
   * Get all rule groups defined in configuration
   * @param values
   * @returns
   */
  private getRuleGroups(values: NetworkConfig): Map<string, NfwRuleGroupConfig> {
    const ruleGroups = new Map<string, NfwRuleGroupConfig>();
    values.centralNetworkServices?.networkFirewall?.rules.forEach(rule => {
      ruleGroups.set(rule.name, rule);
    });

    return ruleGroups;
  }

  /**
   * Validate firewall policy names
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const policies = values.centralNetworkServices?.networkFirewall?.policies;
    if (policies) {
      const policyNames = policies.map(policy => {
        return policy.name;
      });

      if (helpers.hasDuplicates(policyNames)) {
        errors.push(
          `Duplicate Network Firewall policy names exist. Policy names must be unique. Policy names in file: ${policyNames}`,
        );
      }

      for (const name of policyNames) {
        if (!helpers.matchesRegex(name, '^[a-zA-Z0-9-]+$')) {
          errors.push(
            `Network Firewall policy name "${name}" is invalid. Policy names must match the pattern "^[a-zA-Z0-9-]+$"`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall policy share target OUs
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyShareTargetOus(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      for (const ou of policy.shareTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Share target OU ${ou} for Network Firewall policy ${policy.name} does not exist in organization-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall policy share target accounts
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyShareTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      for (const account of policy.shareTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Share target account ${account} for Network Firewall policy ${policy.name} does not exist in accounts-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Validate rule groups defined in firewall policies
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyRuleGroups(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const allRules = this.getRuleGroups(values);
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      // Validate stateless policies
      this.validatePolicyStatelessRuleGroups(policy, allRules, helpers, errors);
      // Validate stateful policies
      this.validatePolicyStatefulRuleGroups(policy, allRules, helpers, errors);
    }
  }

  /**
   * Validate stateless rule groups defined in policy
   * @param policy
   * @param allRules
   * @param helpers
   * @param errors
   */
  private validatePolicyStatelessRuleGroups(
    policy: NfwFirewallPolicyConfig,
    allRules: Map<string, NfwRuleGroupConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (policy.firewallPolicy.statelessRuleGroups) {
      const statelessPolicyNames = policy.firewallPolicy.statelessRuleGroups.map(group => {
        return group.name;
      });
      const statelessPolicyPriorities = policy.firewallPolicy.statelessRuleGroups.map(ruleGroup => {
        return ruleGroup.priority.toString();
      });

      // Validate there are no duplicates
      if (helpers.hasDuplicates(statelessPolicyNames)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateless rule group references exist. Rule group reference names must be unique. Rule group names in file: ${statelessPolicyNames}`,
        );
      }
      if (helpers.hasDuplicates(statelessPolicyPriorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateless rule group priorities exist. Rule group priorities must be unique. Rule group priorities in file: ${statelessPolicyPriorities}`,
        );
      }

      // Validate priorities are within constraints
      if (!this.validatePriorityValues(statelessPolicyPriorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Invalid priority value in stateless rule group reference. Priority must be a number between 1 and 65535. Priorities in policy: ${statelessPolicyPriorities}`,
        );
      }

      // Validate rule group references
      this.validatePolicyRuleGroupReferences(policy, allRules, statelessPolicyNames, 'STATELESS', errors);
    }
  }

  /**
   * Returns true if priority values are within constraints
   * @param priorities
   * @returns
   */
  private validatePriorityValues(priorities: string[]): boolean {
    let allValid = true;
    for (const priority of priorities) {
      if (parseInt(priority) < 1 || parseInt(priority) > 65535) {
        allValid = false;
      }
    }
    return allValid;
  }

  /**
   * Validate stateful rule groups
   * @param policy
   * @param allRules
   * @param helpers
   * @param errors
   */
  private validatePolicyStatefulRuleGroups(
    policy: NfwFirewallPolicyConfig,
    allRules: Map<string, NfwRuleGroupConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (policy.firewallPolicy.statefulRuleGroups) {
      const statefulPolicyNames = policy.firewallPolicy.statefulRuleGroups.map(group => {
        return group.name;
      });

      // Validate there are no duplicates
      if (helpers.hasDuplicates(statefulPolicyNames)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateful rule group references exist. Rule group reference names must be unique. Rule group names in file: ${statefulPolicyNames}`,
        );
      }

      // Validate STRICT ORDER is set if default actions are defined
      if (
        policy.firewallPolicy.statefulDefaultActions &&
        policy.firewallPolicy.statefulEngineOptions !== 'STRICT_ORDER'
      ) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: STRICT_ORDER must be set for statefulEngineOptions property if definin g statefulDefaultActions`,
        );
      }

      // Validate STRICT_ORDER policies
      this.validatePolicyStatefulStrictOrder(policy, helpers, errors);
      // Validate eulw group references
      this.validatePolicyRuleGroupReferences(policy, allRules, statefulPolicyNames, 'STATEFUL', errors);
    }
  }

  /**
   * Validate stateful STRICT_ORDER policies
   * @param policy
   * @param helpers
   * @param errors
   */
  private validatePolicyStatefulStrictOrder(
    policy: NfwFirewallPolicyConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const priorities: string[] = [];
    const statefulRuleGroups = policy.firewallPolicy.statefulRuleGroups!;
    statefulRuleGroups.forEach(reference => {
      if (reference.priority) {
        priorities.push(reference.priority.toString());
      }
    });

    if (priorities.length > 0) {
      // Validate strict order is defined
      const strictOrder = policy.firewallPolicy.statefulEngineOptions === 'STRICT_ORDER';
      if (!strictOrder) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: STRICT_ORDER must be set for statefulEngineOptions property if defining rule group priority values`,
        );
      }
      // Validate all rule groups have a prioity set
      if (strictOrder && statefulRuleGroups.length > priorities.length) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: priority values must be set for each rule group when defining a STRICT_ORDER policy`,
        );
      }
      // Validate priorities are unique
      if (strictOrder && helpers.hasDuplicates(priorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Duplicate stateful rule group priorities exist. Rule group priorities must be unique. Rule group priorities in file: ${priorities}`,
        );
      }
      // Validate priority values
      if (strictOrder && !this.validatePriorityValues(priorities)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: Invalid priority value in stateful rule group reference. Priority must be a number between 1 and 65535. Priorities in policy: ${priorities}`,
        );
      }
    }
  }

  /**
   * Validate rule group reference attributes
   * @param policy
   * @param allRules
   * @param policyNames
   * @param groupType
   * @param errors
   */
  private validatePolicyRuleGroupReferences(
    policy: NfwFirewallPolicyConfig,
    allRules: Map<string, NfwRuleGroupConfig>,
    policyNames: string[],
    groupType: 'STATEFUL' | 'STATELESS',
    errors: string[],
  ) {
    for (const name of policyNames) {
      const group = allRules.get(name);
      // Validate rule group exists
      if (!group) {
        errors.push(`[Network Firewall policy ${policy.name}]: rule group "${name}" does not exist`);
      }

      if (group) {
        // Validate regions match
        const regionMismatch = policy.regions.some(region => !group.regions.includes(region));
        if (regionMismatch) {
          errors.push(
            `[Network Firewall policy ${policy.name}]: rule group "${name}" is not deployed to one or more region(s) the policy is deployed to. Policy regions: ${policy.regions}; Rule group regions: ${group.regions}`,
          );
        }
        // Validate policy is the correct type
        if (group.type !== groupType) {
          errors.push(
            `[Network Firewall policy ${policy.name}]: rule group reference "${name}" is not configured as a ${groupType} rule group type`,
          );
        }
      }
    }
  }

  /**
   * Validate firewall policy stateless custom actions
   * @param values
   * @param helpers
   * @param errors
   */
  private validatePolicyCustomActions(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const policy of values.centralNetworkServices?.networkFirewall?.policies ?? []) {
      const customActions = policy.firewallPolicy.statelessCustomActions;

      for (const action of [
        ...policy.firewallPolicy.statelessDefaultActions,
        ...policy.firewallPolicy.statelessFragmentDefaultActions,
      ]) {
        if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !customActions) {
          errors.push(
            `[Network Firewall policy ${policy.name}]: stateless custom action "${action}" is invalid. No matching actionName defined under the statelessCustomActions property`,
          );
        }
      }

      // Validate custom actions are all valid
      let allValid = true;
      if (customActions) {
        allValid = this.validateCustomActionNames(policy, customActions, helpers, errors);
      }
      // Validate default actions
      if (customActions && allValid) {
        this.validatePolicyDefaultActions(policy, customActions, errors);
      }
    }
  }

  /**
   * Validate firewall policy stateless default actions
   * @param policy
   * @param customActions
   * @param errors
   */
  private validatePolicyDefaultActions(
    policy: NfwFirewallPolicyConfig,
    customActions: NfwRuleSourceCustomActionConfig[],
    errors: string[],
  ) {
    const actionNames = customActions.map(item => {
      return item.actionName;
    });

    for (const action of [
      ...policy.firewallPolicy.statelessDefaultActions,
      ...policy.firewallPolicy.statelessFragmentDefaultActions,
    ]) {
      if (!NetworkConfigTypes.nfwStatelessRuleActionType.is(action) && !actionNames.includes(action)) {
        errors.push(
          `[Network Firewall policy ${policy.name}]: stateless custom action "${action}" is invalid. No matching actionName defined under the statelessCustomActions property`,
        );
      }
    }
  }

  private validateFirewalls(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate firewall names
    //
    this.validateFirewallNames(values, helpers, errors);
    //
    // Validate firewall deployment targets
    //
    this.validateFirewallDeploymentTargets(values, helpers, errors);
  }

  /**
   * Validate firewall names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateFirewallNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const firewalls = values.centralNetworkServices?.networkFirewall?.firewalls;

    if (firewalls) {
      const firewallNames = firewalls.map(firewall => {
        return firewall.name;
      });

      // Validate there are no duplicate names
      if (helpers.hasDuplicates(firewallNames)) {
        errors.push(
          `Duplicate Network Firewall firewall names exist. Firewall names must be unique. Firewall names in file: ${firewallNames}`,
        );
      }

      // Validate regex
      for (const name of firewallNames) {
        if (!helpers.matchesRegex(name, '^[a-zA-Z0-9-]+$')) {
          errors.push(
            `Network Firewall name "${name}" is invalid. Firewall name must match the pattern "^[a-zA-Z0-9-]+$"`,
          );
        }
      }
    }
  }

  private validateFirewallDeploymentTargets(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const allPolicies = this.getPolicies(values);
    for (const firewall of values.centralNetworkServices?.networkFirewall?.firewalls ?? []) {
      // Validate VPC and subnet configuration
      const vpcValid = this.validateFirewallVpc(values, firewall, helpers, errors);

      // Validate logging configurations
      this.validateFirewallLoggingConfigurations(firewall, helpers, errors);

      if (vpcValid) {
        // Validate VPC target account(s) with policies
        this.validateFirewallTargetAccount(values, firewall, allPolicies, helpers, errors);
      }
    }
  }

  /**
   * Validate the target VPC and subnets for the firewall
   * @param values
   * @param firewall
   * @param helpers
   * @param errors
   * @returns
   */
  private validateFirewallVpc(
    values: NetworkConfig,
    firewall: NfwFirewallConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    // Validate VPC exists
    let allValid = true;
    const vpc = helpers.getVpc(values, firewall.vpc);
    if (!vpc) {
      allValid = false;
      errors.push(`[Network Firewall firewall ${firewall.name}]: VPC "${firewall.vpc}" does not exist`);
    }

    if (vpc) {
      // Validate subnets exist within the VPC
      const subnets: SubnetConfig[] = [];
      firewall.subnets.forEach(subnetItem => {
        const subnet = helpers.getSubnet(vpc, subnetItem);
        if (!subnet) {
          allValid = false;
          errors.push(
            `[Network Firewall firewall ${firewall.name}]: subnet "${subnetItem}" does not exist in VPC "${vpc.name}"`,
          );
        } else {
          subnets.push(subnet);
        }
      });

      // Validate there are no duplicate subnet AZs/names
      const azs: string[] = [];
      const subnetNames: string[] = [];
      subnets.forEach(item => {
        azs.push(item.availabilityZone);
        subnetNames.push(item.name);
      });
      if (helpers.hasDuplicates(azs)) {
        allValid = false;
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: subnets with duplicate AZs targeted. Subnet AZs must be unique. Subnet AZs in file: ${azs}`,
        );
      }
      if (helpers.hasDuplicates(subnetNames)) {
        allValid = false;
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: duplicate subnets targeted. Target subnets must be unique. Subnets in file: ${subnetNames}`,
        );
      }
    }
    return allValid;
  }

  /**
   * Validate if there are duplicate firewall logging configuration types
   * @param firewall
   * @param helpers
   * @param errors
   */
  private validateFirewallLoggingConfigurations(
    firewall: NfwFirewallConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (firewall.loggingConfiguration) {
      // Validate there are no duplicates
      const loggingTypes: string[] = [];
      firewall.loggingConfiguration.forEach(config => loggingTypes.push(config.type));

      if (helpers.hasDuplicates(loggingTypes)) {
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: duplicate logging configuration types. Each logging type must be unique. Logging types in file: ${loggingTypes}`,
        );
      }
    }
  }

  /**
   * Validate firewall target account against firewall policy shares
   * @param values
   * @param firewall
   * @param allPolicies
   * @param helpers
   * @param errors
   */
  private validateFirewallTargetAccount(
    values: NetworkConfig,
    firewall: NfwFirewallConfig,
    allPolicies: Map<string, NfwFirewallPolicyConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Validate policy exists
    const firewallPolicy = allPolicies.get(firewall.firewallPolicy);
    if (!firewallPolicy) {
      errors.push(
        `[Network Firewall firewall ${firewall.name}]: firewall policy "${firewall.firewallPolicy}" does not exist`,
      );
    } else {
      // Validate RAM shares exist in desired accounts
      const vpc = helpers.getVpc(values, firewall.vpc)!;
      const vpcAccountNames = helpers.getVpcAccountNames(vpc);
      const policyAccountNames = firewallPolicy.shareTargets
        ? [
            ...helpers.getAccountNamesFromTarget(firewallPolicy.shareTargets),
            values.centralNetworkServices!.delegatedAdminAccount,
          ]
        : [values.centralNetworkServices!.delegatedAdminAccount];

      if (vpcAccountNames.some(account => !policyAccountNames.includes(account))) {
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: firewall policy "${firewall.firewallPolicy}" is not shared with one or more target OU(s)/account(s) for VPC "${vpc.name}"`,
        );
      }
      // Validate regions match
      if (!firewallPolicy.regions.includes(vpc.region)) {
        errors.push(
          `[Network Firewall firewall ${firewall.name}]: firewall policy "${firewall.firewallPolicy}" target region(s) do not match region for VPC "${vpc.name}." Policy regions: ${firewallPolicy.regions}; VPC region: ${vpc.region}`,
        );
      }
    }
  }

  /**
   * Return all policies definied in the configuration
   * @param values
   * @returns
   */
  private getPolicies(values: NetworkConfig): Map<string, NfwFirewallPolicyConfig> {
    const policies = new Map<string, NfwFirewallPolicyConfig>();
    values.centralNetworkServices?.networkFirewall?.policies.forEach(policy => policies.set(policy.name, policy));
    return policies;
  }
}

/**
 * Class to validate ipam
 */
class IpamValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate IPAM names are unique
    //
    this.validateIpamNames(values, helpers, errors);
    //
    // Validate IPAM regions are unique
    //
    this.validateIpamRegions(values, helpers, errors);
    //
    // Validate Ipam deployment Ou names
    this.validateIpamPoolShareTargetOUs(values, helpers, errors);
    //
    // Validate Ipam deployment account names
    //
    this.validateIpamPoolShareTargetAccounts(values, helpers, errors);
    //
    // Validate IPAM pools
    //
    this.validateIpamPoolConfigurations(values, helpers, errors);
  }

  /**
   * Method to validate uniqueness of IPAM names
   *
   * @param values
   * @param helpers
   * @param helpers
   */
  private validateIpamNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ipams = values.centralNetworkServices?.ipams;
    if (ipams) {
      const ipamNames = ipams.map(ipam => {
        return ipam.name;
      });

      // Validate IPAM names are unique
      if (helpers.hasDuplicates(ipamNames)) {
        errors.push(`Duplicate IPAM names exist. IPAM names must be unique. IPAM names in file: ${ipamNames}`);
      }

      // Validate scope and pool names
      for (const ipam of ipams) {
        this.validateIpamScopeNames(ipam, helpers, errors);
        this.validateIpamPoolNames(ipam, helpers, errors);
      }
    }
  }

  /**
   * Validate uniqueness of IPAM regions
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamRegions(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const ipams = values.centralNetworkServices?.ipams;
    if (ipams) {
      const ipamRegions = ipams.map(ipam => {
        return ipam.region;
      });

      if (helpers.hasDuplicates(ipamRegions)) {
        errors.push(
          `Duplicate IPAM regions exist. You may only deploy one IPAM per region. IPAM regions in file: ${ipamRegions}`,
        );
      }
    }
  }

  /**
   * Validate uniqueness of IPAM scope names
   * @param ipam
   * @param helpers
   * @param errors
   */
  private validateIpamScopeNames(ipam: IpamConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    if (ipam.scopes) {
      const scopeNames = ipam.scopes.map(scope => {
        return scope.name;
      });

      if (helpers.hasDuplicates(scopeNames)) {
        errors.push(
          `[IPAM ${ipam.name}]: duplicate IPAM scope names exist. IPAM scope names must be unique. IPAM scope names for this IPAM: ${scopeNames}`,
        );
      }
    }
  }

  /**
   * Validate uniqueness of IPAM pool names
   * @param ipam
   * @param helpers
   * @param errors
   */
  private validateIpamPoolNames(ipam: IpamConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    if (ipam.pools) {
      const poolNames = ipam.pools.map(pool => {
        return pool.name;
      });

      if (helpers.hasDuplicates(poolNames)) {
        errors.push(
          `[IPAM ${ipam.name}]: duplicate IPAM pool names exist. IPAM pool names must be unique. IPAM pool names for this IPAM: ${poolNames}`,
        );
      }
    }
  }

  /**
   * Function to validate existence of IPAM pool deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamPoolShareTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const ou of pool.shareTargets?.organizationalUnits ?? []) {
          if (!helpers.ouExists(ou)) {
            errors.push(
              `Share target OU ${ou} for IPAM pool ${pool.name} does not exist in organization-config.yaml file`,
            );
          }
        }
      }
    }
  }

  /**
   * Function to validate existence of IPAM pool deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamPoolShareTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const account of pool.shareTargets?.accounts ?? []) {
          if (!helpers.accountExists(account)) {
            errors.push(
              `Share target account ${account} for IPAM pool ${pool.name} does not exist in accounts-config.yaml file`,
            );
          }
        }
      }
    }
  }

  /**
   * Validate IPAM pool configurations
   * @param values
   * @param helpers
   * @param errors
   */
  private validateIpamPoolConfigurations(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      const allPools = this.getPools(ipam);
      let allValid = true;

      // Validate provisioned CIDRs
      for (const pool of ipam.pools ?? []) {
        const validCidrs = this.validateProvisionedCidrs(ipam, pool, helpers, errors);
        if (!validCidrs) {
          allValid = false;
        }
      }

      // Validate nested pools
      if (allValid) {
        this.validateNestedPools(ipam, allPools, errors);
      }
    }
  }

  /**
   * Get IPAM pools configured for a given IPAM
   * @param ipam
   * @returns
   */
  private getPools(ipam: IpamConfig): Map<string, IpamPoolConfig> {
    const poolMap = new Map<string, IpamPoolConfig>();
    for (const pool of ipam.pools ?? []) {
      poolMap.set(pool.name, pool);
    }
    return poolMap;
  }

  /**
   * Validate provisioned CIDRs are in CIDR format
   * @param ipam
   * @param pool
   * @param helpers
   * @param errors
   */
  private validateProvisionedCidrs(
    ipam: IpamConfig,
    pool: IpamPoolConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ): boolean {
    for (const cidr of pool.provisionedCidrs ?? []) {
      if (!helpers.isValidIpv4Cidr(cidr)) {
        errors.push(
          `[IPAM ${ipam.name} pool ${pool.name}]: provisioned CIDR ${cidr} is invalid. Please enter a valid CIDR`,
        );
        return false;
      }
    }
    return true;
  }

  /**
   * Validate nested IPAM pools
   * @param ipam
   * @param allPools
   * @param errors
   */
  private validateNestedPools(ipam: IpamConfig, allPools: Map<string, IpamPoolConfig>, errors: string[]) {
    for (const pool of ipam.pools ?? []) {
      if (pool.sourceIpamPool) {
        // Validate that the base pool exists
        const basePool = allPools.get(pool.sourceIpamPool);
        if (!basePool) {
          errors.push(`[IPAM ${ipam.name} pool ${pool.name}] source IPAM pool ${pool.sourceIpamPool} does not exist`);
        }

        // Validate that the provisioned CIDRs are contained within the base pool
        if (basePool) {
          this.validateNestedPoolCidrs(ipam, basePool, pool, errors);
        }
      }
    }
  }

  /**
   * Validate CIDRs within nested pools are contained in the base pool
   * @param ipam
   * @param basePool
   * @param nestedPool
   * @param errors
   */
  private validateNestedPoolCidrs(
    ipam: IpamConfig,
    basePool: IpamPoolConfig,
    nestedPool: IpamPoolConfig,
    errors: string[],
  ) {
    const validCidrs: string[] = [];
    if (nestedPool.provisionedCidrs) {
      for (const baseRangeString of basePool.provisionedCidrs ?? []) {
        const baseRange = IPv4CidrRange.fromCidr(baseRangeString);

        for (const nestedRangeString of nestedPool.provisionedCidrs ?? []) {
          const nestedRange = IPv4CidrRange.fromCidr(nestedRangeString);

          if (nestedRange.inside(baseRange) || nestedRange.isEquals(baseRange)) {
            validCidrs.push(nestedRangeString);
          }
        }
      }

      if (validCidrs.length !== nestedPool.provisionedCidrs.length) {
        errors.push(
          `[IPAM ${ipam.name} pool ${nestedPool.name}] nested pool contains provisioned CIDRs that are not within source pool ${basePool.name}. Source pool: ${basePool.provisionedCidrs} Nested pool: ${nestedPool.provisionedCidrs}`,
        );
      }
    }
  }
}

/**
 * Class to validate Vpcs
 */
class VpcValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate VPC names are unique
    this.validateVpcNames(values, helpers, errors);
    //
    // Validate VPC template deployment target ou names
    this.validateVpcTemplatesDeploymentTargetOUs(values, helpers, errors);
    //
    // Validate Vpc templates deployment account names
    //
    this.validateVpcTemplatesDeploymentTargetAccounts(values, helpers, errors);
    //
    // Validate vpc account name
    //
    this.validateVpcAccountName(values, helpers, errors);
    //
    // Validate vpc tgw name
    //
    this.validateVpcTgwAccountName(values, helpers, errors);
    //
    // Validate transit gateway names in VPC tgw attachments
    //
    this.validateVpcTgwName(values, errors);
    //
    // Validate VPC configurations
    //
    this.validateVpcConfiguration(values, errors);
    //
    // Validate VPC peering configurations
    //
    this.validateVpcPeeringConfiguration(values, errors);
  }

  /**
   * Validate uniqueness of VPC names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateVpcNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
    const vpcNames = vpcs.map(vpc => {
      return vpc.name;
    });

    // Validate no VPC names are duplicated
    if (helpers.hasDuplicates(vpcNames)) {
      errors.push(`Duplicate VPC/VPC template names exist. VPC names must be unique. VPC names in file: ${vpcNames}`);
    }
  }

  /**
   * Function to validate VPC template deployment target ou names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateVpcTemplatesDeploymentTargetOUs(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const vpc of values.vpcTemplates ?? []) {
      for (const ou of vpc.deploymentTargets?.organizationalUnits ?? []) {
        if (!helpers.ouExists(ou)) {
          errors.push(
            `Deployment target OU ${ou} for VPC template ${vpc.name} does not exist in organization-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of VPC deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateVpcTemplatesDeploymentTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const vpc of values.vpcTemplates ?? []) {
      for (const account of vpc.deploymentTargets?.accounts ?? []) {
        if (!helpers.accountExists(account)) {
          errors.push(
            `Deployment target account ${account} for VPC template ${vpc.name} does not exist in accounts-config.yaml file`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of vpc account name
   * Make sure target account is part of account config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateVpcAccountName(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const vpcItem of values.vpcs ?? []) {
      if (!helpers.accountExists(vpcItem.account)) {
        errors.push(
          `VPC "${vpcItem.name}" account name "${vpcItem.account}" does not exist in accounts-config.yaml file`,
        );
      }
    }
  }

  /**
   * Function to validate existence of vpc transit gateway account name
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateVpcTgwAccountName(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const vpcItem of values.vpcs ?? []) {
      for (const tgwAttachment of vpcItem.transitGatewayAttachments ?? []) {
        if (!helpers.accountExists(tgwAttachment.transitGateway.account)) {
          errors.push(
            `VPC "${vpcItem.name}" TGW attachment "${tgwAttachment.transitGateway.name}" account name "${tgwAttachment.transitGateway.account}" does not exist in accounts-config.yaml file`,
          );
        }
      }
    }
  }
  /**
   * Function to validate existence of vpc transit gateway names
   * Make sure that transit gateway is present in network-config file
   * @param values
   */
  private validateVpcTgwName(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    const transitGatewayNames: string[] = [];
    for (const transitGateway of values.transitGateways) {
      transitGatewayNames.push(transitGateway.name);
    }

    for (const vpcItem of values.vpcs ?? []) {
      for (const tgwAttachment of vpcItem.transitGatewayAttachments ?? []) {
        if (transitGatewayNames.indexOf(tgwAttachment.transitGateway.name) === -1) {
          errors.push(
            `Vpc "${vpcItem.name}" tgw attachment "${tgwAttachment.transitGateway.name}" name "${tgwAttachment.transitGateway.name}" does not exists in network-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Validate route entries have a valid destination configured
   * @param routeTableEntryItem
   * @param routeTableName
   * @param vpcName
   */
  private validateRouteEntryDestination(
    routeTableEntryItem: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig>,
    routeTableName: string,
    vpcName: string,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    if (routeTableEntryItem.destinationPrefixList) {
      // Check if a CIDR destination is also defined
      if (routeTableEntryItem.destination) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} using destination and destinationPrefixList. Please choose only one destination type`,
        );
      }

      // Throw error if network firewall or GWLB are the target
      if (['networkFirewall', 'gatewayLoadBalancerEndpoint'].includes(routeTableEntryItem.type!)) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} with type ${routeTableEntryItem.type} does not support destinationPrefixList`,
        );
      }

      // Throw error if prefix list doesn't exist
      if (!values.prefixLists?.find(item => item.name === routeTableEntryItem.destinationPrefixList)) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} destinationPrefixList ${routeTableEntryItem.destinationPrefixList} does not exist`,
        );
      }
    } else {
      if (!routeTableEntryItem.destination) {
        errors.push(
          `[Route table ${routeTableName} for VPC ${vpcName}]: route entry ${routeTableEntryItem.name} does not have a destination defined`,
        );
      }
    }
  }

  /**
   * Validate IGW routes are associated with a VPC with an IGW attached
   * @param routeTableEntryItem
   * @param routeTableName
   * @param vpcItem
   */
  private validateIgwRouteEntry(
    routeTableEntryItem: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig>,
    routeTableName: string,
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    errors: string[],
  ) {
    if (!vpcItem.internetGateway) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} is targeting an IGW, but no IGW is attached to the VPC`,
      );
    }
  }

  /**
   * Validate VGW routes are associated with a VPC with an Virtual Private Gateway attached
   * @param routeTableEntryItem
   * @param routeTableName
   * @param vpcItem
   */
  private validateVgwRouteEntry(
    routeTableEntryItem: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig>,
    routeTableName: string,
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    errors: string[],
  ) {
    if (!vpcItem.virtualPrivateGateway) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} is targeting an VGW, but now VGW is attached to the VPC`,
      );
    }
  }

  /**
   * Validate route table entries have a valid target configured
   * @param routeTableEntryItem
   * @param routeTableName
   * @param vpcItem
   * @param values
   */
  private validateRouteEntryTarget(
    routeTableEntryItem: t.TypeOf<typeof NetworkConfigTypes.routeTableEntryConfig>,
    routeTableName: string,
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    const gwlbs = values.centralNetworkServices?.gatewayLoadBalancers;
    const networkFirewalls = values.centralNetworkServices?.networkFirewall?.firewalls;
    const tgws = values.transitGateways;
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
    const vpcPeers = values.vpcPeering;

    // Throw error if no target defined
    if (!routeTableEntryItem.target) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} of type ${routeTableEntryItem.type} must include a target`,
      );
    }

    // Throw error if GWLB endpoint doesn't exist
    if (
      routeTableEntryItem.type === 'gatewayLoadBalancerEndpoint' &&
      !gwlbs?.find(item => item.endpoints.find(endpoint => endpoint.name === routeTableEntryItem.target))
    ) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }

    // Throw error if network firewall endpoint doesn't exist
    if (
      routeTableEntryItem.type === 'networkFirewall' &&
      !networkFirewalls?.find(item => item.name === routeTableEntryItem.target)
    ) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }

    // Throw error if network firewall target AZ doesn't exist
    if (routeTableEntryItem.type === 'networkFirewall' && !routeTableEntryItem.targetAvailabilityZone) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} with type networkFirewall must include targetAvailabilityZone`,
      );
    }

    // Throw error if NAT gateway doesn't exist
    if (
      routeTableEntryItem.type === 'natGateway' &&
      !vpcs.find(item => item.natGateways?.find(nat => nat.name === routeTableEntryItem.target))
    ) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }

    // Throw error if transit gateway doesn't exist
    if (routeTableEntryItem.type === 'transitGateway' && !tgws.find(item => item.name === routeTableEntryItem.target)) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }

    // Throw error if VPC peering doesn't exist
    if (
      routeTableEntryItem.type === 'vpcPeering' &&
      !vpcPeers?.find(item => item.name === routeTableEntryItem.target)
    ) {
      errors.push(
        `[Route table ${routeTableName} for VPC ${vpcItem.name}]: route entry ${routeTableEntryItem.name} target ${routeTableEntryItem.target} does not exist`,
      );
    }
  }

  /**
   * Validate route table entries
   * @param routeTableItem
   */
  private validateRouteTableEntries(
    routeTableItem: t.TypeOf<typeof NetworkConfigTypes.routeTableConfig>,
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    for (const routeTableEntryItem of routeTableItem.routes ?? []) {
      // Validate destination exists
      if (routeTableEntryItem.type && routeTableEntryItem.type !== 'gatewayEndpoint') {
        this.validateRouteEntryDestination(routeTableEntryItem, routeTableItem.name, vpcItem.name, values, errors);
      }

      // Validate IGW route
      if (routeTableEntryItem.type && routeTableEntryItem.type === 'internetGateway') {
        this.validateIgwRouteEntry(routeTableEntryItem, routeTableItem.name, vpcItem, errors);
      }

      // Validate VGW route
      if (routeTableEntryItem.type && routeTableEntryItem.type === 'virtualPrivateGateway') {
        this.validateVgwRouteEntry(routeTableEntryItem, routeTableItem.name, vpcItem, errors);
      }

      // Validate target exists
      if (
        routeTableEntryItem.type &&
        ['gatewayLoadBalancerEndpoint', 'natGateway', 'networkFirewall', 'transitGateway', 'vpcPeering'].includes(
          routeTableEntryItem.type,
        )
      ) {
        this.validateRouteEntryTarget(routeTableEntryItem, routeTableItem.name, vpcItem, values, errors);
      }
    }
  }

  private validateIpamAllocations(
    vpcItem: t.TypeOf<typeof NetworkConfigTypes.vpcConfig> | t.TypeOf<typeof NetworkConfigTypes.vpcTemplatesConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    const ipams = values.centralNetworkServices?.ipams;
    // Check if targeted IPAM exists
    for (const alloc of vpcItem.ipamAllocations ?? []) {
      if (!ipams?.find(ipam => ipam.pools?.find(pool => pool.name === alloc.ipamPoolName))) {
        errors.push(`[VPC ${vpcItem.name}]: target IPAM pool ${alloc.ipamPoolName} is not defined`);
      }
    }
    for (const subnet of vpcItem.subnets ?? []) {
      // Check if allocation is created for VPC
      if (
        subnet.ipamAllocation &&
        !vpcItem.ipamAllocations?.find(alloc => alloc.ipamPoolName === subnet.ipamAllocation!.ipamPoolName)
      ) {
        errors.push(
          `[VPC ${vpcItem.name} subnet ${subnet.name}]: target IPAM pool ${subnet.ipamAllocation.ipamPoolName} is not a source pool of the VPC`,
        );
      }
      // Check if targeted IPAM pool exists
      if (
        subnet.ipamAllocation &&
        !ipams?.find(ipam => ipam.pools?.find(pool => pool.name === subnet.ipamAllocation!.ipamPoolName))
      ) {
        errors.push(
          `[VPC ${vpcItem.name} subnet ${subnet.name}]: target IPAM pool ${subnet.ipamAllocation.ipamPoolName} is not defined`,
        );
      }
    }
  }

  /**
   * Function to validate conditional dependencies for VPC configurations.
   * @param values
   */
  private validateVpcConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])] ?? [];
    vpcs.forEach(vpcItem => {
      vpcItem.routeTables?.forEach(routeTableItem => {
        // Throw error if gateway association exists but no internet gateway
        if (routeTableItem.gatewayAssociation === 'internetGateway' && !vpcItem.internetGateway) {
          errors.push(
            `[Route table ${routeTableItem.name} for VPC ${vpcItem.name}]: attempting to configure a gateway association with no IGW attached to the VPC!`,
          );
        }
        if (routeTableItem.gatewayAssociation === 'virtualPrivateGateway' && !vpcItem.virtualPrivateGateway) {
          errors.push(
            `[Route table ${routeTableItem.name} for VPC ${vpcItem.name}]: attempting to configure a gateway association with no VGW attached to the VPC!`,
          );
        }

        // Validate route entries
        this.validateRouteTableEntries(routeTableItem, vpcItem, values, errors);
      });
      // Validate the VPC doesn't have a static CIDR and IPAM defined
      if (vpcItem.cidrs && vpcItem.ipamAllocations) {
        errors.push(`[VPC ${vpcItem.name}]: Both a CIDR and IPAM allocation are defined. Please choose only one`);
      }
      // Validate the VPC doesn't have a static CIDR and IPAM defined
      if (!vpcItem.cidrs && !vpcItem.ipamAllocations) {
        errors.push(`[VPC ${vpcItem.name}]: Neither a CIDR or IPAM allocation are defined. Please define one property`);
      }

      // Validate IPAM allocations
      this.validateIpamAllocations(vpcItem, values, errors);
    });
  }

  private validateVpcPeeringConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    const vpcs = values.vpcs;
    for (const peering of values.vpcPeering ?? []) {
      // Ensure exactly two VPCs are defined
      if (peering.vpcs.length < 2 || peering.vpcs.length > 2) {
        errors.push(
          `[VPC peering connection ${peering.name}]: exactly two VPCs must be defined for a VPC peering connection`,
        );
      }

      // Ensure VPCs exist and more than one is not defined
      for (const vpc of peering.vpcs) {
        if (!vpcs.find(item => item.name === vpc)) {
          errors.push(`[VPC peering connection ${peering.name}]: VPC ${vpc} does not exist`);
        }
        if (vpcs.filter(item => item.name === vpc).length > 1) {
          errors.push(`[VPC peering connection ${peering.name}]: more than one VPC named ${vpc}`);
        }
      }
    }
  }
}

/**
 * Class to validate Gateway LoadBalancers
 */
class GatewayLoadBalancersValidator {
  constructor(values: NetworkConfig, configDir: string, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate gateway load balancers deployment account names
    //
    this.validateGwlbDeploymentTargetAccounts(values, helpers, errors);

    //
    // Validate GWLB configuration
    //
    this.validateGwlbConfiguration(values, configDir, helpers, errors);
  }

  /**
   * Function to validate existence of GWLB deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   * @param helpers
   * @param errors
   */
  private validateGwlbDeploymentTargetAccounts(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const gwlb of values.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      for (const endpoint of gwlb.endpoints ?? []) {
        if (!helpers.accountExists(endpoint.account)) {
          errors.push(
            `Deployment target account ${endpoint.account} for Gateway Load Balancer ${gwlb.name} endpoint ${endpoint.name} does not exist in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Validate Gateway Load Balancer endpoint configuration
   * @param gwlb
   * @param values
   */
  private validateGwlbEndpoints(
    gwlb: t.TypeOf<typeof NetworkConfigTypes.gwlbConfig>,
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const gwlbEndpoint of gwlb.endpoints ?? []) {
      const vpc = helpers.getVpc(values, gwlbEndpoint.vpc);
      if (!vpc) {
        errors.push(
          `[Gateway Load Balancer ${gwlb.name} endpoint ${gwlbEndpoint.name}]: VPC ${gwlbEndpoint.vpc} does not exist`,
        );
      }

      // Validate subnet
      if (vpc && !helpers.getSubnet(vpc, gwlbEndpoint.subnet)) {
        errors.push(
          `[Gateway Load Balancer ${gwlb.name} endpoint ${gwlbEndpoint.name}]: subnet ${gwlbEndpoint.subnet} does not exist in VPC ${vpc.name}`,
        );
      }
    }
  }

  /**
   * Validate Gateway Load Balancer configuration
   * @param values
   */
  private validateGwlbConfiguration(
    values: NetworkConfig,
    configDir: string,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    for (const gwlb of values.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      const vpc = helpers.getVpc(values, gwlb.vpc);
      if (!vpc) {
        errors.push(`[Gateway Load Balancer ${gwlb.name}]: VPC ${gwlb.vpc} does not exist`);
      }

      // Validate subnets
      if (vpc) {
        this.validateGwlbSubnets(gwlb, vpc, helpers, errors);
      }
      // Validate endpoints
      this.validateGwlbEndpoints(gwlb, values, helpers, errors);
      // Validate target groups
      if (gwlb.targetGroup) {
        this.validateGwlbTargetGroup(gwlb, configDir, errors);
      }
    }
  }

  /**
   * Validate GWLB subnets
   * @param gwlb
   * @param vpc
   * @param helpers
   * @param errors
   */
  private validateGwlbSubnets(
    gwlb: GwlbConfig,
    vpc: VpcConfig | VpcTemplatesConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Validate subnets exist in VPC
    const validSubnets: SubnetConfig[] = [];
    for (const gwlbSubnet of gwlb.subnets ?? []) {
      const subnet = helpers.getSubnet(vpc, gwlbSubnet);
      if (!subnet) {
        errors.push(`[Gateway Load Balancer ${gwlb.name}]: subnet ${gwlbSubnet} does not exist in VPC ${vpc.name}`);
      }
      if (subnet) {
        validSubnets.push(subnet);
      }
    }

    // Validate subnets are in different AZs
    if (validSubnets.length === gwlb.subnets.length) {
      const azs = validSubnets.map(item => {
        return item.availabilityZone;
      });

      if (helpers.hasDuplicates(azs)) {
        errors.push(
          `[Gateway Load Balancer ${gwlb.name}]: targeted subnets reside in duplicate availability zones. Please target unique AZs. AZs targeted: ${azs}`,
        );
      }
    }
  }

  /**
   * Validate Gateway Load Balancer target group
   * @param gwlb
   * @param configDir
   * @param errors
   */
  private validateGwlbTargetGroup(
    gwlb: t.TypeOf<typeof NetworkConfigTypes.gwlbConfig>,
    configDir: string,
    errors: string[],
  ) {
    // Pull values from customizations config
    const customizationsConfig = CustomizationsConfig.load(configDir);
    const firewallInstances = customizationsConfig.firewalls?.instances;
    const autoscalingGroups = customizationsConfig.firewalls?.autoscalingGroups;
    const targetGroups = customizationsConfig.firewalls?.targetGroups;

    if (!targetGroups) {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name}]: target group ${gwlb.targetGroup} not found in customizations-config.yaml`,
      );
    }

    const targetGroup = targetGroups!.find(group => group.name === gwlb.targetGroup);

    if (!targetGroup) {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name}]: target group ${gwlb.targetGroup} not found in customizations-config.yaml`,
      );
    }

    if (targetGroup) {
      this.validateTargetGroupProps(gwlb, targetGroup, errors);
    }

    if (targetGroup && targetGroup.targets) {
      this.validateTargetGroupTargets(gwlb, targetGroup, firewallInstances!, errors);
    }

    if (targetGroup && !targetGroup.targets) {
      this.validateTargetGroupAsg(gwlb, targetGroup, autoscalingGroups!, errors);
    }
  }

  /**
   * Validate target group properties
   * @param gwlb
   * @param targetGroup
   * @param errors
   */
  private validateTargetGroupProps(
    gwlb: t.TypeOf<typeof NetworkConfigTypes.gwlbConfig>,
    targetGroup: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupItem>,
    errors: string[],
  ) {
    if (targetGroup.port !== 6081) {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name} target group ${targetGroup.name}]: only port 6081 is supported.`,
      );
    }
    if (targetGroup.protocol !== 'GENEVE') {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name} target group ${targetGroup.name}]: only GENEVE protocol is supported.`,
      );
    }
  }

  /**
   * Validate firewall instances and GWLB reside in the same VPC
   * @param gwlb
   * @param targetGroup
   * @param firewallInstances
   * @param errors
   */
  private validateTargetGroupTargets(
    gwlb: t.TypeOf<typeof NetworkConfigTypes.gwlbConfig>,
    targetGroup: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupItem>,
    firewallInstances: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallInstanceConfig>[],
    errors: string[],
  ) {
    // Instance VPCs are validated in customizations config. We just need to grab the first element
    const firewall = firewallInstances.find(instance => instance.name === targetGroup.targets![0]);

    if (!firewall) {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name} target group ${targetGroup.name}]: firewall instance ${
          targetGroup.targets![0]
        } not found in customizations-config.yaml`,
      );
    }

    if (firewall && firewall.vpc !== gwlb.vpc) {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name} target group ${targetGroup.name}]: targets do not exist in the same VPC as the load balancer`,
      );
    }
  }

  /**
   * Validate ASG and GWLB reside in the same VPC
   * @param gwlb
   * @param targetGroup
   * @param autoscalingGroups
   * @param errors
   */
  private validateTargetGroupAsg(
    gwlb: t.TypeOf<typeof NetworkConfigTypes.gwlbConfig>,
    targetGroup: t.TypeOf<typeof CustomizationsConfigTypes.targetGroupItem>,
    autoscalingGroups: t.TypeOf<typeof CustomizationsConfigTypes.ec2FirewallAutoScalingGroupConfig>[],
    errors: string[],
  ) {
    const asg = autoscalingGroups.find(
      group => group.autoscaling.targetGroups && group.autoscaling.targetGroups[0] === targetGroup.name,
    );

    if (!asg) {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name} target group ${targetGroup.name}]: firewall ASG for target group not found in customizations-config.yaml`,
      );
    }

    if (asg && asg.vpc !== gwlb.vpc) {
      errors.push(
        `[Gateway Load Balancer ${gwlb.name} target group ${targetGroup.name}]: targets do not exist in the same VPC as the load balancer`,
      );
    }
  }
}

/**
 * Class to validate Customer Gateways
 */
class CustomerGatewaysValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate gateway load balancers deployment account names
    //
    this.validateCgwTargetAccounts(values, helpers, errors);
    //
    // Validate CGW configuration
    //
    this.validateCgwConfiguration(values, helpers, errors);
  }

  private validateCgwTargetAccounts(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const cgw of values.customerGateways ?? []) {
      if (!helpers.accountExists(cgw.account)) {
        errors.push(
          `Target account ${cgw.account} for customer gateway ${cgw.name} does not exist in accounts-config.yaml file`,
        );
      }
    }
  }

  /**
   * Validate customer gateways and VPN confections
   * @param values
   */
  private validateCgwConfiguration(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    for (const cgw of values.customerGateways ?? []) {
      if (cgw.asn < 1 || cgw.asn > 2147483647) {
        errors.push(`[Customer Gateway ${cgw.name}]: ASN ${cgw.asn} out of range 1-2147483647`);
      }

      // Validate VPN configurations
      this.validateVpnConfiguration(cgw, values, helpers, errors);
    }
  }

  /**
   * Validate site-to-site VPN connections
   * @param cgw
   * @param values
   * @param helpers
   * @param errors
   */
  private validateVpnConfiguration(
    cgw: CustomerGatewayConfig,
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    cgw.vpnConnections?.forEach(vpn => {
      // Validate if VPC termination and Transit Gateway is provided in the same VPN Config
      if (vpn.vpc && vpn.transitGateway) {
        errors.push(
          `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: Both TGW and VPC provided in the same VPN Configuration`,
        );
      }

      // Validate that either a VPC or Transit Gateway is provided in the VPN Config
      if (!vpn.vpc && !vpn.transitGateway) {
        errors.push(
          `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: Neither a valid TGW or VPC provided in the config`,
        );
      }

      // Validate length of tunnel specifications
      if (vpn.tunnelSpecifications) {
        if (vpn.tunnelSpecifications.length < 2 || vpn.tunnelSpecifications.length > 2) {
          errors.push(
            `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: tunnel specifications must have exactly 2 definitions`,
          );
        }
      }

      // Handle TGW and VGW Logic respectively
      if (vpn.vpc) {
        this.validateVirtualPrivateGatewayVpnConfiguration(cgw, vpn, values, helpers, errors);
      } else if (vpn.transitGateway) {
        this.validateTransitGatewayVpnConfiguration(cgw, vpn, values, errors);
      }
    });
  }

  /**
   * Validate site-to-site VPN connections for Virtual Private Gateways
   * @param cgw
   * @param vpn
   * @param values
   * @param helpers
   * @param errors
   */
  private validateVirtualPrivateGatewayVpnConfiguration(
    cgw: CustomerGatewayConfig,
    vpn: VpnConnectionConfig,
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const vpc = helpers.getVpc(values, vpn.vpc!);
    // Validate that the VPC referenced in the VPN Connection exists.
    if (!vpc) {
      errors.push(`[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VPC ${vpn.vpc} referenced doesn't exist`);
    }

    // Validate that the VPC referenced has a VGW attached
    if (vpc && !vpc.virtualPrivateGateway) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VPC ${vpn.vpc} referenced doesn't have an attached Virtual Private Gateway`,
      );
    }

    // Validate VPC account and CGW account match
    if (vpc && NetworkConfigTypes.vpcConfig.is(vpc) && vpc.account !== cgw.account) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VPC ${vpn.vpc} referenced does not reside in the same account as the CGW`,
      );
    }
    if (
      vpc &&
      NetworkConfigTypes.vpcTemplatesConfig.is(vpc) &&
      !helpers.getVpcAccountNames(vpc).includes(cgw.account)
    ) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VPC ${vpn.vpc} referenced does not reside in the same account as the CGW`,
      );
    }

    // Validate that TGW route table propagations or associations aren't configured for a VPN Connection terminating at a VPC
    if (vpn.routeTableAssociations || vpn.routeTablePropagations) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VPC ${vpn.vpc} does not support Transit Gateway Route Table Associations or Propagations`,
      );
    }
  }

  /**
   * Validate site-to-site VPN connections for Transit Gateways
   * @param cgw
   * @param vpn
   * @param values
   * @param errors
   */
  private validateTransitGatewayVpnConfiguration(
    cgw: t.TypeOf<typeof NetworkConfigTypes.customerGatewayConfig>,
    vpn: t.TypeOf<typeof NetworkConfigTypes.vpnConnectionConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    const tgw = values.transitGateways.find(item => item.name === vpn.transitGateway);

    if (!tgw) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: Transit Gateway ${vpn.transitGateway} does not exist`,
      );
    }

    // Validate TGW account matches
    if (tgw && tgw.account !== cgw.account) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: VPN connection must reside in the same account as Transit Gateway ${tgw.name}`,
      );
    }

    // Validate associations/propagations
    if (tgw) {
      const routeTableArray: string[] = [];
      if (vpn.routeTableAssociations) {
        routeTableArray.push(...vpn.routeTableAssociations);
      }
      if (vpn.routeTablePropagations) {
        routeTableArray.push(...vpn.routeTablePropagations);
      }
      const tgwRouteTableSet = new Set(routeTableArray);

      for (const routeTable of tgwRouteTableSet ?? []) {
        if (!tgw.routeTables.find(item => item.name === routeTable)) {
          errors.push(
            `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: route table ${routeTable} does not exist on Transit Gateway ${tgw.name}`,
          );
        }
      }
    }
  }
}

/**
 * Class to validate direct connect gateways
 */
class DirectConnectGatewaysValidator {
  constructor(values: NetworkConfig, errors: string[]) {
    //
    // Validate DX gateway configurations
    //
    this.validateDxConfiguration(values, errors);
  }

  /**
   * Function to validate peer IP addresses for virtual interfaces.
   * @param dxgw
   * @param vif
   */
  private validateDxVirtualInterfaceAddresses(
    dxgw: t.TypeOf<typeof NetworkConfigTypes.dxGatewayConfig>,
    vif: t.TypeOf<typeof NetworkConfigTypes.dxVirtualInterfaceConfig>,
    errors: string[],
  ) {
    // Catch error if one peer IP is defined and not the other
    if (vif.amazonAddress && !vif.customerAddress) {
      errors.push(
        `[Direct Connect Gateway ${dxgw.name}]: Amazon peer IP defined but customer peer IP undefined for ${vif.name}`,
      );
    }
    if (!vif.amazonAddress && vif.customerAddress) {
      errors.push(
        `[Direct Connect Gateway ${dxgw.name}]: Customer peer IP defined but Amazon peer IP undefined for ${vif.name}`,
      );
    }
    // Catch error if addresses match
    if (vif.amazonAddress && vif.customerAddress) {
      if (vif.amazonAddress === vif.customerAddress) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: Amazon peer IP and customer peer IP match for ${vif.name}`);
      }
    }
  }

  /**
   * Function to validate DX virtual interface configurations.
   * @param dxgw
   */
  private validateDxVirtualInterfaces(dxgw: t.TypeOf<typeof NetworkConfigTypes.dxGatewayConfig>, errors: string[]) {
    for (const vif of dxgw.virtualInterfaces ?? []) {
      // Catch error for private VIFs with transit gateway associations
      if (vif.type === 'private' && dxgw.transitGatewayAssociations) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: cannot specify private virtual interface ${vif.name} with transit gateway associations`,
        );
      }
      // Catch error if ASNs match
      if (dxgw.asn === vif.customerAsn) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: Amazon ASN and customer ASN match for ${vif.name}`);
      }
      // Catch error if ASN is not in the correct range
      if (vif.customerAsn < 1 || vif.customerAsn > 2147483647) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: ASN ${vif.customerAsn} out of range 1-2147483647 for virtual interface ${vif.name}`,
        );
      }
      // Catch error if VIF VLAN is not in range
      if (vif.vlan < 1 || vif.vlan > 4094) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: VLAN ${vif.vlan} out of range 1-4094 for virtual interface ${vif.name}`,
        );
      }
      // Validate peer IP addresses
      this.validateDxVirtualInterfaceAddresses(dxgw, vif, errors);
    }
  }

  /**
   * Function to validate DX gateway transit gateway assocations.
   * @param values
   * @param dxgw
   */
  private validateDxTransitGatewayAssociations(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    dxgw: t.TypeOf<typeof NetworkConfigTypes.dxGatewayConfig>,
    errors: string[],
  ) {
    for (const tgwAssociation of dxgw.transitGatewayAssociations ?? []) {
      const tgw = values.transitGateways.find(
        item => item.name === tgwAssociation.name && item.account === tgwAssociation.account,
      );
      // Catch error if TGW isn't found
      if (!tgw) {
        errors.push(
          `[Direct Connect Gateway ${dxgw.name}]: cannot find matching transit gateway for TGW association ${tgwAssociation.name}`,
        );
      }
      // Catch error if ASNs match
      if (tgw!.asn === dxgw.asn) {
        errors.push(`[Direct Connect Gateway ${dxgw.name}]: DX Gateway ASN and TGW ASN match for ${tgw!.name}`);
      }
      // Catch error if TGW and DXGW account don't match and associations/propagations are configured
      if (tgw!.account !== dxgw.account) {
        if (tgwAssociation.routeTableAssociations || tgwAssociation.routeTablePropagations) {
          errors.push(
            `[Direct Connect Gateway ${dxgw.name}]: DX Gateway association proposals cannot have TGW route table associations or propagations defined`,
          );
        }
      }
    }
  }

  /**
   * Function to validate DX gateway configurations.
   * @param values
   */
  private validateDxConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const dxgw of values.directConnectGateways ?? []) {
      // Validate virtual interfaces
      this.validateDxVirtualInterfaces(dxgw, errors);
      // Validate transit gateway attachments
      this.validateDxTransitGatewayAssociations(values, dxgw, errors);
    }
  }
}

class FirewallManagerValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate DX gateway configurations
    //
    this.validateFmsConfig(values, helpers, errors);
  }

  /**
   * Function to validate the FMS configuration.
   * @param values
   */
  private validateFmsConfig(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const fmsConfiguration = values.firewallManagerService;
    if (!fmsConfiguration) {
      return;
    }
    if (!helpers.accountExists(fmsConfiguration?.delegatedAdminAccount || '')) {
      errors.push(
        `Delegated Admin Account ${fmsConfiguration?.delegatedAdminAccount} name does not exist in Accounts configuration`,
      );
    }
    for (const channel of fmsConfiguration?.notificationChannels || []) {
      this.validatFmsNotificationChannels(channel, helpers, errors);
    }
  }

  private validatFmsNotificationChannels(
    notificationChannel: t.TypeOf<typeof NetworkConfigTypes.firewallManagerNotificationChannelConfig>,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (!helpers.snsTopicExists(notificationChannel.snsTopic)) {
      errors.push(`The SNS Topic name ${notificationChannel.snsTopic} for the notification channel does not exist.`);
    }
  }
}

class CertificatesValidator {
  constructor(values: NetworkConfig, errors: string[]) {
    //
    // Validate ACM certificate configurations
    //
    this.validateCertificates(values, errors);
  }
  private validateCertificates(values: NetworkConfig, errors: string[]) {
    const allCertificateNames: string[] = [];
    for (const certificate of values.certificates ?? []) {
      allCertificateNames.push(certificate.name);
      // check certificate import keys
      if (certificate.type === 'import') {
        this.checkImportCertificateInput(certificate, errors);
      }
      // check certificate request keys
      if (certificate.type === 'request') {
        this.checkRequestCertificateInput(certificate, errors);
      }
    }
    // check certificate for duplicate names
    this.checkCertificateForDuplicateNames(allCertificateNames, errors);
  }
  private checkImportCertificateInput(
    certificate: t.TypeOf<typeof NetworkConfigTypes.certificateConfig>,
    errors: string[],
  ) {
    // when cert is set to import users must mention a privateKey and certificate
    if (!certificate.privKey || !certificate.cert) {
      errors.push(
        `Certificate: ${
          certificate.name
        } is set to import which requires both privKey and cert. Found: ${JSON.stringify(certificate)}`,
      );
    }
  }
  private checkRequestCertificateInput(
    certificate: t.TypeOf<typeof NetworkConfigTypes.certificateConfig>,
    errors: string[],
  ) {
    // when cert is set to request users must mention a privateKey and certificate
    if (!certificate.domain || !certificate.validation) {
      errors.push(
        `Certificate: ${
          certificate.name
        } is set to request which requires both validation and domain. Found: ${JSON.stringify(certificate)}`,
      );
    }
  }
  private checkCertificateForDuplicateNames(allCertificateNames: string[], errors: string[]) {
    if (allCertificateNames.length > 1) {
      const duplicateCertNames = allCertificateNames.some(element => {
        return allCertificateNames.indexOf(element) !== allCertificateNames.lastIndexOf(element);
      });
      if (duplicateCertNames) {
        errors.push(`There are duplicates in certificate names. Certificate names: ${allCertificateNames.join(',')}`);
      }
    }
  }
}

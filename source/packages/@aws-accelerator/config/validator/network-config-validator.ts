import * as fs from 'fs';
import * as path from 'path';

import { AccountsConfig } from '../lib/accounts-config';
import * as t from '../lib/common-types';
import {
  NetworkConfig,
  NetworkConfigTypes,
  TransitGatewayRouteTableDxGatewayEntryConfig,
  TransitGatewayRouteTableVpcEntryConfig,
  TransitGatewayRouteTableVpnEntryConfig,
} from '../lib/network-config';
import { OrganizationConfig } from '../lib/organization-config';

/**
 * Network Configuration validator.
 * Validates network configuration
 */
export class NetworkConfigValidator {
  constructor(configDir: string) {
    const values = NetworkConfig.load(configDir);
    const ouIdNames: string[] = ['Root'];
    const accountNames: string[] = [];

    const errors: string[] = [];

    console.log(`[network-config-validator.ts]: ${NetworkConfig.FILENAME} file validation started`);

    //
    // Get list of OU ID names from organization config file
    this.getOuIdNames(configDir, ouIdNames);

    //
    // Get list of Account names from account config file
    this.getAccountNames(configDir, accountNames);

    //
    // Start Validation
    new NetworkFirewallValidator(values, configDir, errors);
    new TransitGatewayValidator(values, ouIdNames, accountNames, errors);
    new IpamValidator(values, ouIdNames, accountNames, errors);
    new EndpointPoliciesValidator(values, configDir, errors);
    new Route53ResolverValidator(values, configDir, errors);
    new VpcValidator(values, ouIdNames, accountNames, errors);
    new GatewayLoadBalancersValidator(values, accountNames, errors);
    new CustomerGatewaysValidator(values, accountNames, errors);
    new DirectConnectGatewaysValidator(values, errors);

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
 * Class to validate transit gateway
 */
class TransitGatewayValidator {
  constructor(values: NetworkConfig, ouIdNames: string[], accountNames: string[], errors: string[]) {
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
    this.validateTgwDeploymentTargetOUs(values, ouIdNames, errors);

    //
    // Validate TGW deployment target account names
    //
    this.validateTgwDeploymentTargetAccounts(values, accountNames, errors);

    //
    // Validate Tgw account name
    //
    this.validateTgwAccountName(values, accountNames, errors);
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
    for (const transitGatewayPeering of values.transitGatewayPeering ?? []) {
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
    }
  }

  /**
   * Function to validate existence of Transit Gateway deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateTgwDeploymentTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const transitGateway of values.transitGateways ?? []) {
      for (const ou of transitGateway.shareTargets?.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for transit gateways ${transitGateway.name} does not exists in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of transit deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateTgwDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const transitGateway of values.transitGateways ?? []) {
      for (const account of transitGateway.shareTargets?.accounts ?? []) {
        console.log(account);
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for transit gateway ${transitGateway.name} does not exists in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of transit gateway account name
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateTgwAccountName(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const transitGateway of values.transitGateways ?? []) {
      if (accountNames.indexOf(transitGateway.account) === -1) {
        errors.push(
          `Transit Gateway "${transitGateway.name}" account name "${transitGateway.account}" does not exists in accounts-config.yaml file.`,
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
        if (dxgw!.account !== tgw.account) {
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
 * Class to validate endpoint policies
 */
class EndpointPoliciesValidator {
  constructor(values: NetworkConfig, configDir: string, errors: string[]) {
    this.validateEndpointPolicyDocumentFile(values, configDir, errors);
  }
  /**
   * Function to validate Endpoint policy document file existence
   * @param configDir
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
 * Class to validate Route53Resolver
 */
class Route53ResolverValidator {
  constructor(values: NetworkConfig, configDir: string, errors: string[]) {
    const domainLists: { name: string; document: string }[] = [];
    //
    // Prepare Custom domain list
    this.prepareCustomDomainList(values, domainLists);

    //
    // Custom domain lists
    this.validateCustomDomainListDocumentFile(configDir, domainLists, errors);
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
}

/**
 * Class to validate network firewall
 */
class NetworkFirewallValidator {
  constructor(values: NetworkConfig, configDir: string, errors: string[]) {
    //
    // Validate suricata rule file
    this.validateSuricataFile(values, configDir, errors);
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
    for (const rule of values.centralNetworkServices?.networkFirewall?.rules ?? []) {
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
        }
      }
    }
  }
}

/**
 * Class to validate ipam
 */
class IpamValidator {
  constructor(values: NetworkConfig, ouIdNames: string[], accountNames: string[], errors: string[]) {
    //
    // Validate Ipam deployment Ou names
    this.validateIpamPoolDeploymentTargetOUs(values, ouIdNames, errors);

    //
    // Validate Ipam deployment account names
    //
    this.validateIpamPoolDeploymentTargetAccounts(values, accountNames, errors);
  }
  /**
   * Function to validate existence of IPAM pool deployment target OUs
   * Make sure deployment target OUs are part of Organization config file
   * @param values
   */
  private validateIpamPoolDeploymentTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const ou of pool.shareTargets?.organizationalUnits ?? []) {
          if (ouIdNames.indexOf(ou) === -1) {
            errors.push(
              `Deployment target OU ${ou} for IPAM pool ${pool.name} does not exists in organization-config.yaml file.`,
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
   */
  private validateIpamPoolDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const ipam of values.centralNetworkServices?.ipams ?? []) {
      for (const pool of ipam.pools ?? []) {
        for (const account of pool.shareTargets?.accounts ?? []) {
          if (accountNames.indexOf(account) === -1) {
            errors.push(
              `Deployment target account ${account} for IPAM pool ${pool.name} does not exists in accounts-config.yaml file.`,
            );
          }
        }
      }
    }
  }
}

/**
 * Class to validate Vpcs
 */
class VpcValidator {
  constructor(values: NetworkConfig, ouIdNames: string[], accountNames: string[], errors: string[]) {
    //
    // Validate VPC template deployment target ou names
    this.validateVpcTemplatesDeploymentTargetOUs(values, ouIdNames, errors);
    //
    // Validate Vpc templates deployment account names
    //
    this.validateVpcTemplatesDeploymentTargetAccounts(values, accountNames, errors);
    //
    // Validate vpc account name
    //
    this.validateVpcAccountName(values, accountNames, errors);
    //
    // Validate vpc tgw name
    //
    this.validateVpcTwgAccountName(values, accountNames, errors);
    //
    // Validate transit gateway names in VPC tgw attachments
    //
    this.validateVpcTgwName(values, errors);
    //
    // Validate VPC configurations
    //
    this.validateVpcConfiguration(values, errors);
  }

  /**
   * Function to validate VPC template deployment target ou names
   * @param values
   * @param ouIdNames
   * @param errors
   */
  private validateVpcTemplatesDeploymentTargetOUs(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    ouIdNames: string[],
    errors: string[],
  ) {
    for (const vpc of values.vpcTemplates ?? []) {
      for (const ou of vpc.deploymentTargets?.organizationalUnits ?? []) {
        if (ouIdNames.indexOf(ou) === -1) {
          errors.push(
            `Deployment target OU ${ou} for VPC template ${vpc.name} does not exist in organization-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of VPC deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateVpcTemplatesDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const vpc of values.vpcTemplates ?? []) {
      for (const account of vpc.deploymentTargets?.accounts ?? []) {
        if (accountNames.indexOf(account) === -1) {
          errors.push(
            `Deployment target account ${account} for VPC template ${vpc.name} does not exist in accounts-config.yaml file.`,
          );
        }
      }
    }
  }

  /**
   * Function to validate existence of vpc account name
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateVpcAccountName(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const vpcItem of values.vpcs ?? []) {
      if (accountNames.indexOf(vpcItem.account) === -1) {
        errors.push(
          `Vpc "${vpcItem.name}" account name "${vpcItem.account}" does not exists in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Function to validate existence of vpc transit gateway account name
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateVpcTwgAccountName(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const vpcItem of values.vpcs ?? []) {
      for (const tgwAttachment of vpcItem.transitGatewayAttachments ?? []) {
        if (accountNames.indexOf(tgwAttachment.transitGateway.account) === -1) {
          errors.push(
            `Vpc "${vpcItem.name}" tgw attachment "${tgwAttachment.transitGateway.name}" account name "${tgwAttachment.transitGateway.account}" does not exists in accounts-config.yaml file.`,
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

      // Validate target exists
      if (
        routeTableEntryItem.type &&
        ['gatewayLoadBalancerEndpoint', 'natGateway', 'networkFirewall', 'transitGateway'].includes(
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
          `[VPC ${vpcItem.name} subnet ${subnet.name}]: target IPAM pool ${
            subnet.ipamAllocation!.ipamPoolName
          } is not a source pool of the VPC`,
        );
      }
      // Check if targeted IPAM pool exists
      if (
        subnet.ipamAllocation &&
        !ipams?.find(ipam => ipam.pools?.find(pool => pool.name === subnet.ipamAllocation!.ipamPoolName))
      ) {
        errors.push(
          `[VPC ${vpcItem.name} subnet ${subnet.name}]: target IPAM pool ${
            subnet.ipamAllocation!.ipamPoolName
          } is not defined`,
        );
      }
    }
  }

  /**
   * Function to validate conditional dependencies for VPC configurations.
   * @param values
   */
  private validateVpcConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const vpcItem of [...values.vpcs, ...(values.vpcTemplates ?? [])] ?? []) {
      for (const routeTableItem of vpcItem.routeTables ?? []) {
        // Throw error if gateway association exists but no internet gateway
        if (routeTableItem.gatewayAssociation === 'internetGateway' && !vpcItem.internetGateway) {
          errors.push(
            `[Route table ${routeTableItem.name} for VPC ${vpcItem.name}]: attempting to configure a gateway association with no IGW attached to the VPC!`,
          );
        }
        // Validate route entries
        this.validateRouteTableEntries(routeTableItem, vpcItem, values, errors);
      }
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
    }
  }
}

/**
 * Class to validate Gateway LoadBalancers
 */
class GatewayLoadBalancersValidator {
  constructor(values: NetworkConfig, accountNames: string[], errors: string[]) {
    //
    // Validate gateway load balancers deployment account names
    //
    this.validateGwlbDeploymentTargetAccounts(values, accountNames, errors);

    //
    // Validate GWLB configuration
    //
    this.validateGwlbConfiguration(values, errors);
  }

  /**
   * Function to validate existence of GWLB deployment target accounts
   * Make sure deployment target accounts are part of account config file
   * @param values
   */
  private validateGwlbDeploymentTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const gwlb of values.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      for (const endpoint of gwlb.endpoints ?? []) {
        if (accountNames.indexOf(endpoint.account) === -1) {
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
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
    for (const gwlbEndpoint of gwlb.endpoints ?? []) {
      const vpc = vpcs.find(item => item.name === gwlbEndpoint.vpc);
      if (!vpc) {
        errors.push(
          `[Gateway Load Balancer ${gwlb.name} endpoint ${gwlbEndpoint.name}]: VPC ${gwlbEndpoint.vpc} does not exist`,
        );
      }

      // Validate subnet
      if (vpc && !vpc.subnets?.find(subnet => subnet.name === gwlbEndpoint.subnet)) {
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
  private validateGwlbConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    const vpcs = [...values.vpcs, ...(values.vpcTemplates ?? [])];
    for (const gwlb of values.centralNetworkServices?.gatewayLoadBalancers ?? []) {
      const vpc = vpcs.find(item => item.name === gwlb.vpc);
      if (!vpc) {
        errors.push(`[Gateway Load Balancer ${gwlb.name}]: VPC ${gwlb.vpc} does not exist`);
      }

      // Validate subnets
      for (const gwlbSubnet of gwlb.subnets ?? []) {
        if (vpc && !vpc.subnets?.find(subnet => subnet.name === gwlbSubnet)) {
          errors.push(`[Gateway Load Balancer ${gwlb.name}]: subnet ${gwlbSubnet} does not exist in VPC ${vpc!.name}`);
        }
      }

      // Validate endpoints
      this.validateGwlbEndpoints(gwlb, values, errors);
    }
  }
}

/**
 * Class to validate Customer Gateways
 */
class CustomerGatewaysValidator {
  constructor(values: NetworkConfig, accountNames: string[], errors: string[]) {
    //
    // Validate gateway load balancers deployment account names
    //
    this.validateCgwTargetAccounts(values, accountNames, errors);
    //
    // Validate CGW configuration
    //
    this.validateCgwConfiguration(values, errors);
  }

  private validateCgwTargetAccounts(
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    accountNames: string[],
    errors: string[],
  ) {
    for (const cgw of values.customerGateways ?? []) {
      if (accountNames.indexOf(cgw.account) === -1) {
        errors.push(
          `Target account ${cgw.account} for customer gateway ${cgw.name} does not exist in accounts-config.yaml file.`,
        );
      }
    }
  }

  /**
   * Validate customer gateways and VPN confections
   * @param values
   */
  private validateCgwConfiguration(values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>, errors: string[]) {
    for (const cgw of values.customerGateways ?? []) {
      if (cgw.asn < 1 || cgw.asn > 2147483647) {
        errors.push(`[Customer Gateway ${cgw.name}]: ASN ${cgw.asn} out of range 1-2147483647`);
      }

      // Validate VPN configurations
      this.validateVpnConfiguration(cgw, values, errors);
    }
  }

  /**
   * Validate site-to-site VPN connections
   * @param cgw
   * @param values
   */
  private validateVpnConfiguration(
    cgw: t.TypeOf<typeof NetworkConfigTypes.customerGatewayConfig>,
    values: t.TypeOf<typeof NetworkConfigTypes.networkConfig>,
    errors: string[],
  ) {
    for (const vpn of cgw.vpnConnections ?? []) {
      // Validate target TGW exists
      const tgw = values.transitGateways.find(tgw => tgw.name === vpn.transitGateway);
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

      // Validate length of tunnel specifications
      if (vpn.tunnelSpecifications) {
        if (vpn.tunnelSpecifications.length < 2 || vpn.tunnelSpecifications.length > 2) {
          errors.push(
            `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: tunnel specifications must have exactly 2 definitions`,
          );
        }
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

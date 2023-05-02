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
import {
  NetworkConfig,
  NetworkConfigTypes,
  TransitGatewayConfig,
  TransitGatewayRouteTableConfig,
  TransitGatewayRouteEntryConfig,
  TransitGatewayRouteTableVpcEntryConfig,
  DxGatewayConfig,
  TransitGatewayRouteTableDxGatewayEntryConfig,
  CustomerGatewayConfig,
  TransitGatewayRouteTableVpnEntryConfig,
  TransitGatewayRouteTableTgwPeeringEntryConfig,
} from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate transit gateway
 */
export class TransitGatewayValidator {
  constructor(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate transit gateway names
    //
    this.validateTgwNames(values, helpers, errors);
    //
    // Validate Tgw account name
    //
    this.validateTgwAccountName(values, helpers, errors);
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
    // Validate TGW configurations
    //
    this.validateTgwConfiguration(values, helpers, errors);
  }

  /**
   * Validate transit gateway names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateTgwNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    const tgwNames: string[] = [];
    values.transitGateways.forEach(tgw => tgwNames.push(tgw.name));

    if (helpers.hasDuplicates(tgwNames)) {
      errors.push(
        `Duplicate transit gateway names defined. Transit gateway names must be unique. Transit gateway names in file: ${tgwNames}`,
      );
    }
  }

  /**
   * Function to validate TGW route table transitGatewayPeeringName property value
   * Value for transitGatewayPeeringName must be from the list of transitGatewayPeering object
   * @param values
   * @param errors
   */
  private validateTgwPeeringName(values: NetworkConfig, errors: string[]) {
    for (const transitGateway of values.transitGateways) {
      for (const routeTable of transitGateway.routeTables) {
        for (const route of routeTable.routes) {
          if (NetworkConfigTypes.transitGatewayRouteTableTgwPeeringEntryConfig.is(route.attachment)) {
            const attachment: TransitGatewayRouteTableTgwPeeringEntryConfig = route.attachment;
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
  private validateTgwPeeringTransitGatewaysAndRouteTables(values: NetworkConfig, errors: string[]) {
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
  private validateTgwShareTargetAccounts(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
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
   * Function to validate conditional dependencies for TGW configurations
   * @param values
   * @param helpers
   * @param errors
   */
  private validateTgwConfiguration(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    //
    // Validate transit gateway route table names
    //
    this.validateTgwRouteTableNames(values, helpers, errors);
    //
    // Validate transit gateway ASN
    //
    this.validateTgwAsns(values, errors);
    //
    // Validate transit gateway route table structure
    //
    const allValid = this.validateTransitGatewayRouteStructure(values, errors);

    for (const tgw of values.transitGateways ?? []) {
      for (const routeTable of tgw.routeTables ?? []) {
        if (allValid) {
          // Validate CIDR route destinations
          this.validateTgwRouteCidrDestinations(tgw, routeTable, helpers, errors);
          // Validate prefix list route destinations
          this.validateTgwRoutePrefixListDestinations(values, tgw, routeTable, helpers, errors);
          // Validate static route entries
          this.validateTgwStaticRouteEntries(values, tgw, routeTable, helpers, errors);
        }
      }
    }
  }

  /**
   * Validate transit gateway route table names
   * @param values
   * @param helpers
   * @param errors
   */
  private validateTgwRouteTableNames(values: NetworkConfig, helpers: NetworkValidatorFunctions, errors: string[]) {
    values.transitGateways.forEach(tgw => {
      const tableNames: string[] = [];
      tgw.routeTables.forEach(table => tableNames.push(table.name));

      if (helpers.hasDuplicates(tableNames)) {
        errors.push(
          `[Transit gateway ${tgw.name}]: duplicate route table names defined. Route table names must be unique for each TGW. Table names in file: ${tableNames}`,
        );
      }
    });
  }

  /**
   * Validate transit gateway ASNs
   * @param values
   * @param errors
   */
  private validateTgwAsns(values: NetworkConfig, errors: string[]) {
    values.transitGateways.forEach(tgw => {
      const asnRange16Bit = tgw.asn >= 64512 && tgw.asn <= 65534;
      const asnRange32Bit = tgw.asn >= 4200000000 && tgw.asn <= 4294967294;

      if (!asnRange16Bit && !asnRange32Bit) {
        errors.push(
          `[Transit gateway ${tgw.name}]: ASN is not within range. Valid values are 64512-65534 for 16-bit ASNs and 4200000000-4294967294 for 32-bit ASNs`,
        );
      }
    });
  }

  /**
   * Validate route entries are using the correct structure
   * @param values
   * @param errors
   * @returns
   */
  private validateTransitGatewayRouteStructure(values: NetworkConfig, errors: string[]) {
    let allValid = true;
    values.transitGateways.forEach(tgw => {
      tgw.routeTables.forEach(routeTable => {
        routeTable.routes.forEach(entry => {
          // Catch error if an attachment and blackhole are both defined
          if (entry.attachment && entry.blackhole) {
            allValid = false;
            errors.push(
              `[Transit Gateway route table ${routeTable.name}]: cannot define both an attachment and blackhole target`,
            );
          }
          // Catch error if neither attachment or blackhole are defined
          if (!entry.attachment && !entry.blackhole) {
            allValid = false;
            errors.push(
              `[Transit Gateway route table ${routeTable.name}]: must define either an attachment or blackhole target`,
            );
          }
          // Catch error if destination CIDR and prefix list are both defined
          if (entry.destinationCidrBlock && entry.destinationPrefixList) {
            allValid = false;
            errors.push(
              `[Transit Gateway route table ${routeTable.name}]: cannot define both a destination CIDR and destination prefix list`,
            );
          }
          // Catch error if destination CIDR and prefix list are not defined
          if (!entry.destinationCidrBlock && !entry.destinationPrefixList) {
            allValid = false;
            errors.push(
              `[Transit Gateway route table ${routeTable.name}]: must define either a destination CIDR or destination prefix list`,
            );
          }
        });
      });
    });
    return allValid;
  }

  /**
   * Validate CIDR destinations for TGW route tables
   * @param values
   * @param tgw
   * @param routeTable
   * @param helpers
   * @param errors
   */
  private validateTgwRouteCidrDestinations(
    tgw: TransitGatewayConfig,
    routeTable: TransitGatewayRouteTableConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Create arrays of CIDR and prefix list destinations
    const cidrs: string[] = [];
    routeTable.routes.forEach(entry => {
      if (entry.destinationCidrBlock) {
        cidrs.push(entry.destinationCidrBlock);
      }
    });

    // Validate there are no duplicates
    if (helpers.hasDuplicates(cidrs)) {
      errors.push(
        `[Transit gateway ${tgw.name} route table ${routeTable.name}]: duplicate CIDR destinations defined. Destinations must be unique. CIDRs defined in file: ${cidrs}`,
      );
    }

    // Validate CIDRs
    cidrs.forEach(cidr => {
      if (!helpers.isValidIpv4Cidr(cidr)) {
        errors.push(
          `[Transit gateway ${tgw.name} route table ${routeTable.name}]: destination CIDR "${cidr}" is invalid. Value must be a valid IPv4 CIDR range`,
        );
      }
    });
  }

  /**
   * Validate prefix list destinations for TGW route tables
   * @param values
   * @param tgw
   * @param routeTable
   * @param helpers
   * @param errors
   */
  private validateTgwRoutePrefixListDestinations(
    values: NetworkConfig,
    tgw: TransitGatewayConfig,
    routeTable: TransitGatewayRouteTableConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Create array of prefix list destinations
    const prefixLists: string[] = [];
    routeTable.routes.forEach(entry => {
      if (entry.destinationPrefixList) {
        prefixLists.push(entry.destinationPrefixList);
      }
    });

    // Validate there are no duplicates
    if (helpers.hasDuplicates(prefixLists)) {
      errors.push(
        `[Transit gateway ${tgw.name} route table ${routeTable.name}]: duplicate prefix list destinations defined. Destinations must be unique. Prefix lists defined in file: ${prefixLists}`,
      );
    }

    // Validate prefix list exists in the same account/region as TGW
    prefixLists.forEach(listName => {
      const prefixList = values.prefixLists?.find(pl => pl.name === listName);
      if (!prefixList) {
        errors.push(
          `[Transit gateway ${tgw.name} route table ${routeTable.name}]: prefix list "${listName}" not found`,
        );
      }
      const accounts = [];
      const regions = [];
      if (prefixList?.accounts) {
        accounts.push(...prefixList.accounts);
      }
      if (prefixList?.regions) {
        regions.push(...prefixList.regions);
      }
      if (prefixList?.deploymentTargets) {
        accounts.push(...helpers.getAccountNamesFromTarget(prefixList.deploymentTargets));
        regions.push(...helpers.getRegionsFromDeploymentTarget(prefixList.deploymentTargets));
      }
      if (!accounts.includes(tgw.account)) {
        errors.push(
          `[Transit gateway ${tgw.name} route table ${routeTable.name}]: prefix list "${listName}" is not deployed to the same account as the TGW`,
        );
      }
      if (!regions.includes(tgw.region)) {
        errors.push(
          `[Transit gateway ${tgw.name} route table ${routeTable.name}]: prefix list "${listName}" is not deployed to the same region as the TGW`,
        );
      }
    });
  }

  /**
   * Function to validate TGW route table entries
   */
  private validateTgwStaticRouteEntries(
    values: NetworkConfig,
    tgw: TransitGatewayConfig,
    routeTable: TransitGatewayRouteTableConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    // Retrieve relevant configs
    const dxgws = [...(values.directConnectGateways ?? [])];
    const cgws = [...(values.customerGateways ?? [])];

    for (const entry of routeTable.routes ?? []) {
      // Validate VPC attachment routes
      this.validateVpcStaticRouteEntry(tgw.name, routeTable.name, entry, helpers, errors);

      // Validate DX Gateway routes
      this.validateDxGatewayStaticRouteEntry(dxgws, tgw, routeTable.name, entry, errors);

      // Validate VPN static route entry
      this.validateVpnStaticRouteEntry(cgws, tgw.name, routeTable.name, entry, errors);
    }
  }

  /**
   * Function to validate transit gateway static route entries for VPC attachments
   * @param tgwName
   * @param routeTableName
   * @param entry
   * @param helpers
   * @param errors
   */
  private validateVpcStaticRouteEntry(
    tgwName: string,
    routeTableName: string,
    entry: TransitGatewayRouteEntryConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableVpcEntryConfig.is(entry.attachment)) {
      const vpcAttachment = entry.attachment as TransitGatewayRouteTableVpcEntryConfig;
      const vpc = helpers.getVpc(vpcAttachment.vpcName);

      // Validate VPC exists and resides in the expected account
      if (!vpc) {
        errors.push(
          `[Transit Gateway ${tgwName} route table ${routeTableName}]: cannot find VPC "${vpcAttachment.vpcName}"`,
        );
      }
      if (vpc && !helpers.getVpcAccountNames(vpc).includes(vpcAttachment.account)) {
        errors.push(
          `[Transit Gateway ${tgwName} route table ${routeTableName}]: VPC "${vpcAttachment.vpcName}" is not deployed to account "${vpcAttachment.account}"`,
        );
      }
    }
  }

  /**
   * Function to validate transit gateway static route entries for DX attachments
   * @param dxgws
   * @param routeTableName
   * @param tgw
   * @param entry
   * @param errors
   */
  private validateDxGatewayStaticRouteEntry(
    dxgws: DxGatewayConfig[],
    tgw: TransitGatewayConfig,
    routeTableName: string,
    entry: TransitGatewayRouteEntryConfig,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableDxGatewayEntryConfig.is(entry.attachment)) {
      const dxAttachment = entry.attachment as TransitGatewayRouteTableDxGatewayEntryConfig;
      const dxgw = dxgws.find(item => item.name === dxAttachment.directConnectGatewayName);
      // Catch error if DXGW doesn't exist
      if (!dxgw) {
        errors.push(
          `[Transit Gateway ${tgw.name} route table ${routeTableName}]: cannot find DX Gateway ${dxAttachment.directConnectGatewayName}`,
        );
      }
      if (dxgw) {
        // Catch error if DXGW is not in the same account as the TGW
        if (dxgw.account !== tgw.account) {
          errors.push(
            `[Transit Gateway ${tgw.name} route table ${routeTableName}]: cannot add route entry for DX Gateway ${dxAttachment.directConnectGatewayName}. DX Gateway and TGW ${tgw.name} reside in separate accounts`,
          );
        }
        // Catch error if there is no association with the TGW
        if (!dxgw.transitGatewayAssociations || !dxgw.transitGatewayAssociations.find(item => item.name === tgw.name)) {
          errors.push(
            `[Transit Gateway ${tgw.name} route table ${routeTableName}]: cannot add route entry for DX Gateway ${dxAttachment.directConnectGatewayName}. DX Gateway and TGW ${tgw.name} are not associated`,
          );
        }
      }
    }
  }

  /**
   * Function to validate transit gateway static route entries for VPN attachments
   * @param cgws
   * @param tgwName
   * @param routeTableName
   * @param entry
   */
  private validateVpnStaticRouteEntry(
    cgws: CustomerGatewayConfig[],
    tgwName: string,
    routeTableName: string,
    entry: TransitGatewayRouteEntryConfig,
    errors: string[],
  ) {
    if (entry.attachment && NetworkConfigTypes.transitGatewayRouteTableVpnEntryConfig.is(entry.attachment)) {
      const vpnAttachment = entry.attachment as TransitGatewayRouteTableVpnEntryConfig;
      const cgw = cgws.find(cgwItem =>
        cgwItem.vpnConnections?.find(vpnItem => vpnItem.name === vpnAttachment.vpnConnectionName),
      );
      // Validate VPN exists and is attached to this TGW
      if (!cgw) {
        errors.push(
          `[Transit Gateway ${tgwName} route table ${routeTableName}]: cannot find customer gateway with VPN "${vpnAttachment.vpnConnectionName}"`,
        );
      }

      // Validate VPN is attached to this TGW
      if (cgw) {
        const vpn = cgw.vpnConnections?.find(attachment => attachment.name === vpnAttachment.vpnConnectionName);
        if (vpn && (!vpn.transitGateway || vpn.transitGateway !== tgwName)) {
          errors.push(
            `[Transit Gateway ${tgwName} route table ${routeTableName}]: VPN "${vpnAttachment.vpnConnectionName}" is not attached to this TGW`,
          );
        }
      }
    }
  }
}

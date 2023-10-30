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
  CustomerGatewayConfig,
  NetworkConfigTypes,
  TransitGatewayConfig,
  TransitGatewayRouteEntryConfig,
} from '@aws-accelerator/config';
import { PrefixList, PutSsmParameter, SsmParameterProps } from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel, NetworkStack } from '../network-stack';
import { getPrefixList } from '../utils/getter-utils';
import { isEc2FirewallVpnRoute } from '../utils/validation-utils';

export class PrefixListResources {
  public readonly prefixListMap: Map<string, PrefixList>;
  public readonly sharedParameterMap: Map<string, SsmParameterProps[]>;
  private stack: NetworkStack;

  constructor(networkStack: NetworkStack, props: AcceleratorStackProps) {
    this.stack = networkStack;

    // Create prefix lists
    this.prefixListMap = this.createPrefixLists(props);
    // Create shared parameters
    this.sharedParameterMap = this.createSharedParameters(
      props,
      props.networkConfig.transitGateways,
      props.networkConfig.customerGateways ?? [],
    );
  }

  /**
   * Create prefix lists for the current stack context
   * @param props
   * @returns
   */
  private createPrefixLists(props: AcceleratorStackProps): Map<string, PrefixList> {
    const prefixListMap = new Map<string, PrefixList>();
    for (const prefixListItem of props.networkConfig.prefixLists ?? []) {
      const prefixListTargets = this.stack.getPrefixListTargets(prefixListItem);
      if (this.stack.isTargetStack(prefixListTargets.accountIds, prefixListTargets.regions)) {
        this.stack.addLogs(LogLevel.INFO, `Adding Prefix List ${prefixListItem.name}`);

        const prefixList = new PrefixList(this.stack, pascalCase(`${prefixListItem.name}PrefixList`), {
          name: prefixListItem.name,
          addressFamily: prefixListItem.addressFamily,
          maxEntries: prefixListItem.maxEntries,
          entries: prefixListItem.entries,
          tags: prefixListItem.tags ?? [],
        });
        prefixListMap.set(prefixListItem.name, prefixList);

        this.stack.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(prefixListItem.name)}PrefixList`),
          parameterName: this.stack.getSsmPath(SsmResourceType.PREFIX_LIST, [prefixListItem.name]),
          stringValue: prefixList.prefixListId,
        });
      }
    }
    return prefixListMap;
  }

  /**
   * Create cross-account/cross-region SSM parameters for site-to-site VPN connections
   * that must reference a prefix list in cross-account VPN scenarios
   * @param transitGateways TransitGatewayConfig[]
   * @param customerGateways CustomerGatewayConfig[]
   * @returns Map<string, SsmParameterProps[]>
   */
  private createSharedParameters(
    props: AcceleratorStackProps,
    transitGateways: TransitGatewayConfig[],
    customerGateways: CustomerGatewayConfig[],
  ): Map<string, SsmParameterProps[]> {
    const sharedParameterMap = new Map<string, SsmParameterProps[]>();
    //
    // Get EC2 firewall TGW prefix list routes
    const ec2FirewallPrefixListRoutes = this.setEc2FirewallPrefixListRoutes(transitGateways, customerGateways);
    //
    // Set CGWs in scope
    const plRouteVpnNames = ec2FirewallPrefixListRoutes.map(plRoute => {
      if (plRoute.attachment && NetworkConfigTypes.transitGatewayRouteTableVpnEntryConfig.is(plRoute.attachment)) {
        return plRoute.attachment.vpnConnectionName;
      }
      return '';
    });
    const cgwsInScope = customerGateways.filter(cgw =>
      cgw.vpnConnections?.find(vpn => plRouteVpnNames.includes(vpn.name)),
    );
    const crossAcctFirewallReferenceCgws = cgwsInScope.filter(
      cgwItem =>
        this.stack.isTargetStack([props.accountsConfig.getAccountId(cgwItem.account)], [cgwItem.region]) &&
        !this.stack.firewallVpcInScope(cgwItem),
    );
    //
    // Create shared parameters
    for (const crossAcctCgw of crossAcctFirewallReferenceCgws) {
      const firewallVpcConfig = this.stack.getFirewallVpcConfig(crossAcctCgw);
      const accountIds = this.stack.getVpcAccountIds(firewallVpcConfig);
      const parameters = this.setCrossAccountSsmParameters(crossAcctCgw, ec2FirewallPrefixListRoutes);

      if (parameters.length > 0) {
        // Put SSM parameters
        new PutSsmParameter(this.stack, pascalCase(`${crossAcctCgw.name}PrefixListSharedParameters`), {
          accountIds,
          region: firewallVpcConfig.region,
          roleName: this.stack.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention,
          parameters,
          invokingAccountId: this.stack.account,
          acceleratorPrefix: this.stack.acceleratorPrefix,
        });
        sharedParameterMap.set(crossAcctCgw.name, parameters);
      }
    }

    return sharedParameterMap;
  }

  /**
   * Returns an array of TGW prefix list routes that target an EC2 firewall VPN connection
   * @param transitGateways TransitGatewayConfig[]
   * @param customerGateways CustomerGatewayConfig[]
   * @returns TransitGatewayRouteEntryConfig[]
   */
  private setEc2FirewallPrefixListRoutes(
    transitGateways: TransitGatewayConfig[],
    customerGateways: CustomerGatewayConfig[],
  ): TransitGatewayRouteEntryConfig[] {
    const ec2FirewallPrefixListRoutes: TransitGatewayRouteEntryConfig[] = [];
    for (const tgwItem of transitGateways) {
      for (const routeTableItem of tgwItem.routeTables ?? []) {
        const prefixListRoutesInScope = routeTableItem.routes.filter(
          routeItem =>
            routeItem.attachment &&
            routeItem.destinationPrefixList &&
            this.prefixListMap.has(routeItem.destinationPrefixList),
        );
        prefixListRoutesInScope.forEach(plRoute => {
          if (isEc2FirewallVpnRoute(customerGateways, plRoute)) {
            ec2FirewallPrefixListRoutes.push(plRoute);
          }
        });
      }
    }
    return ec2FirewallPrefixListRoutes;
  }

  /**
   * Returns an array of SSM parameters for cross-account prefix list routes
   * @param customerGateway CustomerGatewayConfig
   * @param ec2FirewallPrefixListRoutes TransitGatewayRouteEntryConfig[]
   * @returns SsmParameterProps[]
   */
  private setCrossAccountSsmParameters(
    customerGateway: CustomerGatewayConfig,
    ec2FirewallPrefixListRoutes: TransitGatewayRouteEntryConfig[],
  ): SsmParameterProps[] {
    const parameters: SsmParameterProps[] = [];
    for (const vpnItem of customerGateway.vpnConnections ?? []) {
      const route = ec2FirewallPrefixListRoutes.find(
        routeItem =>
          routeItem.attachment &&
          NetworkConfigTypes.transitGatewayRouteTableVpnEntryConfig.is(routeItem.attachment) &&
          routeItem.attachment.vpnConnectionName === vpnItem.name,
      );
      if (route && route.destinationPrefixList) {
        const prefixList = getPrefixList(this.prefixListMap, route.destinationPrefixList) as PrefixList;
        parameters.push({
          name: this.stack.getSsmPath(SsmResourceType.CROSS_ACCOUNT_PREFIX_LIST, [
            customerGateway.name,
            route.destinationPrefixList,
          ]),
          value: prefixList.prefixListId,
        });
      }
    }
    return [...new Set(parameters)];
  }
}

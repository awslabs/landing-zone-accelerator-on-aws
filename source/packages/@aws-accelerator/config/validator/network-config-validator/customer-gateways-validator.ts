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
  CustomerGatewayConfig,
  VpnConnectionConfig,
  NetworkConfigTypes,
} from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate Customer Gateways
 */
export class CustomerGatewaysValidator {
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
        this.validateVirtualPrivateGatewayVpnConfiguration(cgw, vpn, helpers, errors);
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
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    const vpc = helpers.getVpc(vpn.vpc!);
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
    cgw: CustomerGatewayConfig,
    vpn: VpnConnectionConfig,
    values: NetworkConfig,
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

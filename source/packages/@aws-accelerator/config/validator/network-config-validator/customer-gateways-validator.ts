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

import { IPv4CidrRange } from 'ip-num';
import { CustomizationsConfig, Ec2FirewallInstanceConfig } from '../../lib/customizations-config';
import {
  CustomerGatewayConfig,
  NetworkConfig,
  NetworkConfigTypes,
  VpnConnectionConfig,
  VpnTunnelOptionsSpecificationsConfig,
} from '../../lib/network-config';
import { NetworkValidatorFunctions } from './network-validator-functions';

/**
 * Class to validate Customer Gateways
 */
export class CustomerGatewaysValidator {
  constructor(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
    customizationsConfig?: CustomizationsConfig,
  ) {
    //
    // Validate gateway load balancers deployment account names
    //
    this.validateCgwTargetAccounts(values, helpers, errors);
    //
    // Validate CGW configuration
    //
    this.validateCgwConfiguration(values, helpers, errors, customizationsConfig);
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
  private validateCgwConfiguration(
    values: NetworkConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
    customizationsConfig?: CustomizationsConfig,
  ) {
    for (const cgw of values.customerGateways ?? []) {
      if (cgw.asn < 1 || cgw.asn > 2147483647) {
        errors.push(`[Customer Gateway ${cgw.name}]: ASN ${cgw.asn} out of range 1-2147483647`);
      }
      // Validate CGW IP targets
      this.validateCgwIpTarget(cgw, helpers, errors, customizationsConfig);
      // Validate VPN configurations
      this.validateVpnConfiguration(cgw, values, helpers, errors);
    }
  }

  /**
   * Validates that the CGW is targeting
   * @param cgw CustomerGatewayConfig
   * @param helpers NetworkValidatorFunctions
   * @param errors string[]
   * @param customizationsConfig CustomizationsConfig | undefined
   */
  private validateCgwIpTarget(
    cgw: CustomerGatewayConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
    customizationsConfig?: CustomizationsConfig,
  ) {
    if (!helpers.isValidIpv4(cgw.ipAddress)) {
      if (!this.isValidFirewallReference(cgw, helpers, errors, customizationsConfig)) {
        errors.push(
          `[Customer Gateway ${cgw.name}]: IP address must either be a valid IPv4 address or EC2 firewall reference variable. Value entered: ${cgw.ipAddress}`,
        );
      }
    }
  }

  /**
   * Validates that the referenced firewall exists in customizations config
   * @param cgw CustomerGatewayConfig
   * @param helpers NetworkValidatorFunctions
   * @param errors string[]
   * @param customizationsConfig CustomizationsConfig | undefined
   * @returns boolean
   */
  private isValidFirewallReference(
    cgw: CustomerGatewayConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
    customizationsConfig?: CustomizationsConfig,
  ): boolean {
    //
    // Match variable pattern
    if (!helpers.matchesRegex(cgw.ipAddress, '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:.+}$')) {
      errors.push(
        `[Customer Gateway ${cgw.name}]: Incorrect EC2 firewall reference variable entered. Pattern accepted: "^\\$\{ACCEL_LOOKUP::EC2:ENI_\\d:.+}$" Value entered: ${cgw.ipAddress}`,
      );
      return false;
    } else {
      //
      // Check that customizations config is defined
      if (!customizationsConfig) {
        errors.push(
          `[Customer Gateway ${cgw.name}]: EC2 firewall reference variable entered but customizations-config.yaml is not defined.`,
        );
        return false;
      } else {
        //
        // Check that firewall exists
        const firewallName = cgw.ipAddress.split(':')[4].replace('}', '');
        const firewall = customizationsConfig.firewalls?.instances?.find(instance => instance.name === firewallName);
        if (!firewall) {
          errors.push(
            `[Customer Gateway ${cgw.name}]: EC2 firewall instance "${firewallName}" is not defined in customizations-config.yaml`,
          );
          return false;
        }
        //
        // Check device index for elastic IP
        this.validateFirewallInterface(cgw, firewall, errors);
      }
    }
    return true;
  }

  /**
   * Validates that the referenced network interface has an elastic IP associated
   * @param cgw CustomerGatewayConfig
   * @param firewall Ec2FirewallInstanceConfig
   * @param errors string[]
   */
  private validateFirewallInterface(cgw: CustomerGatewayConfig, firewall: Ec2FirewallInstanceConfig, errors: string[]) {
    if (!firewall.launchTemplate.networkInterfaces) {
      errors.push(
        `[Customer Gateway ${cgw.name}]: EC2 firewall instance "${firewall.name}" launch template does not have network interfaces defined in customizations-config.yaml`,
      );
    } else {
      const deviceIndex = Number(cgw.ipAddress.split(':')[3].split('_')[1]);
      if (deviceIndex > firewall.launchTemplate.networkInterfaces.length - 1) {
        errors.push(
          `[Customer Gateway ${cgw.name}]: EC2 firewall instance "${firewall.name}" device index ${deviceIndex} does not exist in customizations-config.yaml`,
        );
      } else {
        const networkInterface = firewall.launchTemplate.networkInterfaces[deviceIndex];
        if (!networkInterface.associateElasticIp) {
          errors.push(
            `[Customer Gateway ${cgw.name}]: EC2 firewall instance "${firewall.name}" device index ${deviceIndex} does not have the associateElasticIp property set in customizations-config.yaml`,
          );
        }
      }
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

      // Validate local/remote IP ranges
      this.validateVpnConnectionAllowedCidrs(cgw, vpn, helpers, errors);

      // Validate length of tunnel specifications
      this.validateTunnelSpecifications(cgw, vpn, helpers, errors);

      // Handle TGW and VGW Logic respectively
      if (vpn.vpc) {
        this.validateVirtualPrivateGatewayVpnConfiguration(cgw, vpn, helpers, errors);
      } else if (vpn.transitGateway) {
        this.validateTransitGatewayVpnConfiguration(cgw, vpn, values, errors);
      }
    });
  }

  /**
   * Validate VPN allowed CIDR ranges
   * @param cgw CustomerGatewayConfig
   * @param vpn VpnConnectionConfig
   * @param helpers NetworkValidatorFunctions
   * @param errors string[]
   */
  private validateVpnConnectionAllowedCidrs(
    cgw: CustomerGatewayConfig,
    vpn: VpnConnectionConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (vpn.amazonIpv4NetworkCidr && !helpers.isValidIpv4Cidr(vpn.amazonIpv4NetworkCidr)) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: Amazon allowed IPv4 network CIDR is not a valid CIDR range. Configured CIDR: ${vpn.amazonIpv4NetworkCidr}`,
      );
    }
    if (vpn.customerIpv4NetworkCidr && !helpers.isValidIpv4Cidr(vpn.customerIpv4NetworkCidr)) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: Customer allowed IPv4 network CIDR is not a valid CIDR range. Configured CIDR: ${vpn.amazonIpv4NetworkCidr}`,
      );
    }
  }

  /**
   * Validate VPN tunnel options specification
   * @param cgw CustomerGatewayConfig
   * @param vpn VpnConnectionConfig
   * @param helpers NetworkValidatorFunctions
   * @param errors string[]
   */
  private validateTunnelSpecifications(
    cgw: CustomerGatewayConfig,
    vpn: VpnConnectionConfig,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (vpn.tunnelSpecifications) {
      //
      // Validate only two tunnels are configured
      if (vpn.tunnelSpecifications.length < 2 || vpn.tunnelSpecifications.length > 2) {
        errors.push(
          `[Customer Gateway ${cgw.name} VPN connection ${vpn.name}]: tunnel specifications must have exactly 2 definitions`,
        );
      }
      vpn.tunnelSpecifications.forEach((tunnel, index) => {
        //
        // Validate tunnel options IKE/DPD timers
        this.validateTunnelOptionsTimers(cgw, vpn, tunnel, index, errors);
        //
        // Validate remaining tunnel options
        this.validateRemainingTunnelOptions(cgw, vpn, tunnel, index, errors);
        //
        // Validate tunnel IPs
        this.validateTunnelIps(cgw, vpn, tunnel, index, helpers, errors);
      });
    }
  }

  /**
   * Validates the various IKE/DPD timers for the tunnel
   * @param cgw CustomerGatewayConfig
   * @param vpn VpnConnectionConfig
   * @param tunnel VpnTunnelOptionsSpecificationsConfig
   * @param index number
   * @param errors string[]
   */
  private validateTunnelOptionsTimers(
    cgw: CustomerGatewayConfig,
    vpn: VpnConnectionConfig,
    tunnel: VpnTunnelOptionsSpecificationsConfig,
    index: number,
    errors: string[],
  ) {
    //
    // Validate DPD timeout
    if (tunnel.dpdTimeoutSeconds && tunnel.dpdTimeoutSeconds < 30) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: DPD timeout must be 30 seconds or higher. DPD timeout configured: ${tunnel.dpdTimeoutSeconds}`,
      );
    }
    //
    // Validate Phase 1 and 2 lifetimes
    if (
      tunnel.phase1?.lifetimeSeconds &&
      (tunnel.phase1.lifetimeSeconds < 900 || tunnel.phase1.lifetimeSeconds > 28800)
    ) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Phase 1 lifetime must be between 900 and 28800 seconds. Lifetime configured: ${tunnel.phase1.lifetimeSeconds}`,
      );
    }
    if (
      tunnel.phase2?.lifetimeSeconds &&
      (tunnel.phase2.lifetimeSeconds < 900 || tunnel.phase2.lifetimeSeconds > 3600)
    ) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Phase 2 lifetime must be between 900 and 3600 seconds. Lifetime configured: ${tunnel.phase2.lifetimeSeconds}`,
      );
    }
    //
    // Validate rekey margin time
    const p2Lifetime = tunnel.phase2?.lifetimeSeconds ?? 3600;
    if (
      tunnel.rekeyMarginTimeSeconds &&
      (tunnel.rekeyMarginTimeSeconds < 60 || tunnel.rekeyMarginTimeSeconds > p2Lifetime / 2)
    ) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Rekey margin time must be between 60 seconds and half of the configured Phase 2 lifetime. Rekey margin configured: ${tunnel.rekeyMarginTimeSeconds}. Phase 2 lifetime configured: ${p2Lifetime}`,
      );
    }
  }

  /**
   * Validates the remaining tunnel options
   * @param cgw CustomerGatewayConfig
   * @param vpn VpnConnectionConfig
   * @param tunnel VpnTunnelOptionsSpecificationsConfig
   * @param index number
   * @param errors string[]
   */
  private validateRemainingTunnelOptions(
    cgw: CustomerGatewayConfig,
    vpn: VpnConnectionConfig,
    tunnel: VpnTunnelOptionsSpecificationsConfig,
    index: number,
    errors: string[],
  ) {
    //
    // Validate rekey fuzz percentage
    if (tunnel.rekeyFuzzPercentage && (tunnel.rekeyFuzzPercentage < 0 || tunnel.rekeyFuzzPercentage > 100)) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Rekey fuzz percentage must be between 0 and 100 percent. Percentage configured: ${tunnel.rekeyFuzzPercentage}`,
      );
    }
    //
    // Validate replay window size
    if (tunnel.replayWindowSize && (tunnel.replayWindowSize < 64 || tunnel.replayWindowSize > 2048)) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Replay window size must be between 64 and 2048 packets. Window size configured: ${tunnel.replayWindowSize}`,
      );
    }
    //
    // Validate startup action is only used for IKEv2 tunnels
    const ikeVersions = tunnel.ikeVersions ?? [1, 2];
    if (tunnel.startupAction === 'start' && !ikeVersions.includes(2)) {
      errors.push(
        `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Startup action can only be modified on IKEv2 tunnels. IKE versions configured: ${ikeVersions}`,
      );
    }
  }

  /**
   * Validate tunnel inside IPv4 addresses
   * @param cgw CustomerGatewayConfig
   * @param vpn VpnConnectionConfig
   * @param tunnel VpnTunnelOptionsSpecificationsConfig
   * @param index number
   * @param helpers NetworkValidatorFunctions
   * @param errors string[]
   */
  private validateTunnelIps(
    cgw: CustomerGatewayConfig,
    vpn: VpnConnectionConfig,
    tunnel: VpnTunnelOptionsSpecificationsConfig,
    index: number,
    helpers: NetworkValidatorFunctions,
    errors: string[],
  ) {
    if (tunnel.tunnelInsideCidr) {
      //
      // Validate the tunnel CIDR is valid
      if (!helpers.isValidIpv4Cidr(tunnel.tunnelInsideCidr)) {
        errors.push(
          `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Tunnel inside CIDR must be a valid IPv4 CIDR range. CIDR configured: ${tunnel.tunnelInsideCidr}`,
        );
      } else {
        const tunnelCidrPool = IPv4CidrRange.fromCidr('169.254.0.0/16');
        const tunnelCidr = IPv4CidrRange.fromCidr(tunnel.tunnelInsideCidr);
        if (!tunnelCidr.inside(tunnelCidrPool)) {
          errors.push(
            `[Customer Gateway ${cgw.name} VPN connection ${vpn.name} tunnel ${index}]: Tunnel inside CIDR must be contained within the range 169.254.0.0/16. CIDR configured: ${tunnel.tunnelInsideCidr}`,
          );
        }
      }
    }
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
    } else {
      // Validate that the VPC referenced has a VGW attached
      if (!vpc.virtualPrivateGateway) {
        errors.push(
          `[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VPC ${vpn.vpc} referenced doesn't have an attached Virtual Private Gateway`,
        );
      }

      // Validate VPC account and CGW account match
      if (NetworkConfigTypes.vpcConfig.is(vpc) && vpc.account !== cgw.account) {
        errors.push(
          `[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VPC ${vpn.vpc} referenced does not reside in the same account as the CGW`,
        );
      }
      if (NetworkConfigTypes.vpcTemplatesConfig.is(vpc) && !helpers.getVpcAccountNames(vpc).includes(cgw.account)) {
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

      // Validate accelerated VPN is not enabled
      if (vpn.enableVpnAcceleration) {
        errors.push(
          `[Customer Gateway ${cgw.name} VPN Connection ${vpn.name}]: VGW VPN connections do not support VPN acceleration`,
        );
      }
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

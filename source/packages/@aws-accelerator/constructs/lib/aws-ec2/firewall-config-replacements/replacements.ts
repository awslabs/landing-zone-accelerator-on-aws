/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils';
import {
  DescribeInstancesCommand,
  DescribeSubnetsCommand,
  DescribeSubnetsCommandOutput,
  DescribeVpcsCommand,
  DescribeVpnConnectionsCommand,
  EC2Client,
  InstanceNetworkInterface,
  InstancePrivateIpAddress,
  TunnelOption,
} from '@aws-sdk/client-ec2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import { IPv4CidrRange } from 'ip-num';
import { FirewallReplacementOptions, IStaticReplacements } from './index';

/**
 * Describes a network interface
 */
interface INetworkInterface {
  /**
   * The device index of the interface
   */
  readonly deviceIndex: number;
  /**
   * The ID of the network interface
   */
  readonly interfaceId: string;
  /**
   * The primary private IP address of the interface
   */
  readonly primaryPrivateIp: string;
  /**
   * The subnet the ENI was deployed to
   */
  readonly subnet: ISubnet;
  /**
   * The primary public IP address of the interface
   */
  readonly primaryPublicIp?: string;
  /**
   * The secondary IP addresses of the interface
   *
   * @remarks
   * For mapping purposes, IPs are stored in the format `privateIp:publicIp`
   */
  readonly secondaryIps?: string[];
}

/**
 * Describes a VPC subnet
 */
interface ISubnet {
  /**
   * The logical name of the subnet
   */
  readonly name: string;
  /**
   * The network address of the subnet
   */
  readonly networkAddress: string;
  /**
   * The network mask of the subnet
   */
  readonly networkMask: string;
  /**
   * The router IP address of the subnet
   */
  readonly routerAddress: string;
  /**
   * The CIDR of the subnet
   */
  readonly subnetCidr: string;
  /**
   * The ID of the subnet
   */
  readonly subnetId: string;
}

/**
 * Describes a VPC CIDR range
 */
interface IVpcCidr {
  /**
   * The numerical index of the VPC CIDR
   */
  readonly index: number;
  /**
   * The network address of the VPC CIDR
   */
  readonly networkAddress: string;
  /**
   * The network mask of the VPC CIDR
   */
  readonly networkMask: string;
  /**
   * The router IP address of the VPC CIDR
   */
  readonly routerAddress: string;
  /**
   * The CIDR of the VPC
   */
  readonly vpcCidr: string;
}

/**
 * Describes a VPN tunnel
 */
interface IVpnTunnel {
  /**
   * AWS inside IP
   */
  readonly awsInsideIp: string;
  /**
   * AWS outside IP
   */
  readonly awsOutsideIp: string;
  /**
   * Customer gateway inside IP
   */
  readonly cgwInsideIp: string;
  /**
   * The pre-shared key
   */
  readonly preSharedKey: string;
  /**
   * Tunnel inside CIDR
   */
  readonly tunnelInsideCidr: string;
  /**
   * Tunnel inside netmask
   */
  readonly tunnelInsideNetmask: string;
}

/**
 * Describes a VPN connection
 */
interface IVpnConnection {
  /**
   * The name of the VPN connection
   */
  readonly name: string;
  /**
   * AWS BGP ASN
   */
  readonly awsBgpAsn: number;
  /**
   * Customer gateway BGP ASN
   */
  readonly cgwBgpAsn: number;
  /**
   * The customer gateway outside IP address
   */
  readonly cgwOutsideIp: string;
  /**
   * The VPN tunnel details
   */
  readonly tunnels: IVpnTunnel[];
}

/**
 * Describes VPN connection properties
 */
export interface VpnConnectionProps {
  /**
   * The name of the VPN connection
   */
  readonly name: string;
  /**
   * AWS BGP ASN
   */
  readonly awsBgpAsn: number;
  /**
   * Customer gateway BGP ASN
   */
  readonly cgwBgpAsn: number;
  /**
   * The customer gateway outside IP address
   */
  readonly cgwOutsideIp: string;
  /**
   * The VPN connection ID
   */
  readonly id: string;
  /**
   * The owning account ID, if different than the invoking account
   */
  readonly owningAccountId?: string;
  /**
   * The owning region, if different from the invoking region
   */
  readonly owningRegion?: string;
}

/**
 * Describes the regex patterns for replacement variables
 */
interface IReplacementRegex {
  /**
   * Hostname replacement regex
   */
  hostname: RegExp;
  /**
   * ENI match regex
   */
  eni: RegExp;
  /**
   * ENI private IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:PRIVATEIP_0}
   */
  eniPrivateIp: RegExp;
  /**
   * ENI public IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:PUBLICIP_0}
   */
  eniPublicIp: RegExp;
  /**
   * ENI subnet CIDR replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_CIDR}
   */
  eniSubnetCidr: RegExp;
  /**
   * ENI subnet mask replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_NETMASK}
   */
  eniSubnetMask: RegExp;
  /**
   * ENI subnet network IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_NETWORKIP}
   */
  eniSubnetNetIp: RegExp;
  /**
   * ENI subnet router IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_ROUTERIP}
   */
  eniSubnetRouterIp: RegExp;
  /**
   * Custom static replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::CUSTOM:KEY}
   */
  static: RegExp;
  /**
   * Subnet match regex
   */
  subnet: RegExp;
  /**
   * Subnet CIDR regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:CIDR:subnetName}
   */
  subnetCidr: RegExp;
  /**
   * Subnet netmask replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:NETMASK:subnetName}
   */
  subnetMask: RegExp;
  /**
   * Subnet network IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:NETWORKIP:subnetName}
   */
  subnetNetIp: RegExp;
  /**
   * Subnet router IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:ROUTERIP:subnetName}
   */
  subnetRouterIp: RegExp;
  /**
   * VPC match regex
   */
  vpc: RegExp;
  /**
   * VPC CIDR replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:CIDR_0}
   */
  vpcCidr: RegExp;
  /**
   * VPC netmask replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:NETMASK_0}
   */
  vpcNetmask: RegExp;
  /**
   * VPC network IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:NETWORKIP_0}
   */
  vpcNetIp: RegExp;
  /**
   * VPC router IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:ROUTERIP_0}
   */
  vpcRouterIp: RegExp;
  /**
   * VPN match regex
   */
  vpn: RegExp;
  /**
   * VPN AWS BGP ASN
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPN:AWS_BGPASN:vpnName}
   */
  vpnAwsBgpAsn: RegExp;
  /**
   * VPN tunnel AWS inside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:AWS_INSIDEIP_0:vpnName}
   */
  vpnAwsInsideIp: RegExp;
  /**
   * VPN tunnel AWS outside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:AWS_OUTSIDEIP_0:vpnName}
   */
  vpnAwsOutsideIp: RegExp;
  /**
   * VPN CGW BGP ASN
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPN:CGW_BGPASN:vpnName}
   */
  vpnCgwBgpAsn: RegExp;
  /**
   * VPN tunnel CGW inside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:CGW_INSIDEIP_0:vpnName}
   */
  vpnCgwInsideIp: RegExp;
  /**
   * VPN tunnel CGW outside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:CGW_OUTSIDEIP:vpnName}
   */
  vpnCgwOutsideIp: RegExp;
  /**
   * VPN tunnel inside CIDR
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:INSIDE_CIDR_0:vpnName}
   */
  vpnInsideCidr: RegExp;
  /**
   * VPN inside netmask
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:INSIDE_NETMASK_0:vpnName}
   */
  vpnInsideNetmask: RegExp;
  /**
   * VPN tunnel pre-shared key
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:PSK_0:vpnName}
   */
  vpnPsk: RegExp;
  /**
   * Secrets Manager secret match regex
   */
  secretsManager: RegExp;
}

/**
 * Describes a VPC with third-party firewall resources
 */
interface IFirewallReplacements {
  /**
   * The ID of the VPC
   */
  readonly vpcId: string;
  /**
   * The replacement regex patterns
   */
  readonly replacementRegex: IReplacementRegex;
  /**
   * The name of the firewall instance
   */
  readonly firewallName?: string;
  /**
   * The ID of the firewall instance
   */
  readonly instanceId?: string;
  /**
   * The role name used for cross-account VPN lookups
   */
  readonly roleName?: string;
  /**
   * Static key/value pair replacements defined for the firewall
   */
  readonly staticReplacements?: IStaticReplacements[];
  /**
   * VPN connection properties for VPN connections associated with this firewall
   */
  readonly vpnConnectionProps?: VpnConnectionProps[];
}

enum FirewallReplacementType {
  /**
   * ENI match regex
   */
  ENI = '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:.+}$',
  /**
   * ENI private IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:PRIVATEIP_0}
   */
  ENI_PRIVATEIP = '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:PRIVATEIP_\\d}$',
  /**
   * ENI public IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:PUBLICIP_0}
   */
  ENI_PUBLICIP = '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:PUBLICIP_\\d}$',
  /**
   * ENI subnet CIDR replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_CIDR}
   */
  ENI_SUBNET_CIDR = '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:SUBNET_CIDR}$',
  /**
   * ENI subnet mask replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_NETMASK}
   */
  ENI_SUBNET_MASK = '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:SUBNET_NETMASK}$',
  /**
   * ENI subnet network IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_NETWORKIP}
   */
  ENI_SUBNET_NETWORK_IP = '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:SUBNET_NETWORKIP}$',
  /**
   * ENI subnet router IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:ENI_0:SUBNET_ROUTERIP}
   */
  ENI_SUBNET_ROUTER_IP = '^\\${ACCEL_LOOKUP::EC2:ENI_\\d:SUBNET_ROUTERIP}$',
  /**
   * Hostname replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:INSTANCE:HOSTNAME}
   */
  HOSTNAME = '^\\${ACCEL_LOOKUP::EC2:INSTANCE:HOSTNAME}$',
  /**
   * Custom static replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::CUSTOM:KEY}
   */
  STATIC = '^\\${ACCEL_LOOKUP::CUSTOM:.+}$',
  /**
   * Subnet match regex
   */
  SUBNET = '^\\${ACCEL_LOOKUP::EC2:SUBNET:.+}$',
  /**
   * Subnet CIDR regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:CIDR:subnetName}
   */
  SUBNET_CIDR = '^\\${ACCEL_LOOKUP::EC2:SUBNET:CIDR:.+}$',
  /**
   * Subnet netmask replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:NETMASK:subnetName}
   */
  SUBNET_NETMASK = '^\\${ACCEL_LOOKUP::EC2:SUBNET:NETMASK:.+}$',
  /**
   * Subnet network IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:NETWORKIP:subnetName}
   */
  SUBNET_NETWORKIP = '^\\${ACCEL_LOOKUP::EC2:SUBNET:NETWORKIP:.+}$',
  /**
   * Subnet router IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:SUBNET:ROUTERIP:subnetName}
   */
  SUBNET_ROUTERIP = '^\\${ACCEL_LOOKUP::EC2:SUBNET:ROUTERIP:.+}$',
  /**
   * VPC match regex
   */
  VPC = '^\\${ACCEL_LOOKUP::EC2:VPC:.+}$',
  /**
   * VPC CIDR replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:CIDR_0}
   */
  VPC_CIDR = '^\\${ACCEL_LOOKUP::EC2:VPC:CIDR_\\d}$',
  /**
   * VPC netmask replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:NETMASK_0}
   */
  VPC_NETMASK = '^\\${ACCEL_LOOKUP::EC2:VPC:NETMASK_\\d}$',
  /**
   * VPC network IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:NETWORKIP_0}
   */
  VPC_NETWORKIP = '^\\${ACCEL_LOOKUP::EC2:VPC:NETWORKIP_\\d}$',
  /**
   * VPC router IP replacement regex
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPC:ROUTERIP_0}
   */
  VPC_ROUTERIP = '^\\${ACCEL_LOOKUP::EC2:VPC:ROUTERIP_\\d}$',
  /**
   * VPN match regex
   */
  VPN = '^\\${ACCEL_LOOKUP::EC2:VPN:.+}$',
  /**
   * VPN AWS BGP ASN
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPN:AWS_BGPASN:vpnName}
   */
  VPN_AWS_BGP_ASN = '^\\${ACCEL_LOOKUP::EC2:VPN:AWS_BGPASN:.+}$',
  /**
   * VPN tunnel AWS inside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:AWS_INSIDEIP_0:vpnName}
   */
  VPN_AWS_INSIDE_IP = '^\\${ACCEL_LOOKUP::EC2:VPN:AWS_INSIDEIP_\\d:.+}$',
  /**
   * VPN tunnel AWS outside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:AWS_OUTSIDEIP_0:vpnName}
   */
  VPN_AWS_OUTSIDE_IP = '^\\${ACCEL_LOOKUP::EC2:VPN:AWS_OUTSIDEIP_\\d:.+}$',
  /**
   * VPN CGW BGP ASN
   *
   * @example
   * ${ACCEL_LOOKUP::EC2:VPN:CGW_BGPASN:vpnName}
   */
  VPN_CGW_BGP_ASN = '^\\${ACCEL_LOOKUP::EC2:VPN:CGW_BGPASN:.+}$',
  /**
   * VPN tunnel CGW inside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:CGW_INSIDEIP_0:vpnName}
   */
  VPN_CGW_INSIDE_IP = '^\\${ACCEL_LOOKUP::EC2:VPN:CGW_INSIDEIP_\\d:.+}$',
  /**
   * VPN tunnel CGW outside IP
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:CGW_OUTSIDEIP:vpnName}
   */
  VPN_CGW_OUTSIDE_IP = '^\\${ACCEL_LOOKUP::EC2:VPN:CGW_OUTSIDEIP:.+}$',
  /**
   * VPN tunnel inside CIDR
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:INSIDE_CIDR_0:vpnName}
   */
  VPN_INSIDE_CIDR = '^\\${ACCEL_LOOKUP::EC2:VPN:INSIDE_CIDR_\\d:.+}$',
  /**
   * VPN inside netmask
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:INSIDE_NETMASK_0:vpnName}
   */
  VPN_INSIDE_NETMASK = '^\\${ACCEL_LOOKUP::EC2:VPN:INSIDE_NETMASK_\\d:.+}$',
  /**
   * VPN tunnel pre-shared key
   *
   * @example ${ACCEL_LOOKUP::EC2:VPN:PSK_0:vpnName}
   */
  VPN_PSK = '^\\${ACCEL_LOOKUP::EC2:VPN:PSK_\\d:.+}$',
  /**
   * Secrets Manager secret regex match
   *
   * @example ${ACCEL_LOOKUP::SECRETS_MANAGER:secretName}
   */
  SECRETS_MANAGER = '^\\${ACCEL_LOOKUP::SECRETS_MANAGER:.+}$',
}

/**
 * Class describing a VPC with third-party firewall resources
 */
export class FirewallReplacements implements IFirewallReplacements {
  private cidrs: VpcCidr[] = [];
  private networkInterfaces: NetworkInterface[] = [];
  private subnets: Subnet[] = [];
  private vpnConnections: VpnConnection[] = [];
  private readonly partition: string;
  private readonly secretsManagerClient: SecretsManagerClient;
  private readonly managementAccountId?: string;
  public readonly replacementRegex: IReplacementRegex;
  public readonly vpcId: string;
  public readonly firewallName?: string;
  public readonly instanceId?: string;
  public readonly roleName?: string;
  public readonly staticReplacements?: IStaticReplacements[];
  public readonly vpnConnectionProps?: VpnConnectionProps[];

  constructor(options: FirewallReplacementOptions) {
    this.replacementRegex = this.setReplacementRegex();
    this.partition = options.partition;
    this.vpcId = options.vpcId;
    this.firewallName = options.firewallName;
    this.instanceId = options.instanceId;
    this.roleName = options.roleName;
    this.staticReplacements = options.staticReplacements;
    this.vpnConnectionProps = options.vpnConnectionProps;
    this.secretsManagerClient = new SecretsManagerClient({ customUserAgent: process.env['SOLUTION_ID'] });
    this.managementAccountId = options.managementAccountId;
  }

  /**
   * Set replacement regex patterns
   * @returns IReplacementRegex
   */
  private setReplacementRegex(): IReplacementRegex {
    return {
      eni: new RegExp(FirewallReplacementType.ENI, 'i'),
      eniPrivateIp: new RegExp(FirewallReplacementType.ENI_PRIVATEIP, 'i'),
      eniPublicIp: new RegExp(FirewallReplacementType.ENI_PUBLICIP, 'i'),
      eniSubnetCidr: new RegExp(FirewallReplacementType.ENI_SUBNET_CIDR, 'i'),
      eniSubnetMask: new RegExp(FirewallReplacementType.ENI_SUBNET_MASK, 'i'),
      eniSubnetNetIp: new RegExp(FirewallReplacementType.ENI_SUBNET_NETWORK_IP, 'i'),
      eniSubnetRouterIp: new RegExp(FirewallReplacementType.ENI_SUBNET_ROUTER_IP, 'i'),
      hostname: new RegExp(FirewallReplacementType.HOSTNAME, 'i'),
      static: new RegExp(FirewallReplacementType.STATIC, 'i'),
      subnet: new RegExp(FirewallReplacementType.SUBNET, 'i'),
      subnetCidr: new RegExp(FirewallReplacementType.SUBNET_CIDR, 'i'),
      subnetMask: new RegExp(FirewallReplacementType.SUBNET_NETMASK, 'i'),
      subnetNetIp: new RegExp(FirewallReplacementType.SUBNET_NETWORKIP, 'i'),
      subnetRouterIp: new RegExp(FirewallReplacementType.SUBNET_ROUTERIP, 'i'),
      vpc: new RegExp(FirewallReplacementType.VPC, 'i'),
      vpcCidr: new RegExp(FirewallReplacementType.VPC_CIDR, 'i'),
      vpcNetIp: new RegExp(FirewallReplacementType.VPC_NETWORKIP, 'i'),
      vpcNetmask: new RegExp(FirewallReplacementType.VPC_NETMASK, 'i'),
      vpcRouterIp: new RegExp(FirewallReplacementType.VPC_ROUTERIP, 'i'),
      vpn: new RegExp(FirewallReplacementType.VPN, 'i'),
      vpnAwsBgpAsn: new RegExp(FirewallReplacementType.VPN_AWS_BGP_ASN, 'i'),
      vpnAwsInsideIp: new RegExp(FirewallReplacementType.VPN_AWS_INSIDE_IP, 'i'),
      vpnAwsOutsideIp: new RegExp(FirewallReplacementType.VPN_AWS_OUTSIDE_IP, 'i'),
      vpnCgwBgpAsn: new RegExp(FirewallReplacementType.VPN_CGW_BGP_ASN, 'i'),
      vpnCgwInsideIp: new RegExp(FirewallReplacementType.VPN_CGW_INSIDE_IP, 'i'),
      vpnCgwOutsideIp: new RegExp(FirewallReplacementType.VPN_CGW_OUTSIDE_IP, 'i'),
      vpnInsideCidr: new RegExp(FirewallReplacementType.VPN_INSIDE_CIDR, 'i'),
      vpnInsideNetmask: new RegExp(FirewallReplacementType.VPN_INSIDE_NETMASK, 'i'),
      vpnPsk: new RegExp(FirewallReplacementType.VPN_PSK, 'i'),
      secretsManager: new RegExp(FirewallReplacementType.SECRETS_MANAGER, 'i'),
    };
  }

  /**
   * Initialize the VPC replacements object
   * @param ec2Client EC2Client
   * @param serviceToken string
   * @returns Promise<FirewallReplacements>
   */
  public async init(ec2Client: EC2Client, serviceToken: string): Promise<FirewallReplacements> {
    //
    // Set VPC CIDR details
    await this.setVpcCidrDetails(ec2Client);
    //
    // Set subnet details
    await this.setVpcSubnetDetails(ec2Client);
    //
    // Set network interface details
    if (this.instanceId) {
      await this.setNetworkInterfaceDetails(ec2Client, this.instanceId);
    }
    //
    // Set up VPN replacements
    for (const vpnItem of this.vpnConnectionProps ?? []) {
      const vpn = new VpnConnection(vpnItem);
      this.vpnConnections.push(await vpn.init(vpnItem, serviceToken, this.roleName));
    }

    return this;
  }

  /**
   * Set VPC CIDR details
   * @param ec2Client EC2Client
   */
  private async setVpcCidrDetails(ec2Client: EC2Client): Promise<void> {
    let index = 0;
    //
    // Get VPC details
    console.log(`Retrieving VPC CIDR details for VPC ${this.vpcId}...`);
    try {
      const response = await throttlingBackOff(() => ec2Client.send(new DescribeVpcsCommand({ VpcIds: [this.vpcId] })));
      //
      // Add CIDRs to array
      if (!response.Vpcs) {
        throw new Error(`Unable to retrieve VPC details for VPC ${this.vpcId}`);
      }
      for (const association of response.Vpcs[0].CidrBlockAssociationSet ?? []) {
        if (!association.CidrBlock) {
          throw new Error(`Unable to retrieve CIDR block details for VPC ${this.vpcId}`);
        }
        this.addVpcCidr(index, association.CidrBlock);
        index += 1;
      }
    } catch (e) {
      throw new Error(`${e}`);
    }
  }

  /**
   * Get VPC subnet details
   * @param ec2Client EC2Client
   */
  private async setVpcSubnetDetails(ec2Client: EC2Client): Promise<void> {
    let nextToken: string | undefined = undefined;
    //
    // Get subnet details
    console.log(`Retrieving VPC subnet details for VPC ${this.vpcId}...`);
    try {
      do {
        const page = await throttlingBackOff(() =>
          ec2Client.send(
            new DescribeSubnetsCommand({ Filters: [{ Name: 'vpc-id', Values: [this.vpcId] }], NextToken: nextToken }),
          ),
        );
        //
        // Process page response
        this.processSubnets(page);

        nextToken = page.NextToken;
      } while (nextToken);
    } catch (e) {
      throw new Error(`${e}`);
    }
  }

  /**
   * Process describe subnets command output and add to array
   * @param subnetPage DescribeSubnetsCommandOutput
   */
  private processSubnets(subnetPage: DescribeSubnetsCommandOutput): void {
    for (const subnet of subnetPage.Subnets ?? []) {
      //
      // Validate response
      if (!subnet.CidrBlock) {
        throw new Error(`Unable to retrieve subnet CIDR details for VPC ${this.vpcId}`);
      }
      if (!subnet.SubnetId) {
        throw new Error(`Unable to retrieve subnet ID details for VPC ${this.vpcId}`);
      }
      const name = subnet.Tags?.find(tag => tag.Key === 'Name')?.Value ?? '';
      //
      // Add to subnet details array
      this.addSubnet(name, subnet.CidrBlock, subnet.SubnetId);
    }
  }

  /**
   * Set network interface details for the EC2 firewall
   * @param ec2Client EC2Client
   * @param instanceId string
   */
  private async setNetworkInterfaceDetails(ec2Client: EC2Client, instanceId: string): Promise<void> {
    //
    // Get instance details
    console.log(`Retrieving network interface details for firewall instance ${instanceId}...`);
    try {
      const response = await throttlingBackOff(() =>
        ec2Client.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] })),
      );
      //
      // Validate response
      if (!response.Reservations) {
        throw new Error(`Unable to retrieve instance details for instance ${instanceId}`);
      }
      if (!response.Reservations[0].Instances) {
        throw new Error(`Unable to retrieve instance details for instance ${instanceId}`);
      }
      //
      // Process interface details
      for (const eni of response.Reservations[0].Instances[0].NetworkInterfaces ?? []) {
        //
        // Add network interface
        const eniProps = this.processNetworkInterfaceDetails(eni, instanceId);
        this.addNetworkInterface(eniProps);
      }
    } catch (e) {
      throw new Error(`${e}`);
    }
  }

  /**
   * Process network interface property details
   * @param networkInterface InstanceNetworkInterface
   * @param instanceId string
   * @returns INetworkInterface
   */
  private processNetworkInterfaceDetails(
    networkInterface: InstanceNetworkInterface,
    instanceId: string,
  ): INetworkInterface {
    //
    // Validate device index
    if (networkInterface.Attachment?.DeviceIndex === undefined) {
      throw new Error(`Unable to retrieve network interface attachment details for instance ${instanceId}`);
    }
    //
    // Validate ENI ID
    if (!networkInterface.NetworkInterfaceId) {
      throw new Error(`Unable to retrieve network interface ID details for instance ${instanceId}`);
    }
    //
    // Validate primary private IP addresses
    if (!networkInterface.PrivateIpAddress) {
      throw new Error(`Unable to retrieve network interface IP details for instance ${instanceId}`);
    }
    //
    // Validate private IP addresses
    if (!networkInterface.PrivateIpAddresses) {
      throw new Error(`Unable to retrieve network interface IP details for instance ${instanceId}`);
    }
    //
    // Validate subnet ID
    if (!networkInterface.SubnetId) {
      throw new Error(`Unable to retrieve network interface subnet details for instance ${instanceId}`);
    }
    //
    // Return interface details
    return {
      deviceIndex: networkInterface.Attachment.DeviceIndex,
      interfaceId: networkInterface.NetworkInterfaceId,
      primaryPrivateIp: networkInterface.PrivateIpAddress,
      subnet: this.getSubnetById(networkInterface.SubnetId),
      primaryPublicIp: this.setPrimaryPublicIp(networkInterface.PrivateIpAddresses, instanceId),
      secondaryIps: this.setSecondaryIps(networkInterface.PrivateIpAddresses),
    };
  }

  /**
   * Set primary network interface public IP, if it exists
   * @param addresses InstancePrivateIpAddress[]
   * @param instanceId string
   * @returns string | undefined
   */
  private setPrimaryPublicIp(ipAddresses: InstancePrivateIpAddress[], instanceId: string): string | undefined {
    const primaryIp = ipAddresses.find(item => item.Primary);

    if (!primaryIp) {
      throw new Error(`Unable to retrieve primary network interface details for instance ${instanceId}`);
    }

    return primaryIp.Association?.PublicIp;
  }

  /**
   * Set secondary IP addresses, if they exist
   * @param addresses InstancePrivateIpAddress[]
   * @returns string[] | undefined
   */
  private setSecondaryIps(ipAddresses: InstancePrivateIpAddress[]): string[] | undefined {
    const secondaryIps = ipAddresses.filter(item => !item.Primary);
    let ipArray: string[] | undefined = undefined;

    if (secondaryIps.length > 0) {
      ipArray = [];
      for (const ip of secondaryIps) {
        ipArray.push(`${ip.PrivateIpAddress}:${ip.Association?.PublicIp}`);
      }
    }
    return ipArray;
  }

  /**
   * Mutator method to add VPC CIDR details to the VPC object
   * @param index number
   * @param cidr string
   */
  private addVpcCidr(index: number, cidr: string): void {
    this.cidrs.push(new VpcCidr(index, cidr));
  }

  /**
   * Mutator method to add subnets to the VPC object
   * @param subnetCidr string
   * @param subnetId string
   */
  private addSubnet(name: string, subnetCidr: string, subnetId: string): void {
    this.subnets.push(new Subnet(name, subnetCidr, subnetId));
  }

  /**
   * Adds a network interface definition to the VPC
   * @param eni {@link INetworkInterface}
   */
  private addNetworkInterface(eni: INetworkInterface): void {
    this.networkInterfaces.push(new NetworkInterface(eni));
  }

  /**
   * Accessor method to retrieve a VPC CIDR
   * @param index number
   * @returns VpcCidr
   */
  public getVpcCidr(index: number): VpcCidr {
    const vpcCidr = this.cidrs.find(cidrItem => cidrItem.index === index);

    if (!vpcCidr) {
      throw new Error(`VPC CIDR index ${index} does not exist in VPC ${this.vpcId}`);
    }

    return vpcCidr;
  }

  /**
   * Accessor method to retrieve a network interface
   * @param index number
   * @returns VpcCidr
   */
  public getNetworkInterface(index: number): NetworkInterface {
    const eni = this.networkInterfaces.find(eniItem => eniItem.deviceIndex === index);

    if (!eni) {
      throw new Error(`Network interface index ${index} does not exist in VPC ${this.vpcId}`);
    }

    return eni;
  }

  /**
   * Accessor method to retrieve a static replacement value
   * @param keyName string
   * @returns string
   */
  public getStaticReplacementByName(keyName: string): string {
    const replacement = this.staticReplacements?.find(staticItem => staticItem.key === keyName);

    if (!replacement) {
      throw new Error(
        `Static replacement with key name ${keyName} is not defined for this firewall in customizations-config.yaml`,
      );
    }

    return replacement.value;
  }

  /**
   * Accessor method to get a subnet by ID
   * @param subnetId string
   * @returns Subnet
   */
  public getSubnetById(subnetId: string): Subnet {
    const subnet = this.subnets.find(subnetItem => subnetItem.subnetId === subnetId);

    if (!subnet) {
      throw new Error(`Subnet ID ${subnetId} does not exist in VPC ${this.vpcId}`);
    }

    return subnet;
  }

  /**
   * Accessor method to get a subnet by logical name
   * @param name string
   * @returns Subnet
   */
  public getSubnetByName(name: string): Subnet {
    const subnet = this.subnets.find(subnetItem => subnetItem.name === name);

    if (!subnet) {
      throw new Error(`Subnet with Name tag ${name} does not exist in VPC ${this.vpcId}`);
    }

    return subnet;
  }

  /**
   * Accessor method to get a VPN connection by logical name
   * @param name string
   * @returns VpnConnection
   */
  public getVpnConnectionByName(name: string): VpnConnection {
    const vpn = this.vpnConnections.find(vpnItem => vpnItem.name === name);

    if (!vpn) {
      throw new Error(`VPN with Name tag ${name} is not connected to this firewall`);
    }

    return vpn;
  }

  /**
   * Process variable replacements
   * @param variables string[]
   * @returns string[]
   */
  public async processReplacements(variables: string[]): Promise<string[]> {
    const replacements: string[] = [];

    for (const variable of variables) {
      const replacement = this.processStaticReplacement(variable) ?? (await this.processDynamicReplacement(variable));

      if (!replacement) {
        throw new Error(
          `Unable to parse replacement variable ${variable}. Please verify the variable is using the correct syntax.`,
        );
      }
      replacements.push(replacement);
    }
    return replacements;
  }

  /**
   * Process a static replacement variable, or return undefined if no match
   * @param variable string
   * @returns string | undefined
   */
  private processStaticReplacement(variable: string): string | undefined {
    if (this.replacementRegex.hostname.test(variable)) {
      return this.firewallName ?? '';
    } else if (this.replacementRegex.static.test(variable)) {
      return this.processCustomStaticReplacement(variable);
    } else {
      return;
    }
  }

  /**
   * Process a custom static replacement variable
   * @param variable string
   * @returns string
   */
  private processCustomStaticReplacement(variable: string): string {
    try {
      const keyName = variable.split(':')[3].replace('}', '');
      return this.getStaticReplacementByName(keyName);
    } catch (e) {
      throw new Error(`Unable to process static replacement variable ${variable}. Error message: ${e}`);
    }
  }

  /**
   * Process a dynamic replacement variable, or return undefined if no match
   * @param variable string
   * @returns string | undefined
   */
  private async processDynamicReplacement(variable: string): Promise<string | undefined> {
    if (this.replacementRegex.vpc.test(variable)) {
      return this.processVpcReplacement(variable);
    } else if (this.replacementRegex.subnet.test(variable)) {
      return this.processSubnetReplacement(variable);
    } else if (this.replacementRegex.eni.test(variable)) {
      return this.processNetworkInterfaceReplacement(variable);
    } else if (this.replacementRegex.vpn.test(variable)) {
      return this.processVpnReplacement(variable);
    } else if (this.replacementRegex.secretsManager.test(variable)) {
      return this.processSecretsManagerReplacement(variable);
    } else {
      return;
    }
  }

  private async processSecretsManagerReplacement(variable: string): Promise<string> {
    try {
      const secretVariable = variable.split(':')[3].replace('}', '');
      const secretArn = this.managementAccountId
        ? `arn:${this.partition}:secretsmanager:${process.env['AWS_REGION']}:${this.managementAccountId}:secret:${secretVariable}`
        : secretVariable;
      const secretResponse = await this.secretsManagerClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
      return secretResponse.SecretString!;
    } catch (e) {
      throw new Error(`Unable to process Secret replacement variable ${variable}. Error message: ${e}`);
    }
  }

  /**
   * Process VPC replacements
   * @param variable string
   * @returns string
   */
  private processVpcReplacement(variable: string): string {
    //
    // Get VPC CIDR
    try {
      const index = Number(variable.split(':')[4].split('_')[1].replace('}', ''));
      const cidr = this.getVpcCidr(index);
      //
      // Return replacement
      if (this.replacementRegex.vpcCidr.test(variable)) {
        return cidr.vpcCidr;
      } else if (this.replacementRegex.vpcNetmask.test(variable)) {
        return cidr.networkMask;
      } else if (this.replacementRegex.vpcNetIp.test(variable)) {
        return cidr.networkAddress;
      } else if (this.replacementRegex.vpcRouterIp.test(variable)) {
        return cidr.routerAddress;
      } else {
        throw new Error(`Variable does not match accepted patterns. Please ensure it is using the correct syntax.`);
      }
    } catch (e) {
      throw new Error(`Unable to process VPC replacement variable ${variable}. Error message: ${e}`);
    }
  }

  /**
   * Process subnet replacements
   * @param variable string
   * @returns string
   */
  private processSubnetReplacement(variable: string): string {
    //
    // Get subnet
    try {
      const subnetName = variable.split(':')[5].replace('}', '');
      const subnet = this.getSubnetByName(subnetName);
      //
      // Return replacement
      if (this.replacementRegex.subnetCidr.test(variable)) {
        return subnet.subnetCidr;
      } else if (this.replacementRegex.subnetMask.test(variable)) {
        return subnet.networkMask;
      } else if (this.replacementRegex.subnetNetIp.test(variable)) {
        return subnet.networkAddress;
      } else if (this.replacementRegex.subnetRouterIp.test(variable)) {
        return subnet.routerAddress;
      } else {
        throw new Error(`Variable does not match accepted patterns. Please ensure it is using the correct syntax.`);
      }
    } catch (e) {
      throw new Error(`Unable to process subnet replacement variable ${variable}. Error message: ${e}`);
    }
  }

  /**
   * Process network interface replacements
   * @param variable string
   * @returns string
   */
  private processNetworkInterfaceReplacement(variable: string): string {
    try {
      //
      // Validate object state
      if (!this.instanceId) {
        throw new Error(`Network interface replacements are not supported for firewall AutoScaling Groups.`);
      }
      //
      // Get ENI
      const deviceIndex = Number(variable.split(':')[3].split('_')[1]);
      const eni = this.getNetworkInterface(deviceIndex);
      //
      // Return replacement
      if (this.replacementRegex.eniPrivateIp.test(variable)) {
        const addressIndex = Number(variable.split(':')[4].split('_')[1].replace('}', ''));
        return eni.getPrivateIpAddress(addressIndex);
      } else if (this.replacementRegex.eniPublicIp.test(variable)) {
        const addressIndex = Number(variable.split(':')[4].split('_')[1].replace('}', ''));
        return eni.getPublicIpAddress(addressIndex);
      } else {
        return this.processNetworkInterfaceSubnetReplacement(eni, variable);
      }
    } catch (e) {
      throw new Error(`Unable to process network interface replacement variable ${variable}. Error message: ${e}`);
    }
  }

  /**
   * Process ENI subnet replacements
   * @param eni {@link NetworkInterface}
   * @param variable string
   * @returns string
   */
  private processNetworkInterfaceSubnetReplacement(eni: NetworkInterface, variable: string): string {
    if (this.replacementRegex.eniSubnetCidr.test(variable)) {
      return eni.subnet.subnetCidr;
    } else if (this.replacementRegex.eniSubnetMask.test(variable)) {
      return eni.subnet.networkMask;
    } else if (this.replacementRegex.eniSubnetNetIp.test(variable)) {
      return eni.subnet.networkAddress;
    } else if (this.replacementRegex.eniSubnetRouterIp.test(variable)) {
      return eni.subnet.routerAddress;
    } else {
      throw new Error(`Variable does not match accepted patterns. Please ensure it is using the correct syntax.`);
    }
  }

  /**
   * Process VPN replacements
   * @param variable string
   * @returns string
   */
  private processVpnReplacement(variable: string): string {
    try {
      //
      // Get VPN connection object
      const vpnName = variable.split(':')[5].replace('}', '');
      const vpn = this.getVpnConnectionByName(vpnName);
      //
      // Return replacement
      if (this.replacementRegex.vpnAwsBgpAsn.test(variable)) {
        return vpn.awsBgpAsn.toString();
      } else if (this.replacementRegex.vpnCgwBgpAsn.test(variable)) {
        return vpn.cgwBgpAsn.toString();
      } else if (this.replacementRegex.vpnCgwOutsideIp.test(variable)) {
        return vpn.cgwOutsideIp;
      } else {
        return this.processVpnTunnelReplacement(vpn, variable);
      }
    } catch (e) {
      throw new Error(`Unable to process VPN replacement variable ${variable}. Error message: ${e}`);
    }
  }

  /**
   * Process VPN tunnel replacements
   * @param vpn VpnConnection
   * @param variable string
   * @returns string
   */
  private processVpnTunnelReplacement(vpn: VpnConnection, variable: string): string {
    const tunnelPskIndex = variable.split(':')[4].split('_')[1];
    const tunnelIpIndex = variable.split(':')[4].split('_')[2];

    if (this.replacementRegex.vpnAwsInsideIp.test(variable)) {
      return vpn.tunnels[Number(tunnelIpIndex)].awsInsideIp;
    } else if (this.replacementRegex.vpnAwsOutsideIp.test(variable)) {
      return vpn.tunnels[Number(tunnelIpIndex)].awsOutsideIp;
    } else if (this.replacementRegex.vpnCgwInsideIp.test(variable)) {
      return vpn.tunnels[Number(tunnelIpIndex)].cgwInsideIp;
    } else if (this.replacementRegex.vpnInsideCidr.test(variable)) {
      return vpn.tunnels[Number(tunnelIpIndex)].tunnelInsideCidr;
    } else if (this.replacementRegex.vpnInsideNetmask.test(variable)) {
      return vpn.tunnels[Number(tunnelIpIndex)].tunnelInsideNetmask;
    } else if (this.replacementRegex.vpnPsk.test(variable)) {
      return vpn.tunnels[Number(tunnelPskIndex)].preSharedKey;
    } else {
      throw new Error(`Variable does not match accepted patterns. Please ensure it is using the correct syntax.`);
    }
  }
}

/**
 * Class describing a VPC CIDR range
 */
class VpcCidr implements IVpcCidr {
  public readonly index: number;
  public readonly networkAddress: string;
  public readonly networkMask: string;
  public readonly routerAddress: string;
  public readonly vpcCidr: string;

  constructor(index: number, vpcCidr: string) {
    //
    // Set initial properties
    this.index = index;
    this.vpcCidr = vpcCidr;
    //
    // Set VPC CIDR
    const cidrRange = IPv4CidrRange.fromCidr(this.vpcCidr);
    //
    // Set additional properties
    this.networkAddress = cidrRange.getFirst().toString();
    this.networkMask = cidrRange.getPrefix().toMask().toString();
    this.routerAddress = cidrRange.getFirst().nextIPNumber().toString();
  }
}

/**
 * Class describing a VPC subnet
 */
class Subnet implements ISubnet {
  public readonly name: string;
  public readonly networkAddress: string;
  public readonly networkMask: string;
  public readonly routerAddress: string;
  public readonly subnetCidr: string;
  public readonly subnetId: string;

  constructor(name: string, subnetCidr: string, subnetId: string) {
    //
    // Set initial properties
    this.name = name;
    this.subnetCidr = subnetCidr;
    this.subnetId = subnetId;
    //
    // Set subnet CIDR
    const cidrRange = IPv4CidrRange.fromCidr(this.subnetCidr);
    //
    // Set additional properties
    this.networkAddress = cidrRange.getFirst().toString();
    this.networkMask = cidrRange.getPrefix().toMask().toString();
    this.routerAddress = cidrRange.getFirst().nextIPNumber().toString();
  }
}

/**
 * Class describing an elastic network interface
 */
class NetworkInterface implements INetworkInterface {
  public readonly deviceIndex: number;
  public readonly interfaceId: string;
  public readonly primaryPrivateIp: string;
  public readonly subnet: Subnet;
  public readonly primaryPublicIp?: string;
  public readonly secondaryIps?: string[];

  constructor(props: INetworkInterface) {
    this.deviceIndex = props.deviceIndex;
    this.interfaceId = props.interfaceId;
    this.primaryPrivateIp = props.primaryPrivateIp;
    this.subnet = props.subnet;
    this.primaryPublicIp = props.primaryPublicIp;
    this.secondaryIps = props.secondaryIps;
  }

  /**
   * Accessor method to get a private IP address from
   * a network interface
   * @param index
   * @returns string
   */
  public getPrivateIpAddress(index: number): string {
    if (index === 0) {
      return this.primaryPrivateIp;
    } else {
      if (!this.secondaryIps) {
        throw new Error(`Private IP index ${index} does not exist on network interface ${this.interfaceId}`);
      }
      try {
        return this.secondaryIps[index - 1].split(':')[0];
      } catch (e) {
        throw new Error(`Private IP index ${index} does not exist on network interface ${this.interfaceId}`);
      }
    }
  }

  /**
   * Accessor method to get a public IP address from
   * a network interface
   * @param index
   * @returns string
   */
  public getPublicIpAddress(index: number): string {
    if (index === 0) {
      if (!this.primaryPublicIp) {
        throw new Error(`Public IP index ${index} does not exist on network interface ${this.interfaceId}`);
      }
      return this.primaryPublicIp;
    } else {
      if (!this.secondaryIps) {
        throw new Error(`Public IP index ${index} does not exist on network interface ${this.interfaceId}`);
      }
      try {
        return this.secondaryIps[index - 1].split(':')[1];
      } catch (e) {
        throw new Error(`Public IP index ${index} does not exist on network interface ${this.interfaceId}`);
      }
    }
  }
}

/**
 * Class describing a VPN connection
 */
class VpnConnection implements IVpnConnection {
  public readonly name: string;
  public readonly awsBgpAsn: number;
  public readonly cgwBgpAsn: number;
  public readonly cgwOutsideIp: string;
  public readonly tunnels: IVpnTunnel[] = [];

  constructor(props: VpnConnectionProps) {
    //
    // Set initial props
    this.name = props.name;
    this.awsBgpAsn = props.awsBgpAsn;
    this.cgwBgpAsn = props.cgwBgpAsn;
    this.cgwOutsideIp = props.cgwOutsideIp;
  }

  /**
   * Initialize VPN tunnel details
   * @param props VpnConnectionProps
   * @param serviceToken string
   * @param roleName string | undefined
   * @returns Promise<VpnConnection>
   */
  public async init(props: VpnConnectionProps, serviceToken: string, roleName?: string): Promise<VpnConnection> {
    //
    // Set up EC2 client
    const invokingRegion = serviceToken.split(':')[3];
    const partition = serviceToken.split(':')[1];
    const ec2Client = await this.setEc2Client(props, invokingRegion, partition, roleName);
    //
    // Set VPN tunnels
    this.tunnels.push(...(await this.setVpnTunnels(ec2Client, props.id)));

    return this;
  }

  /**
   * Returns a local or cross-account/cross-region EC2 client based on input parameters
   * @param props VpnConnectionProps
   * @param invokingRegion string
   * @param partition string
   * @param roleName string | undefined
   * @returns Promise<EC2Client>
   */
  private async setEc2Client(
    props: VpnConnectionProps,
    invokingRegion: string,
    partition: string,
    roleName?: string,
  ): Promise<EC2Client> {
    const roleArn = `arn:${partition}:iam::${props.owningAccountId}:role/${roleName}`;
    const solutionId = process.env['SOLUTION_ID'];
    const stsClient = new STSClient({ region: invokingRegion, customUserAgent: solutionId });

    if (props.owningAccountId && props.owningRegion) {
      if (!roleName) {
        throw new Error(`Cross-account VPN required but roleName parameter is undefined`);
      }
      //
      // Assume role via STS
      const credentials = await this.getStsCredentials(stsClient, roleArn);
      //
      // Return EC2 client
      return new EC2Client({
        region: props.owningRegion,
        customUserAgent: solutionId,
        credentials,
      });
    } else if (props.owningAccountId && !props.owningRegion) {
      if (!roleName) {
        throw new Error(`Cross-account CGW required but roleName parameter is undefined`);
      }
      //
      // Assume role via STS
      const credentials = await this.getStsCredentials(stsClient, roleArn);
      //
      // Return EC2 client
      return new EC2Client({
        region: invokingRegion,
        customUserAgent: solutionId,
        credentials,
      });
    } else {
      return new EC2Client({
        region: props.owningRegion ?? invokingRegion,
        customUserAgent: solutionId,
      });
    }
  }

  /**
   * Returns STS credentials for a given role ARN
   * @param stsClient STSClient
   * @param roleArn string
   * @returns `Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }>`
   */
  private async getStsCredentials(
    stsClient: STSClient,
    roleArn: string,
  ): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken: string }> {
    console.log(`Assuming role ${roleArn}...`);
    try {
      const response = await throttlingBackOff(() =>
        stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'AcceleratorAssumeRole' })),
      );
      //
      // Validate response
      if (!response.Credentials?.AccessKeyId) {
        throw new Error(`Access key ID not returned from AssumeRole command`);
      }
      if (!response.Credentials.SecretAccessKey) {
        throw new Error(`Secret access key not returned from AssumeRole command`);
      }
      if (!response.Credentials.SessionToken) {
        throw new Error(`Session token not returned from AssumeRole command`);
      }

      return {
        accessKeyId: response.Credentials.AccessKeyId,
        secretAccessKey: response.Credentials.SecretAccessKey,
        sessionToken: response.Credentials.SessionToken,
      };
    } catch (e) {
      throw new Error(`Could not assume role: ${e}`);
    }
  }

  /**
   * Process and return an array of IVpnTunnel objects
   * @param ec2Client EC2Client
   * @param vpnConnectionId string
   * @returns Promise<IVpnTunnel[]>
   */
  private async setVpnTunnels(ec2Client: EC2Client, vpnConnectionId: string): Promise<IVpnTunnel[]> {
    const tunnels: IVpnTunnel[] = [];

    console.log(`Retrieving VPN connection details for ${this.name} (${vpnConnectionId})...`);
    try {
      const response = await throttlingBackOff(() =>
        ec2Client.send(new DescribeVpnConnectionsCommand({ VpnConnectionIds: [vpnConnectionId] })),
      );

      if (!response.VpnConnections) {
        throw new Error(`VPN connection details not returned from DescribeVpnConnections command`);
      }
      if (!response.VpnConnections[0].Options) {
        throw new Error(`VPN connection options not returned from DescribeVpnConnections command`);
      }
      if (!response.VpnConnections[0].Options.TunnelOptions) {
        throw new Error(`VPN tunnel options not returned from DescribeVpnConnections command`);
      }
      //
      // Process tunnel options
      for (const tunnelItem of response.VpnConnections[0].Options.TunnelOptions) {
        tunnels.push(this.processTunnelOptions(tunnelItem));
      }

      return tunnels;
    } catch (e) {
      throw new Error(`Unable to process VPN connection ${this.name}: ${e}`);
    }
  }

  /**
   * Process tunnel options for a VPN tunnel and return an IVpnTunnel
   * @param tunnelOption TunnelOption
   * @returns IVpnTunnel
   */
  private processTunnelOptions(tunnelOption: TunnelOption): IVpnTunnel {
    //
    // Validate response object
    if (!tunnelOption.TunnelInsideCidr) {
      throw new Error(`VPN tunnel inside CIDR not returned from DescribeVpnConnections command`);
    }
    if (!tunnelOption.OutsideIpAddress) {
      throw new Error(`VPN tunnel outside IP not returned from DescribeVpnConnections command`);
    }
    if (!tunnelOption.PreSharedKey) {
      throw new Error(`VPN tunnel PSK not returned from DescribeVpnConnections command`);
    }
    //
    // Set inside IP CIDR and tunnel IPs
    const insideCidr = IPv4CidrRange.fromCidr(tunnelOption.TunnelInsideCidr);
    const awsInsideIp = insideCidr.getFirst().nextIPNumber();
    const cgwInsideIp = awsInsideIp.nextIPNumber();

    return {
      awsInsideIp: awsInsideIp.toString(),
      awsOutsideIp: tunnelOption.OutsideIpAddress,
      cgwInsideIp: cgwInsideIp.toString(),
      preSharedKey: tunnelOption.PreSharedKey,
      tunnelInsideCidr: insideCidr.toCidrString(),
      tunnelInsideNetmask: insideCidr.getPrefix().toMask().toString(),
    };
  }
}

/**
 * Initialize the firewall replacements object
 * @param ec2Client EC2Client
 * @param serviceToken string
 * @param options FirewallReplacementOptions
 * @returns FirewallReplacements
 */
export async function initReplacements(
  ec2Client: EC2Client,
  serviceToken: string,
  options: FirewallReplacementOptions,
): Promise<FirewallReplacements> {
  const replacements = new FirewallReplacements(options);
  await replacements.init(ec2Client, serviceToken);
  return replacements;
}

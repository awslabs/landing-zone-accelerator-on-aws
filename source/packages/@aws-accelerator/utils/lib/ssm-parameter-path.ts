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

export enum SsmResourceType {
  /**
   * Accelerator parameters
   */
  /**
   * Accelerator stack ID
   *
   * `${0}` is replaced with the stack name
   */
  STACK_ID = '/${0}/stack-id',
  /**
   * Accelerator version
   *
   * `${0}` is replaced with the stack name
   */
  VERSION = '/${0}/version',
  /**
   * Global network resources
   */
  /**
   * ACM certificate ARN
   *
   * `${0}` is replaced with the certificate name
   */
  ACM_CERT = '/acm/${0}/arn',
  /**
   * Customer gateway ID
   *
   * `${0}` is replaced with the customer gateway name
   */
  CGW = '/network/customerGateways/${0}/id',
  /**
   * Direct Connect Gateway ID
   *
   * `${0}` is replaced with the direct connect gateway name
   */
  DXGW = '/network/directConnectGateways/${0}/id',
  /**
   * Direct Connect virtual interface ID
   *
   * `${0}` is replaced with the direct connect gateway name
   *
   * `${1}` is replaced with the virtual interface name
   */
  DXVIF = '/network/directConnectGateways/${0}/virtualInterfaces/${1}/id',
  /**
   * Accelerator SCP ID
   *
   * `${0}` is replaced with the scp name
   */
  SCP = '/organizations/scp/${0}/id',
  /**
   * Transit Gateway ID
   *
   * `${0}` is replaced with the transit gateway name
   */
  TGW = '/network/transitGateways/${0}/id',
  /**
   * Transit Gateway peering ID
   *
   * `${0}` is replaced with the transit gateway name for either the requester or accepter TGW
   * (depending on account we're putting the parameter to)
   *
   * `${1}` is replaced with the transit gateway peering name
   */
  TGW_PEERING = '/network/transitGateways/${0}/peering/${1}/id',
  /**
   * Transit Gateway route table ID
   *
   * `${0}` is replaced with the transit gateway name
   *
   * `${1}` is replaced with the route table name
   */
  TGW_ROUTE_TABLE = '/network/transitGateways/${0}/routeTables/${1}/id',
  /**
   * Transit Gateway VPN attachment ID
   *
   * `${0}` is replaced with the VPN connection name
   */
  TGW_VPN = '/network/vpnConnection/${0}/id',
  /**
   * Prefix list ID
   *
   * `${0}` is replaced with the prefix list name
   */
  PREFIX_LIST = '/network/prefixList/${0}/id',
  /**
   * VPC Resources
   */
  /**
   * VPC ID
   *
   * `${0}` is  replaced with the VPC name
   */
  VPC = '/network/vpc/${0}/id',
  /**
   * VPC Endpoint ID
   *
   * `${0}` is  replaced with the VPC name
   *
   * `${1} is replaced with the service name
   */
  VPC_ENDPOINT = '/network/vpc/${0}/endpoint/${1}/id',
  /**
   * VPC peering connection ID
   *
   * `${0}` is replaced with the VPC peering name
   *
   */
  VPC_PEERING = '/network/vpcPeering/${0}/id',
  /**
   * Internet gateway ID
   *
   * `${0}` is replaced with the VPC name
   *
   */
  IGW = '/network/vpc/${0}/internetGateway/id',
  /**
   * Virtual Private gateway ID
   *
   * `${0}` is replaced with the VPC name
   *
   */
  VPN_GW = '/network/vpc/${0}/virtualPrivateGateway/id',
  /**
   * Subnet ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1} is replaced with the subnet name
   */
  /**
   * Subnet ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1} is replaced with the subnet name
   */
  SUBNET = '/network/vpc/${0}/subnet/${1}/id',
  /**
   * Route table ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the route table name
   */
  ROUTE_TABLE = '/network/vpc/${0}/routeTable/${1}/id',
  /**
   * Security group ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the security group name
   */
  SECURITY_GROUP = '/network/vpc/${0}/securityGroup/${1}/id',
  /**
   * Network ACL ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the network ACL name
   */
  NACL = '/network/vpc/${0}/networkAcl/${1}/id',
  /**
   * NAT gateway ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the NAT gateway name
   */
  NAT_GW = '/network/vpc/${0}/natGateway/${1}/id',
  /**
   * Transit gateway VPC attachment ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the transit gateway attachment name
   */
  TGW_ATTACHMENT = '/network/vpc/${0}/transitGatewayAttachment/${1}/id',
  /**
   * Route53 resources
   */
  /**
   * Route 53 DNS firewall rule group ID
   *
   * `${0}` is replaced with the DNS firewall rule group name
   */
  DNS_RULE_GROUP = '/network/route53Resolver/firewall/ruleGroups/${0}/id',
  /**
   * Interface endpoint DNS name
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the interface endpoint service name
   */
  ENDPOINT_DNS = '/network/vpc/${0}/endpoints/${1}/dns',
  /**
   * Interface endpoint hosted zone ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the interface endpoint service name
   */
  ENDPOINT_ZONE_ID = '/network/vpc/${0}/endpoints/${1}/hostedZoneId',
  /**
   * Private hosted zone ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the interface endpoint service name
   */
  PHZ_ID = '/network/vpc/${0}/route53/hostedZone/${1}/id',
  /**
   * Route 53 query logs configuration ID\
   *
   * `${0}` is replaced with the query logs configuration name
   */
  QUERY_LOGS = '/network/route53Resolver/queryLogConfigs/${0}/id',
  /**
   * Route 53 resolver endpoint ID
   *
   * `${0}` is replaced with the resolver endpoint name
   */
  RESOLVER_ENDPOINT = '/network/route53Resolver/endpoints/${0}/id',
  /**
   * Route 53 resolver rule ID
   *
   * `${0}` is replaced with the resolver rule name
   */
  RESOLVER_RULE = '/network/route53Resolver/rules/${0}/id',
  /**
   * Central Network Services
   */
  /**
   * VPC IPAM ID
   *
   * `${0}` is replaced with the IPAM name
   */
  IPAM = '/network/ipam/${0}/id',
  /**
   * VPC IPAM pool ID
   *
   * `${0}` is replaced with the IPAM pool name
   */
  IPAM_POOL = '/network/ipam/pools/${0}/id',
  /**
   * VPC IPAM scope ID
   *
   * `${0}` is replaced with the IPAM scope name
   */
  IPAM_SCOPE = '/network/ipam/scopes/${0}/id',
  /**
   * Network firewall ARN
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the network firewall name
   */
  NFW = '/network/vpc/${0}/networkFirewall/${1}/arn',
  /**
   * Network firewall policy ARN
   *
   * `${0}` is replaced with the network firewall policy name
   */
  NFW_POLICY = '/network/networkFirewall/policies/${0}/arn',
  /**
   * Network firewall rule group ARN
   *
   * `${0}` is replaced with the rule group name
   */
  NFW_RULE_GROUP = '/network/networkFirewall/ruleGroups/${0}/arn',
  /**
   * Load balancers
   */
  /**
   * Application load balancer ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the application load balancer name
   */
  ALB = '/network/vpc/${0}/alb/${1}/id',
  /**
   * Network load balancer ID
   *
   * `${0}` is replaced with the VPC name
   *
   * `${1}` is replaced with the network load balancer name
   */
  NLB = '/network/vpc/${0}/nlb/${1}/id',
  /**
   * Gateway load balancer ARN
   *
   * `${0}` is replaced with the gateway load balancer name
   */
  GWLB_ARN = '/network/gwlb/${0}/arn',
  /**
   * Gateway load balancer endpoint service ID
   *
   * `${0}` is replaced with the gateway load balancer name
   */
  GWLB_SERVICE = '/network/gwlb/${0}/endpointService/id',
  /**
   * Applications
   */
  /**
   * Target group
   *
   * `${0}` is replaced with the application name
   *
   * `${1}` is replaced with the VPC name
   *
   * `${2}` is replaced with the target group name
   */
  TARGET_GROUP = '/application/targetGroup/${0}/${1}/${2}/arn',
  /**
   * IAM
   */
  /**
   * IAM Role Arn
   *
   * `${0}` is  replaced with the IAM Role name
   */
  IAM_ROLE = '/iam/role/${0}/arn',
  /**
   * IAM Managed Policy Arn
   *
   * `${0}` is  replaced with the IAM Managed Policy name
   */
  IAM_POLICY = '/iam/policy/${0}/arn',
  /**
   * IAM Group Arn
   *
   * `${0}` is  replaced with the IAM Group name
   */
  IAM_GROUP = '/iam/group/${0}/arn',
  /**
   * IAM User Arn
   *
   * `${0}` is  replaced with the IAM Username
   */
  IAM_USER = '/iam/user/${0}/arn',
  /**
   * EC2 firewall dependency resources
   */
  /**
   * Prefix list ID (for cross-account EC2 firewall CGWs)
   * `${0}` is replaced with the CGW name
   * `${1}` is replaced with the prefix list name
   */
  CROSS_ACCOUNT_PREFIX_LIST = '/network/customerGateways/${0}/prefixList/${1}/id',
  /**
   * Cross-account TGW ID (for cross-account EC2 firewall CGWs)
   *
   * `${0}` is replaced with the CGW name
   * `${1}` is replaced with the TGW name
   */
  CROSS_ACCOUNT_TGW = '/network/customerGateways/${0}/transitGateways/${1}/id',
  /**
   * Cross-account TGW route table ID (for cross-account EC2 firewall CGWs)
   *
   * `${0}` is replaced with the CGW name
   * `${1}` is replaced with the TGW name
   * `${2}` is replaced with the TGW route table name
   */
  CROSS_ACCOUNT_TGW_ROUTE_TABLE = '/network/customerGateways/${0}/transitGateways/${1}/routeTables/${2}/id',
  /**
   * Cross-account VGW ID (for cross-account EC2 firewall CGWs)
   *
   * `${0}` is replaced with the CGW name
   * `${1}` is replaced with the VPC name
   */
  CROSS_ACCOUNT_VGW = '/network/customerGateways/${0}/virtualPrivateGateway/${1}/id',
  /**
   * SSM Resource Data Sync Name
   *
   * `${0}` is replaced with the Resource Data Sync Name
   */
  RESOURCE_DATA_SYNC = '/ssm/resourceDataSync/${0}',
  /**
   * SSM Association Name
   * `${0}` is replaced with the Resource Data Sync Name
   */
  ASSOCIATION = '/ssm/association/${0}',
}

export class SsmParameterPath {
  public readonly parameterPath: string;

  constructor(ssmPrefix: string, resourceType: SsmResourceType, replacements: string[]) {
    // Transform SSM path using replacement strings
    this.parameterPath = this.transformPath(ssmPrefix, resourceType, replacements);
  }

  /**
   * Transforms SSM path based on given prefix and replacement values
   * @param prefix
   * @param rawPath
   * @param replacements
   * @returns
   */
  private transformPath(prefix: string, rawPath: string, replacements: string[]): string {
    let param = rawPath;
    let i = 0;

    for (const value of replacements) {
      param = param.replace(new RegExp(`\\$\\{${i}\\}`, 'g'), value);
      i += 1;
    }
    return prefix + param;
  }
}

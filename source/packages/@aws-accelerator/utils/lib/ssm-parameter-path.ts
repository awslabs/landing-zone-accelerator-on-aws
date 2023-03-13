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
   * Accelerator paramaeters
   */
  STACK_ID = '/${0}/stack-id',
  VERSION = '/${0}/version',
  /**
   * Global network resources
   */
  ACM_CERT = '/acm/${0}/arn',
  CGW = '/network/customerGateways/${0}/id',
  DXGW = '/network/directConnectGateways/${0}/id',
  DXVIF = '/network/directConnectGateways/${0}/virtualInterfaces/${1}/id',
  TGW = '/network/transitGateways/${0}/id',
  TGW_PEERING = '/network/transitGateways/${0}/peering/${1}/id',
  TGW_ROUTE_TABLE = '/network/transitGateways/${0}/routeTables/${1}/id',
  TGW_VPN = '/network/vpnConnection/${0}/id',
  PREFIX_LIST = '/network/prefixList/${0}/id',
  /**
   * VPC Resources
   */
  VPC = '/network/vpc/${0}/id',
  VPC_PEERING = '/network/vpcPeering/${0}/id',
  SUBNET = '/network/vpc/${0}/subnet/${1}/id',
  ROUTE_TABLE = '/network/vpc/${0}/routeTable/${1}/id',
  SECURITY_GROUP = '/network/vpc/${0}/securityGroup/${1}/id',
  NACL = '/network/vpc/${0}/networkAcl/${1}/id',
  NAT_GW = '/network/vpc/${0}/natGateway/${1}/id',
  TGW_ATTACHMENT = '/network/vpc/${0}/transitGatewayAttachment/${1}/id',
  /**
   * Route53 resources
   */
  DNS_RULE_GROUP = '/network/route53Resolver/firewall/ruleGroups/${0}/id',
  ENDPOINT_DNS = '/network/vpc/${0}/endpoints/${1}/dns',
  ENDPOINT_ZONE_ID = '/network/vpc/${0}/endpoints/${1}/hostedZoneId',
  PHZ_ID = '/network/vpc/${0}/route53/hostedZone/${1}/id',
  QUERY_LOGS = '/network/route53Resolver/queryLogConfigs/${0}/id',
  RESOLVER_ENDPOINT = '/network/route53Resolver/endpoints/${0}/id',
  RESOLVER_RULE = '/network/route53Resolver/rules/${0}/id',
  /**
   * Central Network Services
   */
  IPAM = '/network/ipam/${0}/id',
  IPAM_POOL = '/network/ipam/pools/${0}/id',
  IPAM_SCOPE = '/network/ipam/scopes/${0}/id',
  NFW = '/network/vpc/${0}/networkFirewall/${1}/arn',
  NFW_POLICY = '/network/networkFirewall/policies/${0}/arn',
  NFW_RULE_GROUP = '/network/networkFirewall/ruleGroups/${0}/arn',
  /**
   * Load balancers
   */
  ALB = '/network/vpc/${0}/alb/${1}/id',
  NLB = '/network/vpc/${0}/nlb/${1}/id',
  GWLB_ARN = '/network/gwlb/${0}/arn',
  GWLB_SERVICE = '/network/gwlb/${0}/endpointService/id',
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

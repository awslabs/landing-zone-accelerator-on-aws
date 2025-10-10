/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

/**
 * List of network resources to be deployed by V2 stacks
 */
export enum V2StackComponentsList {
  VPC = 'vpc',
  S3_FLOW_LOGS = 's3-flow-logs',
  CWL_FLOW_LOGS = 'cwl-flow-logs',
  ADDITIONAL_CIDR_BLOCK = 'additional-cidr-block',
  ADDITIONAL_IPAM_ALLOCATION = 'additional-ipam-allocation',
  EGRESS_ONLY_IGW = 'egress-only-igw',
  INTERNET_GATEWAY = 'internet-gateway',
  INTERNET_GATEWAY_ATTACHMENT = 'internet-gateway-attachment',
  VIRTUAL_PRIVATE_GATEWAY = 'virtual-private-gateway',
  VIRTUAL_PRIVATE_GATEWAY_ATTACHMENT = 'virtual-private-gateway-attachment',
  VPC_DHCP_OPTIONS_ASSOCIATION = 'vpc-dhcp-options-association',
  DELETE_DEFAULT_SECURITY_GROUP_RULES = 'delete-default-security-groups-rules',
  VPN_CONNECTION = 'vpn-connection',
  CROSS_ACCOUNT_VPN_CONNECTION_PARAMETERS = 'cross-account-vpn-connection-parameters',

  ROUTE_TABLE = 'route-table',
  ROUTE_ENTRY = 'route-entry',
  ROUTE_TABLE_GATEWAY_ASSOCIATION = 'route-table-gateway-association',
  LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION = 'local-gateway-route-table-vpc-association',

  SECURITY_GROUP = 'security-groups',
  SECURITY_GROUP_INBOUND_RULE = 'security-group-inbound-rule',
  SECURITY_GROUP_OUTBOUND_RULE = 'security-group-outbound-rule',

  SUBNET = 'subnet',
  SUBNET_ROUTE_TABLE_ASSOCIATION = 'subnet-route-table-association',
  NAT_GATEWAY = 'nat-gateway',
  TGW_VPC_ATTACHMENT_ROLE = 'tgw-vpc-attachment-role',
  TGW_VPC_ATTACHMENT = 'tgw-vpc-attachment',

  SUBNET_SHARE = 'subnet-share',

  NETWORK_ACL = 'network-acl',
  NETWORK_ACL_SUBNET_ASSOCIATION = 'network-acl-subnet-association',
  NETWORK_ACL_INBOUND_ENTRY = 'network-acl-inbound-entry',
  NETWORK_ACL_OUTBOUND_ENTRY = 'network-acl-outbound-entry',
  NETWORK_ACL_ENTRY = 'network-acl-entry',

  GATEWAY_LOAD_BALANCER = 'gateway-load-balancer',
  APPLICATION_LOAD_BALANCER = 'application-load-balancer',
  NETWORK_LOAD_BALANCER = 'network-load-balancer',
  NETWORK_LOAD_BALANCER_ROLE = 'network-load-balancer-role',
}

/**
 * Security group rule type
 */
export enum SecurityGroupRules {
  INGRESS = 'Ingress',
  EGRESS = 'Egress',
}

/**
 * Enum for network stack generation
 */
export enum NetworkStackGeneration {
  V1 = 'v1',
  V2 = 'v2',
}

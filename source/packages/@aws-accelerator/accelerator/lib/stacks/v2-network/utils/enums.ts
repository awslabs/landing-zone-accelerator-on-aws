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
  EGRESS_ONLY_IGW = 'egress-only-igw',
  INTERNET_GATEWAY = 'internet-gateway',
  VIRTUAL_PRIVATE_GATEWAY = 'virtual-private-gateway',
  VPC_DHCP_OPTIONS_ASSOCIATION = 'vpc-dhcp-options-association',

  ROUTE_TABLE = 'route-table',
  RT_ENTRY = 'route-tables',

  SECURITY_GROUP = 'security-groups',

  SUBNET = 'subnets',

  SUBNET_SHARE = 'subnets-share',

  NACL = 'nacl',

  LOAD_BALANCER = 'load-balancers',
}

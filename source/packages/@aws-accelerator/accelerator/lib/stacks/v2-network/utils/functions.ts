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
import * as cdk from 'aws-cdk-lib';

import { ResourceShareType, V2NetworkResourceListType, V2StackType } from './types';
import { createLogger } from '../../../../../../@aws-lza/index';
import path from 'path';
import { OrganizationConfig } from '@aws-accelerator/config/lib/organization-config';
import { AccountsConfig } from '@aws-accelerator/config/lib/accounts-config';
import { NetworkConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config/lib/network-config';
import { isNetworkType } from '@aws-accelerator/config/lib/common/parse';
import { Region } from '@aws-accelerator/config/lib/common/types';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { VpcSubnetsBaseStack } from '../stacks/vpc-subnets-base-stack';
import { VpcRouteTablesBaseStack } from '../stacks/vpc-route-tables-base-stack';
import { VpcBaseStack } from '../stacks/vpc-base-stack';
import { VpcSecurityGroupsBaseStack } from '../stacks/vpc-security-groups-base-stack';
import { VpcNaclsBaseStack } from '../stacks/vp-nacls-base-stack';
import { VpcLoadBalancersBaseStack } from '../stacks/vpc-load-balancers-base-stack';
import { VpcSubnetsShareBaseStack } from '../stacks/vpc-subnets-share-base-stack';
import { AcceleratorStackNames, AcceleratorV2Stacks } from '../../../accelerator';
import {
  LookupValues,
  LZAResourceLookup,
  LZAResourceLookupType,
} from '@aws-accelerator/accelerator/utils/lza-resource-lookup';
import { GlobalConfig } from '@aws-accelerator/config/lib/global-config';
import { V2StackComponentsList } from './enums';

const logger = createLogger([path.parse(path.basename(__filename)).name]);

/**
 * Function to get VPCs in scope for the environment
 * @param networkConfig {@link NetworkConfig}
 * @param accountsConfig {@link AccountsConfig}
 * @param env
 * @returns
 */
export function getVpcsInScope(
  networkConfig: NetworkConfig,
  accountsConfig: AccountsConfig,
  env: { accountId: string; region: string },
): (VpcConfig | VpcTemplatesConfig)[] {
  const vpcResources = [...networkConfig.vpcs, ...(networkConfig.vpcTemplates ?? [])];
  const vpcsInScope: (VpcConfig | VpcTemplatesConfig)[] = [];

  for (const vpcItem of vpcResources) {
    const vpcAccountIds = getVpcAccountIds(vpcItem, accountsConfig);

    if (vpcAccountIds.includes(env.accountId) && [vpcItem.region].includes(env.region as Region)) {
      // Add condition on VPC lookup
      vpcsInScope.push(vpcItem);
    }
  }
  return vpcsInScope;
}

/**
 * Function to get resource share principals
 * @param item {@link ResourceShareType}
 * @param resourceShareName string
 * @param accountsConfig {@link AccountsConfig}
 * @param organizationConfig {@link OrganizationConfig}
 * @returns
 */
export function getResourceSharePrincipals(
  item: ResourceShareType,
  resourceShareName: string,
  accountsConfig: AccountsConfig,
  organizationConfig: OrganizationConfig,
): string[] {
  // Build a list of principals to share to
  const principals: string[] = [];

  // Loop through all the defined OUs
  for (const ouItem of item.shareTargets?.organizationalUnits ?? []) {
    let ouArn = organizationConfig.getOrganizationalUnitArn(ouItem);
    // AWS::RAM::ResourceShare expects the organizations ARN if
    // sharing with the entire org (Root)
    if (ouItem === 'Root') {
      ouArn = ouArn.substring(0, ouArn.lastIndexOf('/')).replace('root', 'organization');
    }
    logger.info(`Share ${resourceShareName} with Organizational Unit ${ouItem}: ${ouArn}`);
    principals.push(ouArn);
  }

  // Loop through all the defined accounts
  for (const account of item.shareTargets?.accounts ?? []) {
    const accountId = accountsConfig.getAccountId(account);
    logger.info(`Share ${resourceShareName} with Account ${account}: ${accountId}`);
    principals.push(accountId);
  }

  return principals;
}

/**
 * Function to get resource list deployable by V2 stacks
 * @param vpcsInScope {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param globalConfig {@link GlobalConfig}
 * @param env
 * @returns
 */
function getV2NetworkResources(
  vpcsInScope: (VpcConfig | VpcTemplatesConfig)[],
  globalConfig: GlobalConfig,
  networkConfig: NetworkConfig,
  env: { accountId: string; region: string; stackName: string },
): V2NetworkResourceListType[] {
  const v2Components: V2NetworkResourceListType[] = [];
  const lzaLookup: LZAResourceLookup = new LZAResourceLookup({
    accountId: env.accountId,
    region: env.region,
    aseaResourceList: globalConfig.externalLandingZoneResources?.resourceList ?? [],
    enableV2Stacks: globalConfig.useV2Stacks,
    externalLandingZoneResources: globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources,
    stackName: env.stackName,
  });

  for (const vpcItem of vpcsInScope) {
    getV2VpcResources(vpcItem, lzaLookup, v2Components);

    getV2FlowLogResources(vpcItem, lzaLookup, networkConfig, v2Components);

    getV2AdditionalIpv4CidrResources(vpcItem, lzaLookup, v2Components);

    getV2Ipv6CidrResources(vpcItem, lzaLookup, v2Components);

    getV2EgressOnlyInternetGatewayResource(vpcItem, lzaLookup, v2Components);

    getV2InternetGatewayResource(vpcItem, lzaLookup, v2Components);

    getV2VirtualPrivateGatewayResource(vpcItem, lzaLookup, v2Components);

    getV2DhcpOptionsAssociationResource(vpcItem, lzaLookup, v2Components);
  }

  return v2Components;
}

/**
 * Function to get V2 stack eligible VPCs
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2VpcResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.VPC,
      lookupValues: { vpcName: vpcItem.name },
    })
  ) {
    logger.info(
      `VPC ${vpcItem.name} is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({ vpcName: vpcItem.name, resourceType: V2StackComponentsList.VPC });
  }
}

/**
 * Function to get V2 stack eligible VPC flow logs resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param networkConfig {@link NetworkConfig}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2FlowLogResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  networkConfig: NetworkConfig,
  v2Components: V2NetworkResourceListType[],
): void {
  if (vpcItem.vpcFlowLogs || networkConfig.vpcFlowLogs) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.FLOW_LOG,
        lookupValues: { vpcName: vpcItem.name, flowLogDestinationType: 'cloud-watch-logs' },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} CloudWatch flow logs destination is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({ vpcName: vpcItem.name, resourceType: V2StackComponentsList.CWL_FLOW_LOGS });
    }

    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.FLOW_LOG,
        lookupValues: { vpcName: vpcItem.name, flowLogDestinationType: 's3' },
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} S3 flow logs destination is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({ vpcName: vpcItem.name, resourceType: V2StackComponentsList.S3_FLOW_LOGS });
    }
  }
}

/**
 * Function to get V2 stack eligible VPC additional IPV4 CIDR resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2AdditionalIpv4CidrResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (vpcItem.cidrs && vpcItem.cidrs.length > 1) {
    for (const vpcCidr of vpcItem.cidrs.slice(1)) {
      if (
        !lzaLookup.resourceExists({
          resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
          lookupValues: { vpcName: vpcItem.name, cidrBlock: vpcCidr } as LookupValues,
        })
      ) {
        logger.info(
          `VPC ${vpcItem.name} additional IPV4 CIDR ${vpcCidr} is not present in the existing stack, resource will be deployed through V2 stacks`,
        );
        v2Components.push({
          vpcName: vpcItem.name,
          resourceType: V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
          resourceName: vpcCidr,
        });
      }
    }
  }
}

/**
 * Function to get V2 stack eligible VPC IPV6 CIDR resources
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2Ipv6CidrResources(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  for (const vpcCidr of vpcItem.ipv6Cidrs ?? []) {
    if (
      !lzaLookup.resourceExists({
        resourceType: LZAResourceLookupType.VPC_CIDR_BLOCK,
        lookupValues: {
          vpcName: vpcItem.name,
          amazonProvidedIpv6CidrBlock: vpcCidr.amazonProvided,
          ipv6CidrBlock: vpcCidr.cidrBlock,
          ipv6pool: vpcCidr.byoipPoolId,
        } as LookupValues,
      })
    ) {
      logger.info(
        `VPC ${vpcItem.name} IPV6 CIDR ${vpcCidr.cidrBlock} is not present in the existing stack, resource will be deployed through V2 stacks`,
      );
      v2Components.push({
        vpcName: vpcItem.name,
        resourceType: V2StackComponentsList.ADDITIONAL_CIDR_BLOCK,
        resourceName: vpcCidr.cidrBlock,
      });
    }
  }
}

/**
 * Function to get V2 stack eligible VPC egress only internet gateway resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2EgressOnlyInternetGatewayResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.EGRESS_ONLY_INTERNET_GATEWAY,
      lookupValues: { vpcName: vpcItem.name },
    }) &&
    vpcItem.egressOnlyIgw
  ) {
    logger.info(
      `VPC ${vpcItem.name} egress only internet gateway is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.EGRESS_ONLY_IGW,
    });
  }
}

/**
 * Function to get V2 stack eligible VPC internet gateway resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2InternetGatewayResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.INTERNET_GATEWAY,
      lookupValues: { vpcName: vpcItem.name },
    }) &&
    vpcItem.internetGateway
  ) {
    logger.info(
      `VPC ${vpcItem.name} internet gateway is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.INTERNET_GATEWAY,
    });
  }
}

/**
 * Function to get V2 stack eligible VPC virtual private gateway resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2VirtualPrivateGatewayResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.VIRTUAL_PRIVATE_GATEWAY,
      lookupValues: { vpcName: vpcItem.name },
    }) &&
    vpcItem.virtualPrivateGateway
  ) {
    logger.info(
      `VPC ${vpcItem.name} egress only virtual private gateway is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.VIRTUAL_PRIVATE_GATEWAY,
    });
  }
}

/**
 * Function to get V2 stack eligible VPC dhcp options association resource
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param lzaLookup {@link LZAResourceLookup}
 * @param v2Components {@link V2NetworkResourceListType}[]
 */
function getV2DhcpOptionsAssociationResource(
  vpcItem: VpcConfig | VpcTemplatesConfig,
  lzaLookup: LZAResourceLookup,
  v2Components: V2NetworkResourceListType[],
): void {
  if (
    !lzaLookup.resourceExists({
      resourceType: LZAResourceLookupType.VPC_DHCP_OPTIONS_ASSOCIATION,
      lookupValues: { vpcName: vpcItem.name, dhcpOptionsName: vpcItem.dhcpOptions },
    }) &&
    vpcItem.dhcpOptions
  ) {
    logger.info(
      `VPC ${vpcItem.name} dhcp options association ${vpcItem.dhcpOptions} is not present in the existing stack, resource will be deployed through V2 stacks`,
    );
    v2Components.push({
      vpcName: vpcItem.name,
      resourceType: V2StackComponentsList.VPC_DHCP_OPTIONS_ASSOCIATION,
      resourceName: vpcItem.dhcpOptions,
    });
  }
}

/**
 * Function to create and get V2 Network VPC stacks
 * @param options
 * @returns
 */
export function createAndGetV2NetworkVpcDependencyStacks(options: {
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): cdk.Stack[] {
  const v2NetworkVpcDependencyStacks: cdk.Stack[] = [];

  const vpcsInScope = getVpcsInScope(options.props.networkConfig, options.props.accountsConfig, {
    accountId: options.accountId,
    region: options.enabledRegion,
  });

  const v2NetworkResources = getV2NetworkResources(
    vpcsInScope,
    options.props.globalConfig,
    options.props.networkConfig,
    {
      accountId: options.accountId,
      region: options.enabledRegion,
      stackName: options.dependencyStack.stackName,
    },
  );

  if (v2NetworkResources.length > 0 && vpcsInScope.length === 0) {
    logger.info(
      `No VPCs found in scope for account ${options.accountId} and region ${options.enabledRegion}, but v2 network resources are present in the environment.`,
    );
    throw new Error(
      `Configuration validation failed at runtime. No VPCs found in scope for account ${options.accountId} and region ${options.enabledRegion}, but v2 network resources are present the environment`,
    );
  }

  if (v2NetworkResources.length === 0) {
    v2NetworkVpcDependencyStacks.push(options.dependencyStack);
    return v2NetworkVpcDependencyStacks;
  }

  for (const vpcItem of vpcsInScope) {
    const parentStackForVpcStack: cdk.Stack = options.dependencyStack;
    const vpcStack = createVpcStack({
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: parentStackForVpcStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const parentStackForRouteTablesStack: cdk.Stack = vpcStack?.[vpcItem.name] ?? parentStackForVpcStack;

    const vpcRouteTablesStack = createVpcRouteTablesStack({
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: parentStackForRouteTablesStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const parentStackForSecurityGroupsStack: cdk.Stack = vpcStack?.[vpcItem.name] ?? parentStackForVpcStack;

    const vpcSecurityGroupsStack = createVpcSecurityGroupsStack({
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStack: parentStackForSecurityGroupsStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const parentStacksForSubnetsStack: cdk.Stack[] = [];

    if (vpcRouteTablesStack?.[vpcItem.name]) {
      parentStacksForSubnetsStack.push(vpcRouteTablesStack?.[vpcItem.name]);
    }

    if (vpcSecurityGroupsStack?.[vpcItem.name]) {
      parentStacksForSubnetsStack.push(vpcSecurityGroupsStack?.[vpcItem.name]);
    }

    if (parentStacksForSubnetsStack.length === 0) {
      parentStacksForSubnetsStack.push(vpcStack?.[vpcItem.name] ?? parentStackForVpcStack);
    }

    const vpcSubnetsStack = createVpcSubnetsStack({
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStacks: parentStacksForSubnetsStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const parentStacksForSubnetsShareStack: cdk.Stack[] = [
      ...new Set(vpcSubnetsStack?.[vpcItem.name] ? [vpcSubnetsStack?.[vpcItem.name]] : parentStacksForSubnetsStack),
    ];

    const vpcSubnetsShareStack = createVpcSubnetsShareStack({
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStacks: parentStacksForSubnetsShareStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const parentStacksForNaclsStack: cdk.Stack[] = [
      ...new Set(
        vpcSubnetsShareStack?.[vpcItem.name] ? [vpcSubnetsShareStack?.[vpcItem.name]] : parentStacksForSubnetsStack,
      ),
    ];

    const vpcNaclsStack = createVpcNaclsStack({
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStacks: parentStacksForNaclsStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const parentStacksForLoadBalancersStack: cdk.Stack[] = [
      ...new Set(vpcNaclsStack?.[vpcItem.name] ? [vpcNaclsStack?.[vpcItem.name]] : parentStacksForNaclsStack),
    ];

    const vpcLoadBalancersStack = createVpcLoadBalancersStack({
      v2NetworkResources,
      v2Stacks: options.v2Stacks,
      dependencyStacks: parentStacksForLoadBalancersStack,
      app: options.app,
      vpcItem,
      props: options.props,
      env: options.env,
      partition: options.partition,
      accountId: options.accountId,
      enabledRegion: options.enabledRegion,
      version: options.version,
      synthesizer: options.synthesizer,
    });

    const finalStackList: cdk.Stack[] = [
      ...new Set(
        vpcLoadBalancersStack?.[vpcItem.name]
          ? [vpcLoadBalancersStack?.[vpcItem.name]]
          : parentStacksForLoadBalancersStack,
      ),
    ];

    for (const finalStack of finalStackList) {
      if (!v2NetworkVpcDependencyStacks.includes(finalStack)) {
        v2NetworkVpcDependencyStacks.push(finalStack);
      }
    }
  }

  return v2NetworkVpcDependencyStacks;
}

/**
 * Function to create V2 Network VPC stack
 * @param options
 * @returns
 */
function createVpcStack(options: {
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): V2StackType | undefined {
  if (options.v2NetworkResources.find(item => item.vpcName === options.vpcItem.name)) {
    const stack: V2StackType = {};
    logger.info(`Creating VPC Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
    stack[options.vpcItem.name] = new VpcBaseStack(
      options.app,
      `${AcceleratorStackNames[AcceleratorV2Stacks.VPC_STACK]}-${options.vpcItem.name}-${options.accountId}-${
        options.enabledRegion
      }`,
      {
        env: options.env,
        description: `(SO0199-vpc) Landing Zone Accelerator on AWS. Version ${options.version}.`,

        synthesizer: options.synthesizer,
        terminationProtection: options.props.globalConfig.terminationProtection ?? true,
        ...options.props,
        vpcConfig: options.vpcItem,
        vpcStack: true,
      },
    );

    stack[options.vpcItem.name].node.addDependency(options.dependencyStack);

    options.v2Stacks.push(stack[options.vpcItem.name]);

    return stack;
  }
  return undefined;
}

/**
 * Function to get V2 VPC Route Tables stack
 * @param options
 * @returns
 */
function createVpcRouteTablesStack(options: {
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): V2StackType | undefined {
  if (
    options.v2NetworkResources.find(
      item =>
        (item.vpcName === options.vpcItem.name && item.resourceType === V2StackComponentsList.ROUTE_TABLE) ||
        (item.vpcName === options.vpcItem.name && item.resourceType === V2StackComponentsList.RT_ENTRY),
    )
  ) {
    const stacks: V2StackType = {};
    logger.info(`Creating VPC Route Table Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
    stacks[options.vpcItem.name] = new VpcRouteTablesBaseStack(
      options.app,
      `${AcceleratorStackNames[AcceleratorV2Stacks.ROUTE_TABLES_STACK]}-${options.vpcItem.name}-${options.accountId}-${
        options.enabledRegion
      }`,
      {
        env: options.env,
        description: `(SO0199-vpc-route-tables) Landing Zone Accelerator on AWS. Version ${options.version}.`,

        synthesizer: options.synthesizer,
        terminationProtection: options.props.globalConfig.terminationProtection ?? true,
        ...options.props,
        vpcConfig: options.vpcItem,
        vpcStack: false,
      },
    );

    stacks[options.vpcItem.name].node.addDependency(options.dependencyStack);

    options.v2Stacks.push(stacks[options.vpcItem.name]);

    return stacks;
  }
  return undefined;
}

/**
 * Function to get V2 VPC SecurityGroups stack
 * @param options
 * @returns
 */
function createVpcSecurityGroupsStack(options: {
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStack: cdk.Stack;
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): V2StackType | undefined {
  if (
    options.v2NetworkResources.find(
      item => item.vpcName === options.vpcItem.name && item.resourceType === V2StackComponentsList.SECURITY_GROUP,
    )
  ) {
    const stacks: V2StackType = {};
    logger.info(`Creating VPC SecurityGroups Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
    stacks[options.vpcItem.name] = new VpcSecurityGroupsBaseStack(
      options.app,
      `${AcceleratorStackNames[AcceleratorV2Stacks.SECURITY_GROUPS_STACK]}-${options.vpcItem.name}-${
        options.accountId
      }-${options.enabledRegion}`,
      {
        env: options.env,
        description: `(SO0199-vpc-security-groups) Landing Zone Accelerator on AWS. Version ${options.version}.`,
        synthesizer: options.synthesizer,
        terminationProtection: options.props.globalConfig.terminationProtection ?? true,
        ...options.props,
        vpcConfig: options.vpcItem,
        vpcStack: false,
      },
    );

    stacks[options.vpcItem.name].addDependency(options.dependencyStack);

    options.v2Stacks.push(stacks[options.vpcItem.name]);

    return stacks;
  }
  return undefined;
}

/**
 * Function to get V2 VPC Subnets stack
 * @param options
 * @returns
 */
function createVpcSubnetsStack(options: {
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStacks: cdk.Stack[];
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): V2StackType | undefined {
  if (
    options.v2NetworkResources.find(
      item => item.vpcName === options.vpcItem.name && item.resourceType === V2StackComponentsList.SUBNET,
    )
  ) {
    const stacks: V2StackType = {};
    logger.info(`Creating VPC Subnets Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
    stacks[options.vpcItem.name] = new VpcSubnetsBaseStack(
      options.app,
      `${AcceleratorStackNames[AcceleratorV2Stacks.SUBNETS_STACK]}-${options.vpcItem.name}-${options.accountId}-${
        options.enabledRegion
      }`,
      {
        env: options.env,
        description: `(SO0199-vpc-subnets) Landing Zone Accelerator on AWS. Version ${options.version}.`,
        synthesizer: options.synthesizer,
        terminationProtection: options.props.globalConfig.terminationProtection ?? true,
        ...options.props,
        vpcConfig: options.vpcItem,
        vpcStack: false,
      },
    );

    for (const dependencyStack of options.dependencyStacks) {
      stacks[options.vpcItem.name].node.addDependency(dependencyStack);
    }

    options.v2Stacks.push(stacks[options.vpcItem.name]);

    return stacks;
  }
  return undefined;
}

/**
 * Function to get V2 VPC Share Subnets stack
 * @param options
 * @returns
 */
function createVpcSubnetsShareStack(options: {
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStacks: cdk.Stack[];
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): V2StackType | undefined {
  if (
    options.v2NetworkResources.find(
      item => item.vpcName === options.vpcItem.name && item.resourceType === V2StackComponentsList.SUBNET_SHARE,
    )
  ) {
    const stacks: V2StackType = {};
    logger.info(`Creating VPC Subnets Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
    stacks[options.vpcItem.name] = new VpcSubnetsShareBaseStack(
      options.app,
      `${AcceleratorStackNames[AcceleratorV2Stacks.SUBNETS_SHARE_STACK]}-${options.vpcItem.name}-${options.accountId}-${
        options.enabledRegion
      }`,
      {
        env: options.env,
        description: `(SO0199-vpc-subnets-share) Landing Zone Accelerator on AWS. Version ${options.version}.`,
        synthesizer: options.synthesizer,
        terminationProtection: options.props.globalConfig.terminationProtection ?? true,
        ...options.props,
        vpcConfig: options.vpcItem,
        vpcStack: false,
      },
    );

    for (const dependencyStack of options.dependencyStacks) {
      stacks[options.vpcItem.name].node.addDependency(dependencyStack);
    }

    options.v2Stacks.push(stacks[options.vpcItem.name]);

    return stacks;
  }
  return undefined;
}

/**
 * Function to get V2 VPC NACLs stack
 * @param options
 * @returns
 */
function createVpcNaclsStack(options: {
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStacks: cdk.Stack[];
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): V2StackType | undefined {
  if (
    options.v2NetworkResources.find(
      item => item.vpcName === options.vpcItem.name && item.resourceType === V2StackComponentsList.NACL,
    )
  ) {
    const stacks: V2StackType = {};
    logger.info(`Creating VPC NACLs Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
    stacks[options.vpcItem.name] = new VpcNaclsBaseStack(
      options.app,
      `${AcceleratorStackNames[AcceleratorV2Stacks.NACLS_STACK]}-${options.vpcItem.name}-${options.accountId}-${
        options.enabledRegion
      }`,
      {
        env: options.env,
        description: `(SO0199-vpc-nacls) Landing Zone Accelerator on AWS. Version ${options.version}.`,
        synthesizer: options.synthesizer,
        terminationProtection: options.props.globalConfig.terminationProtection ?? true,
        ...options.props,
        vpcConfig: options.vpcItem,
        vpcStack: false,
      },
    );

    for (const dependencyStack of options.dependencyStacks) {
      stacks[options.vpcItem.name].addDependency(dependencyStack);
    }

    options.v2Stacks.push(stacks[options.vpcItem.name]);

    return stacks;
  }
  return undefined;
}

/**
 * Function to get V2 VPC LoadBalancers stack
 * @param options
 * @returns
 */
function createVpcLoadBalancersStack(options: {
  v2NetworkResources: V2NetworkResourceListType[];
  v2Stacks: cdk.Stack[];
  dependencyStacks: cdk.Stack[];
  app: cdk.App;
  vpcItem: VpcConfig | VpcTemplatesConfig;
  props: AcceleratorStackProps;
  env: cdk.Environment;
  partition: string;
  accountId: string;
  enabledRegion: string;
  version: string;
  synthesizer?: cdk.IStackSynthesizer;
}): V2StackType | undefined {
  if (
    options.v2NetworkResources.find(
      item => item.vpcName === options.vpcItem.name && item.resourceType === V2StackComponentsList.LOAD_BALANCER,
    )
  ) {
    const stacks: V2StackType = {};
    logger.info(`Creating VPC LoadBalancers Stack for VPC ${options.vpcItem.name} in ${options.enabledRegion}`);
    stacks[options.vpcItem.name] = new VpcLoadBalancersBaseStack(
      options.app,
      `${AcceleratorStackNames[AcceleratorV2Stacks.LBS_STACK]}-${options.vpcItem.name}-${options.accountId}-${
        options.enabledRegion
      }`,
      {
        env: options.env,
        description: `(SO0199-vpc-load-balancers) Landing Zone Accelerator on AWS. Version ${options.version}.`,
        synthesizer: options.synthesizer,
        terminationProtection: options.props.globalConfig.terminationProtection ?? true,
        ...options.props,
        vpcConfig: options.vpcItem,
        vpcStack: false,
      },
    );

    for (const dependencyStack of options.dependencyStacks) {
      stacks[options.vpcItem.name].addDependency(dependencyStack);
    }

    options.v2Stacks.push(stacks[options.vpcItem.name]);

    return stacks;
  }
  return undefined;
}

/**
 * Function to get VPC accounts Ids
 * @param vpcItem {@link VpcConfig} | {@link VpcTemplatesConfig}
 * @param accountsConfig {@link AccountsConfig}
 * @returns
 */
function getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig, accountsConfig: AccountsConfig): string[] {
  if (isNetworkType<VpcConfig>('IVpcConfig', vpcItem)) {
    return [accountsConfig.getAccountId(vpcItem.account)];
  } else {
    return accountsConfig.getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets);
  }
}

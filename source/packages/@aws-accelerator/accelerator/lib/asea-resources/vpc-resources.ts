import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';

import {
  CfnInternetGateway,
  CfnRouteTable,
  CfnSecurityGroup,
  CfnSubnet,
  CfnVPC,
  CfnVPNGateway,
} from 'aws-cdk-lib/aws-ec2';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import {
  AseaStackInfo,
  NetworkConfigTypes,
  VpcConfig,
  VpcTemplatesConfig,
  AseaResourceType,
} from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';

const enum RESOURCE_TYPE {
  VPC = 'AWS::EC2::VPC',
  SUBNET = 'AWS::EC2::Subnet',
  CIDR_BLOCK = 'AWS::EC2::VPCCidrBlock',
  INTERNET_GATEWAY = 'AWS::EC2::InternetGateway',
  VPN_GATEWAY = 'AWS::EC2::VPNGateway',
  SECURITY_GROUP = 'AWS::EC2::SecurityGroup',
  SECURITY_GROUP_EGRESS = 'AWS::EC2::SecurityGroupEgress',
  SECURITY_GROUP_INGRESS = 'AWS::EC2::SecurityGroupIngress',
  ROUTE_TABLE = 'AWS::EC2::RouteTable',
}
const ASEA_PHASE_NUMBER = 1;

type NestedAseaStackInfo = AseaStackInfo & { logicalResourceId: string };

export interface VpcResourcesProps extends AseaResourceProps {
  /**
   * Nested Stacks of current phase stack
   */
  nestedStacksInfo: NestedAseaStackInfo[];
}

export class VpcResources extends AseaResource {
  private readonly nestedStacksInfo: NestedAseaStackInfo[] = [];
  private readonly props: VpcResourcesProps;
  private readonly vpcResources: (VpcConfig | VpcTemplatesConfig)[] = [];
  constructor(scope: ImportAseaResourcesStack, props: VpcResourcesProps) {
    super(scope, props);
    this.props = props;
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE.VPC}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    this.nestedStacksInfo = props.nestedStacksInfo;
    this.vpcResources = [...props.networkConfig.vpcs, ...(props.networkConfig.vpcTemplates ?? [])];
    const vpcsInScope = this.getVpcsInScope(this.vpcResources);
    for (const vpcInScope of vpcsInScope) {
      const vpcResourceInfo = this.getVpcResourceByTag(vpcInScope.name);
      if (!vpcResourceInfo) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Item Excluded: ${vpcInScope.name} in Account/Region ${props.stackInfo.accountKey}/${props.stackInfo.region}`,
        );
        continue;
      }
      const { stackInfo: vpcStackInfo, resource } = vpcResourceInfo;
      const nestedStack = this.stack.getNestedStack(vpcStackInfo.logicalResourceId);
      const vpc = nestedStack.includedTemplate.getResource(resource.logicalResourceId) as CfnVPC;
      this.setupInternetGateway(vpcStackInfo, nestedStack, vpcInScope);
      this.setupVpnGateway(vpcStackInfo, nestedStack, vpcInScope);
      vpc.cidrBlock = vpcInScope.cidrs![0]; // 0th index is always main cidr Block
      vpc.enableDnsHostnames = vpcInScope.enableDnsHostnames;
      vpc.enableDnsSupport = vpcInScope.enableDnsSupport;
      vpc.instanceTenancy = vpcInScope.instanceTenancy;
      // TODO: Add LZA tags if required
      if (vpcInScope.cidrs!.length > 1) {
        const additionalCidrResources = this.getAdditionalCidrs(vpcStackInfo);
        const existingAdditionalCidrBlocks: string[] = additionalCidrResources.map(
          cfnResource => cfnResource.resourceMetadata['Properties'].CidrBlock,
        );
        vpcInScope.cidrs!.slice(1).forEach(cidr => {
          const additionalCidrResource = additionalCidrResources.find(
            cfnResource => cfnResource.resourceMetadata['Properties'].CidrBlock === cidr,
          );
          if (!additionalCidrResource) {
            this.scope.addLogs(
              LogLevel.INFO,
              `Item Excluded: ${vpcInScope.name} CIDR in Account/Region ${props.stackInfo.accountKey}/${props.stackInfo.region}`,
            );
            return;
          }
          this.scope.addAseaResource(AseaResourceType.EC2_VPC_CIDR, `${vpcInScope.name}-${cidr}`);
        });
        const removedAseaCidrs = vpcInScope
          .cidrs!.slice(1)
          .filter(cidr => !existingAdditionalCidrBlocks.includes(cidr));
        this.scope.addLogs(LogLevel.INFO, `Removed Additional CIDR created by ASEA are ${removedAseaCidrs}`);
        // TODO: Remove Additional CIDRs created by ASEA
      }
      this.createSubnets(vpcInScope, vpcStackInfo, nestedStack.includedTemplate);
      this.createSecurityGroups(vpcInScope, vpcStackInfo, nestedStack.includedTemplate);
      this.createRouteTables(vpcInScope, vpcStackInfo, nestedStack.includedTemplate);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcInScope.name)}VpcId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.VPC, [vpcInScope.name]),
        stringValue: vpc.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_VPC, vpcInScope.name);
    }
  }

  private setupInternetGateway(
    vpcStackInfo: NestedAseaStackInfo,
    nestedStack: cdk.cloudformation_include.IncludedNestedStack,
    vpcConfig: VpcConfig | VpcTemplatesConfig,
  ) {
    const internetGatewayInfo = vpcStackInfo.resources.filter(
      cfnResource => cfnResource.resourceType === RESOURCE_TYPE.INTERNET_GATEWAY,
    )?.[0];
    if (vpcConfig.internetGateway && internetGatewayInfo) {
      const internetGateway = nestedStack.includedTemplate.getResource(
        internetGatewayInfo.logicalResourceId,
      ) as CfnInternetGateway;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcConfig.name)}InternetGatewayId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.IGW, [vpcConfig.name]),
        stringValue: internetGateway.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_IGW, vpcConfig.name);
    }
  }

  private setupVpnGateway(
    vpcStackInfo: NestedAseaStackInfo,
    nestedStack: cdk.cloudformation_include.IncludedNestedStack,
    vpcConfig: VpcConfig | VpcTemplatesConfig,
  ) {
    const virtualPrivateGatewayInfo = vpcStackInfo.resources.filter(
      cfnResource => cfnResource.resourceType === RESOURCE_TYPE.VPN_GATEWAY,
    )?.[0];
    if (vpcConfig.virtualPrivateGateway && virtualPrivateGatewayInfo) {
      const virtualPrivateGateway = nestedStack.includedTemplate.getResource(
        virtualPrivateGatewayInfo.logicalResourceId,
      ) as CfnVPNGateway;
      virtualPrivateGateway.amazonSideAsn = vpcConfig.virtualPrivateGateway.asn;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcConfig.name)}VirtualPrivateGatewayId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.VPN_GW, [vpcConfig.name]),
        stringValue: virtualPrivateGateway.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_VPN_GW, vpcConfig.name);
    }
  }

  private createSubnets(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcStackInfo: NestedAseaStackInfo,
    vpcStack: CfnInclude,
  ) {
    for (const subnetItem of vpcItem.subnets ?? []) {
      const subnetResource = this.getSubnetResourceByTag(subnetItem.name, vpcStackInfo);
      if (!subnetResource) continue;
      const subnet = vpcStack.getResource(subnetResource.logicalResourceId) as CfnSubnet;
      subnet.cidrBlock = subnetItem.ipv4CidrBlock;
      // LZA Config accepts only 'a' for 'us-east-1a' or integer
      subnet.availabilityZone = `${vpcItem.region}${subnetItem.availabilityZone}`;
      subnet.mapPublicIpOnLaunch = subnetItem.mapPublicIpOnLaunch;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(subnetItem.name)}SubnetId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
        stringValue: subnet.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_SUBNET, `${vpcItem.name}/${subnetItem.name}`);
    }
  }

  private createSecurityGroups(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcStackInfo: NestedAseaStackInfo,
    vpcStack: CfnInclude,
  ) {
    const securityGroupsMap = new Map<string, string>();
    /**
     * Uncomment following code to handle SecurityGroup Rules
     */
    // type SecurityGroupRuleInfo = {
    //   protocol: string;
    //   source: string;
    //   sourceValue: string;
    //   type?: string;
    //   to?: number;
    //   from?: number;
    // };
    // const processSecurityGroupSources = (
    //   securityGroupRuleItem: SecurityGroupRuleConfig,
    //   ruleProps: {
    //     protocol: cdk.aws_ec2.Protocol;
    //     type?: string;
    //     from?: number;
    //     to?: number;
    //   },
    // ) => {
    //   const securityGroupRules: SecurityGroupRuleInfo[] = [];
    //   securityGroupRuleItem.sources.forEach(sourceItem => {
    //     if (nonEmptyString.is(sourceItem))
    //       securityGroupRules.push({
    //         ...ruleProps,
    //         source: sourceItem,
    //         sourceValue: sourceItem,
    //       });
    //     if (NetworkConfigTypes.subnetSourceConfig.is(sourceItem)) {
    //       const sourceVpcItem = getVpcConfig(this.vpcResources, sourceItem.vpc);
    //       sourceItem.subnets.forEach(subnet =>
    //         securityGroupRules.push({
    //           ...ruleProps,
    //           source: `${sourceVpcItem.name}/${subnet}`,
    //           sourceValue: getSubnetConfig(sourceVpcItem, subnet).ipv4CidrBlock!,
    //         }),
    //       );
    //     }
    //     if (NetworkConfigTypes.securityGroupSourceConfig.is(sourceItem)) {
    //       sourceItem.securityGroups.forEach(securityGroup => {
    //         if (!securityGroupsMap.get(securityGroup)) return;
    //         securityGroupRules.push({
    //           ...ruleProps,
    //           source: securityGroup,
    //           sourceValue: securityGroupsMap.get(securityGroup)!,
    //         });
    //       });
    //     }
    //   });
    //   return securityGroupRules;
    // };
    // const processTcpSources = (securityGroupRuleItem: SecurityGroupRuleConfig) => {
    //   const securityGroupRules: SecurityGroupRuleInfo[] = [];
    //   for (const tcpPort of securityGroupRuleItem.tcpPorts ?? []) {
    //     const defaultRuleProps = {
    //       protocol: cdk.aws_ec2.Protocol.TCP,
    //       from: tcpPort,
    //       to: tcpPort,
    //     };
    //     securityGroupRules.push(...processSecurityGroupSources(securityGroupRuleItem, defaultRuleProps));
    //   }
    //   return securityGroupRules;
    // };
    // const processUdpSources = (securityGroupRuleItem: SecurityGroupRuleConfig) => {
    //   const securityGroupRules: SecurityGroupRuleInfo[] = [];
    //   for (const tcpPort of securityGroupRuleItem.udpPorts ?? []) {
    //     const defaultRuleProps = {
    //       protocol: cdk.aws_ec2.Protocol.UDP,
    //       from: tcpPort,
    //       to: tcpPort,
    //     };
    //     securityGroupRules.push(...processSecurityGroupSources(securityGroupRuleItem, defaultRuleProps));
    //   }
    //   return securityGroupRules;
    // };
    // const processTypeSources = (securityGroupRuleItem: SecurityGroupRuleConfig) => {
    //   const securityGroupRules: SecurityGroupRuleInfo[] = [];
    //   for (const ruleType of securityGroupRuleItem.types ?? []) {
    //     if (ruleType === 'ALL') {
    //       const defaultRuleProps = {
    //         protocol: cdk.aws_ec2.Protocol.ALL,
    //         type: ruleType,
    //       };
    //       securityGroupRules.push(...processSecurityGroupSources(securityGroupRuleItem, defaultRuleProps));
    //     } else {
    //       const defaultRuleProps = {
    //         protocol: cdk.aws_ec2.Protocol.TCP,
    //         type: ruleType,
    //         from: TCP_PROTOCOLS_PORT[ruleType],
    //         to: TCP_PROTOCOLS_PORT[ruleType],
    //       };
    //       securityGroupRules.push(...processSecurityGroupSources(securityGroupRuleItem, defaultRuleProps));
    //     }
    //   }
    //   return securityGroupRules;
    // };
    for (const securityGroupItem of vpcItem.securityGroups ?? []) {
      const existingSecurityGroup = this.findResourceByName(
        vpcStackInfo.resources,
        'GroupName',
        securityGroupItem.name,
      );
      if (!existingSecurityGroup) continue;
      const securityGroup = vpcStack.getResource(existingSecurityGroup.logicalResourceId) as CfnSecurityGroup;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(securityGroupItem.name)}SecurityGroup`),
        parameterName: this.scope.getSsmPath(SsmResourceType.SECURITY_GROUP, [vpcItem.name, securityGroupItem.name]),
        stringValue: securityGroup.ref,
      });
      this.scope.addAseaResource(AseaResourceType.EC2_SECURITY_GROUP, `${vpcItem.name}/${securityGroupItem.name}`);
      securityGroupsMap.set(securityGroupItem.name, existingSecurityGroup.logicalResourceId);
    }
    /**
     * Uncomment following code to handle SecurityGroup Rules
     */
    // for (const securityGroupItem of vpcItem.securityGroups ?? []) {
    //   const logicalId = securityGroupsMap.get(securityGroupItem.name);
    //   if (!logicalId) continue;
    //   const securityGroupIngressRules: SecurityGroupRuleInfo[] = [];
    //   const securityGroupEgressRules: SecurityGroupRuleInfo[] = [];
    //   const egressRules = this.filterResourcesByRef(
    //     this.filterResourcesByType(vpcStackInfo.resources, RESOURCE_TYPE.SECURITY_GROUP_EGRESS),
    //     'GroupId',
    //     logicalId,
    //   );
    //   const ingressRules = this.filterResourcesByRef(
    //     this.filterResourcesByType(vpcStackInfo.resources, RESOURCE_TYPE.SECURITY_GROUP_INGRESS),
    //     'GroupId',
    //     logicalId,
    //   );
    //   for (const ingressRuleItem of securityGroupItem.inboundRules) {
    //     securityGroupIngressRules.push(
    //       ...processTcpSources(ingressRuleItem),
    //       ...processUdpSources(ingressRuleItem),
    //       ...processTypeSources(ingressRuleItem),
    //     );
    //   }
    //   for (const egressRuleItem of securityGroupItem.outboundRules) {
    //     securityGroupEgressRules.push(
    //       ...processTcpSources(egressRuleItem),
    //       ...processUdpSources(egressRuleItem),
    //       ...processTypeSources(egressRuleItem),
    //     );
    //     securityGroupIngressRules.forEach(configIngressRule => {
    //       const existingIngressRuleEntry = ingressRules.find(
    //         existingIngressRule =>
    //           ((existingIngressRule.resourceMetadata['Properties'].IpProtocol &&
    //             existingIngressRule.resourceMetadata['Properties'].IpProtocol === configIngressRule.protocol) ||
    //             true) &&
    //           ((existingIngressRule.resourceMetadata['Properties'].FromPort &&
    //             existingIngressRule.resourceMetadata['Properties'].FromPort === configIngressRule.from) ||
    //             true) &&
    //           ((existingIngressRule.resourceMetadata['Properties'].ToPort &&
    //             existingIngressRule.resourceMetadata['Properties'].ToPort === configIngressRule.to) ||
    //             true) &&
    //           ((existingIngressRule.resourceMetadata['Properties'].CidrIp &&
    //             existingIngressRule.resourceMetadata['Properties'].CidrIp === configIngressRule.sourceValue) ||
    //             true) &&
    //           ((existingIngressRule.resourceMetadata['Properties'].SourceSecurityGroupId &&
    //             existingIngressRule.resourceMetadata['Properties'].SourceSecurityGroupId.Ref ===
    //               configIngressRule.sourceValue) ||
    //             true),
    //       );
    //       // TODO Handle delete if resource not found in resource map
    //       // Updated to existing ingress is not handled here.
    //       if (existingIngressRuleEntry)
    //         this.scope.addAseaResource(
    //           AseaResourceType.EC2_SECURITY_GROUP_INGRESS,
    //           `${vpcItem.name}/${securityGroupItem.name}/ingress/${configIngressRule.source}-${configIngressRule.from}-${configIngressRule.to}-${configIngressRule.protocol}`,
    //         );
    //     });
    //     securityGroupEgressRules.forEach(configEgressRule => {
    //       const existingEgressRuleEntry = egressRules.find(
    //         existingEgressRule =>
    //           ((existingEgressRule.resourceMetadata['Properties'].IpProtocol &&
    //             existingEgressRule.resourceMetadata['Properties'].IpProtocol === configEgressRule.protocol) ||
    //             true) &&
    //           ((existingEgressRule.resourceMetadata['Properties'].FromPort &&
    //             existingEgressRule.resourceMetadata['Properties'].FromPort === configEgressRule.from) ||
    //             true) &&
    //           ((existingEgressRule.resourceMetadata['Properties'].ToPort &&
    //             existingEgressRule.resourceMetadata['Properties'].ToPort === configEgressRule.to) ||
    //             true) &&
    //           ((existingEgressRule.resourceMetadata['Properties'].CidrIp &&
    //             existingEgressRule.resourceMetadata['Properties'].CidrIp === configEgressRule.sourceValue) ||
    //             true) &&
    //           ((existingEgressRule.resourceMetadata['Properties'].SourceSecurityGroupId &&
    //             existingEgressRule.resourceMetadata['Properties'].SourceSecurityGroupId.Ref ===
    //               configEgressRule.sourceValue) ||
    //             true),
    //       );
    //       // TODO Handle delete if resource not found in resource map
    //       // Updated to existing egress is not handled here.
    //       if (existingEgressRuleEntry)
    //         this.scope.addAseaResource(
    //           AseaResourceType.EC2_SECURITY_GROUP_EGRESS,
    //           `${vpcItem.name}/${securityGroupItem.name}/egress/${configEgressRule.source}-${configEgressRule.from}-${configEgressRule.to}-${configEgressRule.protocol}`,
    //         );
    //     });
    //   }
    // }
  }

  private createRouteTables(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    vpcStackInfo: NestedAseaStackInfo,
    vpcStack: CfnInclude,
  ) {
    const existingRouteTablesMapping = this.filterResourcesByType(vpcStackInfo.resources, RESOURCE_TYPE.ROUTE_TABLE);
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTableResource = this.findResourceByTag(existingRouteTablesMapping, routeTableItem.name);
      if (!routeTableResource) continue;
      const routeTable = vpcStack.getResource(routeTableResource.logicalResourceId) as CfnRouteTable;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name)}${pascalCase(routeTableItem.name)}RouteTableId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.ROUTE_TABLE, [vpcItem.name, routeTableItem.name]),
        stringValue: routeTable.ref,
      });
      this.scope.addAseaResource(AseaResourceType.ROUTE_TABLE, `${vpcItem.name}/${routeTableItem.name}`);
    }
  }

  /**
   * Get VPCs in current scope of the stack context
   * @param vpcResources
   * @returns
   */
  private getVpcsInScope(vpcResources: (VpcConfig | VpcTemplatesConfig)[]): (VpcConfig | VpcTemplatesConfig)[] {
    const vpcsInScope: (VpcConfig | VpcTemplatesConfig)[] = [];

    for (const vpcItem of vpcResources) {
      const vpcAccountIds = this.getVpcAccountIds(vpcItem);

      if (this.isTargetStack(vpcAccountIds, [vpcItem.region])) {
        vpcsInScope.push(vpcItem);
      }
    }
    return vpcsInScope;
  }

  /**
   * Returns true if provided account ID and region parameters match contextual values for the current stack
   * @param accountIds
   * @param regions
   * @returns
   */
  public isTargetStack(accountIds: string[], regions: string[]): boolean {
    return accountIds.includes(cdk.Stack.of(this.stack).account) && regions.includes(cdk.Stack.of(this.stack).region);
  }

  public getVpcAccountIds(vpcItem: VpcConfig | VpcTemplatesConfig): string[] {
    let vpcAccountIds: string[];

    if (NetworkConfigTypes.vpcConfig.is(vpcItem)) {
      vpcAccountIds = [this.props.accountsConfig.getAccountId(vpcItem.account)];
    } else {
      const excludedAccountIds = this.scope.getExcludedAccountIds(vpcItem.deploymentTargets);
      vpcAccountIds = this.scope
        .getAccountIdsFromDeploymentTarget(vpcItem.deploymentTargets)
        .filter(item => !excludedAccountIds.includes(item));
    }

    return vpcAccountIds;
  }

  /**
   * Find VPC Resource by tag and nestedStackInfo of VPC
   * @param vpcName
   * @returns
   */
  private getVpcResourceByTag(vpcName: string) {
    for (const nestedStackInfo of this.nestedStacksInfo) {
      const vpcResources = nestedStackInfo.resources.filter(
        cfnResource => cfnResource.resourceType === RESOURCE_TYPE.VPC,
      );
      const vpcResource = vpcResources.find(cfnResource =>
        cfnResource.resourceMetadata['Properties'].Tags.find(
          (tag: { Key: string; Value: string }) => tag.Key === 'Name' && tag.Value === vpcName,
        ),
      );
      if (vpcResource) {
        return {
          stackInfo: nestedStackInfo,
          resource: vpcResource,
        };
      }
    }
    return;
  }

  /**
   * Find Subnet Resource by tag and nestedStackInfo of VPC
   * @param vpcName
   * @returns
   */
  private getSubnetResourceByTag(subnetName: string, nestedStackInfo: NestedAseaStackInfo) {
    const subnetResources = nestedStackInfo.resources.filter(
      cfnResource => cfnResource.resourceType === RESOURCE_TYPE.SUBNET,
    );
    const subnetResource = this.findResourceByTag(subnetResources, subnetName);
    if (subnetResource) {
      return subnetResource;
    }
    return;
  }

  private getAdditionalCidrs(stackInfo: NestedAseaStackInfo) {
    return stackInfo.resources.filter(cfnResource => cfnResource.resourceType === RESOURCE_TYPE.CIDR_BLOCK);
  }
}

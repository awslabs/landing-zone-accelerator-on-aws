import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'pascal-case';
import { IPv4CidrRange, IPv6CidrRange } from 'ip-num';
import { isArn } from '@aws-accelerator/utils/lib/is-arn';

import {
  CfnInternetGateway,
  CfnNatGateway,
  CfnRouteTable,
  CfnSecurityGroup,
  CfnSubnet,
  CfnSubnetNetworkAclAssociation,
  CfnTransitGatewayAttachment,
  CfnVPC,
  CfnVPNGateway,
} from 'aws-cdk-lib/aws-ec2';

import { NetworkFirewall } from '@aws-accelerator/constructs';
import { CfnInclude } from 'aws-cdk-lib/cloudformation-include';
import {
  VpcConfig,
  VpcTemplatesConfig,
  AseaResourceType,
  NfwFirewallConfig,
  RouteTableConfig,
  TransitGatewayAttachmentConfig,
  SecurityGroupRuleConfig,
  NonEmptyString,
  isNetworkType,
  SubnetSourceConfig,
  SecurityGroupSourceConfig,
  CfnResourceType,
  NetworkAclConfig,
} from '@aws-accelerator/config';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { ImportAseaResourcesStack, LogLevel } from '../stacks/import-asea-resources-stack';
import { AseaResource, AseaResourceProps } from './resource';
import { getSubnetConfig, getVpcConfig } from '../stacks/network-stacks/utils/getter-utils';
import { AcceleratorStage } from '../accelerator-stage';
import { ImportStackResources } from '../../utils/import-stack-resources';

const enum RESOURCE_TYPE {
  VPC = 'AWS::EC2::VPC',
  SUBNET = 'AWS::EC2::Subnet',
  CIDR_BLOCK = 'AWS::EC2::VPCCidrBlock',
  INTERNET_GATEWAY = 'AWS::EC2::InternetGateway',
  NAT_GATEWAY = 'AWS::EC2::NatGateway',
  VPN_GATEWAY = 'AWS::EC2::VPNGateway',
  SECURITY_GROUP = 'AWS::EC2::SecurityGroup',
  SECURITY_GROUP_EGRESS = 'AWS::EC2::SecurityGroupEgress',
  SECURITY_GROUP_INGRESS = 'AWS::EC2::SecurityGroupIngress',
  ROUTE_TABLE = 'AWS::EC2::RouteTable',
  TGW_ATTACHMENT = 'AWS::EC2::TransitGatewayAttachment',
  TGW_ASSOCIATION = 'AWS::EC2::TransitGatewayRouteTableAssociation',
  TGW_PROPAGATION = 'AWS::EC2::TransitGatewayRouteTablePropagation',
  TGW_ROUTE = 'AWS::EC2::TransitGatewayRoute',
  NETWORK_ACL = 'AWS::EC2::NetworkAcl',
  NETWORK_ACL_SUBNET_ASSOCIATION = 'AWS::EC2::SubnetNetworkAclAssociation',
  NETWORK_FIREWALL = 'AWS::NetworkFirewall::Firewall',
  NETWORK_FIREWALL_POLICY = 'AWS::NetworkFirewall::FirewallPolicy',
  NETWORK_FIREWALL_RULE_GROUP = 'AWS::NetworkFirewall::RuleGroup',
  NETWORK_FIREWALL_LOGGING = 'AWS::NetworkFirewall::LoggingConfiguration',
  VPC_ENDPOINT = 'AWS::EC2::VPCEndpoint',
  TRANSIT_GATEWAY_ROUTE_TABLE = 'AWS::EC2::TransitGatewayRouteTable',
}

type SecurityGroupRuleInfo = {
  protocol: string;
  source: string;
  sourceValue: string;
  type?: string;
  to?: number;
  from?: number;
  sourceType?: string;
  description?: string;
};

const TCP_PROTOCOLS_PORT: { [key: string]: number } = {
  RDP: 3389,
  SSH: 22,
  HTTP: 80,
  HTTPS: 443,
  MSSQL: 1433,
  'MYSQL/AURORA': 3306,
  REDSHIFT: 5439,
  POSTGRESQL: 5432,
  'ORACLE-RDS': 1521,
};

const ASEA_PHASE_NUMBER = '1';

export class VpcResources extends AseaResource {
  readonly props: AseaResourceProps;
  ssmParameters: { logicalId: string; parameterName: string; stringValue: string; scope: CfnInclude }[];
  constructor(scope: ImportAseaResourcesStack, props: AseaResourceProps) {
    super(scope, props);
    this.props = props;
    this.ssmParameters = [];
    if (props.stackInfo.phase !== ASEA_PHASE_NUMBER) {
      this.scope.addLogs(LogLevel.INFO, `No ${RESOURCE_TYPE.VPC}s to handle in stack ${props.stackInfo.stackName}`);
      return;
    }
    const vpcsInScope = this.scope.vpcsInScope;

    for (const vpcInScope of vpcsInScope) {
      // ASEA creates NestedStack for each VPC. All SSM Parameters related to VPC goes to nested stack
      const vpcResourceInfo = this.getVpcResourceByTag(vpcInScope.name);
      if (!vpcResourceInfo || !vpcResourceInfo.resource.physicalResourceId) {
        this.scope.addLogs(
          LogLevel.INFO,
          `Item Excluded: ${vpcInScope.name} in Account/Region ${props.stackInfo.accountKey}/${props.stackInfo.region}`,
        );
        continue;
      }
      const nestedStack = vpcResourceInfo.nestedStack;
      const nestedStackResources = vpcResourceInfo.nestedStackResources;
      const vpcResource = vpcResourceInfo.resource;
      const vpcPhysicalId = vpcResourceInfo.resource.physicalResourceId;
      // This is retrieved the specific VPC resource is loaded so we can modify attributes
      const vpc = nestedStack.includedTemplate.getResource(vpcResource.logicalResourceId) as CfnVPC;
      this.addTagsToSharedEndpointVpcs(vpc, vpcPhysicalId, props);
      this.setupInternetGateway(nestedStackResources, nestedStack, vpcInScope);
      this.setupVpnGateway(nestedStackResources, nestedStack, vpcInScope);
      // This modifies ASEA vpc attributes to match LZA config
      vpc.cidrBlock = vpcInScope.cidrs![0]; // 0th index is always main cidr Block
      vpc.enableDnsHostnames = vpcInScope.enableDnsHostnames;
      vpc.enableDnsSupport = vpcInScope.enableDnsSupport;
      vpc.instanceTenancy = vpcInScope.instanceTenancy;
      if (vpcInScope.cidrs!.length > 1) {
        const additionalCidrResources = nestedStackResources.getResourcesByType(RESOURCE_TYPE.CIDR_BLOCK);
        const existingAdditionalCidrBlocks: string[] =
          additionalCidrResources?.map(cfnResource => cfnResource.resourceMetadata['Properties'].CidrBlock) ?? [];
        vpcInScope.cidrs!.slice(1).forEach(cidr => {
          const additionalCidrResource = additionalCidrResources?.find(
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
      }
      // Create Subnets takes in an LZA VPC Config as 'vpcInScope' object and Existing ASEA stack resource information as 'vpcStackInfo'
      const subnets = this.createSubnets(vpcInScope, nestedStackResources, nestedStack.includedTemplate);
      this.createNaclSubnetAssociations(vpcInScope, nestedStackResources, nestedStack.includedTemplate);
      this.createNatGateways(nestedStackResources, nestedStack.includedTemplate, vpcInScope, subnets);
      if (this.props.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES) {
        this.deleteSecurityGroups(vpcInScope, nestedStackResources);
      }
      this.createSecurityGroups(vpcInScope, nestedStackResources, nestedStack.includedTemplate);

      const tgwAttachmentMap = this.createTransitGatewayAttachments(
        vpcInScope,
        nestedStackResources,
        nestedStack.includedTemplate,
        subnets,
      );
      this.createTransitGatewayRouteTablePropagation(
        vpcInScope,
        nestedStackResources,
        nestedStack.includedTemplate,
        tgwAttachmentMap ?? {},
      );
      this.createTransitGatewayRouteTableAssociation(
        vpcInScope,
        nestedStackResources,
        nestedStack.includedTemplate,
        tgwAttachmentMap ?? {},
      );
      this.createNetworkFirewallResources(
        vpcInScope,
        nestedStackResources,
        nestedStack.includedTemplate,
        vpc.ref,
        subnets,
      );
      this.gatewayEndpoints(vpcInScope, nestedStackResources, nestedStack.includedTemplate);
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcInScope.name)}VpcId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.VPC, [vpcInScope.name]),
        stringValue: vpc.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.EC2_VPC, vpcInScope.name);
    }
  }
  private createNaclSubnetAssociations(
    vpcInScope: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    includedTemplate: cdk.cloudformation_include.CfnInclude,
  ) {
    const naclsConfig = vpcInScope.networkAcls;
    for (const naclConfig of naclsConfig ?? []) {
      this.processSubnetAssociations(vpcInScope, naclConfig, nestedStackResources, includedTemplate);
    }
  }

  private processSubnetAssociations(
    vpcInScope: VpcConfig | VpcTemplatesConfig,
    naclConfig: NetworkAclConfig,
    nestedStackResources: ImportStackResources,
    includedTemplate: cdk.cloudformation_include.CfnInclude,
  ) {
    const naclName = naclConfig.name;
    const naclId = this.scope.getExternalResourceParameter(
      this.scope.getSsmPath(SsmResourceType.NACL, [vpcInScope.name, naclName]),
    );
    for (const configSubnetAssociation of naclConfig.subnetAssociations) {
      const subnetName = configSubnetAssociation;

      const subnetId = nestedStackResources.getResourceByTypeAndTag(RESOURCE_TYPE.SUBNET, subnetName);

      if (!subnetId?.physicalResourceId) {
        continue;
      }
      const naclSubnetAssociation = this.getNaclSubnetAssociationBySubnetId(nestedStackResources, subnetId);

      if (!naclSubnetAssociation) {
        continue;
      }
      let cfnNaclSubnetAssociation = includedTemplate.getResource(
        naclSubnetAssociation?.logicalResourceId,
      ) as CfnSubnetNetworkAclAssociation;

      if (this.props.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES) {
        cfnNaclSubnetAssociation = this.modifyNaclSubnetAssociation(
          cfnNaclSubnetAssociation,
          naclId,
          cfnNaclSubnetAssociation.subnetId,
        );
      }

      if (cfnNaclSubnetAssociation) {
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(subnetName)}SubnetAssociation`),
          parameterName: this.scope.getSsmPath(SsmResourceType.NETWORK_ACL_SUBNET_ASSOCIATION, [
            vpcInScope.name,
            subnetName,
          ]),
          stringValue: cfnNaclSubnetAssociation.ref,
          scope: nestedStackResources.getStackKey(),
        });

        this.scope.addAseaResource(AseaResourceType.EC2_NACL_SUBNET_ASSOCIATION, `${vpcInScope.name}/${subnetName}`);
      }
    }
  }

  private modifyNaclSubnetAssociation(
    cfnNaclSubnetAssociation: cdk.aws_ec2.CfnSubnetNetworkAclAssociation,
    naclId: string,
    subnetId: string,
  ) {
    cfnNaclSubnetAssociation.networkAclId = naclId;
    cfnNaclSubnetAssociation.subnetId = subnetId;
    return cfnNaclSubnetAssociation;
  }

  private getNaclSubnetAssociationBySubnetId(
    nestedStackResources: ImportStackResources,
    subnetId: CfnResourceType | undefined,
  ) {
    const naclSubnetAssociations = nestedStackResources.getResourcesByType(
      RESOURCE_TYPE.NETWORK_ACL_SUBNET_ASSOCIATION,
    );

    const naclSubnetAssociation = naclSubnetAssociations.find(
      naclSubnetAssociations =>
        naclSubnetAssociations.resourceMetadata['Properties'].SubnetId.Ref === subnetId?.logicalResourceId,
    );
    return naclSubnetAssociation;
  }

  private getVPCId(vpcName: string) {
    if (!this.props.globalConfig.externalLandingZoneResources?.templateMap) {
      return;
    }
    const vpcStacksInfo = this.scope.nestedStackResources ?? {};

    let vpcId: string | undefined;
    for (const [, vpcStackInfo] of Object.entries(vpcStacksInfo)) {
      const vpcResource = this.findResourceByTypeAndTag(vpcStackInfo.cfnResources ?? [], RESOURCE_TYPE.VPC, vpcName);
      if (vpcResource) {
        vpcId = vpcResource.physicalResourceId;
        break;
      }
    }
    return vpcId;
  }

  private addTagsToSharedEndpointVpcs(currentVpc: cdk.aws_ec2.CfnVPC, vpcPhysicalId: string, props: AseaResourceProps) {
    const vpcs = props.networkConfig.vpcs;
    const centralEndpointAccount = this.getCentralEndpointAccount(vpcs);
    const accountsConfig = props.accountsConfig;
    for (const vpc of vpcs) {
      const vpcTemplateId = this.getVPCId(vpc.name);
      if (vpcPhysicalId === vpcTemplateId && vpc.useCentralEndpoints && centralEndpointAccount) {
        cdk.Tags.of(currentVpc).add('accelerator:use-central-endpoints', 'true');
        cdk.Tags.of(currentVpc).add(
          'accelerator:central-endpoints-account-id',
          accountsConfig.getAccountId(centralEndpointAccount!),
        );
      }
    }
  }

  private getCentralEndpointAccount(vpcTemplates: VpcConfig[]) {
    let centralEndpointAccount;
    for (const vpcTemplate of vpcTemplates) {
      if (vpcTemplate.interfaceEndpoints?.central && vpcTemplate.account) {
        centralEndpointAccount = vpcTemplate.account!;
      }
    }
    return centralEndpointAccount;
  }

  private setupInternetGateway(
    nestedStackResources: ImportStackResources,
    nestedStack: cdk.cloudformation_include.IncludedNestedStack,
    vpcConfig: VpcConfig | VpcTemplatesConfig,
  ) {
    const internetGatewayInfo = nestedStackResources.getResourcesByType(RESOURCE_TYPE.INTERNET_GATEWAY)?.[0];
    if (vpcConfig.internetGateway && internetGatewayInfo) {
      const internetGateway = nestedStack.includedTemplate.getResource(
        internetGatewayInfo.logicalResourceId,
      ) as CfnInternetGateway;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcConfig.name)}InternetGatewayId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.IGW, [vpcConfig.name]),
        stringValue: internetGateway.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.EC2_IGW, vpcConfig.name);
    }
  }

  private setupVpnGateway(
    nestedStackResources: ImportStackResources,
    nestedStack: cdk.cloudformation_include.IncludedNestedStack,
    vpcConfig: VpcConfig | VpcTemplatesConfig,
  ) {
    const virtualPrivateGatewayInfo = nestedStackResources.cfnResources?.filter(
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
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.EC2_VPN_GW, vpcConfig.name);
    }
  }

  private createNatGateways(
    nestedStackResources: ImportStackResources,
    vpcStack: CfnInclude,
    vpcItem: VpcConfig | VpcTemplatesConfig,
    subnets: { [name: string]: CfnSubnet },
  ) {
    if (!vpcItem.natGateways || vpcItem.natGateways?.length === 0) {
      this.scope.addLogs(LogLevel.WARN, `NAT Gateways are removed from configuration.`);
      return;
    }
    for (const natGatewayItem of vpcItem.natGateways) {
      const natGatewayResource = nestedStackResources.getResourceByTypeAndTag(
        RESOURCE_TYPE.NAT_GATEWAY,
        natGatewayItem.name,
      );
      if (!natGatewayResource) continue; // NAT Gateway is not managed by ASEA
      const natGateway = vpcStack.getResource(natGatewayResource.logicalResourceId) as CfnNatGateway;
      let subnetId = subnets[natGatewayItem.subnet].ref;
      if (!subnetId) {
        subnetId = this.scope.getExternalResourceParameter(
          this.scope.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, natGateway.subnetId]),
        );
      }
      if (subnetId) {
        // Update SubnetId only if subnet is created
        natGateway.subnetId = subnetId;
      }
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(natGatewayItem.name)}NatGatewayId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.NAT_GW, [vpcItem.name, natGatewayItem.name]),
        stringValue: natGateway.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.NAT_GATEWAY, `${vpcItem.name}/${natGatewayItem.name}`);
    }
  }

  private createSubnets(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    nestedStack: CfnInclude,
  ) {
    const subnets: { [name: string]: CfnSubnet } = {};
    for (const subnetItem of vpcItem.subnets ?? []) {
      const subnetResource = nestedStackResources.getResourceByTypeAndTag(RESOURCE_TYPE.SUBNET, subnetItem.name);
      if (!subnetResource) continue;
      const subnet = nestedStack.getResource(subnetResource.logicalResourceId) as CfnSubnet;
      subnet.cidrBlock = subnetItem.ipv4CidrBlock;
      // LZA Config accepts only 'a' for 'us-east-1a' or integer
      subnet.availabilityZone = `${vpcItem.region}${subnetItem.availabilityZone}`;
      subnet.mapPublicIpOnLaunch = subnetItem.mapPublicIpOnLaunch;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(subnetItem.name)}SubnetId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnetItem.name]),
        stringValue: subnet.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.EC2_SUBNET, `${vpcItem.name}/${subnetItem.name}`);
      subnets[subnetItem.name] = subnet;
    }
    return subnets;
  }

  private createSecurityGroups(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    vpcStack: CfnInclude,
  ) {
    const securityGroupsMap = new Map<string, string>();
    const securityGroupPhysicalIdMap = new Map<string, string>();
    const securityGroupVpc = vpcItem.name;
    for (const securityGroupItem of vpcItem.securityGroups ?? []) {
      const existingSecurityGroup = nestedStackResources.getResourceByName('GroupName', securityGroupItem.name);
      if (!existingSecurityGroup || !existingSecurityGroup.physicalResourceId) {
        continue;
      }
      const securityGroup = vpcStack.getResource(existingSecurityGroup.logicalResourceId) as CfnSecurityGroup;
      this.scope.addLogs(
        LogLevel.INFO,
        `Adding SSM Parameter for ${pascalCase(vpcItem.name) + pascalCase(securityGroupItem.name)}SecurityGroup`,
      );

      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(securityGroupItem.name)}SecurityGroup`),
        parameterName: this.scope.getSsmPath(SsmResourceType.SECURITY_GROUP, [vpcItem.name, securityGroupItem.name]),
        stringValue: securityGroup.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.EC2_SECURITY_GROUP, `${vpcItem.name}/${securityGroupItem.name}`);
      securityGroupsMap.set(securityGroupItem.name, existingSecurityGroup.logicalResourceId);
      securityGroupPhysicalIdMap.set(securityGroupItem.name, existingSecurityGroup.physicalResourceId);
    }

    for (const securityGroupItem of vpcItem.securityGroups ?? []) {
      const logicalId = securityGroupsMap.get(securityGroupItem.name);
      if (!logicalId) continue;
      let securityGroupIngressRules: SecurityGroupRuleInfo[] = [];
      let securityGroupEgressRules: SecurityGroupRuleInfo[] = [];
      securityGroupIngressRules = this.processSecurityGroupIngressSources(
        securityGroupItem.inboundRules,
        securityGroupIngressRules,
        securityGroupsMap,
        securityGroupVpc,
      );
      securityGroupEgressRules = this.processSecurityGroupEgressSources(
        securityGroupItem.outboundRules,
        securityGroupEgressRules,
        securityGroupsMap,
        securityGroupVpc,
      );

      const securityGroup = vpcStack.getResource(logicalId) as CfnSecurityGroup;
      this.updateSecurityGroupIngressRules(
        securityGroupIngressRules,
        securityGroupPhysicalIdMap,
        securityGroup,
        securityGroupVpc,
      );
      this.updateSecurityGroupEgressRules(
        securityGroupEgressRules,
        securityGroupPhysicalIdMap,
        securityGroup,
        securityGroupVpc,
      );
    }
  }

  private processSecurityGroupSources = (
    securityGroupRuleItem: SecurityGroupRuleConfig,
    ruleProps: {
      protocol: cdk.aws_ec2.Protocol;
      type?: string;
      from?: number;
      to?: number;
    },
    securityGroupsMap: Map<string, string>,
    securityGroupVpc: string,
  ) => {
    const securityGroupRules: SecurityGroupRuleInfo[] = [];
    securityGroupRuleItem.sources.forEach(sourceItem => {
      if (isNetworkType<NonEmptyString>('NonEmptyString', sourceItem)) {
        securityGroupRules.push({
          ...ruleProps,
          source: sourceItem,
          sourceValue: sourceItem,
          description: securityGroupRuleItem.description,
        });
      }
      if (isNetworkType<SubnetSourceConfig>('ISubnetSourceConfig', sourceItem)) {
        const sourceVpcItem = getVpcConfig(this.scope.vpcResources, sourceItem.vpc);
        sourceItem.subnets.forEach(subnet =>
          securityGroupRules.push({
            ...ruleProps,
            source: `${sourceVpcItem.name}/${subnet}`,
            sourceValue: getSubnetConfig(sourceVpcItem, subnet).ipv4CidrBlock!,
            sourceType: 'subnet',
            description: securityGroupRuleItem.description,
          }),
        );
      }
      if (isNetworkType<SecurityGroupSourceConfig>('ISecurityGroupSourceConfig', sourceItem)) {
        sourceItem.securityGroups.forEach(securityGroup => {
          const securityGroupId = this.getSecurityGroupId(securityGroupsMap, securityGroup, securityGroupVpc);
          if (!securityGroupId) return;
          //We do not currently account for cross account or cross vpc sgs, this is not natively supported in LZA.
          securityGroupRules.push({
            ...ruleProps,
            source: securityGroup,
            sourceValue: securityGroupsMap.get(securityGroup) ?? securityGroupId,
            sourceType: 'sg',
            description: securityGroupRuleItem.description,
          });
        });
      }
    });
    return securityGroupRules;
  };

  private getSecurityGroupId(securityGroupsMap: Map<string, string>, securityGroup: string, securityGroupVpc: string) {
    let securityGroupId = undefined;
    const securityGroupFromSSMParam = this.scope.getExternalResourceParameter(
      this.scope.getSsmPath(SsmResourceType.SECURITY_GROUP, [securityGroupVpc, securityGroup]),
    );
    // This sets SG if securityGroup exists in ASEA SGs
    if (securityGroupsMap.get(securityGroup)) {
      securityGroupId = securityGroupsMap.get(securityGroup);
    } else if (securityGroupFromSSMParam) {
      // This sets SG equal to value if securityGroup exists as a security Group created by LZA
      securityGroupId = securityGroupFromSSMParam;
    } else {
      if (!securityGroupId && this.props.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES) {
        throw new Error(
          `Security Group Source ${securityGroup} was not found in ASEA SecurityGroup Map or in SSM Parameter path for ${this.scope.getSsmPath(
            SsmResourceType.SECURITY_GROUP,
            [securityGroupVpc, securityGroup],
          )}`,
        );
      }
    }
    return securityGroupId;
  }

  private processSecurityGroupIngressSources(
    securityGroupRuleIngressItems: SecurityGroupRuleConfig[],
    securityGroupIngressRules: SecurityGroupRuleInfo[],
    securityGroupsMap: Map<string, string>,
    securityGroupVpc: string,
  ) {
    for (const ingressRuleItem of securityGroupRuleIngressItems) {
      securityGroupIngressRules.push(
        ...this.processTcpSources(ingressRuleItem, securityGroupsMap, securityGroupVpc),
        ...this.processUdpSources(ingressRuleItem, securityGroupsMap, securityGroupVpc),
        ...this.processTypeSources(ingressRuleItem, securityGroupsMap, securityGroupVpc),
      );
    }

    return securityGroupIngressRules;
  }

  private processSecurityGroupEgressSources(
    securityGroupRuleEgressItems: SecurityGroupRuleConfig[],
    securityGroupEgressRules: SecurityGroupRuleInfo[],
    securityGroupsMap: Map<string, string>,
    securityGroupVpc: string,
  ) {
    for (const egressRuleItem of securityGroupRuleEgressItems) {
      securityGroupEgressRules.push(
        ...this.processTcpSources(egressRuleItem, securityGroupsMap, securityGroupVpc),
        ...this.processUdpSources(egressRuleItem, securityGroupsMap, securityGroupVpc),
        ...this.processTypeSources(egressRuleItem, securityGroupsMap, securityGroupVpc),
      );
    }
    return securityGroupEgressRules;
  }

  private processTypeSources = (
    securityGroupRuleItem: SecurityGroupRuleConfig,
    securityGroupsMap: Map<string, string>,
    securityGroupVpc: string,
  ) => {
    const securityGroupRules: SecurityGroupRuleInfo[] = [];

    for (const ruleType of securityGroupRuleItem.types ?? []) {
      if (ruleType === 'ALL') {
        const defaultRuleProps = {
          protocol: cdk.aws_ec2.Protocol.ALL,
          type: ruleType,
        };
        securityGroupRules.push(
          ...this.processSecurityGroupSources(
            securityGroupRuleItem,
            defaultRuleProps,
            securityGroupsMap,
            securityGroupVpc,
          ),
        );
      } else {
        const defaultRuleProps = {
          protocol: cdk.aws_ec2.Protocol.TCP,
          type: ruleType,
          from: TCP_PROTOCOLS_PORT[ruleType],
          to: TCP_PROTOCOLS_PORT[ruleType],
        };
        securityGroupRules.push(
          ...this.processSecurityGroupSources(
            securityGroupRuleItem,
            defaultRuleProps,
            securityGroupsMap,
            securityGroupVpc,
          ),
        );
      }
    }
    return securityGroupRules;
  };

  private processUdpSources = (
    securityGroupRuleItem: SecurityGroupRuleConfig,
    securityGroupsMap: Map<string, string>,
    securityGroupVpc: string,
  ) => {
    const securityGroupRules: SecurityGroupRuleInfo[] = [];
    for (const tcpPort of securityGroupRuleItem.udpPorts ?? []) {
      const defaultRuleProps = {
        protocol: cdk.aws_ec2.Protocol.UDP,
        from: tcpPort,
        to: tcpPort,
      };
      securityGroupRules.push(
        ...this.processSecurityGroupSources(
          securityGroupRuleItem,
          defaultRuleProps,
          securityGroupsMap,
          securityGroupVpc,
        ),
      );
    }
    return securityGroupRules;
  };

  private processTcpSources = (
    securityGroupRuleItem: SecurityGroupRuleConfig,
    securityGroupsMap: Map<string, string>,
    securityGroupVpc: string,
  ) => {
    const securityGroupRules: SecurityGroupRuleInfo[] = [];
    for (const tcpPort of securityGroupRuleItem.tcpPorts ?? []) {
      const defaultRuleProps = {
        protocol: cdk.aws_ec2.Protocol.TCP,
        from: tcpPort,
        to: tcpPort,
      };
      securityGroupRules.push(
        ...this.processSecurityGroupSources(
          securityGroupRuleItem,
          defaultRuleProps,
          securityGroupsMap,
          securityGroupVpc,
        ),
      );
    }
    return securityGroupRules;
  };

  private updateSecurityGroupIngressRules(
    securityGroupLzaConfigIngressRules: SecurityGroupRuleInfo[],
    securityGroupPhysicalIdMap: Map<string, string>,
    securityGroup: cdk.aws_ec2.CfnSecurityGroup,
    securityGroupVpc: string,
  ) {
    let existingIngressRulesToBeUpdated: CfnSecurityGroup.IngressProperty[] = [];
    existingIngressRulesToBeUpdated = this.mapConfigRulesToIngressProperties(
      securityGroupLzaConfigIngressRules,
      securityGroupPhysicalIdMap,
      securityGroupVpc,
    );

    if (existingIngressRulesToBeUpdated && existingIngressRulesToBeUpdated.length > 0) {
      this.scope.addLogs(LogLevel.INFO, `'Updating Ingress rules on Security Group ${securityGroup.groupName}`);
      this.scope.addLogs(
        LogLevel.INFO,
        `Pushing on ingress rule(s): ${JSON.stringify(existingIngressRulesToBeUpdated)}`,
      );
      if (securityGroup) {
        securityGroup.securityGroupIngress = existingIngressRulesToBeUpdated;
      }
    }
    return securityGroup;
  }

  private updateSecurityGroupEgressRules(
    securityGroupLzaConfigEgressRules: SecurityGroupRuleInfo[],
    securityGroupPhysicalIdMap: Map<string, string>,
    securityGroup: cdk.aws_ec2.CfnSecurityGroup,
    securityGroupVpc: string,
  ) {
    let existingEgressRulesToBeUpdated: CfnSecurityGroup.EgressProperty[] = [];
    existingEgressRulesToBeUpdated = this.mapConfigRulesToEgressProperties(
      securityGroupLzaConfigEgressRules,
      securityGroupPhysicalIdMap,
      securityGroupVpc,
    );

    if (existingEgressRulesToBeUpdated && existingEgressRulesToBeUpdated.length > 0) {
      this.scope.addLogs(LogLevel.INFO, `Updating Egress rules on SG: ${securityGroup.groupName}`);
      this.scope.addLogs(LogLevel.INFO, `Pushing on egress rule(s): ${JSON.stringify(existingEgressRulesToBeUpdated)}`);
      if (securityGroup) {
        securityGroup.securityGroupEgress = existingEgressRulesToBeUpdated;
      }
    }
    return securityGroup;
  }

  private mapConfigRulesToEgressProperties(
    securityGroupLzaConfigRules: SecurityGroupRuleInfo[],
    securityGroupPhysicalIdMap: Map<string, string>,
    securityGroupVpc: string,
  ) {
    const existingEgressRulesToBeUpdated: CfnSecurityGroup.IngressProperty[] = [];
    securityGroupLzaConfigRules.forEach(configEgressRule => {
      if (configEgressRule.sourceType === 'sg') {
        const securityGroupId = this.getSecurityGroupId(
          securityGroupPhysicalIdMap,
          configEgressRule.source,
          securityGroupVpc,
        );
        const existingEgressRuleToBeUpdated: CfnSecurityGroup.EgressProperty = {
          ipProtocol: configEgressRule.protocol,
          description: configEgressRule.description,
          destinationSecurityGroupId: securityGroupId,
          fromPort: configEgressRule.from,
          toPort: configEgressRule.to,
        };
        existingEgressRulesToBeUpdated.push(existingEgressRuleToBeUpdated);
      }

      if (configEgressRule.sourceType === 'pl') {
        const existingEgressRuleToBeUpdated: CfnSecurityGroup.EgressProperty = {
          ipProtocol: configEgressRule.protocol,
          description: configEgressRule.description,
          destinationPrefixListId: configEgressRule.source,
        };
        existingEgressRulesToBeUpdated.push(existingEgressRuleToBeUpdated);
      }
      if (configEgressRule.sourceType === 'subnet') {
        const existingEgressRuleToBeUpdated: CfnSecurityGroup.EgressProperty = {
          ipProtocol: configEgressRule.protocol,
          description: configEgressRule.description,
          cidrIp: configEgressRule.sourceValue,
          fromPort: configEgressRule.from,
          toPort: configEgressRule.to,
        };
        existingEgressRulesToBeUpdated.push(existingEgressRuleToBeUpdated);
      }
      const sourceCidrType = this.checkCidrFromSource(configEgressRule.source);

      if (sourceCidrType === 'cidrIpv4') {
        const existingEgressRuleToBeUpdated: CfnSecurityGroup.EgressProperty = {
          ipProtocol: configEgressRule.protocol,
          description: configEgressRule.description,
          cidrIp: configEgressRule.source,
          fromPort: configEgressRule.from,
          toPort: configEgressRule.to,
        };
        existingEgressRulesToBeUpdated.push(existingEgressRuleToBeUpdated);
      }

      if (sourceCidrType === 'cidrIpv6') {
        const existingEgressRuleToBeUpdated: CfnSecurityGroup.EgressProperty = {
          ipProtocol: configEgressRule.protocol,
          description: configEgressRule.description,
          cidrIpv6: configEgressRule.source,
          fromPort: configEgressRule.from,
          toPort: configEgressRule.to,
        };
        existingEgressRulesToBeUpdated.push(existingEgressRuleToBeUpdated);
      }
    });
    return existingEgressRulesToBeUpdated;
  }

  private mapConfigRulesToIngressProperties(
    securityGroupLzaConfigIngressRules: SecurityGroupRuleInfo[],
    securityGroupPhysicalIdMap: Map<string, string>,
    securityGroupVpc: string,
  ) {
    const existingIngressRulesToBeUpdated: CfnSecurityGroup.IngressProperty[] = [];
    securityGroupLzaConfigIngressRules.forEach(configIngressRule => {
      if (configIngressRule.sourceType === 'sg') {
        const securityGroupId = this.getSecurityGroupId(
          securityGroupPhysicalIdMap,
          configIngressRule.source,
          securityGroupVpc,
        );
        const existingIngressRuleToBeUpdated: CfnSecurityGroup.IngressProperty = {
          ipProtocol: configIngressRule.protocol,
          description: configIngressRule.description,
          sourceSecurityGroupId: securityGroupId,
          fromPort: configIngressRule.from,
          toPort: configIngressRule.to,
        };
        existingIngressRulesToBeUpdated.push(existingIngressRuleToBeUpdated);
      }

      if (configIngressRule.sourceType === 'pl') {
        const existingIngressRuleToBeUpdated: CfnSecurityGroup.IngressProperty = {
          ipProtocol: configIngressRule.protocol,
          description: configIngressRule.description,
          sourcePrefixListId: configIngressRule.source,
        };
        existingIngressRulesToBeUpdated.push(existingIngressRuleToBeUpdated);
      }
      if (configIngressRule.sourceType === 'subnet') {
        const existingIngressRuleToBeUpdated: CfnSecurityGroup.IngressProperty = {
          ipProtocol: configIngressRule.protocol,
          description: configIngressRule.description,
          cidrIp: configIngressRule.sourceValue,
          fromPort: configIngressRule.from,
          toPort: configIngressRule.to,
        };
        existingIngressRulesToBeUpdated.push(existingIngressRuleToBeUpdated);
      }
      const sourceCidrType = this.checkCidrFromSource(configIngressRule.source);

      if (sourceCidrType === 'cidrIpv4') {
        const existingIngressRuleToBeUpdated: CfnSecurityGroup.IngressProperty = {
          ipProtocol: configIngressRule.protocol,
          description: configIngressRule.description,
          cidrIp: configIngressRule.source,
          fromPort: configIngressRule.from,
          toPort: configIngressRule.to,
        };
        existingIngressRulesToBeUpdated.push(existingIngressRuleToBeUpdated);
      }

      if (sourceCidrType === 'cidrIpv6') {
        const existingIngressRuleToBeUpdated: CfnSecurityGroup.IngressProperty = {
          ipProtocol: configIngressRule.protocol,
          description: configIngressRule.description,
          cidrIpv6: configIngressRule.source,
          fromPort: configIngressRule.from,
          toPort: configIngressRule.to,
        };
        existingIngressRulesToBeUpdated.push(existingIngressRuleToBeUpdated);
      }
    });
    return existingIngressRulesToBeUpdated;
  }

  private checkCidrFromSource(source: string) {
    let sourceType;
    if (this.isValidIpv4Cidr(source)) {
      sourceType = 'cidrIpv4';
    }
    if (this.isValidIpv6Cidr(source)) {
      sourceType = 'cidrIpv6';
    }
    return sourceType;
  }

  private createTransitGatewayAttachments(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    nestedStack: CfnInclude,
    subnetRefs: { [name: string]: CfnSubnet },
  ) {
    const tgwAttachmentMap: { [name: string]: string } = {};
    const tgwAttachmentResources = nestedStackResources.getResourcesByType(RESOURCE_TYPE.TGW_ATTACHMENT);
    if (tgwAttachmentResources.length === 0) return;
    if (vpcItem.transitGatewayAttachments?.length === 0 && tgwAttachmentResources.length > 0) {
      this.scope.addLogs(LogLevel.WARN, `TGW Attachment is removed from VPC "${vpcItem.name}" configuration`);
      return;
    }
    for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
      const tgwAttachmentResource = nestedStackResources.getResourceByTypeAndTag(
        RESOURCE_TYPE.TGW_ATTACHMENT,
        `${tgwAttachmentItem.name}`,
      );
      if (!tgwAttachmentResource) continue;
      const tgwAttachment = nestedStack.getResource(
        tgwAttachmentResource.logicalResourceId,
      ) as CfnTransitGatewayAttachment;
      const subnetIds: string[] = [];
      tgwAttachmentItem.subnets.forEach(subnet => {
        let subnetId = subnetRefs[subnet].ref;
        if (!subnetId) {
          subnetId = this.scope.getExternalResourceParameter(
            this.scope.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnet]),
          );
        }
        if (subnetId) subnetIds.push(subnetId);
      });
      // Only Subnets can be updated in TGW Attachment.
      tgwAttachment.subnetIds = subnetIds;
      this.scope.addSsmParameter({
        logicalId: pascalCase(
          `SsmParam${pascalCase(vpcItem.name) + pascalCase(tgwAttachmentItem.name)}TransitGatewayAttachmentId`,
        ),
        parameterName: this.scope.getSsmPath(SsmResourceType.TGW_ATTACHMENT, [vpcItem.name, tgwAttachmentItem.name]),
        stringValue: tgwAttachment.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(
        AseaResourceType.TRANSIT_GATEWAY_ATTACHMENT,
        `${vpcItem.name}/${tgwAttachmentItem.name}`,
      );
      tgwAttachmentMap[tgwAttachmentItem.name] = tgwAttachmentResource.logicalResourceId;
    }
    return tgwAttachmentMap;
  }

  private getTgwRouteTableId(routeTableName: string) {
    if (!this.props.globalConfig.externalLandingZoneResources?.templateMap) {
      return;
    }
    const mapping = this.props.globalConfig.externalLandingZoneResources.templateMap;
    const tgwStackMappingKey = Object.keys(mapping).find(
      key =>
        mapping[key].phase === '0' &&
        mapping[key].accountKey === this.stackInfo.accountKey &&
        mapping[key].region === this.stackInfo.region,
    );
    if (!tgwStackMappingKey) {
      return;
    }
    const tgwRouteTableResources = this.filterResourcesByType(
      mapping[tgwStackMappingKey].cfnResources,
      RESOURCE_TYPE.TRANSIT_GATEWAY_ROUTE_TABLE,
    );
    const tgwRouteTableResource = this.findResourceByTag(tgwRouteTableResources, routeTableName);
    return tgwRouteTableResource?.physicalResourceId;
  }

  private createTransitGatewayRouteTablePropagation(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    nestedStack: CfnInclude,
    tgwAttachMap: { [name: string]: string },
  ) {
    const tgwPropagations = nestedStackResources.getResourcesByType(RESOURCE_TYPE.TGW_PROPAGATION);
    if (tgwPropagations.length === 0) return;
    const createPropagations = (tgwAttachmentItem: TransitGatewayAttachmentConfig) => {
      for (const routeTableItem of tgwAttachmentItem.routeTablePropagations ?? []) {
        const tgwPropagationRes = tgwPropagations.find(
          propagation =>
            propagation.resourceMetadata['Properties'].TransitGatewayAttachmentId.Ref ===
              tgwAttachMap[tgwAttachmentItem.name] &&
            propagation.resourceMetadata['Properties'].TransitGatewayRouteTableId ===
              this.getTgwRouteTableId(routeTableItem),
        );
        if (!tgwPropagationRes) continue;
        const tgwPropagation = nestedStack.getResource(
          tgwPropagationRes.logicalResourceId,
        ) as cdk.aws_ec2.CfnTransitGatewayRouteTablePropagation;
        if (!tgwPropagation) {
          this.scope.addLogs(
            LogLevel.WARN,
            `TGW Propagation for "${tgwAttachmentItem.name}/${routeTableItem}" exists in Mapping but not found in resources`,
          );
        }
        // Propagation resourceId is not used anywhere in LZA. No need of SSM Parameter.
        this.scope.addAseaResource(
          AseaResourceType.TRANSIT_GATEWAY_PROPAGATION,
          `${tgwAttachmentItem.transitGateway.account}/${tgwAttachmentItem.transitGateway.name}/${tgwAttachmentItem.name}/${routeTableItem}`,
        );
      }
    };
    if (vpcItem.transitGatewayAttachments?.length === 0) {
      this.scope.addLogs(LogLevel.WARN, `TGW Attachment is removed from VPC "${vpcItem.name}" configuration`);
      return;
    }
    (vpcItem.transitGatewayAttachments ?? []).map(createPropagations);
  }

  private createTransitGatewayRouteTableAssociation(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    nestedStack: CfnInclude,
    tgwAttachMap: { [name: string]: string },
  ) {
    const tgwAssociations = nestedStackResources.getResourcesByType(RESOURCE_TYPE.TGW_ASSOCIATION);
    if (tgwAssociations.length === 0) return;
    const createAssociations = (tgwAttachmentItem: TransitGatewayAttachmentConfig) => {
      for (const routeTableItem of tgwAttachmentItem.routeTableAssociations ?? []) {
        const tgwAssociationRes = tgwAssociations.find(
          propagation =>
            propagation.resourceMetadata['Properties'].TransitGatewayAttachmentId.Ref ===
              tgwAttachMap[tgwAttachmentItem.name] &&
            propagation.resourceMetadata['Properties'].TransitGatewayRouteTableId ===
              this.getTgwRouteTableId(routeTableItem),
        );
        if (!tgwAssociationRes) continue;
        const tgwAssociation = nestedStack.getResource(
          tgwAssociationRes.logicalResourceId,
        ) as cdk.aws_ec2.CfnTransitGatewayRouteTableAssociation;
        if (!tgwAssociation) {
          this.scope.addLogs(
            LogLevel.WARN,
            `TGW Association for "${tgwAttachmentItem.name}/${routeTableItem}" exists in Mapping but not found in resources`,
          );
        }
        // Propagation resourceId is not used anywhere in LZA. No need of SSM Parameter.
        this.scope.addAseaResource(
          AseaResourceType.TRANSIT_GATEWAY_ASSOCIATION,
          `${tgwAttachmentItem.transitGateway.account}/${tgwAttachmentItem.transitGateway.name}/${tgwAttachmentItem.name}/${routeTableItem}`,
        );
      }
    };
    if (vpcItem.transitGatewayAttachments?.length === 0) {
      this.scope.addLogs(LogLevel.WARN, `TGW Attachment is removed from VPC "${vpcItem.name}" configuration`);
      return;
    }
    (vpcItem.transitGatewayAttachments ?? []).map(createAssociations);
  }

  createRouteTables(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    vpcStack: CfnInclude,
  ) {
    const existingRouteTablesMapping = nestedStackResources.getResourcesByType(RESOURCE_TYPE.ROUTE_TABLE);
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTableResource = this.findResourceByTag(existingRouteTablesMapping, routeTableItem.name);
      if (!routeTableResource) continue;
      const routeTable = vpcStack.getResource(routeTableResource.logicalResourceId) as CfnRouteTable;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name)}${pascalCase(routeTableItem.name)}RouteTableId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.ROUTE_TABLE, [vpcItem.name, routeTableItem.name]),
        stringValue: routeTable.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.ROUTE_TABLE, `${vpcItem.name}/${routeTableItem.name}`);
    }
  }

  /**
   * Find VPC Resource by tag and nestedStackInfo of VPC
   * @param vpcName
   * @returns
   */
  private getVpcResourceByTag(vpcName: string) {
    for (const [, nestedStackInfo] of Object.entries(this.scope.nestedStackResources ?? {})) {
      const vpcResource = nestedStackInfo.getResourceByTypeAndTag(RESOURCE_TYPE.VPC, vpcName);
      if (vpcResource) {
        return {
          nestedStackResources: nestedStackInfo,
          nestedStack: this.scope.nestedStacks[nestedStackInfo.getStackKey()],
          resource: vpcResource,
        };
      }
    }
    return;
  }

  private deleteAseaNetworkFirewallRuleGroups(nestedStackResources: ImportStackResources) {
    const networkFirewallConfig = this.props.networkConfig.centralNetworkServices?.networkFirewall;
    const firewallRuleGroupResources = nestedStackResources.getResourcesByType(
      RESOURCE_TYPE.NETWORK_FIREWALL_RULE_GROUP,
    );
    if (firewallRuleGroupResources.length === 0) {
      return;
    }
    for (const firewallRuleGroupResource of firewallRuleGroupResources) {
      const aseaManagedRuleGroupName: string = firewallRuleGroupResource.resourceMetadata['Properties'].RuleGroupName;
      const ruleItem = networkFirewallConfig?.rules.find(group => group.name === aseaManagedRuleGroupName);
      if (!ruleItem) {
        this.scope.addLogs(
          LogLevel.INFO,
          `No Firewall Rule Group found in configuration and firewall policy present in resource mapping`,
        );
        continue;
      }

      this.scope.addLogs(LogLevel.INFO, `Removing NFW Rule Group: ${firewallRuleGroupResource.logicalResourceId}`);
      this.scope.addDeleteFlagForNestedResource(
        nestedStackResources.getStackKey(),
        firewallRuleGroupResource.logicalResourceId,
      );
    }
  }

  private deleteAseaNetworkFirewallPolicy(nestedStack: ImportStackResources) {
    const firewallResources = nestedStack.getResourcesByType(RESOURCE_TYPE.NETWORK_FIREWALL_POLICY);
    if (firewallResources.length === 0) {
      return;
    }
    const aseaManagedPolicy = firewallResources[0];

    this.scope.addLogs(LogLevel.INFO, `Removing NFW Policy: ${aseaManagedPolicy.logicalResourceId}`);
    this.scope.addDeleteFlagForNestedResource(nestedStack.getStackKey(), aseaManagedPolicy.logicalResourceId);
  }

  private addFirewallLoggingConfiguration(
    nestedStackResources: ImportStackResources,
    vpcStack: CfnInclude,
    firewallItem: NfwFirewallConfig,
  ) {
    const loggingConfigurationResource = nestedStackResources.getResourcesByType(
      RESOURCE_TYPE.NETWORK_FIREWALL_LOGGING,
    );
    if (!loggingConfigurationResource) return;
    const loggingConfiguration = vpcStack.getResource(
      loggingConfigurationResource[0].logicalResourceId,
    ) as cdk.aws_networkfirewall.CfnLoggingConfiguration;
    const destinationConfigs: cdk.aws_networkfirewall.CfnLoggingConfiguration.LogDestinationConfigProperty[] = [];
    for (const logItem of firewallItem.loggingConfiguration ?? []) {
      if (logItem.destination === 'cloud-watch-logs') {
        const firewallName = firewallItem.name.replace(`${this.scope.acceleratorPrefix}-`, '');
        destinationConfigs.push({
          logDestination: {
            logGroup: `/${this.scope.acceleratorPrefix}/Nfw/${firewallName}/${pascalCase(logItem.type)}`,
          },
          logDestinationType: 'CloudWatchLogs',
          logType: logItem.type,
        });
      }

      if (logItem.destination === 's3') {
        destinationConfigs.push({
          logDestination: {
            bucketName: this.scope.firewallBucket.bucketName,
            prefix: 'firewall',
          },
          logDestinationType: 'S3',
          logType: logItem.type,
        });
      }
    }
    loggingConfiguration.loggingConfiguration = {
      logDestinationConfigs: destinationConfigs,
    };
  }

  private createNetworkFirewall(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    vpcStack: CfnInclude,
    vpcId: string,
    subnets: { [name: string]: CfnSubnet },
  ) {
    const networkFirewallConfig = this.props.networkConfig.centralNetworkServices?.networkFirewall;
    const firewallsConfig = networkFirewallConfig?.firewalls.filter(
      firewallConfig => firewallConfig && firewallConfig.vpc === vpcItem.name,
    );
    const firewallResources = nestedStackResources.getResourcesByType(RESOURCE_TYPE.NETWORK_FIREWALL);

    // If there are not any ASEA managed firewalls in resource mapping continue
    if (firewallResources.length === 0) {
      return;
    }

    // Delete any ASEA managed firewalls if no firewalls are found in configuration
    if (!firewallsConfig || firewallsConfig.length === 0) {
      this.scope.addLogs(LogLevel.INFO, `No Firewall found in configuration`);
      for (const firewallResource of firewallResources) {
        this.scope.addLogs(LogLevel.WARN, `Removing firewall ${firewallResource.physicalResourceId} from ASEA stack`);
        this.scope.addDeleteFlagForAseaResource({
          logicalId: firewallResource.logicalResourceId,
          type: RESOURCE_TYPE.NETWORK_FIREWALL,
        });
      }
      return;
    }

    // Delete any ASEA managed firewalls that don't exist in configuration.
    for (const firewallResource of firewallResources) {
      const firewallName = firewallResource.resourceMetadata['Properties']['FirewallName'];
      const firewallConfig = firewallsConfig.find(nfw => nfw.name === firewallName);
      if (!firewallConfig) {
        this.scope.addLogs(LogLevel.WARN, `Removing firewall ${firewallResource.physicalResourceId} from ASEA stack`);
        this.scope.addDeleteFlagForNestedResource(
          nestedStackResources.getStackKey(),
          firewallResource.logicalResourceId,
        );
        return;
      }
    }

    for (const firewallItem of firewallsConfig) {
      const firewallResource = this.findResourceByName(firewallResources, 'FirewallName', firewallItem.name);
      if (!firewallResource) continue;
      const subnetIds: string[] = [];
      firewallItem.subnets.forEach(subnet => {
        let subnetId = subnets[subnet].ref;
        if (!subnetId) {
          subnetId = this.scope.getExternalResourceParameter(
            this.scope.getSsmPath(SsmResourceType.SUBNET, [vpcItem.name, subnet]),
          );
        }
        if (subnetId) subnetIds.push(subnetId);
      });

      if (this.props.stage === AcceleratorStage.IMPORT_ASEA_RESOURCES) {
        const firewallResource = this.findResourceByName(firewallResources, 'FirewallName', firewallItem.name);
        if (!firewallResource || !firewallResource.physicalResourceId) continue;
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(firewallItem.vpc) + pascalCase(firewallItem.name)}FirewallArn`),
          parameterName: this.scope.getSsmPath(SsmResourceType.NFW, [firewallItem.vpc, firewallItem.name]),
          stringValue: firewallResource.physicalResourceId,
          scope: nestedStackResources.getStackKey(),
        });
      }

      this.scope.addAseaResource(AseaResourceType.NFW, firewallItem.name);
      if (this.props.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES) {
        const region = nestedStackResources.stackMapping.region;
        const partition = this.props.partition;
        const delegatedAdminAccountId = this.props.accountsConfig.getAccountId(
          this.props.networkConfig.centralNetworkServices?.delegatedAdminAccount ?? '',
        );
        const firewallPolicyArn = this.getFirewallPolicyArn(
          partition,
          region,
          delegatedAdminAccountId,
          firewallItem.firewallPolicy,
        );
        const firewall = NetworkFirewall.includedCfnResource(vpcStack, firewallResource.logicalResourceId, {
          firewallPolicyArn: firewallPolicyArn,
          name: firewallItem.name,
          description: firewallItem.description,
          subnets: subnetIds,
          vpcId: vpcId,
          deleteProtection: firewallItem.deleteProtection,
          firewallPolicyChangeProtection: firewallItem.firewallPolicyChangeProtection,
          subnetChangeProtection: firewallItem.subnetChangeProtection,
        });
        this.addFirewallLoggingConfiguration(nestedStackResources, vpcStack, firewallItem);
        this.scope.addSsmParameter({
          logicalId: pascalCase(`SsmParam${pascalCase(firewallItem.vpc) + pascalCase(firewallItem.name)}FirewallArn`),
          parameterName: this.scope.getSsmPath(SsmResourceType.NFW, [firewallItem.vpc, firewallItem.name]),
          stringValue: firewall.attrFirewallArn,
          scope: nestedStackResources.getStackKey(),
        });
      }
    }
  }

  private getFirewallPolicyArn(
    partition: string,
    region: string,
    delegatedAdminAccountId: string,
    firewallPolicy: string,
  ): string {
    return isArn(firewallPolicy)
      ? firewallPolicy
      : `arn:${partition}:network-firewall:${region}:${delegatedAdminAccountId}:firewall-policy/${firewallPolicy}`;
  }

  /**
   * Returns true if the given CIDR is valid
   * @param cidr
   * @returns
   */
  private isValidIpv4Cidr(cidr: string): boolean {
    try {
      IPv4CidrRange.fromCidr(cidr);
    } catch (e) {
      return false;
    }
    return true;
  }

  /**
   * Returns true if valid CIDR is valid
   * @param cidr
   * @returns
   */
  private isValidIpv6Cidr(cidr: string): boolean {
    try {
      IPv6CidrRange.fromCidr(cidr);
    } catch (e) {
      return false;
    }
    return true;
  }

  private createNetworkFirewallResources(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    vpcStack: CfnInclude,
    vpcId: string,
    subnets: { [name: string]: CfnSubnet },
  ) {
    if (this.props.stage === AcceleratorStage.IMPORT_ASEA_RESOURCES) {
      this.createNetworkFirewall(vpcItem, nestedStackResources, vpcStack, vpcId, subnets);
    }
    if (this.props.stage === AcceleratorStage.POST_IMPORT_ASEA_RESOURCES) {
      this.deleteAseaNetworkFirewallRuleGroups(nestedStackResources);
      this.deleteAseaNetworkFirewallPolicy(nestedStackResources);
      this.createNetworkFirewall(vpcItem, nestedStackResources, vpcStack, vpcId, subnets);
    }
  }

  private gatewayEndpoints(
    vpcItem: VpcConfig | VpcTemplatesConfig,
    nestedStackResources: ImportStackResources,
    vpcStack: CfnInclude,
  ) {
    /**
     * Function to get S3 and DynamoDB route table ids
     * @param routeTableItem {@link RouteTableConfig}
     * @param routeTableId string
     */
    const getS3DynamoDbRouteTableIds = (
      routeTableItem: RouteTableConfig,
      routeTableId: string,
      s3EndpointRouteTables: string[],
      dynamodbEndpointRouteTables: string[],
    ) => {
      for (const routeTableEntryItem of routeTableItem.routes ?? []) {
        // Route: S3 Gateway Endpoint
        if (routeTableEntryItem.target === 's3') {
          if (!s3EndpointRouteTables.find(item => item === routeTableId)) {
            s3EndpointRouteTables.push(routeTableId);
          }
        }

        // Route: DynamoDb Gateway Endpoint
        if (routeTableEntryItem.target === 'dynamodb') {
          if (!dynamodbEndpointRouteTables.find(item => item === routeTableId)) {
            dynamodbEndpointRouteTables.push(routeTableId);
          }
        }
      }
    };
    const s3EndpointRouteTables: string[] = [];
    const dynamodbEndpointRouteTables: string[] = [];
    for (const routeTableItem of vpcItem.routeTables ?? []) {
      const routeTableId = this.scope.getExternalResourceParameter(
        this.scope.getSsmPath(SsmResourceType.ROUTE_TABLE, [vpcItem.name, routeTableItem.name]),
      );
      if (!routeTableId) continue; // Route table is not created yet
      getS3DynamoDbRouteTableIds(routeTableItem, routeTableId, s3EndpointRouteTables, dynamodbEndpointRouteTables);
    }
    // ASEA Only creates VPC Endpoints in VPC Nested Stack
    const gatewayEndpointResources = nestedStackResources.getResourcesByType(RESOURCE_TYPE.VPC_ENDPOINT);
    if (gatewayEndpointResources.length === 0) {
      return;
    } else if (!vpcItem.gatewayEndpoints?.endpoints) {
      this.scope.addLogs(LogLevel.WARN, `Endpoints are removed from configuration`);
      return;
    }

    for (const endpointItem of vpcItem.gatewayEndpoints.endpoints ?? []) {
      const gatewayEndpointResource = gatewayEndpointResources.find(
        cfnResource =>
          cfnResource.resourceMetadata['Properties'].ServiceName['Fn::Join'][1].at(-1) === `.${endpointItem.service}`,
      );
      if (!gatewayEndpointResource) {
        continue;
      }
      const endpoint = vpcStack.getResource(gatewayEndpointResource.logicalResourceId) as cdk.aws_ec2.CfnVPCEndpoint;
      const routeTableIds = endpoint.routeTableIds;
      if (!routeTableIds) {
        endpoint.routeTableIds = endpointItem.service === 's3' ? s3EndpointRouteTables : dynamodbEndpointRouteTables;
      } else {
        (endpointItem.service === 's3' ? s3EndpointRouteTables : dynamodbEndpointRouteTables).forEach(routeTableId => {
          if (!routeTableIds.includes(routeTableId)) {
            routeTableIds.push(routeTableId);
          }
        });
      }
      endpoint.routeTableIds = routeTableIds;
      this.scope.addSsmParameter({
        logicalId: pascalCase(`SsmParam${pascalCase(vpcItem.name) + pascalCase(endpointItem.service)}EndpointId`),
        parameterName: this.scope.getSsmPath(SsmResourceType.VPC_ENDPOINT, [vpcItem.name, endpointItem.service]),
        stringValue: endpoint.ref,
        scope: nestedStackResources.getStackKey(),
      });
      this.scope.addAseaResource(AseaResourceType.VPC_ENDPOINT, `${vpcItem.name}/${endpointItem.service}`);
    }
  }

  private deleteSecurityGroups(vpcItem: VpcConfig | VpcTemplatesConfig, nestedStackResources: ImportStackResources) {
    const configSecurityGroups: string[] = [];
    for (const securityGroupItem of vpcItem.securityGroups ?? []) {
      configSecurityGroups.push(securityGroupItem.name);
    }

    const existingSecurityGroups = nestedStackResources.getResourcesByType(RESOURCE_TYPE.SECURITY_GROUP);
    const existingSecurityGroupIngressRules = nestedStackResources.getResourcesByType(
      RESOURCE_TYPE.SECURITY_GROUP_INGRESS,
    );
    const existingSecurityGroupEgressRules = nestedStackResources.getResourcesByType(
      RESOURCE_TYPE.SECURITY_GROUP_EGRESS,
    );

    for (const existingSecurityGroup of existingSecurityGroups) {
      const securityGroupConfig = configSecurityGroups.find(
        item => item === existingSecurityGroup.resourceMetadata['Properties'].GroupName,
      );
      if (securityGroupConfig) continue;
      this.scope.addLogs(LogLevel.WARN, `Deleting Security Group: ${existingSecurityGroup.logicalResourceId}`);
      this.scope.addDeleteFlagForNestedResource(
        nestedStackResources.getStackKey(),
        existingSecurityGroup.logicalResourceId,
      );

      const ssmResource = nestedStackResources.getSSMParameterByName(
        this.scope.getSsmPath(SsmResourceType.SECURITY_GROUP, [
          vpcItem.name,
          existingSecurityGroup.resourceMetadata['Properties'].GroupName,
        ]),
      );
      if (ssmResource) {
        this.scope.addLogs(LogLevel.WARN, `Deleting SSM Parameter: ${ssmResource.logicalResourceId}`);
        this.scope.addDeleteFlagForNestedResource(nestedStackResources.getStackKey(), ssmResource.logicalResourceId);
      }

      for (const ingressRule of existingSecurityGroupIngressRules) {
        try {
          if (ingressRule.resourceMetadata['Properties'].GroupId['Ref'] === existingSecurityGroup.logicalResourceId) {
            this.scope.addLogs(LogLevel.WARN, `Deleting Ingress Rule: ${ingressRule.logicalResourceId}`);
            this.scope.addDeleteFlagForNestedResource(
              nestedStackResources.getStackKey(),
              ingressRule.logicalResourceId,
            );
          }
        } catch (error) {
          // continue the ref may not exits
        }

        try {
          if (
            ingressRule.resourceMetadata['Properties'].SourceSecurityGroupId['Ref'] ===
            existingSecurityGroup.logicalResourceId
          ) {
            this.scope.addLogs(LogLevel.WARN, `Deleting Ingress Rule: ${ingressRule.logicalResourceId}`);
            this.scope.addDeleteFlagForNestedResource(
              nestedStackResources.getStackKey(),
              ingressRule.logicalResourceId,
            );
          }
        } catch (error) {
          // the ref may not exist
        }
      }

      for (const egressRule of existingSecurityGroupEgressRules) {
        try {
          if (egressRule.resourceMetadata['Properties'].GroupId['Ref'] === existingSecurityGroup.logicalResourceId) {
            this.scope.addLogs(LogLevel.WARN, `Deleting Egress Rule: ${egressRule.logicalResourceId}`);
            this.scope.addDeleteFlagForNestedResource(nestedStackResources.getStackKey(), egressRule.logicalResourceId);
          }
        } catch (error) {
          // continue the ref may not exist
        }
        try {
          if (
            egressRule.resourceMetadata['Properties'].DestinationSecurityGroupId['Ref'] ===
            existingSecurityGroup.logicalResourceId
          ) {
            this.scope.addLogs(LogLevel.WARN, `Deleting Egress Rule: ${egressRule.logicalResourceId}`);
            this.scope.addDeleteFlagForNestedResource(nestedStackResources.getStackKey(), egressRule.logicalResourceId);
          }
        } catch (error) {
          // continue the ref may not exist
        }
      }
    }
  }
}

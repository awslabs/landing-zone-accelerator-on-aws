import { AseaResourceType, AseaResourceMapping } from '@aws-accelerator/config';
import { MetadataKeys, ILZAMetadata } from '../../utils/lib/common-types';
import path from 'path';
import fs from 'fs';

export type LookupValueTypes = string | number | boolean | undefined;

export type LookupValues = {
  [key: string]: LookupValueTypes;
};

export type LookupProperties = {
  resourceType: LZAResourceLookupType;
  lookupValues: LookupValues;
};

export enum LZAResourceLookupType {
  VPC = 'AWS::EC2::VPC',
  FLOW_LOG = 'AWS::EC2::FlowLog',
  INTERNET_GATEWAY = 'AWS::EC2::InternetGateway',
  VIRTUAL_PRIVATE_GATEWAY = 'AWS::EC2::VPNGateway',
  VPC_CIDR_BLOCK = 'AWS::EC2::VPCCidrBlock',
  EGRESS_ONLY_INTERNET_GATEWAY = 'AWS::EC2::EgressOnlyInternetGateway',
  VPC_DHCP_OPTIONS_ASSOCIATION = 'AWS::EC2::VPCDHCPOptionsAssociation',
  DELETE_VPC_DEFAULT_SECURITY_GROUP_RULES = 'Custom::DeleteDefaultSecurityGroupRules',
  VPN_CONNECTION = 'AWS::EC2::VPNConnection',
  CUSTOM_VPN_CONNECTION = 'AWS::CloudFormation::CustomResource',
  ROUTE_TABLE = 'AWS::EC2::RouteTable',
  GATEWAY_ROUTE_TABLE_ASSOCIATION = 'AWS::EC2::GatewayRouteTableAssociation',
  LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION = 'AWS::EC2::LocalGatewayRouteTableVPCAssociation',
  ROUTE = 'AWS::EC2::Route',
  PREFIX_LIST_ROUTE = 'Custom::PrefixListRoute',
  SUBNET = 'AWS::EC2::Subnet',
  IPAM_SUBNET = 'Custom::IpamSubnet',
  ROUTE_TABLE_ASSOCIATION = 'AWS::EC2::SubnetRouteTableAssociation',
  NAT_GATEWAY = 'AWS::EC2::NatGateway',
  TRANSIT_GATEWAY_VPC_ATTACHMENT = 'AWS::EC2::TransitGatewayVpcAttachment',
  ROLE = 'AWS::IAM::Role',
  SUBNET_SHARE = 'AWS::RAM::ResourceShare',
  SECURITY_GROUP = 'AWS::EC2::SecurityGroup',
  SECURITY_GROUP_INGRESS = 'AWS::EC2::SecurityGroupIngress',
  SECURITY_GROUP_EGRESS = 'AWS::EC2::SecurityGroupEgress',
  NETWORK_ACL = 'AWS::EC2::NetworkAcl',
  NETWORK_ACL_ENTRY = 'AWS::EC2::NetworkAclEntry',
  SUBNET_NETWORK_ACL_ASSOCIATION = 'AWS::EC2::SubnetNetworkAclAssociation',
  LOAD_BALANCER = 'AWS::ElasticLoadBalancingV2::LoadBalancer',
}

const RESOURCE_REQUIRED_KEYS: { [key in LZAResourceLookupType]?: string[] } = {
  [LZAResourceLookupType.VPC]: ['vpcName'],
  [LZAResourceLookupType.FLOW_LOG]: ['vpcName', 'flowLogDestinationType'],
  [LZAResourceLookupType.INTERNET_GATEWAY]: ['vpcName'],
  [LZAResourceLookupType.VIRTUAL_PRIVATE_GATEWAY]: ['vpcName'],
  [LZAResourceLookupType.EGRESS_ONLY_INTERNET_GATEWAY]: ['vpcName'],
  [LZAResourceLookupType.VPC_DHCP_OPTIONS_ASSOCIATION]: ['vpcName', 'dhcpOptionsName'],
  [LZAResourceLookupType.LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION]: ['routeTableName', 'vpcName', 'vpcAccount'],
  [LZAResourceLookupType.ROUTE_TABLE]: ['vpcName', 'routeTableName'],
  [LZAResourceLookupType.GATEWAY_ROUTE_TABLE_ASSOCIATION]: ['vpcName', 'routeTableName', 'associationType'],
  [LZAResourceLookupType.ROUTE]: ['vpcName', 'routeTableName', 'routeTableEntryName', 'type'],
  [LZAResourceLookupType.PREFIX_LIST_ROUTE]: ['vpcName', 'routeTableName', 'routeTableEntryName', 'type'],
  [LZAResourceLookupType.SUBNET]: ['vpcName', 'subnetName'],
  [LZAResourceLookupType.IPAM_SUBNET]: ['vpcName', 'subnetName'],
  [LZAResourceLookupType.ROUTE_TABLE_ASSOCIATION]: ['vpcName', 'subnetName', 'routeTableName'],
  [LZAResourceLookupType.NAT_GATEWAY]: ['vpcName', 'natGatewayName'],
  [LZAResourceLookupType.TRANSIT_GATEWAY_VPC_ATTACHMENT]: [
    'vpcName',
    'transitGatewayName',
    'transitGatewayAttachmentName',
  ],
  [LZAResourceLookupType.ROLE]: ['roleName'],
  [LZAResourceLookupType.SUBNET_SHARE]: ['vpcName', 'subnetName'],
  [LZAResourceLookupType.SECURITY_GROUP]: ['vpcName', 'securityGroupName'],
  [LZAResourceLookupType.NETWORK_ACL]: ['vpcName', 'naclName'],
  [LZAResourceLookupType.NETWORK_ACL_ENTRY]: ['vpcName', 'naclName', 'ruleNumber', 'type'],
  [LZAResourceLookupType.SUBNET_NETWORK_ACL_ASSOCIATION]: ['vpcName', 'naclName', 'subnetName'],
  [LZAResourceLookupType.VPN_CONNECTION]: ['vpnName', 'vpcName', 'cgwName'],
  [LZAResourceLookupType.DELETE_VPC_DEFAULT_SECURITY_GROUP_RULES]: ['vpcName'],
};

export class LZAResourceLookup {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cfnTemplate: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cfnResources: any;
  accountId: string;
  region: string;
  stackName: string;
  aseaResourceList: AseaResourceMapping[];
  externalLandingZoneResources: boolean | undefined;
  enableV2Stacks: boolean | undefined;
  // Setting up types for the CloudFormation template structure is not feasible at this time
  constructor(props: {
    accountId: string;
    region: string;
    stackName: string;
    aseaResourceList: AseaResourceMapping[];
    externalLandingZoneResources: boolean | undefined;
    enableV2Stacks: boolean | undefined;
  }) {
    this.accountId = props.accountId;
    this.region = props.region;
    this.stackName = props.stackName;
    this.enableV2Stacks = props.enableV2Stacks;

    const templatePath = path.join('cfn-templates', this.accountId, this.region, `${this.stackName}.json`);
    const cfnTemplateString = this.loadCfnTemplate(this.enableV2Stacks, templatePath);

    this.cfnTemplate = JSON.parse(cfnTemplateString);
    this.cfnResources = this.cfnTemplate['Resources'];
    this.aseaResourceList = props.aseaResourceList;
    this.externalLandingZoneResources = props.externalLandingZoneResources;
  }

  public resourceExists(resourceProperties: LookupProperties): boolean {
    // Always expect resource to exist if V2 stacks aren't enabled
    if (!this.enableV2Stacks) {
      return true;
    }
    if (this.resourceManagedByAsea(resourceProperties)) {
      return true;
    }
    // If there is no metadata then it is managed by a v1 stacks.
    if (!this.cfnStackMetadataExist(this.cfnTemplate)) {
      return true;
    }

    if (this.resourceManagedByV1Stack(resourceProperties)) {
      return true;
    }

    return false;
  }

  public resourceManagedByV1Stack(resourceProperties: LookupProperties): boolean {
    switch (resourceProperties.resourceType) {
      case LZAResourceLookupType.VPC:
      case LZAResourceLookupType.FLOW_LOG:
      case LZAResourceLookupType.INTERNET_GATEWAY:
      case LZAResourceLookupType.VIRTUAL_PRIVATE_GATEWAY:
      case LZAResourceLookupType.EGRESS_ONLY_INTERNET_GATEWAY:
      case LZAResourceLookupType.VPC_DHCP_OPTIONS_ASSOCIATION:
      case LZAResourceLookupType.LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION:
      case LZAResourceLookupType.DELETE_VPC_DEFAULT_SECURITY_GROUP_RULES:
      case LZAResourceLookupType.ROUTE_TABLE:
      case LZAResourceLookupType.GATEWAY_ROUTE_TABLE_ASSOCIATION:
      case LZAResourceLookupType.ROUTE:
      case LZAResourceLookupType.PREFIX_LIST_ROUTE:
      case LZAResourceLookupType.SUBNET:
      case LZAResourceLookupType.IPAM_SUBNET:
      case LZAResourceLookupType.ROUTE_TABLE_ASSOCIATION:
      case LZAResourceLookupType.NAT_GATEWAY:
      case LZAResourceLookupType.TRANSIT_GATEWAY_VPC_ATTACHMENT:
      case LZAResourceLookupType.ROLE:
      case LZAResourceLookupType.SUBNET_SHARE:
      case LZAResourceLookupType.SECURITY_GROUP:
      case LZAResourceLookupType.NETWORK_ACL:
      case LZAResourceLookupType.SUBNET_NETWORK_ACL_ASSOCIATION:
        const requiredKeys = RESOURCE_REQUIRED_KEYS[resourceProperties.resourceType];
        return this.resourceWithMetadataExists(resourceProperties, requiredKeys);
      case LZAResourceLookupType.NETWORK_ACL_ENTRY:
        return this.naclEntryExists(resourceProperties);
      case LZAResourceLookupType.VPC_CIDR_BLOCK:
        return this.vpcCidrBlockExists(resourceProperties);
      case LZAResourceLookupType.LOAD_BALANCER:
        return this.loadBalancerExists(resourceProperties);

      case LZAResourceLookupType.VPN_CONNECTION:
        return this.vpnConnectionExists(resourceProperties);

      case LZAResourceLookupType.SECURITY_GROUP_INGRESS:
      case LZAResourceLookupType.SECURITY_GROUP_EGRESS:
        resourceProperties.lookupValues = Object.fromEntries(
          Object.entries(resourceProperties.lookupValues).filter(([, v]) => v !== undefined),
        );
        return this.securityGroupRulesExists(resourceProperties);

      default:
        return false;
    }
  }

  private resourceWithMetadataExists(
    resourceProperties: LookupProperties,
    requiredKeys: string[] | undefined,
  ): boolean {
    if (!requiredKeys) {
      throw new Error(`Resource type ${resourceProperties.resourceType} is not supported`);
    }
    this.validateResourcePropertyKeys({
      resourceProperties,
      resourceKeys: requiredKeys,
    });

    const resourceKeys = this.getCfnResourceKeysByType(resourceProperties.resourceType);
    return this.cfnResourceExists({
      lookupValues: resourceProperties.lookupValues,
      resourceType: resourceProperties.resourceType,
      resourceTypesKeys: resourceKeys,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public templateExists(cfnTemplate: any) {
    if (JSON.stringify(cfnTemplate) === '{}') {
      return false;
    }
    if (!('Resources' in cfnTemplate)) {
      return false;
    }
    return true;
  }

  private loadCfnTemplate(enableV2Stacks: boolean | undefined, templatePath: string) {
    if (!enableV2Stacks) {
      return '{}';
    }
    try {
      return fs.readFileSync(templatePath).toString();
    } catch (err) {
      return '{}';
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public metadataValidation(props: { cfnTemplate: any; account: string; region: string; stackName: string }) {
    // Don't validate if V2Stacks are not enabled.
    if (!this.enableV2Stacks) {
      return;
    }
    if (!('Metadata' in props.cfnTemplate)) {
      throw new Error(
        `LZA Lookup Metadata does not exist for template ${props.stackName} in account ${this.accountId} and region ${this.region}`,
      );
    }
    if (!(MetadataKeys.LZA_LOOKUP in props.cfnTemplate['Metadata'])) {
      throw new Error(
        `LZA Lookup Metadata does not exist for template ${props.stackName} in account ${this.accountId} and region ${this.region}`,
      );
    }
  }

  /**
   * Helper function to verify if resource managed by ASEA or not by looking in resource mapping
   * Can be replaced with LZA Configuration check. Not using configuration check to avoid errors/mistakes in configuration by user
   *
   * @param resourceType
   * @param resourceIdentifier
   * @returns
   */
  public isManagedByAsea(props: { resourceType: AseaResourceType; resourceIdentifier: LookupValueTypes }): boolean {
    if (!this.externalLandingZoneResources) {
      return false;
    }
    if (props.resourceType === AseaResourceType.NOT_MANAGED) {
      return false;
    }

    return !!this.aseaResourceList.find(
      r =>
        r.accountId === this.accountId &&
        r.region === this.region &&
        r.resourceType === props.resourceType &&
        r.resourceIdentifier === props.resourceIdentifier &&
        !r.isDeleted,
    );
  }

  /**
   * Helper function to verify if resource managed by ASEA or not by looking in resource mapping
   * Different than isManagedByAsea() because it does not filter for region or account id.
   *
   * @param resourceType
   * @param resourceIdentifier
   * @returns
   */
  public isManagedByAseaGlobal(props: { resourceType: AseaResourceType; resourceIdentifier: string }): boolean {
    if (!this.externalLandingZoneResources) {
      return false;
    }

    if (props.resourceType === AseaResourceType.NOT_MANAGED) {
      return false;
    }

    return !!this.aseaResourceList.find(
      r => r.resourceType === props.resourceType && r.resourceIdentifier === props.resourceIdentifier && !r.isDeleted,
    );
  }

  private getCfnResourceKeysByType(resourceType: LZAResourceLookupType): string[] {
    if (!this.cfnResources) {
      return [];
    }
    return Object.keys(this.cfnResources).filter(key => this.cfnResources[key]?.['Type'] === resourceType);
  }

  private findCfnResourceByPartialMatch(props: {
    lookupValues: LookupValues;
    cfnResourceMetadata: ILZAMetadata | undefined;
  }): boolean {
    const metadataMatch = Object.keys(props.lookupValues).filter(key => {
      if (!props.cfnResourceMetadata) {
        return false;
      }
      if (key in props.cfnResourceMetadata && props.cfnResourceMetadata[key] === props.lookupValues[key]) {
        return true;
      }
      return false;
    });

    return metadataMatch.length === Object.keys(props.lookupValues).length;
  }

  private cfnResourceExists(props: {
    lookupValues: LookupValues;
    resourceType: LZAResourceLookupType;
    resourceTypesKeys: string[];
  }) {
    const resourceExists = props.resourceTypesKeys.find(key =>
      this.findCfnResourceByPartialMatch({
        lookupValues: props.lookupValues,
        cfnResourceMetadata: this.cfnResources[key]?.['Metadata']?.[MetadataKeys.LZA_LOOKUP],
      }),
    );

    return !!resourceExists;
  }

  private resourceManagedByAsea(resourceProperties: LookupProperties) {
    const aseaResourceType = this.getAseaResourceType(resourceProperties.resourceType);
    let resourceIdentifier;
    switch (aseaResourceType) {
      case AseaResourceType.NOT_MANAGED:
        return false;
      case AseaResourceType.EC2_VPC:
        resourceIdentifier = resourceProperties.lookupValues['vpcName'];
        break;
      case AseaResourceType.EC2_IGW:
        resourceIdentifier = resourceProperties.lookupValues['vpcName'];
        break;
      case AseaResourceType.APPLICATION_LOAD_BALANCER:
        if (!('albName' in resourceProperties.lookupValues)) {
          return false;
        }
        resourceIdentifier = resourceProperties.lookupValues['albName'];
        break;
      case AseaResourceType.EC2_NACL_SUBNET_ASSOCIATION:
        resourceIdentifier = `${resourceProperties.lookupValues['vpcName']}/${resourceProperties.lookupValues['subnetName']}`;
        break;
      case AseaResourceType.NAT_GATEWAY:
        resourceIdentifier = `${resourceProperties.lookupValues['vpcName']}/${resourceProperties.lookupValues['natGatewayName']}`;
        break;
      case AseaResourceType.ROUTE_TABLE:
        resourceIdentifier = `${resourceProperties.lookupValues['vpcName']}/${resourceProperties.lookupValues['routeTableName']}`;
        break;
      case AseaResourceType.EC2_SUBNET:
        resourceIdentifier = `${resourceProperties.lookupValues['vpcName']}/${resourceProperties.lookupValues['subnetName']}`;
        break;
      case AseaResourceType.TRANSIT_GATEWAY_ATTACHMENT:
        resourceIdentifier = `${resourceProperties.lookupValues['vpcName']}/${resourceProperties.lookupValues['transitGatewayAttachmentName']}`;
        break;
      case AseaResourceType.EC2_SECURITY_GROUP:
        resourceIdentifier = `${resourceProperties.lookupValues['vpcName']}/${resourceProperties.lookupValues['securityGroupName']}`;
        break;
      case AseaResourceType.EC2_VPC_CIDR:
        resourceIdentifier = `${resourceProperties.lookupValues['vpcName']}-${resourceProperties.lookupValues['cidrBlock']}`;
        break;
      default:
        return false;
    }

    return this.isManagedByAsea({ resourceType: aseaResourceType, resourceIdentifier });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cfnStackMetadataExist(stack: any): boolean {
    if ('Metadata' in stack && 'lzaLookup' in stack['Metadata']) {
      return true;
    }

    return false;
  }
  private vpcCidrBlockExists(resourceProperties: LookupProperties): boolean {
    if ('cidrBlock' in resourceProperties.lookupValues && resourceProperties.lookupValues['cidrBlock']) {
      return this.ipv4CidrBlockExists(resourceProperties);
    }
    if ('ipamPoolName' in resourceProperties.lookupValues && resourceProperties.lookupValues['ipamPoolName']) {
      return this.ipv4IpamCidrBlockExists(resourceProperties);
    }
    if (
      'amazonProvidedIpv6CidrBlock' in resourceProperties.lookupValues &&
      resourceProperties.lookupValues['amazonProvidedIpv6CidrBlock']
    ) {
      return this.ipv6AmazonCidrBlockExists(resourceProperties);
    }
    if ('ipv6pool' in resourceProperties.lookupValues && resourceProperties.lookupValues['ipv6pool']) {
      return this.ipv6CidrPoolExists(resourceProperties);
    }
    return false;
  }

  private naclEntryExists(resourceProperties: LookupProperties): boolean {
    this.validateResourcePropertyKeys({
      resourceProperties,
      resourceKeys: RESOURCE_REQUIRED_KEYS[resourceProperties.resourceType],
    });
    const resourceKeys = this.getCfnResourceKeysByType(resourceProperties.resourceType);
    return this.cfnResourceExists({
      lookupValues: resourceProperties.lookupValues,
      resourceType: resourceProperties.resourceType,
      resourceTypesKeys: resourceKeys,
    });
  }

  private ipv4IpamCidrBlockExists(resourceProperties: LookupProperties): boolean {
    return this.resourceWithMetadataExists(resourceProperties, [
      'vpcName',
      'ipamPoolName',
      'netmaskLength',
      'ipamCidrIndex',
    ]);
  }
  private ipv4CidrBlockExists(resourceProperties: LookupProperties): boolean {
    return this.resourceWithMetadataExists(resourceProperties, ['vpcName', 'cidrBlock']);
  }

  private ipv6AmazonCidrBlockExists(resourceProperties: LookupProperties): boolean {
    return this.resourceWithMetadataExists(resourceProperties, [
      'vpcName',
      'amazonProvidedIpv6CidrBlock',
      'amazonProvidedCidrIndex',
    ]);
  }

  private ipv6CidrPoolExists(resourceProperties: LookupProperties): boolean {
    return this.resourceWithMetadataExists(resourceProperties, [
      'vpcName',
      'ipv6CidrBlock',
      'ipv6pool',
      'ipamCidrIndex',
    ]);
  }

  private vpnConnectionExists(resourceProperties: LookupProperties): boolean {
    const cfnResourceExists = this.resourceWithMetadataExists(
      resourceProperties,
      RESOURCE_REQUIRED_KEYS[LZAResourceLookupType.VPN_CONNECTION],
    );
    const customResourceExists = this.resourceWithMetadataExists(
      {
        resourceType: LZAResourceLookupType.CUSTOM_VPN_CONNECTION,
        lookupValues: resourceProperties.lookupValues,
      },
      RESOURCE_REQUIRED_KEYS[LZAResourceLookupType.VPN_CONNECTION],
    );

    return cfnResourceExists || customResourceExists;
  }

  private securityGroupRulesExists(resourceProperties: LookupProperties): boolean {
    const requiredKeys = [
      'targetSecurityGroupName',
      'sourceSecurityGroupName',
      'vpcName',
      'vpcAccount',
      'vpcRegion',
      'ipProtocol',
    ];
    if (resourceProperties.lookupValues['ipProtocol'] !== '-1') {
      requiredKeys.push('fromPort', 'toPort');
    }

    return this.resourceWithMetadataExists(resourceProperties, requiredKeys);
  }

  private loadBalancerExists(resourceProperties: LookupProperties): boolean {
    if ('albName' in resourceProperties.lookupValues) {
      return this.applicationLoadBalancerExists(resourceProperties);
    }
    if ('nlbName' in resourceProperties.lookupValues) {
      return this.networkLoadBalancerExists(resourceProperties);
    }
    if ('gwlbName' in resourceProperties.lookupValues) {
      return this.gatewayLoadBalancerExists(resourceProperties);
    }
    throw new Error(
      'No valid load balancer name provided, one of (albName, nlbName, or gwlbName) must present in lookup key',
    );
  }

  private applicationLoadBalancerExists(resourceProperties: LookupProperties): boolean {
    return this.resourceWithMetadataExists(resourceProperties, ['vpcName', 'albName']);
  }

  private networkLoadBalancerExists(resourceProperties: LookupProperties): boolean {
    return this.resourceWithMetadataExists(resourceProperties, ['vpcName', 'nlbName']);
  }

  private gatewayLoadBalancerExists(resourceProperties: LookupProperties): boolean {
    return this.resourceWithMetadataExists(resourceProperties, ['vpcName', 'gwlbName']);
  }

  private validateResourcePropertyKeys(props: {
    resourceProperties: LookupProperties;
    resourceKeys: string[] | undefined;
  }) {
    if (!props.resourceKeys) {
      throw new Error(`Resource keys are not defined for resource type ${props.resourceProperties.resourceType}`);
    }
    const missingKeys = props.resourceKeys.filter(key => !(key in props.resourceProperties.lookupValues));
    if (missingKeys.length > 0) {
      throw new Error(
        `Missing required keys: ${missingKeys.join(', ')} for resource ${
          props.resourceProperties.resourceType
        } in account ${this.accountId} and region ${this.region} with lookup values \n ${JSON.stringify(
          props.resourceProperties.lookupValues,
          null,
          2,
        )}`,
      );
    }
  }

  private getAseaResourceType(lzaResourceLookupType: LZAResourceLookupType) {
    switch (lzaResourceLookupType) {
      case LZAResourceLookupType.VPC:
        return AseaResourceType.EC2_VPC;
      case LZAResourceLookupType.VPC_CIDR_BLOCK:
        return AseaResourceType.EC2_VPC_CIDR;
      case LZAResourceLookupType.INTERNET_GATEWAY:
        return AseaResourceType.EC2_IGW;
      case LZAResourceLookupType.LOAD_BALANCER:
        return AseaResourceType.APPLICATION_LOAD_BALANCER;
      case LZAResourceLookupType.SUBNET_NETWORK_ACL_ASSOCIATION:
        return AseaResourceType.EC2_NACL_SUBNET_ASSOCIATION;
      case LZAResourceLookupType.NAT_GATEWAY:
        return AseaResourceType.NAT_GATEWAY;
      case LZAResourceLookupType.ROUTE_TABLE:
        return AseaResourceType.ROUTE_TABLE;
      case LZAResourceLookupType.SUBNET:
        return AseaResourceType.EC2_SUBNET;
      case LZAResourceLookupType.TRANSIT_GATEWAY_VPC_ATTACHMENT:
        return AseaResourceType.TRANSIT_GATEWAY_ATTACHMENT;
      case LZAResourceLookupType.SECURITY_GROUP:
        return AseaResourceType.EC2_SECURITY_GROUP;
      default:
        return AseaResourceType.NOT_MANAGED;
    }
  }
}

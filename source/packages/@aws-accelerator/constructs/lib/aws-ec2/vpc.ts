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
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Construct } from 'constructs';

import { IpamAllocationConfig, OutpostsConfig, VirtualPrivateGatewayConfig } from '@aws-accelerator/config';

import { IpamSubnet } from './ipam-subnet';
import { IPrefixList } from './prefix-list';
import { IRouteTable } from './route-table';
import { VpnConnection } from './vpn-connection';
import { CUSTOM_RESOURCE_PROVIDER_RUNTIME } from '@aws-accelerator/utils/lib/lambda';

export interface ISubnet extends cdk.IResource {
  /**
   * The identifier of the subnet
   *
   * @attribute
   */
  readonly subnetId: string;

  /**
   * The identifier of the subnet
   *
   * @attribute
   */
  readonly subnetArn: string;

  /**
   * The name of the subnet
   *
   * @attribute
   */
  readonly subnetName: string;

  /**
   * The CIDR Block of the subnet
   */
  readonly ipv4CidrBlock?: string;

  /**
   * The Availability Zone the subnet is located in
   *
   * @attribute
   */
  readonly availabilityZone?: string;

  /**
   * The Physical Availability Zone ID the subnet is located in
   *
   * @attribute
   */
  readonly availabilityZoneId?: string;

  /**
   * The IPV6 CIDR Block of the subnet
   */
  readonly ipv6CidrBlock?: string;
}

interface SubnetPrivateDnsOptions {
  readonly enableDnsAAAARecord?: boolean;
  readonly enableDnsARecord?: boolean;
  readonly hostnameType?: 'ip-name' | 'resource-name';
}

export interface SubnetProps {
  readonly name: string;
  readonly vpc: IVpc;
  readonly assignIpv6OnCreation?: boolean;
  readonly availabilityZone?: string;
  readonly availabilityZoneId?: string;
  readonly basePool?: string[];
  readonly enableDns64?: boolean;
  readonly ipamAllocation?: IpamAllocationConfig;
  readonly ipv4CidrBlock?: string;
  readonly ipv6CidrBlock?: string;
  readonly kmsKey?: cdk.aws_kms.IKey;
  readonly logRetentionInDays?: number;
  readonly mapPublicIpOnLaunch?: boolean;
  readonly outpost?: OutpostsConfig;
  readonly privateDnsOptions?: SubnetPrivateDnsOptions;
  readonly routeTable?: IRouteTable;
  readonly tags?: cdk.CfnTag[];
}

export interface ImportedSubnetProps {
  readonly subnetId: string;
  readonly name: string;
  readonly routeTable?: IRouteTable;
  readonly ipv4CidrBlock: string;
}

abstract class SubnetBase extends cdk.Resource implements ISubnet {
  public abstract readonly subnetName: string;
  public abstract readonly subnetId: string;
  public abstract readonly subnetArn: string;
  public readonly availabilityZone?: string;
  public readonly availabilityZoneId?: string;
  public abstract readonly routeTable?: IRouteTable;
}

export class ImportedSubnet extends SubnetBase {
  public readonly subnetName: string;
  public readonly routeTable?: IRouteTable;
  public readonly subnetId: string;
  public readonly subnetArn: string;
  public readonly ipv4CidrBlock?: string;

  constructor(scope: Construct, id: string, props: ImportedSubnetProps) {
    super(scope, id);

    this.subnetName = props.name;
    this.routeTable = props.routeTable;
    this.subnetId = props.subnetId;
    this.subnetArn = cdk.Stack.of(this).formatArn({
      service: 'ec2',
      resource: 'subnet',
      arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: props.subnetId,
    });

    if (props.ipv4CidrBlock) {
      this.ipv4CidrBlock = props.ipv4CidrBlock;
    }

    if (props.routeTable) {
      // Route Table is not imported, Associating Subnet to new RouteTable
      new cdk.aws_ec2.CfnSubnetRouteTableAssociation(this, 'RouteTableAssociation', {
        subnetId: this.subnetId,
        routeTableId: props.routeTable.routeTableId,
      });
    }
  }
}
export class Subnet extends SubnetBase {
  public readonly subnetArn: string;
  public readonly subnetId: string;
  public readonly subnetName: string;
  public readonly availabilityZone?: string;
  public readonly availabilityZoneId?: string;
  public readonly ipv4CidrBlock?: string;
  public readonly ipv6CidrBlock?: string;
  public readonly mapPublicIpOnLaunch?: boolean;
  public readonly routeTable?: IRouteTable;

  public readonly outpostArn?: string;

  constructor(scope: Construct, id: string, props: SubnetProps) {
    super(scope, id);

    this.subnetName = props.name;
    this.availabilityZone = props.availabilityZone;
    this.availabilityZoneId = props.availabilityZoneId;
    this.mapPublicIpOnLaunch = props.mapPublicIpOnLaunch;
    this.routeTable = props.routeTable;
    this.outpostArn = props.outpost?.arn;

    // Determine if IPAM subnet or native
    let resource: cdk.aws_ec2.CfnSubnet | IpamSubnet;

    if (props.ipv4CidrBlock || props.ipv6CidrBlock) {
      this.ipv4CidrBlock = props.ipv4CidrBlock;
      this.ipv6CidrBlock = props.ipv6CidrBlock;

      const ipv6Native = this.ipv6CidrBlock !== undefined && !this.ipv4CidrBlock ? true : undefined;
      const privateDnsNameOptionsOnLaunch = props.privateDnsOptions
        ? {
            EnableResourceNameDnsAAAARecord: props.privateDnsOptions?.enableDnsAAAARecord,
            EnableResourceNameDnsARecord: props.privateDnsOptions?.enableDnsARecord,
            HostnameType: props.privateDnsOptions?.hostnameType,
          }
        : undefined;

      resource = new cdk.aws_ec2.CfnSubnet(this, 'Resource', {
        vpcId: props.vpc.vpcId,
        assignIpv6AddressOnCreation: props.assignIpv6OnCreation,
        availabilityZone: props.availabilityZone,
        availabilityZoneId: props.availabilityZoneId,
        cidrBlock: props.ipv4CidrBlock,
        enableDns64: props.enableDns64,
        ipv6CidrBlock: props.ipv6CidrBlock,
        ipv6Native,
        mapPublicIpOnLaunch: props.mapPublicIpOnLaunch,
        outpostArn: props.outpost?.arn,
        privateDnsNameOptionsOnLaunch,
        tags: props.tags,
      });

      cdk.Tags.of(this).add('Name', props.name);
      this.subnetId = resource.ref;
      this.subnetArn = cdk.Stack.of(this).formatArn({
        service: 'ec2',
        resource: 'subnet',
        arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
        resourceName: resource.ref,
      });
    } else {
      if (!props.basePool) {
        throw new Error(
          `Error creating subnet ${props.name}: must specify basePool property when using ipamAllocation`,
        );
      }
      if (!props.ipamAllocation) {
        throw new Error(
          `Error creating subnet ${props.name}: ipamAllocation property must be defined if not specifying ipv4CidrBlock`,
        );
      }
      if (!props.logRetentionInDays) {
        throw new Error(
          `Error creating subnet ${props.name}: logRetentionInDays property must be defined if not specifying ipv4CidrBlock`,
        );
      }

      resource = new IpamSubnet(this, 'Resource', {
        name: props.name,
        availabilityZone: props.availabilityZone,
        availabilityZoneId: props.availabilityZoneId,
        basePool: props.basePool,
        ipamAllocation: props.ipamAllocation,
        vpcId: props.vpc.vpcId,
        mapPublicIpOnLaunch: props.mapPublicIpOnLaunch,
        kmsKey: props.kmsKey,
        logRetentionInDays: props.logRetentionInDays,
        tags: props.tags,
        outpostArn: props.outpost?.arn,
      });

      this.ipv4CidrBlock = resource.ipv4CidrBlock;
      this.subnetId = resource.subnetId;
      this.subnetArn = cdk.Stack.of(this).formatArn({
        service: 'ec2',
        resource: 'subnet',
        arnFormat: cdk.ArnFormat.SLASH_RESOURCE_NAME,
        resourceName: resource.subnetId,
      });
    }

    if (props.routeTable) {
      new cdk.aws_ec2.CfnSubnetRouteTableAssociation(this, 'RouteTableAssociation', {
        subnetId: this.subnetId,
        routeTableId: props.routeTable.routeTableId,
      });
    }
  }

  static fromSubnetAttributes(scope: Construct, id: string, props: ImportedSubnetProps) {
    return new ImportedSubnet(scope, id, props);
  }
}

export interface INatGateway extends cdk.IResource {
  /**
   * The identifier of the NAT Gateway
   *
   * @attribute
   */
  readonly natGatewayId: string;

  /**
   * The name of the NAT Gateway
   *
   * @attribute
   */
  readonly natGatewayName: string;
}

export interface NatGatewayProps {
  readonly name: string;
  readonly subnet: ISubnet;
  readonly allocationId?: string;
  readonly private?: boolean;
  readonly tags?: cdk.CfnTag[];
}

export class NatGateway extends cdk.Resource implements INatGateway {
  public readonly natGatewayId: string;
  public readonly natGatewayName: string;
  private natGatewayArgs?: cdk.aws_ec2.CfnNatGatewayProps;

  static fromAttributes(
    scope: Construct,
    id: string,
    attrs: { natGatewayId: string; natGatewayName: string },
  ): INatGateway {
    class Import extends cdk.Resource implements INatGateway {
      public readonly natGatewayId: string = attrs.natGatewayId;
      public readonly natGatewayName: string = attrs.natGatewayName;

      constructor(scope: Construct, id: string) {
        super(scope, id);
      }
    }
    return new Import(scope, id);
  }

  constructor(scope: Construct, id: string, props: NatGatewayProps) {
    super(scope, id);

    this.natGatewayName = props.name;

    this.natGatewayArgs = {
      subnetId: props.subnet.subnetId,
      allocationId: props.private ? undefined : this.getAllocationId(props),
      connectivityType: props.private ? 'private' : undefined,
      tags: props.tags,
    };

    const resource = new cdk.aws_ec2.CfnNatGateway(this, 'Resource', this.natGatewayArgs);
    cdk.Tags.of(this).add('Name', props.name);
    this.natGatewayId = resource.ref;
  }

  /**
   * Return allocation ID for a public NAT gateway
   * @param props
   * @returns
   */
  private getAllocationId(props: NatGatewayProps): string {
    return props.allocationId
      ? props.allocationId
      : new cdk.aws_ec2.CfnEIP(this, 'Eip', {
          domain: 'vpc',
        }).attrAllocationId;
  }
}
export interface ISecurityGroup extends cdk.IResource {
  /**
   * ID for the current security group
   * @attribute
   */
  readonly securityGroupId: string;
}

export interface SecurityGroupProps {
  /**
   * The name of the security group. For valid values, see the GroupName
   * parameter of the CreateSecurityGroup action in the Amazon EC2 API
   * Reference.
   *
   * It is not recommended to use an explicit group name.
   *
   * @default If you don't specify a GroupName, AWS CloudFormation generates a
   * unique physical ID and uses that ID for the group name.
   */
  readonly securityGroupName?: string;

  /**
   * A description of the security group.
   *
   * @default The default name will be the construct's CDK path.
   */
  readonly description?: string;

  /**
   * The outbound rules associated with the security group.
   */
  readonly securityGroupEgress?: SecurityGroupEgressRuleProps[];

  /**
   * The inbound rules associated with the security group.
   */
  readonly securityGroupIngress?: SecurityGroupIngressRuleProps[];

  /**
   * The tags that will be attached to the security group
   */
  readonly tags?: cdk.CfnTag[];

  /**
   * The VPC in which to create the security group.
   */
  readonly vpc?: IVpc;

  /**
   * The VPC in which to create the security group.
   */
  readonly vpcId?: string;
}

export interface SecurityGroupIngressRuleProps {
  readonly ipProtocol: string;
  readonly description?: string;
  readonly cidrIp?: string;
  readonly cidrIpv6?: string;
  readonly sourcePrefixList?: IPrefixList;
  readonly sourcePrefixListId?: string;
  readonly sourceSecurityGroup?: ISecurityGroup;
  readonly fromPort?: number;
  readonly toPort?: number;
}

export interface SecurityGroupEgressRuleProps {
  readonly ipProtocol: string;
  readonly description?: string;
  readonly cidrIp?: string;
  readonly cidrIpv6?: string;
  readonly destinationPrefixList?: IPrefixList;
  readonly destinationPrefixListId?: string;
  readonly destinationSecurityGroup?: ISecurityGroup;
  readonly fromPort?: number;
  readonly toPort?: number;
}

abstract class SecurityGroupBase extends cdk.Resource implements ISecurityGroup {
  public abstract readonly securityGroupId: string;

  public addIngressRule(id: string, props: SecurityGroupIngressRuleProps) {
    new cdk.aws_ec2.CfnSecurityGroupIngress(this, id, {
      groupId: this.securityGroupId,
      ipProtocol: props.ipProtocol,
      description: props.description,
      cidrIp: props.cidrIp,
      cidrIpv6: props.cidrIpv6,
      sourcePrefixListId: props.sourcePrefixList?.prefixListId,
      sourceSecurityGroupId: props.sourceSecurityGroup?.securityGroupId,
      fromPort: props.fromPort,
      toPort: props.toPort,
    });
  }

  public addEgressRule(id: string, props: SecurityGroupEgressRuleProps) {
    new cdk.aws_ec2.CfnSecurityGroupEgress(this, id, {
      groupId: this.securityGroupId,
      ipProtocol: props.ipProtocol,
      description: props.description,
      cidrIp: props.cidrIp,
      cidrIpv6: props.cidrIpv6,
      destinationPrefixListId: props.destinationPrefixList?.prefixListId,
      destinationSecurityGroupId: props.destinationSecurityGroup?.securityGroupId,
      fromPort: props.fromPort,
      toPort: props.toPort,
    });
  }
}

export class ImportedSecurityGroup extends SecurityGroupBase {
  public readonly securityGroupId: string;
  constructor(scope: Construct, id: string) {
    super(scope, id);
    this.securityGroupId = id;
  }
}

export class SecurityGroup extends SecurityGroupBase {
  public readonly securityGroupId: string;

  constructor(scope: Construct, id: string, props: SecurityGroupProps) {
    super(scope, id);

    if (!props.vpc?.vpcId && !props.vpcId) {
      throw new Error(`A property value for vpc or vpcId must be specified`);
    }

    const securityGroup = new cdk.aws_ec2.CfnSecurityGroup(this, 'Resource', {
      groupDescription: props.description ?? '',
      securityGroupEgress: props.securityGroupEgress,
      securityGroupIngress: props.securityGroupIngress,
      groupName: props.securityGroupName,
      vpcId: props.vpc?.vpcId ?? props.vpcId,
      tags: props.tags,
    });

    if (props.securityGroupName) {
      cdk.Tags.of(securityGroup).add('Name', props.securityGroupName);
    }

    this.securityGroupId = securityGroup.ref;
  }

  static fromSecurityGroupId(scope: Construct, id: string) {
    return new ImportedSecurityGroup(scope, id);
  }
}

/**
 * A NetworkAcl
 *
 *
 */
export interface INetworkAcl extends cdk.IResource {
  /**
   * ID for the current Network ACL
   * @attribute
   */
  readonly networkAclId: string;

  /**
   * ID for the current Network ACL
   * @attribute
   */
  readonly networkAclName: string;
}

/**
 * A NetworkAclBase that is not created in this template
 */
abstract class NetworkAclBase extends cdk.Resource implements INetworkAcl {
  public abstract readonly networkAclId: string;
  public abstract readonly networkAclName: string;
}

/**
 * Properties to create NetworkAcl
 */
export interface NetworkAclProps {
  /**
   * The name of the NetworkAcl.
   */
  readonly networkAclName: string;

  /**
   * The VPC in which to create the NetworkACL.
   */
  readonly vpc: IVpc;

  /**
   * The tags which will be attached to the NetworkACL.
   */
  readonly tags?: cdk.CfnTag[];
}

/**
 * Define a new custom network ACL
 *
 * By default, will deny all inbound and outbound traffic unless entries are
 * added explicitly allowing it.
 */
export class NetworkAcl extends NetworkAclBase {
  /**
   * The ID of the NetworkACL
   *
   * @attribute
   */
  public readonly networkAclId: string;

  /**
   * The Name of the NetworkACL
   *
   * @attribute
   */
  public readonly networkAclName: string;

  /**
   * The VPC ID for this NetworkACL
   *
   * @attribute
   */
  public readonly networkAclVpcId: string;

  constructor(scope: Construct, id: string, props: NetworkAclProps) {
    super(scope, id);

    this.networkAclName = props.networkAclName;

    const resource = new cdk.aws_ec2.CfnNetworkAcl(this, 'Resource', {
      vpcId: props.vpc.vpcId,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.networkAclName);

    this.networkAclId = resource.ref;
    this.networkAclVpcId = resource.vpcId;
  }

  public associateSubnet(id: string, props: { subnet: ISubnet }) {
    new cdk.aws_ec2.CfnSubnetNetworkAclAssociation(this, id, {
      networkAclId: this.networkAclId,
      subnetId: props.subnet.subnetId,
    });
  }

  public addEntry(
    id: string,
    props: {
      ruleNumber: number;
      protocol: number;
      ruleAction: 'allow' | 'deny';
      egress: boolean;
      cidrBlock?: string;
      icmp?: {
        code?: number;
        type?: number;
      };
      ipv6CidrBlock?: string;
      portRange?: {
        from: number;
        to: number;
      };
    },
  ) {
    new cdk.aws_ec2.CfnNetworkAclEntry(this, id, {
      networkAclId: this.networkAclId,
      ...props,
    });
  }
}

export interface IVpc extends cdk.IResource {
  /**
   * The identifier of the vpc
   *
   * @attribute
   */
  readonly vpcId: string;
  /**
   * The Name of the vpc
   *
   * @attribute
   */
  readonly name: string;
  /**
   * The CIDR Block of the vpc
   * @remarks CloudFormation resource attribute is used.
   *
   * @attribute
   */
  readonly cidrBlock: string;
  /**
   * Additional Cidrs for VPC
   */
  readonly cidrs: { ipv4: cdk.aws_ec2.CfnVPCCidrBlock[]; ipv6: cdk.aws_ec2.CfnVPCCidrBlock[] };
  /**
   * The EIGW ID assinged to the VPC
   */
  egressOnlyIgwId?: string;
  /**
   * The InternetGatewayId assigned to VPC
   */
  internetGatewayId?: string;
  /**
   * The VirtualPrivateGatewayId assigned to VPC
   */
  virtualPrivateGatewayId?: string;
}

/**
 * Construction properties for a  VPC object.
 */
export interface VpcProps {
  readonly name: string;
  readonly dhcpOptions?: string;
  readonly enableDnsHostnames?: boolean;
  readonly enableDnsSupport?: boolean;
  readonly egressOnlyIgw?: boolean;
  readonly instanceTenancy?: 'default' | 'dedicated';
  readonly internetGateway?: boolean;
  readonly ipv4CidrBlock?: string;
  readonly ipv4IpamPoolId?: string;
  readonly ipv4NetmaskLength?: number;
  readonly tags?: cdk.CfnTag[];
  readonly virtualPrivateGateway?: VirtualPrivateGatewayConfig;
}

export interface ImportedVpcProps {
  readonly name: string;
  readonly vpcId: string;
  readonly cidrBlock: string;
  readonly internetGatewayId?: string;
  readonly virtualPrivateGatewayId?: string;
}

abstract class VpcBase extends cdk.Resource implements IVpc {
  public abstract readonly name: string;
  public abstract readonly vpcId: string;
  public abstract readonly cidrs: { ipv4: cdk.aws_ec2.CfnVPCCidrBlock[]; ipv6: cdk.aws_ec2.CfnVPCCidrBlock[] };
  public egressOnlyIgwId?: string;
  public abstract readonly cidrBlock: string;
  public internetGatewayId?: string;
  public virtualPrivateGatewayId?: string;
  protected egressOnlyIgw: cdk.aws_ec2.CfnEgressOnlyInternetGateway | undefined;
  protected internetGateway: cdk.aws_ec2.CfnInternetGateway | undefined;
  protected internetGatewayAttachment: cdk.aws_ec2.CfnVPCGatewayAttachment | undefined;
  protected virtualPrivateGateway: cdk.aws_ec2.VpnGateway | undefined;
  protected virtualPrivateGatewayAttachment: cdk.aws_ec2.CfnVPCGatewayAttachment | undefined;

  public addInternetGatewayDependent(dependent: Construct) {
    if (this.internetGatewayAttachment) {
      dependent.node.addDependency(this.internetGatewayAttachment);
    }
  }

  public addVirtualPrivateGatewayDependent(dependent: Construct) {
    if (this.virtualPrivateGatewayAttachment) {
      dependent.node.addDependency(this.virtualPrivateGatewayAttachment);
    }
  }

  public addFlowLogs(options: {
    destinations: ('s3' | 'cloud-watch-logs')[];
    trafficType: 'ALL' | 'REJECT' | 'ACCEPT';
    maxAggregationInterval: number;
    logFormat?: string;
    logRetentionInDays?: number;
    encryptionKey?: cdk.aws_kms.IKey;
    bucketArn?: string;
    useExistingRoles: boolean;
    acceleratorPrefix: string;
    overrideS3LogPath?: string;
  }) {
    // Validate maxAggregationInterval
    const maxAggregationInterval = options.maxAggregationInterval;
    if (maxAggregationInterval != 60 && maxAggregationInterval != 600) {
      throw new Error(`Invalid maxAggregationInterval (${maxAggregationInterval}) - must be 60 or 600 seconds`);
    }

    // Destination: CloudWatch Logs
    if (options.destinations.includes('cloud-watch-logs')) {
      if (!options.logRetentionInDays) {
        throw new Error('logRetentionInDays not provided for cwl flow log');
      }

      const logGroup = new cdk.aws_logs.LogGroup(this, 'FlowLogsGroup', {
        encryptionKey: options.encryptionKey,
        retention: options.logRetentionInDays,
      });

      new cdk.aws_ec2.CfnFlowLog(this, 'CloudWatchFlowLog', {
        deliverLogsPermissionArn: this.createVpcFlowLogsRoleCloudWatchLogs(
          logGroup.logGroupArn,
          options.useExistingRoles,
          options.acceleratorPrefix,
        ),
        logDestinationType: 'cloud-watch-logs',
        logDestination: logGroup.logGroupArn,
        resourceId: this.vpcId,
        resourceType: 'VPC',
        trafficType: options.trafficType,
        maxAggregationInterval,
        logFormat: options.logFormat,
      });
    }

    let s3LogDestination = `${options.bucketArn}/vpc-flow-logs/`;
    if (options.overrideS3LogPath) {
      const replacedS3LogPath = this.replaceVpcFlowLogDestName(options.overrideS3LogPath, this.name, this.env.account);
      s3LogDestination = `${options.bucketArn}/${replacedS3LogPath}`;
    }

    // Destination: S3
    if (options.destinations.includes('s3')) {
      new cdk.aws_ec2.CfnFlowLog(this, 'S3FlowLog', {
        logDestinationType: 's3',
        logDestination: s3LogDestination,
        resourceId: this.vpcId,
        resourceType: 'VPC',
        trafficType: options.trafficType,
        maxAggregationInterval,
        logFormat: options.logFormat,
      });
    }
  }

  /**
   * Replaces Lookup Values for VPC Name in string
   * Currently supports look ups for VPC_Name and ACCOUNT_ID for VPC Flow Logs Destinations
   * @param inputString
   * @param replacementValue
   * @returns
   */
  private replaceVpcFlowLogDestName(inputString: string, replacementValue: string, accountId: string): string {
    const replacements = {
      '\\${ACCEL_LOOKUP::VPC_NAME}': replacementValue,
      '\\${ACCEL_LOOKUP::ACCOUNT_ID}': accountId,
    };

    for (const [key, value] of Object.entries(replacements)) {
      inputString = inputString.replace(new RegExp(key, 'g'), value);
    }
    return inputString;
  }

  private createVpcFlowLogsRoleCloudWatchLogs(
    logGroupArn: string,
    useExistingRoles: boolean,
    acceleratorPrefix: string,
  ) {
    if (useExistingRoles) {
      return `arn:${cdk.Stack.of(this).partition}:iam::${
        cdk.Stack.of(this).account
      }:role/${acceleratorPrefix}VpcFlowLogsRole`;
    }
    const role = new cdk.aws_iam.Role(this, 'FlowLogsRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
    });

    role.addToPrincipalPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'logs:CreateLogDelivery',
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:DeleteLogDelivery',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
          'logs:PutLogEvents',
        ],
        resources: [logGroupArn],
      }),
    );
    return role.roleArn;
  }

  public addIpv4Cidr(options: { cidrBlock?: string; ipv4IpamPoolId?: string; ipv4NetmaskLength?: number }) {
    // This block is required for backwards compatibility
    // with a previous iteration. It appends a number to the
    // logical ID so more than two VPC CIDRs can be defined.
    let logicalId = 'VpcCidrBlock';
    if (this.cidrs.ipv4.length > 0) {
      logicalId = `VpcCidrBlock${this.cidrs.ipv4.length}`;
    }

    // Create a secondary VPC CIDR
    this.cidrs.ipv4.push(
      new cdk.aws_ec2.CfnVPCCidrBlock(this, logicalId, {
        cidrBlock: options.cidrBlock,
        ipv4IpamPoolId: options.ipv4IpamPoolId,
        ipv4NetmaskLength: options.ipv4NetmaskLength,
        vpcId: this.vpcId,
      }),
    );
  }

  public addIpv6Cidr(options: {
    amazonProvidedIpv6CidrBlock?: boolean;
    ipv6CidrBlock?: string;
    ipv6IpamPoolId?: string;
    ipv6NetmaskLength?: number;
    ipv6Pool?: string;
  }) {
    const logicalId = `Ipv6CidrBlock${this.cidrs.ipv6.length}`;

    // Create a secondary VPC CIDR
    this.cidrs.ipv6.push(
      new cdk.aws_ec2.CfnVPCCidrBlock(this, logicalId, {
        amazonProvidedIpv6CidrBlock: options.amazonProvidedIpv6CidrBlock,
        ipv6CidrBlock: options.ipv6CidrBlock,
        ipv6IpamPoolId: options.ipv6IpamPoolId,
        ipv6Pool: options.ipv6Pool,
        vpcId: this.vpcId,
      }),
    );
  }

  addEgressOnlyIgw() {
    if (this.egressOnlyIgwId) {
      throw new Error(`Egress-Only Internet Gateway is already configured to VPC ${this.name}`);
    }
    this.egressOnlyIgw = new cdk.aws_ec2.CfnEgressOnlyInternetGateway(this, 'EgressOnlyIgw', { vpcId: this.vpcId });
    this.egressOnlyIgwId = this.egressOnlyIgw.ref;
  }

  addInternetGateway() {
    if (this.internetGatewayId) {
      throw new Error(`Internet Gateway is already configured to VPC ${this.name}`);
    }
    this.internetGateway = new cdk.aws_ec2.CfnInternetGateway(this, 'InternetGateway', {});
    this.internetGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(this, 'InternetGatewayAttachment', {
      internetGatewayId: this.internetGatewayId,
      vpcId: this.vpcId,
    });
    this.internetGatewayId = this.internetGateway.ref;
  }

  addVirtualPrivateGateway(asn: number) {
    if (this.virtualPrivateGatewayId) {
      throw new Error(`Virtual Private Gateway is already configured to VPC ${this.name}`);
    }
    this.virtualPrivateGateway = new cdk.aws_ec2.VpnGateway(this, `VirtualPrivateGateway`, {
      amazonSideAsn: asn,
      type: 'ipsec.1',
    });
    this.virtualPrivateGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(
      this,
      `VirtualPrivateGatewayAttachment`,
      {
        vpnGatewayId: this.virtualPrivateGateway.gatewayId,
        vpcId: this.vpcId,
      },
    );
    this.virtualPrivateGatewayId = this.virtualPrivateGateway.gatewayId;
  }

  setDhcpOptions(dhcpOptions: string) {
    new cdk.aws_ec2.CfnVPCDHCPOptionsAssociation(this, 'DhcpOptionsAssociation', {
      dhcpOptionsId: dhcpOptions,
      vpcId: this.vpcId,
    });
  }
}

/**
 * Defines a Imported VPC object
 */
export class ImportedVpc extends VpcBase {
  public readonly name: string;
  public readonly vpcId: string;
  public readonly cidrs: { ipv4: cdk.aws_ec2.CfnVPCCidrBlock[]; ipv6: cdk.aws_ec2.CfnVPCCidrBlock[] };
  public readonly vpnConnections: VpnConnection[] = [];
  public readonly cidrBlock: string;

  constructor(scope: Construct, id: string, props: ImportedVpcProps) {
    super(scope, id);
    this.name = props.name;
    this.vpcId = props.vpcId;
    this.cidrBlock = props.cidrBlock;
    this.cidrs = { ipv4: [], ipv6: [] };
    this.internetGatewayId = props.internetGatewayId;
    this.virtualPrivateGatewayId = props.virtualPrivateGatewayId;
  }
}

/**
 * Defines a new VPC object
 */
export class Vpc extends VpcBase {
  public readonly name: string;
  public readonly vpcId: string;
  public readonly cidrs: { ipv4: cdk.aws_ec2.CfnVPCCidrBlock[]; ipv6: cdk.aws_ec2.CfnVPCCidrBlock[] };
  public readonly vpnConnections: VpnConnection[] = [];
  public readonly cidrBlock: string;
  constructor(scope: Construct, id: string, props: VpcProps) {
    super(scope, id);
    this.name = props.name;
    const resource = new cdk.aws_ec2.CfnVPC(this, 'Resource', {
      cidrBlock: props.ipv4CidrBlock,
      enableDnsHostnames: props.enableDnsHostnames,
      enableDnsSupport: props.enableDnsSupport,
      instanceTenancy: props.instanceTenancy,
      ipv4IpamPoolId: props.ipv4IpamPoolId,
      ipv4NetmaskLength: props.ipv4NetmaskLength,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.name);

    this.cidrBlock = resource.attrCidrBlock;

    this.vpcId = resource.ref;

    this.cidrs = { ipv4: [], ipv6: [] };

    if (props.egressOnlyIgw) {
      this.addEgressOnlyIgw();
    }

    if (props.internetGateway) {
      this.internetGateway = new cdk.aws_ec2.CfnInternetGateway(this, 'InternetGateway', {});
      this.internetGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(this, 'InternetGatewayAttachment', {
        internetGatewayId: this.internetGateway.ref,
        vpcId: this.vpcId,
      });
      this.internetGatewayId = this.internetGateway.ref;
    }

    if (props.virtualPrivateGateway) {
      this.virtualPrivateGateway = new cdk.aws_ec2.VpnGateway(this, `VirtualPrivateGateway`, {
        amazonSideAsn: props.virtualPrivateGateway.asn,
        type: 'ipsec.1',
      });
      this.virtualPrivateGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(
        this,
        `VirtualPrivateGatewayAttachment`,
        {
          vpnGatewayId: this.virtualPrivateGateway.gatewayId,
          vpcId: this.vpcId,
        },
      );
      this.virtualPrivateGatewayId = this.virtualPrivateGateway.gatewayId;
    }

    if (props.dhcpOptions) {
      new cdk.aws_ec2.CfnVPCDHCPOptionsAssociation(this, 'DhcpOptionsAssociation', {
        dhcpOptionsId: props.dhcpOptions,
        vpcId: this.vpcId,
      });
    }
  }

  static fromVpcAttributes(scope: Construct, id: string, props: ImportedVpcProps) {
    return new ImportedVpc(scope, id, props);
  }
}

/**
 * Initialized DeleteDefaultSecurityGroupRules properties
 */
export interface DeleteDefaultSecurityGroupRulesProps {
  /**
   * Take in Vpc Id as a parameter
   */
  readonly vpcId: string;

  /**
   * Custom resource lambda log group encryption key, when undefined default AWS managed key will be used
   */
  readonly kmsKey?: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}
/**
 * Class Delete the Default Security Group Rules for the Vpc
 */
export class DeleteDefaultSecurityGroupRules extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string, props: DeleteDefaultSecurityGroupRulesProps) {
    super(scope, id);

    const DELETE_DEFAULT_SECURITY_GROUP_RULES = 'Custom::DeleteDefaultSecurityGroupRules';

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, DELETE_DEFAULT_SECURITY_GROUP_RULES, {
      codeDirectory: path.join(__dirname, 'delete-default-security-group-rules/dist'),
      runtime: CUSTOM_RESOURCE_PROVIDER_RUNTIME,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['ec2:DescribeSecurityGroups', 'ec2:RevokeSecurityGroupIngress', 'ec2:RevokeSecurityGroupEgress'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: DELETE_DEFAULT_SECURITY_GROUP_RULES,
      serviceToken: provider.serviceToken,
      properties: {
        vpcId: props.vpcId,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}

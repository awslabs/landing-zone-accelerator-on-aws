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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { IpamAllocationConfig } from '@aws-accelerator/config';

import { IpamSubnet } from './ipam-subnet';
import { IPrefixList } from './prefix-list';
import { IRouteTable } from './route-table';

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
   * The Availability Zone the subnet is located in
   *
   * @attribute
   */
  readonly availabilityZone: string;
}

export interface SubnetProps {
  readonly name: string;
  readonly availabilityZone: string;
  readonly mapPublicIpOnLaunch?: boolean;
  readonly routeTable: IRouteTable;
  readonly vpc: IVpc;
  readonly basePool?: string[];
  readonly ipamAllocation?: IpamAllocationConfig;
  readonly ipv4CidrBlock?: string;
  readonly kmsKey?: cdk.aws_kms.Key;
  readonly logRetentionInDays?: number;
  readonly tags?: cdk.CfnTag[];
  // readonly nacl: INacl;
}

export class Subnet extends cdk.Resource implements ISubnet {
  public readonly subnetName: string;
  public readonly availabilityZone: string;
  public readonly ipv4CidrBlock: string;
  public readonly mapPublicIpOnLaunch?: boolean;
  public readonly routeTable: IRouteTable;
  public readonly subnetId: string;
  public readonly subnetArn: string;

  constructor(scope: Construct, id: string, props: SubnetProps) {
    super(scope, id);

    this.subnetName = props.name;
    this.availabilityZone = props.availabilityZone;
    this.mapPublicIpOnLaunch = props.mapPublicIpOnLaunch;
    this.routeTable = props.routeTable;

    // Determine if IPAM subnet or native
    let resource: cdk.aws_ec2.CfnSubnet | IpamSubnet;

    if (props.ipv4CidrBlock) {
      this.ipv4CidrBlock = props.ipv4CidrBlock;

      resource = new cdk.aws_ec2.CfnSubnet(this, 'Resource', {
        vpcId: props.vpc.vpcId,
        cidrBlock: props.ipv4CidrBlock,
        availabilityZone: props.availabilityZone,
        mapPublicIpOnLaunch: props.mapPublicIpOnLaunch,
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
      if (!props.kmsKey) {
        throw new Error(
          `Error creating subnet ${props.name}: kmsKey property must be defined if not specifying ipv4CidrBlock`,
        );
      }

      resource = new IpamSubnet(this, 'Resource', {
        name: props.name,
        availabilityZone: props.availabilityZone,
        basePool: props.basePool,
        ipamAllocation: props.ipamAllocation,
        vpcId: props.vpc.vpcId,
        mapPublicIpOnLaunch: props.mapPublicIpOnLaunch,
        kmsKey: props.kmsKey,
        logRetentionInDays: props.logRetentionInDays,
        tags: props.tags,
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

    new cdk.aws_ec2.CfnSubnetRouteTableAssociation(this, 'RouteTableAssociation', {
      subnetId: this.subnetId,
      routeTableId: props.routeTable.routeTableId,
    });
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
  readonly tags?: cdk.CfnTag[];
}

export class NatGateway extends cdk.Resource implements INatGateway {
  public readonly natGatewayId: string;
  public readonly natGatewayName: string;

  constructor(scope: Construct, id: string, props: NatGatewayProps) {
    super(scope, id);

    this.natGatewayName = props.name;

    const resource = new cdk.aws_ec2.CfnNatGateway(this, 'Resource', {
      subnetId: props.subnet.subnetId,
      allocationId: new cdk.aws_ec2.CfnEIP(this, 'Eip', {
        domain: 'vpc',
      }).attrAllocationId,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.name);

    this.natGatewayId = resource.ref;
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

export class SecurityGroup extends cdk.Resource implements ISecurityGroup {
  public readonly securityGroupId: string;

  private readonly securityGroup: cdk.aws_ec2.CfnSecurityGroup;

  constructor(scope: Construct, id: string, props: SecurityGroupProps) {
    super(scope, id);

    if (!props.vpc?.vpcId && !props.vpcId) {
      throw new Error(`A property value for vpc or vpcId must be specified`);
    }

    this.securityGroup = new cdk.aws_ec2.CfnSecurityGroup(this, 'Resource', {
      groupDescription: props.description ?? '',
      securityGroupEgress: props.securityGroupEgress,
      securityGroupIngress: props.securityGroupIngress,
      groupName: props.securityGroupName,
      vpcId: props.vpc?.vpcId ?? props.vpcId,
      tags: props.tags,
    });

    if (props.securityGroupName) {
      cdk.Tags.of(this.securityGroup).add('Name', props.securityGroupName);
    }

    this.securityGroupId = this.securityGroup.ref;
  }

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
}

/**
 * Construction properties for a  VPC object.
 */
export interface VpcProps {
  readonly name: string;
  readonly dhcpOptions?: string;
  readonly enableDnsHostnames?: boolean;
  readonly enableDnsSupport?: boolean;
  readonly instanceTenancy?: 'default' | 'dedicated';
  readonly internetGateway?: boolean;
  readonly ipv4CidrBlock?: string;
  readonly ipv4IpamPoolId?: string;
  readonly ipv4NetmaskLength?: number;
  readonly tags?: cdk.CfnTag[];
}

/**
 * Defines a  VPC object
 */
export class Vpc extends cdk.Resource implements IVpc {
  public readonly vpcId: string;
  public readonly internetGateway: cdk.aws_ec2.CfnInternetGateway | undefined;
  public readonly internetGatewayAttachment: cdk.aws_ec2.CfnVPCGatewayAttachment | undefined;
  public readonly dhcpOptionsAssociation: cdk.aws_ec2.CfnVPCDHCPOptionsAssociation | undefined;

  constructor(scope: Construct, id: string, props: VpcProps) {
    super(scope, id);

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

    this.vpcId = resource.ref;

    if (props.internetGateway) {
      this.internetGateway = new cdk.aws_ec2.CfnInternetGateway(this, 'InternetGateway', {});

      this.internetGatewayAttachment = new cdk.aws_ec2.CfnVPCGatewayAttachment(this, 'InternetGatewayAttachment', {
        internetGatewayId: this.internetGateway.ref,
        vpcId: this.vpcId,
      });
    }

    if (props.dhcpOptions) {
      this.dhcpOptionsAssociation = new cdk.aws_ec2.CfnVPCDHCPOptionsAssociation(this, 'DhcpOptionsAssociation', {
        dhcpOptionsId: props.dhcpOptions,
        vpcId: this.vpcId,
      });
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
  }) {
    // Validate maxAggregationInterval
    const maxAggregationInterval = options.maxAggregationInterval;
    if (maxAggregationInterval != 60 && maxAggregationInterval != 600) {
      throw new Error(`Invalid maxAggregationInterval (${maxAggregationInterval}) - must be 60 or 600 seconds`);
    }

    // Destination: CloudWatch Logs
    if (options.destinations.includes('cloud-watch-logs')) {
      if (!options.encryptionKey) {
        throw new Error('encryptionKey not provided for cwl flow log');
      }

      if (!options.logRetentionInDays) {
        throw new Error('logRetentionInDays not provided for cwl flow log');
      }

      const logGroup = new cdk.aws_logs.LogGroup(this, 'FlowLogsGroup', {
        encryptionKey: options.encryptionKey,
        retention: options.logRetentionInDays,
      });

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
          resources: [logGroup.logGroupArn],
        }),
      );

      new cdk.aws_ec2.CfnFlowLog(this, 'CloudWatchFlowLog', {
        deliverLogsPermissionArn: role.roleArn,
        logDestinationType: 'cloud-watch-logs',
        logDestination: logGroup.logGroupArn,
        resourceId: this.vpcId,
        resourceType: 'VPC',
        trafficType: options.trafficType,
        maxAggregationInterval,
        logFormat: options.logFormat,
      });
    }

    // Destination: S3
    if (options.destinations.includes('s3')) {
      new cdk.aws_ec2.CfnFlowLog(this, 'S3FlowLog', {
        logDestinationType: 's3',
        logDestination: options.bucketArn,
        resourceId: this.vpcId,
        resourceType: 'VPC',
        trafficType: options.trafficType,
        maxAggregationInterval,
        logFormat: options.logFormat,
      });
    }
  }

  public addCidr(options: {
    amazonProvidedIpv6CidrBlock?: boolean;
    cidrBlock?: string;
    ipv4IpamPoolId?: string;
    ipv4NetmaskLength?: number;
    ipv6CidrBlock?: string;
    ipv6IpamPoolId?: string;
    ipv6NetmaskLength?: number;
    ipv6Pool?: string;
  }) {
    // Create a secondary VPC CIDR
    new cdk.aws_ec2.CfnVPCCidrBlock(this, 'VpcCidrBlock', {
      amazonProvidedIpv6CidrBlock: options.amazonProvidedIpv6CidrBlock,
      cidrBlock: options.cidrBlock,
      ipv4IpamPoolId: options.ipv4IpamPoolId,
      ipv4NetmaskLength: options.ipv4NetmaskLength,
      ipv6CidrBlock: options.ipv6CidrBlock,
      ipv6IpamPoolId: options.ipv6IpamPoolId,
      ipv6Pool: options.ipv6Pool,
      vpcId: this.vpcId,
    });
  }
}

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

import { pascalCase } from 'pascal-case';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { Construct } from 'constructs';
import { AcceleratorKeyType, AcceleratorStack } from '../../accelerator-stack';
import { V2NetworkStacksBaseProps } from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import {
  IpamConfig,
  NatGatewayConfig,
  OutpostsConfig,
  SubnetConfig,
  TransitGatewayAttachmentConfig,
} from '@aws-accelerator/config';
import { SsmResourceType, getAvailabilityZoneMap, MetadataKeys } from '@aws-accelerator/utils';
import {
  IpamSubnet,
  TransitGatewayAttachment,
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
} from '@aws-accelerator/constructs';
import { isV2Resource } from '../utils/functions';
import { NetworkStackGeneration, V2StackComponentsList } from '../utils/enums';

type CreatedSubnetType = { name: string; id: string };

export class VpcSubnetsBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;
  private vpcId: string;

  private lastCreatedIpamSubnet: IpamSubnet | undefined;
  private cloudwatchKey: cdk.aws_kms.IKey | undefined;
  private createdSubnetDetails: CreatedSubnetType[] = [];

  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id, props);

    //
    // Add Stack metadata
    //
    this.addMetadata(MetadataKeys.LZA_LOOKUP, {
      accountName: this.props.accountsConfig.getAccountNameById(this.account),
      region: cdk.Stack.of(this).region,
      stackGeneration: NetworkStackGeneration.V2,
    });

    this.v2StackProps = props;
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', this.v2StackProps);
    this.vpcId = this.vpcDetails.id!;

    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);

    //
    // Create subnets
    //
    this.createSubnets();

    //
    // Create NAT gateways
    //
    this.createNatGateways();

    //
    // Create cross-account access role for TGW attachments, if applicable
    //
    this.createTgwAttachmentRole();

    //
    // Create TGW attachments
    //
    this.createTgwAttachments();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
  }

  private createSubnets(): void {
    for (const subnetConfig of this.vpcDetails.subnets ?? []) {
      let createdSubnet: CreatedSubnetType | undefined;
      if (
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.SUBNET,
          subnetConfig.name,
        )
      ) {
        createdSubnet = this.createSubnet(subnetConfig);
        this.createdSubnetDetails.push(createdSubnet);
      }

      if (
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.SUBNET_ROUTE_TABLE_ASSOCIATION,
          `${subnetConfig.name}-${subnetConfig.routeTable}`,
        )
      ) {
        this.createRouteTableAssociation(subnetConfig, createdSubnet);
      }
    }
  }

  private createSubnet(subnetConfig: SubnetConfig): CreatedSubnetType {
    const subnetOutpostConfig = this.getSubnetOutpostConfig(subnetConfig);
    const subnetAvailabilityZone = this.getSubnetAvailabilityZone(subnetConfig, subnetOutpostConfig);
    const isAvailabilityZoneId = !subnetAvailabilityZone.includes(cdk.Stack.of(this).region);

    const availabilityZone = isAvailabilityZoneId ? undefined : subnetAvailabilityZone;
    const availabilityZoneId = isAvailabilityZoneId ? subnetAvailabilityZone : undefined;
    const outpostArn = subnetOutpostConfig?.arn;

    let subnetId: string | undefined;
    if (subnetConfig.ipv4CidrBlock || subnetConfig.ipv6CidrBlock) {
      const subnet = this.createNonIpamSubnet(subnetConfig, availabilityZone, availabilityZoneId, outpostArn);
      subnetId = subnet.ref;
    } else {
      const subnet = this.createIpamSubnet(subnetConfig, availabilityZone, availabilityZoneId, outpostArn);

      if (this.lastCreatedIpamSubnet) {
        subnet.node.addDependency(this.lastCreatedIpamSubnet);
      }
      this.lastCreatedIpamSubnet = subnet;
      subnetId = subnet.subnetId;
    }

    if (!subnetId) {
      this.logger.error(`Error creating subnet ${subnetConfig.name}, could not determine subnet id.`);
      throw new Error(`Error creating subnet ${subnetConfig.name}, could not determine subnet id.`);
    }

    this.addSsmParameter({
      logicalId: pascalCase(`SsmParam${pascalCase(this.vpcDetails.name) + pascalCase(subnetConfig.name)}SubnetId`),
      parameterName: this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnetConfig.name]),
      stringValue: subnetId,
    });

    if (subnetConfig.ipv4CidrBlock) {
      this.addSsmParameter({
        logicalId: pascalCase(
          `SsmParam${pascalCase(this.vpcDetails.name) + pascalCase(subnetConfig.name)}SubnetIpv4CidrBlock`,
        ),
        parameterName: this.getSsmPath(SsmResourceType.SUBNET_IPV4_CIDR_BLOCK, [
          this.vpcDetails.name,
          subnetConfig.name,
        ]),
        stringValue: subnetConfig.ipv4CidrBlock,
      });
    }

    return { name: subnetConfig.name, id: subnetId };
  }

  private createNonIpamSubnet(
    subnetConfig: SubnetConfig,
    availabilityZone?: string,
    availabilityZoneId?: string,
    outpostArn?: string,
  ): cdk.aws_ec2.CfnSubnet {
    const ipv6Native = subnetConfig.ipv6CidrBlock !== undefined && !subnetConfig.ipv4CidrBlock ? true : undefined;
    const privateDnsNameOptionsOnLaunch = subnetConfig.privateDnsOptions
      ? {
          EnableResourceNameDnsAAAARecord: subnetConfig.privateDnsOptions?.enableDnsAAAARecord,
          EnableResourceNameDnsARecord: subnetConfig.privateDnsOptions?.enableDnsARecord,
          HostnameType: subnetConfig.privateDnsOptions?.hostnameType,
        }
      : undefined;

    const cfnSubnet = new cdk.aws_ec2.CfnSubnet(
      this,
      `${pascalCase(this.vpcDetails.name) + pascalCase(subnetConfig.name)}NonIpamSubnet`,
      {
        vpcId: this.vpcId,
        assignIpv6AddressOnCreation: subnetConfig.assignIpv6OnCreation,
        availabilityZone,
        availabilityZoneId,
        cidrBlock: subnetConfig.ipv4CidrBlock,
        enableDns64: subnetConfig.enableDns64,
        ipv6CidrBlock: subnetConfig.ipv6CidrBlock,
        ipv6Native,
        mapPublicIpOnLaunch: subnetConfig.mapPublicIpOnLaunch,
        outpostArn,
        privateDnsNameOptionsOnLaunch,
        tags: [{ key: 'Name', value: subnetConfig.name }, ...(subnetConfig.tags ?? [])],
      },
    );

    cfnSubnet.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.SUBNET,
      vpcName: this.vpcDetails.name,
      subnetName: subnetConfig.name,
      ipamAllocationPoolName: subnetConfig.ipamAllocation?.ipamPoolName,
      ipamAllocationNetmaskLength: subnetConfig.ipamAllocation?.netmaskLength,
      cidrBlock: subnetConfig.ipv4CidrBlock,
      enableDns64: subnetConfig.enableDns64,
      ipv6CidrBlock: subnetConfig.ipv6CidrBlock,
      mapPublicIpOnLaunch: subnetConfig.mapPublicIpOnLaunch,
    });

    return cfnSubnet;
  }

  private createIpamSubnet(
    subnetConfig: SubnetConfig,
    availabilityZone?: string,
    availabilityZoneId?: string,
    outpostArn?: string,
  ): IpamSubnet {
    const basePool = subnetConfig.ipamAllocation
      ? this.getIpamBasePool(subnetConfig, this.vpcDetails.ipamConfigs)
      : undefined;

    if (!basePool) {
      this.logger.error(
        `Error creating subnet ${subnetConfig.name} for vpc ${this.vpcDetails.name}: must specify basePool property when using ipamAllocation`,
      );
      throw new Error(
        `Error creating subnet ${subnetConfig.name} for vpc ${this.vpcDetails.name}: must specify basePool property when using ipamAllocation`,
      );
    }

    if (!subnetConfig.ipamAllocation) {
      this.logger.error(
        `Error creating subnet ${subnetConfig.name} for vpc ${this.vpcDetails.name}: ipamAllocation property must be defined if not specifying ipv4CidrBlock`,
      );
      throw new Error(
        `Error creating subnet ${subnetConfig.name} for vpc ${this.vpcDetails.name}: ipamAllocation property must be defined if not specifying ipv4CidrBlock`,
      );
    }

    const ipamSubnet = new IpamSubnet(
      this,
      `${pascalCase(this.vpcDetails.name) + pascalCase(subnetConfig.name)}IpamSubnet`,
      {
        name: subnetConfig.name,
        availabilityZone,
        availabilityZoneId,
        basePool,
        ipamAllocation: subnetConfig.ipamAllocation,
        vpcId: this.vpcId,
        mapPublicIpOnLaunch: subnetConfig.mapPublicIpOnLaunch,
        kmsKey: this.cloudwatchKey,
        logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
        tags: subnetConfig.tags,
        outpostArn,
      },
    );

    this.addSsmParameter({
      logicalId: pascalCase(
        `SsmParam${pascalCase(this.vpcDetails.name) + pascalCase(subnetConfig.name)}IpamSubnetIpv4CidrBlock`,
      ),
      parameterName: this.getSsmPath(SsmResourceType.SUBNET_IPV4_CIDR_BLOCK, [this.vpcDetails.name, subnetConfig.name]),
      stringValue: ipamSubnet.ipv4CidrBlock,
    });

    const cfnResource = ipamSubnet.resource.node.defaultChild as cdk.CfnResource;

    cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.SUBNET,
      vpcName: this.vpcDetails.name,
      subnetName: subnetConfig.name,
      ipamAllocationPoolName: subnetConfig.ipamAllocation?.ipamPoolName,
      ipamAllocationNetmaskLength: subnetConfig.ipamAllocation?.netmaskLength,
      cidrBlock: subnetConfig.ipv4CidrBlock,
      enableDns64: subnetConfig.enableDns64,
      ipv6CidrBlock: subnetConfig.ipv6CidrBlock,
      mapPublicIpOnLaunch: subnetConfig.mapPublicIpOnLaunch,
    });

    return ipamSubnet;
  }

  private createRouteTableAssociation(subnetConfig: SubnetConfig, createdSubnet?: CreatedSubnetType): void {
    const subnetRouteTableId = this.getSubnetRouteTableId(subnetConfig);

    const subnetId = this.getSubnetId(subnetConfig, createdSubnet);

    if (subnetRouteTableId) {
      this.logger.info(`Adding route table association for subnet ${subnetConfig.name}`);
      const cfnSubnetRouteTableAssociation = new cdk.aws_ec2.CfnSubnetRouteTableAssociation(
        this,
        `${pascalCase(subnetConfig.name)}RouteTableAssociation`,
        {
          subnetId: subnetId,
          routeTableId: subnetRouteTableId,
        },
      );

      cfnSubnetRouteTableAssociation.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.SUBNET_ROUTE_TABLE_ASSOCIATION,
        vpcName: this.vpcDetails.name,
        subnetName: subnetConfig.name,
        routeTableName: subnetConfig.routeTable,
      });
    }
  }

  private getSubnetOutpostConfig(subnetConfig: SubnetConfig): OutpostsConfig | undefined {
    if (!subnetConfig.outpost) {
      return undefined;
    }
    const outpostArn = this.vpcDetails.outposts.find(item => item.name === subnetConfig.outpost);

    if (!outpostArn) {
      this.logger.error(
        `Outpost ${subnetConfig.outpost} for subnet ${subnetConfig.name} not found in vpc ${this.vpcDetails.name}.`,
      );
      throw new Error(
        `Outpost ${subnetConfig.outpost} for subnet ${subnetConfig.name} not found in vpc ${this.vpcDetails.name}.`,
      );
    }
    return outpostArn;
  }

  private getSubnetAvailabilityZone(subnetItem: SubnetConfig, outpost?: OutpostsConfig): string {
    const availabilityZone = outpost?.availabilityZone ? outpost.availabilityZone : subnetItem.availabilityZone;

    if (!availabilityZone && !subnetItem.localZone) {
      this.logger.error(
        `Could not determine availability zone for subnet ${subnetItem.name}: Neither Local Zone or Availability Zone are defined.`,
      );
      throw new Error(
        `Configuration validation failed at runtime. Could not determine availability zone for subnet ${subnetItem.name}: Neither Local Zone or Availability Zone are defined.`,
      );
    }

    if (subnetItem.localZone) {
      return `${cdk.Stack.of(this).region}-${subnetItem.localZone}`;
    }

    return typeof availabilityZone === 'string'
      ? `${cdk.Stack.of(this).region}${availabilityZone}`
      : `${getAvailabilityZoneMap(cdk.Stack.of(this).region)}${availabilityZone}`;
  }

  private getIpamBasePool(subnetItem: SubnetConfig, ipamConfig?: IpamConfig[]): string[] {
    let basePool: string[] | undefined;

    for (const ipam of ipamConfig ?? []) {
      const pool = ipam.pools?.find(item => item.name === subnetItem.ipamAllocation!.ipamPoolName);
      basePool = pool?.provisionedCidrs;
    }

    if (!basePool) {
      this.logger.error(
        `Error determining IPAM base pool for subnet ${subnetItem.name}: IPAM pool ${
          subnetItem.ipamAllocation!.ipamPoolName
        } not defined in network config.`,
      );
      throw new Error(
        `Error determining IPAM base pool for subnet ${subnetItem.name}: IPAM pool ${
          subnetItem.ipamAllocation!.ipamPoolName
        } not defined in network config.`,
      );
    }
    return basePool;
  }

  private getSubnetId(subnetConfig: SubnetConfig, createdSubnet?: CreatedSubnetType): string {
    if (createdSubnet?.id) {
      return createdSubnet?.id;
    }

    return cdk.aws_ssm.StringParameter.valueForStringParameter(
      this,
      this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnetConfig.name]),
    );
  }

  private getSubnetRouteTableId(subnetConfig: SubnetConfig): string | undefined {
    if (!subnetConfig.routeTable) {
      return undefined;
    }

    const vpcRouteTable = this.vpcDetails.routeTables.find(item => item.name === subnetConfig.routeTable);
    if (!vpcRouteTable) {
      this.logger.error(
        `Could not determine subnet ${subnetConfig.name} route table ${subnetConfig.routeTable} not found in vpc ${this.vpcDetails.name}.`,
      );
      throw new Error(
        `Configuration validation failed at runtime. Could not determine subnet ${subnetConfig.name} route table ${subnetConfig.routeTable} not found in vpc ${this.vpcDetails.name}.`,
      );
    }

    return cdk.aws_ssm.StringParameter.valueForStringParameter(
      this,
      this.getSsmPath(SsmResourceType.ROUTE_TABLE, [this.vpcDetails.name, vpcRouteTable.name]),
    );
  }

  private createNatGateways(): void {
    for (const natGatewayItem of this.vpcDetails.natGateways) {
      if (
        !isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.NAT_GATEWAY,
          `${natGatewayItem.name}|${natGatewayItem.subnet}`,
        )
      ) {
        this.logger.info(
          `Skipping creation of NAT Gateway ${natGatewayItem.name} for subnet ${natGatewayItem.subnet} in VPC ${this.vpcDetails.name}`,
        );
        continue;
      }

      this.logger.info(
        `Adding NAT Gateway ${natGatewayItem.name} to VPC ${this.vpcDetails.name} subnet ${natGatewayItem.subnet}`,
      );
      const createdSubnetId = this.createdSubnetDetails.find(item => item.name === natGatewayItem.subnet)?.id;

      const resource = new cdk.aws_ec2.CfnNatGateway(
        this,
        `${pascalCase(this.vpcDetails.name)}Vpc${natGatewayItem.name}NatGateway`,
        {
          subnetId:
            createdSubnetId ??
            cdk.aws_ssm.StringParameter.valueForStringParameter(
              this,
              this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, natGatewayItem.subnet]),
            ),
          allocationId: natGatewayItem.private ? undefined : this.getNetGatewayAllocationId(natGatewayItem),
          connectivityType: natGatewayItem.private ? 'private' : undefined,
          tags: natGatewayItem.tags,
        },
      );
      cdk.Tags.of(resource).add('Name', natGatewayItem.name);

      this.addSsmParameter({
        logicalId: pascalCase(
          `SsmParam${pascalCase(this.vpcDetails.name) + pascalCase(natGatewayItem.name)}NatGatewayId`,
        ),
        parameterName: this.getSsmPath(SsmResourceType.NAT_GW, [this.vpcDetails.name, natGatewayItem.name]),
        stringValue: resource.ref,
      });

      resource.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.NAT_GATEWAY,
        vpcName: this.vpcDetails.name,
        natGatewayName: natGatewayItem.name,
        subnetName: natGatewayItem.subnet,
      });
    }
  }

  private getNetGatewayAllocationId(natGatewayItem: NatGatewayConfig): string {
    return (
      natGatewayItem.allocationId ??
      new cdk.aws_ec2.CfnEIP(this, `${pascalCase(this.vpcDetails.name)}Vpc${natGatewayItem.name}NatGatewayEip`, {
        domain: 'vpc',
      }).attrAllocationId
    );
  }

  private getTgwOwningAccountIds(): string[] {
    const transitGatewayAccountIds: string[] = [];

    for (const attachment of this.vpcDetails.transitGatewayAttachments) {
      const owningAccountId = this.props.accountsConfig.getAccountId(attachment.transitGateway.account);

      if (owningAccountId !== cdk.Stack.of(this).account && !transitGatewayAccountIds.includes(owningAccountId)) {
        transitGatewayAccountIds.push(owningAccountId);
      }
    }

    return transitGatewayAccountIds;
  }

  private createTgwAttachmentRole(): void {
    // Get account IDs of external accounts hosting TGWs
    const transitGatewayAccountIds = this.getTgwOwningAccountIds();
    const roleName = `${this.props.prefixes.accelerator}-DescribeTgwAttachRole-${cdk.Stack.of(this).region}`;
    // Create cross account access role to read transit gateway attachments if
    // there are other accounts in the list
    if (
      transitGatewayAccountIds.length > 0 &&
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.TGW_VPC_ATTACHMENT_ROLE,
        `${roleName}|${cdk.Stack.of(this).account}`,
      )
    ) {
      this.logger.info(`Creating IAM role to access transit gateway attachments for VPC ${this.vpcDetails.name}`);

      const principals: cdk.aws_iam.PrincipalBase[] = [];
      transitGatewayAccountIds.forEach(accountId => {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      });
      const roleArns = [
        `arn:${cdk.Stack.of(this).partition}:iam::*:role/${this.props.prefixes.accelerator}-*-CustomGetTransitGateway*`,
      ];
      const role = new cdk.aws_iam.Role(this, 'DescribeTgwAttachRole', {
        roleName,
        inlinePolicies: {
          default: new cdk.aws_iam.PolicyDocument({
            statements: [
              new cdk.aws_iam.PolicyStatement({
                effect: cdk.aws_iam.Effect.ALLOW,
                actions: ['ec2:DescribeTransitGatewayAttachments'],
                resources: ['*'],
              }),
            ],
          }),
        },
        assumedBy: new cdk.aws_iam.PrincipalWithConditions(new cdk.aws_iam.CompositePrincipal(...principals), {
          ArnLike: {
            'aws:PrincipalArn': roleArns,
          },
          StringEquals: {
            'aws:PrincipalOrgID': this.organizationId,
          },
        }),
      });
      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(this, `${this.stackName}/DescribeTgwAttachRole/Resource`, [
        {
          id: 'AwsSolutions-IAM5',
          reason: 'DescribeTgwAttachRole needs access to every describe each transit gateway attachment in the account',
        },
      ]);

      (role.node.defaultChild as cdk.aws_iam.CfnRole).addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.TGW_VPC_ATTACHMENT_ROLE,
        roleName,
      });
    }
  }

  private getTgwAttachmentSubnetIds(tgwAttachmentItem: TransitGatewayAttachmentConfig) {
    const subnetIds: string[] = [];
    for (const subnet of tgwAttachmentItem.subnets) {
      const createdSubnetId = this.createdSubnetDetails.find(item => item.name === subnet)?.id;
      subnetIds.push(
        createdSubnetId ??
          cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.SUBNET, [this.vpcDetails.name, subnet]),
          ),
      );
    }
    return subnetIds;
  }

  private createTgwAttachments(): void {
    for (const tgwAttachmentItem of this.vpcDetails.transitGatewayAttachments) {
      const tgwAccountId = this.props.accountsConfig.getAccountId(tgwAttachmentItem.transitGateway.account);
      if (
        !isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.TGW_VPC_ATTACHMENT,
          `${tgwAttachmentItem.name}|${tgwAttachmentItem.transitGateway.name}|${tgwAccountId}`,
        )
      ) {
        this.logger.info(
          `Skipping creation of transit gateway attachment ${tgwAttachmentItem.name} for VPC ${this.vpcDetails.name}`,
        );
        continue;
      }

      this.logger.info(`Adding transit gateway attachment ${tgwAttachmentItem.name} to VPC ${this.vpcDetails.name}`);
      let transitGatewayId: string | undefined;
      if (tgwAccountId === cdk.Stack.of(this).account) {
        this.logger.info(`Transit Gateway ${tgwAttachmentItem.transitGateway.name} is in the same account`);
        transitGatewayId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.getSsmPath(SsmResourceType.TGW, [tgwAttachmentItem.transitGateway.name]),
        );
      } else {
        this.logger.info(
          `Transit Gateway ${tgwAttachmentItem.transitGateway.name} is in a remote account ${tgwAttachmentItem.transitGateway.account}, will use resource share to get id.`,
        );
        const logicalId = pascalCase(
          `${tgwAttachmentItem.name}TgwAttachment${tgwAttachmentItem.transitGateway.account}Account${tgwAttachmentItem.transitGateway.name}Tgw`,
        );
        const resourceShareName = `${tgwAttachmentItem.transitGateway.name}_TransitGatewayShare`;
        const resourceShare = ResourceShare.fromLookup(this, pascalCase(`${logicalId}ResourceShare`), {
          resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
          resourceShareName: resourceShareName,
          owningAccountId: tgwAccountId,
        });

        // Represents the item shared by RAM
        const resourceShareItem = ResourceShareItem.fromLookup(this, pascalCase(`${logicalId}ResourceShareItem`), {
          resourceShare,
          resourceShareItemType: 'ec2:TransitGateway',
          kmsKey: this.cloudwatchKey,
          logRetentionInDays: this.v2StackProps.globalConfig.cloudwatchLogRetentionInDays,
        });

        transitGatewayId = resourceShareItem.resourceShareItemId;
      }

      if (!transitGatewayId) {
        this.logger.error(`Transit Gateway ID not found for ${tgwAttachmentItem.transitGateway.name}`);
        throw new Error(
          `Configuration validation failed at runtime. Transit Gateway ID not found for ${tgwAttachmentItem.transitGateway.name}`,
        );
      }

      const subnetIds = this.getTgwAttachmentSubnetIds(tgwAttachmentItem);

      const transitGatewayAttachment = new TransitGatewayAttachment(
        this,
        pascalCase(`${tgwAttachmentItem.name}Vpc${tgwAttachmentItem.transitGateway.name}TransitGatewayAttachment`),
        {
          name: tgwAttachmentItem.name,
          partition: this.props.partition,
          transitGatewayId,
          subnetIds,
          vpcId: this.vpcId,
          options: tgwAttachmentItem.options,
          tags: tgwAttachmentItem.tags,
        },
      );
      cdk.Tags.of(transitGatewayAttachment).add('Name', tgwAttachmentItem.name);

      this.addSsmParameter({
        logicalId: pascalCase(
          `SsmParam${pascalCase(this.vpcDetails.name) + pascalCase(tgwAttachmentItem.name)}TransitGatewayAttachmentId`,
        ),
        parameterName: this.getSsmPath(SsmResourceType.TGW_ATTACHMENT, [this.vpcDetails.name, tgwAttachmentItem.name]),
        stringValue: transitGatewayAttachment.transitGatewayAttachmentId,
      });

      const cfnResource = transitGatewayAttachment.node.defaultChild as cdk.CfnResource;

      cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, {
        resourceType: V2StackComponentsList.TGW_VPC_ATTACHMENT,
        vpcName: this.vpcDetails.name,
        transitGatewayAttachmentName: tgwAttachmentItem.name,
        transitGatewayName: tgwAttachmentItem.transitGateway.name,
      });
    }
  }
}

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
import { pascalCase } from 'pascal-case';
import { Construct } from 'constructs';
import { AcceleratorKeyType, AcceleratorStack } from '../../accelerator-stack';
import { RouteEntryPropertiesType, V2NetworkStacksBaseProps } from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import {
  OutpostsConfig,
  RouteTableConfig,
  RouteTableEntryConfig,
  SubnetConfig,
} from '@aws-accelerator/config/lib/network-config';
import { PrefixListRoute, PrefixListRouteProps } from '@aws-accelerator/constructs/lib/aws-ec2/prefix-list-route';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { isV2Resource } from '../utils/functions';
import { NetworkStackGeneration, V2StackComponentsList } from '../utils/enums';
import { NetworkVpcStackRouteEntryTypes } from '../utils/constants';
import { MetadataKeys } from '@aws-accelerator/utils/lib/common-types';
import {
  ResourceShare,
  ResourceShareItem,
  ResourceShareOwner,
} from '@aws-accelerator/constructs/lib/aws-ram/resource-share';

export class VpcRouteEntriesBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;
  private cloudwatchKey: cdk.aws_kms.IKey | undefined;
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
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', props);
    this.cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);

    //
    // Create route table route entries
    //
    this.createRouteTableRouteEntries();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
  }

  /**
   * Function to create route tables
   */
  private createRouteTableRouteEntries(): void {
    for (const routeTableItem of this.vpcDetails.routeTables ?? []) {
      this.createRouteTableEntries(routeTableItem);
    }
  }

  /**
   * Function to create Route Table entries
   * @param routeTableItem {@link RouteTableConfig}
   */
  private createRouteTableEntries(routeTableItem: RouteTableConfig): void {
    for (const routeTableEntryItem of routeTableItem.routes ?? []) {
      if (
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.ROUTE_ENTRY,
          `${routeTableItem.name}|${routeTableEntryItem.name}|${routeTableEntryItem.type}|${
            routeTableEntryItem.destination ?? routeTableEntryItem.destinationPrefixList
          }|${routeTableEntryItem.target}`,
        )
      ) {
        // Check if using a prefix list or CIDR as the destination
        if (routeTableEntryItem.type && NetworkVpcStackRouteEntryTypes.includes(routeTableEntryItem.type)) {
          this.logger.info(
            `Creating route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} for vpc ${this.vpcDetails.name}`,
          );
          const routeEntryResourceName =
            pascalCase(`${this.vpcDetails.name}Vpc`) +
            pascalCase(`${routeTableItem.name}RouteTable`) +
            pascalCase(routeTableEntryItem.name) +
            'RouteEntry';

          // Set destination type
          const [destination, destinationPrefixListId, ipv6Destination] = this.setRouteEntryDestination(
            routeTableEntryItem,
            this.vpcDetails.subnets,
          );

          this.logger.info(
            `Using existing route table ${routeTableItem.name} for route entry ${routeTableEntryItem.name} for vpc ${this.vpcDetails.name}.`,
          );
          const routeTableId = cdk.aws_ssm.StringParameter.valueForStringParameter(
            this,
            this.getSsmPath(SsmResourceType.ROUTE_TABLE, [this.vpcDetails.name, routeTableItem.name]),
          );

          const routeProps: RouteEntryPropertiesType = {
            routeTableName: routeTableItem.name,
            routeEntryResourceName,
            routeTableId,
            targetId: '', // Default value will be set in the switch statement
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
            logGroupKmsKey: this.cloudwatchKey,
            destination,
            destinationPrefixListId,
            ipv6Destination,
          };

          const routeEntryTarget = routeTableEntryItem.target!;

          const metadata: { [key: string]: string } = {
            resourceType: V2StackComponentsList.ROUTE_ENTRY,
            vpcName: this.vpcDetails.name,
            routeTableName: routeTableItem.name,
            entryName: routeTableEntryItem.name,
            entryType: routeTableEntryItem.type,
            entryDestinationPrefixList: routeTableEntryItem.destinationPrefixList ?? 'N/A',
            entryTarget: routeEntryTarget,
          };

          switch (routeTableEntryItem.type) {
            case 'transitGateway':
              this.logger.info(
                `Creating transit gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} for vpc ${this.vpcDetails.name}`,
              );
              const transitGatewayId = this.getTransitGatewayId(
                routeTableItem.name,
                routeTableEntryItem.name,
                routeEntryTarget,
              );

              if (!transitGatewayId) {
                throw new Error(
                  `Cannot create transit gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} in VPC ${this.vpcDetails.name} because unable to fetch transit gateway id for ${routeEntryTarget} transit gateway.`,
                );
              }

              routeProps.targetId = transitGatewayId;

              this.addTransitGatewayRoute(routeProps, metadata);
              break;
            case 'natGateway':
              this.logger.info(
                `Creating NAT gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} for vpc ${this.vpcDetails.name}`,
              );
              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.NAT_GW, [this.vpcDetails.name, routeEntryTarget]),
              );

              this.addNatGatewayRoute(routeProps, metadata);
              break;
            case 'internetGateway':
              this.logger.info(
                `Creating internet gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} for vpc ${this.vpcDetails.name}`,
              );
              if (!this.vpcDetails.internetGateway) {
                throw new Error(
                  `Cannot create internet gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} in VPC ${this.vpcDetails.name} because internetGateway is not enabled`,
                );
              }

              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.IGW, [this.vpcDetails.name]),
              );

              this.addInternetGatewayRoute(routeProps, metadata);
              break;
            case 'egressOnlyIgw':
              this.logger.info(
                `Creating egress only internet gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} for vpc ${this.vpcDetails.name}`,
              );

              if (!this.vpcDetails.egressOnlyIgw) {
                throw new Error(
                  `Cannot create egress only internet gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} in VPC ${this.vpcDetails.name} because egressOnlyIgw is not enabled`,
                );
              }

              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.VPC_EGRESS_ONLY_IGW, [this.vpcDetails.name]),
              );

              this.addEgressOnlyIgwRoute(routeProps, metadata);
              break;
            case 'virtualPrivateGateway':
              this.logger.info(
                `Creating virtual private gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} for vpc ${this.vpcDetails.name}`,
              );

              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.VPN_GW, [this.vpcDetails.name]),
              );

              this.addVirtualPrivateGatewayRoute(routeProps, metadata);
              break;
            case 'localGateway':
              this.logger.info(
                `Creating local gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} for vpc ${this.vpcDetails.name}`,
              );

              const localGatewayIdFromVpcOutpost = this.getLocalGatewayIdFromVpcOutpost(
                this.vpcDetails.outposts,
                routeTableEntryItem,
              );

              if (!localGatewayIdFromVpcOutpost) {
                throw new Error(
                  `Cannot create local gateway route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} in VPC ${this.vpcDetails.name} because local gateway id is not found`,
                );
              }
              routeProps.targetId = localGatewayIdFromVpcOutpost;

              this.addLocalGatewayRoute(routeProps, metadata);
              break;
            default:
              this.logger.info(
                `Route type '${routeTableEntryItem.type}' for route entry ${routeTableEntryItem.name} in route table ${routeTableItem.name} for VPC ${this.vpcDetails.name} will be handled by another stack`,
              );
              break;
          }
        }
      } else {
        this.logger.info(
          `Route entry ${routeTableEntryItem.name} for route table ${routeTableItem.name} in vpc ${this.vpcDetails.name} exists in v1 stack skipping creation in v2 stack.`,
        );
      }
    }
  }

  /**
   * Function to get Transit gateway id
   * @param routeTableName string
   * @param routeTableEntryName string
   * @param transitGatewayName string
   * @returns transitGatewayId string
   */
  private getTransitGatewayId(
    routeTableName: string,
    routeTableEntryName: string,
    transitGatewayName: string,
  ): string | undefined {
    const transitGatewayItem = this.v2StackProps.networkConfig.transitGateways.find(
      item => item.name === transitGatewayName,
    );

    if (!transitGatewayItem) {
      return undefined;
    }

    const tgwAccountId = this.props.accountsConfig.getAccountId(transitGatewayItem.account);
    if (tgwAccountId === cdk.Stack.of(this).account) {
      this.logger.info(`Transit gateway ${transitGatewayName} is in the same account.`);
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.TGW, [transitGatewayName]),
      );
    } else {
      this.logger.info(`Transit gateway ${transitGatewayName} is in a different account.`);
      const logicalId = pascalCase(
        `${routeTableName}RouteTable${routeTableEntryName}RouteEntry${transitGatewayName}Tgw`,
      );
      const resourceShareName = `${transitGatewayName}_TransitGatewayShare`;

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

      return resourceShareItem.resourceShareItemId;
    }
  }

  /**
   * Determine whether to set prefix list, CIDR, or subnet reference for route destination
   * @param routeTableEntryItem {@link RouteTableEntryConfig}
   * @param subnets {@link SubnetConfig}[]
   * @returns
   */
  private setRouteEntryDestination(
    routeTableEntryItem: RouteTableEntryConfig,
    subnets: SubnetConfig[],
  ): [string | undefined, string | undefined, string | undefined] {
    let destinationPrefixListId: string | undefined = undefined;
    let destination = routeTableEntryItem.destination;
    let ipv6Destination = routeTableEntryItem.ipv6Destination;

    if (routeTableEntryItem.destinationPrefixList) {
      // Get prefix list id from SSM
      destinationPrefixListId = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.PREFIX_LIST, [routeTableEntryItem.destinationPrefixList]),
      );
    }

    const routeDestination = routeTableEntryItem.ipv6Destination ?? routeTableEntryItem.destination!;
    const routeTargetASubnet = this.isRouteTargetASubnet(subnets, routeDestination);

    if (routeTargetASubnet) {
      this.logger.info(`Route target is a subnet`);
      [destination, ipv6Destination] = this.getSubnetCidrBlock(routeTableEntryItem, subnets);
    }

    return [destination, destinationPrefixListId, ipv6Destination];
  }

  /**
   * Function to check if route target is a subnet
   * @param subnets {@link SubnetConfig}[]
   * @param destination string
   * @returns
   */
  private isRouteTargetASubnet(subnets: SubnetConfig[], destination: string): boolean {
    for (const subnet of subnets) {
      if (subnet.name === destination) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns either the IPv4 or IPv6 CIDR block of a dynamic subnet target.
   * @param routeTableEntryItem
   * @param subnets
   * @returns
   */
  private getSubnetCidrBlock(
    routeTableEntryItem: RouteTableEntryConfig,
    subnets: SubnetConfig[],
  ): [string | undefined, string | undefined] {
    let destination: string | undefined = undefined;
    let ipv6Destination: string | undefined = undefined;

    const subnet = subnets.find(item => item.name === routeTableEntryItem.destination);

    if (subnet) {
      if (routeTableEntryItem.ipv6Destination) {
        ipv6Destination = subnet.ipv6CidrBlock;
      } else {
        destination = subnet.ipv4CidrBlock;
      }
    }
    return [destination, ipv6Destination];
  }

  /**
   * Function to validate CIDR route destination
   * @param routeTableName
   * @param destination
   * @param ipv6Destination
   */
  private validateCidrRouteDestination(routeTableName: string, destination?: string, ipv6Destination?: string) {
    if (!destination && !ipv6Destination) {
      throw new Error(`Attempting to add CIDR route without specifying destination for route table ${routeTableName}.`);
    }
  }

  /**
   * Function to get outpost local gateway id
   * @param outposts {@link OutpostsConfig}[]
   * @param routeTableEntryItem {@link RouteTableEntryConfig}
   * @returns string
   */
  private getLocalGatewayIdFromVpcOutpost(
    outposts: OutpostsConfig[],
    routeTableEntryItem: RouteTableEntryConfig,
  ): string | undefined {
    let localGatewayId: string | undefined;
    for (const outpost of outposts) {
      if (outpost.localGateway && outpost.localGateway.name === routeTableEntryItem.target) {
        localGatewayId = outpost.localGateway.id;
      }
    }
    return localGatewayId;
  }

  /**
   * Function to create non prefix list route entry
   * @param routeTableName string
   * @param resourceName string
   * @param props {@link cdk.aws_ec2.CfnRouteProps}
   * @param metadata
   */
  private createNonPrefixListRoute(
    routeTableName: string,
    resourceName: string,
    props: cdk.aws_ec2.CfnRouteProps,
    metadata: { [key: string]: string },
  ): void {
    this.validateCidrRouteDestination(routeTableName, props.destinationCidrBlock, props.destinationIpv6CidrBlock);
    const cfnRoute = new cdk.aws_ec2.CfnRoute(this, resourceName, props);

    cfnRoute.addMetadata(MetadataKeys.LZA_LOOKUP, metadata);
  }

  /**
   * Function to create prefix list route
   * @param resourceName string
   * @param props {@link PrefixListRouteProps}
   * @param metadata
   */
  private createPrefixListRoute(
    resourceName: string,
    props: PrefixListRouteProps,
    metadata: { [key: string]: string },
  ): void {
    const prefixListRoute = new PrefixListRoute(this, resourceName, props);

    const cfnResource = prefixListRoute.resource.node.defaultChild as cdk.CfnResource;

    cfnResource.addMetadata(MetadataKeys.LZA_LOOKUP, metadata);
  }

  /**
   * Function to add TGW route
   * @param props {@link RouteEntryPropertiesType}
   */
  private addTransitGatewayRoute(props: RouteEntryPropertiesType, metadata: { [key: string]: string }): void {
    if (props.destinationPrefixListId) {
      this.createPrefixListRoute(
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationPrefixListId: props.destinationPrefixListId,
          logGroupKmsKey: props.logGroupKmsKey,
          logRetentionInDays: props.logRetentionInDays,
          transitGatewayId: props.targetId,
        },
        metadata,
      );
    } else {
      this.createNonPrefixListRoute(
        props.routeTableName,
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationCidrBlock: props.destination,
          destinationIpv6CidrBlock: props.ipv6Destination,
          transitGatewayId: props.targetId,
        },
        metadata,
      );
    }
  }

  /**
   * Function to add NAT Gateway route
   * @param props {@link RouteEntryPropertiesType}
   * @param metadata
   */
  private addNatGatewayRoute(props: RouteEntryPropertiesType, metadata: { [key: string]: string }): void {
    if (props.destinationPrefixListId) {
      this.createPrefixListRoute(
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationPrefixListId: props.destinationPrefixListId,
          logGroupKmsKey: props.logGroupKmsKey,
          logRetentionInDays: props.logRetentionInDays,
          natGatewayId: props.targetId,
        },
        metadata,
      );
    } else {
      this.createNonPrefixListRoute(
        props.routeTableName,
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationCidrBlock: props.destination,
          destinationIpv6CidrBlock: props.ipv6Destination,
          natGatewayId: props.targetId,
        },
        metadata,
      );
    }
  }

  /**
   * Function to add Internet Gateway route
   * @param props {@link RouteEntryPropertiesType}
   * @param metadata
   */
  private addInternetGatewayRoute(props: RouteEntryPropertiesType, metadata: { [key: string]: string }): void {
    if (props.destinationPrefixListId) {
      this.createPrefixListRoute(
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationPrefixListId: props.destinationPrefixListId,
          logGroupKmsKey: props.logGroupKmsKey,
          logRetentionInDays: props.logRetentionInDays,
          gatewayId: props.targetId,
        },
        metadata,
      );
    } else {
      this.createNonPrefixListRoute(
        props.routeTableName,
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationCidrBlock: props.destination,
          destinationIpv6CidrBlock: props.ipv6Destination,
          gatewayId: props.targetId,
        },
        metadata,
      );
    }
  }

  /**
   * Function to add Egress Only IGW route
   * @param props {@link RouteEntryPropertiesType}
   * @param metadata
   */
  private addEgressOnlyIgwRoute(props: RouteEntryPropertiesType, metadata: { [key: string]: string }): void {
    if (props.destinationPrefixListId) {
      this.createPrefixListRoute(
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationPrefixListId: props.destinationPrefixListId,
          logGroupKmsKey: props.logGroupKmsKey,
          logRetentionInDays: props.logRetentionInDays,
          egressOnlyInternetGatewayId: props.targetId,
        },
        metadata,
      );
    } else {
      this.createNonPrefixListRoute(
        props.routeTableName,
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationCidrBlock: props.destination,
          destinationIpv6CidrBlock: props.ipv6Destination,
          egressOnlyInternetGatewayId: props.targetId,
        },
        metadata,
      );
    }
  }

  /**
   * Function to add Virtual Private Gateway route
   * @param props {@link RouteEntryPropertiesType}
   * @param metadata
   */
  private addVirtualPrivateGatewayRoute(props: RouteEntryPropertiesType, metadata: { [key: string]: string }): void {
    if (props.destinationPrefixListId) {
      this.createPrefixListRoute(
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationPrefixListId: props.destinationPrefixListId,
          logGroupKmsKey: props.logGroupKmsKey,
          logRetentionInDays: props.logRetentionInDays,
          gatewayId: props.targetId,
        },
        metadata,
      );
    } else {
      this.createNonPrefixListRoute(
        props.routeTableName,
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationCidrBlock: props.destination,
          destinationIpv6CidrBlock: props.ipv6Destination,
          gatewayId: props.targetId,
        },
        metadata,
      );
    }
  }

  /**
   * Function to add Local Gateway route
   * @param props {@link RouteEntryPropertiesType}
   * @param metadata
   */
  private addLocalGatewayRoute(props: RouteEntryPropertiesType, metadata: { [key: string]: string }): void {
    if (props.destinationPrefixListId) {
      this.createPrefixListRoute(
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationPrefixListId: props.destinationPrefixListId,
          logGroupKmsKey: props.logGroupKmsKey,
          logRetentionInDays: props.logRetentionInDays,
          localGatewayId: props.targetId,
        },
        metadata,
      );
    } else {
      this.createNonPrefixListRoute(
        props.routeTableName,
        props.routeEntryResourceName,
        {
          routeTableId: props.routeTableId,
          destinationCidrBlock: props.destination,
          destinationIpv6CidrBlock: props.ipv6Destination,
          localGatewayId: props.targetId,
        },
        metadata,
      );
    }
  }
}

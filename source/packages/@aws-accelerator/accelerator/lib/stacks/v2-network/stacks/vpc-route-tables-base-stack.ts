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
import { RouteEntryPropertiesType, RouteTableDetailsType, V2NetworkStacksBaseProps } from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import {
  OutpostsConfig,
  RouteTableConfig,
  RouteTableEntryConfig,
  SubnetConfig,
} from '@aws-accelerator/config/lib/network-config';
import { PrefixListRoute, PrefixListRouteProps } from '@aws-accelerator/constructs/lib/aws-ec2/prefix-list-route';
import { SsmResourceType } from '@aws-accelerator/utils/lib/ssm-parameter-path';
import { GatewayRouteTableType } from '@aws-accelerator/config/lib/models/network-config';
import { isV2Resource } from '../utils/functions';
import { V2StackComponentsList } from '../utils/enums';
import { NetworkVpcStackRouteEntryTypes } from '../utils/constants';

type V2RouteTableDetailsType = { cfnRouteTable?: cdk.aws_ec2.CfnRouteTable; routeTableId?: string };
export class VpcRouteTablesBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;
  private vpcId: string;
  constructor(scope: Construct, id: string, props: V2NetworkStacksBaseProps) {
    super(scope, id, props);

    this.v2StackProps = props;
    this.vpcDetails = new VpcDetails(this, 'VpcDetails', props);
    this.vpcId = this.vpcDetails.id!;

    // If configured Associate outpost route tables for vpc config
    if (!this.vpcDetails.fromTemplate) {
      this.associateOutpostRouteTables(
        this.vpcDetails.nonTemplateVpcAccountName!,
        this.vpcDetails.name,
        this.vpcId,
        this.vpcDetails.outposts,
      );
    }

    //
    // Create route tables
    //
    this.createRouteTables();

    //
    // Create SSM Parameters
    //
    this.createSsmParameters();
  }

  /**
   * Function to associate outpost route tables to VPC
   * @param vpcAccount string
   * @param vpcName string
   * @param vpcId string
   * @param outposts {@link OutpostsConfig}[]
   */
  private associateOutpostRouteTables(
    vpcAccount: string,
    vpcName: string,
    vpcId: string,
    outposts: OutpostsConfig[],
  ): void {
    for (const outpost of outposts) {
      for (const routeTableItem of outpost.localGateway?.routeTables ?? []) {
        // TO DO check route tables are associated in V1 stack
        if (
          isV2Resource(
            this.v2StackProps.v2NetworkResources,
            this.vpcDetails.name,
            V2StackComponentsList.LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION,
            `${vpcAccount}|${routeTableItem.name}|${routeTableItem.id}`,
          )
        ) {
          new cdk.aws_ec2.CfnLocalGatewayRouteTableVPCAssociation(
            this,
            `${routeTableItem.name}-${vpcName}-${vpcAccount}`,
            {
              vpcId,
              localGatewayRouteTableId: routeTableItem.id,
            },
          );
        }
      }
    }
  }

  /**
   * Function to create route tables
   */
  private createRouteTables(): void {
    for (const routeTableItem of this.vpcDetails.routeTables ?? []) {
      const routeTableDetails = this.getRouteTableDetails(
        routeTableItem.name,
        this.vpcDetails.name,
        this.vpcId,
        this.vpcDetails.tags,
      );
      const routeTableId = routeTableDetails.cfnRouteTable
        ? routeTableDetails.cfnRouteTable.ref
        : routeTableDetails.routeTableId!;

      if (routeTableDetails.cfnRouteTable) {
        // Add Route table ID SSM parameter
        this.addSsmParameter({
          logicalId: pascalCase(
            `SsmParam${pascalCase(this.vpcDetails.name)}${pascalCase(routeTableItem.name)}RouteTableId`,
          ),
          parameterName: this.getSsmPath(SsmResourceType.ROUTE_TABLE, [this.vpcDetails.name, routeTableItem.name]),
          stringValue: routeTableId,
        });
      }

      this.manageGateWayAssociation(routeTableItem, routeTableId, routeTableDetails);

      // Create route entries
      const routeTable: RouteTableDetailsType = {
        cfnRouteTable: routeTableDetails.cfnRouteTable,
        name: routeTableItem.name,
        id: routeTableId,
        routes: routeTableItem.routes ?? [],
      };

      this.createRouteTableEntries(routeTable);
    }
  }

  /**
   * Function to get route table details
   * @param routeTableName string
   * @param vpcName string
   * @param vpcId string
   * @param vpcTags {@link cdk.CfnTag}[] | undefined
   * @returns routeId {@link cdk.aws_ec2.CfnRouteTable}
   */
  private getRouteTableDetails(
    routeTableName: string,
    vpcName: string,
    vpcId: string,
    vpcTags?: cdk.CfnTag[],
  ): V2RouteTableDetailsType {
    if (
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.ROUTE_TABLE,
        routeTableName,
      )
    ) {
      return this.createRouteTable(routeTableName, vpcName, vpcId, vpcTags);
    }

    this.logger.info(`Using existing route table for route ${routeTableName} for vpc ${vpcName}`);
    return {
      routeTableId: cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        this.getSsmPath(SsmResourceType.ROUTE_TABLE, [this.vpcDetails.name, routeTableName]),
      ),
    };
  }

  /**
   * Function to create route table and return the route table id
   * @param routeTableName string
   * @param vpcName string
   * @param vpcId string
   * @param vpcTags {@link cdk.CfnTag}[] | undefined
   * @returns routeId {@link cdk.aws_ec2.CfnRouteTable}
   */
  private createRouteTable(
    routeTableName: string,
    vpcName: string,
    vpcId: string,
    vpcTags?: cdk.CfnTag[],
  ): V2RouteTableDetailsType {
    this.logger.info(`Creating route table for route ${routeTableName} for vpc ${vpcName}`);
    const routeTable = new cdk.aws_ec2.CfnRouteTable(
      this,
      pascalCase(`${vpcName}Vpc`) + pascalCase(`${routeTableName}RouteTable`),
      {
        vpcId,
        tags: [{ key: 'Name', value: routeTableName }, ...(vpcTags ?? [])],
      },
    );

    return { cfnRouteTable: routeTable };
  }

  /**
   * Function to manage gateway association
   * @param routeTableItem {@link RouteTableConfig}
   * @param routeTableId string
   * @param routeTableDetails {@link V2RouteTableDetailsType}
   * @returns
   */
  private manageGateWayAssociation(
    routeTableItem: RouteTableConfig,
    routeTableId: string,
    routeTableDetails: V2RouteTableDetailsType,
  ): void {
    if (!routeTableItem.gatewayAssociation) {
      return;
    }
    if (
      isV2Resource(
        this.v2StackProps.v2NetworkResources,
        this.vpcDetails.name,
        V2StackComponentsList.ROUTE_TABLE_GATEWAY_ASSOCIATION,
        `${routeTableItem.name}|${routeTableItem.gatewayAssociation}`,
      )
    ) {
      // Add gateway association if configured
      this.addGatewayAssociation(
        this.vpcDetails.name,
        this.vpcDetails.internetGateway,
        routeTableItem.name,
        routeTableDetails,
        routeTableId,
        routeTableItem.gatewayAssociation,
      );
    } else {
      this.logger.info(
        `Gateway association ${routeTableItem.gatewayAssociation} for route table ${routeTableItem.name} in vpc ${this.vpcDetails.name} is present in the v1 stack, v2 stack will skip management of the resource.`,
      );
    }
  }

  /**
   * Function to add gateway association
   * @param vpcName string
   * @param internetGateway boolean
   * @param routeTableName string
   * @param v2RouteTableDetails {@link V2RouteTableDetailsType}
   * @param routeTableId string
   * @param gatewayAssociation {@link GatewayRouteTableType}
   */
  private addGatewayAssociation(
    vpcName: string,
    internetGateway: boolean,
    routeTableName: string,
    v2RouteTableDetails: V2RouteTableDetailsType,
    routeTableId: string,
    gatewayAssociation: GatewayRouteTableType,
  ): void {
    let gatewayId: string | undefined;
    switch (gatewayAssociation) {
      case 'internetGateway':
        if (!internetGateway) {
          const errorMessage = `No internet gateway found for vpc ${vpcName} while adding internet gateway association for route table ${routeTableName}`;
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
        gatewayId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.getSsmPath(SsmResourceType.IGW, [vpcName]),
        );
        break;
      case 'virtualPrivateGateway':
        if (!this.vpcDetails.virtualPrivateGateway) {
          const errorMessage = `No virtual private gateway found for vpc ${vpcName} while adding virtual private gateway association for route table ${routeTableName}`;
          this.logger.error(errorMessage);
          throw new Error(errorMessage);
        }
        gatewayId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          this.getSsmPath(SsmResourceType.VPN_GW, [vpcName]),
        );
        break;
      default:
        throw new Error(`Invalid gateway association ${gatewayAssociation} for route table ${routeTableName}`);
    }

    const cfnGatewayRouteTableAssociation = new cdk.aws_ec2.CfnGatewayRouteTableAssociation(
      this,
      pascalCase(`${vpcName}Vpc-${routeTableName}RT-GatewayAssociation`),
      {
        routeTableId,
        gatewayId,
      },
    );

    if (v2RouteTableDetails.cfnRouteTable) {
      cfnGatewayRouteTableAssociation.node.addDependency(v2RouteTableDetails.cfnRouteTable);
    }
  }

  private createRouteTableEntries(routeTable: RouteTableDetailsType): void {
    for (const routeTableEntryItem of routeTable.routes ?? []) {
      if (
        isV2Resource(
          this.v2StackProps.v2NetworkResources,
          this.vpcDetails.name,
          V2StackComponentsList.ROUTE_ENTRY,
          `${routeTable.name}|${routeTableEntryItem.name}|${routeTableEntryItem.type}|${
            routeTableEntryItem.destination ?? routeTableEntryItem.destinationPrefixList
          }|${routeTableEntryItem.target}`,
        )
      ) {
        this.logger.info(
          `Creating route table entry ${routeTableEntryItem.name} for route table ${routeTable.name} for vpc ${this.vpcDetails.name}`,
        );
        const routeEntryResourceName =
          pascalCase(`${this.vpcDetails.name}Vpc`) +
          pascalCase(`${routeTable.name}RouteTable`) +
          pascalCase(routeTableEntryItem.name);

        // Check if using a prefix list or CIDR as the destination
        if (routeTableEntryItem.type && NetworkVpcStackRouteEntryTypes.includes(routeTableEntryItem.type)) {
          // Set destination type
          const [destination, destinationPrefixListId, ipv6Destination] = this.setRouteEntryDestination(
            routeTableEntryItem,
            this.vpcDetails.subnets,
          );
          const cloudwatchKey = this.getAcceleratorKey(AcceleratorKeyType.CLOUDWATCH_KEY);

          const routeProps: RouteEntryPropertiesType = {
            cfnRouteTable: routeTable.cfnRouteTable,
            routeTableName: routeTable.name,
            routeEntryResourceName,
            routeTableId: routeTable.id,
            targetId: '', // Default value will be set in the switch statement
            logRetentionInDays: this.props.globalConfig.cloudwatchLogRetentionInDays,
            logGroupKmsKey: cloudwatchKey,
            destination,
            destinationPrefixListId,
            ipv6Destination,
          };

          const routeEntryTarget = routeTableEntryItem.target!;

          switch (routeTableEntryItem.type) {
            case 'transitGateway':
              this.logger.info(
                `Creating transit gateway route table entry for route table ${routeTable.name} for vpc ${this.vpcDetails.name}`,
              );
              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.TGW, [routeEntryTarget]),
              );

              this.addTransitGatewayRoute(routeProps);
              break;
            case 'natGateway':
              this.logger.info(
                `Creating NAT gateway route table entry for route table ${routeTable.name} for vpc ${this.vpcDetails.name}`,
              );
              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.NAT_GW, [this.vpcDetails.name, routeEntryTarget]),
              );

              this.addNatGatewayRoute(routeProps);
              break;
            case 'internetGateway':
              this.logger.info(
                `Creating internet gateway route table entry for route table ${routeTable.name} for vpc ${this.vpcDetails.name}`,
              );
              if (!this.vpcDetails.internetGateway) {
                throw new Error(
                  `Cannot create internet gateway route for route table ${routeTable.name} for VPC ${this.vpcDetails.name} because internetGateway is not enabled`,
                );
              }

              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.IGW, [this.vpcDetails.name]),
              );

              this.addInternetGatewayRoute(routeProps);
              break;
            case 'egressOnlyIgw':
              this.logger.info(
                `Creating egress only internet gateway route table entry for route table ${routeTable.name} for vpc ${this.vpcDetails.name}`,
              );

              if (!this.vpcDetails.egressOnlyIgw) {
                throw new Error(
                  `Cannot create egress only internet gateway route for route table ${routeTable.name} for VPC ${this.vpcDetails.name} because egressOnlyIgw is not enabled`,
                );
              }

              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.VPC_EGRESS_ONLY_IGW, [this.vpcDetails.name]),
              );

              this.addEgressOnlyIgwRoute(routeProps);
              break;
            case 'virtualPrivateGateway':
              this.logger.info(
                `Creating virtual private gateway route table entry for route table ${routeTable.name} for vpc ${this.vpcDetails.name}`,
              );

              routeProps.targetId = cdk.aws_ssm.StringParameter.valueForStringParameter(
                this,
                this.getSsmPath(SsmResourceType.VPN_GW, [this.vpcDetails.name]),
              );

              this.addVirtualPrivateGatewayRoute(routeProps);
              break;
            case 'localGateway':
              this.logger.info(
                `Creating local gateway route table entry for route table ${routeTable.name} for vpc ${this.vpcDetails.name}`,
              );

              const localGatewayIdFromVpcOutpost = this.getLocalGatewayIdFromVpcOutpost(
                this.vpcDetails.outposts,
                routeTableEntryItem.destination!,
              );

              if (!localGatewayIdFromVpcOutpost) {
                throw new Error(
                  `Cannot create local gateway route for route table ${routeTable.name} for VPC ${this.vpcDetails.name} because local gateway id is not found`,
                );
              }
              routeProps.targetId = localGatewayIdFromVpcOutpost;

              this.addLocalGatewayRoute(routeProps);
              break;
          }
        }
      } else {
        this.logger.info(
          `Route entry ${routeTableEntryItem.name} for route table ${routeTable.name} in vpc ${this.vpcDetails.name} exists in v2 stack skipping creation in v2 stack.`,
        );
      }
    }
  }

  /**
   * Determine whether to set prefix list, CIDR, or subnet reference for route destination
   * @param routeTableEntryItem {@link RouteTableEntryConfig}
   * @param subnets {@link SubnetConfig}[]
   * @param routeTableEntryItem
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
   * Function to get outpost locate gateway id
   * @param outposts {@link OutpostsConfig}[]
   * @param localGatewayName string
   * @returns string
   */
  private getLocalGatewayIdFromVpcOutpost(outposts: OutpostsConfig[], localGatewayName: string): string | undefined {
    let localGatewayId: string | undefined;
    for (const outpost of outposts) {
      if (outpost.localGateway && outpost.localGateway.name === localGatewayName) {
        localGatewayId = outpost.localGateway.id;
      }
    }
    return localGatewayId;
  }

  /**
   * Function to create non prefix list route entry
   * @param resourceName string
   * @param cfnRouteTable {@link cdk.aws_ec2.CfnRouteTable}
   * @param props {@link cdk.aws_ec2.CfnRouteProps}
   */
  private createNonPrefixListRoute(
    routeTableName: string,
    resourceName: string,
    props: cdk.aws_ec2.CfnRouteProps,
    cfnRouteTable?: cdk.aws_ec2.CfnRouteTable,
  ): void {
    this.validateCidrRouteDestination(routeTableName, props.destinationCidrBlock, props.destinationIpv6CidrBlock);
    const cfnRoute = new cdk.aws_ec2.CfnRoute(this, resourceName, props);

    if (cfnRouteTable) {
      cfnRoute.node.addDependency(cfnRouteTable);
    }
  }

  /**
   * Function to create prefix list route
   * @param props {@link PrefixListRouteProps}
   */
  private createPrefixListRoute(
    resourceName: string,
    props: PrefixListRouteProps,
    cfnRouteTable?: cdk.aws_ec2.CfnRouteTable,
  ): void {
    const prefixListRoute = new PrefixListRoute(this, resourceName, props);
    if (cfnRouteTable) {
      prefixListRoute.node.addDependency(cfnRouteTable);
    }
  }

  /**
   * Function to add TGW route
   * @param props {@link RouteEntryPropertiesType}
   */
  private addTransitGatewayRoute(props: RouteEntryPropertiesType): void {
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
        props.cfnRouteTable,
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
        props.cfnRouteTable,
      );
    }
  }

  /**
   * Function to add NAT Gateway route
   * @param props {@link RouteEntryPropertiesType}
   */
  private addNatGatewayRoute(props: RouteEntryPropertiesType): void {
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
        props.cfnRouteTable,
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
        props.cfnRouteTable,
      );
    }
  }

  /**
   * Function to add Internet Gateway route
   * @param props {@link RouteEntryPropertiesType}
   */
  private addInternetGatewayRoute(props: RouteEntryPropertiesType): void {
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
        props.cfnRouteTable,
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
        props.cfnRouteTable,
      );
    }
  }

  /**
   * Function to add Egress Only IGW route
   * @param props {@link RouteEntryPropertiesType}
   */
  private addEgressOnlyIgwRoute(props: RouteEntryPropertiesType): void {
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
        props.cfnRouteTable,
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
        props.cfnRouteTable,
      );
    }
  }

  /**
   * Function to add Virtual Private Gateway route
   * @param props {@link RouteEntryPropertiesType}
   */
  private addVirtualPrivateGatewayRoute(props: RouteEntryPropertiesType): void {
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
        props.cfnRouteTable,
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
        props.cfnRouteTable,
      );
    }
  }

  /**
   * Function to add Local Gateway route
   * @param props {@link RouteEntryPropertiesType}
   */
  private addLocalGatewayRoute(props: RouteEntryPropertiesType): void {
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
        props.cfnRouteTable,
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
        props.cfnRouteTable,
      );
    }
  }
}

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
import { AcceleratorStack } from '../../accelerator-stack';
import { V2NetworkStacksBaseProps } from '../utils/types';
import { VpcDetails } from '../constructs/vpc-details';
import { OutpostsConfig, RouteTableConfig, GatewayRouteTableType } from '@aws-accelerator/config';
import { SsmResourceType, MetadataKeys } from '@aws-accelerator/utils';
import { isV2Resource } from '../utils/functions';
import { NetworkStackGeneration, V2StackComponentsList } from '../utils/enums';

type V2RouteTableDetailsType = { cfnRouteTable?: cdk.aws_ec2.CfnRouteTable; routeTableId?: string };
export class VpcRouteTablesBaseStack extends AcceleratorStack {
  private v2StackProps: V2NetworkStacksBaseProps;
  private vpcDetails: VpcDetails;
  private vpcId: string;
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
          const cfnLocalGatewayRouteTableVPCAssociation = new cdk.aws_ec2.CfnLocalGatewayRouteTableVPCAssociation(
            this,
            `${routeTableItem.name}-${vpcName}-${vpcAccount}`,
            {
              vpcId,
              localGatewayRouteTableId: routeTableItem.id,
            },
          );

          cfnLocalGatewayRouteTableVPCAssociation.addMetadata(MetadataKeys.LZA_LOOKUP, {
            resourceType: V2StackComponentsList.LOCAL_GATEWAY_ROUTE_TABLE_VPC_ASSOCIATION,
            vpcName: this.vpcDetails.name,
            localGatewayRouteTableName: routeTableItem.name,
          });
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

    routeTable.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.ROUTE_TABLE,
      vpcName,
      routeTableName,
    });

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

    cfnGatewayRouteTableAssociation.addMetadata(MetadataKeys.LZA_LOOKUP, {
      resourceType: V2StackComponentsList.ROUTE_TABLE_GATEWAY_ASSOCIATION,
      vpcName,
      routeTableName,
    });
  }
}

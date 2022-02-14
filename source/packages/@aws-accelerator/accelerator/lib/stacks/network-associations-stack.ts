/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import {
  AssociateHostedZones,
  TransitGatewayAttachment,
  TransitGatewayRouteTableAssociation,
  TransitGatewayRouteTablePropagation,
} from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class NetworkAssociationsStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    // Build Transit Gateway Maps
    const transitGateways = new Map<string, string>();
    const transitGatewayRouteTables = new Map<string, string>();
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(tgwItem.account);
      if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
        const transitGatewayId = ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/transitGateways/${tgwItem.name}/id`,
        );
        transitGateways.set(tgwItem.name, transitGatewayId);

        for (const routeTableItem of tgwItem.routeTables ?? []) {
          const transitGatewayRouteTableId = ssm.StringParameter.valueForStringParameter(
            this,
            `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
          );
          const key = `${tgwItem.name}_${routeTableItem.name}`;
          transitGatewayRouteTables.set(key, transitGatewayRouteTableId);
        }
      }
    }

    for (const vpcItem of props.networkConfig.vpcs ?? []) {
      if (vpcItem.region == cdk.Stack.of(this).region) {
        for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
          const accountId = props.accountsConfig.getAccountId(tgwAttachmentItem.transitGateway.account);
          if (accountId === cdk.Stack.of(this).account) {
            const owningAccountId = props.accountsConfig.getAccountId(vpcItem.account);

            // Get the Transit Gateway ID
            const transitGatewayId = transitGateways.get(tgwAttachmentItem.transitGateway.name);
            if (transitGatewayId === undefined) {
              throw new Error(`Transit Gateway ${tgwAttachmentItem.transitGateway.name} not found`);
            }

            // Get the Transit Gateway Attachment ID
            let transitGatewayAttachmentId;
            if (accountId === owningAccountId) {
              Logger.info(
                `[network-tgw-attach-stack] Update route tables for attachment ${tgwAttachmentItem.name} from local account ${owningAccountId}`,
              );
              transitGatewayAttachmentId = ssm.StringParameter.valueForStringParameter(
                this,
                `/accelerator/network/vpc/${vpcItem.name}/transitGatewayAttachment/${tgwAttachmentItem.name}/id`,
              );
            } else {
              Logger.info(
                `[network-tgw-attach-stack] Update route tables for attachment ${tgwAttachmentItem.name} from external account ${owningAccountId}`,
              );

              const transitGatewayAttachment = TransitGatewayAttachment.fromLookup(
                this,
                pascalCase(`${tgwAttachmentItem.name}VpcTransitGatewayAttachment`),
                {
                  name: tgwAttachmentItem.name,
                  owningAccountId,
                  transitGatewayId,
                  roleName: `AWSAccelerator-DescribeTransitGatewayAttachmentsRole-${cdk.Stack.of(this).region}`,
                },
              );
              transitGatewayAttachmentId = transitGatewayAttachment.transitGatewayAttachmentId;
            }

            // Evaluate Route Table Associations
            for (const routeTableItem of tgwAttachmentItem.routeTableAssociations ?? []) {
              const key = `${tgwAttachmentItem.transitGateway.name}_${routeTableItem}`;

              const transitGatewayRouteTableId = transitGatewayRouteTables.get(key);
              if (transitGatewayRouteTableId === undefined) {
                throw new Error(`Transit Gateway Route Table ${key} not found`);
              }

              new TransitGatewayRouteTableAssociation(
                this,
                `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}Association`,
                {
                  transitGatewayAttachmentId,
                  transitGatewayRouteTableId,
                },
              );
            }

            // Evaluate Route Table Propagations
            for (const routeTableItem of tgwAttachmentItem.routeTablePropagations ?? []) {
              const key = `${tgwAttachmentItem.transitGateway.name}_${routeTableItem}`;

              const transitGatewayRouteTableId = transitGatewayRouteTables.get(key);
              if (transitGatewayRouteTableId === undefined) {
                throw new Error(`Transit Gateway Route Table ${key} not found`);
              }

              new TransitGatewayRouteTablePropagation(
                this,
                `${pascalCase(tgwAttachmentItem.name)}${pascalCase(routeTableItem)}Propagation`,
                {
                  transitGatewayAttachmentId,
                  transitGatewayRouteTableId,
                },
              );
            }
          }
        }
      }
    }

    //
    // Get the Central Endpoints VPC, there should only be one.
    // Only care if the VPC is defined within this account and region
    //
    let centralEndpointVpc = undefined;
    const centralEndpointVpcs = props.networkConfig.vpcs.filter(
      item =>
        item.interfaceEndpoints?.central &&
        props.accountsConfig.getAccountId(item.account) === cdk.Stack.of(this).account &&
        item.region === cdk.Stack.of(this).region,
    );
    if (centralEndpointVpcs.length > 1) {
      throw new Error(`multiple (${centralEndpointVpcs.length}) central endpoint vpcs detected, should only be one`);
    }
    centralEndpointVpc = centralEndpointVpcs[0];

    if (centralEndpointVpc) {
      Logger.info('[network-vpc-stack] Central endpoints VPC detected, share private hosted zone with member VPCs');

      // Generate list of accounts with VPCs that needed to set up share
      const accountIds: string[] = [];
      for (const vpcItem of props.networkConfig.vpcs ?? []) {
        if (vpcItem.region == cdk.Stack.of(this).region) {
          const accountId = props.accountsConfig.getAccountId(vpcItem.account);
          if (!accountIds.includes(accountId)) {
            accountIds.push(accountId);
          }
        }
      }

      // Create list of hosted zone ids from SSM Params
      const hostedZoneIds: string[] = [];
      for (const endpointItem of centralEndpointVpc.interfaceEndpoints?.endpoints ?? []) {
        const hostedZoneId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/vpc/${centralEndpointVpc.name}/route53/hostedZone/${endpointItem}/id`,
        );
        hostedZoneIds.push(hostedZoneId);
      }

      // Custom resource to associate hosted zones
      new AssociateHostedZones(this, 'AssociateHostedZones', {
        accountIds,
        hostedZoneIds,
        hostedZoneAccountId: cdk.Stack.of(this).account,
        roleName: `AWSAccelerator-EnableCentralEndpointsRole-${cdk.Stack.of(this).region}`,
        tagFilters: [
          {
            key: 'accelerator:use-central-endpoints',
            value: 'true',
          },
          {
            key: 'accelerator:central-endpoints-account-id',
            value: props.accountsConfig.getAccountId(centralEndpointVpc.account),
          },
        ],
      });
    }
  }
}

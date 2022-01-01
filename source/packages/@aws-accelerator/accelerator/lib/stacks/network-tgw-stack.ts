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

import { ResourceShare, TransitGateway, TransitGatewayRouteTable } from '@aws-accelerator/constructs';
import * as cdk from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';
import { Logger } from '../logger';
import { AcceleratorStack, AcceleratorStackProps } from './accelerator-stack';

export class NetworkTgwStack extends AcceleratorStack {
  constructor(scope: Construct, id: string, props: AcceleratorStackProps) {
    super(scope, id, props);

    new ssm.StringParameter(this, 'SsmParamStackId', {
      parameterName: `/accelerator/${cdk.Stack.of(this).stackName}/stack-id`,
      stringValue: cdk.Stack.of(this).stackId,
    });

    //
    // Generate Transit Gateways
    //
    for (const tgwItem of props.networkConfig.transitGateways ?? []) {
      const accountId = props.accountsConfig.getAccountId(tgwItem.account);
      if (accountId === cdk.Stack.of(this).account && tgwItem.region == cdk.Stack.of(this).region) {
        Logger.info(`[network-tgw-stack] Add Transit Gateway ${tgwItem.name}`);

        const tgw = new TransitGateway(this, pascalCase(`${tgwItem.name}TransitGateway`), {
          name: tgwItem.name,
          amazonSideAsn: tgwItem.asn,
          autoAcceptSharedAttachments: tgwItem.autoAcceptSharingAttachments,
          defaultRouteTableAssociation: tgwItem.defaultRouteTableAssociation,
          defaultRouteTablePropagation: tgwItem.defaultRouteTablePropagation,
          dnsSupport: tgwItem.dnsSupport,
          vpnEcmpSupport: tgwItem.vpnEcmpSupport,
        });

        new ssm.StringParameter(this, pascalCase(`SsmParam${tgwItem.name}TransitGatewayId`), {
          parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/id`,
          stringValue: tgw.transitGatewayId,
        });

        for (const routeTableItem of tgwItem.routeTables ?? []) {
          Logger.info(`[network-tgw-stack] Add Transit Gateway Route Tables ${routeTableItem.name}`);

          const routeTable = new TransitGatewayRouteTable(
            this,
            pascalCase(`${routeTableItem.name}TransitGatewayRouteTable`),
            {
              transitGatewayId: tgw.transitGatewayId,
              name: routeTableItem.name,
            },
          );

          new ssm.StringParameter(
            this,
            pascalCase(`SsmParam${tgwItem.name}${routeTableItem.name}TransitGatewayRouteTableId`),
            {
              parameterName: `/accelerator/network/transitGateways/${tgwItem.name}/routeTables/${routeTableItem.name}/id`,
              stringValue: routeTable.id,
            },
          );
        }

        if (tgwItem.shareTargets) {
          Logger.info(`[network-tgw-stack] Share transit gateway`);

          // Build a list of principals to share to
          const principals: string[] = [];

          // Loop through all the defined OUs
          for (const ouItem of tgwItem.shareTargets.organizationalUnits ?? []) {
            const ouArn = props.organizationConfig.getOrganizationalUnitArn(ouItem);
            Logger.info(
              `[network-tgw-stack] Share Transit Gateway ${tgwItem.name} with Organizational Unit ${ouItem}: ${ouArn}`,
            );
            principals.push(ouArn);
          }

          // Loop through all the defined accounts
          for (const account of tgwItem.shareTargets.accounts ?? []) {
            const accountId = props.accountsConfig.getAccountId(account);
            Logger.info(`[network-tgw-stack] Share Subnet ${tgwItem.name} with Account ${account}: ${accountId}`);
            principals.push(accountId);
          }

          // Create the Resource Share
          new ResourceShare(this, `${pascalCase(tgwItem.name)}TransitGatewayShare`, {
            name: `${tgwItem.name}_TransitGatewayShare`,
            principals,
            resourceArns: [tgw.transitGatewayArn],
          });
        }
      }
    }
  }
}

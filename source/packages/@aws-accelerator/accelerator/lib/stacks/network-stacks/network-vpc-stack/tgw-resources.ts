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

import { TransitGatewayAttachmentConfig, VpcConfig, VpcTemplatesConfig } from '@aws-accelerator/config';
import {
  PutSsmParameter,
  SsmParameterLookup,
  Subnet,
  TransitGatewayAttachment,
  TransitGatewayPeering,
  Vpc,
} from '@aws-accelerator/constructs';
import { SsmResourceType } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { NagSuppressions } from 'cdk-nag';
import { pascalCase } from 'pascal-case';
import { AcceleratorStackProps } from '../../accelerator-stack';
import { LogLevel } from '../network-stack';
import { getSubnet, getTransitGatewayId, getVpc } from '../utils/getter-utils';
import { NetworkVpcStack } from './network-vpc-stack';

export class TgwResources {
  public readonly tgwAttachmentMap: Map<string, TransitGatewayAttachment>;
  public readonly tgwPeeringMap: Map<string, string>;
  public readonly vpcAttachmentRole?: cdk.aws_iam.Role;

  private stack: NetworkVpcStack;

  constructor(
    networkVpcStack: NetworkVpcStack,
    transitGatewayIds: Map<string, string>,
    vpcMap: Map<string, Vpc>,
    subnetMap: Map<string, Subnet>,
    props: AcceleratorStackProps,
  ) {
    this.stack = networkVpcStack;

    // Create cross-account access role for TGW attachments, if applicable
    this.vpcAttachmentRole = this.createTgwAttachmentRole(this.stack.vpcsInScope, props);
    // Create TGW attachments
    this.tgwAttachmentMap = this.createTgwAttachments(
      this.stack.vpcsInScope,
      transitGatewayIds,
      vpcMap,
      subnetMap,
      props.partition,
    );
    // Create TGW peerings
    this.tgwPeeringMap = this.createTransitGatewayPeering(props);
  }

  /**
   * Create a cross-account access role to describe TGW attachments
   * if the target TGW resides in an external account
   * @param vpcResources
   * @param props
   * @returns
   */
  private createTgwAttachmentRole(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    props: AcceleratorStackProps,
  ): cdk.aws_iam.Role | undefined {
    // Get account IDs of external accounts hosting TGWs
    const transitGatewayAccountIds = this.getTgwOwningAccountIds(vpcResources, props);

    // Create cross account access role to read transit gateway attachments if
    // there are other accounts in the list
    if (transitGatewayAccountIds.length > 0) {
      this.stack.addLogs(LogLevel.INFO, `Create IAM Cross Account Access Role for TGW attachments`);

      const principals: cdk.aws_iam.PrincipalBase[] = [];
      transitGatewayAccountIds.forEach(accountId => {
        principals.push(new cdk.aws_iam.AccountPrincipal(accountId));
      });
      const role = new cdk.aws_iam.Role(this.stack, 'DescribeTgwAttachRole', {
        roleName: `${props.prefixes.accelerator}-DescribeTgwAttachRole-${cdk.Stack.of(this.stack).region}`,
        assumedBy: new cdk.aws_iam.CompositePrincipal(...principals),
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
      });
      // AwsSolutions-IAM5: The IAM entity contains wildcard permissions and does not have a cdk_nag rule suppression with evidence for those permission.
      // rule suppression with evidence for this permission.
      NagSuppressions.addResourceSuppressionsByPath(
        this.stack,
        `${this.stack.stackName}/DescribeTgwAttachRole/Resource`,
        [
          {
            id: 'AwsSolutions-IAM5',
            reason:
              'DescribeTgwAttachRole needs access to every describe each transit gateway attachment in the account',
          },
        ],
      );
      return role;
    }
    return undefined;
  }

  /**
   * Return an array of owning account IDs of TGWs
   * that reside in an external accounts if there are
   * VPC attachments in scope
   * @param vpcResources
   * @param props
   * @returns
   */
  private getTgwOwningAccountIds(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    props: AcceleratorStackProps,
  ): string[] {
    const transitGatewayAccountIds: string[] = [];

    for (const vpcItem of vpcResources) {
      for (const attachment of vpcItem.transitGatewayAttachments ?? []) {
        const owningAccountId = props.accountsConfig.getAccountId(attachment.transitGateway.account);

        if (
          owningAccountId !== cdk.Stack.of(this.stack).account &&
          !transitGatewayAccountIds.includes(owningAccountId)
        ) {
          transitGatewayAccountIds.push(owningAccountId);
        }
      }
    }
    return transitGatewayAccountIds;
  }

  /**
   * Create TGW attachments for VPCs in stack context
   * @param vpcResources
   * @param transitGatewayIds
   * @param vpcMap
   * @param subnetMap
   * @param partition
   * @returns
   */
  private createTgwAttachments(
    vpcResources: (VpcConfig | VpcTemplatesConfig)[],
    transitGatewayIds: Map<string, string>,
    vpcMap: Map<string, Vpc>,
    subnetMap: Map<string, Subnet>,
    partition: string,
  ): Map<string, TransitGatewayAttachment> {
    const transitGatewayAttachments = new Map<string, TransitGatewayAttachment>();

    for (const vpcItem of vpcResources) {
      for (const tgwAttachmentItem of vpcItem.transitGatewayAttachments ?? []) {
        // Retrieve resources from maps
        const transitGatewayId = getTransitGatewayId(transitGatewayIds, tgwAttachmentItem.transitGateway.name);
        const vpc = getVpc(vpcMap, vpcItem.name) as Vpc;
        const subnetIds = this.getAttachmentSubnetIds(tgwAttachmentItem, vpcItem.name, subnetMap);

        this.stack.addLogs(
          LogLevel.INFO,
          `Adding Transit Gateway Attachment to VPC ${vpcItem.name} for TGW ${tgwAttachmentItem.transitGateway.name}`,
        );
        const attachment = new TransitGatewayAttachment(
          this.stack,
          pascalCase(`${tgwAttachmentItem.name}VpcTransitGatewayAttachment`),
          {
            name: tgwAttachmentItem.name,
            partition,
            transitGatewayId,
            subnetIds,
            vpcId: vpc.vpcId,
            options: tgwAttachmentItem.options,
            tags: tgwAttachmentItem.tags,
          },
        );
        transitGatewayAttachments.set(`${vpcItem.name}_${tgwAttachmentItem.transitGateway.name}`, attachment);

        this.stack.addSsmParameter({
          logicalId: pascalCase(
            `SsmParam${pascalCase(vpcItem.name) + pascalCase(tgwAttachmentItem.name)}TransitGatewayAttachmentId`,
          ),
          parameterName: this.stack.getSsmPath(SsmResourceType.TGW_ATTACHMENT, [vpcItem.name, tgwAttachmentItem.name]),
          stringValue: attachment.transitGatewayAttachmentId,
        });
      }
    }
    return transitGatewayAttachments;
  }

  /**
   * Get subnet IDs for a given TGW attachment
   * @param tgwAttachmentItem
   * @param vpcName
   * @param subnetMap
   * @returns
   */
  private getAttachmentSubnetIds(
    tgwAttachmentItem: TransitGatewayAttachmentConfig,
    vpcName: string,
    subnetMap: Map<string, Subnet>,
  ): string[] {
    const subnetIds: string[] = [];
    for (const subnetItem of tgwAttachmentItem.subnets ?? []) {
      const subnet = getSubnet(subnetMap, vpcName, subnetItem) as Subnet;
      subnetIds.push(subnet.subnetId);
    }
    return subnetIds;
  }

  /**
   * Function to create TGW peering
   */
  private createTransitGatewayPeering(props: AcceleratorStackProps): Map<string, string> {
    const tgwPeeringMap = new Map<string, string>();

    for (const transitGatewayPeeringItem of props.networkConfig.transitGatewayPeering ?? []) {
      // Get account IDs
      const requesterAccountId = props.accountsConfig.getAccountId(transitGatewayPeeringItem.requester.account);
      const accepterAccountId = props.accountsConfig.getAccountId(transitGatewayPeeringItem.accepter.account);
      const crossAccountCondition =
        accepterAccountId !== requesterAccountId ||
        transitGatewayPeeringItem.accepter.region !== transitGatewayPeeringItem.requester.region;

      if (this.stack.isTargetStack([requesterAccountId], [transitGatewayPeeringItem.requester.region])) {
        this.stack.addLogs(
          LogLevel.INFO,
          `Creating transit gateway peering for tgw ${transitGatewayPeeringItem.requester.transitGatewayName} with accepter tgw ${transitGatewayPeeringItem.accepter.transitGatewayName}`,
        );

        const requesterTransitGatewayRouteTableId = cdk.aws_ssm.StringParameter.valueForStringParameter(
          this.stack,
          this.stack.getSsmPath(SsmResourceType.TGW_ROUTE_TABLE, [
            transitGatewayPeeringItem.requester.transitGatewayName,
            transitGatewayPeeringItem.requester.routeTableAssociations,
          ]),
        );

        const accepterTransitGatewayId = new SsmParameterLookup(this.stack, 'AccepterTransitGatewayIdLookup', {
          name: this.stack.getSsmPath(SsmResourceType.TGW, [transitGatewayPeeringItem.accepter.transitGatewayName]),
          accountId: props.accountsConfig.getAccountId(transitGatewayPeeringItem.accepter.account),
          parameterRegion: transitGatewayPeeringItem.accepter.region,
          roleName: this.stack.acceleratorResourceNames.roles.tgwPeering,
          kmsKey: this.stack.cloudwatchKey,
          logRetentionInDays: this.stack.logRetention ?? 365,
          acceleratorPrefix: props.prefixes.accelerator,
        }).value;

        const accepterTransitGatewayRouteTableId = new SsmParameterLookup(
          this.stack,
          'AccepterTransitGatewayRouteTableIdLookup',
          {
            name: this.stack.getSsmPath(SsmResourceType.TGW_ROUTE_TABLE, [
              transitGatewayPeeringItem.accepter.transitGatewayName,
              transitGatewayPeeringItem.accepter.routeTableAssociations,
            ]),
            accountId: props.accountsConfig.getAccountId(transitGatewayPeeringItem.accepter.account),
            parameterRegion: transitGatewayPeeringItem.accepter.region,
            roleName: this.stack.acceleratorResourceNames.roles.tgwPeering,
            kmsKey: this.stack.cloudwatchKey,
            logRetentionInDays: this.stack.logRetention ?? 365,
            acceleratorPrefix: props.prefixes.accelerator,
          },
        ).value;

        let requesterTags: cdk.CfnTag[] | undefined;

        if (transitGatewayPeeringItem.requester.tags) {
          if (transitGatewayPeeringItem.requester.tags.length > 0) {
            requesterTags = transitGatewayPeeringItem.requester.tags;
          }
        }

        const peeringAttachmentId = new TransitGatewayPeering(
          this.stack,
          pascalCase(
            `${transitGatewayPeeringItem.requester.transitGatewayName}-${transitGatewayPeeringItem.accepter.transitGatewayName}-Peering`,
          ),
          {
            requester: {
              accountName: transitGatewayPeeringItem.requester.account,
              transitGatewayName: transitGatewayPeeringItem.requester.transitGatewayName,
              transitGatewayRouteTableId: requesterTransitGatewayRouteTableId,
              tags: requesterTags,
            },
            accepter: {
              accountId: props.accountsConfig.getAccountId(transitGatewayPeeringItem.accepter.account),
              accountAccessRoleName: this.stack.acceleratorResourceNames.roles.tgwPeering,
              region: transitGatewayPeeringItem.accepter.region,
              transitGatewayName: transitGatewayPeeringItem.accepter.transitGatewayName,
              transitGatewayId: accepterTransitGatewayId,
              transitGatewayRouteTableId: accepterTransitGatewayRouteTableId,
              applyTags: transitGatewayPeeringItem.accepter.applyTags ?? false,
              autoAccept: transitGatewayPeeringItem.accepter.autoAccept ?? true,
            },
            customLambdaLogKmsKey: this.stack.cloudwatchKey,
            logRetentionInDays: this.stack.logRetention ?? 365,
          },
        ).peeringAttachmentId;
        tgwPeeringMap.set(transitGatewayPeeringItem.name, peeringAttachmentId);

        // Create SSM parameter for peering attachment ID in requester region
        this.stack.addSsmParameter({
          logicalId: pascalCase(
            `SsmParam${transitGatewayPeeringItem.requester.transitGatewayName}${transitGatewayPeeringItem.name}PeeringAttachmentId`,
          ),
          parameterName: this.stack.getSsmPath(SsmResourceType.TGW_PEERING, [
            transitGatewayPeeringItem.requester.transitGatewayName,
            transitGatewayPeeringItem.name,
          ]),
          stringValue: peeringAttachmentId,
        });

        // Create SSM parameter for peering attachment ID in accepter account/region if different than requester account/region
        if (crossAccountCondition) {
          new PutSsmParameter(
            this.stack,
            pascalCase(
              `CrossAcctSsmParam${transitGatewayPeeringItem.accepter.transitGatewayName}${transitGatewayPeeringItem.name}PeeringAttachmentId`,
            ),
            {
              accountIds: [props.accountsConfig.getAccountId(transitGatewayPeeringItem.accepter.account)],
              region: transitGatewayPeeringItem.accepter.region,
              roleName: this.stack.acceleratorResourceNames.roles.crossAccountSsmParameterShare,
              kmsKey: this.stack.cloudwatchKey,
              logRetentionInDays: this.stack.logRetention,
              parameters: [
                {
                  name: this.stack.getSsmPath(SsmResourceType.TGW_PEERING, [
                    transitGatewayPeeringItem.accepter.transitGatewayName,
                    transitGatewayPeeringItem.name,
                  ]),
                  value: peeringAttachmentId,
                },
              ],
              invokingAccountId: cdk.Stack.of(this.stack).account,
              acceleratorPrefix: props.prefixes.accelerator,
            },
          );
        } else {
          // Create SSM parameter for peering attachment ID in accepter account/region if same as requester account/region
          this.stack.addSsmParameter({
            logicalId: pascalCase(
              `SsmParam${transitGatewayPeeringItem.accepter.transitGatewayName}${transitGatewayPeeringItem.name}PeeringAttachmentId`,
            ),
            parameterName: this.stack.getSsmPath(SsmResourceType.TGW_PEERING, [
              transitGatewayPeeringItem.accepter.transitGatewayName,
              transitGatewayPeeringItem.name,
            ]),
            stringValue: peeringAttachmentId,
          });
        }

        this.stack.addLogs(
          LogLevel.INFO,
          `Completed transit gateway peering for tgw ${transitGatewayPeeringItem.requester.transitGatewayName} with accepter tgw ${transitGatewayPeeringItem.accepter.transitGatewayName}`,
        );
      }
    }
    return tgwPeeringMap;
  }
}

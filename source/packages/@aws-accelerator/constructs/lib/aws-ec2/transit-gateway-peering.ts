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
import { pascalCase } from 'change-case';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface TransitGatewayPeeringProps {
  /**
   * Peering accepter properties
   */
  readonly accepter: {
    /**
     * Accepter transit gateway account id
     */
    readonly accountId: string;
    /**
     * Accepter account access role name. Custom resource will assume this role to approve peering request
     */
    readonly accountAccessRoleName: string;
    /**
     * Accepter transit gateway region name
     */
    readonly region: string;
    /**
     * Accepter transit gateway name
     */
    readonly transitGatewayName: string;
    /**
     * Accepter transit gateway ID
     */
    readonly transitGatewayId: string;
    /**
     * Accepter transit gateway region route table name. Peering attachment will be associated to this route table
     */
    readonly transitGatewayRouteTableId: string;
    /**
     * Peering request auto accept flag.
     */
    readonly autoAccept: boolean;
    /**
     * Peering request apply tags flag. Tags provided are applies to requester attachment only.
     * When this flag is on, similar tags will be applied to peer or accepter attachment also.
     * In peer or accepter attachment existing tags can't be changed, only given tags will be added or modified.
     */
    readonly applyTags: boolean;
  };

  /**
   * Peering requester properties
   */
  readonly requester: {
    /**
     * Requester Account name.
     */
    readonly accountName: string;
    /**
     * Requester Transit Gateway name.
     */
    readonly transitGatewayName: string;
    /**
     * Requester Transit Gateway route table id. Peering attachment will be associated to this route table
     */
    readonly transitGatewayRouteTableId: string;
    /**
     * The tags for the transit gateway peering attachment, applied to requester attachment only.
     */
    readonly tags?: cdk.CfnTag[];
  };
  /**
   * Custom resource lambda log group encryption key
   */
  readonly customLambdaLogKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

/**
 * Class to create Transit Gateway peering configuration
 */
export class TransitGatewayPeering extends Construct {
  public readonly peeringAttachmentId: string;
  constructor(scope: Construct, id: string, props: TransitGatewayPeeringProps) {
    super(scope, id);

    const cfnTransitGatewayPeeringAttachment = new cdk.aws_ec2.CfnTransitGatewayPeeringAttachment(
      this,
      pascalCase(`${props.accepter.transitGatewayName}To${props.requester.transitGatewayName}`),
      {
        peerAccountId: props.accepter.accountId,
        peerRegion: props.accepter.region,
        peerTransitGatewayId: props.accepter.transitGatewayId,
        transitGatewayId: cdk.aws_ssm.StringParameter.valueForStringParameter(
          this,
          `/accelerator/network/transitGateways/${props.requester.transitGatewayName}/id`,
        ),
        tags: props.requester.tags,
      },
    );

    this.peeringAttachmentId = cfnTransitGatewayPeeringAttachment.attrTransitGatewayAttachmentId;

    const RESOURCE_TYPE = 'Custom::TransitGatewayAcceptPeering';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'accept-transit-gateway-peering-attachment/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'AllowAssumeRole',
          Effect: 'Allow',
          Action: ['sts:AssumeRole'],
          Resource: `arn:${cdk.Stack.of(this).partition}:iam::${props.accepter.accountId}:role/${
            props.accepter.accountAccessRoleName
          }`,
        },
        {
          Sid: 'AllowModifyPeeringReferences',
          Effect: 'Allow',
          Action: [
            'ec2:AssociateTransitGatewayRouteTable',
            'ec2:DisassociateTransitGatewayRouteTable',
            'ec2:DescribeTransitGatewayPeeringAttachments',
            'ec2:DescribeTransitGatewayAttachments',
          ],
          Resource: '*',
        },
      ],
    });

    const tags: { Key: string; Value: string }[] = [];
    if (props.requester.tags) {
      if (props.accepter.applyTags ?? false) {
        for (const peeringTag of props.requester.tags) {
          tags.push({ Key: peeringTag.key, Value: peeringTag.value });
        }
      }
    }

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        accepterRegion: props.accepter.region,
        accepterAccountId: props.accepter.accountId,
        accepterTransitGatewayId: props.accepter.transitGatewayId,
        accepterTransitGatewayRouteTableId: props.accepter.transitGatewayRouteTableId,
        accepterRoleArn: `arn:${cdk.Stack.of(this).partition}:iam::${props.accepter.accountId}:role/${
          props.accepter.accountAccessRoleName
        }`,
        requesterAccountId: cdk.Stack.of(this).account,
        requesterRegion: cdk.Stack.of(this).region,
        requesterTransitGatewayRouteTableId: props.requester.transitGatewayRouteTableId,
        requesterTransitGatewayAttachmentId: this.peeringAttachmentId,

        autoAccept: props.accepter.autoAccept,
        peeringTags: tags.length === 0 ? undefined : tags,
        uuid: uuidv4(),
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
        encryptionKey: props.customLambdaLogKmsKey,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
    resource.node.addDependency(logGroup);
  }
}

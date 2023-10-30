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
import * as path from 'path';

export interface IDirectConnectGatewayAssociation extends cdk.IResource {
  /**
   * The Direct Connect Gateway association ID
   */
  readonly associationId: string;
  /**
   * The transit gateway attachment ID of the gateway association
   */
  readonly transitGatewayAttachmentId?: string;
}

export interface DirectConnectGatewayAssociationProps {
  /**
   * The Amazon VPC prefixes to advertise to the Direct Connect gateway
   */
  readonly allowedPrefixes: string[];
  /**
   * The ID of the Direct Connect Gateway
   */
  readonly directConnectGatewayId: string;
  /**
   * The ID of the transit gateway or virtual private gateway
   */
  readonly gatewayId: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * The owner account ID of the Direct Connect Gateway
   */
  readonly directConnectGatewayOwnerAccount?: string;
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
}

export class DirectConnectGatewayAssociation extends cdk.Resource implements IDirectConnectGatewayAssociation {
  public readonly associationId: string;
  public readonly transitGatewayAttachmentId?: string;

  constructor(scope: Construct, id: string, props: DirectConnectGatewayAssociationProps) {
    super(scope, id);

    let codeDirectory: string;
    let RESOURCE_TYPE: string;
    let policyStatements;

    if (props.directConnectGatewayOwnerAccount) {
      codeDirectory = path.join(__dirname, 'gateway-association-proposal/dist');
      RESOURCE_TYPE = 'Custom::DirectConnectGatewayAssociationProposal';
      policyStatements = [
        {
          Sid: 'GatewayAssociationProposalCRUD',
          Effect: 'Allow',
          Action: [
            'directconnect:CreateDirectConnectGatewayAssociationProposal',
            'directconnect:DeleteDirectConnectGatewayAssociationProposal',
          ],
          Resource: '*',
        },
      ];
    } else {
      codeDirectory = path.join(__dirname, 'gateway-association/dist');
      RESOURCE_TYPE = 'Custom::DirectConnectGatewayAssociation';
      policyStatements = [
        {
          Sid: 'DirectConnectGatewayCRUD',
          Effect: 'Allow',
          Action: [
            'directconnect:CreateDirectConnectGatewayAssociation',
            'directconnect:DeleteDirectConnectGatewayAssociation',
            'directconnect:DescribeDirectConnectGatewayAssociations',
            'directconnect:UpdateDirectConnectGatewayAssociation',
            'ec2:DescribeTransitGatewayAttachments',
          ],
          Resource: '*',
        },
        {
          Sid: 'InvokeSelf',
          Effect: 'Allow',
          Action: ['lambda:InvokeFunction'],
          Resource: `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:${props.acceleratorPrefix}-NetworkAss-CustomDirectConnect*`,
        },
      ];
    }

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory,
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements,
      timeout: cdk.Duration.minutes(15),
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        allowedPrefixes: props.allowedPrefixes,
        directConnectGatewayId: props.directConnectGatewayId,
        directConnectGatewayOwnerAccount: props.directConnectGatewayOwnerAccount,
        gatewayId: props.gatewayId,
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

    this.associationId = resource.ref;
    if (!props.directConnectGatewayOwnerAccount) {
      this.transitGatewayAttachmentId = resource.getAttString('TransitGatewayAttachmentId');
    }
  }
}

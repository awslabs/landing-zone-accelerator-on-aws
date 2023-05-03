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

export interface IDirectConnectGateway extends cdk.IResource {
  /**
   * The Direct Connect Gateway ID
   */
  readonly directConnectGatewayId: string;
  /**
   * The friendly name of the Direct Connect Gateway
   */
  readonly directConnectGatewayName: string;
}

export interface DirectConnectGatewayProps {
  /**
   * The friendly name of the Direct Connect Gateway
   */
  readonly gatewayName: string;
  /**
   * The Border Gateway Protocol (BGP) autonomous system number (ASN)
   * of the Direct Connect Gateway
   */
  readonly asn: number;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class DirectConnectGateway extends cdk.Resource implements IDirectConnectGateway {
  public readonly directConnectGatewayId: string;
  public readonly directConnectGatewayName: string;

  constructor(scope: Construct, id: string, props: DirectConnectGatewayProps) {
    super(scope, id);

    this.directConnectGatewayName = props.gatewayName;
    const RESOURCE_TYPE = 'Custom::DirectConnectGateway';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'direct-connect-gateway/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'DirectConnectGatewayCRUD',
          Effect: 'Allow',
          Action: [
            'directconnect:CreateDirectConnectGateway',
            'directconnect:DeleteDirectConnectGateway',
            'directconnect:UpdateDirectConnectGateway',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        gatewayName: props.gatewayName,
        asn: props.asn,
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

    this.directConnectGatewayId = resource.ref;
  }
}

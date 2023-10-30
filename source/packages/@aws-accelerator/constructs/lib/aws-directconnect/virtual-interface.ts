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

export interface IVirtualInterface extends cdk.IResource {
  /**
   * The Direct Connect virtual interface ID
   */
  readonly virtualInterfaceId: string;
  /**
   * The friendly name of the Direct Connect virtual interface
   */
  readonly virtualInterfaceName: string;
}

export interface VirtualInterfaceProps {
  /**
   * The Direct Connect connection ID the virtual interface will be created on
   */
  readonly connectionId: string;
  /**
   * The Border Gateway Protocol (BGP) autonomous system number (ASN)
   * of the customer router
   */
  readonly customerAsn: number;
  /**
   * The name of the virtual interface.
   */
  readonly interfaceName: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
  /**
   * The region of the virtual interface
   */
  readonly region: string;
  /**
   * The type of Direct Connect virtual interface
   */
  readonly type: string;
  /**
   * The virtual local area network (VLAN) tag of the virtual interface
   */
  readonly vlan: number;
  /**
   * The address family to use for this virtual interface
   *
   * Default - `'ipv4'`
   */
  readonly addressFamily?: string;
  /**
   * The Amazon side peer IP address to use for this virtual interface
   *
   */
  readonly amazonAddress?: string;
  /**
   * The customer side peer IP address to use for this virtual interface
   */
  readonly customerAddress?: string;
  /**
   * The Direct connect Gateway ID to attach the virtual interface to.
   */
  readonly directConnectGatewayId?: string;
  /**
   * Enable SiteLink for this virtual interface.
   *
   * Default - `false`
   */
  readonly enableSiteLink?: boolean;
  /**
   * Whether to enable jumbo frames for the virtual interface
   *
   * Default - `false`
   */
  readonly jumboFrames?: boolean;
  /**
   * The owner account of the virtual interface (used for allocations)
   */
  readonly ownerAccount?: string;
  /**
   * An array of tags for the virtual interface
   */
  readonly tags?: cdk.CfnTag[];
  /**
   * Accelerator Prefix
   */
  readonly acceleratorPrefix: string;
}

export class VirtualInterface extends cdk.Resource implements IVirtualInterface {
  public readonly virtualInterfaceId: string;
  public readonly virtualInterfaceName: string;

  constructor(scope: Construct, id: string, props: VirtualInterfaceProps) {
    super(scope, id);

    // Set initial variables
    this.virtualInterfaceName = props.interfaceName;
    let codeDirectory: string;
    let RESOURCE_TYPE: string;
    let policyStatements;

    if (props.ownerAccount) {
      RESOURCE_TYPE = 'Custom::DirectConnectVirtualInterfaceAllocation';
      codeDirectory = path.join(__dirname, 'virtual-interface-allocation/dist');
      policyStatements = [
        {
          Sid: 'DxVirtualInterfaceAllocateCRUD',
          Effect: 'Allow',
          Action: [
            'directconnect:AllocatePrivateVirtualInterface',
            'directconnect:AllocateTransitVirtualInterface',
            'directconnect:DeleteVirtualInterface',
            'directconnect:TagResource',
            'directconnect:UpdateVirtualInterfaceAttributes',
          ],
          Resource: '*',
        },
      ];
    } else {
      RESOURCE_TYPE = 'Custom::DirectConnectVirtualInterface';
      codeDirectory = path.join(__dirname, 'virtual-interface/dist');
      policyStatements = [
        {
          Sid: 'DxVirtualInterfaceCRUD',
          Effect: 'Allow',
          Action: [
            'directconnect:CreatePrivateVirtualInterface',
            'directconnect:CreateTransitVirtualInterface',
            'directconnect:DeleteVirtualInterface',
            'directconnect:DescribeVirtualInterfaces',
            'directconnect:TagResource',
            'directconnect:UntagResource',
            'directconnect:UpdateVirtualInterfaceAttributes',
          ],
          Resource: '*',
        },
        {
          Sid: 'InvokeSelf',
          Effect: 'Allow',
          Action: ['lambda:InvokeFunction'],
          Resource: `arn:${cdk.Aws.PARTITION}:lambda:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:function:${props.acceleratorPrefix}-NetworkPre-CustomDirectConnect*`,
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
        connectionId: props.connectionId,
        customerAsn: props.customerAsn,
        directConnectGatewayId: props.directConnectGatewayId,
        interfaceName: props.interfaceName,
        type: props.type,
        region: props.region,
        vlan: props.vlan,
        addressFamily: props.addressFamily ?? 'ipv4',
        amazonAddress: props.amazonAddress,
        customerAddress: props.customerAddress,
        enableSiteLink: props.enableSiteLink ?? false,
        jumboFrames: props.jumboFrames ?? false,
        ownerAccount: props.ownerAccount,
        tags: props.tags,
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

    this.virtualInterfaceId = resource.ref;
  }
}

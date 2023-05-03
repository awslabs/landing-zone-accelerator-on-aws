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

interface IGetNetworkFirewallEndpoint extends cdk.IResource {
  /**
   * The ID of the endpoint
   */
  readonly endpointId: string;
}

interface GetNetworkFirewallEndpointProps {
  /**
   * The AZ the endpoint is located in
   */
  readonly endpointAz: string;

  /**
   * The ARN of the associated Network Firewall
   */
  readonly firewallArn: string;

  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;

  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;

  /**
   * The region of the Network Firewall
   */
  readonly region: string;
}

export class GetNetworkFirewallEndpoint extends cdk.Resource implements IGetNetworkFirewallEndpoint {
  public readonly endpointId: string;

  constructor(scope: Construct, id: string, props: GetNetworkFirewallEndpointProps) {
    super(scope, id);

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, 'Custom::GetNetworkFirewallEndpoint', {
      codeDirectory: path.join(__dirname, 'get-network-firewall-endpoint/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Effect: 'Allow',
          Action: ['network-firewall:DescribeFirewall'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::GetNetworkFirewallEndpoint',
      serviceToken: provider.serviceToken,
      properties: {
        endpointAz: props.endpointAz,
        firewallArn: props.firewallArn,
        region: props.region,
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

    this.endpointId = resource.ref;
  }
}

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

export interface INetworkLoadBalancerResource extends cdk.IResource {
  /**
   * The ARN of the NetworkLoadBalancer.
   */
  readonly networkLoadBalancerArn: string;
  /**
   * The name of the NetworkLoadBalancer
   */
  readonly networkLoadBalancerName: string;
}

export type NetworkLoadBalancerListener = {
  /**
   * Name for Listener.
   */
  readonly name: string;
  /**
   * ACM ARN of the certificate to be associated with the listener.
   */
  readonly certificate?: string;
  /**
   * Port where the traffic is directed to.
   */
  readonly port?: number;
  /**
   * Protocol used for the traffic.
   */
  readonly protocol?: string;
  /**
   * Application-Layer Protocol Negotiation (ALPN) policy for TLS encrypted traffic
   */
  readonly alpnPolicy?: string;
  /**
   * SSL policy for TLS encrypted traffic
   */
  readonly sslPolicy?: string;
  /**
   * Target Group to direct the traffic to.
   */
  readonly targetGroup: string;
};
export interface NetworkLoadBalancerProps {
  /**
   * Name for Network Load Balancer.
   */
  readonly name: string;
  /**
   * Network Load Balancer Subnets (required).
   */
  readonly subnets: string[];
  /**
   * Network Load Balancer scheme.
   */
  readonly scheme?: string;
  /**
   * Network Load Balancer deletionProtection
   */
  readonly deletionProtection?: boolean;
  /**
   * Cross Zone load balancing for Network Load Balancer.
   */
  readonly crossZoneLoadBalancing?: boolean;
  /**
   * Listeners for Network Load Balancer.
   */
  readonly listeners?: NetworkLoadBalancerListener[];
  /**
   * Access logs s3 bucket name.
   */
  readonly accessLogsBucket: string;
  /**
   * VPC Name (required).
   */
  readonly vpcName: string;
  /**
   *  App Name (required).
   */
  readonly appName: string;
}

export class NetworkLoadBalancer extends cdk.Resource implements INetworkLoadBalancerResource {
  public readonly networkLoadBalancerArn: string;
  public readonly networkLoadBalancerName: string;
  constructor(scope: Construct, id: string, props: NetworkLoadBalancerProps) {
    super(scope, id);
    const resource = new cdk.aws_elasticloadbalancingv2.CfnLoadBalancer(this, 'Resource', {
      type: 'network',
      subnets: props.subnets,
      name: props.name,
      scheme: props.scheme,
      loadBalancerAttributes: [
        {
          key: 'deletion_protection.enabled',
          value: props.deletionProtection ? props.deletionProtection.toString() : 'false',
        },
        {
          key: 'load_balancing.cross_zone.enabled',
          value: props.crossZoneLoadBalancing ? props.crossZoneLoadBalancing.toString() : 'true',
        },
        {
          key: 'access_logs.s3.enabled',
          value: 'true',
        },
        {
          key: 'access_logs.s3.bucket',
          value: props.accessLogsBucket,
        },
        {
          key: 'access_logs.s3.prefix',
          value: `${cdk.Stack.of(this).account}/${cdk.Stack.of(this).region}/${props.name}`,
        },
      ],
    });

    // Add Name tag
    cdk.Tags.of(this).add('Name', props.name);

    // Set initial properties
    this.networkLoadBalancerArn = resource.ref;
    this.networkLoadBalancerName = resource.attrLoadBalancerName;

    for (const listener of props.listeners ?? []) {
      const targetGroupArn = this.getTargetGroupArn(listener.targetGroup, props.vpcName, props.appName);
      new cdk.aws_elasticloadbalancingv2.CfnListener(this, pascalCase(`Listener${listener.name}`), {
        defaultActions: [
          {
            type: 'forward',
            forwardConfig: {
              targetGroups: [
                {
                  targetGroupArn: targetGroupArn,
                },
              ],
            },
            targetGroupArn: targetGroupArn,
          },
        ],
        loadBalancerArn: resource.ref,
        alpnPolicy: [listener.alpnPolicy!],
        certificates: [{ certificateArn: listener.certificate! }],
        port: listener.port!,
        protocol: listener.protocol!,
        sslPolicy: listener.sslPolicy!,
      });
    }
  }
  private getTargetGroupArn(targetGroup: string, vpcName: string, appName: string): string {
    if (targetGroup.match('\\${ACCEL_LOOKUP::TargetGroup:([a-zA-Z0-9-/:]*)}')) {
      const targetGroupMatch = targetGroup.match('\\${ACCEL_LOOKUP::TargetGroup:([a-zA-Z0-9-/:]*)}');
      const targetGroupValue = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/application/targetGroup/${appName}/${vpcName}/${targetGroupMatch![1]}/arn`,
      );
      return targetGroupValue;
    } else if (targetGroup.match('\\arn:*')) {
      return targetGroup;
    } else {
      return cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        `/accelerator/application/targetGroup/${appName}/${vpcName}/${targetGroup}/arn`,
      );
    }
  }
}

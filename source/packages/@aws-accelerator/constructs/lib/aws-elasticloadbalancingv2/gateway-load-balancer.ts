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

export interface IGatewayLoadBalancer extends cdk.IResource {
  /**
   * The ID of the VPC endpoint service associated with this Gateway Load Balancer.
   */
  readonly endpointServiceId: string;
  /**
   * The ARN of the Gateway Load Balancer.
   */
  readonly loadBalancerArn: string;
  /**
   * The name of the Gateway Load Balancer
   */
  readonly loadBalancerName: string;
}

export interface GatewayLoadBalancerProps {
  /**
   * The name of the Gateway Load Balancer.
   */
  readonly name: string;
  /**
   * An array of account principals allowed to create endpoints for the service.
   */
  readonly allowedPrincipals: string[];
  /**
   * The subnets the Gateway Load Balancer will be deployed to.
   */
  readonly subnets: string[];
  /**
   * Whether to enable cross-zone load balancing.
   *
   * @default 'true'
   */
  readonly crossZoneLoadBalancing?: boolean;
  /**
   * Whether to enable deletion protection.
   *
   * @default 'false'
   */
  readonly deletionProtection?: boolean;
  /**
   * An array of CloudFormation tags to apply to the Gateway Load Balancer.
   */
  readonly tags?: cdk.CfnTag[];
}

export class GatewayLoadBalancer extends cdk.Resource implements IGatewayLoadBalancer {
  public readonly endpointServiceId: string;
  public readonly loadBalancerArn: string;
  public readonly loadBalancerName: string;
  private allowedPrincipals: string[];
  private endpointService: cdk.aws_ec2.CfnVPCEndpointService;

  constructor(scope: Construct, id: string, props: GatewayLoadBalancerProps) {
    super(scope, id);

    const resource = new cdk.aws_elasticloadbalancingv2.CfnLoadBalancer(this, 'Resource', {
      loadBalancerAttributes: [
        {
          key: 'deletion_protection.enabled',
          value: props.deletionProtection ? props.deletionProtection.toString() : 'false',
        },
        {
          key: 'load_balancing.cross_zone.enabled',
          value: props.crossZoneLoadBalancing ? props.crossZoneLoadBalancing.toString() : 'true',
        },
      ],
      subnets: props.subnets,
      tags: props.tags,
      type: 'gateway',
    });
    // Add Name tag
    cdk.Tags.of(this).add('Name', props.name);

    // Set initial properties
    this.loadBalancerArn = resource.ref;
    this.loadBalancerName = resource.attrLoadBalancerName;

    // Create endpoint service
    this.endpointService = this.createEndpointService();
    this.allowedPrincipals = props.allowedPrincipals;
    this.endpointServiceId = this.endpointService.ref;
    if (this.allowedPrincipals.length > 0) {
      this.createEndpointServicePermissions();
    }
  }

  /**
   * Create endpoint service for the load balancer.
   */
  private createEndpointService(): cdk.aws_ec2.CfnVPCEndpointService {
    return new cdk.aws_ec2.CfnVPCEndpointService(this, 'EndpointService', {
      acceptanceRequired: false,
      gatewayLoadBalancerArns: [this.loadBalancerArn],
    });
  }

  /**
   * Create endpoint service permissions.
   */
  private createEndpointServicePermissions(): void {
    const principals = this.allowedPrincipals.map(item => {
      return `arn:${cdk.Aws.PARTITION}:iam::${item}:root`;
    });

    new cdk.aws_ec2.CfnVPCEndpointServicePermissions(this, 'EndpointServicePermissions', {
      serviceId: this.endpointServiceId,
      allowedPrincipals: principals,
    });
  }
}

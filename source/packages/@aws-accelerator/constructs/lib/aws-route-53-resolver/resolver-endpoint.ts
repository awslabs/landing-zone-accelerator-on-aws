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

export interface IResolverEndpoint extends cdk.IResource {
  /**
   * The Amazon Resource Name (ARN) of the resolver endpoint.
   */
  readonly endpointArn: string;

  /**
   * The ID of the resolver endpoint.
   */
  readonly endpointId: string;

  /**
   * The name that you assigned to the resolver endpoint when you created the endpoint.
   */
  readonly name: string;
}

export interface ResolverEndpointProps {
  /**
   * Indicates whether the Resolver endpoint allows inbound or outbound DNS queries.
   */
  readonly direction: string;

  /**
   * The subnets and IP addresses in your VPC that DNS queries originate from (for outbound endpoints)
   * or that you forward DNS queries to (for inbound endpoints).
   */
  readonly ipAddresses: string[];

  /**
   * A friendly name that lets you easily find a configuration in the Resolver dashboard in the Route 53 console.
   */
  readonly name: string;

  /**
   * The ID of one or more security groups that control access to this endpoint.
   */
  readonly securityGroupIds: string[];

  /**
   * A list of CloudFormation tags.
   */
  readonly tags?: cdk.CfnTag[];
}

export class ResolverEndpoint extends cdk.Resource implements IResolverEndpoint {
  public readonly endpointArn: string;
  public readonly endpointId: string;
  public readonly name: string;
  private ipAddresses: cdk.aws_route53resolver.CfnResolverEndpoint.IpAddressRequestProperty[];

  constructor(scope: Construct, id: string, props: ResolverEndpointProps) {
    super(scope, id);

    this.name = props.name;
    this.ipAddresses = props.ipAddresses.map(item => {
      return { subnetId: item };
    });

    const resource = new cdk.aws_route53resolver.CfnResolverEndpoint(this, 'Resource', {
      direction: props.direction,
      ipAddresses: this.ipAddresses,
      name: props.name,
      securityGroupIds: props.securityGroupIds,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', this.name);

    this.endpointArn = resource.attrArn;
    this.endpointId = resource.attrResolverEndpointId;
  }
}

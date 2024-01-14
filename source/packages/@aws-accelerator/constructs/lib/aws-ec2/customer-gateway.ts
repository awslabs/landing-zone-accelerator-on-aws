/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { LzaCustomResource } from '../lza-custom-resource';

export interface CustomerGatewayProps {
  /**
   * Name of the Customer Gateway
   */
  readonly name: string;
  /**
   * Gateway IP address for customer gateway
   */
  readonly ipAddress: string;
  /**
   * Gateway ASN for customer gateway
   */
  readonly bgpAsn: number;
  /**
   * Custom resource handler for cross-account customer gateways
   */
  readonly customResourceHandler?: cdk.aws_lambda.IFunction;
  /**
   * Owning account ID for cross-account customer gateways
   */
  readonly owningAccountId?: string;
  /**
   * Owning region for cross-account customer gateways
   */
  readonly owningRegion?: string;
  /**
   * Role name for cross-account customer gateways
   */
  readonly roleName?: string;
  /**
   * Tags for the customer gateway
   */
  readonly tags?: cdk.CfnTag[];
}

interface ICustomerGateway extends cdk.IResource {
  /**
   * The identifier of the customer gateway
   *
   * @attribute
   */
  readonly customerGatewayId: string;
  /**
   * The BGP ASN of the customer gateway
   */
  readonly bgpAsn: number;
  /**
   * The IP address of the customer gateway
   */
  readonly ipAddress: string;
}

/**
 * Class for Customer Gateway
 */
export class CustomerGateway extends cdk.Resource implements ICustomerGateway {
  public readonly bgpAsn: number;
  public readonly customerGatewayId: string;
  public readonly ipAddress: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: CustomerGatewayProps) {
    super(scope, id);
    this.name = props.name;
    this.bgpAsn = props.bgpAsn;
    this.ipAddress = props.ipAddress;

    let resource: cdk.aws_ec2.CfnCustomerGateway | cdk.CustomResource;

    if (!props.customResourceHandler) {
      resource = new cdk.aws_ec2.CfnCustomerGateway(this, 'CustomerGateway', {
        bgpAsn: props.bgpAsn,
        ipAddress: props.ipAddress,
        type: 'ipsec.1',
        tags: props.tags,
      });
      cdk.Tags.of(this).add('Name', this.name);
    } else {
      // Convert tags to EC2 API format
      const tags =
        props.tags?.map(tag => {
          return { Key: tag.key, Value: tag.value };
        }) ?? [];
      tags.push({ Key: 'Name', Value: props.name });

      resource = new LzaCustomResource(this, 'CustomResource', {
        resource: {
          name: 'CustomResource',
          parentId: id,
          properties: [
            {
              bgpAsn: props.bgpAsn,
              ipAddress: props.ipAddress,
              owningAccountId: props.owningAccountId,
              owningRegion: props.owningRegion,
              roleName: props.roleName,
              tags,
            },
          ],
          onEventHandler: props.customResourceHandler,
        },
      }).resource;
    }
    this.customerGatewayId = resource.ref;
  }
}

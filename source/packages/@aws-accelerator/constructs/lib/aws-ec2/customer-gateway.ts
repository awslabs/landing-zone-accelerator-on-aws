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

export interface CfnCustomerGatewayProps {
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
   * The identifier of the customer gateway
   *
   * @attribute
   */
  readonly customerGatewayName: string;
}

/**
 * Class for Customer Gateway
 */
export class CustomerGateway extends cdk.Resource implements ICustomerGateway {
  public readonly customerGatewayId: string;
  public readonly customerGatewayName: string;
  public readonly name: string;

  constructor(scope: Construct, id: string, props: CfnCustomerGatewayProps) {
    super(scope, id);
    this.name = props.name;

    const resource = new cdk.aws_ec2.CfnCustomerGateway(this, 'CustomerGateway', {
      bgpAsn: props.bgpAsn,
      ipAddress: props.ipAddress,
      type: 'ipsec.1',
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', this.name);

    this.customerGatewayId = resource.ref;

    this.customerGatewayName = props.name;
  }
}

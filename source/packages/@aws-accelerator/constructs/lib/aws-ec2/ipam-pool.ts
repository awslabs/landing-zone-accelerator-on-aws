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

export interface IIpamPool extends cdk.IResource {
  /**
   * The ARN of the IPAM pool.
   *
   * @attribute
   */
  readonly ipamPoolArn: string;

  /**
   * The identifier of the IPAM pool.
   *
   * @attribute
   */
  readonly ipamPoolId: string;

  /**
   * The name of the IPAM pool.
   */
  readonly ipamPoolName: string;
}

type IpVersionEnum = 'ipv4' | 'ipv6';

export interface IpamPoolProps {
  /**
   * The address family of the pool.
   */
  readonly addressFamily: IpVersionEnum;

  /**
   * The ID of the scope in which you would like to create the IPAM pool.
   */
  readonly ipamScopeId: string;

  /**
   * The name of the IPAM pool.
   */
  readonly name: string;

  /**
   * The default netmask length for allocations added to this pool.
   */
  readonly allocationDefaultNetmaskLength?: number;

  /**
   * The maximum netmask length possible for CIDR allocations in this IPAM pool to be compliant.
   */
  readonly allocationMaxNetmaskLength?: number;

  /**
   * The minimum netmask length required for CIDR allocations in this IPAM pool to be compliant.
   */
  readonly allocationMinNetmaskLength?: number;

  /**
   * Tags that are required for resources that use CIDRs from this IPAM pool.
   */
  readonly allocationResourceTags?: cdk.CfnTag[];

  /**
   * If selected, IPAM will continuously look for resources within the CIDR range of this pool and automatically
   * import them as allocations into your IPAM.
   */
  readonly autoImport?: boolean;

  /**
   * The description of the IPAM pool.
   */
  readonly description?: string;

  /**
   * The locale of the IPAM pool.
   */
  readonly locale?: string;

  /**
   * Information about the CIDRs provisioned to an IPAM pool.
   */
  readonly provisionedCidrs?: string[];

  /**
   * Determines if a pool is publicly advertisable.
   */
  readonly publiclyAdvertisable?: boolean;

  /**
   * The ID of the source IPAM pool.
   */
  readonly sourceIpamPoolId?: string;

  /**
   * The key/value combination of a tag assigned to the resource.
   */
  readonly tags?: cdk.CfnTag[];
}

export class IpamPool extends cdk.Resource implements IIpamPool {
  public readonly ipamPoolArn: string;
  public readonly ipamPoolId: string;
  public readonly ipamPoolName: string;
  private cidrs?: cdk.aws_ec2.CfnIPAMPool.ProvisionedCidrProperty[];

  constructor(scope: Construct, id: string, props: IpamPoolProps) {
    super(scope, id);

    this.ipamPoolName = props.name;

    // Map provisioned cidrs values
    this.cidrs = props.provisionedCidrs?.map(prefix => {
      return { cidr: prefix };
    });

    const resource = new cdk.aws_ec2.CfnIPAMPool(this, 'Resource', {
      addressFamily: props.addressFamily,
      ipamScopeId: props.ipamScopeId,
      allocationDefaultNetmaskLength: props.allocationDefaultNetmaskLength,
      allocationMaxNetmaskLength: props.allocationMaxNetmaskLength,
      allocationMinNetmaskLength: props.allocationMinNetmaskLength,
      allocationResourceTags: props.allocationResourceTags,
      autoImport: props.autoImport,
      description: props.description,
      locale: props.locale,
      provisionedCidrs: this.cidrs,
      publiclyAdvertisable: props.publiclyAdvertisable,
      sourceIpamPoolId: props.sourceIpamPoolId,
      tags: props.tags,
    });

    cdk.Tags.of(this).add('Name', this.ipamPoolName);

    this.ipamPoolArn = resource.attrArn;
    this.ipamPoolId = resource.ref;
  }
}

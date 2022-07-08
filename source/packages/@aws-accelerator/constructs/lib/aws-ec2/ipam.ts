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

export interface IIpam extends cdk.IResource {
  /**
   * The ARN of the IPAM.
   *
   * @attribute
   */
  readonly ipamArn: string;

  /**
   * The identifier of the IPAM.
   *
   * @attribute
   */
  readonly ipamId: string;

  /**
   * The name of the IPAM.
   */
  readonly ipamName: string;

  /**
   * The ID of the IPAM's default private scope.
   *
   * @attribute
   */
  readonly privateDefaultScopeId: string;

  /**
   * The ID of the IPAM's default public scope.
   *
   * @attribute
   */
  readonly publicDefaultScopeId: string;
}

export interface IpamProps {
  /**
   * The name of the IPAM.
   */
  readonly name: string;

  /**
   * The description for the IPAM.
   */
  readonly description?: string;

  /**
   * The operating Regions for an IPAM.
   */
  readonly operatingRegions?: string[];

  /**
   * The key/value combination of a tag assigned to the resource.
   */
  readonly tags?: cdk.CfnTag[];
}

export class Ipam extends cdk.Resource implements IIpam {
  public readonly ipamArn: string;
  public readonly ipamId: string;
  public readonly ipamName: string;
  public readonly privateDefaultScopeId: string;
  public readonly publicDefaultScopeId: string;
  private regions?: cdk.aws_ec2.CfnIPAM.IpamOperatingRegionProperty[];

  constructor(scope: Construct, id: string, props: IpamProps) {
    super(scope, id);

    this.ipamName = props.name;

    // Map operating region values
    this.regions = props.operatingRegions?.map(region => {
      return { regionName: region };
    });

    const resource = new cdk.aws_ec2.CfnIPAM(this, 'Resource', {
      description: props.description,
      operatingRegions: this.regions,
      tags: props.tags,
    });

    cdk.Tags.of(this).add('Name', this.ipamName);

    this.ipamArn = resource.attrArn;
    this.ipamId = resource.ref;
    this.privateDefaultScopeId = resource.attrPrivateDefaultScopeId;
    this.publicDefaultScopeId = resource.attrPublicDefaultScopeId;
  }
}

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

export interface IIpamScope extends cdk.IResource {
  /**
   * The ARN of the IPAM scope.
   *
   * @attribute
   */
  readonly ipamScopeArn: string;

  /**
   * The identifier of the IPAM scope.
   *
   * @attribute
   */
  readonly ipamScopeId: string;

  /**
   * The name of the IPAM scope.
   */
  readonly ipamScopeName: string;
}

export interface IpamScopeProps {
  /**
   * The ID of the IPAM for which you're creating this scope.
   */
  readonly ipamId: string;

  /**
   * The name of the IPAM scope.
   */
  readonly name: string;

  /**
   * The description of the IPAM scope.
   */
  readonly description?: string;

  /**
   * Tags for the IPAM scope.
   */
  readonly tags?: cdk.CfnTag[];
}

export class IpamScope extends cdk.Resource implements IIpamScope {
  public readonly ipamScopeArn: string;
  public readonly ipamScopeId: string;
  public readonly ipamScopeName: string;

  constructor(scope: Construct, id: string, props: IpamScopeProps) {
    super(scope, id);

    this.ipamScopeName = props.name;

    const resource = new cdk.aws_ec2.CfnIPAMScope(this, 'Resource', {
      ipamId: props.ipamId,
      description: props.description,
      tags: props.tags,
    });

    cdk.Tags.of(this).add('Name', this.ipamScopeName);

    this.ipamScopeArn = resource.attrArn;
    this.ipamScopeId = resource.ref;
  }
}

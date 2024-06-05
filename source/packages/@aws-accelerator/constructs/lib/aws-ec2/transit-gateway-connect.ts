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

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as cdk from 'aws-cdk-lib';
import { pascalCase } from 'change-case';
import { Construct } from 'constructs';

export interface TransitGatewayConnectProps {
  /**
   * The name of the transit gateway connect. Will be assigned to the Name tag
   */
  readonly name: string;
  /**
   * The options for the Transit Gateway Connect
   */
  readonly options: ec2.CfnTransitGatewayConnect.TransitGatewayConnectOptionsProperty;

  /**
   * The ID of the transit gateway attachment.
   */
  readonly transitGatewayAttachmentId: string;
  /**
   * The tags that will be attached to the transit gateway route table.
   */
  readonly tags?: cdk.CfnTag[];
}

/**
 * Creates a Transit Gateway Route Table
 */
export class TransitGatewayConnect extends Construct {
  constructor(scope: Construct, id: string, props: TransitGatewayConnectProps) {
    super(scope, id);

    new ec2.CfnTransitGatewayConnect(this, pascalCase(`${props.name}TransitGatewayConnect`), {
      transportTransitGatewayAttachmentId: props.transitGatewayAttachmentId,
      options: props.options,
      tags: props.tags,
    });
    cdk.Tags.of(this).add('Name', props.name);
  }
}

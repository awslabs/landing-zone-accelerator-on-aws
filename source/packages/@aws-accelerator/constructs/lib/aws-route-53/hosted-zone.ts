/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { IVpc } from '../aws-ec2/vpc';

export interface IHostedZone extends cdk.IResource {
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly vpc: IVpc;
}

export interface HostedZoneProps {
  readonly hostedZoneName: string;
  readonly vpc: IVpc;
}

export class HostedZone extends cdk.Resource implements IHostedZone {
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props: HostedZoneProps) {
    super(scope, id);

    this.vpc = props.vpc;
    this.hostedZoneName = props.hostedZoneName;

    const resource = new cdk.aws_route53.CfnHostedZone(this, 'Resource', {
      name: props.hostedZoneName,
      vpcs: [
        {
          vpcId: props.vpc.vpcId,
          vpcRegion: cdk.Stack.of(this).region,
        },
      ],
    });

    this.hostedZoneId = resource.ref;
  }

  static getHostedZoneNameForService(service: string, region: string): string {
    let hostedZoneName = `${service}.${region}.amazonaws.com`;
    if (service in ['notebook', 'studio']) {
      hostedZoneName = `${service}.${region}.sagemaker.aws`;
    }
    if (service in ['s3-global.accesspoint']) {
      hostedZoneName = `${service}.aws.com`;
    }
    return hostedZoneName;
  }
}

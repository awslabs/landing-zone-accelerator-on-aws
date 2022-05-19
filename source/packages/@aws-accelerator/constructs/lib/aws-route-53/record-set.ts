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

import { IHostedZone } from './hosted-zone';

export interface IRecordSet extends cdk.IResource {
  readonly recordSetId: string;
}

export interface RecordSetProps {
  readonly type: string;
  readonly name: string;

  readonly hostedZone: IHostedZone;
  readonly dnsName?: string;
  readonly hostedZoneId?: string;
}

export class RecordSet extends cdk.Resource implements IRecordSet {
  readonly recordSetId: string;

  constructor(scope: Construct, id: string, props: RecordSetProps) {
    super(scope, id);

    const resource = new cdk.aws_route53.CfnRecordSet(this, 'Resource', {
      type: props.type,
      name: props.name,
      hostedZoneId: props.hostedZone.hostedZoneId,
      aliasTarget: {
        dnsName: props.dnsName ?? '',
        hostedZoneId: props.hostedZoneId ?? '',
      },
    });

    this.recordSetId = resource.ref;
  }

  static getHostedZoneNameFromService(service: string, region: string): string {
    let hostedZoneName = `${service}.${region}.amazonaws.com`;
    const sagemakerArray = ['notebook', 'studio'];
    if (sagemakerArray.includes(service)) {
      hostedZoneName = `${service}.${region}.sagemaker.aws`;
    }
    if (service === 's3-global.accesspoint') {
      hostedZoneName = `${service}.aws.com`;
    }
    return hostedZoneName;
  }
}

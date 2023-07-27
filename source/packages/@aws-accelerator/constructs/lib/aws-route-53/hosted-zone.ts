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

export interface IHostedZone extends cdk.IResource {
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly vpcId: string;
}

export interface HostedZoneProps {
  readonly hostedZoneName: string;
  readonly vpcId: string;
}

export class HostedZone extends cdk.Resource implements IHostedZone {
  readonly hostedZoneId: string;
  readonly hostedZoneName: string;
  readonly vpcId: string;

  constructor(scope: Construct, id: string, props: HostedZoneProps) {
    super(scope, id);

    this.vpcId = props.vpcId;
    this.hostedZoneName = props.hostedZoneName;

    const resource = new cdk.aws_route53.CfnHostedZone(this, 'Resource', {
      name: props.hostedZoneName,
      vpcs: [
        {
          vpcId: this.vpcId,
          vpcRegion: cdk.Stack.of(this).region,
        },
      ],
    });

    this.hostedZoneId = resource.ref;
  }

  static getHostedZoneNameForService(service: string, region: string): string {
    let hostedZoneName = `${service}.${region}.amazonaws.com`;

    if (service.indexOf('.') > 0 && !HostedZone.ignoreServiceEndpoint(service)) {
      const tmp = service.split('.').reverse().join('.');
      hostedZoneName = `${tmp}.${region}.amazonaws.com.`;
    }
    switch (service) {
      case 'appstream.api':
        hostedZoneName = `appstream2.${region}.amazonaws.com`;
        break;
      case 'deviceadvisor.iot':
        hostedZoneName = `deviceadvisor.iot.${region}.amazonaws.com`;
        break;
      case 'pinpoint-sms-voice-v2':
        hostedZoneName = `sms-voice.${region}.amazonaws.com`;
        break;
      case 'rum-dataplane':
        hostedZoneName = `dataplane.rum.${region}.amazonaws.com`;
        break;
      case 's3-global.accesspoint':
        hostedZoneName = `${service}.amazonaws.com`;
        break;
      case 'ecs-agent':
        hostedZoneName = `ecs-a.${region}.amazonaws.com`;
        break;
      case 'ecs-telemetry':
        hostedZoneName = `ecs-t.${region}.amazonaws.com`;
        break;
      case 'codeartifact.api':
        hostedZoneName = `codeartifact.${region}.amazonaws.com`;
        break;
      case 'codeartifact.repositories':
        hostedZoneName = `d.codeartifact.${region}.amazonaws.com`;
        break;
      case 'notebook':
        hostedZoneName = `${service}.${region}.sagemaker.aws`;
        break;
      case 'studio':
        hostedZoneName = `${service}.${region}.sagemaker.aws`;
        break;
    }
    return hostedZoneName;
  }

  static ignoreServiceEndpoint(service: string): boolean {
    const ignoreServicesArray = [
      'appstream.api',
      'deviceadvisor.iot',
      'pinpoint-sms-voice-v2',
      'rum-dataplane',
      's3-global.accesspoint',
      'ecs-agent',
      'ecs-telemetry',
      'notebook',
      'studio',
      'codeartifact.api',
      'codeartifact.repositories',
    ];
    return ignoreServicesArray.includes(service);
  }
}

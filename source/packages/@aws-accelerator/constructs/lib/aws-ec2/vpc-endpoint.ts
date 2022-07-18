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

import { ISecurityGroup } from './vpc';

export interface IVpcEndpoint extends cdk.IResource {
  readonly vpcEndpointId: string;
  readonly service: string;
  readonly vpcId: string;
  readonly dnsName?: string;
  readonly hostedZoneId?: string;
}

export interface VpcEndpointProps {
  readonly vpcEndpointType: cdk.aws_ec2.VpcEndpointType;
  readonly service: string;
  readonly vpcId: string;
  readonly subnets?: string[];
  readonly securityGroups?: ISecurityGroup[];
  readonly privateDnsEnabled?: boolean;
  readonly policyDocument?: cdk.aws_iam.PolicyDocument;
  readonly routeTables?: string[];
}

export class VpcEndpoint extends cdk.Resource implements IVpcEndpoint {
  public readonly vpcEndpointId: string;
  public readonly vpcId: string;
  public readonly service: string;
  public readonly dnsName?: string;
  public readonly hostedZoneId?: string;

  constructor(scope: Construct, id: string, props: VpcEndpointProps) {
    super(scope, id);

    this.service = props.service;
    this.vpcId = props.vpcId;

    // Add constant for sagemaker conditionals
    const sagemakerArray = ['notebook', 'studio'];

    if (props.vpcEndpointType === cdk.aws_ec2.VpcEndpointType.INTERFACE) {
      let serviceName = `com.amazonaws.${cdk.Stack.of(this).region}.${props.service}`;
      if (sagemakerArray.includes(this.service)) {
        serviceName = `aws.sagemaker.${cdk.Stack.of(this).region}.${props.service}`;
      }
      if (this.service === 's3-global.accesspoint') {
        serviceName = `com.aws.${props.service}`;
      }

      const resource = new cdk.aws_ec2.CfnVPCEndpoint(this, 'Resource', {
        serviceName,
        vpcEndpointType: props.vpcEndpointType,
        vpcId: this.vpcId,
        subnetIds: props.subnets,
        securityGroupIds: props.securityGroups?.map(item => item.securityGroupId),
        privateDnsEnabled: props.privateDnsEnabled,
        policyDocument: props.policyDocument,
      });
      this.vpcEndpointId = resource.ref;

      let dnsEntriesIndex = 0;
      if (sagemakerArray.includes(this.service)) {
        dnsEntriesIndex = 4;
      }

      this.dnsName = cdk.Fn.select(1, cdk.Fn.split(':', cdk.Fn.select(dnsEntriesIndex, resource.attrDnsEntries)));
      this.hostedZoneId = cdk.Fn.select(0, cdk.Fn.split(':', cdk.Fn.select(dnsEntriesIndex, resource.attrDnsEntries)));
      return;
    }

    if (props.vpcEndpointType === cdk.aws_ec2.VpcEndpointType.GATEWAY) {
      const resource = new cdk.aws_ec2.CfnVPCEndpoint(this, 'Resource', {
        serviceName: new cdk.aws_ec2.GatewayVpcEndpointAwsService(props.service).name,
        vpcId: this.vpcId,
        routeTableIds: props.routeTables,
        policyDocument: props.policyDocument,
      });
      this.vpcEndpointId = resource.ref;
      return;
    }

    throw new Error('Invalid vpcEndpointType specified');
  }
}

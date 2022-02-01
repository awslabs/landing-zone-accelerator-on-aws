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
import { IVpc, ISubnet, ISecurityGroup } from './vpc';
import { IRouteTable } from './route-table';

export interface IVpcEndpoint extends cdk.IResource {
  readonly vpcEndpointId: string;
  readonly service: string;
  readonly vpc: IVpc;
  readonly dnsName?: string;
  readonly hostedZoneId?: string;
}

export interface VpcEndpointProps {
  readonly vpc: IVpc;
  readonly vpcEndpointType: cdk.aws_ec2.VpcEndpointType;
  readonly service: string;
  readonly subnets?: ISubnet[];
  readonly securityGroups?: ISecurityGroup[];
  readonly privateDnsEnabled?: boolean;
  readonly policyDocument?: cdk.aws_iam.PolicyDocument;
  readonly routeTables?: IRouteTable[];
}

export class VpcEndpoint extends cdk.Resource implements IVpcEndpoint {
  public readonly vpcEndpointId: string;

  public readonly vpc: IVpc;
  public readonly service: string;
  public readonly dnsName?: string;
  public readonly hostedZoneId?: string;

  constructor(scope: Construct, id: string, props: VpcEndpointProps) {
    super(scope, id);

    this.vpc = props.vpc;
    this.service = props.service;

    if (props.vpcEndpointType === cdk.aws_ec2.VpcEndpointType.INTERFACE) {
      let serviceName = `com.amazonaws.${cdk.Stack.of(this).region}.${props.service}`;
      if (props.service in ['notebook', 'studio']) {
        serviceName = `aws.sagemaker.${cdk.Stack.of(this).region}.${props.service}`;
      }
      if (props.service in ['s3-global.accesspoint']) {
        serviceName = `com.aws.${props.service}`;
      }

      const resource = new cdk.aws_ec2.CfnVPCEndpoint(this, 'Resource', {
        serviceName,
        vpcEndpointType: props.vpcEndpointType,
        vpcId: props.vpc.vpcId,
        subnetIds: props.subnets?.map(item => item.subnetId),
        securityGroupIds: props.securityGroups?.map(item => item.securityGroupId),
        privateDnsEnabled: props.privateDnsEnabled,
        policyDocument: props.policyDocument,
      });
      this.vpcEndpointId = resource.ref;

      let dnsEntriesIndex = 0;
      if (props.service in ['notebook', 'studio']) {
        // TODO Top 3 DNS names are not valid so selecting the 4th DNS
        // need to find a better way to identify the valid DNS for PHZ
        dnsEntriesIndex = 4;
      }

      this.dnsName = cdk.Fn.select(1, cdk.Fn.split(':', cdk.Fn.select(dnsEntriesIndex, resource.attrDnsEntries)));
      this.hostedZoneId = cdk.Fn.select(0, cdk.Fn.split(':', cdk.Fn.select(dnsEntriesIndex, resource.attrDnsEntries)));
      return;
    }

    if (props.vpcEndpointType === cdk.aws_ec2.VpcEndpointType.GATEWAY) {
      const resource = new cdk.aws_ec2.CfnVPCEndpoint(this, 'Resource', {
        serviceName: new cdk.aws_ec2.GatewayVpcEndpointAwsService(props.service).name,
        vpcId: props.vpc.vpcId,
        routeTableIds: props.routeTables?.map(item => item.routeTableId),
        policyDocument: props.policyDocument,
      });
      this.vpcEndpointId = resource.ref;
      return;
    }

    throw new Error('Invalid vpcEndpointType specified');
  }
}

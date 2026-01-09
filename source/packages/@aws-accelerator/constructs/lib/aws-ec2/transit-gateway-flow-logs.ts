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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface TransitGatewayFlowLogsProps {
  readonly transitGatewayId: string;
  readonly maxAggregationInterval: number;
  readonly logFormat?: string;
  readonly logDestinationType: string;
  readonly logDestination?: string;
  readonly deliverLogsPermissionArn?: string;
  readonly bucketArn?: string;
  readonly encryptionKey?: cdk.aws_kms.IKey;
  readonly logRetentionInDays?: number;
  readonly acceleratorPrefix: string;
  readonly tags?: cdk.CfnTag[];
}

export class TransitGatewayFlowLogs extends Construct {
  public readonly flowLogId: string;

  constructor(scope: Construct, id: string, props: TransitGatewayFlowLogsProps) {
    super(scope, id);

    const flowLog = new cdk.aws_ec2.CfnFlowLog(this, 'Resource', {
      resourceType: 'TransitGateway',
      resourceId: props.transitGatewayId,
      maxAggregationInterval: props.maxAggregationInterval,
      logFormat: props.logFormat,
      logDestinationType: props.logDestinationType,
      logDestination: props.logDestination,
      deliverLogsPermissionArn: props.deliverLogsPermissionArn,
      tags: props.tags,
    });

    this.flowLogId = flowLog.ref;
  }

  public static createCloudWatchLogsDestination(
    scope: Construct,
    id: string,
    props: {
      transitGatewayName: string;
      logRetentionInDays: number;
      encryptionKey?: cdk.aws_kms.IKey;
      acceleratorPrefix: string;
    },
  ): { logGroup: cdk.aws_logs.LogGroup; role: cdk.aws_iam.Role } {
    const logGroup = new cdk.aws_logs.LogGroup(scope, `${id}LogGroup`, {
      logGroupName: `/aws/transitgateway/${props.transitGatewayName}`,
      retention: props.logRetentionInDays,
      encryptionKey: props.encryptionKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const role = new cdk.aws_iam.Role(scope, `${id}Role`, {
      assumedBy: new cdk.aws_iam.ServicePrincipal('vpc-flow-logs.amazonaws.com'),
      description: `Transit Gateway flow logs role for ${props.transitGatewayName}`,
    });

    role.addToPolicy(
      new cdk.aws_iam.PolicyStatement({
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
          'logs:DescribeLogGroups',
          'logs:DescribeLogStreams',
        ],
        resources: [logGroup.logGroupArn],
      }),
    );

    return { logGroup, role };
  }
}

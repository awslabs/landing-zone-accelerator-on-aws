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

import path from 'path';

export interface ServiceQuotaDefinitionProps {
  /**
   * The service identifier.
   */
  readonly serviceCode: string;
  /**
   * The quota identifier.
   */
  readonly quotaCode: string;
  /**
   * The new, increased value for the quota.
   */
  readonly desiredValue: number;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class LimitsDefinition extends Construct {
  readonly id: string;
  constructor(scope: Construct, id: string, props: ServiceQuotaDefinitionProps) {
    super(scope, id);

    const DEFAULT_LIMITS = `Custom::ServiceQuotaLimits`;

    //
    // Function definition for the custom resource
    //
    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, DEFAULT_LIMITS, {
      codeDirectory: path.join(__dirname, 'create-limits/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'OrganizationListActions',
          Effect: 'Allow',
          Action: [
            'organizations:DescribeAccount',
            'organizations:DescribeOrganization',
            'organizations:ListAWSServiceAccessForOrganization',
          ],
          Resource: '*',
        },
        {
          Sid: 'AutoScalingLimitsAction',
          Effect: 'Allow',
          Action: ['autoscaling:DescribeAccountLimits'],
          Resource: '*',
        },
        {
          Sid: 'DynamoDBLimitsAction',
          Effect: 'Allow',
          Action: ['dynamodb:DescribeLimits'],
          Resource: '*',
        },
        {
          Sid: 'KinesisLimitsAction',
          Effect: 'Allow',
          Action: ['kinesis:DescribeLimits'],
          Resource: '*',
        },
        {
          Sid: 'IAMAccountSummaryAction',
          Effect: 'Allow',
          Action: ['iam:GetAccountSummary'],
          Resource: [`*`],
        },
        {
          Sid: 'CloudFormationAccountLimitsAction',
          Effect: 'Allow',
          Action: ['cloudformation:DescribeAccountLimits'],
          Resource: [`*`],
        },
        {
          Sid: 'CloudWatchLimitsActions',
          Effect: 'Allow',
          Action: [
            'cloudformation:DescribeAccountLimits',
            'cloudwatch:DescribeAlarmsForMetric',
            'cloudwatch:DescribeAlarms',
            'cloudwatch:GetMetricData',
            'cloudwatch:GetMetricStatistics',
            'cloudwatch:PutMetricAlarm',
          ],
          Resource: `*`,
        },
        {
          Sid: 'ElasticLoadBalancingLimitsAction',
          Effect: 'Allow',
          Action: ['elasticloadbalancing:DescribeAccountLimits'],
          Resource: `*`,
        },
        {
          Sid: 'Route53LimitsAction',
          Effect: 'Allow',
          Action: ['route53:GetAccountLimit'],
          Resource: `*`,
        },
        {
          Sid: 'RDSLimitsAction',
          Effect: 'Allow',
          Action: ['rds:DescribeAccountAttributes'],
          Resource: `*`,
        },
        {
          Sid: 'ServiceQuotaLimitsAction',
          Effect: 'Allow',
          Action: ['servicequotas:*'],
          Resource: `*`,
        },
        {
          Sid: 'TaggingLimitsActions',
          Effect: 'Allow',
          Action: ['tag:GetTagKeys', 'tag:GetTagValues'],
          Resource: `*`,
        },
        {
          Sid: 'CreateServiceLinkedRole',
          Effect: 'Allow',
          Action: ['iam:CreateServiceLinkedRole'],
          Resource: `*`,
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: DEFAULT_LIMITS,
      serviceToken: provider.serviceToken,
      properties: {
        serviceCode: props.serviceCode,
        quotaCode: props.quotaCode,
        desiredValue: props.desiredValue,
      },
    });

    /**
     * Singleton pattern to define the log group for the singleton function
     * in the stack
     */
    const stack = cdk.Stack.of(scope);
    const logGroup =
      (stack.node.tryFindChild(`${provider.node.id}LogGroup`) as cdk.aws_logs.LogGroup) ??
      new cdk.aws_logs.LogGroup(stack, `${provider.node.id}LogGroup`, {
        logGroupName: `/aws/lambda/${(provider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref}`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });
    resource.node.addDependency(logGroup);

    this.id = resource.ref;

    if (props?.serviceCode) {
      console.log(`[Service Quota Limits] Limits are being updated for ${props?.serviceCode}`);
    }
  }
}

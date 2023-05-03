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

import * as path from 'path';

/**
 * Initialized SubnetIdLookupProps properties
 */
export interface SubnetIdLookupProps {
  /**
   * Vpc id for the subnet lookup
   */
  readonly vpcId: string;
  /**
   * Subnet name
   */
  readonly subnetName: string;
  /**
   * Custom resource lambda key
   */
  readonly lambdaKey: cdk.aws_kms.IKey;
  /**
   * Custom resource CloudWatch log group encryption key
   */
  readonly cloudwatchKey: cdk.aws_kms.IKey;
  /**
   * Custom resource CloudWatch log retention in days
   */
  readonly cloudwatchLogRetentionInDays: number;
}

/**
 * Subnet id lookup class.
 */
export class SubnetIdLookup extends Construct {
  public readonly subnetId: string;
  constructor(scope: Construct, id: string, props: SubnetIdLookupProps) {
    super(scope, id);

    const providerLambda = new cdk.aws_lambda.Function(this, 'SubnetIdLookupFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'get-subnet-id/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      description: 'Lookup subnet id from account',
      environmentEncryption: props.lambdaKey,
    });

    providerLambda.addToRolePolicy(
      new cdk.aws_iam.PolicyStatement({
        sid: 'Ec2Actions',
        effect: cdk.aws_iam.Effect.ALLOW,
        actions: ['ec2:DescribeSubnets'],
        resources: ['*'],
      }),
    );

    // Custom resource lambda log group
    new cdk.aws_logs.LogGroup(this, `${providerLambda.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${providerLambda.functionName}`,
      retention: props.cloudwatchLogRetentionInDays,
      encryptionKey: props.cloudwatchKey,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const provider = new cdk.custom_resources.Provider(this, 'SubnetIdLookupProvider', {
      onEventHandler: providerLambda,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: 'Custom::SubnetIdLookup',
      serviceToken: provider.serviceToken,
      properties: {
        vpcId: props.vpcId,
        subnetName: props.subnetName,
      },
    });

    this.subnetId = resource.ref;
  }
}

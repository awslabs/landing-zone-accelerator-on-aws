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
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
/**
 * Initialized ServiceLinkedRoleProps properties
 */
export interface ServiceLinkedRoleProps {
  /**
   * Custom resource lambda environment encryption key
   */
  readonly environmentEncryptionKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly cloudWatchLogKmsKey: cdk.aws_kms.IKey;
  /**
   * Custom resource lambda log retention in days
   */
  readonly cloudWatchLogRetentionInDays: number;
  /**
   * Service linked role service name
   */
  readonly awsServiceName: string;
  /**
   * Service linked role service description
   */
  readonly description?: string;
  /**
   * Service linked role name that should be created when create-service-link role api call is made.
   * this allows to look up roles faster, scale better in case naming changes by service.
   * @example
   * for autoscaling.amazonaws.com roleName would be AWSServiceRoleForAutoScaling
   */
  readonly roleName: string;
}

/**
 * Class for ServiceLinkedRole
 */
export class ServiceLinkedRole extends Construct {
  public readonly roleArn: string;
  public readonly roleName: string;
  constructor(scope: Construct, id: string, props: ServiceLinkedRoleProps) {
    super(scope, id);

    const lambdaFunction = new cdk.aws_lambda.Function(this, 'CreateServiceLinkedRoleFunction', {
      code: cdk.aws_lambda.Code.fromAsset(path.join(__dirname, 'create-service-linked-role/dist')),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      description: 'Custom resource provider to create service linked role',
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          effect: cdk.aws_iam.Effect.ALLOW,
          actions: ['iam:CreateServiceLinkedRole', 'iam:GetRole'],
          resources: ['*'],
        }),
      ],
      environmentEncryption: props.environmentEncryptionKmsKey,
    });

    new cdk.aws_logs.LogGroup(this, `${lambdaFunction.node.id}LogGroup`, {
      logGroupName: `/aws/lambda/${lambdaFunction.functionName}`,
      retention: props.cloudWatchLogRetentionInDays,
      encryptionKey: props.cloudWatchLogKmsKey,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const provider = new cdk.custom_resources.Provider(this, 'CreateServiceLinkedRoleProvider', {
      onEventHandler: lambdaFunction,
    });

    const resource = new cdk.CustomResource(this, 'CreateServiceLinkedRoleResource', {
      resourceType: 'Custom::CreateServiceLinkedRole',
      serviceToken: provider.serviceToken,
      properties: {
        serviceName: props.awsServiceName,
        description: props.description,
        roleName: props.roleName,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    this.roleArn = resource.getAtt('roleArn').toString();
    this.roleName = resource.getAtt('roleName').toString();
  }
}

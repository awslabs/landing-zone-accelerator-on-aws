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

const path = require('path');

export interface AssociateHostedZonesProps {
  readonly accountIds: string[];
  readonly hostedZoneIds: string[];
  readonly hostedZoneAccountId: string;
  readonly roleName: string;
  readonly tagFilters: {
    key: string;
    value: string;
  }[];
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class AssociateHostedZones extends cdk.Resource {
  public readonly id: string = '';

  constructor(scope: Construct, id: string, props: AssociateHostedZonesProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::Route53AssociateHostedZones';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'associate-hosted-zones/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'Route53AssociateHostedZonesActions',
          Effect: 'Allow',
          Action: [
            'ec2:DescribeVpcs',
            'route53:AssociateVPCWithHostedZone',
            'route53:CreateVPCAssociationAuthorization',
            'route53:DeleteVPCAssociationAuthorization',
            'route53:GetHostedZone',
            'sts:AssumeRole',
          ],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: provider.serviceToken,
      properties: {
        partition: cdk.Stack.of(this).partition,
        region: cdk.Stack.of(this).region,
        accountIds: props.accountIds,
        hostedZoneIds: props.hostedZoneIds,
        hostedZoneAccountId: props.hostedZoneAccountId,
        roleName: props.roleName,
        tagFilters: props.tagFilters,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
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
  }
}

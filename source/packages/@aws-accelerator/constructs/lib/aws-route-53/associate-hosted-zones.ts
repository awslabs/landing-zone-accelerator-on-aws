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

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'associate-hosted-zones/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
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

    const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${
        (customResourceProvider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref
      }`,
      retention: props.logRetentionInDays,
      encryptionKey: props.kmsKey,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        partition: cdk.Stack.of(this).partition,
        region: cdk.Stack.of(this).region,
        accountIds: props.accountIds,
        hostedZoneIds: props.hostedZoneIds,
        hostedZoneAccountId: props.hostedZoneAccountId,
        roleName: props.roleName,
        tagFilters: props.tagFilters,
      },
    });

    resource.node.addDependency(logGroup);

    this.id = resource.ref;
  }
}

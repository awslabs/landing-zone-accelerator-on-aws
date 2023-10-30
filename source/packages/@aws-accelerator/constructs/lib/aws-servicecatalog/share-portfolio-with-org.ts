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

const path = require('path');

/**
 * This construct enables the sharing of a Service Catalog Portfolio with an organizational unit.
 */
export interface SharePortfolioWithOrgProps {
  /**
   * Id of the portfolio to be shared
   */
  readonly portfolioId: string;
  /**
   * Organizational Unit Ids to share portfolio with
   */
  readonly organizationalUnitIds: string[];
  /**
   * Organization Id to share with
   */
  readonly organizationId: string;
  /**
   * Determines if tag sharing is enabled
   */
  readonly tagShareOptions: boolean;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class SharePortfolioWithOrg extends Construct {
  constructor(scope: Construct, id: string, props: SharePortfolioWithOrgProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::SharePortfolioWithOrg';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'share-portfolio-with-org/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'ServiceCatalog',
          Effect: 'Allow',
          Action: [
            'servicecatalog:CreatePortfolioShare',
            'servicecatalog:UpdatePortfolioShare',
            'servicecatalog:DeletePortfolioShare',
            'servicecatalog:DescribePortfolioShareStatus',
            'organizations:DescribeOrganization',
            'organizations:ListParents',
            'organizations:ListChildren',
            'organizations:ListAccountsForParent',
            'organizations:ListAccounts',
          ],
          Resource: '*',
        },
      ],
    });

    const customResourceObjects = [];
    if (props.organizationId) {
      customResourceObjects.push(
        new cdk.CustomResource(this, 'PortfolioShare-Root', {
          resourceType: RESOURCE_TYPE,
          serviceToken: provider.serviceToken,
          properties: {
            portfolioId: props.portfolioId,
            organizationalUnitId: '',
            organizationId: props.organizationId,
            tagShareOptions: props.tagShareOptions,
          },
        }),
      );
    }
    for (const orgUnit of props.organizationalUnitIds) {
      customResourceObjects.push(
        new cdk.CustomResource(this, `PortfolioShare-${orgUnit}`, {
          resourceType: RESOURCE_TYPE,
          serviceToken: provider.serviceToken,
          properties: {
            portfolioId: props.portfolioId,
            organizationalUnitId: orgUnit,
            organizationId: '',
            tagShareOptions: props.tagShareOptions,
          },
        }),
      );
    }

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

    for (const customResource of customResourceObjects) {
      customResource.node.addDependency(logGroup);
    }
  }
}

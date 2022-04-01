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
import { v4 as uuidv4 } from 'uuid';
import { Construct } from 'constructs';

const path = require('path');

/**
 * Get the PortfolioId from servicecatalog
 */
export interface GetPortfolioIdProps {
  readonly displayName: string;
  readonly providerName: string;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class GetPortfolioId extends Construct {
  public readonly portfolioId: string;

  static isLogGroupConfigured = false;

  constructor(scope: Construct, id: string, props: GetPortfolioIdProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::GetPortfolioId';

    const customResourceProvider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'get-portfolio-id/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_14_X,
      policyStatements: [
        {
          Sid: 'ServiceCatalog',
          Effect: 'Allow',
          Action: ['servicecatalog:ListPortfolios'],
          Resource: '*',
        },
      ],
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      resourceType: RESOURCE_TYPE,
      serviceToken: customResourceProvider.serviceToken,
      properties: {
        displayName: props.displayName,
        providerName: props.providerName,
        uuid: uuidv4(), // Generates a new UUID to force the resource to update
      },
    });

    /**
     * Pre-Creating log group to enable encryption and log retention.
     * Below construct needs to be static
     * isLogGroupConfigured flag used to make sure log group construct synthesize only once in the stack
     */
    if (!GetPortfolioId.isLogGroupConfigured) {
      const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
        logGroupName: `/aws/lambda/${
          (customResourceProvider.node.findChild('Handler') as cdk.aws_lambda.CfnFunction).ref
        }`,
        retention: props.logRetentionInDays,
        encryptionKey: props.kmsKey,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

      resource.node.addDependency(logGroup);

      // Enable the flag to indicate log group configured
      GetPortfolioId.isLogGroupConfigured = true;
    }

    this.portfolioId = resource.ref;
  }
}

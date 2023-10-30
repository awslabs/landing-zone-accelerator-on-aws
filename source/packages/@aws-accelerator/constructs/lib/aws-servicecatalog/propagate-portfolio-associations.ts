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

import { PortfolioConfig } from '@aws-accelerator/config';
import { v4 as uuidv4 } from 'uuid';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

const path = require('path');

/**
 * This construct enables the propagation of Service Catalog Portfolio
 */
export interface PropagatePortfolioAssociationsProps {
  /**
   * A list of account Ids the portfolio is shared with
   */
  readonly shareAccountIds: string[];
  /**
   * The name of the role to assume from the account containing the portfolio
   */
  readonly crossAccountRole: string;
  /**
   * Id of the portfolio to be shared
   */
  readonly portfolioId: string;
  /**
   * The portfolio definition from the customizations-config.yaml file
   */
  readonly portfolioDefinition: PortfolioConfig;
  /**
   * Custom resource lambda log group encryption key
   */
  readonly kmsKey: cdk.aws_kms.Key;
  /**
   * Custom resource lambda log retention in days
   */
  readonly logRetentionInDays: number;
}

export class PropagatePortfolioAssociations extends Construct {
  constructor(scope: Construct, id: string, props: PropagatePortfolioAssociationsProps) {
    super(scope, id);

    const RESOURCE_TYPE = 'Custom::PropagatePortfolioAssociations';

    const provider = cdk.CustomResourceProvider.getOrCreateProvider(this, RESOURCE_TYPE, {
      codeDirectory: path.join(__dirname, 'propagate-portfolio-associations/dist'),
      runtime: cdk.CustomResourceProviderRuntime.NODEJS_16_X,
      policyStatements: [
        {
          Sid: 'ServiceCatalog',
          Effect: 'Allow',
          Action: ['sts:AssumeRole'],
          Resource: '*',
        },
      ],
    });

    const customResourceObjects = [];
    customResourceObjects.push(
      new cdk.CustomResource(this, `PropagateAssociations`, {
        resourceType: RESOURCE_TYPE,
        serviceToken: provider.serviceToken,
        properties: {
          crossAccountRole: props.crossAccountRole,
          portfolioId: props.portfolioId,
          portfolioDefinition: JSON.stringify(props.portfolioDefinition),
          shareAccountIds: props.shareAccountIds.join(','),
          partition: cdk.Stack.of(this).partition,
          uuid: uuidv4(), // Generates a new UUID to force the resource to update
        },
      }),
    );

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

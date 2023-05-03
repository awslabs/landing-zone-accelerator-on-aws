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
import { GovCloudAccountVendingProductStack } from './govcloud-avm-product-stack';
import * as fs from 'fs';
import { version } from '../../../../package.json';

export interface GovCloudAccountVendingStackProps extends cdk.StackProps {
  readonly acceleratorPrefix: string;
}

export class GovCloudAccountVendingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GovCloudAccountVendingStackProps) {
    super(scope, id, props);

    /** This stack creates service catalog product which can 
     * create AWS GovCloud (US) accounts using the Organizations API
    * "CreateGovCloudAccount". 
    * 
    * 
    * The account where this stack is launched should 
    * 1. be in commercial region with Organizations enabled
    * 2. Have ability to create AWS GovCloud (US) Accounts
    * Please read https://docs.aws.amazon.com/govcloud-us/latest/UserGuide/getting-set-up.html
    * and the API documentation 
    * https://docs.aws.amazon.com/organizations/latest/APIReference/API_CreateGovCloudAccount.html

    */

    /*
     * Parameter for getting IAM Role ARN
     * This role will have access to launch service catalog products
     */

    // Create a portfolio
    const portfolio = new cdk.aws_servicecatalog.Portfolio(this, 'GovCloudAccountVendingPortfolio', {
      displayName: 'Landing Zone Accelerator on AWS',
      providerName: 'AWS Solutions',
    });

    // Create a GovCloud Account Vending service catalog product
    const product = new cdk.aws_servicecatalog.CloudFormationProduct(this, 'GovCloudAccountVendingProduct', {
      productName: 'Landing Zone Accelerator on AWS - AWS GovCloud (US) Account Vending',
      owner: 'AWS Solutions',
      productVersions: [
        {
          cloudFormationTemplate: cdk.aws_servicecatalog.CloudFormationTemplate.fromProductStack(
            new GovCloudAccountVendingProductStack(this, 'GovCloudAccountVendingProductStack', {
              acceleratorPrefix: props.acceleratorPrefix,
              description: `(SO0199-govcloudavmproduct) Landing Zone Accelerator on AWS. Version ${version}.`,
            }),
          ),
          productVersionName: 'v1.0.0',
          description:
            'AWS GovCloud (US) Account Vending Product. Create AWS GovCloud (US) accounts. Required inputs are Account name, email and Organization Access Role.',
        },
      ],
    });
    // Associate product to the portfolio
    portfolio.addProduct(product);

    const fileContents = fs.readFileSync(path.join(__dirname, 'lambdas/create-govcloud-account/index.js'));

    // Lambda function to be used in Custom Resource
    const accountVendingFunction = new cdk.aws_lambda.Function(this, 'GovCloudAccountVendingFunction', {
      code: new cdk.aws_lambda.InlineCode(fileContents.toString()),
      runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
      handler: 'index.handler',
      timeout: cdk.Duration.seconds(900),
      functionName: `${props.acceleratorPrefix}-GovCloudAccountVending`,
      description: 'Create AWS GovCloud (US) Accounts',
      initialPolicy: [
        new cdk.aws_iam.PolicyStatement({
          actions: ['organizations:CreateGovCloudAccount', 'organizations:DescribeCreateAccountStatus'],
          resources: ['*'],
        }),
      ],
    });

    //
    // cfn-nag suppressions
    //
    const cfnLambdaFunctionPolicy = accountVendingFunction.node.findChild('ServiceRole').node.findChild('DefaultPolicy')
      .node.defaultChild as cdk.aws_iam.CfnPolicy;
    cfnLambdaFunctionPolicy.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W12',
            reason: `IAM policy should not allow * resource.`,
          },
        ],
      },
    };

    const cfnLambdaFunction = accountVendingFunction.node.defaultChild as cdk.aws_lambda.CfnFunction;
    cfnLambdaFunction.cfnOptions.metadata = {
      cfn_nag: {
        rules_to_suppress: [
          {
            id: 'W58',
            reason: `CloudWatch Logs are enabled in AWSLambdaBasicExecutionRole`,
          },
          {
            id: 'W89',
            reason: `This function supports infrastructure deployment and is not deployed inside a VPC.`,
          },
          {
            id: 'W92',
            reason: `This function supports infrastructure deployment and does not require setting ReservedConcurrentExecutions.`,
          },
        ],
      },
    };
  }
}

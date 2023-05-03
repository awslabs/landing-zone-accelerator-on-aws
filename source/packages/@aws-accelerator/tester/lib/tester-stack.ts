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
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as config from 'aws-cdk-lib/aws-config';
import path from 'path';

/**
 * Test config file name
 */
export const CONFIG_FILE_NAME = 'config.yaml';

/**
 * Test config structure type
 */
export type CONFIG_FILE_CONTENT_TYPE = {
  /**
   * List of test cases
   */
  tests: [
    {
      /**
       * Unique test name
       */
      name: string;
      /**
       * Test case description
       */
      description: string;
      /**
       * Test suite
       */
      suite: string;
      /**
       * Test target identifier
       */
      testTarget: string;
      /**
       * Expected test result - PASS/FAIL
       */
      expect: string;
      /**
       * List of test case input parameters
       */
      parameters: Record<string, string>[];
    },
  ];
};

/**
 * TesterStackPops
 */
export interface TesterStackPops extends cdk.StackProps {
  readonly qualifier: string;
  readonly configFileContent: CONFIG_FILE_CONTENT_TYPE;
  readonly managementCrossAccountRoleName: string;
  readonly managementAccountId?: string;
  readonly managementAccountRoleName?: string;
}

/**
 * TesterStack class
 */
export class TesterStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: TesterStackPops) {
    super(scope, id, props);

    /**
     * Custom policy statements
     */
    const policyStatements: iam.PolicyStatement[] = [];

    if (props.managementAccountId && props.managementAccountRoleName) {
      policyStatements.push(
        new iam.PolicyStatement({
          sid: 'LambdaSTSActions',
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [
            `arn:${cdk.Stack.of(this).partition}:iam::${props.managementAccountId}:role/${
              props.managementAccountRoleName
            }`,
          ],
        }),
      );
    } else {
      policyStatements.push(
        new iam.PolicyStatement({
          sid: 'LambdaSTSActions',
          effect: iam.Effect.ALLOW,
          actions: ['sts:AssumeRole'],
          resources: [`arn:${cdk.Stack.of(this).partition}:iam::*:role/${props.managementCrossAccountRoleName}`],
        }),
      );
    }

    for (const test of props.configFileContent.tests) {
      const testName = test.name.replace(/[^a-zA-Z0-9-]/g, '-');

      /**
       * Lambda function for config custom role
       * Single lambda function can not be used for multiple config custom role, there is a pending issue with CDK team on this
       * https://github.com/aws/aws-cdk/issues/17582
       */
      const lambdaFunction = new lambda.Function(this, `${props.qualifier}-${testName}Function`, {
        runtime: lambda.Runtime.NODEJS_16_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(path.join(__dirname, '../lambdas/dist')),
        description: `AWS Config custom rule function used for test case "${test.name}"`,
        timeout: cdk.Duration.minutes(30),
      });

      lambdaFunction.role?.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'));

      policyStatements.forEach(policyStatement => {
        lambdaFunction?.addToRolePolicy(policyStatement);
      });

      new config.CustomRule(this, `${props.qualifier}-${testName}CustomRule`, {
        configRuleName: `${props.qualifier}-${testName}`,
        lambdaFunction: lambdaFunction,
        periodic: true,
        inputParameters: {
          ['awsConfigRegion']: cdk.Stack.of(this).region,
          ['managementAccount']: {
            partition: cdk.Stack.of(this).partition,
            id: props.managementAccountId ?? cdk.Stack.of(this).account,
            crossAccountRoleName: props.managementCrossAccountRoleName,
            roleName: props.managementAccountRoleName,
          },
          ['test']: test,
        },
        description: `${test.description}`,
        maximumExecutionFrequency: config.MaximumExecutionFrequency.SIX_HOURS, // default is 24 hours
      });
    }
  }
}

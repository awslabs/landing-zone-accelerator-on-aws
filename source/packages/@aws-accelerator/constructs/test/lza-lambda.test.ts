/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { describe, expect, test } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { LzaLambda, LzaLambdaProps } from '../lib/lza-lambda';
import { DEFAULT_LAMBDA_RUNTIME } from '@aws-accelerator/utils/lib/lambda';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

describe('lza-lambda construct', () => {
  const props: LzaLambdaProps = {
    assetPath: '..',
    cloudWatchLogRetentionInDays: 1,
    nagSuppressionPrefix: '',
  };
  const construct = new LzaLambda(stack, 'lambda-test', props);

  test('Create lambda and log group', () => {
    expect(construct.resource).toBeInstanceOf(cdk.aws_lambda.Function);
    expect(construct.logGroup).toBeInstanceOf(cdk.aws_logs.LogGroup);
  });

  test('runtime defaults to node 18', () => {
    const lambda = construct.resource as cdk.aws_lambda.Function;
    expect(lambda.runtime).toEqual(DEFAULT_LAMBDA_RUNTIME);
  });

  test('runtime set to node 20', () => {
    const expected = cdk.aws_lambda.Runtime.NODEJS_20_X;
    const node_props: LzaLambdaProps = {
      lambdaRuntime: expected,
      assetPath: '..',
      cloudWatchLogRetentionInDays: 1,
      nagSuppressionPrefix: '',
    };
    const lambda_construct = new LzaLambda(stack, 'lambda-test-node-20', node_props);
    const lambda = lambda_construct.resource as cdk.aws_lambda.Function;
    expect(lambda.runtime).toEqual(expected);
  });

  describe('prepareLambdaEnvironments', () => {
    test('empty env variables returns undefined', () => {
      const props_empty_environment: LzaLambdaProps = {
        assetPath: '..',
        cloudWatchLogRetentionInDays: 1,
        nagSuppressionPrefix: '',
        environmentVariables: [],
      };

      const result = construct['prepareLambdaEnvironments'](props_empty_environment);
      expect(result).toBeUndefined();
    });

    test('undefined env variables returns undefined', () => {
      const result = construct['prepareLambdaEnvironments'](props);
      expect(result).toBeUndefined();
    });

    test('setting env returns values', () => {
      const env_1 = { test: 'value' };
      const env_2 = { number: 5 };

      const props_env: LzaLambdaProps = {
        assetPath: '..',
        cloudWatchLogRetentionInDays: 1,
        nagSuppressionPrefix: '',
        environmentVariables: [env_1, env_2],
      };
      const result = construct['prepareLambdaEnvironments'](props_env) ?? {};
      expect(result['test']).toEqual('value');
      expect(result['number']).toEqual(5);
    });
  });
});

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

import { describe, expect, test, vi, beforeAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { LzaLambda, LzaLambdaProps } from '../lib/lza-lambda';
import { DEFAULT_LAMBDA_RUNTIME } from '@aws-accelerator/utils/lib/lambda';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let tempDir: string;

beforeAll(() => {
  // Create a temporary directory with a minimal package.json for testing
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lambda-test-'));
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'test' }));
  fs.writeFileSync(path.join(tempDir, 'index.js'), 'exports.handler = () => {};');

  // Mock Code.fromAsset to avoid heavy asset bundling
  vi.spyOn(cdk.aws_lambda.Code, 'fromAsset').mockReturnValue({
    bind: vi.fn().mockReturnValue({
      s3Location: {
        bucketName: 'mock-bucket',
        objectKey: 'mock-key',
      },
    }),
    bindToResource: vi.fn(),
  } as unknown as cdk.aws_lambda.AssetCode);
});

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

describe('lza-lambda construct', () => {
  const props: LzaLambdaProps = {
    assetPath: tempDir,
    cloudWatchLogRetentionInDays: 1,
    nagSuppressionPrefix: '',
  };

  test('Create lambda and log group', () => {
    const construct = new LzaLambda(stack, 'lambda-test', props);
    expect(construct.resource).toBeInstanceOf(cdk.aws_lambda.Function);
    expect(construct.logGroup).toBeInstanceOf(cdk.aws_logs.LogGroup);
  });

  test('runtime defaults to node 18', () => {
    const construct = new LzaLambda(stack, 'lambda-test-runtime', props);
    const lambda = construct.resource as cdk.aws_lambda.Function;
    expect(lambda.runtime).toEqual(DEFAULT_LAMBDA_RUNTIME);
  });

  test('runtime set to node 20', () => {
    const expected = cdk.aws_lambda.Runtime.NODEJS_20_X;
    const node_props: LzaLambdaProps = {
      lambdaRuntime: expected,
      assetPath: tempDir,
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
        assetPath: tempDir,
        cloudWatchLogRetentionInDays: 1,
        nagSuppressionPrefix: '',
        environmentVariables: [],
      };

      const construct = new LzaLambda(stack, 'lambda-test-empty-env', props_empty_environment);
      const result = construct['prepareLambdaEnvironments'](props_empty_environment);
      expect(result).toBeUndefined();
    });

    test('undefined env variables returns undefined', () => {
      const construct = new LzaLambda(stack, 'lambda-test-undefined-env', props);
      const result = construct['prepareLambdaEnvironments'](props);
      expect(result).toBeUndefined();
    });

    test('setting env returns values', () => {
      const env_1 = { test: 'value' };
      const env_2 = { number: 5 };

      const props_env: LzaLambdaProps = {
        assetPath: tempDir,
        cloudWatchLogRetentionInDays: 1,
        nagSuppressionPrefix: '',
        environmentVariables: [env_1, env_2],
      };
      const construct = new LzaLambda(stack, 'lambda-test-with-env', props_env);
      const result = construct['prepareLambdaEnvironments'](props_env) ?? {};
      expect(result['test']).toEqual('value');
      expect(result['number']).toEqual(5);
    });
  });
});

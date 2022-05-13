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

import { FinalizeStack } from '../lib/stacks/finalize-stack';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import {
  ACCOUNT_CONFIG,
  GLOBAL_CONFIG,
  IAM_CONFIG,
  NETWORK_CONFIG,
  ORGANIZATION_CONFIG,
  SECURITY_CONFIG,
} from './configs/test-config';
import * as path from 'path';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
//import { SynthUtils } from '@aws-cdk/assert';

const testNamePrefix = 'Construct(FinalizeStack): ';

/**
 * Finalize Stack
 */
const app = new cdk.App({
  context: { 'config-dir': path.join(__dirname, 'configs') },
});
const configDirPath = app.node.tryGetContext('config-dir');

const env = {
  account: '333333333333',
  region: 'us-east-1',
};

const props: AcceleratorStackProps = {
  env,
  configDirPath,
  accountsConfig: ACCOUNT_CONFIG,
  globalConfig: GLOBAL_CONFIG,
  iamConfig: IAM_CONFIG,
  networkConfig: NETWORK_CONFIG,
  organizationConfig: ORGANIZATION_CONFIG,
  securityConfig: SECURITY_CONFIG,
  partition: 'aws',
};

const stack = new FinalizeStack(
  app,
  `${AcceleratorStackNames[AcceleratorStage.ACCOUNTS]}-${env.account}-${env.region}`,
  props,
);

/**
 * FinalizeStack construct test
 */
describe('FinalizeStack', () => {
  // /**
  //  * Snapshot test
  //  */
  //test(`${testNamePrefix} Snapshot Test`, () => {
  //  expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  //});

  /**
   * Number of SSM parameters resource test
   */
  test(`${testNamePrefix} SSM parameters resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::SSM::Parameter', 2);
  });

  /**
   * Number of IAM Role resource test
   */
  test(`${testNamePrefix} IAM Role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda Function resource test
   */
  test(`${testNamePrefix} Lambda Function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of Cloudwatch Log groups test
   */
  test(`${testNamePrefix} CloudWatch Log Group resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 1);
  });

  test(`${testNamePrefix} Detach Quarantinee custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomDetachQuarantineScpCustomResourceProviderHandlerA1F1C263: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomDetachQuarantineScpCustomResourceProviderRoleE5C433C1', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });
});

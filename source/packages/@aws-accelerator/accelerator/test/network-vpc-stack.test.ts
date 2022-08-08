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

import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';

const testNamePrefix = 'Construct(NetworkVpcStack): ';

/**
 * NetworkVpcStack
 */
const acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.NETWORK_VPC, 'all-enabled', 'aws');
const stack = acceleratorTestStacks.stacks.get(`Network-us-east-1`)!;

/**
 * NetworkVpcStack construct test
 */
describe('NetworkVpcStack', () => {
  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 4);
  });

  /**
   * Number of Lambda function IAM role resource test
   */
  test(`${testNamePrefix} Lambda function IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 7);
  });
});

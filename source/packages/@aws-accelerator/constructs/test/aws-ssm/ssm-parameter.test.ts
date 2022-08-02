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
import { SsmParameter, SsmParameterType } from '../../lib/aws-ssm/ssm-parameter';

const testNamePrefix = 'Construct(SsmParameter): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SsmParameter(stack, 'SsmParameter', {
  region: 'us-east-1',
  partition: 'aws',
  parameter: {
    name: `/accelerator/network/vpcPeering/name/id`,
    accountId: '111111111111',
    roleName: `AWSAccelerator-VpcPeeringRole-222222222222`,
    value: 'vp-123123123',
  },
  invokingAccountID: '333333333333',
  type: SsmParameterType.PUT,
});

/**
 * SsmParameter construct test
 */
describe('SsmParameter', () => {
  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 2);
  });
});

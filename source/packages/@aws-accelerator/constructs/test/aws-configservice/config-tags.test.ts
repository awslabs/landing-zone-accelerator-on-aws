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

import { ConfigServiceTags } from '../../lib/aws-configservice/config-tags';

const testNamePrefix = 'Construct(ConfigServiceTags): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const env = { account: '333333333333', region: 'us-east-1' };
const stack = new cdk.Stack(app, 'Stack', { env: env });

const configRule = new cdk.aws_config.ManagedRule(stack, 'TestConfigRule', {
  configRuleName: 'test-rule-name',
  description: 'test-description',
  identifier: 'test-identifier',
  // inputParameters: this.getRuleParameters(rule.name, rule.inputParameters),
  // ruleScope: {
  //   resourceTypes,
  // },
});

new ConfigServiceTags(stack, 'TestConfigServiceTags', {
  resourceArn: configRule.configRuleArn,
  tags: [{ Key: 'key', Value: 'value' }],
  logRetentionInDays: 3653,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  partition: 'aws',
  accountId: env.account,
});

/**
 * Report Definition construct test
 */
describe('ReportDefinition', () => {
  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });
});

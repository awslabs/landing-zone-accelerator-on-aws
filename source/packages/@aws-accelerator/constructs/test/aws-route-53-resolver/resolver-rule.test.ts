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

import { ResolverRule, ResolverRuleAssociation } from '../../lib/aws-route-53-resolver/resolver-rule';

const testNamePrefix = 'Construct(ResolverRule): ';

const stack = new cdk.Stack();

const ipAddresses = [{ ip: '1.1.1.1' }, { ip: '2.2.2.2' }];

const rule = new ResolverRule(stack, 'TestResolverRule', {
  domainName: 'test.com',
  name: 'TestResolverRule',
  resolverEndpointId: 'TestEndpoint',
  targetIps: ipAddresses,
  tags: [],
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

new ResolverRuleAssociation(stack, 'TestResolverRuleAssoc', {
  resolverRuleId: rule.ruleId,
  vpcId: 'TestVpc',
});

describe('ResolverRule', () => {
  /**
   * Resolver rule count test
   */
  test(`${testNamePrefix} Resolver rule count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::ResolverRule', 1);
  });

  /**
   * Resolver rule association count test
   */
  test(`${testNamePrefix} Resolver rule association count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::ResolverRuleAssociation', 1);
  });

  /**
   * Resolver rule resource configuration test
   */
  test(`${testNamePrefix} Resolver rule resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestResolverRule183FBE0C: {
          Type: 'AWS::Route53Resolver::ResolverRule',
          Properties: {
            DomainName: 'test.com',
            ResolverEndpointId: 'TestEndpoint',
            RuleType: 'FORWARD',
            TargetIps: [
              {
                Ip: '1.1.1.1',
              },
              {
                Ip: '2.2.2.2',
              },
            ],
            Tags: [
              {
                Key: 'Name',
                Value: 'TestResolverRule',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Resolver rule association resource configuration test
   */
  test(`${testNamePrefix} Resolver rule association resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestResolverRuleAssoc7E0DCDC2: {
          Type: 'AWS::Route53Resolver::ResolverRuleAssociation',
          Properties: {
            ResolverRuleId: {
              'Fn::GetAtt': ['TestResolverRule183FBE0C', 'ResolverRuleId'],
            },
            VPCId: 'TestVpc',
          },
        },
      },
    });
  });
});

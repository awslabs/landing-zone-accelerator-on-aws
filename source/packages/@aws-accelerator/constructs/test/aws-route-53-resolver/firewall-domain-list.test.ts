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

import {
  ResolverFirewallDomainList,
  ResolverFirewallDomainListType,
} from '../../lib/aws-route-53-resolver/firewall-domain-list';

const testNamePrefix = 'Construct(ResolverFirewallDomainList): ';

const stack = new cdk.Stack();

// Custom domain list
new ResolverFirewallDomainList(stack, 'TestDomainList', {
  name: 'TestDomainList',
  path: __dirname,
  tags: [],
  type: ResolverFirewallDomainListType.CUSTOM,
  kmsKey: new cdk.aws_kms.Key(stack, 'TestDomainListKey', {}),
  logRetentionInDays: 3653,
});

// Managed domain list
new ResolverFirewallDomainList(stack, 'TestManagedDomainList', {
  name: 'TestManagedDomainList',
  type: ResolverFirewallDomainListType.MANAGED,
  kmsKey: new cdk.aws_kms.Key(stack, 'TestManagedDomainListKey', {}),
  logRetentionInDays: 3653,
});

/**
 * DNS firewall domain list construct test
 */
describe('ResolverFirewallDomainList', () => {
  /**
   * DNS firewall domain list count test
   */
  test(`${testNamePrefix} DNS firewall domain list count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::FirewallDomainList', 1);
  });

  /**
   * DNS firewall domain list config test
   */
  test(`${testNamePrefix} DNS firewall domain list resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestDomainList9DC6C806: {
          Type: 'AWS::Route53Resolver::FirewallDomainList',
          Properties: {
            DomainFileUrl: {
              'Fn::Sub': cdk.assertions.Match.stringLikeRegexp(
                's3://cdk-hnb659fds-assets-\\${AWS::AccountId}-\\${AWS::Region}/(\\w)+.zip',
              ),
            },
            Tags: [
              {
                Key: 'Name',
                Value: 'TestDomainList',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * DNS firewall managed domain list count test
   */
  test(`${testNamePrefix} DNS firewall managed domain list count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::ResolverManagedDomainList', 1);
  });

  /**
   * IAM role count test
   */
  test(`${testNamePrefix} IAM role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Lambda function count test
   */
  test(`${testNamePrefix} Lambda function count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * DNS firewall managed domain list resource config test
   */
  test(`${testNamePrefix} DNS firewall managed domain list resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestManagedDomainListE1CDFDDE: {
          Type: 'Custom::ResolverManagedDomainList',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomResolverManagedDomainListCustomResourceProviderHandler9F7C9581', 'Arn'],
            },
            listName: 'TestManagedDomainList',
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });

  /**
   * IAM role resource config test
   */
  test(`${testNamePrefix} IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomResolverManagedDomainListCustomResourceProviderRole33DECC65: {
          Type: 'AWS::IAM::Role',
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'lambda.amazonaws.com',
                  },
                },
              ],
            },
            ManagedPolicyArns: [
              {
                'Fn::Sub': 'arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
              },
            ],
            Policies: [
              {
                PolicyDocument: {
                  Statement: [
                    {
                      Action: ['route53resolver:ListFirewallDomainLists'],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Lambda function resource config test
   */
  test(`${testNamePrefix} Lambda function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomResolverManagedDomainListCustomResourceProviderHandler9F7C9581: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
              S3Key: cdk.assertions.Match.stringLikeRegexp('\\w+.zip'),
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomResolverManagedDomainListCustomResourceProviderRole33DECC65', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });
});

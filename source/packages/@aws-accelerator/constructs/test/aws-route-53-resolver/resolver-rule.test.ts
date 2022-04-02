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
  logRetentionInDays: 365,
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

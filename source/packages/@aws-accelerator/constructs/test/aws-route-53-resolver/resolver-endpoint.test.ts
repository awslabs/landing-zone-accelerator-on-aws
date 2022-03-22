import * as cdk from 'aws-cdk-lib';

import { ResolverEndpoint } from '../../lib/aws-route-53-resolver/resolver-endpoint';

const testNamePrefix = 'Construct(ResolverEndpoint): ';

const stack = new cdk.Stack();

new ResolverEndpoint(stack, 'TestEndpoint', {
  direction: 'OUTBOUND',
  ipAddresses: ['subnet-1', 'subnet-2'],
  name: 'TestEndpoint',
  securityGroupIds: ['sg-123test'],
  tags: [],
});

describe('ResolverEndpoint', () => {
  /**
   * Resolver endpoint resource count tets
   */
  test(`${testNamePrefix} Resolver endpoint resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::ResolverEndpoint', 1);
  });

  /**
   * Resolver endpoint resource configuration test
   */
  test(`${testNamePrefix} Resolver endpoint resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestEndpoint4E197ABD: {
          Type: 'AWS::Route53Resolver::ResolverEndpoint',
          Properties: {
            Direction: 'OUTBOUND',
            IpAddresses: [{ SubnetId: 'subnet-1' }, { SubnetId: 'subnet-2' }],
            SecurityGroupIds: ['sg-123test'],
            Tags: [
              {
                Key: 'Name',
                Value: 'TestEndpoint',
              },
            ],
          },
        },
      },
    });
  });
});

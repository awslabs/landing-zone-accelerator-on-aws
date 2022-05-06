import * as cdk from 'aws-cdk-lib';

import { GetNetworkFirewallEndpoint } from '../../lib/aws-networkfirewall/get-network-firewall-endpoint';

const testNamePrefix = 'Construct(GetNetworkFirewallEndpoint): ';

//Initialize stack for resource configuration test
const stack = new cdk.Stack();

const firewallArn = 'arn:aws:network-firewall:us-east-1:222222222222:firewall/TestFirewall';

new GetNetworkFirewallEndpoint(stack, 'TestGetEndpoint', {
  endpointAz: 'us-east-1a',
  firewallArn: firewallArn,
  kmsKey: new cdk.aws_kms.Key(stack, 'Custom', {}),
  logRetentionInDays: 3653,
  region: 'us-east-1',
});

/**
 * Get Network Firewall endpoint construct test
 */
describe('Get Network Firewall endpoint', () => {
  /**
   * Number of Network Firewall endpoint custom resource
   */
  test(`${testNamePrefix} Network firewall count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GetNetworkFirewallEndpoint', 1);
  });

  /**
   * Number of IAM roles
   */
  test(`${testNamePrefix} IAM role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda functions
   */
  test(`${testNamePrefix} Lambda function count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of log groups
   */
  test(`${testNamePrefix} CloudWatch log group count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::LogGroup', 1);
  });

  /**
   * Get network firewall endpoint resource configuration test
   */
  test(`${testNamePrefix} Network firewall policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestGetEndpoint7804FE92: {
          Type: 'Custom::GetNetworkFirewallEndpoint',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomGetNetworkFirewallEndpointCustomResourceProviderHandler2EF030A1', 'Arn'],
            },
            endpointAz: 'us-east-1a',
            firewallArn: 'arn:aws:network-firewall:us-east-1:222222222222:firewall/TestFirewall',
            region: 'us-east-1',
          },
        },
      },
    });
  });

  /**
   * Get network firewall endpoint resource configuration test
   */
  test(`${testNamePrefix} IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGetNetworkFirewallEndpointCustomResourceProviderRole540B9917: {
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
                      Action: ['network-firewall:DescribeFirewall'],
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
        CustomGetNetworkFirewallEndpointCustomResourceProviderHandler2EF030A1: {
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
              'Fn::GetAtt': ['CustomGetNetworkFirewallEndpointCustomResourceProviderRole540B9917', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * CloudWatch log group resource config test
   */
  test(`${testNamePrefix} CloudWatch Log Group resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGetNetworkFirewallEndpointCustomResourceProviderLogGroup98AC3B14: {
          Type: 'AWS::Logs::LogGroup',
          Properties: {
            KmsKeyId: { 'Fn::GetAtt': ['Custom8166710A', 'Arn'] },
            LogGroupName: {
              'Fn::Join': [
                '',
                ['/aws/lambda/', { Ref: 'CustomGetNetworkFirewallEndpointCustomResourceProviderHandler2EF030A1' }],
              ],
            },
            RetentionInDays: 3653,
          },
        },
      },
    });
  });
});

import * as cdk from 'aws-cdk-lib';
import { SecurityHubMembers } from '../../index';

const testNamePrefix = 'Construct(SecurityHubMembers): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SecurityHubMembers(stack, 'SecurityHubMembers', {
  region: stack.region,
});

/**
 * SecurityHubMembers construct test
 */
describe('SecurityHubMembers', () => {
  /**
   * Number of IAM role test
   */
  test(`${testNamePrefix} IAM role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda function test
   */
  test(`${testNamePrefix} Lambda function count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of CustomResource test
   */
  test(`${testNamePrefix} CustomResource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SecurityHubCreateMembers', 1);
  });

  /**
   * SecurityHubMembers custom resource lambda function configuration test
   */
  test(`${testNamePrefix} SecurityHubMembers custom resource lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubCreateMembersCustomResourceProviderHandler31D82BF3: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSecurityHubCreateMembersCustomResourceProviderRoleFD355CB6'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomSecurityHubCreateMembersCustomResourceProviderRoleFD355CB6', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * SecurityHubMembers custom resource iam role test
   */
  test(`${testNamePrefix} SecurityHubMembers custom resource iam role test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubCreateMembersCustomResourceProviderRoleFD355CB6: {
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
              Version: '2012-10-17',
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
                      Action: ['organizations:ListAccounts'],
                      Condition: {
                        StringLikeIfExists: {
                          'organizations:ListAccounts': ['securityhub.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'SecurityHubCreateMembersTaskOrganizationAction',
                    },
                    {
                      Action: [
                        'securityhub:CreateMembers',
                        'securityhub:DeleteMembers',
                        'securityhub:DisassociateMembers',
                        'securityhub:EnableSecurityHub',
                        'securityhub:ListMembers',
                        'securityhub:UpdateOrganizationConfiguration',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'SecurityHubCreateMembersTaskSecurityHubActions',
                    },
                  ],
                  Version: '2012-10-17',
                },
                PolicyName: 'Inline',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * SecurityHubMembers custom resource test
   */
  test(`${testNamePrefix} SecurityHubMembers custom resource test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SecurityHubMembers2A2B77C4: {
          Type: 'Custom::SecurityHubCreateMembers',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomSecurityHubCreateMembersCustomResourceProviderHandler31D82BF3', 'Arn'],
            },
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });
});

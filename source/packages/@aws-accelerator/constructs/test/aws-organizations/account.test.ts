import * as cdk from 'aws-cdk-lib';
import { Account } from '../../index';

const testNamePrefix = 'Construct(Account): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new Account(stack, 'Account', {
  accountId: stack.account,
  assumeRoleName: 'AWSControlTowerExecution',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * Account construct test
 */
describe('Account', () => {
  /**
   * Number of IAM role resource test
   */
  test(`${testNamePrefix} IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Number of Lambda function resource test
   */
  test(`${testNamePrefix} Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Number of InviteAccountToOrganization custom resource test
   */
  test(`${testNamePrefix} InviteAccountToOrganization custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::InviteAccountToOrganization', 1);
  });

  /**
   * InviteAccountToOrganization custom resource configuration test
   */
  test(`${testNamePrefix} InviteAccountToOrganization custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Account0D856946: {
          Type: 'Custom::InviteAccountToOrganization',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomInviteAccountToOrganizationCustomResourceProviderHandlerAEB26818', 'Arn'],
            },
            accountId: {
              Ref: 'AWS::AccountId',
            },
            roleArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::',
                  {
                    Ref: 'AWS::AccountId',
                  },
                  ':role/AWSControlTowerExecution',
                ],
              ],
            },
          },
        },
      },
    });
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomInviteAccountToOrganizationCustomResourceProviderHandlerAEB26818: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomInviteAccountToOrganizationCustomResourceProviderRole0F64F419'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomInviteAccountToOrganizationCustomResourceProviderRole0F64F419', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomInviteAccountToOrganizationCustomResourceProviderRole0F64F419: {
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
                      Action: [
                        'organizations:AcceptHandshake',
                        'organizations:ListAccounts',
                        'organizations:InviteAccountToOrganization',
                        'organizations:MoveAccount',
                        'sts:AssumeRole',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
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
});

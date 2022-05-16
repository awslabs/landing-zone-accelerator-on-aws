import * as cdk from 'aws-cdk-lib';
import { GuardDutyMembers } from '../../lib/aws-guardduty/guardduty-members';

const testNamePrefix = 'Construct(GuardDutyMembers): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GuardDutyMembers(stack, 'GuardDutyMembers', {
  enableS3Protection: true,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * GuardDutyMembers construct test
 */
describe('GuardDutyMembers', () => {
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
   * Number of GuardDutyCreateMembers custom resource test
   */
  test(`${testNamePrefix} GuardDutyCreateMembers custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::GuardDutyCreateMembers', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreateMembersCustomResourceProviderHandler0A16C673: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomGuardDutyCreateMembersCustomResourceProviderRole2D82020E'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomGuardDutyCreateMembersCustomResourceProviderRole2D82020E', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * IAM role resource configuration test
   */
  test(`${testNamePrefix} IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomGuardDutyCreateMembersCustomResourceProviderRole2D82020E: {
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
                          'organizations:ListAccounts': ['guardduty.amazonaws.com'],
                        },
                      },
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyCreateMembersTaskOrganizationAction',
                    },
                    {
                      Action: [
                        'guardDuty:ListDetectors',
                        'guardDuty:ListOrganizationAdminAccounts',
                        'guardDuty:UpdateOrganizationConfiguration',
                        'guardduty:CreateMembers',
                        'guardduty:DeleteMembers',
                        'guardduty:DisassociateMembers',
                        'guardduty:ListDetectors',
                        'guardduty:ListMembers',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                      Sid: 'GuardDutyCreateMembersTaskGuardDutyActions',
                    },
                    {
                      Action: ['iam:CreateServiceLinkedRole'],
                      Effect: 'Allow',
                      Resource: ['*'],
                      Sid: 'ServiceLinkedRoleSecurityHub',
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
   * GuardDutyCreateMembers custom resource configuration test
   */
  test(`${testNamePrefix} GuardDutyCreateMembers custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        GuardDutyMembersD34CA003: {
          Type: 'Custom::GuardDutyCreateMembers',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomGuardDutyCreateMembersCustomResourceProviderHandler0A16C673', 'Arn'],
            },
            enableS3Protection: true,
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });
});

import * as cdk from 'aws-cdk-lib';
import { PasswordPolicy } from '@aws-accelerator/constructs';

const testNamePrefix = 'Construct(CentralLogsBucket): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new PasswordPolicy(stack, 'PasswordPolicy', {
  allowUsersToChangePassword: true,
  hardExpiry: true,
  requireUppercaseCharacters: true,
  requireLowercaseCharacters: true,
  requireSymbols: true,
  requireNumbers: true,
  minimumPasswordLength: 8,
  passwordReusePrevention: 5,
  maxPasswordAge: 90,
});

/**
 * PasswordPolicy construct test
 */
describe('PasswordPolicy', () => {
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
   * Number of IamUpdateAccountPasswordPolicy custom resource test
   */
  test(`${testNamePrefix} IamUpdateAccountPasswordPolicy custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::IamUpdateAccountPasswordPolicy', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomIamUpdateAccountPasswordPolicyCustomResourceProviderHandler63EDC7F4: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRoleC4ECAFE0'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRoleC4ECAFE0', 'Arn'],
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
        CustomIamUpdateAccountPasswordPolicyCustomResourceProviderRoleC4ECAFE0: {
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
                      Action: ['iam:UpdateAccountPasswordPolicy'],
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

  /**
   * IamUpdateAccountPasswordPolicy custom resource configuration test
   */
  test(`${testNamePrefix} IamUpdateAccountPasswordPolicy custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        PasswordPolicy4B0A08FE: {
          Type: 'Custom::IamUpdateAccountPasswordPolicy',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomIamUpdateAccountPasswordPolicyCustomResourceProviderHandler63EDC7F4', 'Arn'],
            },
            allowUsersToChangePassword: true,
            hardExpiry: true,
            maxPasswordAge: 90,
            minimumPasswordLength: 8,
            passwordReusePrevention: 5,
            requireLowercaseCharacters: true,
            requireNumbers: true,
            requireSymbols: true,
            requireUppercaseCharacters: true,
          },
        },
      },
    });
  });
});

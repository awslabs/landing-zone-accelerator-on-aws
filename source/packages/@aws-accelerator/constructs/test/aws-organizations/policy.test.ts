import * as cdk from 'aws-cdk-lib';
import { Policy, PolicyType } from '../../index';

const testNamePrefix = 'Construct(Policy): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new Policy(stack, 'Policy', {
  path: __dirname,
  name: 'TestPolicy',
  description: 'Testing Policy construct',
  type: PolicyType.SERVICE_CONTROL_POLICY,
  tags: [
    { Key: 'name', Value: 'TestPolicy' },
    { Key: 'usage', Value: 'ConstructTest' },
  ],
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 365,
  acceleratorPrefix: 'AWSAccelerator',
  managementAccountAccessRole: 'AWSControlTowerExecution',
});

/**
 * Policy construct test
 */
describe('Policy', () => {
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
   * Number of CreatePolicy custom resource test
   */
  test(`${testNamePrefix} CreatePolicy custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::CreatePolicy', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsCreatePolicyCustomResourceProviderHandler7A188619: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsCreatePolicyCustomResourceProviderRoleBA0ADB43'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsCreatePolicyCustomResourceProviderRoleBA0ADB43', 'Arn'],
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
        CustomOrganizationsCreatePolicyCustomResourceProviderRoleBA0ADB43: {
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
                        'organizations:CreatePolicy',
                        'organizations:ListPolicies',
                        'organizations:UpdatePolicy',
                      ],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                    {
                      Action: ['s3:GetObject'],
                      Effect: 'Allow',
                      Resource: {
                        'Fn::Join': [
                          '',
                          [
                            'arn:',
                            {
                              Ref: 'AWS::Partition',
                            },
                            ':s3:::',
                            {
                              'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
                            },
                            '/*',
                          ],
                        ],
                      },
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
   * CreatePolicy custom resource configuration test
   */
  test(`${testNamePrefix} CreatePolicy custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        Policy23B91518: {
          Type: 'Custom::CreatePolicy',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsCreatePolicyCustomResourceProviderHandler7A188619', 'Arn'],
            },
            bucket: {
              'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
            },
            description: 'Testing Policy construct',
            name: 'TestPolicy',
            tags: [
              {
                Key: 'name',
                Value: 'TestPolicy',
              },
              {
                Key: 'usage',
                Value: 'ConstructTest',
              },
            ],
            type: 'SERVICE_CONTROL_POLICY',
          },
        },
      },
    });
  });
});

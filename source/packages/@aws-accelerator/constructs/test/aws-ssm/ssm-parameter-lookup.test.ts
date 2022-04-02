import * as cdk from 'aws-cdk-lib';
import { SsmParameterLookup } from '../../index';

const testNamePrefix = 'Construct(SsmParameterLookup): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SsmParameterLookup(stack, 'SsmParameter', {
  name: 'TestParameter',
  accountId: '123123123123',
  logRetentionInDays: 365,
});

/**
 * SsmParameterLookup construct test
 */
describe('SsmParameterLookup', () => {
  /**
   * Number of Lambda Function test
   */
  test(`${testNamePrefix} Lambda Function count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Lambda::Function', 2);
  });

  /**
   * Number of IAM Role test
   */
  test(`${testNamePrefix} IAM Role count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::IAM::Role', 2);
  });

  /**
   * Number of Custom resource SsmGetParameterValue test
   */
  test(`${testNamePrefix} Custom resource SsmGetParameterValue count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SsmGetParameterValue', 1);
  });

  /**
   * Custom resource SsmParameterLookup configuration test
   */
  test(`${testNamePrefix} Custom resource SsmParameter configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameter39B3125C: {
          Type: 'Custom::SsmGetParameterValue',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['SsmParameterCustomResourceProviderframeworkonEventE9ED19F6', 'Arn'],
            },
            assumeRoleArn: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  ':iam::123123123123:role/AWSAccelerator-CrossAccount-SsmParameter-Role',
                ],
              ],
            },
            invokingAccountID: {
              Ref: 'AWS::AccountId',
            },
            parameterAccountID: '123123123123',
            parameterName: 'TestParameter',
            region: {
              Ref: 'AWS::Region',
            },
          },
        },
      },
    });
  });

  /**
   * Custom resource provider framework SSM get parameter lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework SSM get parameter lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameterCustomResourceProviderframeworkonEventE9ED19F6: {
          Type: 'AWS::Lambda::Function',
          DependsOn: [
            'SsmParameterCustomResourceProviderframeworkonEventServiceRoleDefaultPolicyF43DF488',
            'SsmParameterCustomResourceProviderframeworkonEventServiceRoleE1067FDA',
          ],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Description: 'AWS CDK resource provider framework - onEvent (Default/SsmParameter/CustomResourceProvider)',
            Environment: {
              Variables: {
                USER_ON_EVENT_FUNCTION_ARN: {
                  'Fn::GetAtt': ['SsmParameterSsmGetParameterValueFunction6BB47C65', 'Arn'],
                },
              },
            },
            Handler: 'framework.onEvent',
            Role: {
              'Fn::GetAtt': ['SsmParameterCustomResourceProviderframeworkonEventServiceRoleE1067FDA', 'Arn'],
            },
            Runtime: 'nodejs12.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * Custom resource provider framework SSM get parameter lambda function IAM role policy configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework SSM get parameter lambda function IAM role policy configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameterCustomResourceProviderframeworkonEventServiceRoleDefaultPolicyF43DF488: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: 'lambda:InvokeFunction',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::GetAtt': ['SsmParameterSsmGetParameterValueFunction6BB47C65', 'Arn'],
                  },
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'SsmParameterCustomResourceProviderframeworkonEventServiceRoleDefaultPolicyF43DF488',
            Roles: [
              {
                Ref: 'SsmParameterCustomResourceProviderframeworkonEventServiceRoleE1067FDA',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Custom resource provider framework SSM get parameter lambda function IAM role configuration test
   */
  test(`${testNamePrefix} Custom resource provider framework SSM get parameter lambda function IAM role configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameterCustomResourceProviderframeworkonEventServiceRoleE1067FDA: {
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
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
                  ],
                ],
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Custom resource SsmGetParameterValue lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource SsmGetParameterValue lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameterSsmGetParameterValueFunction6BB47C65: {
          Type: 'AWS::Lambda::Function',
          DependsOn: [
            'SsmParameterSsmGetParameterValueFunctionServiceRoleDefaultPolicy243037AF',
            'SsmParameterSsmGetParameterValueFunctionServiceRoleFC60F9A0',
          ],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Description: 'Custom resource provider to get ssm parameter TestParameter value',
            Handler: 'index.handler',
            Role: {
              'Fn::GetAtt': ['SsmParameterSsmGetParameterValueFunctionServiceRoleFC60F9A0', 'Arn'],
            },
            Runtime: 'nodejs14.x',
          },
        },
      },
    });
  });

  /**
   * Custom resource SsmGetParameterValue IAM Role Policy lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource SsmGetParameterValue lambda function IAM Role Policy configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameterSsmGetParameterValueFunctionServiceRoleDefaultPolicy243037AF: {
          Type: 'AWS::IAM::Policy',
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Action: ['ssm:GetParameters', 'ssm:GetParameter', 'ssm:DescribeParameters'],
                  Effect: 'Allow',
                  Resource: '*',
                  Sid: 'SsmGetParameterActions',
                },
                {
                  Action: 'sts:AssumeRole',
                  Effect: 'Allow',
                  Resource: {
                    'Fn::Join': [
                      '',
                      [
                        'arn:',
                        {
                          Ref: 'AWS::Partition',
                        },
                        ':iam::123123123123:role/AWSAccelerator-CrossAccount-SsmParameter-Role',
                      ],
                    ],
                  },
                  Sid: 'StsAssumeRoleActions',
                },
              ],
              Version: '2012-10-17',
            },
            PolicyName: 'SsmParameterSsmGetParameterValueFunctionServiceRoleDefaultPolicy243037AF',
            Roles: [
              {
                Ref: 'SsmParameterSsmGetParameterValueFunctionServiceRoleFC60F9A0',
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Custom resource SsmGetParameterValue IAM Role lambda function configuration test
   */
  test(`${testNamePrefix} Custom resource SsmGetParameterValue lambda function IAM Role configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        SsmParameterSsmGetParameterValueFunctionServiceRoleFC60F9A0: {
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
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    ':iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
                  ],
                ],
              },
            ],
          },
        },
      },
    });
  });
});

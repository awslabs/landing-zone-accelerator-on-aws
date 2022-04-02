import * as cdk from 'aws-cdk-lib';
import { SecurityHubStandards } from '../../index';

const testNamePrefix = 'Construct(SecurityHubStandards): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new SecurityHubStandards(stack, 'SecurityHubStandards', {
  standards: [
    {
      name: 'AWS Foundational Security Best Practices v1.0.0',
      enable: true,
      controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
    },
    {
      name: 'PCI DSS v3.2.1',
      enable: true,
      controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
    },
  ],
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 365,
});

/**
 * SecurityHubStandards construct test
 */
describe('SecurityHubStandards', () => {
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
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::SecurityHubBatchEnableStandards', 1);
  });

  /**
   * SecurityHubStandards custom resource lambda function configuration test
   */
  test(`${testNamePrefix} SecurityHubStandards custom resource lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubBatchEnableStandardsCustomResourceProviderHandler4BE622C1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole1ABC8ED2'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole1ABC8ED2', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * SecurityHubStandards custom resource iam role test
   */
  test(`${testNamePrefix} SecurityHubStandards custom resource iam role test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomSecurityHubBatchEnableStandardsCustomResourceProviderRole1ABC8ED2: {
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
                        'securityhub:BatchDisableStandards',
                        'securityhub:BatchEnableStandards',
                        'securityhub:DescribeStandards',
                        'securityhub:DescribeStandardsControls',
                        'securityhub:EnableSecurityHub',
                        'securityhub:GetEnabledStandards',
                        'securityhub:UpdateStandardsControl',
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
        SecurityHubStandards294083BB: {
          Type: 'Custom::SecurityHubBatchEnableStandards',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomSecurityHubBatchEnableStandardsCustomResourceProviderHandler4BE622C1', 'Arn'],
            },
            region: {
              Ref: 'AWS::Region',
            },
            standards: [
              {
                controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
                enable: true,
                name: 'AWS Foundational Security Best Practices v1.0.0',
              },
              {
                controlsToDisable: ['IAM.1', 'EC2.10', 'Lambda.4'],
                enable: true,
                name: 'PCI DSS v3.2.1',
              },
            ],
          },
        },
      },
    });
  });

  //End of file
});

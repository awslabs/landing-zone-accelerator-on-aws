import * as cdk from 'aws-cdk-lib';
import { EnablePolicyType, PolicyTypeEnum } from '../../index';

const testNamePrefix = 'Construct(EnablePolicyType): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new EnablePolicyType(stack, 'EnablePolicyType', { policyType: PolicyTypeEnum.SERVICE_CONTROL_POLICY });
/**
 * EnablePolicyType construct test
 */
describe('EnablePolicyType', () => {
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
   * Number of EnablePolicyType custom resource test
   */
  test(`${testNamePrefix} EnablePolicyType custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::EnablePolicyType', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomEnablePolicyTypeCustomResourceProviderHandlerC244F9E1: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomEnablePolicyTypeCustomResourceProviderRoleAE71B2CA'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomEnablePolicyTypeCustomResourceProviderRoleAE71B2CA', 'Arn'],
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
        CustomEnablePolicyTypeCustomResourceProviderRoleAE71B2CA: {
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
                        'organizations:DescribeOrganization',
                        'organizations:DisablePolicyType',
                        'organizations:EnablePolicyType',
                        'organizations:ListRoots',
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

  /**
   * EnablePolicyType custom resource configuration test
   */
  test(`${testNamePrefix} EnablePolicyType custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        EnablePolicyTypeA517D946: {
          Type: 'Custom::EnablePolicyType',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomEnablePolicyTypeCustomResourceProviderHandlerC244F9E1', 'Arn'],
            },
            policyType: 'SERVICE_CONTROL_POLICY',
          },
        },
      },
    });
  });
});

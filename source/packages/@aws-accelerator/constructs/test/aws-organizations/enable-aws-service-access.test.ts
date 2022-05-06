import * as cdk from 'aws-cdk-lib';
import { EnableAwsServiceAccess } from '../../index';

const testNamePrefix = 'Construct(EnableAwsServiceAccess): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new EnableAwsServiceAccess(stack, 'EnableAwsServiceAccess', {
  servicePrincipal: 's3.amazonaws.com',
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * EnableAwsServiceAccess construct test
 */
describe('EnableAwsServiceAccess', () => {
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
   * Number of EnableAwsServiceAccess custom resource test
   */
  test(`${testNamePrefix} EnableAwsServiceAccess custom resource count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::EnableAwsServiceAccess', 1);
  });

  /**
   * Lambda Function resource configuration test
   */
  test(`${testNamePrefix} Lambda Function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderHandlerDCD56D71: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole59F76BA2'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole59F76BA2', 'Arn'],
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
        CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderRole59F76BA2: {
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
                      Action: ['organizations:DisableAWSServiceAccess', 'organizations:EnableAwsServiceAccess'],
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
   * EnableAwsServiceAccess custom resource configuration test
   */
  test(`${testNamePrefix} EnableAwsServiceAccess custom resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        EnableAwsServiceAccessFCD8AE04: {
          Type: 'Custom::EnableAwsServiceAccess',
          UpdateReplacePolicy: 'Delete',
          DeletionPolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomOrganizationsEnableAwsServiceAccessCustomResourceProviderHandlerDCD56D71', 'Arn'],
            },
            servicePrincipal: 's3.amazonaws.com',
          },
        },
      },
    });
  });
});

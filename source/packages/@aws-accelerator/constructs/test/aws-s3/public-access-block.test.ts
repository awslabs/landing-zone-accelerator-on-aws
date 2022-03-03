import * as cdk from 'aws-cdk-lib';
import { S3PublicAccessBlock } from '@aws-accelerator/constructs';

const testNamePrefix = 'Construct(S3PublicAccessBlock): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new S3PublicAccessBlock(stack, 'S3PublicAccessBlock', {
  blockPublicAcls: true,
  blockPublicPolicy: true,
  ignorePublicAcls: true,
  restrictPublicBuckets: true,
  accountId: stack.account,
});

/**
 * CentralLogsBucket construct test
 */
describe('S3PublicAccessBlock', () => {
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
    cdk.assertions.Template.fromStack(stack).resourceCountIs('Custom::PutPublicAccessBlock', 1);
  });

  /**
   * S3PublicAccessBlock custom resource lambda function configuration test
   */
  test(`${testNamePrefix} S3PublicAccessBlock custom resource lambda function configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomS3PutPublicAccessBlockCustomResourceProviderHandler978E227B: {
          Type: 'AWS::Lambda::Function',
          DependsOn: ['CustomS3PutPublicAccessBlockCustomResourceProviderRole656EB36E'],
          Properties: {
            Code: {
              S3Bucket: {
                'Fn::Sub': 'cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}',
              },
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomS3PutPublicAccessBlockCustomResourceProviderRole656EB36E', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });

  /**
   * S3PublicAccessBlock custom resource iam role test
   */
  test(`${testNamePrefix} S3PublicAccessBlock custom resource iam role test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CustomS3PutPublicAccessBlockCustomResourceProviderRole656EB36E: {
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
                      Action: ['s3:PutAccountPublicAccessBlock'],
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
   * S3PublicAccessBlock custom resource test
   */
  test(`${testNamePrefix} S3PublicAccessBlock custom resource test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        S3PublicAccessBlock344F906B: {
          Type: 'Custom::PutPublicAccessBlock',
          DeletionPolicy: 'Delete',
          UpdateReplacePolicy: 'Delete',
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomS3PutPublicAccessBlockCustomResourceProviderHandler978E227B', 'Arn'],
            },
            accountId: {
              Ref: 'AWS::AccountId',
            },
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
          },
        },
      },
    });
  });
});

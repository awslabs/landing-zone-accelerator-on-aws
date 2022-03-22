import * as cdk from 'aws-cdk-lib';

import { ReportDefinition } from '../../lib/aws-cur/report-definition';

const testNamePrefix = 'Construct(ReportDefinition): ';

const app = new cdk.App();

// Create stack for native Cfn construct
const nativeEnv = { account: '333333333333', region: 'us-east-1' };
const nativeStack = new cdk.Stack(app, 'NativeStack', { env: nativeEnv });
const nativeBucket = new cdk.aws_s3.Bucket(nativeStack, 'TestBucket');

// Create stack for custom Cfn construct
const customEnv = { account: '333333333333', region: 'us-west-1' };
const customStack = new cdk.Stack(app, 'CustomStack', { env: customEnv });
const customBucket = new cdk.aws_s3.Bucket(customStack, 'TestBucket');

// Create report definitions for each stack
new ReportDefinition(nativeStack, 'TestReportDefinition', {
  compression: 'Parquet',
  format: 'Parquet',
  refreshClosedReports: true,
  reportName: 'Test',
  reportVersioning: 'OVERWRITE_REPORT',
  s3Bucket: nativeBucket,
  s3Prefix: 'test',
  s3Region: cdk.Stack.of(nativeStack).region,
  timeUnit: 'DAILY',
});

new ReportDefinition(customStack, 'TestReportDefinition', {
  compression: 'Parquet',
  format: 'Parquet',
  refreshClosedReports: true,
  reportName: 'Test',
  reportVersioning: 'OVERWRITE_REPORT',
  s3Bucket: customBucket,
  s3Prefix: 'test',
  s3Region: cdk.Stack.of(customStack).region,
  timeUnit: 'DAILY',
});

/**
 * Report Definition construct test
 */
describe('ReportDefinition', () => {
  /**
   * Native report definition resource count tets
   */
  test(`${testNamePrefix} Native report definition resource count test`, () => {
    cdk.assertions.Template.fromStack(nativeStack).resourceCountIs('AWS::CUR::ReportDefinition', 1);
  });

  /**
   * Native bucket policy resource count test
   */
  test(`${testNamePrefix} Native bucket policy resource count test`, () => {
    cdk.assertions.Template.fromStack(nativeStack).resourceCountIs('AWS::S3::BucketPolicy', 1);
  });

  /**
   * Custom report definition resource count tets
   */
  test(`${testNamePrefix} Custom report definition resource count test`, () => {
    cdk.assertions.Template.fromStack(customStack).resourceCountIs('Custom::CrossRegionReportDefinition', 1);
  });

  /**
   * Custom bucket policy resource count test
   */
  test(`${testNamePrefix} Custom bucket policy resource count test`, () => {
    cdk.assertions.Template.fromStack(customStack).resourceCountIs('AWS::S3::BucketPolicy', 1);
  });

  /**
   * Custom IAM role resource count test
   */
  test(`${testNamePrefix} Custom IAM role resource count test`, () => {
    cdk.assertions.Template.fromStack(customStack).resourceCountIs('AWS::IAM::Role', 1);
  });

  /**
   * Custom Lambda function resource count test
   */
  test(`${testNamePrefix} Custom Lambda function resource count test`, () => {
    cdk.assertions.Template.fromStack(customStack).resourceCountIs('AWS::Lambda::Function', 1);
  });

  /**
   * Native report definition resource configuration test
   */
  test(`${testNamePrefix} Native report definition resource configuration test`, () => {
    cdk.assertions.Template.fromStack(nativeStack).templateMatches({
      Resources: {
        TestReportDefinition9701AAC4: {
          Type: 'AWS::CUR::ReportDefinition',
          DependsOn: ['TestBucketPolicyBA12ED38'],
          Properties: {
            Compression: 'Parquet',
            Format: 'Parquet',
            RefreshClosedReports: true,
            ReportName: 'Test',
            ReportVersioning: 'OVERWRITE_REPORT',
            S3Bucket: { Ref: 'TestBucket560B80BC' },
            S3Prefix: 'test',
            S3Region: 'us-east-1',
            TimeUnit: 'DAILY',
          },
        },
      },
    });
  });

  /**
   * Native bucket policy resource configuration test
   */
  test(`${testNamePrefix} Native bucket policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(nativeStack).templateMatches({
      Resources: {
        TestBucketPolicyBA12ED38: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: { Ref: 'TestBucket560B80BC' },
            PolicyDocument: {
              Statement: [
                {
                  Action: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'billingreports.amazonaws.com',
                  },
                  Resource: {
                    'Fn::GetAtt': ['TestBucket560B80BC', 'Arn'],
                  },
                  Condition: {
                    StringEquals: {
                      'aws:SourceAccount': { Ref: 'AWS::AccountId' },
                      'aws:SourceArn': {
                        'Fn::Join': ['', ['arn:aws:cur:us-east-1:', { Ref: 'AWS::AccountId' }, ':definition/*']],
                      },
                    },
                  },
                },
                {
                  Action: 's3:PutObject',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'billingreports.amazonaws.com',
                  },
                  Resource: {
                    'Fn::Join': ['', [{ 'Fn::GetAtt': ['TestBucket560B80BC', 'Arn'] }, '/*']],
                  },
                  Condition: {
                    StringEquals: {
                      'aws:SourceAccount': { Ref: 'AWS::AccountId' },
                      'aws:SourceArn': {
                        'Fn::Join': ['', ['arn:aws:cur:us-east-1:', { Ref: 'AWS::AccountId' }, ':definition/*']],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });
  });

  /**
   * Custom report definition resource configuration test
   */
  test(`${testNamePrefix} Custom report definition resource configuration test`, () => {
    cdk.assertions.Template.fromStack(customStack).templateMatches({
      Resources: {
        TestReportDefinition9701AAC4: {
          Type: 'Custom::CrossRegionReportDefinition',
          DependsOn: ['TestBucketPolicyBA12ED38'],
          Properties: {
            ServiceToken: {
              'Fn::GetAtt': ['CustomCrossRegionReportDefinitionCustomResourceProviderHandler8E3AEE17', 'Arn'],
            },
            reportDefinition: {
              AdditionalSchemaElements: [],
              Compression: 'Parquet',
              Format: 'Parquet',
              RefreshClosedReports: true,
              ReportName: 'Test',
              ReportVersioning: 'OVERWRITE_REPORT',
              S3Bucket: { Ref: 'TestBucket560B80BC' },
              S3Prefix: 'test',
              S3Region: 'us-west-1',
              TimeUnit: 'DAILY',
            },
          },
        },
      },
    });
  });

  /**
   * Custom bucket policy resource configuration test
   */
  test(`${testNamePrefix} Custom bucket policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(customStack).templateMatches({
      Resources: {
        TestBucketPolicyBA12ED38: {
          Type: 'AWS::S3::BucketPolicy',
          Properties: {
            Bucket: { Ref: 'TestBucket560B80BC' },
            PolicyDocument: {
              Statement: [
                {
                  Action: ['s3:GetBucketAcl', 's3:GetBucketPolicy'],
                  Effect: 'Allow',
                  Principal: {
                    Service: 'billingreports.amazonaws.com',
                  },
                  Resource: {
                    'Fn::GetAtt': ['TestBucket560B80BC', 'Arn'],
                  },
                  Condition: {
                    StringEquals: {
                      'aws:SourceAccount': { Ref: 'AWS::AccountId' },
                      'aws:SourceArn': {
                        'Fn::Join': ['', ['arn:aws:cur:us-east-1:', { Ref: 'AWS::AccountId' }, ':definition/*']],
                      },
                    },
                  },
                },
                {
                  Action: 's3:PutObject',
                  Effect: 'Allow',
                  Principal: {
                    Service: 'billingreports.amazonaws.com',
                  },
                  Resource: {
                    'Fn::Join': ['', [{ 'Fn::GetAtt': ['TestBucket560B80BC', 'Arn'] }, '/*']],
                  },
                  Condition: {
                    StringEquals: {
                      'aws:SourceAccount': { Ref: 'AWS::AccountId' },
                      'aws:SourceArn': {
                        'Fn::Join': ['', ['arn:aws:cur:us-east-1:', { Ref: 'AWS::AccountId' }, ':definition/*']],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });
  });

  /**
   * Custom IAM role resource configuration test
   */
  test(`${testNamePrefix} Custom IAM role resource configuration test`, () => {
    cdk.assertions.Template.fromStack(customStack).templateMatches({
      Resources: {
        CustomCrossRegionReportDefinitionCustomResourceProviderRole845A4C3A: {
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
                      Action: ['cur:DeleteReportDefinition', 'cur:ModifyReportDefinition', 'cur:PutReportDefinition'],
                      Effect: 'Allow',
                      Resource: '*',
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
  });

  /**
   * Custom Lambda function resource configuration test
   */
  test(`${testNamePrefix} Custom Lambda function resource configuration test`, () => {
    cdk.assertions.Template.fromStack(customStack).templateMatches({
      Resources: {
        CustomCrossRegionReportDefinitionCustomResourceProviderHandler8E3AEE17: {
          Type: 'AWS::Lambda::Function',
          Properties: {
            Code: {
              S3Bucket: 'cdk-hnb659fds-assets-333333333333-us-west-1',
              S3Key: cdk.assertions.Match.stringLikeRegexp('\\w+.zip'),
            },
            Handler: '__entrypoint__.handler',
            MemorySize: 128,
            Role: {
              'Fn::GetAtt': ['CustomCrossRegionReportDefinitionCustomResourceProviderRole845A4C3A', 'Arn'],
            },
            Runtime: 'nodejs14.x',
            Timeout: 900,
          },
        },
      },
    });
  });
});

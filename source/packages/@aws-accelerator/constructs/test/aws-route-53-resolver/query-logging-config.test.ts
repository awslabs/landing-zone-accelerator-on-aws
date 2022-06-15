/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import * as cdk from 'aws-cdk-lib';

import {
  QueryLoggingConfig,
  QueryLoggingConfigAssociation,
} from '../../lib/aws-route-53-resolver/query-logging-config';

const testNamePrefix = 'Construct(QueryLoggingConfig): ';

const stack = new cdk.Stack();

// Instantiate resources required for construct
const bucket = cdk.aws_s3.Bucket.fromBucketName(stack, 'TestBucket', 'testbucket');
const logGroup = new cdk.aws_logs.LogGroup(stack, 'TestLogGroup');

// S3 query logging config
const s3Config = new QueryLoggingConfig(stack, 'S3QueryLoggingTest', {
  destination: bucket,
  name: 'S3QueryLoggingTest',
});

// CloudWatch Logs query logging config
new QueryLoggingConfig(stack, 'CwlQueryLoggingTest', {
  destination: logGroup,
  name: 'CwlQueryLoggingTest',
  organizationId: 'o-123test',
});

// Config association
new QueryLoggingConfigAssociation(stack, 'TestQueryLoggingAssoc', {
  resolverQueryLogConfigId: s3Config.logId,
  vpcId: 'TestVpc',
});

describe('QueryLoggingConfig', () => {
  /**
   * Query logging config count test
   */
  test(`${testNamePrefix} Query log configuration count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53Resolver::ResolverQueryLoggingConfig', 2);
  });

  /**
   * Query logging config association count test
   */
  test(`${testNamePrefix} Query log configuration association count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs(
      'AWS::Route53Resolver::ResolverQueryLoggingConfigAssociation',
      1,
    );
  });

  /**
   * CloudWatch log group resource policy count test
   */
  test(`${testNamePrefix} Log group policy count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Logs::ResourcePolicy', 1);
  });

  /**
   * S3 Query Logging config resource config test
   */
  test(`${testNamePrefix} S3 query logging config resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        S3QueryLoggingTestA05F494B: {
          Type: 'AWS::Route53Resolver::ResolverQueryLoggingConfig',
          Properties: {
            DestinationArn: {
              'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':s3:::testbucket']],
            },
          },
        },
      },
    });
  });

  /**
   * CloudWatch log query logging config resource config test
   */
  test(`${testNamePrefix} CWL query logging config resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        CwlQueryLoggingTest70DD9614: {
          Type: 'AWS::Route53Resolver::ResolverQueryLoggingConfig',
          Properties: {
            DestinationArn: {
              'Fn::GetAtt': ['TestLogGroup4EEF7AD4', 'Arn'],
            },
          },
        },
      },
    });
  });

  /**
   * CloudWatch Logs resource policy resource config test
   */
  test(`${testNamePrefix} CloudWatch Logs resource policy resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestLogGroupPolicyResourcePolicyFDE53895: {
          Type: 'AWS::Logs::ResourcePolicy',
          Properties: {
            PolicyDocument: {
              'Fn::Join': [
                '',
                [
                  '{"Statement":[{"Action":["logs:CreateLogStream","logs:PutLogEvents"],"Effect":"Allow","Principal":{"Service":"delivery.logs.amazonaws.com"},"Resource":"',
                  {
                    'Fn::GetAtt': ['TestLogGroup4EEF7AD4', 'Arn'],
                  },
                  ':log-stream:*","Sid":"Allow log delivery access"}],"Version":"2012-10-17"}',
                ],
              ],
            },
          },
        },
      },
    });
  });
});

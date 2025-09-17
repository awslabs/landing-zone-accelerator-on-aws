/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { describe, beforeEach, test } from 'vitest';
import { Template } from 'aws-cdk-lib/assertions';
import {
  MacieExportConfigClassification,
  MacieExportConfigClassificationProps,
} from '../../lib/aws-macie/macie-export-config-classification';

describe('MacieExportConfigClassification', () => {
  let stack: cdk.Stack;
  let template: Template;
  let mockProps: MacieExportConfigClassificationProps;

  beforeEach(() => {
    const app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');

    mockProps = {
      bucketName: 'mock-bucket',
      bucketKmsKey: cdk.aws_kms.Key.fromKeyArn(
        stack,
        'BucketKey',
        'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      ),
      keyPrefix: 'mock-prefix',
      logKmsKey: cdk.aws_kms.Key.fromKeyArn(
        stack,
        'LogKey',
        'arn:aws:kms:us-east-1:123456789012:key/87654321-4321-4321-4321-210987654321',
      ),
      logRetentionInDays: 7,
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      publishClassificationFindings: true,
      publishPolicyFindings: true,
    };

    new MacieExportConfigClassification(stack, 'TestConstruct', mockProps);
    template = Template.fromStack(stack);
  });

  test('CustomResource is created with correct properties', () => {
    template.hasResourceProperties('Custom::MaciePutClassificationExportConfiguration', {
      ServiceToken: {
        'Fn::GetAtt': ['CustomMaciePutClassificationExportConfigurationCustomResourceProviderHandlerC53E2FCC', 'Arn'],
      },
      bucketName: 'mock-bucket',
      keyPrefix: 'mock-prefix',
      kmsKeyArn: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012',
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      publishClassificationFindings: true,
      publishPolicyFindings: true,
    });
  });

  test('Lambda function is created for custom resource provider', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs20.x',
    });
  });

  test('LogGroup is created with correct properties', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      RetentionInDays: 7,
      KmsKeyId: 'arn:aws:kms:us-east-1:123456789012:key/87654321-4321-4321-4321-210987654321',
    });
  });

  test('IAM role has correct permissions', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
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
    });
  });
});

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

import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { jest } from '@jest/globals';
import {
  MacieExportConfigClassification,
  MacieExportConfigClassificationProps,
} from '../../lib/aws-macie/macie-export-config-classification';

// Mock CDK constructs
jest.mock('constructs', () => ({
  Construct: jest.fn().mockImplementation(function () {
    // This empty function will replace the actual Construct constructor
  }),
}));

jest.mock('aws-cdk-lib', () => ({
  CustomResource: jest.fn(),
  CustomResourceProvider: {
    getOrCreateProvider: jest.fn(),
  },
  CustomResourceProviderRuntime: {
    NODEJS_18_X: 'nodejs18.x',
    NODEJS_20_X: 'nodejs20.x',
  },
  aws_lambda: {
    Runtime: {
      NODEJS_18_X: 'nodejs18.x',
      NODEJS_20_X: 'nodejs20.x',
    },
  },
  Stack: {
    of: () => ({
      region: 'mock-region',
      node: {
        tryFindChild: jest.fn(),
      },
    }),
  },
  aws_logs: {
    LogGroup: jest.fn(),
  },
  RemovalPolicy: {
    DESTROY: 'destroy',
  },
}));

describe('MacieExportConfigClassification', () => {
  let mockProps: MacieExportConfigClassificationProps;
  let mockScope: Construct;

  beforeEach(() => {
    (cdk.CustomResource as unknown as jest.Mock).mockImplementation(() => {
      return {
        node: {
          addDependency: jest.fn(),
        },
        ref: 'random-ref',
      };
    });
    (cdk.CustomResourceProvider.getOrCreateProvider as unknown as jest.Mock).mockImplementation(() => ({
      serviceToken: 'mock-service-token',
      addToRolePolicy: jest.fn(),
      node: {
        id: 'provider-node-id',
        findChild: () => ({ ref: 'find-child-ref' }),
      },
    }));
    mockProps = {
      bucketName: 'mock-bucket',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bucketKmsKey: { keyArn: 'mock-kms-arn' } as any,
      keyPrefix: 'mock-prefix',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logKmsKey: { keyArn: 'mock-log-kms-arn' } as any,
      logRetentionInDays: 7,
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
      publishClassificationFindings: true,
      publishPolicyFindings: true,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockScope = new Construct(null as any, 'MockScope');

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  test('CustomResource is created with correct properties', () => {
    new MacieExportConfigClassification(mockScope, 'TestConstruct', mockProps);

    expect(cdk.CustomResource).toHaveBeenCalledWith(expect.any(Object), 'Resource', {
      resourceType: 'Custom::MaciePutClassificationExportConfiguration',
      serviceToken: 'mock-service-token',
      properties: {
        region: 'mock-region',
        bucketName: mockProps.bucketName,
        keyPrefix: mockProps.keyPrefix,
        kmsKeyArn: mockProps.bucketKmsKey.keyArn,
        findingPublishingFrequency: mockProps.findingPublishingFrequency,
        publishClassificationFindings: mockProps.publishClassificationFindings,
        publishPolicyFindings: mockProps.publishPolicyFindings,
      },
    });
  });

  test('CustomResourceProvider is created with correct properties', () => {
    new MacieExportConfigClassification(mockScope, 'TestConstruct', mockProps);

    expect(cdk.CustomResourceProvider.getOrCreateProvider).toHaveBeenCalledWith(
      expect.any(Object),
      'Custom::MaciePutClassificationExportConfiguration',
      {
        codeDirectory: expect.stringContaining('put-export-config-classification/dist'),
        runtime: 'nodejs20.x',
        policyStatements: [
          {
            Sid: 'MaciePutClassificationExportConfigurationTaskMacieActions',
            Effect: 'Allow',
            Action: [
              'macie2:EnableMacie',
              'macie2:GetClassificationExportConfiguration',
              'macie2:UpdateMacieSession',
              'macie2:GetMacieSession',
              'macie2:PutClassificationExportConfiguration',
              'macie2:PutFindingsPublicationConfiguration',
            ],
            Resource: '*',
          },
        ],
      },
    );
  });

  test('LogGroup is created with correct properties', () => {
    new MacieExportConfigClassification(mockScope, 'TestConstruct', mockProps);

    expect(cdk.aws_logs.LogGroup).toHaveBeenCalledWith(expect.any(Object), expect.any(String), {
      logGroupName: expect.stringContaining('/aws/lambda/'),
      retention: mockProps.logRetentionInDays,
      encryptionKey: mockProps.logKmsKey,
      removalPolicy: 'destroy',
    });
  });
});

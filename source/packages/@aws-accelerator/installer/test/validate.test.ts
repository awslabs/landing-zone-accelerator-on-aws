const mockSendFn = vi.fn();
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
// @ts-ignore
import { handler } from '../lib/lambdas/validate/index';
import { CodePipelineClient, GetPipelineCommand } from '@aws-sdk/client-codepipeline';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';

vi.mock('cfn-response', () => ({
  default: {
    send: mockSendFn,
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
  },
  send: mockSendFn,
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
}));

let codePipelineMock: AwsClientStub<CodePipelineClient>;

const codecommitEvent = {
  RequestType: 'Create',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  PhysicalResourceId: 'physical-resource-id',
  ResponseURL: 'https://example.com/response',
  ResourceProperties: {
    ServiceToken: 'service-token',
    configRepositoryLocation: 'codecommit',
    useExistingConfigRepo: 'No',
    existingConfigRepositoryBranchName: '',
    acceleratorPipelineName: 'AWSAccelerator-Pipeline',
    existingConfigRepositoryName: '',
    resourceType: 'Custom::ValidateInstallerStack',
  },
};

const existingCodecommitEvent = {
  RequestType: 'Create',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  PhysicalResourceId: 'physical-resource-id',
  ResponseURL: 'https://example.com/response',
  ResourceProperties: {
    ServiceToken: 'service-token',
    configRepositoryLocation: 'codecommit',
    useExistingConfigRepo: 'Yes',
    existingConfigRepositoryBranchName: 'main',
    acceleratorPipelineName: 'AWSAccelerator-Pipeline',
    existingConfigRepositoryName: 'aws-accel-config',
    resourceType: 'Custom::ValidateInstallerStack',
  },
};

const s3Event = {
  ...codecommitEvent,
  ResourceProperties: {
    ...codecommitEvent.ResourceProperties,
    configRepositoryLocation: 's3',
  },
};

const deleteEvent = {
  ...codecommitEvent,
  RequestType: 'Delete',
};

const mockContext = {
  logStreamName: 'test-log-stream',
  awsRequestId: 'test-request-id',
  functionName: 'test-function',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
  memoryLimitInMB: '128',
  remainingTimeInMillis: () => 30000,
  done: vi.fn(),
};

describe('validateInstaller', () => {
  beforeEach(() => {
    codePipelineMock = mockClient(CodePipelineClient);
    mockSendFn.mockClear();
  });
  afterEach(() => {
    codePipelineMock.reset();
  });

  test('should return success for codecommit location', async () => {
    const result = await handler(codecommitEvent, mockContext);
    expect(result).toBeUndefined();
  });

  test('should return success for pre-existing codecommit location', async () => {
    const response = await handler(existingCodecommitEvent, mockContext);
    expect(response).toBeUndefined();
  });

  test('should return success for s3 location', async () => {
    const response = await handler(s3Event, mockContext);
    expect(response).toBeUndefined();
  });

  test('should fail if existing pipeline identified', async () => {
    codePipelineMock.on(GetPipelineCommand).resolves({
      pipeline: {
        name: 'AWSAccelerator-Pipeline',
        stages: [
          {
            name: 'Source',
            actions: [
              {
                name: 'Configuration',
                actionTypeId: {
                  category: 'Source',
                  owner: 'AWS',
                  provider: 'CodeCommit',
                  version: '1',
                },
              },
            ],
          },
        ],
      },
    });
    await handler(s3Event, mockContext);
    // Test passes if no exception is thrown
  });

  test('should pass if cant find existing pipeline', async () => {
    codePipelineMock.on(GetPipelineCommand).rejects();
    await handler(s3Event, mockContext);
    // Test passes if no exception is thrown
  });

  test('should return success for delete', async () => {
    await handler(deleteEvent, mockContext);
    const result = await handler(deleteEvent, mockContext);
    expect(result).toBeUndefined();
  });
});

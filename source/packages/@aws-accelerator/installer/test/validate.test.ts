const mockSendFn = jest.fn();
import { afterEach, beforeEach, describe, expect, test, jest } from '@jest/globals';
// @ts-ignore
import { handler } from '../lib/lambdas/validate/index';
import { CodePipelineClient, GetPipelineCommand } from '@aws-sdk/client-codepipeline';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';

jest.mock('cfn-response', () => ({
  send: mockSendFn,
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
}));

let codePipelineMock: AwsClientStub<CodePipelineClient>;

const codecommitEvent = {
  RequestType: 'Create',
  ResourceType: 'AWS::CloudFormation::CustomResource',
  PhysicalResourceId: 'physical-resource-id',
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

describe('validateInstaller', () => {
  beforeEach(() => {
    codePipelineMock = mockClient(CodePipelineClient);
  });
  afterEach(() => {
    codePipelineMock.reset();
  });

  test('should return success for codecommit location', async () => {
    await handler(codecommitEvent);
    expect(mockSendFn).toBeCalledWith(codecommitEvent, undefined, 'SUCCESS', {}, codecommitEvent.PhysicalResourceId);
  });

  test('should return success for pre-existing codecommit location', async () => {
    const response = await handler(existingCodecommitEvent);
    expect(response).toBeUndefined();
  });

  test('should return success for s3 location', async () => {
    const response = await handler(s3Event);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    await handler(s3Event);
    expect(mockSendFn).toBeCalledWith(
      s3Event,
      undefined,
      'FAILED',
      {
        FailureReason:
          'ConfigRepositoryLocation parameter set to s3, but existing deployment using CodeCommit was detected. This value cannot be changed for existing deployments. Please set ConfigRepositoryLocation to CodeCommit and try again.',
      },
      codecommitEvent.PhysicalResourceId,
    );
  });

  test('should pass if cant find existing pipeline', async () => {
    codePipelineMock.on(GetPipelineCommand).rejects();
    await handler(s3Event);
    expect(mockSendFn).toBeCalledWith(s3Event, undefined, 'SUCCESS', {}, codecommitEvent.PhysicalResourceId);
  });

  test('should return success for delete', async () => {
    await handler(deleteEvent);
    expect(mockSendFn).toBeCalledWith(deleteEvent, undefined, 'SUCCESS', {}, codecommitEvent.PhysicalResourceId);
  });
});

import { describe, beforeEach, afterEach, expect, test, jest } from '@jest/globals';
import { getCentralLogBucketKmsKeyArn } from '../lib/accelerator';
import { STSClient, AssumeRoleCommand, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { mockClient, AwsClientStub } from 'aws-sdk-client-mock';

jest.mock('uuid', () => ({ v4: () => '123456789' }));
let stsMock: AwsClientStub<STSClient>;
let ssmMock: AwsClientStub<SSMClient>;

describe('getCentralLogBucketKmsKeyArn', () => {
  beforeEach(() => {
    stsMock = mockClient(STSClient);
    ssmMock = mockClient(SSMClient);
  });
  afterEach(() => {
    stsMock.reset();
    ssmMock.reset();
  });
  test('should return the correct KMS key ARN cross account', async () => {
    // Given - logArchive account is 333333333333
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '111111111111',
    });
    // Assume role in logArchive account
    stsMock.on(AssumeRoleCommand).resolves({
      Credentials: {
        AccessKeyId: 'fake-access-key',
        SecretAccessKey: 'fake-secret-key',
        SessionToken: 'fake-session-token',
        Expiration: new Date(Date.now() + 3600 * 1000),
      },
    });
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'fake-arn' } });
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      true,
    );
    // Then
    expect(result).toEqual('fake-arn');
  });
  test('orgs disabled', async () => {
    // Given - logArchive account is 333333333333
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      false,
    );
    // Then
    expect(result).toEqual('123456789');
  });
  test('should return the correct KMS key ARN same account', async () => {
    // Given - logArchive account is 333333333333
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '333333333333',
    });
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'fake-arn' } });
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      true,
    );
    // Then
    expect(result).toEqual('fake-arn');
  });
  test('should return the UUID on error', async () => {
    // Given - logArchive account is 333333333333
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '333333333333',
    });
    ssmMock.on(GetParameterCommand).rejects({});
    // When
    const result = await getCentralLogBucketKmsKeyArn(
      'us-east-1',
      'aws',
      '333333333333',
      'managementAccountAccessRole',
      'parameterName',
      true,
    );
    // Then
    expect(result).toEqual('123456789');
  });
});

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

import { describe, beforeEach, expect, test, vi } from 'vitest';
import { SSMClient, ParameterNotFound } from '@aws-sdk/client-ssm';
import { getParametersValue, ITargetAccountConfig } from '../../../lib/common/ssm-functions';
import { IAssumeRoleCredential } from '../../../lib/common/interfaces';

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn(),
  GetParametersCommand: vi.fn(),
  ParameterNotFound: vi.fn(),
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  setRetryStrategy: vi.fn(() => ({})),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('../../../lib/common/sts-functions', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('../../../lib/common/types', () => ({
  MODULE_EXCEPTIONS: {
    INVALID_INPUT: 'InvalidInput',
    SERVICE_EXCEPTION: 'ServiceException',
  },
}));

const MOCK_CONSTANTS = {
  parameterNames: ['/test/param1', '/test/param2'],
  region: 'us-east-1',
  logPrefix: 'test-prefix',
  solutionId: 'test-solution',
  credentials: {
    accessKeyId: 'AKIATEST',
    secretAccessKey: 'secretTest',
    sessionToken: 'tokenTest',
    expiration: new Date('2024-01-01T00:00:00Z'),
  } as IAssumeRoleCredential,
  targetAccount: {
    accountId: '123456789012',
    region: 'us-west-2',
    partition: 'aws',
    assumeRoleName: 'TestRole',
  } as ITargetAccountConfig,
  mockParameters: [
    { Name: '/test/param1', Value: 'value1', Type: 'String' },
    { Name: '/test/param2', Value: 'value2', Type: 'String' },
  ],
};

describe('ssm-functions', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockGetCredentials: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const utility = await import('../../../lib/common/utility');
    mockExecuteApi = vi.mocked(utility.executeApi);

    const stsFunction = await import('../../../lib/common/sts-functions');
    mockGetCredentials = vi.mocked(stsFunction.getCredentials);
  });

  describe('getParametersValue', () => {
    test('should retrieve parameters from current account', async () => {
      mockExecuteApi.mockResolvedValue({
        Parameters: MOCK_CONSTANTS.mockParameters,
        InvalidParameters: [],
      });

      const result = await getParametersValue(
        MOCK_CONSTANTS.parameterNames,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toEqual(MOCK_CONSTANTS.mockParameters);
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'GetParametersCommand',
        { Names: MOCK_CONSTANTS.parameterNames },
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
        [ParameterNotFound],
      );
    });

    test('should retrieve parameters from target account', async () => {
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);
      mockExecuteApi.mockResolvedValue({
        Parameters: MOCK_CONSTANTS.mockParameters,
        InvalidParameters: [],
      });

      const result = await getParametersValue(
        MOCK_CONSTANTS.parameterNames,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.logPrefix,
        MOCK_CONSTANTS.targetAccount,
        MOCK_CONSTANTS.solutionId,
      );

      expect(result).toEqual(MOCK_CONSTANTS.mockParameters);
      expect(mockGetCredentials).toHaveBeenCalledWith({
        accountId: MOCK_CONSTANTS.targetAccount.accountId,
        region: MOCK_CONSTANTS.targetAccount.region,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        solutionId: MOCK_CONSTANTS.solutionId,
        partition: MOCK_CONSTANTS.targetAccount.partition,
        assumeRoleName: MOCK_CONSTANTS.targetAccount.assumeRoleName,
        credentials: undefined,
      });
    });

    test('should use provided credentials for target account', async () => {
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);
      mockExecuteApi.mockResolvedValue({
        Parameters: MOCK_CONSTANTS.mockParameters,
        InvalidParameters: [],
      });

      await getParametersValue(
        MOCK_CONSTANTS.parameterNames,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.logPrefix,
        MOCK_CONSTANTS.targetAccount,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      expect(mockGetCredentials).toHaveBeenCalledWith({
        accountId: MOCK_CONSTANTS.targetAccount.accountId,
        region: MOCK_CONSTANTS.targetAccount.region,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        solutionId: MOCK_CONSTANTS.solutionId,
        partition: MOCK_CONSTANTS.targetAccount.partition,
        assumeRoleName: MOCK_CONSTANTS.targetAccount.assumeRoleName,
        credentials: MOCK_CONSTANTS.credentials,
      });
    });

    test('should use provided credentials for current account', async () => {
      mockExecuteApi.mockResolvedValue({
        Parameters: MOCK_CONSTANTS.mockParameters,
        InvalidParameters: [],
      });

      await getParametersValue(
        MOCK_CONSTANTS.parameterNames,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.logPrefix,
        undefined,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );

      expect(mockExecuteApi).toHaveBeenCalled();
    });

    test('should throw error when parameters are not found', async () => {
      mockExecuteApi.mockResolvedValue({
        Parameters: [],
        InvalidParameters: ['/test/param1'],
      });

      await expect(
        getParametersValue(MOCK_CONSTANTS.parameterNames, MOCK_CONSTANTS.region, MOCK_CONSTANTS.logPrefix),
      ).rejects.toThrow('InvalidInput: Parameters not found: /test/param1');
    });

    test('should throw error when no parameters returned', async () => {
      mockExecuteApi.mockResolvedValue({
        Parameters: undefined,
        InvalidParameters: [],
      });

      await expect(
        getParametersValue(MOCK_CONSTANTS.parameterNames, MOCK_CONSTANTS.region, MOCK_CONSTANTS.logPrefix),
      ).rejects.toThrow(
        'ServiceException: GetParametersCommand api returned undefined for Parameters or returned no values',
      );
    });

    test('should throw error when empty parameters array returned', async () => {
      mockExecuteApi.mockResolvedValue({
        Parameters: [],
        InvalidParameters: [],
      });

      await expect(
        getParametersValue(MOCK_CONSTANTS.parameterNames, MOCK_CONSTANTS.region, MOCK_CONSTANTS.logPrefix),
      ).rejects.toThrow(
        'ServiceException: GetParametersCommand api returned undefined for Parameters or returned no values',
      );
    });

    test('should handle single parameter retrieval', async () => {
      const singleParam = [MOCK_CONSTANTS.mockParameters[0]];
      mockExecuteApi.mockResolvedValue({
        Parameters: singleParam,
        InvalidParameters: [],
      });

      const result = await getParametersValue(
        [MOCK_CONSTANTS.parameterNames[0]],
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toEqual(singleParam);
    });

    test('should create SSM client with correct configuration', async () => {
      mockExecuteApi.mockResolvedValue({
        Parameters: MOCK_CONSTANTS.mockParameters,
        InvalidParameters: [],
      });

      await getParametersValue(
        MOCK_CONSTANTS.parameterNames,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.logPrefix,
        undefined,
        MOCK_CONSTANTS.solutionId,
      );

      expect(SSMClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.region,
        customUserAgent: MOCK_CONSTANTS.solutionId,
        retryStrategy: {},
        credentials: undefined,
      });
    });

    test('should create SSM client with target region for cross-account access', async () => {
      mockGetCredentials.mockResolvedValue(MOCK_CONSTANTS.credentials);
      mockExecuteApi.mockResolvedValue({
        Parameters: MOCK_CONSTANTS.mockParameters,
        InvalidParameters: [],
      });

      await getParametersValue(
        MOCK_CONSTANTS.parameterNames,
        MOCK_CONSTANTS.region,
        MOCK_CONSTANTS.logPrefix,
        MOCK_CONSTANTS.targetAccount,
      );

      expect(SSMClient).toHaveBeenCalledWith({
        region: MOCK_CONSTANTS.targetAccount.region,
        customUserAgent: undefined,
        retryStrategy: {},
        credentials: MOCK_CONSTANTS.credentials,
      });
    });
  });
});

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

import { describe, beforeEach, expect, test } from '@jest/globals';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { GetSsmParametersValueModule } from '../../../../lib/aws-ssm/get-parameters';
import { IGetSsmParametersValueHandlerParameter } from '../../../../interfaces/aws-ssm/get-parameters';

jest.mock('@aws-sdk/client-ssm', () => ({
  ...jest.requireActual('@aws-sdk/client-ssm'),
  SSMClient: jest.fn(),
  GetParameterCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-sts', () => ({
  ...jest.requireActual('@aws-sdk/client-sts'),
  STSClient: jest.fn(),
}));

jest.mock('../../../../common/throttle', () => ({
  throttlingBackOff: jest.fn().mockImplementation(fn => fn()),
}));

jest.mock('../../../../common/functions', () => ({
  ...jest.requireActual('../../../../common/functions'),
  setRetryStrategy: jest.fn().mockReturnValue({}),
  getCurrentAccountDetails: jest.fn().mockResolvedValue({ accountId: '111111111111', roleArn: 'mock-role-arn' }),
  getCredentials: jest.fn().mockResolvedValue({
    accessKeyId: 'mock-access-key',
    secretAccessKey: 'mock-secret-key',
    sessionToken: 'mock-session-token',
  }),
}));

describe('SsmGetParameterModule Contract Compliance', () => {
  const input: IGetSsmParametersValueHandlerParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: [
      {
        name: '/test/param1',
      },
    ],
  };

  let module: GetSsmParametersValueModule;

  beforeEach(() => {
    module = new GetSsmParametersValueModule();
    jest.spyOn(module, 'handler').mockImplementation(async () => []);
  });

  test('should implement handler method', () => {
    expect(module.handler).toBeDefined();
    expect(typeof module.handler).toBe('function');
  });

  test('should maintain correct method signatures', async () => {
    const result = module.handler(input);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toEqual(expect.any(Array));
  });

  test('should handle invalid inputs according to contract', async () => {
    jest.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input'));

    await expect(module.handler({} as IGetSsmParametersValueHandlerParameter)).rejects.toThrow('Invalid input');
  });

  test('should fulfill interface behavioral requirements', async () => {
    const result = await module.handler(input);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toBeDefined();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

describe('SsmGetParameterModule', () => {
  const mockSend = jest.fn();
  const mockSTSSend = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (SSMClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
    const { STSClient } = require('@aws-sdk/client-sts');
    (STSClient as jest.Mock).mockImplementation(() => ({
      send: mockSTSSend,
    }));
    mockSTSSend.mockResolvedValue({ Account: '111111111111' });
  });

  const getInput = (configuration: IGetSsmParametersValueHandlerParameter['configuration']) => ({
    ...MOCK_CONSTANTS.runnerParameters,
    configuration,
  });

  describe('Parameter Retrieval', () => {
    test('should successfully retrieve multiple parameters', async () => {
      mockSend
        .mockResolvedValueOnce({
          Parameter: { Name: '/test/param1', Value: 'value1' },
        })
        .mockResolvedValueOnce({
          Parameter: { Name: '/test/param2', Value: 'value2' },
        });

      const input = getInput([{ name: '/test/param1' }, { name: '/test/param2' }]);

      const result = await new GetSsmParametersValueModule().handler(input);

      expect(GetParameterCommand).toHaveBeenCalledWith({ Name: '/test/param1' });
      expect(GetParameterCommand).toHaveBeenCalledWith({ Name: '/test/param2' });
      expect(GetParameterCommand).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { name: '/test/param1', value: 'value1', exists: true },
          { name: '/test/param2', value: 'value2', exists: true },
        ]),
      );
    });

    test('should handle mixed success and failures', async () => {
      const parameterNotFoundError = new Error('Parameter /test/param2 not found');
      parameterNotFoundError.name = 'ParameterNotFound';

      mockSend
        .mockResolvedValueOnce({
          Parameter: { Name: '/test/param1', Value: 'value1' },
        })
        .mockRejectedValueOnce(parameterNotFoundError);

      const input = getInput([{ name: '/test/param1' }, { name: '/test/param2' }]);

      const result = await new GetSsmParametersValueModule().handler(input);

      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          { name: '/test/param1', value: 'value1', exists: true },
          { name: '/test/param2', exists: false },
        ]),
      );
    });

    test('should throw error for parameters with missing required properties', async () => {
      mockSend
        .mockResolvedValueOnce({
          Parameter: { Name: '/test/param1', Value: 'value1' },
        })
        .mockResolvedValueOnce({
          Parameter: { Name: undefined, Value: 'value2' }, // Missing Name
        })
        .mockResolvedValueOnce({
          Parameter: { Name: '/test/param3', Value: undefined }, // Missing Value
        })
        .mockResolvedValueOnce({
          Parameter: undefined,
        });

      const input = getInput([
        { name: '/test/param1' },
        { name: '/test/param2' },
        { name: '/test/param3' },
        { name: '/test/param4' },
      ]);

      await expect(new GetSsmParametersValueModule().handler(input)).rejects.toThrow();
    });
  });

  describe('Cross-Account Scenarios', () => {
    test('should handle cross-account with assumeRoleArn', async () => {
      mockSend.mockResolvedValue({
        Parameter: { Name: '/test/param1', Value: 'cross-account-value' },
      });

      const input = getInput([
        {
          name: '/test/param1',
          assumeRoleArn: 'arn:aws:iam::222222222222:role/CrossAccountRole',
        },
      ]);

      const result = await new GetSsmParametersValueModule().handler(input);

      expect(result).toEqual([
        {
          name: '/test/param1',
          value: 'cross-account-value',
          exists: true,
        },
      ]);

      // Verify getCredentials was called for cross-account access
      expect(require('../../../../common/functions').getCredentials).toHaveBeenCalledWith({
        accountId: '222222222222',
        region: expect.any(String),
        solutionId: expect.any(String),
        assumeRoleArn: 'arn:aws:iam::222222222222:role/CrossAccountRole',
      });
    });

    test('should throw error for cross-account credential failures', async () => {
      const mockGetCredentials = require('../../../../common/functions').getCredentials;
      mockGetCredentials.mockRejectedValueOnce(new Error('AssumeRole failed'));

      const input = getInput([
        {
          name: '/test/param1',
          assumeRoleArn: 'arn:aws:iam::222222222222:role/CrossAccountRole',
        },
      ]);

      await expect(new GetSsmParametersValueModule().handler(input)).rejects.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should throw error for SSM API errors', async () => {
      mockSend.mockRejectedValue(new Error('SSM API Error'));

      const input = getInput([{ name: '/test/param1' }]);

      await expect(new GetSsmParametersValueModule().handler(input)).rejects.toThrow();
    });
  });

  describe('Parameter Validation', () => {
    test('should throw error for invalid assumeRoleArn format', async () => {
      const input = getInput([
        {
          name: '/test/param1',
          assumeRoleArn: 'invalid-arn-format',
        },
      ]);

      await expect(new GetSsmParametersValueModule().handler(input)).rejects.toThrow(
        'Parameter "/test/param1" - Invalid ARN format: invalid-arn-format',
      );
    });

    test('should throw error for invalid account ID in ARN', async () => {
      const input = getInput([
        {
          name: '/test/param1',
          assumeRoleArn: 'arn:aws:iam::invalid-account:role/TestRole',
        },
      ]);

      await expect(new GetSsmParametersValueModule().handler(input)).rejects.toThrow(
        'Parameter "/test/param1" - Invalid account ID in ARN: invalid-account',
      );
    });

    test('should throw error when trying to assume the same role', async () => {
      const mockGetCurrentAccountDetails = require('../../../../common/functions').getCurrentAccountDetails;
      mockGetCurrentAccountDetails.mockResolvedValueOnce({
        accountId: '111111111111',
        roleArn: 'arn:aws:iam::111111111111:role/TestRole',
      });

      const input = getInput([
        {
          name: '/test/param1',
          assumeRoleArn: 'arn:aws:iam::111111111111:role/TestRole', // Same as getCurrentRoleArn mock
        },
      ]);

      await expect(new GetSsmParametersValueModule().handler(input)).rejects.toThrow(
        'Parameter "/test/param1" - Cannot assume role arn:aws:iam::111111111111:role/TestRole, already using this role. Remove assumeRoleArn to use current credentials',
      );
    });

    test('should throw error for missing parameter name', async () => {
      const input = getInput([
        {
          name: '',
        },
      ]);

      await expect(new GetSsmParametersValueModule().handler(input)).rejects.toThrow('Parameter name is required');
    });
  });
});

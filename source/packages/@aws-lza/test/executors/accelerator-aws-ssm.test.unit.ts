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

import { describe, beforeEach, expect, test, afterEach } from '@jest/globals';
import { manageBlockPublicDocumentSharing, getSsmParametersValue } from '../../executors/accelerator-aws-ssm';
import { BlockPublicDocumentSharingModule } from '../../lib/aws-ssm/manage-document-public-access-block';
import { GetSsmParametersValueModule } from '../../lib/aws-ssm/get-parameters';
import { MOCK_CONSTANTS } from '../mocked-resources';

// Mock dependencies
jest.mock('../../lib/aws-ssm/manage-document-public-access-block');
jest.mock('../../lib/aws-ssm/get-parameters/index');

describe('AwsSsmExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('manageBlockPublicDocumentSharing', () => {
    const input = {
      accountId: MOCK_CONSTANTS.accountId,
      region: MOCK_CONSTANTS.runnerParameters.region,
      credentials: MOCK_CONSTANTS.credentials,
      enable: MOCK_CONSTANTS.BlockPublicDocumentSharingModule.configuration.enable,
      solutionId: MOCK_CONSTANTS.runnerParameters.solutionId,
    };

    test('should successfully manage SSM Block Public Document Sharing', async () => {
      // Setup
      const mockHandler = jest.fn().mockResolvedValue('SUCCESS');

      (BlockPublicDocumentSharingModule as unknown as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await manageBlockPublicDocumentSharing(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith({
        operation: 'manage-block-public-document-sharing',
        configuration: {
          enable: input.enable,
        },
        partition: 'aws',
        region: input.region,
        credentials: input.credentials,
        solutionId: input.solutionId,
      });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when module handler fails', async () => {
      // Setup
      const errorMessage = 'Module operation failed';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));

      (BlockPublicDocumentSharingModule as unknown as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(manageBlockPublicDocumentSharing(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith({
        operation: 'manage-block-public-document-sharing',
        configuration: {
          enable: input.enable,
        },
        partition: 'aws',
        region: input.region,
        credentials: input.credentials,
        solutionId: input.solutionId,
      });
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSsmParameters', () => {
    test('should successfully retrieve parameters', async () => {
      const mockHandler = jest.fn().mockResolvedValue(MOCK_CONSTANTS.GetSsmParametersValueModule.response);
      (GetSsmParametersValueModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await getSsmParametersValue(MOCK_CONSTANTS.GetSsmParametersValueModule.input);

      expect(result).toEqual(MOCK_CONSTANTS.GetSsmParametersValueModule.response);
      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.GetSsmParametersValueModule.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle parameters not found', async () => {
      const notFoundResponse = [
        {
          parameterName: '/test/param1',
          parameterValue: '',
          parameterFound: false,
        },
      ];

      const mockHandler = jest.fn().mockResolvedValue(notFoundResponse);
      (GetSsmParametersValueModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const result = await getSsmParametersValue(MOCK_CONSTANTS.GetSsmParametersValueModule.input);

      expect(result).toEqual(notFoundResponse);
      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.GetSsmParametersValueModule.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when parameter retrieval fails', async () => {
      const errorMessage = 'failed to get SSM parameters';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
      (GetSsmParametersValueModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(getSsmParametersValue(MOCK_CONSTANTS.GetSsmParametersValueModule.input)).rejects.toThrow(
        errorMessage,
      );

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.GetSsmParametersValueModule.input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when handler throws unknown error', async () => {
      const errorMessage = 'unknown error occurred';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
      (GetSsmParametersValueModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      await expect(getSsmParametersValue(MOCK_CONSTANTS.GetSsmParametersValueModule.input)).rejects.toThrow(
        errorMessage,
      );

      expect(mockHandler).toHaveBeenCalledWith(MOCK_CONSTANTS.GetSsmParametersValueModule.input);
      expect(mockHandler).toBeCalledTimes(1);
    });

    test('should handle different partition', async () => {
      const mockHandler = jest.fn().mockResolvedValue(MOCK_CONSTANTS.GetSsmParametersValueModule.response);
      (GetSsmParametersValueModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithGovCloud = {
        ...MOCK_CONSTANTS.GetSsmParametersValueModule.input,
        partition: 'aws-us-gov',
      };

      const result = await getSsmParametersValue(inputWithGovCloud);

      expect(result).toEqual(MOCK_CONSTANTS.GetSsmParametersValueModule.response);
      expect(mockHandler).toHaveBeenCalledWith(inputWithGovCloud);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle different region', async () => {
      const mockHandler = jest.fn().mockResolvedValue(MOCK_CONSTANTS.GetSsmParametersValueModule.response);
      (GetSsmParametersValueModule as jest.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const inputWithDifferentRegion = {
        ...MOCK_CONSTANTS.GetSsmParametersValueModule.input,
        region: 'us-west-2',
      };

      const result = await getSsmParametersValue(inputWithDifferentRegion);

      expect(result).toEqual(MOCK_CONSTANTS.GetSsmParametersValueModule.response);
      expect(mockHandler).toHaveBeenCalledWith(inputWithDifferentRegion);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Uncaught Exception Handler', () => {
    let originalProcessOn: typeof process.on;
    let processOnCallback: NodeJS.UncaughtExceptionListener;

    beforeEach(() => {
      originalProcessOn = process.on;

      process.on = jest.fn((event: string, listener: NodeJS.UncaughtExceptionListener) => {
        if (event === 'uncaughtException') {
          processOnCallback = listener;
        }
        return process;
      }) as unknown as typeof process.on;

      jest.resetModules();
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    test('should register uncaughtException handler', () => {
      require('../../executors/accelerator-aws-ssm');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', () => {
      require('../../executors/accelerator-aws-ssm');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});

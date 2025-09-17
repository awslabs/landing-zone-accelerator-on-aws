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

import { describe, beforeEach, expect, test, vi, afterEach } from 'vitest';
import { manageEbsDefaultEncryption, deleteDefaultVpc } from '../../executors/accelerator-amazon-ec2';
import { ManageEbsDefaultEncryptionModule } from '../../lib/amazon-ec2/manage-ebs-default-encryption/index';
import { DeleteDefaultVpcModule } from '../../lib/amazon-ec2/delete-default-vpc';
import { MOCK_CONSTANTS } from '../mocked-resources';
import { IManageEbsDefaultEncryptionHandlerParameter } from '../../interfaces/amazon-ec2/manage-ebs-default-encryption';
import { IDeleteDefaultVpcParameter } from '../../interfaces/amazon-ec2/delete-default-vpc';

// Mock dependencies
vi.mock('../../lib/amazon-ec2/manage-ebs-default-encryption/index');
vi.mock('../../lib/amazon-ec2/delete-default-vpc');

describe('AmazonEc2Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('manageEbsDefaultEncryption', () => {
    const input: IManageEbsDefaultEncryptionHandlerParameter = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: MOCK_CONSTANTS.ManageEbsDefaultEncryptionModule.configuration,
    };
    test('should successfully configure default encryption key', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (ManageEbsDefaultEncryptionModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await manageEbsDefaultEncryption(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when fails', async () => {
      // Setup

      const errorMessage = 'Operation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (ManageEbsDefaultEncryptionModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(manageEbsDefaultEncryption(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteDefaultVpc', () => {
    const input: IDeleteDefaultVpcParameter = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: {},
      operation: 'delete-default-vpc',
    };

    test('should successfully delete default VPC with dry run', async () => {
      // Setup
      const expectedResponse =
        '[DRY-RUN]: delete-default-vpc delete-default-vpc (no actual changes were made)\nValidation: ✓ Successful\nStatus: No default VPCs found in the region';
      const mockHandler = vi.fn().mockResolvedValue(expectedResponse);

      (DeleteDefaultVpcModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const dryRunInput = { ...input, dryRun: true };

      // Execute
      const result = await deleteDefaultVpc(dryRunInput);

      // Verify
      expect(result).toBe(expectedResponse);
      expect(mockHandler).toHaveBeenCalledWith(dryRunInput);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should successfully delete default VPC without dry run', async () => {
      // Setup
      const expectedResponse = 'Successfully deleted 1 default VPC(s): vpc-12345';
      const mockHandler = vi.fn().mockResolvedValue(expectedResponse);

      (DeleteDefaultVpcModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      const actualRunInput = { ...input, dryRun: false };

      // Execute
      const result = await deleteDefaultVpc(actualRunInput);

      // Verify
      expect(result).toBe(expectedResponse);
      expect(mockHandler).toHaveBeenCalledWith(actualRunInput);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle no default VPCs found', async () => {
      // Setup
      const expectedResponse = 'No default VPCs found in the region';
      const mockHandler = vi.fn().mockResolvedValue(expectedResponse);

      (DeleteDefaultVpcModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await deleteDefaultVpc(input);

      // Verify
      expect(result).toBe(expectedResponse);
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when deletion fails', async () => {
      // Setup
      const errorMessage = 'ServiceException: Failed to delete VPC vpc-12345: DependencyViolation';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (DeleteDefaultVpcModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(deleteDefaultVpc(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle AWS service errors', async () => {
      // Setup
      const errorMessage = 'AccessDenied: User is not authorized to perform this action';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (DeleteDefaultVpcModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(deleteDefaultVpc(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should handle network connectivity errors', async () => {
      // Setup
      const errorMessage = 'NetworkingError: Unable to connect to AWS services';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (DeleteDefaultVpcModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(deleteDefaultVpc(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should pass through all input parameters correctly', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');
      const customInput: IDeleteDefaultVpcParameter = {
        region: 'us-west-2',
        partition: 'aws-us-gov',
        configuration: {},
        operation: 'delete-default-vpc',
        dryRun: true,
        solutionId: 'custom-solution',
        credentials: {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          sessionToken: 'test-token',
        },
      };

      (DeleteDefaultVpcModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      await deleteDefaultVpc(customInput);

      // Verify
      expect(mockHandler).toHaveBeenCalledWith(customInput);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('Uncaught Exception Handler', () => {
    let originalProcessOn: typeof process.on;
    let processOnCallback: NodeJS.UncaughtExceptionListener;

    beforeEach(() => {
      originalProcessOn = process.on;

      process.on = vi.fn((event: string, listener: NodeJS.UncaughtExceptionListener) => {
        if (event === 'uncaughtException') {
          processOnCallback = listener;
        }
        return process;
      }) as unknown as typeof process.on;

      vi.resetModules();
    });

    afterEach(() => {
      process.on = originalProcessOn;
    });

    test('should register uncaughtException handler', async () => {
      await import('../../executors/accelerator-amazon-ec2');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', async () => {
      await import('../../executors/accelerator-amazon-ec2');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});

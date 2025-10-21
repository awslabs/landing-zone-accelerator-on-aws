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
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { isStackExists } from '../../common/cloudformation-functions';
import { MODULE_EXCEPTIONS } from '../../common/enums';

vi.mock('../../common/throttle', () => ({
  throttlingBackOff: vi.fn(fn => fn()),
}));

vi.mock('../../common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  })),
}));

vi.mock('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: vi.fn(),
  DescribeStacksCommand: vi.fn(),
}));

describe('cloudformation-functions', () => {
  const mockSend = vi.fn();
  const mockClient = { send: mockSend } as unknown as CloudFormationClient;
  const stackName = 'test-stack';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isStackExists', () => {
    test('should return true when stack exists', async () => {
      // Setup
      mockSend.mockResolvedValue({
        Stacks: [
          {
            StackName: stackName,
            StackStatus: 'CREATE_COMPLETE',
          },
        ],
      });

      // Execute
      const result = await isStackExists(mockClient, stackName);

      // Verify
      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(expect.any(DescribeStacksCommand));
    });

    test('should return false when stack does not exist (empty array)', async () => {
      // Setup
      mockSend.mockResolvedValue({
        Stacks: [],
      });

      // Execute
      const result = await isStackExists(mockClient, stackName);

      // Verify
      expect(result).toBe(false);
    });

    test('should return false when ValidationError with "does not exist" message', async () => {
      // Setup
      const validationError = new Error('Stack with id test-stack does not exist');
      validationError.name = 'ValidationError';
      mockSend.mockRejectedValue(validationError);

      // Execute
      const result = await isStackExists(mockClient, stackName);

      // Verify
      expect(result).toBe(false);
    });

    test('should throw error when DescribeStacks returns no Stacks object', async () => {
      // Setup
      mockSend.mockResolvedValue({
        Stacks: undefined,
      });

      // Execute & Verify
      await expect(isStackExists(mockClient, stackName)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api did not return Stacks object for ${stackName} stack.`,
      );
    });

    test('should throw error when DescribeStacks returns more than 1 stack', async () => {
      // Setup
      mockSend.mockResolvedValue({
        Stacks: [{ StackName: stackName }, { StackName: stackName }],
      });

      // Execute & Verify
      await expect(isStackExists(mockClient, stackName)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api returned more than 1 stack for ${stackName} stack.`,
      );
    });

    test('should throw error when ValidationError without "does not exist" message', async () => {
      // Setup
      const validationError = new Error('Invalid parameter');
      validationError.name = 'ValidationError';
      mockSend.mockRejectedValue(validationError);

      // Execute & Verify
      await expect(isStackExists(mockClient, stackName)).rejects.toThrow(validationError);
    });

    test('should throw error when non-ValidationError occurs', async () => {
      // Setup
      const accessError = new Error('Access denied');
      accessError.name = 'AccessDenied';
      mockSend.mockRejectedValue(accessError);

      // Execute & Verify
      await expect(isStackExists(mockClient, stackName)).rejects.toThrow(accessError);
    });

    test('should throw error when non-Error object is thrown', async () => {
      // Setup
      const stringError = 'Some string error';
      mockSend.mockRejectedValue(stringError);

      // Execute & Verify
      await expect(isStackExists(mockClient, stackName)).rejects.toThrow(stringError);
    });
  });
});

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
import { IDeployStackConfiguration } from '../../../../interfaces/aws-cloudformation/deploy-stack';
import {
  CloudFormationClient,
  DescribeStacksCommand,
  StackStatus,
  UpdateStackCommand,
} from '@aws-sdk/client-cloudformation';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { DeployStackModule } from '../../../../lib/aws-cloudformation/deploy-stack';
import { AcceleratorModuleName } from '../../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import path from 'path';

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('template content'),
}));

vi.mock('../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../common/functions');
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../../../../common/cloudformation-functions', async () => {
  return {
    isStackExists: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../../../../common/s3-functions', async () => {
  return {
    uploadFileToS3: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: vi.fn(),
  DescribeStacksCommand: vi.fn(),
  UpdateStackCommand: vi.fn(),
  StackStatus: {
    UPDATE_COMPLETE: 'UPDATE_COMPLETE',
    UPDATE_IN_PROGRESS: 'UPDATE_IN_PROGRESS',
    UPDATE_ROLLBACK_COMPLETE: 'UPDATE_ROLLBACK_COMPLETE',
    UPDATE_FAILED: 'UPDATE_FAILED',
    REVIEW_IN_PROGRESS: 'REVIEW_IN_PROGRESS',
  },
}));

const configuration: IDeployStackConfiguration = {
  stackName: 'stack1',
  templatePath: './template.yaml',
  s3BucketName: 'XXXXXXX',
};

describe('DeployStackModule', () => {
  const mockSend = vi.fn();
  let isStackExistsSpy: vi.SpyInstance;
  let readFileSpy: vi.SpyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();

    (CloudFormationClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      send: mockSend,
    }));

    const cfnFunctions = await import('../../../../common/cloudformation-functions');
    isStackExistsSpy = vi.mocked(cfnFunctions.isStackExists);

    const fsPromises = await import('fs/promises');
    readFileSpy = vi.mocked(fsPromises.readFile);
  });

  describe('Live Execution Operations', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration,
    };
    beforeEach(() => {
      vi.clearAllMocks();
      isStackExistsSpy.mockResolvedValue(true);
      readFileSpy.mockResolvedValue('template content');
    });

    test('should deploy the stack successfully', async () => {
      // Setup
      let describeStackCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          if (describeStackCallCount === 0) {
            describeStackCallCount++;
            return Promise.resolve({
              Stacks: [
                {
                  StackName: configuration.stackName,
                  StackStatus: StackStatus.UPDATE_IN_PROGRESS,
                },
              ],
            });
          }
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
                StackStatus: StackStatus.UPDATE_COMPLETE,
              },
            ],
          });
        }
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({
            $metadata: {
              httpStatusCode: 200,
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new DeployStackModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: `Module ${AcceleratorModuleName.AWS_CLOUDFORMATION} ${input.operation} operation for ${input.configuration.stackName} stack completed successfully, with status "Stack ${input.configuration.stackName} operation completed successfully with status ${StackStatus.UPDATE_COMPLETE}".`,
        status: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(3);
      expect(mockSend).toHaveBeenCalledWith(expect.any(UpdateStackCommand));
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(UpdateStackCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(DescribeStacksCommand));
      expect(isStackExistsSpy).toHaveBeenCalledTimes(1);
    }, 10000);

    test('should throw an error if the stack does not exist', async () => {
      // Setup
      isStackExistsSpy.mockResolvedValue(false);

      // Execute
      const response = await new DeployStackModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stack not found ${input.configuration.stackName}, accelerator will skip the ${AcceleratorModuleName.AWS_CLOUDFORMATION} module ${input.operation} operation.`,
        status: false,
      });
      expect(mockSend).toHaveBeenCalledTimes(0);
    }, 10000);

    test('should throw an error if the stack operation fails', async () => {
      // Setup
      let describeStackCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DescribeStacksCommand) {
          describeStackCallCount++;
          if (describeStackCallCount === 1) {
            return Promise.resolve({
              Stacks: [
                {
                  StackName: configuration.stackName,
                  StackStatus: StackStatus.UPDATE_IN_PROGRESS,
                },
              ],
            });
          }
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
                StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
                StackStatusReason: 'Stack deployment failed',
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${configuration.stackName} operation failed with status UPDATE_ROLLBACK_COMPLETE - Stack deployment failed`,
      );
    }, 10000);

    test('should throw error when polling returns empty stacks array', async () => {
      // Setup
      let describeStackCallCount = 0;

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DescribeStacksCommand) {
          describeStackCallCount++;
          if (describeStackCallCount === 1) {
            // First call (initial status check) succeeds
            return Promise.resolve({
              Stacks: [
                {
                  StackName: configuration.stackName,
                  StackStatus: StackStatus.UPDATE_IN_PROGRESS,
                },
              ],
            });
          }
          // Second call (during polling) returns empty array
          return Promise.resolve({
            Stacks: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack operation failed, DescribeStacksCommand didn't return stack object for ${configuration.stackName} stack`,
      );
    }, 10000);

    test('should return no update message when ValidationError occurs', async () => {
      // Setup
      const validationError = new Error('No updates are to be performed for stack');
      validationError.name = 'ValidationError';

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.reject(validationError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new DeployStackModule().handler(input);

      // Verify
      expect(response).toEqual({
        status: true,
        message: `Module ${AcceleratorModuleName.AWS_CLOUDFORMATION} ${input.operation} operation for ${input.configuration.stackName} stack completed successfully, with status "No updates are to be performed for stack ${input.configuration.stackName}".`,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledWith(expect.any(UpdateStackCommand));
    }, 10000);

    test('should throw error when UpdateStackCommand fails with non-validation error', async () => {
      // Setup
      const deployError = new Error('Access denied');
      deployError.name = 'AccessDenied';

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.reject(deployError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to deploy stack ${configuration.stackName} with error Access denied`,
      );
    }, 10000);

    test('should throw timeout error when stack operation exceeds 5 minutes', async () => {
      // Setup - Control system time
      const startTime = new Date('2024-01-01T00:00:00Z');
      vi.setSystemTime(startTime);

      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DescribeStacksCommand) {
          // Advance time by 6 minutes on each call
          vi.setSystemTime(new Date(startTime.getTime() + 6 * 60 * 1000));
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
                StackStatus: StackStatus.UPDATE_IN_PROGRESS,
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Timeout waiting for stack ${configuration.stackName} operation to complete after 5 minutes`,
      );

      // Restore system time
      vi.useRealTimers();
    }, 10000);

    test('should throw error when no stacks are returned', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [], // Empty array - no stacks returned
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${configuration.stackName} not found`,
      );
    }, 10000);

    test('should throw error when Stacks property is undefined', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: undefined, // Undefined Stacks property
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${configuration.stackName} not found`,
      );
    }, 10000);

    test('should throw error when template file cannot be read with Error object', async () => {
      // Setup
      const fileError = new Error('ENOENT: no such file or directory');
      readFileSpy.mockRejectedValue(fileError);

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to read template file ${path.resolve('./template.yaml')}: ENOENT: no such file or directory`,
      );
    }, 10000);

    test('should throw error when template file read fails with unknown error', async () => {
      // Setup
      readFileSpy.mockRejectedValue('Some string error');

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to read template file ${path.resolve('./template.yaml')}: Unknown error`,
      );
    }, 10000);

    test('should throw error when UpdateStackCommand fails with unknown error type', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.reject(MOCK_CONSTANTS.serviceError.message);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Failed to deploy stack ${configuration.stackName} with error Unknown error`,
      );
    }, 10000);

    test('should throw error with default reason when StackStatusReason is undefined', async () => {
      // Setup
      let describeStackCallCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DescribeStacksCommand) {
          describeStackCallCount++;
          if (describeStackCallCount === 1) {
            return Promise.resolve({
              Stacks: [
                {
                  StackName: configuration.stackName,
                  StackStatus: StackStatus.UPDATE_IN_PROGRESS,
                },
              ],
            });
          }
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
                StackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
                // No StackStatusReason - tests 'No reason provided' branch
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${configuration.stackName} operation failed with status UPDATE_ROLLBACK_COMPLETE - No reason provided`,
      );
    }, 10000);

    test('should throw error for unexpected final status', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof UpdateStackCommand) {
          return Promise.resolve({ $metadata: { httpStatusCode: 200 } });
        }
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
                StackStatus: StackStatus.REVIEW_IN_PROGRESS, // Not in success or failed states
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new DeployStackModule().handler(input)).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack ${configuration.stackName} operation completed with unexpected status: REVIEW_IN_PROGRESS`,
      );
    }, 10000);
  });

  describe('Dry Run Mode Operations', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
      configuration,
    };
    beforeEach(() => {
      vi.clearAllMocks();
      isStackExistsSpy.mockResolvedValue(true);
      readFileSpy.mockResolvedValue('template content');
    });

    test('should deploy the stack successfully', async () => {
      // Execute
      const response = await new DeployStackModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: expect.stringContaining(
          `Stack ${input.configuration.stackName} exists, accelerator will deploy the ${AcceleratorModuleName.AWS_CLOUDFORMATION} module ${input.operation} operation.`,
        ),
        status: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(0);
      expect(DescribeStacksCommand).toHaveBeenCalledTimes(0);
      expect(UpdateStackCommand).toHaveBeenCalledTimes(0);
      expect(isStackExistsSpy).toHaveBeenCalledTimes(1);
    });

    test('should throw an error if the stack does not exist', async () => {
      // Setup
      isStackExistsSpy.mockResolvedValue(false);

      // Execute
      const response = await new DeployStackModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: expect.stringContaining(
          `Stack not found ${input.configuration.stackName}, accelerator will skip the ${AcceleratorModuleName.AWS_CLOUDFORMATION} module ${input.operation} operation.`,
        ),
        status: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(0);
    }, 10000);
  });
});

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
import { writeFile, mkdir } from 'fs/promises';
import { CloudFormationClient, DescribeStacksCommand, GetTemplateCommand } from '@aws-sdk/client-cloudformation';
import { describe, beforeEach, expect, test, vi } from 'vitest';
import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { ICustomResourceTemplateModifierConfiguration } from '../../../../interfaces/aws-cloudformation/custom-resource-template-modifier';
import { CustomResourceTemplateModifierModule } from '../../../../lib/aws-cloudformation/custom-resource-template-modifier';
import { AcceleratorModuleName } from '../../../../common/resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock('@aws-sdk/client-cloudformation', () => ({
  CloudFormationClient: vi.fn(),
  DescribeStacksCommand: vi.fn(),
  GetTemplateCommand: vi.fn(),
  TemplateStage: {
    Original: 'Original',
  },
}));

const configuration: ICustomResourceTemplateModifierConfiguration = {
  directory: './custom-resource-templates',
  accountId: '111111111111',
  region: 'us-east-1',
  stackName: 'stack1',
  resourceNames: ['Custom::Resource1', 'Custom::Resource2'],
};

const customResourceTemplate = {
  Resources: {
    resource01: {
      Type: 'Custom::Resource1',
      Properties: {},
      DependsOn: 'Resource1LogGroup',
      DeletionPolicy: 'Delete',
    },
    Resource1LogGroup: {
      Type: 'AWS::Logs::LogGroup',
      DeletionPolicy: 'Delete',
    },
    resource02: {
      Type: 'Custom::Resource2',
      Properties: {},
      DependsOn: ['Resource2LogGroup'],
      DeletionPolicy: 'Delete',
    },
    Resource2LogGroup: {
      Type: 'AWS::Logs::LogGroup',
      DeletionPolicy: 'Delete',
    },
  },
};

const customResourceTemplateNoDependencies = {
  Resources: {
    resource01: {
      Type: 'Custom::Resource1',
      Properties: {},
      DeletionPolicy: 'Delete',
    },
    resource02: {
      Type: 'Custom::Resource2',
      Properties: {},
      DeletionPolicy: 'Delete',
    },
  },
};

const customResourceTemplateInvalidDependencies = {
  Resources: {
    resource01: {
      Type: 'Custom::Resource1',
      Properties: {},
      DependsOn: { invalid: 'object' },
      DeletionPolicy: 'Delete',
    },
    resource02: {
      Type: 'Custom::Resource2',
      Properties: {},
      DependsOn: { invalid: 'object' },
      DeletionPolicy: 'Delete',
    },
  },
};

const missingCustomResourceTemplate = {
  Resources: {
    resource01: {
      Type: 'Custom::Resource3',
      Properties: {},
      DependsOn: ['Resource3LogGroup'],
      DeletionPolicy: 'Delete',
    },
    Resource3LogGroup: {
      Type: 'AWS::Logs::LogGroup',
      DeletionPolicy: 'Delete',
    },
    resource04: {
      Type: 'Custom::Resource4',
      Properties: {},
      DependsOn: ['Resource4LogGroup'],
      DeletionPolicy: 'Delete',
    },
    Resource4LogGroup: {
      Type: 'AWS::Logs::LogGroup',
      DeletionPolicy: 'Delete',
    },
  },
};

describe('CustomResourceTemplateModifierModule', () => {
  const mockSend = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();

    (CloudFormationClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  describe('Live Execution Operations', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration,
    };
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should be successful when custom resources found', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: JSON.stringify(customResourceTemplate),
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: `Module ${AcceleratorModuleName.AWS_CLOUDFORMATION} ${input.operation} operation completed successfully.`,
        status: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(GetTemplateCommand));
    });

    test('should be successful when custom resources found without log group dependencies', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: JSON.stringify(customResourceTemplateNoDependencies),
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: `Module ${AcceleratorModuleName.AWS_CLOUDFORMATION} ${input.operation} operation completed successfully.`,
        status: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(GetTemplateCommand));
    });

    test('should handle invalid DependsOn type', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [{ StackName: configuration.stackName }],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: JSON.stringify(customResourceTemplateInvalidDependencies),
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify - should still succeed as invalid dependencies are ignored
      expect(response.status).toBe(true);
    });

    test('should be successful when no custom resources found', async () => {
      // Setup
      const errors: string[] = [];
      for (const resourceName of configuration.resourceNames) {
        errors.push(`No resources found with type ${resourceName} in template ${configuration.stackName}`);
      }
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: JSON.stringify(missingCustomResourceTemplate),
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: `${MODULE_EXCEPTIONS.INVALID_INPUT}: ${errors.join(', ')}.`,
        status: false,
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(GetTemplateCommand));
    });

    test('should handle when stack not found', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stack not found ${configuration.stackName}, accelerator will skip the template modification for custom resources.`,
        status: false,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });

    test('should handle DescribeStacks api ValidationError exception', async () => {
      // Setup
      const validationError = new Error(`${configuration.stackName} does not exist`);
      validationError.name = 'ValidationError';

      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.reject(validationError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: `${MODULE_EXCEPTIONS.INVALID_INPUT}: Stack not found ${configuration.stackName}, accelerator will skip the template modification for custom resources.`,
        status: false,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });

    test('should handle when DescribeStacks api did not return Stacks object', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: undefined,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api did not return Stacks object for ${configuration.stackName} stack.`,
        ),
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });

    test('should handle DescribeStacks api returned more than 1 stack', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
              {
                StackName: 'dummyStack',
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: DescribeStacks api returned more than 1 stack for ${configuration.stackName} stack.`,
        ),
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });

    test('should handle DescribeStacks api returned unhandled error', async () => {
      // Setup
      const unHandledError = new Error(`Unhandled Error`);
      unHandledError.name = 'UnhandledError';
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.reject(unHandledError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrowError(
        new RegExp(unHandledError.message),
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });

    test('should handle when GetTemplate api did not return TemplateBody', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: undefined,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: GetTemplate api did not return TemplateBody for ${configuration.stackName} stack.`,
        ),
      );

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(GetTemplateCommand));
    });

    test('should handle when GetTemplate api return unhandled error', async () => {
      // Setup
      const unHandledError = new Error(`Unhandled Error`);
      unHandledError.name = 'UnhandledError';
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.reject(unHandledError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrowError(
        new RegExp(unHandledError.message),
      );

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(GetTemplateCommand));
    });

    test('should handle when Invalid JSON in stack template', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: customResourceTemplate,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Invalid JSON in template for stack ${configuration.stackName}`,
        ),
      );

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(GetTemplateCommand));
    });

    test('should handle when Stack template missing Resources object', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: JSON.stringify({
              Resources: undefined,
            }),
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Stack template missing Resources object for stack ${configuration.stackName}`,
        ),
      );

      expect(mockSend).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).toHaveBeenNthCalledWith(2, expect.any(GetTemplateCommand));
    });

    test('should handle writeFile error', async () => {
      // Setup mocks
      vi.mocked(mkdir).mockResolvedValue(undefined);
      vi.mocked(writeFile).mockRejectedValue(new Error('Write failed'));

      // Setup CloudFormation mocks
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [{ StackName: configuration.stackName }],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: JSON.stringify(customResourceTemplate),
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new CustomResourceTemplateModifierModule().handler(input)).rejects.toThrow('Write failed');
    });
  });

  describe('Dry Run Mode Operations', () => {
    const input = {
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
      configuration,
    };
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should be successful when custom resources found', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [
              {
                StackName: configuration.stackName,
              },
            ],
          });
        }
        if (command instanceof GetTemplateCommand) {
          return Promise.resolve({
            TemplateBody: JSON.stringify(customResourceTemplate),
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: expect.stringMatching(
          `Accelerator will modify the ${
            configuration.stackName
          } stack template for custom resources ${configuration.resourceNames.join(',')}.`,
        ),
        status: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });

    test('should be successful when custom resources found', async () => {
      // Setup
      mockSend.mockImplementation(command => {
        if (command instanceof DescribeStacksCommand) {
          return Promise.resolve({
            Stacks: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CustomResourceTemplateModifierModule().handler(input);

      // Verify
      expect(response).toEqual({
        message: expect.stringMatching(
          `Stack not found ${configuration.stackName}, accelerator will skip the template modification for custom resources.`,
        ),
        status: true,
      });
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenNthCalledWith(1, expect.any(DescribeStacksCommand));
      expect(mockSend).not.toHaveBeenCalledWith(expect.any(GetTemplateCommand));
    });
  });
});

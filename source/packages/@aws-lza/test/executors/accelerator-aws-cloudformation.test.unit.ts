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
import { GetCloudFormationTemplatesModule } from '../../lib/aws-cloudformation/get-cloudformation-templates';
import { MOCK_CONSTANTS } from '../mocked-resources';
import { IGetCloudFormationTemplatesHandlerParameter } from '../../../@aws-accelerator/modules/dist/packages/@aws-lza/interfaces/aws-cloudformation/get-cloudformation-templates';
import { createStackPolicy, getCloudFormationTemplates } from '../../executors/accelerator-aws-cloudformation';
import { StackPolicyModule } from '../../lib/aws-cloudformation/create-stack-policy';
import { IStackPolicyHandlerParameter } from '../../interfaces/aws-cloudformation/create-stack-policy';

// Mock dependencies
vi.mock('../../lib/aws-cloudformation/get-cloudformation-templates');
vi.mock('../../lib/aws-cloudformation/create-stack-policy');

describe('getCloudFormationTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GetCloudFormationTemplatesModule', () => {
    const input: IGetCloudFormationTemplatesHandlerParameter = {
      ...MOCK_CONSTANTS.runnerParameters,
      configuration: MOCK_CONSTANTS.GetCloudFormationTemplatesModule.configuration,
    };
    test('should successfully configure default encryption key', async () => {
      // Setup
      const mockHandler = vi.fn().mockResolvedValue('SUCCESS');

      (GetCloudFormationTemplatesModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute
      const result = await getCloudFormationTemplates(input);

      // Verify
      expect(result).toBe('SUCCESS');
      expect(mockHandler).toHaveBeenCalledWith(input);
      expect(mockHandler).toHaveBeenCalledTimes(1);
    });

    test('should throw error when fails', async () => {
      // Setup

      const errorMessage = 'Operation failed';
      const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

      (GetCloudFormationTemplatesModule as unknown as vi.Mock).mockImplementation(() => ({
        handler: mockHandler,
      }));

      // Execute && Verify
      await expect(getCloudFormationTemplates(input)).rejects.toThrow(errorMessage);

      expect(mockHandler).toHaveBeenCalledWith(input);
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
      await import('../../executors/accelerator-aws-cloudformation');

      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    test('should rethrow the error when uncaughtException occurs', async () => {
      await import('../../executors/accelerator-aws-cloudformation');

      const testError = new Error('Test uncaught exception');
      const origin = 'uncaughtException';

      expect(processOnCallback).toBeDefined();

      expect(() => {
        processOnCallback(testError, origin);
      }).toThrow(testError);
    });
  });
});

describe('createStackPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('error rethrows exception', async () => {
    const errorMessage = 'Create Stack Policy test error';
    const mockHandler = vi.fn().mockRejectedValue(new Error(errorMessage));

    (StackPolicyModule as unknown as vi.Mock).mockImplementation(() => ({
      handler: mockHandler,
    }));
    const input = {} as IStackPolicyHandlerParameter;

    await expect(createStackPolicy(input)).rejects.toThrow(errorMessage);
  });

  test('success returns value', async () => {
    const resultMessage = 'Module success message';
    const mockHandler = vi.fn().mockReturnValue(resultMessage);

    (StackPolicyModule as unknown as vi.Mock).mockImplementation(() => ({
      handler: mockHandler,
    }));
    const input = {} as IStackPolicyHandlerParameter;

    // Execute
    const result = await createStackPolicy(input);

    // Verify
    expect(result).toBe(resultMessage);
    expect(mockHandler).toHaveBeenCalledWith(input);
    expect(mockHandler).toHaveBeenCalledTimes(1);
  });
});

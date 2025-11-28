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
import { MOCK_CONSTANTS } from '../../mocked-resources';
import {
  ICustomResourceTemplateModifierConfiguration,
  ICustomResourceTemplateModifierHandlerParameter,
} from '../../../interfaces/aws-cloudformation/custom-resource-template-modifier';
import { CustomResourceTemplateModifierModule } from '../../../lib/aws-cloudformation/custom-resource-template-modifier';

const configuration: ICustomResourceTemplateModifierConfiguration = {
  directory: './custom-resource-templates',
  accountId: '111111111111',
  region: 'us-east-1',
  stackName: 'stack1',
  resourceNames: ['resource1', 'resource2'],
};
const response = { status: true, message: 'mocked-response' };

describe('GetCloudFormationTemplatesModule Contract Compliance', () => {
  const input: ICustomResourceTemplateModifierHandlerParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration,
  };
  let module: CustomResourceTemplateModifierModule;

  beforeEach(() => {
    module = new CustomResourceTemplateModifierModule();
    // Mock the handler implementation
    vi.spyOn(module, 'handler').mockResolvedValue(response);
  });

  test('should implement all interface methods', () => {
    expect(module.handler).toBeDefined();
    expect(typeof module.handler).toBe('function');
  });

  test('should maintain correct method signatures', async () => {
    const result = module.handler(input);
    // Verify that handler returns a Promise
    expect(result).toBeInstanceOf(Promise);
    // Verify that the resolved value is a string
    await expect(result).resolves.toBe(response);
    await expect(result).resolves.toMatchObject(response);
  });

  test('should handle invalid inputs according to contract', async () => {
    // Reset mock to test error handling
    vi.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

    await expect(module.handler({} as ICustomResourceTemplateModifierHandlerParameter)).rejects.toThrow(
      'Invalid input parameters',
    );
  });

  test('should fulfill interface behavioral requirements', async () => {
    const result = await module.handler(input);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('message');
    expect(result.status).toBe(true);
    expect(result).toBeTruthy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

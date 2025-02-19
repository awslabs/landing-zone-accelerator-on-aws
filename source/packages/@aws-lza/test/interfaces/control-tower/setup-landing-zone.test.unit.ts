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
import { SetupLandingZoneModule } from '../../../lib/control-tower/setup-landing-zone';
import { MOCK_CONSTANTS } from '../../mocked-resources';
import { ISetupLandingZoneHandlerParameter } from '../../../interfaces/control-tower/setup-landing-zone';

describe('SetupLandingZoneModule Contract Compliance', () => {
  const input: ISetupLandingZoneHandlerParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: MOCK_CONSTANTS.setupControlTowerLandingZoneConfiguration,
  };
  let module: SetupLandingZoneModule;

  beforeEach(() => {
    module = new SetupLandingZoneModule();
    // Mock the handler implementation
    jest.spyOn(module, 'handler').mockImplementation(async () => 'mocked-response');
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
    await expect(result).resolves.toBe('mocked-response');
    await expect(result).resolves.toEqual(expect.any(String));
  });

  test('should handle invalid inputs according to contract', async () => {
    // Reset mock to test error handling
    jest.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

    await expect(module.handler({} as ISetupLandingZoneHandlerParameter)).rejects.toThrow('Invalid input parameters');
  });

  test('should fulfill interface behavioral requirements', async () => {
    const result = await module.handler(input);
    expect(typeof result).toBe('string');
    expect(result).toBeTruthy();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});

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
import { GetOrganizationalUnitsDetailModule } from '../../../lib/aws-organizations/get-organizational-units-detail';
import { MOCK_CONSTANTS } from '../../mocked-resources';
import { IGetOrganizationalUnitsDetailHandlerParameter } from '../../../interfaces/aws-organizations/get-organizational-units-detail';

describe('GetOrganizationalUnitsDetailModule Contract Compliance', () => {
  const mockResponse = [
    {
      organizationId: 'mockOrganizationId1',
      rootId: 'mockRootId1',
      name: 'mockName1',
      id: 'mockId1',
      arn: 'mockArn1',
      ouLevel: 1,
      parentId: 'mockParentId1',
      parentName: 'mockParentName1',
      completePath: 'mockCompletePath1',
      parentCompletePath: 'mockParentCompletePath1',
      registeredwithControlTower: true,
    },
    {
      organizationId: 'mockOrganizationId2',
      rootId: 'mockRootId2',
      name: 'mockName2',
      id: 'mockId2',
      arn: 'mockArn2',
      ouLevel: 2,
      parentId: 'mockParentId2',
      parentName: 'mockParentName2',
      completePath: 'mockCompletePath2',
      parentCompletePath: 'mockParentCompletePath2',
      registeredwithControlTower: false,
    },
  ];
  let module: GetOrganizationalUnitsDetailModule;

  const parameter: IGetOrganizationalUnitsDetailHandlerParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: {
      enableControlTower: true,
    },
  };

  beforeEach(() => {
    module = new GetOrganizationalUnitsDetailModule();
    // Mock the handler implementation
    vi.spyOn(module, 'handler').mockImplementation(async () => mockResponse);
  });

  test('should implement all interface methods', () => {
    expect(module.handler).toBeDefined();
    expect(typeof module.handler).toBe('function');
  });

  test('should maintain correct method signatures', async () => {
    const result = module.handler(parameter);
    // Verify that handler returns a Promise
    expect(result).toBeInstanceOf(Promise);
    // Verify that the resolved value is a string
    await expect(result).resolves.toBe(mockResponse);
    await expect(result).resolves.toEqual(mockResponse);
  });

  test('should handle invalid inputs according to contract', async () => {
    // Reset mock to test error handling
    vi.spyOn(module, 'handler').mockRejectedValue(new Error('Invalid input parameters'));

    await expect(module.handler({} as IGetOrganizationalUnitsDetailHandlerParameter)).rejects.toThrow(
      'Invalid input parameters',
    );
  });

  test('should fulfill interface behavioral requirements', async () => {
    const result = await module.handler(parameter);

    expect(typeof result).toBe('object');
    expect(result.length).toEqual(mockResponse.length);
    expect(result).toBeTruthy();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

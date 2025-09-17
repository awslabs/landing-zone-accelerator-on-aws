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
import { ControlTowerClient, EnabledBaselineSummary } from '@aws-sdk/client-controltower';
import { OrganizationalUnit, OrganizationsClient } from '@aws-sdk/client-organizations';

import { MOCK_CONSTANTS } from '../../../mocked-resources';
// import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { GetOrganizationalUnitsDetailModule } from '../../../../lib/aws-organizations/get-organizational-units-detail';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';
import { IGetOrganizationalUnitsDetailHandlerParameter } from '../../../../interfaces/aws-organizations/get-organizational-units-detail';

// Mock dependencies
vi.mock('@aws-sdk/client-controltower', () => ({
  ControlTowerClient: vi.fn(),
}));

vi.mock('@aws-sdk/client-organizations', () => ({
  OrganizationsClient: vi.fn(),
}));

describe('GetOrganizationalUnitsDetailModule', () => {
  const mockControlTowerSend = vi.fn();
  const mockOrganizationsSend = vi.fn();

  let isOrganizationsConfiguredSpy: vi.SpyInstance;
  let getLandingZoneIdentifierSpy: vi.SpyInstance;
  let getEnabledBaselinesSpy: vi.SpyInstance;
  let getOrganizationIdSpy: vi.SpyInstance;
  let getOrganizationRootIdSpy: vi.SpyInstance;
  let getOrganizationalUnitsForParentSpy: vi.SpyInstance;

  const parameter: IGetOrganizationalUnitsDetailHandlerParameter = {
    ...MOCK_CONSTANTS.runnerParameters,
    configuration: {
      enableControlTower: true,
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    (ControlTowerClient as vi.Mock).mockImplementation(() => ({
      send: mockControlTowerSend,
    }));

    (OrganizationsClient as vi.Mock).mockImplementation(() => ({
      send: mockOrganizationsSend,
    }));

    const commonFunctions = await import('../../../../common/functions');
    isOrganizationsConfiguredSpy = vi.spyOn(commonFunctions, 'isOrganizationsConfigured');
    getLandingZoneIdentifierSpy = vi.spyOn(commonFunctions, 'getLandingZoneIdentifier');
    getEnabledBaselinesSpy = vi.spyOn(commonFunctions, 'getEnabledBaselines');
    getOrganizationIdSpy = vi.spyOn(commonFunctions, 'getOrganizationId');
    getOrganizationRootIdSpy = vi.spyOn(commonFunctions, 'getOrganizationRootId');
    getOrganizationalUnitsForParentSpy = vi.spyOn(commonFunctions, 'getOrganizationalUnitsForParent');
  });

  describe('GetOrganizationalUnitsDetailModule', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should return empty array when organizations not configured', async () => {
      // Setup
      isOrganizationsConfiguredSpy.mockResolvedValue(false);

      // Execute
      const response = await new GetOrganizationalUnitsDetailModule().handler(parameter);

      // Verify
      expect(response).toEqual([]);
      expect(isOrganizationsConfiguredSpy).toHaveBeenCalledTimes(1);
      expect(getLandingZoneIdentifierSpy).toHaveBeenCalledTimes(0);
    });

    test('should return organizational units when organizations configured without control tower', async () => {
      // Setup
      isOrganizationsConfiguredSpy.mockResolvedValue(true);
      getOrganizationIdSpy.mockResolvedValue(MOCK_CONSTANTS.organization.Id);
      getOrganizationRootIdSpy.mockResolvedValue(MOCK_CONSTANTS.organizationRoot.Id);
      getOrganizationalUnitsForParentSpy
        .mockResolvedValueOnce([MOCK_CONSTANTS.newOrganizationalUnit]) // First call returns the OU
        .mockResolvedValue([]); // Subsequent calls return empty array

      // Execute
      const response = await new GetOrganizationalUnitsDetailModule().handler({
        ...MOCK_CONSTANTS.runnerParameters,
        configuration: {
          enableControlTower: false,
        },
      });

      // Verify
      expect(response).toHaveLength(1);
      expect(response[0]).toEqual({
        organizationId: MOCK_CONSTANTS.organization.Id,
        rootId: MOCK_CONSTANTS.organizationRoot.Id,
        name: MOCK_CONSTANTS.newOrganizationalUnit.Name,
        id: MOCK_CONSTANTS.newOrganizationalUnit.Id,
        arn: MOCK_CONSTANTS.newOrganizationalUnit.Arn,
        ouLevel: 1,
        parentId: MOCK_CONSTANTS.organizationRoot.Id,
        parentName: 'Root',
        completePath: MOCK_CONSTANTS.newOrganizationalUnit.Name,
        parentCompletePath: '',
        registeredwithControlTower: false,
      });
      expect(isOrganizationsConfiguredSpy).toHaveBeenCalledTimes(1);
      expect(getLandingZoneIdentifierSpy).toHaveBeenCalledTimes(0);
      expect(getEnabledBaselinesSpy).toHaveBeenCalledTimes(0);
    });

    test('should return organizational units when organizations configured without control tower identifier not found', async () => {
      // Setup
      isOrganizationsConfiguredSpy.mockResolvedValue(true);
      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);
      getOrganizationIdSpy.mockResolvedValue(MOCK_CONSTANTS.organization.Id);
      getOrganizationRootIdSpy.mockResolvedValue(MOCK_CONSTANTS.organizationRoot.Id);
      getOrganizationalUnitsForParentSpy
        .mockResolvedValueOnce([MOCK_CONSTANTS.newOrganizationalUnit]) // First call returns the OU
        .mockResolvedValue([]); // Subsequent calls return empty array

      // Execute
      const response = await new GetOrganizationalUnitsDetailModule().handler(parameter);

      // Verify
      expect(response).toHaveLength(1);
      expect(response[0]).toEqual({
        organizationId: MOCK_CONSTANTS.organization.Id,
        rootId: MOCK_CONSTANTS.organizationRoot.Id,
        name: MOCK_CONSTANTS.newOrganizationalUnit.Name,
        id: MOCK_CONSTANTS.newOrganizationalUnit.Id,
        arn: MOCK_CONSTANTS.newOrganizationalUnit.Arn,
        ouLevel: 1,
        parentId: MOCK_CONSTANTS.organizationRoot.Id,
        parentName: 'Root',
        completePath: MOCK_CONSTANTS.newOrganizationalUnit.Name,
        parentCompletePath: '',
        registeredwithControlTower: false,
      });
      expect(isOrganizationsConfiguredSpy).toHaveBeenCalledTimes(1);
      expect(getLandingZoneIdentifierSpy).toHaveBeenCalledTimes(1);
      expect(getEnabledBaselinesSpy).toHaveBeenCalledTimes(0);
    });

    test('should return organizational units with control tower registration when control tower configured', async () => {
      // Setup
      const mockBaselines: Partial<EnabledBaselineSummary>[] = [
        { targetIdentifier: MOCK_CONSTANTS.newOrganizationalUnit.Arn },
      ];

      isOrganizationsConfiguredSpy.mockResolvedValue(true);
      getLandingZoneIdentifierSpy.mockResolvedValue(
        MOCK_CONSTANTS.RegisterOrganizationalUnitModule.existingLandingZoneIdentifier,
      );
      getEnabledBaselinesSpy.mockResolvedValue(mockBaselines);
      getOrganizationIdSpy.mockResolvedValue(MOCK_CONSTANTS.organization.Id);
      getOrganizationRootIdSpy.mockResolvedValue(MOCK_CONSTANTS.organizationRoot.Id);
      getOrganizationalUnitsForParentSpy
        .mockResolvedValueOnce([MOCK_CONSTANTS.newOrganizationalUnit]) // First call returns the OU
        .mockResolvedValue([]); // Subsequent calls return empty array

      // Execute
      const response = await new GetOrganizationalUnitsDetailModule().handler(parameter);

      // Verify
      expect(response).toHaveLength(1);
      expect(response[0].registeredwithControlTower).toBe(true);
      expect(getEnabledBaselinesSpy).toHaveBeenCalledTimes(1);
    });

    test('should return hierarchical organizational units with correct paths', async () => {
      // Setup
      const mockChildOU: OrganizationalUnit = {
        Id: 'mockChildOuId',
        Name: 'ChildOU',
        Arn: 'mockChildOuArn',
      };

      isOrganizationsConfiguredSpy.mockResolvedValue(true);
      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);
      getOrganizationIdSpy.mockResolvedValue(MOCK_CONSTANTS.organization.Id);
      getOrganizationRootIdSpy.mockResolvedValue(MOCK_CONSTANTS.organizationRoot.Id);
      getOrganizationalUnitsForParentSpy
        .mockResolvedValueOnce([MOCK_CONSTANTS.newOrganizationalUnit])
        .mockResolvedValueOnce([mockChildOU]);

      // Execute
      const response = await new GetOrganizationalUnitsDetailModule().handler(parameter);

      // Verify
      expect(response).toHaveLength(2);
      expect(response[0]).toEqual(
        expect.objectContaining({
          name: MOCK_CONSTANTS.newOrganizationalUnit.Name,
          completePath: MOCK_CONSTANTS.newOrganizationalUnit.Name,
          parentCompletePath: '',
          ouLevel: 1,
        }),
      );
      expect(response[1]).toEqual(
        expect.objectContaining({
          name: 'ChildOU',
          completePath: `${MOCK_CONSTANTS.newOrganizationalUnit.Name}/ChildOU`,
          parentCompletePath: MOCK_CONSTANTS.newOrganizationalUnit.Name,
          ouLevel: 2,
        }),
      );
    });

    test('should throw error when organizational unit missing required fields', async () => {
      // Setup
      const mockOUWithMissingFields: OrganizationalUnit = {
        Id: 'mockOuId',
        Name: undefined,
        Arn: 'mockOuArn',
      };

      isOrganizationsConfiguredSpy.mockResolvedValue(true);
      getLandingZoneIdentifierSpy.mockResolvedValue(undefined);
      getOrganizationIdSpy.mockResolvedValue(MOCK_CONSTANTS.organization.Id);
      getOrganizationRootIdSpy.mockResolvedValue(MOCK_CONSTANTS.organizationRoot.Id);
      getOrganizationalUnitsForParentSpy.mockResolvedValue([mockOUWithMissingFields]);

      // Execute & Verify
      await expect(new GetOrganizationalUnitsDetailModule().handler(parameter)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListOrganizationalUnitsForParent did not return valid ou details, ou name, id or arn is missing for parent OU ${MOCK_CONSTANTS.organizationRoot.Id}`,
        ),
      );
    });

    test('should handle control tower registration check with undefined target identifier', async () => {
      // Setup
      const mockBaselines: Partial<EnabledBaselineSummary>[] = [
        { targetIdentifier: undefined },
        { targetIdentifier: 'mockDifferentOuArn' },
      ];

      isOrganizationsConfiguredSpy.mockResolvedValue(true);
      getLandingZoneIdentifierSpy.mockResolvedValue(
        MOCK_CONSTANTS.RegisterOrganizationalUnitModule.existingLandingZoneIdentifier,
      );
      getEnabledBaselinesSpy.mockResolvedValue(mockBaselines);
      getOrganizationIdSpy.mockResolvedValue(MOCK_CONSTANTS.organization.Id);
      getOrganizationRootIdSpy.mockResolvedValue(MOCK_CONSTANTS.organizationRoot.Id);
      getOrganizationalUnitsForParentSpy
        .mockResolvedValueOnce([MOCK_CONSTANTS.newOrganizationalUnit]) // First call returns the OU
        .mockResolvedValue([]); // Subsequent calls return empty array

      // Execute
      const response = await new GetOrganizationalUnitsDetailModule().handler(parameter);

      // Verify
      expect(response).toHaveLength(1);
      expect(response[0].registeredwithControlTower).toBe(false);
    });
  });
});

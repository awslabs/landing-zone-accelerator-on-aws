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

import { CreateOrganizationalUnitCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { CreateOrganizationalUnitModule } from '../../../../lib/aws-organizations/create-organizational-unit';

import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

// Mock dependencies
jest.mock('@aws-sdk/client-organizations', () => {
  return { OrganizationsClient: jest.fn(), CreateOrganizationalUnitCommand: jest.fn() };
});

describe('CreateOrganizationalUnitModule', () => {
  const mockSend = jest.fn();
  let getOrganizationalUnitsForParentSpy: jest.SpyInstance;
  let getParentOuIdSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();

    (OrganizationsClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    getOrganizationalUnitsForParentSpy = jest.spyOn(
      require('../../../../common/functions'),
      'getOrganizationalUnitsForParent',
    );

    getParentOuIdSpy = jest.spyOn(require('../../../../common/functions'), 'getParentOuId');
    getParentOuIdSpy.mockReturnValue(MOCK_CONSTANTS.organizationRoot.Id);
  });

  describe('NO DRY-RUN CreateOrganizationalUnitModule', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when ou not exists', async () => {
      // Setup
      getOrganizationalUnitsForParentSpy.mockReturnValue([]);

      mockSend.mockImplementation(command => {
        if (command instanceof CreateOrganizationalUnitCommand) {
          return Promise.resolve({
            OrganizationalUnit: MOCK_CONSTANTS.newOrganizationalUnit,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CreateOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch(
        `AWS Organizations organizational unit "${MOCK_CONSTANTS.validCreateOuConfiguration.name}" created successfully. New OU id is "${MOCK_CONSTANTS.newOrganizationalUnit.Id}".`,
      );
      expect(getOrganizationalUnitsForParentSpy).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(CreateOrganizationalUnitCommand).toHaveBeenCalledTimes(1);
    });

    test('should be successful when ou exists', async () => {
      // Setup
      getOrganizationalUnitsForParentSpy.mockReturnValue([
        ...MOCK_CONSTANTS.existingOrganizationalUnits,
        MOCK_CONSTANTS.newOrganizationalUnit,
      ]);

      mockSend.mockImplementation(command => {
        if (command instanceof CreateOrganizationalUnitCommand) {
          return Promise.resolve({
            OrganizationalUnit: MOCK_CONSTANTS.newOrganizationalUnit,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CreateOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch(
        `AWS Organizations organizational unit "${MOCK_CONSTANTS.validCreateOuConfiguration.name}" for parent "${MOCK_CONSTANTS.organizationRoot.Name}" exist, ou creation operation skipped.`,
      );
      expect(getOrganizationalUnitsForParentSpy).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(0);
      expect(CreateOrganizationalUnitCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful when ou not exists - ou name with nested path', async () => {
      // Setup
      getOrganizationalUnitsForParentSpy.mockReturnValue([...MOCK_CONSTANTS.existingOrganizationalUnits]);

      mockSend.mockImplementation(command => {
        if (command instanceof CreateOrganizationalUnitCommand) {
          return Promise.resolve({
            OrganizationalUnit: MOCK_CONSTANTS.newOrganizationalUnit,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new CreateOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.nestedOuNameConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch(
        `AWS Organizations organizational unit "${MOCK_CONSTANTS.nestedOuNameConfiguration.name.substring(
          MOCK_CONSTANTS.nestedOuNameConfiguration.name.lastIndexOf('/') + 1,
        )}" created successfully. New OU id is "${MOCK_CONSTANTS.newOrganizationalUnit.Id}".`,
      );
      expect(getOrganizationalUnitsForParentSpy).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(CreateOrganizationalUnitCommand).toHaveBeenCalledTimes(1);
    });

    test('should throw error when parent ou not found', async () => {
      // Setup
      getParentOuIdSpy.mockReturnValue(undefined);

      // Execute & Verify
      await expect(
        new CreateOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Parent OU "${MOCK_CONSTANTS.organizationRoot.Name}" of new ou ${MOCK_CONSTANTS.validCreateOuConfiguration.name} not found.`,
        ),
      );
    });

    test('should throw error when CreateOrganizationalUnitCommand did not return OrganizationalUnit object', async () => {
      // Setup
      getOrganizationalUnitsForParentSpy.mockReturnValue([]);

      mockSend.mockImplementation(command => {
        if (command instanceof CreateOrganizationalUnitCommand) {
          return Promise.resolve({
            OrganizationalUnit: undefined,
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute && verify
      await expect(
        new CreateOrganizationalUnitModule().handler({
          configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Organization unit "${MOCK_CONSTANTS.validCreateOuConfiguration.name}" create organization unit api did not return OrganizationalUnit object.`,
        ),
      );
    });
  });

  describe('DRY-RUN - CreateOrganizationalUnitModule', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when ou not exists', async () => {
      // Setup
      getOrganizationalUnitsForParentSpy.mockReturnValue([]);

      // Execute
      const response = await new CreateOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.organizationalUnitModule(
          `does not exists, accelerator will create the new OU.`,
        ),
      );
      expect(getOrganizationalUnitsForParentSpy).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(0);
      expect(CreateOrganizationalUnitCommand).toHaveBeenCalledTimes(0);
    });

    test('should be successful when ou exists', async () => {
      // Setup
      getOrganizationalUnitsForParentSpy.mockReturnValue([MOCK_CONSTANTS.newOrganizationalUnit]);

      // Execute
      const response = await new CreateOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.organizationalUnitModule(
          `exists, accelerator will skip the OU creation process.`,
        ),
      );
      expect(getOrganizationalUnitsForParentSpy).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledTimes(0);
      expect(CreateOrganizationalUnitCommand).toHaveBeenCalledTimes(0);
    });

    test('should throw error when invalid configuration input provided', async () => {
      // Setup
      getParentOuIdSpy.mockReturnValue(undefined);

      // Execute
      const response = await new CreateOrganizationalUnitModule().handler({
        configuration: MOCK_CONSTANTS.validCreateOuConfiguration,
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        MOCK_CONSTANTS.dryRunResponsePattern.organizationalUnitModule(
          `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason parent ou "${MOCK_CONSTANTS.organizationRoot.Name}" of new ou "${MOCK_CONSTANTS.validCreateOuConfiguration.name}" not found in AWS Organizations.`,
        ),
      );
    });
  });
});

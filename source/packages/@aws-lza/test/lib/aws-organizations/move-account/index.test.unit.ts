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

import {
  ChildNotFoundException,
  ListParentsCommand,
  MoveAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { MoveAccountModule } from '../../../../lib/aws-organizations/move-account';

import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { IMoveAccountHandlerParameter } from '../../../../interfaces/aws-organizations/move-account';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

// Mock dependencies
jest.mock('@aws-sdk/client-organizations', () => {
  return {
    OrganizationsClient: jest.fn(),
    ListParentsCommand: jest.fn(),
    MoveAccountCommand: jest.fn(),
    ChildNotFoundException: jest.fn(),
  };
});

jest.mock('../../../../common/functions', () => {
  return {
    ...jest.requireActual('../../../../common/functions'),
    delay: jest.fn().mockResolvedValue(undefined),
  };
});

describe('MoveAccountModule', () => {
  const mockSend = jest.fn();
  let getAccountDetailsFromOrganizationsSpy: jest.SpyInstance;
  let getOrganizationalUnitIdByPathSpy: jest.SpyInstance;
  let getAccountIdSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();

    (OrganizationsClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    getAccountDetailsFromOrganizationsSpy = jest.spyOn(
      require('../../../../common/functions'),
      'getAccountDetailsFromOrganizations',
    );
    getAccountDetailsFromOrganizationsSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.moveAccount);

    getOrganizationalUnitIdByPathSpy = jest.spyOn(
      require('../../../../common/functions'),
      'getOrganizationalUnitIdByPath',
    );

    getAccountIdSpy = jest.spyOn(require('../../../../common/functions'), 'getAccountId');
    getAccountIdSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.moveAccount.Id);
  });

  describe('Live Execution Operations', () => {
    const input: IMoveAccountHandlerParameter = {
      configuration: {
        email: MOCK_CONSTANTS.MoveAccountModule.configuration.email,
        destinationOu: MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu,
      },
      ...MOCK_CONSTANTS.runnerParameters,
    };
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when account is already part of destination ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [
              {
                Id: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
                Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
              },
            ],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountModule().handler({
        configuration: {
          email: MOCK_CONSTANTS.MoveAccountModule.configuration.email,
          destinationOu: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
        },
        ...MOCK_CONSTANTS.runnerParameters,
      });

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${MOCK_CONSTANTS.MoveAccountModule.configuration.email}" already part of AWS Organizations Organizational Unit "${MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu}", accelerator skipped the Account move process.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should be successful move account to nested ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${input.configuration.email}" successfully moved from "${MOCK_CONSTANTS.MoveAccountModule.currentParent.Id}" OU to "${input.configuration.destinationOu}" OU.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalled();
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('should throw error when destination parent id not found', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Organizational Unit path "${input.configuration.destinationOu}" not found.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when account does not have parent OU or the account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      getAccountDetailsFromOrganizationsSpy.mockReturnValue({ Id: undefined });
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with email "${input.configuration.email}" does not have parent OU or the account is not part of AWS Organizations.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(0);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should throw error when account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with email "${input.configuration.email}" is not part of AWS Organizations.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(0);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should throw ChildNotFoundException', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.reject(new ChildNotFoundException({ message: 'Child not found', $metadata: {} }));
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Account with email "${input.configuration.email}" does not have parent OU or the account is not part of AWS Organizations.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw unknown exception', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(MOCK_CONSTANTS.unknownError.message),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when ListParentsCommand api did not returned Parents object', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({ Parents: undefined });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned Parents object for account "${input.configuration.email}"`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when ListParentsCommand api did returned multiple Parents', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [
              {
                Id: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
                Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
              },
              {
                Id: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
                Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
              },
            ],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api returned multiple Parents for account "${input.configuration.email}"`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when ListParentsCommand api did returned no Parents', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned any Parents for account "${input.configuration.email}"`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when ListParentsCommand api did not returned Parent Id', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [{ Id: undefined, Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type }],
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: ListParentsCommand api did not returned Id property of Parents object for account "${input.configuration.email}"`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when ListParentsCommand api did not returned Parent Id', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new MoveAccountModule().handler(input)).rejects.toThrowError(
        new RegExp(MOCK_CONSTANTS.unknownError.message),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(1);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('Dry Run Mode Operations', () => {
    const input = {
      configuration: {
        email: MOCK_CONSTANTS.MoveAccountModule.configuration.email,
        destinationOu: MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu,
      },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful move account to nested ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${input.configuration.email}" is part of AWS Organizations Organizational Unit (OU) "${MOCK_CONSTANTS.MoveAccountModule.currentParent.Id}", accelerator will move the account into "${input.configuration.destinationOu}" OU.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should be successful when account is already part of destination ou', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [
              {
                Id: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
                Type: MOCK_CONSTANTS.MoveAccountModule.currentParent.Type,
              },
            ],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountModule().handler({
        configuration: {
          email: MOCK_CONSTANTS.MoveAccountModule.configuration.email,
          destinationOu: MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu,
        },
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${MOCK_CONSTANTS.MoveAccountModule.configuration.email}" already part of AWS Organizations Organizational Unit "${MOCK_CONSTANTS.MoveAccountModule.rootDestinationOu}", accelerator will skip the Account move process.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when destination parent id not found', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, Invalid destination ou: "${input.configuration.destinationOu}" provided for the account with email ${input.configuration.email}.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(1);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, account with email "${input.configuration.email}" not part of AWS Organizations.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(0);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should throw error when account does not have parent OU or the account is not part of AWS Organizations', async () => {
      // Setup
      getOrganizationalUnitIdByPathSpy.mockReturnValue(MOCK_CONSTANTS.MoveAccountModule.configuration.destinationOu);
      getAccountDetailsFromOrganizationsSpy.mockReturnValue({ Id: undefined });
      mockSend.mockImplementation(command => {
        if (command instanceof ListParentsCommand) {
          return Promise.resolve({
            Parents: [MOCK_CONSTANTS.MoveAccountModule.currentParent],
          });
        }
        if (command instanceof MoveAccountCommand) {
          return Promise.resolve({});
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new MoveAccountModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}: because, account with "${input.configuration.email}" does not have parent OU or the account is not part of AWS Organizations.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getOrganizationalUnitIdByPathSpy).toHaveBeenCalled();
      expect(getAccountIdSpy).toHaveBeenCalledTimes(0);
      expect(ListParentsCommand).toHaveBeenCalledTimes(0);
      expect(MoveAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });
  });
});

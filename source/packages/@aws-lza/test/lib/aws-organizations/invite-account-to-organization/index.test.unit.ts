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
  AcceptHandshakeCommand,
  CancelHandshakeCommand,
  HandshakePartyType,
  HandshakeState,
  InviteAccountToOrganizationCommand,
  ListHandshakesForAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { InviteAccountToOrganizationModule } from '../../../../lib/aws-organizations/invite-account-to-organization';

import { MOCK_CONSTANTS } from '../../../mocked-resources';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

// Mock dependencies
jest.mock('@aws-sdk/client-organizations', () => {
  return {
    OrganizationsClient: jest.fn(),
    InviteAccountToOrganizationCommand: jest.fn(),
    AcceptHandshakeCommand: jest.fn(),
    ListHandshakesForAccountCommand: jest.fn(),
    HandshakeState: {
      ACCEPTED: 'ACCEPTED',
      OPEN: 'OPEN',
      CANCELED: 'CANCELED',
      DECLINED: 'DECLINED',
      EXPIRED: 'EXPIRED',
    },
    HandshakePartyType: {
      ACCOUNT: 'ACCOUNT',
      EMAIL: 'EMAIL',
    },
    CancelHandshakeCommand: jest.fn(),
  };
});

jest.mock('../../../../common/functions', () => {
  return {
    ...jest.requireActual('../../../../common/functions'),
    delay: jest.fn().mockResolvedValue(undefined),
  };
});

describe('InviteAccountToOrganizationModule', () => {
  const mockSend = jest.fn();
  const invalidEmail = 'invalid-email';
  let getAccountDetailsFromOrganizationsSpy: jest.SpyInstance;
  let getCredentialsSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();

    (OrganizationsClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    getAccountDetailsFromOrganizationsSpy = jest.spyOn(
      require('../../../../common/functions'),
      'getAccountDetailsFromOrganizations',
    );
    getAccountDetailsFromOrganizationsSpy.mockReturnValue(
      MOCK_CONSTANTS.InviteAccountToOrganizationModule.invitingAccount,
    );

    getCredentialsSpy = jest.spyOn(require('../../../../common/functions'), 'getCredentials');
    getCredentialsSpy.mockReturnValue(MOCK_CONSTANTS.credentials);
  });

  describe('Live Execution Operations', () => {
    const input = {
      configuration: MOCK_CONSTANTS.InviteAccountToOrganizationModule.configuration,
      ...MOCK_CONSTANTS.runnerParameters,
    };
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when account exists in organizations', async () => {
      // Execute
      const response = await new InviteAccountToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${input.configuration.email}" already part of AWS Organizations, accelerator skipped the Account invitation process.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should be successful when inviting account to organizations with AcceptHandshakeCommand returning open status', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      let listHandshakesForAccountCommandCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }
        if (command instanceof ListHandshakesForAccountCommand) {
          listHandshakesForAccountCommandCount++;
          if (listHandshakesForAccountCommandCount === 1) {
            return Promise.resolve({
              Handshakes: [
                {
                  Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                  State: HandshakeState.OPEN,
                },
              ],
            });
          }
          return Promise.resolve({
            Handshakes: [
              {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: HandshakeState.ACCEPTED,
              },
            ],
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.OPEN,
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new InviteAccountToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Invitation to AWS Organizations for AWS Account with email "${input.configuration.email}" completed successfully.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getCredentialsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(2);
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    test('should be successful when inviting account to organizations without AcceptHandshakeCommand returning open status', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.ACCEPTED,
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute
      const response = await new InviteAccountToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Invitation to AWS Organizations for AWS Account with email "${input.configuration.email}" completed successfully.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getCredentialsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    test('should throw error when InviteAccountToOrganizationCommand api did not return Handshake object', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: undefined,
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${input.configuration.email}" InviteAccountToOrganizationCommand api did not return Handshake object.`,
        ),
      );

      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when InviteAccountToOrganizationCommand api did not return Handshake Id', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: { Id: undefined },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${input.configuration.email}" InviteAccountToOrganizationCommand api did not return Handshake object Id property.`,
        ),
      );

      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when InviteAccountToOrganizationCommand api failed with unknown error', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(MOCK_CONSTANTS.unknownError.message),
      );

      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    test('should throw error when AcceptHandshakeCommand api did not return Handshake object', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: undefined,
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }

        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.email}" AcceptHandshakeCommand api did not return any Handshake response, please investigate the account invitation.`,
        ),
      );

      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    test('should throw error when AcceptHandshakeCommand api did not return Handshake Id', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: undefined,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }

        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.email}" AcceptHandshakeCommand api did not return any Id property of Handshake object, please investigate the account invitation.`,
        ),
      );

      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    test('should throw error when ListHandshakesForAccountCommand api did not return Handshakes object', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }
        if (command instanceof ListHandshakesForAccountCommand) {
          return Promise.resolve({
            Handshakes: undefined,
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.OPEN,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.email}" ListHandshakesForAccountCommand api did not return Handshakes object, please investigate the account invitation.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getCredentialsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(1);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    test('should throw error when ListHandshakesForAccountCommand api could not find handshake information for the account', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }
        if (command instanceof ListHandshakesForAccountCommand) {
          return Promise.resolve({
            Handshakes: [
              {
                Id: 'invalidId',
                State: HandshakeState.ACCEPTED,
              },
            ],
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.OPEN,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.email}" ListHandshakesForAccountCommand api could not find handshake information with handshake id "${MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id}", please investigate the account invitation.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getCredentialsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(1);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    test('should throw error when ListHandshakesForAccountCommand api could not find handshake status for the account', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }
        if (command instanceof ListHandshakesForAccountCommand) {
          return Promise.resolve({
            Handshakes: [
              {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: undefined,
              },
            ],
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.OPEN,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.email}" ListHandshakesForAccountCommand api could not find handshake status with handshake id "${MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id}", please investigate the account invitation.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getCredentialsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(1);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(4);
    });

    test('should throw error when invitation acceptance operation took more than 10 minutes', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }
        if (command instanceof ListHandshakesForAccountCommand) {
          return Promise.resolve({
            Handshakes: [
              {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: HandshakeState.OPEN,
              },
            ],
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.OPEN,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.email}" invitation acceptance operation took more than 10 minutes, operation failed, please review AWS Account with email "${input.configuration.email}" and complete acceptance of invitation.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getCredentialsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(11);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(14);
    });

    test('should throw error when invitation failed', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }
        if (command instanceof ListHandshakesForAccountCommand) {
          return Promise.resolve({
            Handshakes: [
              {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: HandshakeState.DECLINED,
              },
            ],
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.OPEN,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountToOrganizationModule().handler(input)).rejects.toThrowError(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.email}" invitation status is "${HandshakeState.DECLINED}", please investigate the account invitation.`,
        ),
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(getCredentialsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(1);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(2);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(5);
    });

    test('should throw error when invalid configuration provides', async () => {
      // Execute & Verify
      await expect(
        new InviteAccountToOrganizationModule().handler({
          configuration: {
            email: invalidEmail,
            accountId: MOCK_CONSTANTS.InviteAccountToOrganizationModule.configuration.accountId,
            accountAccessRoleName: MOCK_CONSTANTS.InviteAccountToOrganizationModule.configuration.accountAccessRoleName,
          },
          ...MOCK_CONSTANTS.runnerParameters,
        }),
      ).rejects.toThrowError(
        new RegExp(`${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid account email "${invalidEmail}".`),
      );

      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });
  });

  describe('Dry Run Mode Operations', () => {
    const input = {
      configuration: MOCK_CONSTANTS.InviteAccountToOrganizationModule.configuration,
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should be successful when account exists in organizations', async () => {
      // Execute
      const response = await new InviteAccountToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${input.configuration.email}" already part of AWS Organizations, accelerator will skip the Account invitation process.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should be successful when inviting account to organizations', async () => {
      // Setup
      getAccountDetailsFromOrganizationsSpy.mockReturnValue(undefined);

      // Execute
      const response = await new InviteAccountToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account with email "${input.configuration.email}" is not part of AWS Organizations, accelerator will invite the account into organizations.`,
      );
      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should throw error when invalid configuration provides', async () => {
      // Execute
      const response = await new InviteAccountToOrganizationModule().handler({
        configuration: {
          email: invalidEmail,
          accountId: MOCK_CONSTANTS.InviteAccountToOrganizationModule.configuration.accountId,
          accountAccessRoleName: MOCK_CONSTANTS.InviteAccountToOrganizationModule.configuration.accountAccessRoleName,
        },
        ...MOCK_CONSTANTS.runnerParameters,
        dryRun: true,
      });

      // Verify
      expect(response).toMatch(
        `Will experience ${MODULE_EXCEPTIONS.INVALID_INPUT}. Reason Invalid email id "${invalidEmail}" provided for the account to be invited.`,
      );

      expect(getAccountDetailsFromOrganizationsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });
  });
});

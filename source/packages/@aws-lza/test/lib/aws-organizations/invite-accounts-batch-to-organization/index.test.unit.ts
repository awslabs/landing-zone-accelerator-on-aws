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

import {
  AcceptHandshakeCommand,
  CancelHandshakeCommand,
  HandshakePartyType,
  HandshakeState,
  InviteAccountToOrganizationCommand,
  ListHandshakesForAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

import { countOverlappingAccounts, MOCK_CONSTANTS } from '../../../mocked-resources';
import { InviteAccountsBatchToOrganizationModule } from '../../../../lib/aws-organizations/invite-accounts-batch-to-organization';
import { MODULE_EXCEPTIONS } from '../../../../common/enums';

// Mock dependencies
vi.mock('@aws-sdk/client-organizations', () => {
  return {
    OrganizationsClient: vi.fn(),
    InviteAccountToOrganizationCommand: vi.fn(),
    AcceptHandshakeCommand: vi.fn(),
    ListHandshakesForAccountCommand: vi.fn(),
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
    CancelHandshakeCommand: vi.fn(),
  };
});

vi.mock('../../../../common/functions', async () => {
  const actual = await vi.importActual('../../../../common/functions');
  return {
    ...actual,
    delay: vi.fn().mockResolvedValue(undefined),
  };
});

describe('InviteAccountToOrganizationModule', () => {
  const mockSend = vi.fn();
  let getOrganizationAccountsSpy: vi.SpyInstance;
  let getCredentialsSpy: vi.SpyInstance;
  beforeEach(async () => {
    vi.clearAllMocks();

    (OrganizationsClient as vi.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    const commonFunctions = await import('../../../../common/functions');
    getOrganizationAccountsSpy = vi.spyOn(commonFunctions, 'getOrganizationAccounts');
    getOrganizationAccountsSpy.mockReturnValue(MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts);

    getCredentialsSpy = vi.spyOn(commonFunctions, 'getCredentials');
    getCredentialsSpy.mockReturnValue(MOCK_CONSTANTS.credentials);
  });

  describe('Live Execution Operations', () => {
    const input = {
      configuration: { accounts: MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.configuration },
      ...MOCK_CONSTANTS.runnerParameters,
    };
    const invalidInput = {
      configuration: { accounts: MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.inValidConfiguration },
      ...MOCK_CONSTANTS.runnerParameters,
    };
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should be successful when few accounts already exists in organizations and invited other new accounts', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.overlapExistingAccounts,
      );
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
      const response = await new InviteAccountsBatchToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Invitation to AWS Organizations for AWS Account with email "${
          input.configuration.accounts[1].email
        }" completed successfully.\nTotal ${
          countOverlappingAccounts().existingAccountsCount
        } AWS Account(s) already part of AWS Organizations, accelerator skipped the Account invitation process.`,
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(countOverlappingAccounts().newAccountsCount);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(countOverlappingAccounts().newAccountsCount);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(countOverlappingAccounts().totalInputAccounts);
    });

    test('should be successful when few accounts already exists in organizations and invited other new accounts with multiple attempt to check invite status', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.overlapExistingAccounts,
      );
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
      const response = await new InviteAccountsBatchToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `Invitation to AWS Organizations for AWS Account with email "${
          input.configuration.accounts[1].email
        }" completed successfully.\nTotal ${
          countOverlappingAccounts().existingAccountsCount
        } AWS Account(s) already part of AWS Organizations, accelerator skipped the Account invitation process.`,
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(countOverlappingAccounts().newAccountsCount);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(countOverlappingAccounts().newAccountsCount);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(
        countOverlappingAccounts().newAccountsCount * listHandshakesForAccountCommandCount,
      );
      expect(mockSend).toHaveBeenCalledTimes(
        countOverlappingAccounts().totalInputAccounts * listHandshakesForAccountCommandCount,
      );
    });

    test('should be successful when all accounts are already part of organizations', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.allOverlapExistingAccounts,
      );
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
      const response = await new InviteAccountsBatchToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `All provided AWS Accounts are already part of AWS Organizations, accelerator skipped the Account invitation process.`,
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should be successful when all accounts needs to invite', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
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
      const response = await new InviteAccountsBatchToOrganizationModule().handler(input);

      // Verify
      const message: string[] = [];
      for (const account of input.configuration.accounts) {
        message.push(
          `Invitation to AWS Organizations for AWS Account with email "${account.email}" completed successfully.`,
        );
      }
      expect(response).toMatch(message.join('\n'));
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 2);
    });

    test('should handle invalid input error', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
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

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(invalidInput)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.INVALID_INPUT}: Invalid account email "${invalidInput.configuration.accounts.map(
            item => item.email,
          )}".`,
        ),
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should throw error when account registration timed out', async () => {
      // Setup
      const timeoutInMinutes = 10;
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
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
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.accounts[0].email}" invitation acceptance operation took more than ${timeoutInMinutes} minutes, operation failed, please review AWS Account with email "${input.configuration.accounts[0].email}" and complete acceptance of invitation.`,
        ),
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(
        input.configuration.accounts.length * timeoutInMinutes + 2,
      );
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * timeoutInMinutes + 8);
    });

    test('should throw error when InviteAccountToOrganizationCommand api did not return Handshake object', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
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
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${input.configuration.accounts[0].email}" InviteAccountToOrganizationCommand api did not return Handshake object.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length);
    });

    test('should throw error when InviteAccountToOrganizationCommand api did not return Handshake Id', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
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
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Account "${input.configuration.accounts[0].email}" InviteAccountToOrganizationCommand api did not return Handshake object.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length);
    });

    test('should throw error when InviteAccountToOrganizationCommand api failed with unknown error', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.reject(MOCK_CONSTANTS.unknownError);
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(MOCK_CONSTANTS.unknownError.message),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length);
    });

    test('should throw error when AcceptHandshakeCommand api did not return Handshake object', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
      let acceptHandshakeCommandCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          acceptHandshakeCommandCount++;
          if (acceptHandshakeCommandCount === 1) {
            return Promise.resolve({
              Handshake: undefined,
            });
          }
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.ACCEPTED,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.accounts[0].email}" AcceptHandshakeCommand api did not return any Handshake response, please investigate the account invitation.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 3 - 1);
    });

    test('should throw error when AcceptHandshakeCommand api did not return Handshake Id', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
      let acceptHandshakeCommandCount = 0;
      mockSend.mockImplementation(command => {
        if (command instanceof InviteAccountToOrganizationCommand) {
          return Promise.resolve({
            Handshake: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake,
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          acceptHandshakeCommandCount++;
          if (acceptHandshakeCommandCount === 1) {
            return Promise.resolve({
              Handshake: {
                Id: undefined,
              },
            });
          }
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.ACCEPTED,
            },
          });
        }

        if (command instanceof CancelHandshakeCommand) {
          return Promise.resolve({
            Handshake: {
              Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
              State: HandshakeState.CANCELED,
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.accounts[0].email}" AcceptHandshakeCommand api did not return any Id property of Handshake object, please investigate the account invitation.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 3 - 1);
    });

    test('should throw error when ListHandshakesForAccountCommand api did not return Handshakes object', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
      let listHandshakesForAccountCommandCount = 0;
      let listAcceptHandshakeCommandCount = 0;
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
            Handshakes: undefined,
          });
        }

        if (command instanceof AcceptHandshakeCommand) {
          listAcceptHandshakeCommandCount++;
          if (listAcceptHandshakeCommandCount === 1) {
            return Promise.resolve({
              Handshake: {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: HandshakeState.ACCEPTED,
              },
            });
          }
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
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.accounts[1].email}" ListHandshakesForAccountCommand api did not return Handshakes object, please investigate the account invitation.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 3 + 1);
    });

    test('should throw error when ListHandshakesForAccountCommand api could not find handshake information for the account', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
      let listHandshakesForAccountCommandCount = 0;
      let listAcceptHandshakeCommandCount = 0;
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
                  Id: 'invalidId',
                  State: HandshakeState.ACCEPTED,
                },
              ],
            });
          }
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
          listAcceptHandshakeCommandCount++;
          if (listAcceptHandshakeCommandCount === 1) {
            return Promise.resolve({
              Handshake: {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: HandshakeState.ACCEPTED,
              },
            });
          }
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
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.accounts[1].email}" ListHandshakesForAccountCommand api could not find handshake information with handshake id "${MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id}", please investigate the account invitation.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 3);
    });

    test('should throw error when ListHandshakesForAccountCommand api could not find handshake status for the account', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
      let listHandshakesForAccountCommandCount = 0;
      let listAcceptHandshakeCommandCount = 0;
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
                  State: undefined,
                },
              ],
            });
          }
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
          listAcceptHandshakeCommandCount++;
          if (listAcceptHandshakeCommandCount === 1) {
            return Promise.resolve({
              Handshake: {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: HandshakeState.ACCEPTED,
              },
            });
          }
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
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.accounts[1].email}" ListHandshakesForAccountCommand api could not find handshake status with handshake id "${MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id}", please investigate the account invitation.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 3);
    });

    test('should throw error when invitation failed', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );
      let listAcceptHandshakeCommandCount = 0;
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
          listAcceptHandshakeCommandCount++;
          if (listAcceptHandshakeCommandCount === 1) {
            return Promise.resolve({
              Handshake: {
                Id: MOCK_CONSTANTS.InviteAccountToOrganizationModule.inviteHandshake.Id,
                State: HandshakeState.ACCEPTED,
              },
            });
          }
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
              Parties: [{ Id: input.configuration.accounts[0].accountId, Type: HandshakePartyType.ACCOUNT }],
            },
          });
        }
        return Promise.reject(MOCK_CONSTANTS.unknownError);
      });

      // Execute & Verify
      await expect(new InviteAccountsBatchToOrganizationModule().handler(input)).rejects.toThrow(
        new RegExp(
          `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: AWS Account with email "${input.configuration.accounts[1].email}" invitation status is "${HandshakeState.DECLINED}", please investigate the account invitation.`,
        ),
      );

      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(input.configuration.accounts.length);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(input.configuration.accounts.length - 1);
      expect(mockSend).toHaveBeenCalledTimes(input.configuration.accounts.length * 3 + 1);
    });

    test('should handle when no accounts provided', async () => {
      // Setup
      const emptyInput = {
        configuration: { accounts: [] },
        ...MOCK_CONSTANTS.runnerParameters,
      };

      // Execute
      const response = await new InviteAccountsBatchToOrganizationModule().handler(emptyInput);

      // Verify
      expect(response).toMatch(`No accounts provided to invite to AWS Organizations.`);
      expect(getOrganizationAccountsSpy).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(CancelHandshakeCommand).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
      expect(mockSend).toHaveBeenCalledTimes(emptyInput.configuration.accounts.length);
    });
  });

  describe('Dry Run Mode Operations', () => {
    const input = {
      configuration: { accounts: MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.configuration },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };

    const invalidInput = {
      configuration: { accounts: MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.inValidConfiguration },
      ...MOCK_CONSTANTS.runnerParameters,
      dryRun: true,
    };
    beforeEach(() => {
      vi.clearAllMocks();
    });

    test('should be successful when all accounts needs to invite', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.existingAccounts,
      );

      // Execute
      const response = await new InviteAccountsBatchToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account(s) with email "${input.configuration.accounts.map(
          item => item.email,
        )}" will be invited into AWS Organizations.`,
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should be successful when all accounts are already part of organizations', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.allOverlapExistingAccounts,
      );

      // Execute
      const response = await new InviteAccountsBatchToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account(s) with email "${MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.allOverlapExistingAccounts.map(
          item => item.Email,
        )}" already part of AWS Organizations, accelerator will skip the Account invitation process.`,
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should be successful when few accounts already exists in organizations and invited other new accounts', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.overlapExistingAccounts,
      );

      // Execute
      const response = await new InviteAccountsBatchToOrganizationModule().handler(input);

      // Verify
      expect(response).toMatch(
        `AWS Account(s) with email "${
          input.configuration.accounts[1].email
        }" will be invited into AWS Organizations.\nTotal ${
          countOverlappingAccounts().newAccountsCount
        } AWS Account(s) already part of AWS Organizations, accelerator skipped the Account invitation process.`,
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });

    test('should handle invalid input error', async () => {
      // Setup
      getOrganizationAccountsSpy.mockReturnValue(
        MOCK_CONSTANTS.InviteAccountsBatchToOrganizationModule.overlapExistingAccounts,
      );

      // Execute
      const response = await new InviteAccountsBatchToOrganizationModule().handler(invalidInput);

      // Verify
      expect(response).toMatch(
        `Will experience ${
          MODULE_EXCEPTIONS.INVALID_INPUT
        }. Reason Invalid email id(s) provided for one or more accounts to be invited. Invalid email id(s) "${invalidInput.configuration.accounts.map(
          item => item.email,
        )}"`,
      );
      expect(getOrganizationAccountsSpy).toHaveBeenCalled();
      expect(InviteAccountToOrganizationCommand).toHaveBeenCalledTimes(0);
      expect(AcceptHandshakeCommand).toHaveBeenCalledTimes(0);
      expect(ListHandshakesForAccountCommand).toHaveBeenCalledTimes(0);
      expect(mockSend).toHaveBeenCalledTimes(0);
    });
  });
});

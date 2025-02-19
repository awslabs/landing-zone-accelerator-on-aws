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

import { SharedAccount } from '../../../../../lib/control-tower/setup-landing-zone/prerequisites/shared-account';
import {
  CreateAccountCommand,
  CreateAccountState,
  DescribeCreateAccountStatusCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';

// Mock dependencies
jest.mock('@aws-sdk/client-organizations', () => {
  return {
    CreateAccountCommand: jest.fn(),
    CreateAccountStatus: jest.fn(),
    DescribeCreateAccountStatusCommand: jest.fn(),
    OrganizationsClient: jest.fn(),
    CreateAccountState: {
      FAILED: 'FAILED',
      SUCCEEDED: 'SUCCEEDED',
      IN_PROGRESS: 'IN_PROGRESS',
    },
  };
});
jest.mock('../../../../../common/functions', () => ({
  delay: jest.fn().mockResolvedValue(undefined),
  setRetryStrategy: jest.fn().mockResolvedValue(undefined),
}));

const MOCK_CONSTANTS = {
  logArchiveAccountItem: { name: 'mockLogArchive', email: 'mockLogArchive@example.com' },
  auditAccountItem: { name: 'mockAudit', email: 'mockAudit@example.com' },
  globalRegion: 'mockGlobalRegion',
  solutionId: 'mockSolutionId',
  credentials: {
    accessKeyId: 'mockAccessKeyId',
    secretAccessKey: 'mockSecretAccessKey',
    sessionToken: 'mockSessionToken',
    expiration: new Date('2024-12-31'),
  },
  createAccountStatusSuccessResponse: {
    CreateAccountStatus: { AccountName: ' mockAccount', Id: 'mockId', State: CreateAccountState.SUCCEEDED },
  },
  createAccountStatusFailedResponse: {
    CreateAccountStatus: {
      AccountName: ' mockAccount',
      Id: 'mockId',
      State: CreateAccountState.FAILED,
      FailureReason: 'mock failure reason',
    },
  },
  createAccountStatusInProgressResponse: {
    CreateAccountStatus: { AccountName: ' mockAccount', Id: 'mockId', State: CreateAccountState.IN_PROGRESS },
  },
  unknownError: new Error('Unknown command'),
  accountCreationFailureError: new RegExp(`Shared account creation failure !!!`),
};

describe('IAM Role Tests', () => {
  const mockSend = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();

    (OrganizationsClient as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));
  });

  test('should create both the shared accounts', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof CreateAccountCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusSuccessResponse);
      }
      if (command instanceof DescribeCreateAccountStatusCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusSuccessResponse);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute
    const response = await SharedAccount.createAccounts(
      MOCK_CONSTANTS.logArchiveAccountItem,
      MOCK_CONSTANTS.auditAccountItem,
      MOCK_CONSTANTS.globalRegion,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );
    expect(response).toBeUndefined();
    expect(CreateAccountCommand).toHaveBeenCalledTimes(2);
    expect(DescribeCreateAccountStatusCommand).toHaveBeenCalledTimes(0);
  });

  test('should create both the shared accounts with in-progress status found', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof CreateAccountCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusInProgressResponse);
      }
      if (command instanceof DescribeCreateAccountStatusCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusSuccessResponse);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute
    const response = await SharedAccount.createAccounts(
      MOCK_CONSTANTS.logArchiveAccountItem,
      MOCK_CONSTANTS.auditAccountItem,
      MOCK_CONSTANTS.globalRegion,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.credentials,
    );
    expect(response).toBeUndefined();
    expect(CreateAccountCommand).toHaveBeenCalledTimes(2);
    expect(DescribeCreateAccountStatusCommand).toHaveBeenCalledTimes(2);
  });

  test('should handle account creation failure error', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof CreateAccountCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusFailedResponse);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await SharedAccount.createAccounts(
        MOCK_CONSTANTS.logArchiveAccountItem,
        MOCK_CONSTANTS.auditAccountItem,
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrowError(MOCK_CONSTANTS.accountCreationFailureError);
    expect(CreateAccountCommand).toHaveBeenCalledTimes(2);
    expect(DescribeCreateAccountStatusCommand).toHaveBeenCalledTimes(0);
  });

  test('should handle account creation failure error after creation status was found in-progress', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof CreateAccountCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusInProgressResponse);
      }
      if (command instanceof DescribeCreateAccountStatusCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusFailedResponse);
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await SharedAccount.createAccounts(
        MOCK_CONSTANTS.logArchiveAccountItem,
        MOCK_CONSTANTS.auditAccountItem,
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrowError(MOCK_CONSTANTS.accountCreationFailureError);
    expect(CreateAccountCommand).toHaveBeenCalledTimes(2);
    expect(DescribeCreateAccountStatusCommand).toHaveBeenCalledTimes(2);
  });

  test('should internal error for create account command', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof CreateAccountCommand) {
        return Promise.resolve({ CreateAccountStatus: undefined });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await SharedAccount.createAccounts(
        MOCK_CONSTANTS.logArchiveAccountItem,
        MOCK_CONSTANTS.auditAccountItem,
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrowError(
      new RegExp(
        `Internal error: account creation failed, CreateAccountCommand didn't return CreateAccountStatus object for`,
      ),
    );
    expect(CreateAccountCommand).toHaveBeenCalledTimes(2);
    expect(DescribeCreateAccountStatusCommand).toHaveBeenCalledTimes(0);
  });

  test('should internal error for describe create account status command', async () => {
    // Setup
    mockSend.mockImplementation(command => {
      if (command instanceof CreateAccountCommand) {
        return Promise.resolve(MOCK_CONSTANTS.createAccountStatusInProgressResponse);
      }
      if (command instanceof DescribeCreateAccountStatusCommand) {
        return Promise.resolve({ CreateAccountStatus: undefined });
      }
      return Promise.reject(MOCK_CONSTANTS.unknownError);
    });

    // Execute & Verify
    await expect(async () => {
      await SharedAccount.createAccounts(
        MOCK_CONSTANTS.logArchiveAccountItem,
        MOCK_CONSTANTS.auditAccountItem,
        MOCK_CONSTANTS.globalRegion,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.credentials,
      );
    }).rejects.toThrowError(
      new RegExp(
        `Internal error: account creation failed, DescribeCreateAccountStatusCommand didn't return CreateAccountStatus object for`,
      ),
    );
    expect(CreateAccountCommand).toHaveBeenCalledTimes(2);
    expect(DescribeCreateAccountStatusCommand).toHaveBeenCalledTimes(2);
  });
});

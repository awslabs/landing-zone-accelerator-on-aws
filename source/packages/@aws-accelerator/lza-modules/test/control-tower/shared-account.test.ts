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
  AcceleratorMockClient,
  AccountCreationInternalFailureError,
  AuditAccount,
  ConfigPath,
  GlobalRegion,
  LogArchiveAccount,
  SolutionId,
} from '../utils/test-resources';
import { SharedAccount } from '../../lib/control-tower/prerequisites/shared-account';
import {
  CreateAccountCommand,
  CreateAccountState,
  DescribeCreateAccountStatusCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import * as CommonResources from '../../lib/control-tower/utils/resources';

const client = AcceleratorMockClient(OrganizationsClient);
const mockDelay = jest.spyOn(CommonResources, 'delay');

describe('Success', () => {
  beforeEach(() => {
    client.reset();
    mockDelay.mockImplementation(() => Promise.resolve());
  });

  test('Create both the Shared Accounts', async () => {
    client
      .on(CreateAccountCommand, {
        Email: AuditAccount.Email,
        AccountName: AuditAccount.Name,
      })
      .resolves({
        CreateAccountStatus: {
          Id: `${AuditAccount.Name}CreateAccountRequestId`,
          AccountName: AuditAccount.Name,
          State: CreateAccountState.IN_PROGRESS,
        },
      });

    client
      .on(DescribeCreateAccountStatusCommand, { CreateAccountRequestId: `${AuditAccount.Name}CreateAccountRequestId` })
      .resolves({
        CreateAccountStatus: {
          AccountName: AuditAccount.Name,
          State: CreateAccountState.SUCCEEDED,
          AccountId: AuditAccount.Id,
        },
      });

    client
      .on(CreateAccountCommand, {
        Email: LogArchiveAccount.Email,
        AccountName: LogArchiveAccount.Name,
      })
      .resolves({
        CreateAccountStatus: {
          Id: `${LogArchiveAccount.Name}CreateAccountRequestId`,
          AccountName: LogArchiveAccount.Name,
          State: CreateAccountState.IN_PROGRESS,
        },
      });

    client
      .on(DescribeCreateAccountStatusCommand, {
        CreateAccountRequestId: `${LogArchiveAccount.Name}CreateAccountRequestId`,
      })
      .resolves({
        CreateAccountStatus: {
          AccountName: LogArchiveAccount.Name,
          State: CreateAccountState.SUCCEEDED,
          AccountId: LogArchiveAccount.Id,
        },
      });

    expect(await SharedAccount.createAccounts(ConfigPath, GlobalRegion, SolutionId)).toBeUndefined();
  });
});

describe('Failure', () => {
  beforeEach(() => {
    client.reset();
    mockDelay.mockImplementation(() => Promise.resolve());
  });

  test('Initial Account Creation failed - Internal Error', async () => {
    client
      .on(CreateAccountCommand, {
        Email: AuditAccount.Email,
        AccountName: AuditAccount.Name,
      })
      .resolves({
        CreateAccountStatus: {
          Id: `${AuditAccount.Name}CreateAccountRequestId`,
          AccountName: AuditAccount.Name,
          State: CreateAccountState.FAILED,
        },
      });

    client
      .on(CreateAccountCommand, {
        Email: LogArchiveAccount.Email,
        AccountName: LogArchiveAccount.Name,
      })
      .resolves({
        CreateAccountStatus: {
          Id: `${LogArchiveAccount.Name}CreateAccountRequestId`,
          AccountName: LogArchiveAccount.Name,
          State: CreateAccountState.FAILED,
        },
      });

    await expect(SharedAccount.createAccounts(ConfigPath, GlobalRegion, SolutionId)).rejects.toThrow(
      AccountCreationInternalFailureError([
        `${LogArchiveAccount.Name} creation is currently in FAILED state with undefined error`,
        `${AuditAccount.Name} creation is currently in FAILED state with undefined error`,
      ]),
    );
  });

  test('Account Creation failed during recheck status - Internal Error', async () => {
    client
      .on(CreateAccountCommand, {
        Email: AuditAccount.Email,
        AccountName: AuditAccount.Name,
      })
      .resolves({
        CreateAccountStatus: {
          Id: `${AuditAccount.Name}CreateAccountRequestId`,
          AccountName: AuditAccount.Name,
          State: CreateAccountState.IN_PROGRESS,
        },
      });

    client
      .on(DescribeCreateAccountStatusCommand, { CreateAccountRequestId: `${AuditAccount.Name}CreateAccountRequestId` })
      .resolves({
        CreateAccountStatus: {
          AccountName: AuditAccount.Name,
          State: CreateAccountState.FAILED,
          AccountId: AuditAccount.Id,
        },
      });

    client
      .on(CreateAccountCommand, {
        Email: LogArchiveAccount.Email,
        AccountName: LogArchiveAccount.Name,
      })
      .resolves({
        CreateAccountStatus: {
          Id: `${LogArchiveAccount.Name}CreateAccountRequestId`,
          AccountName: LogArchiveAccount.Name,
          State: CreateAccountState.IN_PROGRESS,
        },
      });

    client
      .on(DescribeCreateAccountStatusCommand, {
        CreateAccountRequestId: `${LogArchiveAccount.Name}CreateAccountRequestId`,
      })
      .resolves({
        CreateAccountStatus: {
          AccountName: LogArchiveAccount.Name,
          State: CreateAccountState.FAILED,
          AccountId: LogArchiveAccount.Id,
        },
      });

    await expect(SharedAccount.createAccounts(ConfigPath, GlobalRegion, SolutionId)).rejects.toThrow(
      AccountCreationInternalFailureError([
        `${LogArchiveAccount.Name} creation is currently in FAILED state with undefined error`,
        `${AuditAccount.Name} creation is currently in FAILED state with undefined error`,
      ]),
    );
  });
});

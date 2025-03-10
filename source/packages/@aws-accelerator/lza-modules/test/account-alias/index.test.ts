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

import { describe, test, beforeEach } from '@jest/globals';

import * as path from 'path';

import { AccountAlias } from '../../lib/account-alias/index';
import { AccountsConfig, AccountConfig } from '../../../config/lib/accounts-config';
import { IAMClient } from '@aws-sdk/client-iam';
import { AcceleratorMockClient } from '../utils/test-resources';
import { ListAccountAliasesCommand, CreateAccountAliasCommand, DeleteAccountAliasCommand } from '@aws-sdk/client-iam';
import { AssumeRoleCredentialType } from '../../common/resources';

// Mock constants
const MOCK_CONSTANTS = {
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    sessionToken: 'mock-session-token',
  } as AssumeRoleCredentialType,

  globalRegion: 'us-east-1',
  solutionId: 'AwsSolution/SO0199/',
};

describe('AccountAlias', () => {
  const iamMockClient = AcceleratorMockClient(IAMClient);
  const accountsConfig = AccountsConfig.load(path.resolve('../lza-modules/test/account-alias/config'));

  let accountAlias: AccountAlias;
  let statuses: string[] = [];
  const account = accountsConfig.getAccount('Management');

  beforeEach(() => {
    iamMockClient.reset();
    accountAlias = new AccountAlias();
    statuses = [];
  });

  test('should create new alias when none exists', async () => {
    // Mock the list aliases call to return empty
    iamMockClient.on(ListAccountAliasesCommand).resolves({
      AccountAliases: [],
    });

    // Mock the create alias call
    iamMockClient.on(CreateAccountAliasCommand).resolves({});

    await accountAlias['manageAccountAlias'](
      account.name,
      account.accountAlias!,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.globalRegion,
      statuses,
      MOCK_CONSTANTS.credentials,
    );

    // Verify the correct commands were called
    expect(iamMockClient.calls()).toHaveLength(2);

    // Verify ListAccountAliases call
    const listCall = iamMockClient.commandCalls(ListAccountAliasesCommand)[0];
    expect(listCall.args[0].input).toEqual({});

    // Verify CreateAccountAlias call
    const createCall = iamMockClient.commandCalls(CreateAccountAliasCommand)[0];
    expect(createCall.args[0].input).toEqual({
      AccountAlias: account.accountAlias,
    });

    // Verify status message
    expect(statuses).toContain(
      `Account alias "${account.accountAlias}" successfully set for account "${account.name}".`,
    );
  });

  test('should replace existing alias when different', async () => {
    // Mock list aliases to return existing alias
    iamMockClient.on(ListAccountAliasesCommand).resolves({
      AccountAliases: ['old-alias'],
    });

    // Mock delete and create calls
    iamMockClient.on(DeleteAccountAliasCommand).resolves({});
    iamMockClient.on(CreateAccountAliasCommand).resolves({});

    await accountAlias['manageAccountAlias'](
      account.name,
      account.accountAlias!,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.globalRegion,
      statuses,
      MOCK_CONSTANTS.credentials,
    );

    // Verify all commands were called
    expect(iamMockClient.calls()).toHaveLength(3);

    // Verify delete call
    const deleteCall = iamMockClient.commandCalls(DeleteAccountAliasCommand)[0];
    expect(deleteCall.args[0].input).toEqual({
      AccountAlias: 'old-alias',
    });

    // Verify create call
    const createCall = iamMockClient.commandCalls(CreateAccountAliasCommand)[0];
    expect(createCall.args[0].input).toEqual({
      AccountAlias: account.accountAlias,
    });

    // Verify status messages
    expect(statuses).toContain('Successfully deleted existing account alias "old-alias".');
    expect(statuses).toContain(
      `Account alias "${account.accountAlias}" successfully set for account "${account.name}".`,
    );
  });

  test('should skip when current alias matches desired alias', async () => {
    const testAccount: AccountConfig & { accountAlias: string } = {
      ...account,
      accountAlias: 'test-alias', // Set a specific test alias
    };

    // Mock list aliases with the known alias
    iamMockClient.on(ListAccountAliasesCommand).resolves({
      AccountAliases: [testAccount.accountAlias],
    });

    await accountAlias['manageAccountAlias'](
      testAccount.name,
      testAccount.accountAlias!,
      MOCK_CONSTANTS.solutionId,
      MOCK_CONSTANTS.globalRegion,
      statuses,
      MOCK_CONSTANTS.credentials,
    );

    // Verify only list was called
    expect(iamMockClient.calls()).toHaveLength(1);
    expect(iamMockClient.commandCalls(ListAccountAliasesCommand)).toHaveLength(1);
    expect(iamMockClient.commandCalls(CreateAccountAliasCommand)).toHaveLength(0);
    expect(iamMockClient.commandCalls(DeleteAccountAliasCommand)).toHaveLength(0);

    // Verify no status messages were added
    expect(statuses).toHaveLength(1);
  });

  test('should handle list alias errors', async () => {
    // Mock list aliases to throw error
    iamMockClient.on(ListAccountAliasesCommand).rejects(new Error('List failed'));

    await expect(
      accountAlias['manageAccountAlias'](
        account.name,
        account.accountAlias!,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.globalRegion,
        statuses,
        MOCK_CONSTANTS.credentials,
      ),
    ).rejects.toThrow(`List failed`);
  });

  test('should handle delete alias errors', async () => {
    // Mock list aliases to return existing alias
    iamMockClient.on(ListAccountAliasesCommand).resolves({
      AccountAliases: ['old-alias'],
    });

    // Mock delete to throw error
    iamMockClient.on(DeleteAccountAliasCommand).rejects(new Error('Delete failed'));

    await expect(
      accountAlias['manageAccountAlias'](
        account.name,
        account.accountAlias!,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.globalRegion,
        statuses,
        MOCK_CONSTANTS.credentials,
      ),
    ).rejects.toThrow('Delete failed');
  });

  test('should handle create alias errors', async () => {
    // Mock list aliases to return empty
    iamMockClient.on(ListAccountAliasesCommand).resolves({
      AccountAliases: [],
    });

    // Mock create to throw error
    iamMockClient.on(CreateAccountAliasCommand).rejects(new Error('Create failed'));

    await expect(
      accountAlias['manageAccountAlias'](
        account.name,
        account.accountAlias!,
        MOCK_CONSTANTS.solutionId,
        MOCK_CONSTANTS.globalRegion,
        statuses,
        MOCK_CONSTANTS.credentials,
      ),
    ).rejects.toThrow(`Create failed`);
  });
});

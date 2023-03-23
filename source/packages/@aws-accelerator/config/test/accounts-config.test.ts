/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { describe, it, expect } from '@jest/globals';
import { AccountIdConfig, AccountConfig, GovCloudAccountConfig, AccountsConfig } from '../lib/accounts-config';
import * as path from 'path';

const accountsConfigObject = {
  mandatoryAccounts: [
    {
      name: 'Management',
      description:
        'The management (primary) account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
      email: 'some-management-account@example.com',
      organizationalUnit: 'Root',
      warm: false,
    },
    {
      name: 'LogArchive',
      description:
        'The log archive account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
      email: 'some-logarchive-account@example.com',
      organizationalUnit: 'Security',
      warm: false,
    },
    {
      name: 'Audit',
      description:
        'The security audit account (also referred to as the audit account). Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
      email: 'some-audit-account@example.com',
      organizationalUnit: 'Security',
      warm: false,
    },
  ],
  workloadAccounts: [
    {
      name: 'SharedServices',
      description: 'The SharedServices account',
      email: 'shared-services@example.com',
      organizationalUnit: 'Infrastructure',
      warm: false,
    },
    {
      name: 'Network',
      description: 'The Network account',
      email: 'network@example.com',
      organizationalUnit: 'Infrastructure',
      warm: false,
    },
  ],
  accountIds: [
    {
      email: 'some-management-account@example.com',
      accountId: '111111111111',
    },
    { email: 'some-audit-account@example.com', accountId: '222222222222' },
    {
      email: 'some-logarchive-account@example.com',
      accountId: '333333333333',
    },
    {
      email: 'shared-services@example.com',
      accountId: '444444444444',
    },
    { email: 'network@example.com', accountId: '555555555555' },
  ],
};

describe('accounts-config', () => {
  const accountIdConfig = new AccountIdConfig();
  const accountConfig = new AccountConfig();
  const govCloudAccountConfig = new GovCloudAccountConfig();

  describe('AccountIdConfig', () => {
    it('is tested', () => {
      expect(accountIdConfig.email).toEqual('');
      expect(accountIdConfig.accountId).toEqual('');
    });
  });
  describe('AccountConfig', () => {
    it('is tested', () => {
      expect(accountConfig.name).toEqual('');
      expect(accountConfig.description).toEqual('');
      expect(accountConfig.email).toEqual('');
      expect(accountConfig.organizationalUnit).toEqual('');
    });
  });
  describe('GovCloudAccountConfig', () => {
    it('is tested', () => {
      expect(govCloudAccountConfig.name).toEqual('');
      expect(govCloudAccountConfig.description).toEqual('');
      expect(govCloudAccountConfig.email).toEqual('');
      expect(govCloudAccountConfig.organizationalUnit).toEqual('');
      expect(govCloudAccountConfig.enableGovCloud).toBe(undefined);
    });
  });
  describe('AccountsConfig', () => {
    const configA = new AccountsConfig({
      managementAccountEmail: 'hello@example.com',
      logArchiveAccountEmail: 'log@example.com',
      auditAccountEmail: 'audit@example.com',
    });
    const configB = new AccountsConfig(
      {
        managementAccountEmail: 'hello@example.com',
        logArchiveAccountEmail: 'log@example.com',
        auditAccountEmail: 'audit@example.com',
      },
      {
        mandatoryAccounts: [
          {
            name: 'hello',
            email: 'world@example.com',
            description: undefined,
            organizationalUnit: undefined,
            warm: undefined,
          },
        ],
        workloadAccounts: [govCloudAccountConfig],
        accountIds: [],
      },
    );
    const configC = new AccountsConfig(
      {
        managementAccountEmail: 'some-management-account@example.com',
        logArchiveAccountEmail: 'some-logarchive-account@example.com',
        auditAccountEmail: 'some-audit-account@example.com',
      },
      accountsConfigObject,
    );

    it('is a govcloud account', () => {
      expect(configA.isGovCloudAccount(accountConfig)).toBe(false);
      expect(configA.isGovCloudAccount(govCloudAccountConfig)).toBe(true);
    });
    it('has any govcloud accounts', () => {
      expect(configA.anyGovCloudAccounts()).toBe(false);
      expect(configB.anyGovCloudAccounts()).toBe(true);
    });
    it('has govcloud enabled', () => {
      expect(configB.isGovCloudEnabled(accountConfig)).toBe(false);
    });
    it('using config dir: validates config and gets results', () => {
      expect(configC.getManagementAccountId()).toBe('111111111111');
      expect(configC.getManagementAccount()).toStrictEqual({
        description:
          'The management (primary) account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
        email: 'some-management-account@example.com',
        name: 'Management',
        organizationalUnit: 'Root',
        warm: false,
      });

      expect(configC.getLogArchiveAccountId()).toBe('333333333333');
      expect(configC.getLogArchiveAccount()).toStrictEqual({
        name: 'LogArchive',
        description:
          'The log archive account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
        email: 'some-logarchive-account@example.com',
        organizationalUnit: 'Security',
        warm: false,
      });

      expect(configC.getAuditAccount()).toStrictEqual({
        name: 'Audit',
        description:
          'The security audit account (also referred to as the audit account). Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
        email: 'some-audit-account@example.com',
        organizationalUnit: 'Security',
        warm: false,
      });
      expect(configC.getAuditAccountId()).toBe('222222222222');
    });

    it('contains account name', () => {
      expect(configC.containsAccount('Audit')).toBe(true);
      expect(configC.containsAccount('notpresent')).toBe(false);
    });

    it('get account name', () => {
      expect(configC.getAccount('Audit')).toEqual({
        name: 'Audit',
        description:
          'The security audit account (also referred to as the audit account). Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
        email: 'some-audit-account@example.com',
        organizationalUnit: 'Security',
        warm: false,
      });
      expect(() => {
        configC.getAccount('notpresent');
      }).toThrow('configuration validation failed.');
    });

    it('get account ID', () => {
      expect(() => {
        configC.getAccountId('missing');
      }).toThrow('configuration validation failed.');
    });

    it('load config successfully', () => {
      const loadedConfig = AccountsConfig.load(path.resolve('../accelerator/test/configs/all-enabled'));
      expect(loadedConfig && typeof loadedConfig === 'object').toBe(true);
    });
  });
});

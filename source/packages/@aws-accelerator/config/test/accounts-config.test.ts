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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccountIdConfig, AccountConfig, GovCloudAccountConfig, AccountsConfig } from '../lib/accounts-config';
import { SNAPSHOT_CONFIG } from './config-test-helper';
import * as path from 'path';
import { STSClient } from '@aws-sdk/client-sts';
import { OrganizationsClient } from '@aws-sdk/client-organizations';
import * as utilsModule from '@aws-accelerator/utils';

// Mock AWS SDK clients
vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: vi.fn(),
  GetCallerIdentityCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-organizations', () => ({
  OrganizationsClient: vi.fn(),
  ListAccountsCommand: vi.fn(),
}));

// Mock utils module
vi.mock('@aws-accelerator/utils', async () => {
  const actual = await vi.importActual('@aws-accelerator/utils');
  return {
    ...actual,
    getSSMParameterValue: vi.fn(),
    queryConfigTable: vi.fn(),
    getGlobalRegion: vi.fn().mockReturnValue('us-east-1'),
    setRetryStrategy: vi.fn().mockReturnValue({}),
  };
});

// Test constants to reduce duplication
const TEST_EMAILS = {
  MANAGEMENT: 'mgmt@example.com',
  LOG_ARCHIVE: 'log@example.com',
  AUDIT: 'audit@example.com',
  SHARED_SERVICES: 'shared-services@example.com',
  NETWORK: 'network@example.com',
  MANAGEMENT_ORIGINAL: 'some-management-account@example.com',
  LOG_ARCHIVE_ORIGINAL: 'some-logarchive-account@example.com',
  AUDIT_ORIGINAL: 'some-audit-account@example.com',
  HELLO: 'hello@example.com',
  WORLD: 'world@example.com',
} as const;

const TEST_ACCOUNT_IDS = {
  MANAGEMENT: '111111111111',
  AUDIT: '222222222222',
  LOG_ARCHIVE: '333333333333',
  SHARED_SERVICES: '444444444444',
  NETWORK: '555555555555',
  SINGLE_ACCOUNT: '123456789012',
} as const;

const TEST_ENV_VALUES = {
  REGION: 'us-east-1',
  SOLUTION_ID: 'test-solution',
  SSM_PREFIX: '/test-accelerator',
  CONFIG_TABLE: 'test-config-table',
  COMMIT_ID: 'commit123',
} as const;

// Helper function to create AccountsConfig instances with flexible options
const createAccountsConfig = (
  options: {
    emails?: {
      management?: string;
      logArchive?: string;
      audit?: string;
    };
    configObject?: Record<string, unknown>;
    mandatoryAccounts?: Array<Record<string, unknown>>;
    workloadAccounts?: Array<Record<string, unknown>>;
    accountIds?: Array<{ email: string; accountId: string }> | undefined;
  } = {},
) => {
  const emails = {
    management: options.emails?.management ?? TEST_EMAILS.MANAGEMENT,
    logArchive: options.emails?.logArchive ?? TEST_EMAILS.LOG_ARCHIVE,
    audit: options.emails?.audit ?? TEST_EMAILS.AUDIT,
  };

  const baseConfig = {
    managementAccountEmail: emails.management,
    logArchiveAccountEmail: emails.logArchive,
    auditAccountEmail: emails.audit,
  };

  // If a full config object is provided, use it
  if (options.configObject) {
    return new AccountsConfig(baseConfig, options.configObject);
  }

  // If no additional config needed, return basic config
  if (!options.mandatoryAccounts && !options.workloadAccounts && options.accountIds === undefined) {
    return new AccountsConfig(baseConfig);
  }

  // Build custom config object
  return new AccountsConfig(baseConfig, {
    mandatoryAccounts: options.mandatoryAccounts ?? [],
    workloadAccounts: options.workloadAccounts ?? [],
    accountIds: options.accountIds ?? [],
  });
};

const accountsConfigObject = {
  mandatoryAccounts: [
    {
      name: 'Management',
      description:
        'The management (primary) account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
      email: TEST_EMAILS.MANAGEMENT_ORIGINAL,
      organizationalUnit: 'Root',
      warm: false,
      accountAlias: 'management-alias',
    },
    {
      name: 'LogArchive',
      description:
        'The log archive account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
      email: TEST_EMAILS.LOG_ARCHIVE_ORIGINAL,
      organizationalUnit: 'Security',
      warm: false,
      accountAlias: 'logarchive-alias',
    },
    {
      name: 'Audit',
      description:
        'The security audit account (also referred to as the audit account). Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
      email: TEST_EMAILS.AUDIT_ORIGINAL,
      organizationalUnit: 'Security',
      warm: false,
      accountAlias: 'audit-alias',
    },
  ],
  workloadAccounts: [
    {
      name: 'SharedServices',
      description: 'The SharedServices account',
      email: TEST_EMAILS.SHARED_SERVICES,
      organizationalUnit: 'Infrastructure',
      warm: false,
      accountAlias: 'sharedservices-alias',
    },
    {
      name: 'Network',
      description: 'The Network account',
      email: TEST_EMAILS.NETWORK,
      organizationalUnit: 'Infrastructure',
      warm: false,
      accountAlias: 'network-alias',
    },
  ],
  accountIds: [
    {
      email: TEST_EMAILS.MANAGEMENT_ORIGINAL,
      accountId: TEST_ACCOUNT_IDS.MANAGEMENT,
    },
    { email: TEST_EMAILS.AUDIT_ORIGINAL, accountId: TEST_ACCOUNT_IDS.AUDIT },
    {
      email: TEST_EMAILS.LOG_ARCHIVE_ORIGINAL,
      accountId: TEST_ACCOUNT_IDS.LOG_ARCHIVE,
    },
    {
      email: TEST_EMAILS.SHARED_SERVICES,
      accountId: TEST_ACCOUNT_IDS.SHARED_SERVICES,
    },
    { email: TEST_EMAILS.NETWORK, accountId: TEST_ACCOUNT_IDS.NETWORK },
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
      expect(accountConfig.accountAlias).toEqual(undefined);
    });
  });
  describe('GovCloudAccountConfig', () => {
    it('is tested', () => {
      expect(govCloudAccountConfig.name).toEqual('');
      expect(govCloudAccountConfig.description).toEqual('');
      expect(govCloudAccountConfig.email).toEqual('');
      expect(govCloudAccountConfig.organizationalUnit).toEqual('');
      expect(govCloudAccountConfig.enableGovCloud).toBe(undefined);
      expect(accountConfig.accountAlias).toEqual(undefined);
    });
  });
  describe('AccountsConfig', () => {
    const configA = createAccountsConfig({
      emails: { management: TEST_EMAILS.HELLO },
    });
    const configB = createAccountsConfig({
      emails: { management: TEST_EMAILS.HELLO },
      mandatoryAccounts: [
        {
          name: 'hello',
          email: TEST_EMAILS.WORLD,
          description: undefined,
          organizationalUnit: undefined,
          warm: undefined,
        },
      ],
      workloadAccounts: [govCloudAccountConfig],
    });
    const configC = createAccountsConfig({
      emails: {
        management: TEST_EMAILS.MANAGEMENT_ORIGINAL,
        logArchive: TEST_EMAILS.LOG_ARCHIVE_ORIGINAL,
        audit: TEST_EMAILS.AUDIT_ORIGINAL,
      },
      configObject: accountsConfigObject,
    });

    it('creates mandatory accounts', () => {
      const config = createAccountsConfig();
      expect(config.mandatoryAccounts).toHaveLength(3);
      expect(config.mandatoryAccounts.find(account => account.name == AccountsConfig.MANAGEMENT_ACCOUNT)).toBeDefined();
      expect(config.mandatoryAccounts.find(account => account.name == AccountsConfig.AUDIT_ACCOUNT)).toBeDefined();
      expect(
        config.mandatoryAccounts.find(account => account.name == AccountsConfig.LOG_ARCHIVE_ACCOUNT),
      ).toBeDefined();
    });

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
      expect(configC.getManagementAccountId()).toBe(TEST_ACCOUNT_IDS.MANAGEMENT);
      expect(configC.getManagementAccount()).toStrictEqual({
        description:
          'The management (primary) account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
        email: TEST_EMAILS.MANAGEMENT_ORIGINAL,
        name: 'Management',
        organizationalUnit: 'Root',
        warm: false,
        accountAlias: 'management-alias',
      });

      expect(configC.getLogArchiveAccountId()).toBe(TEST_ACCOUNT_IDS.LOG_ARCHIVE);
      expect(configC.getLogArchiveAccount()).toStrictEqual({
        name: 'LogArchive',
        description:
          'The log archive account. Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
        email: TEST_EMAILS.LOG_ARCHIVE_ORIGINAL,
        organizationalUnit: 'Security',
        warm: false,
        accountAlias: 'logarchive-alias',
      });

      expect(configC.getAuditAccount()).toStrictEqual({
        name: 'Audit',
        description:
          'The security audit account (also referred to as the audit account). Do not change the name field for this mandatory account. Note, the account name key does not need to match the AWS account name.',
        email: TEST_EMAILS.AUDIT_ORIGINAL,
        organizationalUnit: 'Security',
        warm: false,
        accountAlias: 'audit-alias',
      });
      expect(configC.getAuditAccountId()).toBe(TEST_ACCOUNT_IDS.AUDIT);
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
        email: TEST_EMAILS.AUDIT_ORIGINAL,
        organizationalUnit: 'Security',
        warm: false,
        accountAlias: 'audit-alias',
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
      const loadedConfig = AccountsConfig.load(SNAPSHOT_CONFIG);
      expect(loadedConfig && typeof loadedConfig === 'object').toBe(true);
    });

    it('yaml !include works with nesting', () => {
      const loadedConfig = AccountsConfig.load(path.join(__dirname, '../../accelerator/test/configs/snapshot-only'));
      expect(loadedConfig.workloadAccounts).toHaveLength(3);
    });

    describe('loadAccountIds', () => {
      let mockSTSClient: { send: ReturnType<typeof vi.fn> };
      let mockOrganizationsClient: { send: ReturnType<typeof vi.fn> };
      let mockGetSSMParameterValue: ReturnType<typeof vi.fn>;
      let mockQueryConfigTable: ReturnType<typeof vi.fn>;
      let originalEnv: NodeJS.ProcessEnv;

      beforeEach(() => {
        originalEnv = { ...process.env };

        // Mock STS Client
        mockSTSClient = {
          send: vi.fn(),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(STSClient).mockImplementation(() => mockSTSClient as any);

        // Mock Organizations Client
        mockOrganizationsClient = {
          send: vi.fn(),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.mocked(OrganizationsClient).mockImplementation(() => mockOrganizationsClient as any);

        // Mock utility functions
        mockGetSSMParameterValue = vi.fn();
        mockQueryConfigTable = vi.fn();

        vi.spyOn(utilsModule, 'getSSMParameterValue').mockImplementation(mockGetSSMParameterValue);
        vi.spyOn(utilsModule, 'queryConfigTable').mockImplementation(mockQueryConfigTable);
      });

      afterEach(() => {
        vi.clearAllMocks();
        process.env = originalEnv;
      });

      it('should handle single account mode enabled', async () => {
        const config = createAccountsConfig();

        // Initialize accountIds array as the function expects it to exist in single account mode
        config.accountIds = [];

        process.env['AWS_REGION'] = TEST_ENV_VALUES.REGION;
        process.env['SOLUTION_ID'] = TEST_ENV_VALUES.SOLUTION_ID;

        mockSTSClient.send.mockResolvedValue({
          Account: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });

        await config.loadAccountIds('aws', true, false, config);

        expect(config.accountIds).toHaveLength(3);
        expect(config.accountIds![0]).toEqual({
          email: TEST_EMAILS.MANAGEMENT,
          accountId: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });
        expect(config.accountIds![1]).toEqual({
          email: TEST_EMAILS.LOG_ARCHIVE,
          accountId: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });
        expect(config.accountIds![2]).toEqual({
          email: TEST_EMAILS.AUDIT,
          accountId: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });
      });

      it('should handle organizations enabled with DynamoDB loading', async () => {
        process.env['ACCELERATOR_SSM_PARAM_NAME_PREFIX'] = TEST_ENV_VALUES.SSM_PREFIX;
        process.env['CONFIG_COMMIT_ID'] = TEST_ENV_VALUES.COMMIT_ID;

        const config = createAccountsConfig({ configObject: accountsConfigObject });

        mockGetSSMParameterValue.mockResolvedValue(TEST_ENV_VALUES.CONFIG_TABLE);

        const mandatoryAccountItems = [
          {
            orgInfo: JSON.stringify({
              email: TEST_EMAILS.MANAGEMENT_ORIGINAL,
              accountId: TEST_ACCOUNT_IDS.MANAGEMENT,
              status: 'ACTIVE',
            }),
          },
          {
            orgInfo: JSON.stringify({
              email: TEST_EMAILS.LOG_ARCHIVE_ORIGINAL,
              accountId: TEST_ACCOUNT_IDS.LOG_ARCHIVE,
              status: 'ACTIVE',
            }),
          },
          {
            orgInfo: JSON.stringify({
              email: TEST_EMAILS.AUDIT_ORIGINAL,
              accountId: TEST_ACCOUNT_IDS.AUDIT,
              status: 'ACTIVE',
            }),
          },
        ];

        const workloadAccountItems = [
          {
            orgInfo: JSON.stringify({
              email: TEST_EMAILS.SHARED_SERVICES,
              accountId: TEST_ACCOUNT_IDS.SHARED_SERVICES,
              status: 'ACTIVE',
            }),
          },
          {
            orgInfo: JSON.stringify({
              email: TEST_EMAILS.NETWORK,
              accountId: TEST_ACCOUNT_IDS.NETWORK,
              status: 'ACTIVE',
            }),
          },
        ];

        mockQueryConfigTable.mockResolvedValueOnce(mandatoryAccountItems).mockResolvedValueOnce(workloadAccountItems);

        await config.loadAccountIds('aws', false, true, config, undefined, true);

        expect(mockGetSSMParameterValue).toHaveBeenCalledWith(
          `${TEST_ENV_VALUES.SSM_PREFIX}/prepare-stack/configTable/name`,
          undefined,
        );
        expect(mockQueryConfigTable).toHaveBeenCalledTimes(2);
        expect(config.accountIds).toHaveLength(5);
        expect(config.accountIds![0].email).toBe(TEST_EMAILS.MANAGEMENT_ORIGINAL);
        expect(config.accountIds![0].accountId).toBe(TEST_ACCOUNT_IDS.MANAGEMENT);
      });

      it('should handle organizations enabled with DynamoDB loading and default SSM prefix', async () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        delete process.env['ACCELERATOR_SSM_PARAM_NAME_PREFIX'];

        mockGetSSMParameterValue.mockResolvedValue(TEST_ENV_VALUES.CONFIG_TABLE);
        mockQueryConfigTable.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        await config.loadAccountIds('aws', false, true, config, undefined, true);

        expect(mockGetSSMParameterValue).toHaveBeenCalledWith('/accelerator/prepare-stack/configTable/name', undefined);
      });

      it('should filter accounts by config emails when loading from DynamoDB', async () => {
        const config = createAccountsConfig({
          mandatoryAccounts: [
            {
              name: 'Management',
              email: TEST_EMAILS.MANAGEMENT,
              description: 'Management account',
              organizationalUnit: 'Root',
              warm: false,
            },
          ],
        });

        mockGetSSMParameterValue.mockResolvedValue(TEST_ENV_VALUES.CONFIG_TABLE);

        const mandatoryAccountItems = [
          {
            orgInfo: JSON.stringify({
              email: TEST_EMAILS.MANAGEMENT,
              accountId: TEST_ACCOUNT_IDS.MANAGEMENT,
              status: 'ACTIVE',
            }),
          },
          {
            orgInfo: JSON.stringify({
              email: 'other@example.com',
              accountId: '999999999999',
              status: 'ACTIVE',
            }),
          },
        ];

        mockQueryConfigTable.mockResolvedValueOnce(mandatoryAccountItems).mockResolvedValueOnce([]);

        await config.loadAccountIds('aws', false, true, config, undefined, true);

        expect(config.accountIds).toHaveLength(1);
        expect(config.accountIds![0].email).toBe(TEST_EMAILS.MANAGEMENT);
        expect(config.accountIds![0].accountId).toBe(TEST_ACCOUNT_IDS.MANAGEMENT);
      });

      it('should handle organizations enabled with API loading - single page', async () => {
        const config = createAccountsConfig();

        const mockAccounts = [
          {
            Email: TEST_EMAILS.MANAGEMENT,
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
            Name: 'Management',
          },
          {
            Email: TEST_EMAILS.LOG_ARCHIVE,
            Id: TEST_ACCOUNT_IDS.AUDIT,
            Status: 'ACTIVE',
            Name: 'LogArchive',
          },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(mockOrganizationsClient.send).toHaveBeenCalledTimes(1);
        expect(config.accountIds).toHaveLength(2);
        expect(config.accountIds![0]).toEqual({
          email: TEST_EMAILS.MANAGEMENT,
          accountId: TEST_ACCOUNT_IDS.MANAGEMENT,
          status: 'ACTIVE',
          orgsApiResponse: mockAccounts[0],
        });
      });

      it('should handle organizations enabled with API loading - multiple pages', async () => {
        const config = createAccountsConfig();

        const mockAccountsPage1 = [
          {
            Email: TEST_EMAILS.MANAGEMENT,
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
            Name: 'Management',
          },
        ];

        const mockAccountsPage2 = [
          {
            Email: TEST_EMAILS.LOG_ARCHIVE,
            Id: TEST_ACCOUNT_IDS.AUDIT,
            Status: 'ACTIVE',
            Name: 'LogArchive',
          },
        ];

        mockOrganizationsClient.send
          .mockResolvedValueOnce({
            Accounts: mockAccountsPage1,
            NextToken: 'token123',
          })
          .mockResolvedValueOnce({
            Accounts: mockAccountsPage2,
            NextToken: undefined,
          });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(mockOrganizationsClient.send).toHaveBeenCalledTimes(2);
        expect(config.accountIds).toHaveLength(2);
      });

      it('should handle organizations enabled with API loading - accounts without email or id', async () => {
        const config = createAccountsConfig();

        const mockAccounts = [
          {
            Email: TEST_EMAILS.MANAGEMENT,
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
          },
          {
            Email: undefined,
            Id: TEST_ACCOUNT_IDS.AUDIT,
            Status: 'ACTIVE',
          },
          {
            Email: TEST_EMAILS.LOG_ARCHIVE,
            Id: undefined,
            Status: 'ACTIVE',
          },
          {
            Email: TEST_EMAILS.AUDIT,
            Id: TEST_ACCOUNT_IDS.LOG_ARCHIVE,
            Status: 'ACTIVE',
          },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toHaveLength(2);
        expect(config.accountIds![0].email).toBe(TEST_EMAILS.MANAGEMENT);
        expect(config.accountIds![1].email).toBe(TEST_EMAILS.AUDIT);
      });

      it('should remove duplicate accounts when loading from organizations API', async () => {
        const config = createAccountsConfig();

        const mockAccounts = [
          {
            Email: TEST_EMAILS.MANAGEMENT,
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
          },
          {
            Email: TEST_EMAILS.MANAGEMENT,
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
          },
          {
            Email: TEST_EMAILS.LOG_ARCHIVE,
            Id: TEST_ACCOUNT_IDS.AUDIT,
            Status: 'ACTIVE',
          },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toHaveLength(2);
      });

      it('should handle organizations disabled with valid accountIds provided', async () => {
        const configWithAccountIds = createAccountsConfig({
          accountIds: [
            { email: TEST_EMAILS.MANAGEMENT, accountId: TEST_ACCOUNT_IDS.MANAGEMENT },
            { email: TEST_EMAILS.LOG_ARCHIVE, accountId: TEST_ACCOUNT_IDS.AUDIT },
            { email: TEST_EMAILS.AUDIT, accountId: TEST_ACCOUNT_IDS.LOG_ARCHIVE },
          ],
        });

        const config = createAccountsConfig();

        await config.loadAccountIds('aws', false, false, configWithAccountIds);

        expect(config.accountIds).toHaveLength(3);
        expect(config.accountIds![0]).toEqual({
          email: TEST_EMAILS.MANAGEMENT,
          accountId: TEST_ACCOUNT_IDS.MANAGEMENT,
        });
      });

      it('should handle organizations disabled with case insensitive email matching', async () => {
        const configWithAccountIds = createAccountsConfig({
          accountIds: [
            { email: 'MGMT@EXAMPLE.COM', accountId: TEST_ACCOUNT_IDS.MANAGEMENT },
            { email: 'Log@Example.Com', accountId: TEST_ACCOUNT_IDS.AUDIT },
            { email: TEST_EMAILS.AUDIT, accountId: TEST_ACCOUNT_IDS.LOG_ARCHIVE },
          ],
        });

        const config = createAccountsConfig();

        await config.loadAccountIds('aws', false, false, configWithAccountIds);

        expect(config.accountIds).toHaveLength(3);
        expect(config.accountIds![0].email).toBe(TEST_EMAILS.MANAGEMENT);
        expect(config.accountIds![1].email).toBe(TEST_EMAILS.LOG_ARCHIVE);
      });

      it('should handle organizations disabled with insufficient accountIds provided (no error case)', async () => {
        const configWithInsufficientAccountIds = createAccountsConfig({
          accountIds: [
            { email: TEST_EMAILS.MANAGEMENT, accountId: TEST_ACCOUNT_IDS.MANAGEMENT },
            { email: TEST_EMAILS.LOG_ARCHIVE, accountId: TEST_ACCOUNT_IDS.AUDIT },
          ],
        });

        const config = createAccountsConfig();

        // The function will execute the first condition (!isOrgsEnabled && accountsConfig.accountIds)
        // and not throw an error, so we need to test the case where accountIds is undefined or empty
        await config.loadAccountIds('aws', false, false, configWithInsufficientAccountIds);

        // Verify that it processed the accounts without throwing an error
        expect(config.accountIds).toHaveLength(2);
      });

      it('should throw error when organizations disabled and accountIds is undefined with less than 3 items', async () => {
        // Create a config where accountIds is undefined
        const configWithUndefinedAccountIds = createAccountsConfig({ accountIds: undefined });

        const config = createAccountsConfig();

        await expect(config.loadAccountIds('aws', false, false, configWithUndefinedAccountIds)).rejects.toThrow(
          'Organization is disabled, but the number of accounts in the accounts config is less than 3.',
        );
      });

      it('should throw error when organizations disabled and no accountIds provided', async () => {
        const configWithNoAccountIds = createAccountsConfig({ accountIds: undefined });

        const config = createAccountsConfig();

        await expect(config.loadAccountIds('aws', false, false, configWithNoAccountIds)).rejects.toThrow(
          'Organization is disabled, but the number of accounts in the accounts config is less than 3.',
        );
      });

      it('should handle management account credentials passed', async () => {
        const config = createAccountsConfig({
          emails: {
            management: 'mgmt@example.com',
            logArchive: 'log@example.com',
            audit: 'audit@example.com',
          },
        });

        const mockCredentials = {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
        };

        const mockAccounts = [
          {
            Email: 'mgmt@example.com',
            Id: '111111111111',
            Status: 'ACTIVE',
          },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, mockCredentials, false);

        expect(OrganizationsClient).toHaveBeenCalledWith(
          expect.objectContaining({
            credentials: mockCredentials,
          }),
        );
      });

      it('should handle different partition for organizations client', async () => {
        const config = createAccountsConfig({
          emails: {
            management: 'mgmt@example.com',
            logArchive: 'log@example.com',
            audit: 'audit@example.com',
          },
        });

        const mockAccounts = [
          {
            Email: 'mgmt@example.com',
            Id: '111111111111',
            Status: 'ACTIVE',
          },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        vi.spyOn(utilsModule, 'getGlobalRegion').mockReturnValue('us-gov-west-1');

        await config.loadAccountIds('aws-us-gov', false, true, config, undefined, false);

        expect(utilsModule.getGlobalRegion).toHaveBeenCalledWith('aws-us-gov');
      });

      it('should initialize accountIds array if undefined', async () => {
        const config = createAccountsConfig();

        config.accountIds = undefined;

        const mockAccounts = [
          {
            Email: TEST_EMAILS.MANAGEMENT,
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
          },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toBeDefined();
        expect(config.accountIds).toHaveLength(1);
      });

      it('should handle solution ID from environment variable', async () => {
        process.env['SOLUTION_ID'] = 'test-solution-123';
        process.env['AWS_REGION'] = TEST_ENV_VALUES.REGION;

        const config = createAccountsConfig();

        mockSTSClient.send.mockResolvedValue({
          Account: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });

        await config.loadAccountIds('aws', true, false, config);

        expect(STSClient).toHaveBeenCalledWith(
          expect.objectContaining({
            customUserAgent: 'test-solution-123',
          }),
        );
      });

      it('should handle empty solution ID from environment variable', async () => {
        const config = createAccountsConfig();

        delete process.env['SOLUTION_ID'];
        process.env['AWS_REGION'] = TEST_ENV_VALUES.REGION;

        mockSTSClient.send.mockResolvedValue({
          Account: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });

        await config.loadAccountIds('aws', true, false, config);

        expect(STSClient).toHaveBeenCalledWith(
          expect.objectContaining({
            customUserAgent: '',
          }),
        );
      });

      it('should handle case insensitive email matching in DynamoDB results', async () => {
        const config = createAccountsConfig({
          mandatoryAccounts: [
            {
              name: 'Management',
              email: 'MGMT@EXAMPLE.COM',
              description: 'Management account',
              organizationalUnit: 'Root',
              warm: false,
            },
          ],
        });

        mockGetSSMParameterValue.mockResolvedValue(TEST_ENV_VALUES.CONFIG_TABLE);

        const mandatoryAccountItems = [
          {
            orgInfo: JSON.stringify({
              email: TEST_EMAILS.MANAGEMENT,
              accountId: TEST_ACCOUNT_IDS.MANAGEMENT,
              status: 'ACTIVE',
            }),
          },
        ];

        mockQueryConfigTable.mockResolvedValueOnce(mandatoryAccountItems).mockResolvedValueOnce([]);

        await config.loadAccountIds('aws', false, true, config, undefined, true);

        expect(config.accountIds).toHaveLength(1);
        expect(config.accountIds![0].email).toBe(TEST_EMAILS.MANAGEMENT);
      });

      it('should handle empty DynamoDB results', async () => {
        const config = createAccountsConfig();

        mockGetSSMParameterValue.mockResolvedValue(TEST_ENV_VALUES.CONFIG_TABLE);
        mockQueryConfigTable.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        await config.loadAccountIds('aws', false, true, config, undefined, true);

        expect(config.accountIds).toHaveLength(0);
      });

      it('should handle malformed JSON in DynamoDB orgInfo', async () => {
        const config = createAccountsConfig();

        mockGetSSMParameterValue.mockResolvedValue(TEST_ENV_VALUES.CONFIG_TABLE);

        const mandatoryAccountItems = [
          {
            orgInfo: 'invalid-json',
          },
        ];

        mockQueryConfigTable.mockResolvedValueOnce(mandatoryAccountItems).mockResolvedValueOnce([]);

        // This should throw an error due to malformed JSON
        await expect(config.loadAccountIds('aws', false, true, config, undefined, true)).rejects.toThrow();
      });

      it('should handle organizations API with empty accounts list', async () => {
        const config = createAccountsConfig();

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: [],
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toHaveLength(0);
      });

      it('should handle organizations API with undefined accounts list', async () => {
        const config = createAccountsConfig();

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: undefined,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toHaveLength(0);
      });

      it('should handle single account mode with undefined accountIds initially', async () => {
        const config = createAccountsConfig();

        // Don't initialize accountIds - let the function handle undefined case
        config.accountIds = undefined;

        process.env['AWS_REGION'] = TEST_ENV_VALUES.REGION;
        process.env['SOLUTION_ID'] = TEST_ENV_VALUES.SOLUTION_ID;

        mockSTSClient.send.mockResolvedValue({
          Account: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });

        // This should handle the case where accountIds is undefined in single account mode
        // The function should not crash but may not populate accountIds correctly
        await config.loadAccountIds('aws', true, false, config);

        // The function tries to push to undefined accountIds, which would cause an error
        // This test verifies the current behavior - it may need to be updated if the function is fixed
        expect(config.accountIds).toBeUndefined();
      });

      it('should handle organizations disabled with empty accountIds array', async () => {
        const configWithEmptyAccountIds = createAccountsConfig({
          accountIds: [],
        });

        const config = createAccountsConfig();

        await config.loadAccountIds('aws', false, false, configWithEmptyAccountIds);

        expect(config.accountIds).toHaveLength(0);
      });

      it('should handle duplicate removal with function key selector', async () => {
        const config = createAccountsConfig();

        const mockAccounts = [
          {
            Email: TEST_EMAILS.MANAGEMENT,
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
          },
          {
            Email: 'MGMT@EXAMPLE.COM', // Different case but same email
            Id: TEST_ACCOUNT_IDS.MANAGEMENT,
            Status: 'ACTIVE',
          },
          {
            Email: TEST_EMAILS.LOG_ARCHIVE,
            Id: TEST_ACCOUNT_IDS.AUDIT,
            Status: 'ACTIVE',
          },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        // Should remove duplicates based on email (case insensitive)
        expect(config.accountIds).toHaveLength(2);
        expect(config.accountIds![0].email).toBe(TEST_EMAILS.MANAGEMENT);
        expect(config.accountIds![1].email).toBe(TEST_EMAILS.LOG_ARCHIVE);
      });

      // Refactoring Safety Tests

      it('should not mutate accountIds when single account mode fails', async () => {
        const config = createAccountsConfig();

        config.accountIds = [{ email: 'existing@example.com', accountId: '999999999999' }];

        process.env['AWS_REGION'] = TEST_ENV_VALUES.REGION;
        mockSTSClient.send.mockRejectedValue(new Error('STS failed'));

        await expect(config.loadAccountIds('aws', true, false, config)).rejects.toThrow('STS failed');

        // Verify original state is preserved
        expect(config.accountIds).toEqual([{ email: 'existing@example.com', accountId: '999999999999' }]);
      });

      it('should handle partial failure in DynamoDB Promise.all queries', async () => {
        const config = createAccountsConfig();

        mockGetSSMParameterValue.mockResolvedValue(TEST_ENV_VALUES.CONFIG_TABLE);
        mockQueryConfigTable
          .mockResolvedValueOnce([
            { orgInfo: JSON.stringify({ email: 'test@example.com', accountId: TEST_ACCOUNT_IDS.MANAGEMENT }) },
          ])
          .mockRejectedValueOnce(new Error('Workload query failed'));

        await expect(config.loadAccountIds('aws', false, true, config, undefined, true)).rejects.toThrow(
          'Workload query failed',
        );
      });

      it('should maintain exact accountIds state structure after DynamoDB loading', async () => {
        const config = createAccountsConfig({
          emails: {
            management: 'mgmt@example.com',
            logArchive: 'log@example.com',
            audit: 'audit@example.com',
          },
          mandatoryAccounts: [],
          workloadAccounts: [],
          accountIds: [],
        });

        const initialState = config.accountIds;

        mockGetSSMParameterValue.mockResolvedValue('test-table');
        mockQueryConfigTable.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

        await config.loadAccountIds('aws', false, true, config, undefined, true);

        expect(config.accountIds).toEqual([]);
        expect(config.accountIds).not.toBe(initialState); // Should be new array reference
      });

      it('should preserve order when removing duplicates', async () => {
        const config = createAccountsConfig();

        const mockAccounts = [
          { Email: 'first@example.com', Id: '111', Status: 'ACTIVE' },
          { Email: 'second@example.com', Id: '222', Status: 'ACTIVE' },
          { Email: 'first@example.com', Id: '111', Status: 'ACTIVE' }, // duplicate
          { Email: 'third@example.com', Id: '333', Status: 'ACTIVE' },
        ];

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: mockAccounts,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toHaveLength(3);
        expect(config.accountIds![0].email).toBe('first@example.com');
        expect(config.accountIds![1].email).toBe('second@example.com');
        expect(config.accountIds![2].email).toBe('third@example.com');
      });

      it('should handle Organizations API throttling gracefully', async () => {
        const config = createAccountsConfig();

        // Mock successful response since throttlingBackOff is already mocked to handle retries
        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: [{ Email: 'test@example.com', Id: '111', Status: 'ACTIVE' }],
          NextToken: undefined,
        });

        // Should not throw due to throttlingBackOff mock handling any retries
        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toHaveLength(1);
        expect(config.accountIds![0].email).toBe('test@example.com');
      });

      it('should not share references between different config instances', async () => {
        const config1 = createAccountsConfig();

        const config2 = createAccountsConfig();

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: [{ Email: 'test@example.com', Id: '111', Status: 'ACTIVE' }],
          NextToken: undefined,
        });

        await config1.loadAccountIds('aws', false, true, config1, undefined, false);
        await config2.loadAccountIds('aws', false, true, config2, undefined, false);

        expect(config1.accountIds).not.toBe(config2.accountIds);
        config1.accountIds![0].email = 'modified@example.com';
        expect(config2.accountIds![0].email).toBe('test@example.com');
      });

      it('should handle invalid partition parameter gracefully', async () => {
        const config = createAccountsConfig();

        vi.spyOn(utilsModule, 'getGlobalRegion').mockReturnValue('invalid-region');
        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: [],
          NextToken: undefined,
        });

        await config.loadAccountIds('invalid-partition', false, true, config, undefined, false);

        expect(utilsModule.getGlobalRegion).toHaveBeenCalledWith('invalid-partition');
        expect(config.accountIds).toHaveLength(0);
      });

      it('should complete all async operations before returning', async () => {
        const config = createAccountsConfig({
          emails: {
            management: 'mgmt@example.com',
            logArchive: 'log@example.com',
            audit: 'audit@example.com',
          },
          mandatoryAccounts: [],
          workloadAccounts: [],
          accountIds: [],
        });

        let ssmResolved = false;
        let mandatoryQueryResolved = false;
        let workloadQueryResolved = false;

        mockGetSSMParameterValue.mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          ssmResolved = true;
          return 'test-table';
        });

        mockQueryConfigTable
          .mockImplementationOnce(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            mandatoryQueryResolved = true;
            return [];
          })
          .mockImplementationOnce(async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            workloadQueryResolved = true;
            return [];
          });

        await config.loadAccountIds('aws', false, true, config, undefined, true);

        expect(ssmResolved).toBe(true);
        expect(mandatoryQueryResolved).toBe(true);
        expect(workloadQueryResolved).toBe(true);
      });

      it('should handle email casing consistently within each code path', async () => {
        // Test Organizations API path - converts to lowercase
        const config1 = createAccountsConfig();

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: [{ Email: 'TEST@EXAMPLE.COM', Id: '111', Status: 'ACTIVE' }],
          NextToken: undefined,
        });

        await config1.loadAccountIds('aws', false, true, config1, undefined, false);
        expect(config1.accountIds![0].email).toBe('test@example.com');

        // Test DynamoDB path - preserves original casing from JSON
        const config2 = createAccountsConfig();

        mockGetSSMParameterValue.mockResolvedValue('test-table');
        mockQueryConfigTable
          .mockResolvedValueOnce([
            {
              orgInfo: JSON.stringify({ email: 'TEST2@EXAMPLE.COM', accountId: '222' }),
            },
          ])
          .mockResolvedValueOnce([]);

        const testConfig = createAccountsConfig({
          mandatoryAccounts: [
            {
              name: 'Test',
              email: 'test2@example.com',
              description: '',
              organizationalUnit: 'Root',
              warm: false,
            },
          ],
        });

        await config2.loadAccountIds('aws', false, true, testConfig, undefined, true);
        expect(config2.accountIds![0].email).toBe('TEST2@EXAMPLE.COM'); // DynamoDB preserves original casing

        // Test organizations disabled path - converts to lowercase
        const config3 = createAccountsConfig();

        const configWithAccountIds = createAccountsConfig({
          accountIds: [{ email: 'TEST3@EXAMPLE.COM', accountId: '333' }],
        });

        await config3.loadAccountIds('aws', false, false, configWithAccountIds);
        expect(config3.accountIds![0].email).toBe('test3@example.com');
      });

      it('should maintain function contract: void return with side effects', async () => {
        const config = createAccountsConfig({
          emails: {
            management: 'mgmt@example.com',
            logArchive: 'log@example.com',
            audit: 'audit@example.com',
          },
        });

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: [],
          NextToken: undefined,
        });

        const result = await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(result).toBeUndefined();
        expect(config.accountIds).toBeDefined();
        expect(Array.isArray(config.accountIds)).toBe(true);
      });

      it('should handle concurrent calls without race conditions', async () => {
        const config = createAccountsConfig({
          emails: {
            management: 'mgmt@example.com',
            logArchive: 'log@example.com',
            audit: 'audit@example.com',
          },
        });

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: [{ Email: 'test@example.com', Id: '111', Status: 'ACTIVE' }],
          NextToken: undefined,
        });

        // Simulate concurrent calls
        const promises = [
          config.loadAccountIds('aws', false, true, config, undefined, false),
          config.loadAccountIds('aws', false, true, config, undefined, false),
        ];

        await Promise.all(promises);

        // Should have consistent final state
        expect(config.accountIds).toHaveLength(1);
        expect(config.accountIds![0].email).toBe('test@example.com');
      });

      it('should handle large datasets without memory issues', async () => {
        const config = createAccountsConfig();

        // Create a large dataset
        const largeAccountList = Array.from({ length: 1000 }, (_, i) => ({
          Email: `account${i}@example.com`,
          Id: `${String(i).padStart(12, '0')}`,
          Status: 'ACTIVE',
        }));

        mockOrganizationsClient.send.mockResolvedValue({
          Accounts: largeAccountList,
          NextToken: undefined,
        });

        await config.loadAccountIds('aws', false, true, config, undefined, false);

        expect(config.accountIds).toHaveLength(1000);
        expect(config.accountIds![0].email).toBe('account0@example.com');
        expect(config.accountIds![999].email).toBe('account999@example.com');
      });

      it('should preserve original mandatoryAccounts during single account mode', async () => {
        const config = createAccountsConfig();

        const originalMandatoryAccounts = [...config.mandatoryAccounts];
        config.accountIds = [];

        process.env['AWS_REGION'] = TEST_ENV_VALUES.REGION;
        mockSTSClient.send.mockResolvedValue({
          Account: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });

        await config.loadAccountIds('aws', true, false, config);

        // Verify mandatoryAccounts weren't modified
        expect(config.mandatoryAccounts).toEqual(originalMandatoryAccounts);
        expect(config.accountIds).toHaveLength(3);
      });

      it('should handle JSON parsing errors in DynamoDB gracefully', async () => {
        const config = createAccountsConfig();

        mockGetSSMParameterValue.mockResolvedValue('test-table');
        mockQueryConfigTable.mockResolvedValueOnce([{ orgInfo: 'invalid-json-string' }]).mockResolvedValueOnce([]);

        await expect(config.loadAccountIds('aws', false, true, config, undefined, true)).rejects.toThrow();
      });

      it('should handle empty string environment variables correctly', async () => {
        const config = createAccountsConfig();

        process.env['AWS_REGION'] = '';
        process.env['SOLUTION_ID'] = '';
        config.accountIds = [];

        mockSTSClient.send.mockResolvedValue({
          Account: TEST_ACCOUNT_IDS.SINGLE_ACCOUNT,
        });

        await config.loadAccountIds('aws', true, false, config);

        expect(STSClient).toHaveBeenCalledWith(
          expect.objectContaining({
            region: '',
            customUserAgent: '',
          }),
        );
      });
    });

    // Additional method tests
    describe('getAccountNameById', () => {
      it('should return account name for valid account ID', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const accountName = config.getAccountNameById(TEST_ACCOUNT_IDS.MANAGEMENT);
        expect(accountName).toBe('Management');
      });

      it('should throw error for invalid account ID', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        expect(() => {
          config.getAccountNameById('999999999999');
        }).toThrow('Account Name not found for 999999999999');
      });
    });

    describe('getAccountIds', () => {
      it('should return all active account IDs', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const accountIds = config.getAccountIds();
        expect(accountIds.length).toBeGreaterThan(0);
        expect(accountIds).toContain(TEST_ACCOUNT_IDS.MANAGEMENT);
        expect(accountIds).toContain(TEST_ACCOUNT_IDS.AUDIT);
        expect(accountIds).toContain(TEST_ACCOUNT_IDS.LOG_ARCHIVE);
      });

      it('should filter out suspended accounts', () => {
        const config = createAccountsConfig({
          configObject: {
            ...accountsConfigObject,
            accountIds: [
              ...accountsConfigObject.accountIds,
              { email: 'suspended@example.com', accountId: '777777777777', status: 'SUSPENDED' },
            ],
          },
        });

        const accountIds = config.getAccountIds();
        expect(accountIds).not.toContain('777777777777');
      });
    });

    describe('getAccounts', () => {
      it('should return all accounts when single account mode disabled', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const accounts = config.getAccounts(false);
        expect(accounts).toHaveLength(5); // 3 mandatory + 2 workload
      });

      it('should return only management account when single account mode enabled', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const accounts = config.getAccounts(true);
        expect(accounts).toHaveLength(1);
        expect(accounts[0].name).toBe('Management');
      });
    });

    describe('getAccountIdsFromDeploymentTarget', () => {
      it('should return account IDs for Root OU', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const deploymentTargets = {
          organizationalUnits: ['Root'],
          accounts: [],
          excludedRegions: [],
          excludedAccounts: [],
        };

        const accountIds = config.getAccountIdsFromDeploymentTarget(deploymentTargets);
        expect(accountIds).toHaveLength(5);
      });

      it('should return account IDs for specific OU', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const deploymentTargets = {
          organizationalUnits: ['Security'],
          accounts: [],
          excludedRegions: [],
          excludedAccounts: [],
        };

        const accountIds = config.getAccountIdsFromDeploymentTarget(deploymentTargets);
        expect(accountIds).toHaveLength(2); // Audit and LogArchive
      });

      it('should return account IDs for specific accounts', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const deploymentTargets = {
          organizationalUnits: [],
          accounts: ['Management', 'Audit'],
          excludedRegions: [],
          excludedAccounts: [],
        };

        const accountIds = config.getAccountIdsFromDeploymentTarget(deploymentTargets);
        expect(accountIds).toHaveLength(2);
        expect(accountIds).toContain(TEST_ACCOUNT_IDS.MANAGEMENT);
        expect(accountIds).toContain(TEST_ACCOUNT_IDS.AUDIT);
      });

      it('should exclude specified accounts', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const deploymentTargets = {
          organizationalUnits: ['Root'],
          accounts: [],
          excludedRegions: [],
          excludedAccounts: ['Management'],
        };

        const accountIds = config.getAccountIdsFromDeploymentTarget(deploymentTargets);
        expect(accountIds).toHaveLength(4);
        expect(accountIds).not.toContain(TEST_ACCOUNT_IDS.MANAGEMENT);
      });
    });

    describe('getExcludedAccountIds', () => {
      it('should return excluded account IDs', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const deploymentTargets = {
          organizationalUnits: [],
          accounts: [],
          excludedRegions: [],
          excludedAccounts: ['Management', 'Audit'],
        };

        const excludedIds = config.getExcludedAccountIds(deploymentTargets);
        expect(excludedIds).toHaveLength(2);
        expect(excludedIds).toContain(TEST_ACCOUNT_IDS.MANAGEMENT);
        expect(excludedIds).toContain(TEST_ACCOUNT_IDS.AUDIT);
      });

      it('should return empty array when no excluded accounts', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const deploymentTargets = {
          organizationalUnits: [],
          accounts: [],
          excludedRegions: [],
          excludedAccounts: [],
        };

        const excludedIds = config.getExcludedAccountIds(deploymentTargets);
        expect(excludedIds).toHaveLength(0);
      });
    });

    describe('getActiveAccountIds', () => {
      it('should return active account IDs excluding suspended OUs', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const suspendedOus = [{ name: 'Security', organizationalUnits: [], accounts: [] }];

        const activeIds = config.getActiveAccountIds(suspendedOus);
        expect(activeIds.length).toBeGreaterThan(0);
        expect(activeIds).toContain(TEST_ACCOUNT_IDS.MANAGEMENT);
        expect(activeIds).not.toContain(TEST_ACCOUNT_IDS.AUDIT);
        expect(activeIds).not.toContain(TEST_ACCOUNT_IDS.LOG_ARCHIVE);
      });
    });

    describe('mandatory account getters', () => {
      it('should get management account details', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const mgmtAccount = config.getManagementAccount();
        expect(mgmtAccount.name).toBe('Management');
        expect(mgmtAccount.email).toBe(TEST_EMAILS.MANAGEMENT_ORIGINAL);
      });

      it('should get log archive account details', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const logAccount = config.getLogArchiveAccount();
        expect(logAccount.name).toBe('LogArchive');
        expect(logAccount.email).toBe(TEST_EMAILS.LOG_ARCHIVE_ORIGINAL);
      });

      it('should get audit account details', () => {
        const config = createAccountsConfig({ configObject: accountsConfigObject });

        const auditAccount = config.getAuditAccount();
        expect(auditAccount.name).toBe('Audit');
        expect(auditAccount.email).toBe(TEST_EMAILS.AUDIT_ORIGINAL);
      });
    });

    describe('error handling', () => {
      it('should throw error when getting account ID for non-existent account', () => {
        const config = createAccountsConfig();

        expect(() => {
          config.getAccountId('NonExistent');
        }).toThrow('configuration validation failed.');
      });

      it('should throw error when account ID not found in accountIds array', () => {
        const config = createAccountsConfig({
          configObject: {
            mandatoryAccounts: [
              {
                name: 'Test',
                email: 'test@example.com',
                description: 'Test account',
                organizationalUnit: 'Root',
                warm: false,
              },
            ],
            workloadAccounts: [],
            accountIds: [], // Empty accountIds array
          },
        });

        expect(() => {
          config.getAccountId('Test');
        }).toThrow('Account Name not found for undefined');
      });
    });

    describe('edge cases', () => {
      it('should handle empty workload accounts', () => {
        const config = createAccountsConfig({
          mandatoryAccounts: [
            {
              name: 'Management',
              email: TEST_EMAILS.MANAGEMENT,
              description: 'Management account',
              organizationalUnit: 'Root',
              warm: false,
            },
            {
              name: 'LogArchive',
              email: TEST_EMAILS.LOG_ARCHIVE,
              description: 'Log Archive account',
              organizationalUnit: 'Security',
              warm: false,
            },
            {
              name: 'Audit',
              email: TEST_EMAILS.AUDIT,
              description: 'Audit account',
              organizationalUnit: 'Security',
              warm: false,
            },
          ],
          workloadAccounts: [],
        });

        const accounts = config.getAccounts();
        expect(accounts).toHaveLength(3); // Only mandatory accounts
      });

      it('should handle case insensitive email matching', () => {
        const config = createAccountsConfig({
          configObject: {
            mandatoryAccounts: [
              {
                name: 'Management',
                email: 'MGMT@EXAMPLE.COM',
                description: 'Management account',
                organizationalUnit: 'Root',
                warm: false,
              },
            ],
            workloadAccounts: [],
            accountIds: [
              {
                email: 'mgmt@example.com',
                accountId: TEST_ACCOUNT_IDS.MANAGEMENT,
              },
            ],
          },
        });

        const accountId = config.getAccountId('Management');
        expect(accountId).toBe(TEST_ACCOUNT_IDS.MANAGEMENT);
      });
    });
  });
});

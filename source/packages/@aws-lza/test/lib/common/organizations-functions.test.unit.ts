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

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  Account,
  AccountJoinedMethod,
  AccountState,
  AccountStatus,
  AWSOrganizationsNotInUseException,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { IModuleOrganizationsDataSource } from '../../../lib/common/interfaces';
import {
  deregisterDelegatedAdministrator,
  getDelegatedAdministratorAccountId,
  getOrganizationAccounts,
  getOrganizationAccountsFromSourceTable,
  getOrganizationDetails,
  isManagementAccount,
} from '../../../lib/common/organizations-functions';
import { MODULE_EXCEPTIONS } from '../../../lib/common/types';

// Mock dependencies
vi.mock('@aws-sdk/client-organizations', () => {
  const AccountNotRegisteredException = vi.fn();
  AccountNotRegisteredException.prototype.name = 'AccountNotRegisteredException';

  return {
    OrganizationsClient: vi.fn(),
    DescribeOrganizationCommand: vi.fn(),
    ListDelegatedAdministratorsCommand: vi.fn(),
    DeregisterDelegatedAdministratorCommand: vi.fn(),
    paginateListAccounts: vi.fn(),
    AWSOrganizationsNotInUseException: vi.fn(),
    AccountNotRegisteredException,
    AccountStatus: {
      ACTIVE: 'ACTIVE',
      PENDING_CLOSURE: 'PENDING_CLOSURE',
      SUSPENDED: 'SUSPENDED',
    },
    AccountState: {
      ACTIVE: 'ACTIVE',
      PENDING_CLOSURE: 'PENDING_CLOSURE',
      SUSPENDED: 'SUSPENDED',
      PENDING_INVITATION: 'PENDING_INVITATION',
    },
    AccountJoinedMethod: {},
  };
});

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
  setRetryStrategy: vi.fn(function () {
    return {};
  }),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(function () {
    return {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      commandExecution: vi.fn(),
      commandSuccess: vi.fn(),
      dryRun: vi.fn(),
    };
  }),
}));

vi.mock('../../../lib/common/dynamodb-table-functions', () => ({
  queryDynamoDBTable: vi.fn(),
}));

// Mock constants
const MOCK_CONSTANTS = {
  logPrefix: 'test-prefix',
  managementAccountId: 'XXXXXXXXXXXX',
  organizationId: 'o-test123456',
  accounts: [
    {
      Id: 'YYYYYYYYYYYY',
      Name: 'Account1',
      Email: 'account1@example.com',
      State: 'ACTIVE' as AccountState,
      Status: 'SUSPENDED' as AccountStatus,
      JoinedMethod: 'INVITED' as AccountJoinedMethod,
      Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/YYYYYYYYYYYY',
      JoinedTimestamp: new Date('2023-01-01T00:00:00Z'),
    },
    {
      Id: 'ZZZZZZZZZZZZ',
      Name: 'Account2',
      Email: 'account2@example.com',
      Status: 'ACTIVE' as AccountStatus,
      JoinedMethod: 'CREATED' as AccountJoinedMethod,
      Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/ZZZZZZZZZZZZ',
      JoinedTimestamp: new Date('2023-01-02T00:00:00Z'),
    },
  ] as Account[],
  organizationsDataSource: {
    tableName: 'test-table',
    filters: [{ name: 'dataType', value: 'mandatoryAccount' }],
    filterOperator: 'AND' as const,
  } as IModuleOrganizationsDataSource,
  tableData: [
    {
      awsKey: 'YYYYYYYYYYYY',
      acceleratorKey: 'account1@example.com',
      dataType: 'mandatoryAccount',
      dataBag: JSON.stringify({
        name: 'Account1',
        arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/YYYYYYYYYYYY',
        status: 'SUSPENDED',
        joinedMethod: 'INVITED',
        joinedTimestamp: '2023-01-01T00:00:00Z',
      }),
      orgInfo: JSON.stringify({
        orgsApiResponse: {
          State: 'ACTIVE',
          Status: 'SUSPENDED',
        },
      }),
    },
    {
      awsKey: 'ZZZZZZZZZZZZ',
      acceleratorKey: 'account2@example.com',
      dataType: 'workloadAccount',
      dataBag: JSON.stringify({
        name: 'Account2',
        arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/ZZZZZZZZZZZZ',
        status: 'SUSPENDED',
        joinedMethod: 'CREATED',
        joinedTimestamp: '2023-01-02T00:00:00Z',
      }),
      orgInfo: JSON.stringify({
        status: 'ACTIVE',
        orgsApiResponse: { Status: 'SUSPENDED' },
      }),
    },
  ],
};

describe('organizations-functions', () => {
  let mockExecuteApi: ReturnType<typeof vi.fn>;
  let mockQueryDynamoDBTable: ReturnType<typeof vi.fn>;
  let mockPaginateListAccounts: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    const utility = await import('../../../lib/common/utility.js');
    const dynamodbFunctions = await import('../../../lib/common/dynamodb-table-functions.js');
    const organizations = await import('@aws-sdk/client-organizations');

    mockExecuteApi = vi.mocked(utility.executeApi);
    mockQueryDynamoDBTable = vi.mocked(dynamodbFunctions.queryDynamoDBTable);
    mockPaginateListAccounts = vi.mocked(organizations.paginateListAccounts);
  });

  describe('getOrganizationAccounts', () => {
    test('should retrieve all organization accounts successfully', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Accounts: [MOCK_CONSTANTS.accounts[0]] };
          yield { Accounts: [MOCK_CONSTANTS.accounts[1]] };
        },
      };

      mockPaginateListAccounts.mockReturnValue(mockPaginator);

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.logPrefix, new OrganizationsClient({}));

      expect(result).toEqual(MOCK_CONSTANTS.accounts);
      expect(mockPaginateListAccounts).toHaveBeenCalledWith(
        { client: expect.any(OrganizationsClient) },
        { MaxResults: 20 },
      );
    });

    test('should handle empty accounts response', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Accounts: [] };
        },
      };

      mockPaginateListAccounts.mockReturnValue(mockPaginator);

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.logPrefix, new OrganizationsClient({}));

      expect(result).toEqual([]);
    });

    test('should handle undefined accounts in response', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Accounts: undefined };
          yield { Accounts: [MOCK_CONSTANTS.accounts[0]] };
        },
      };

      mockPaginateListAccounts.mockReturnValue(mockPaginator);

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.logPrefix, new OrganizationsClient({}));

      expect(result).toEqual([MOCK_CONSTANTS.accounts[0]]);
    });

    test('should handle multiple pages of accounts', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Accounts: [MOCK_CONSTANTS.accounts[0]] };
          yield { Accounts: [MOCK_CONSTANTS.accounts[1]] };
          yield { Accounts: [] };
        },
      };

      mockPaginateListAccounts.mockReturnValue(mockPaginator);

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.logPrefix, new OrganizationsClient({}));

      expect(result).toHaveLength(2);
      expect(result).toEqual(MOCK_CONSTANTS.accounts);
    });

    test('should create client with clientProps when no client provided', async () => {
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield { Accounts: [MOCK_CONSTANTS.accounts[0]] };
        },
      };

      mockPaginateListAccounts.mockReturnValue(mockPaginator);

      const clientProps = {
        region: 'us-east-1',
        customUserAgent: 'test-agent',
        credentials: {
          accessKeyId: 'test-accessKeyId',
          secretAccessKey: 'test-secretAccessKey',
          sessionToken: 'test-sessionToken',
        },
      };

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.logPrefix, undefined, clientProps);

      expect(result).toEqual([MOCK_CONSTANTS.accounts[0]]);
      expect(mockPaginateListAccounts).toHaveBeenCalledWith(
        { client: expect.any(OrganizationsClient) },
        { MaxResults: 20 },
      );
    });

    test('should prefer State, fall back to Status, and retain accounts without a lifecycle state', async () => {
      const suspendedAccount: Account = {
        Id: 'AAAAAAAAAAAA',
        Name: 'SuspendedAccount',
        Email: 'suspended@example.com',
        Status: 'SUSPENDED' as AccountStatus,
        JoinedMethod: 'INVITED' as AccountJoinedMethod,
        Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/AAAAAAAAAAAA',
        JoinedTimestamp: new Date('2024-06-01T00:00:00Z'),
      };
      const pendingClosureAccount: Account = {
        Id: 'BBBBBBBBBBBB',
        Name: 'PendingClosureAccount',
        Email: 'pending-closure@example.com',
        Status: 'PENDING_CLOSURE' as AccountStatus,
        JoinedMethod: 'INVITED' as AccountJoinedMethod,
        Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/BBBBBBBBBBBB',
        JoinedTimestamp: new Date('2024-07-01T00:00:00Z'),
      };
      const missingStateAccount: Account = {
        Id: 'CCCCCCCCCCCC',
        Name: 'MissingStateAccount',
        Email: 'missing-state@example.com',
      };
      const mockPaginator = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            Accounts: [
              MOCK_CONSTANTS.accounts[0],
              suspendedAccount,
              MOCK_CONSTANTS.accounts[1],
              pendingClosureAccount,
              missingStateAccount,
            ],
          };
        },
      };
      mockPaginateListAccounts.mockReturnValue(mockPaginator);

      const result = await getOrganizationAccounts(MOCK_CONSTANTS.logPrefix, new OrganizationsClient({}));

      expect(result).toEqual([...MOCK_CONSTANTS.accounts, missingStateAccount]);
      expect(result.map(a => a.Id)).not.toContain(suspendedAccount.Id);
      expect(result.map(a => a.Id)).not.toContain(pendingClosureAccount.Id);
    });
  });

  describe('isManagementAccount', () => {
    test('should return true when account is management account', async () => {
      mockExecuteApi.mockResolvedValue({
        Organization: {
          MasterAccountId: MOCK_CONSTANTS.managementAccountId,
          Id: MOCK_CONSTANTS.organizationId,
        },
      });

      const result = await isManagementAccount(
        new OrganizationsClient({}),
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBe(true);
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DescribeOrganizationCommand',
        {},
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
        [AWSOrganizationsNotInUseException],
      );
    });

    test('should return false when account is not management account', async () => {
      mockExecuteApi.mockResolvedValue({
        Organization: {
          MasterAccountId: '999999999999',
          Id: MOCK_CONSTANTS.organizationId,
        },
      });

      const result = await isManagementAccount(
        new OrganizationsClient({}),
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBe(false);
    });

    test('should return false when organization is undefined', async () => {
      mockExecuteApi.mockResolvedValue({
        Organization: undefined,
      });

      const result = await isManagementAccount(
        new OrganizationsClient({}),
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBe(false);
    });

    test('should return false when AWSOrganizationsNotInUseException is thrown', async () => {
      // Mock executeApi to return undefined for expected exceptions (as the function expects)
      mockExecuteApi.mockResolvedValue(undefined);

      const result = await isManagementAccount(
        new OrganizationsClient({}),
        MOCK_CONSTANTS.managementAccountId,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBe(false);
    });

    test('should throw other errors', async () => {
      const otherError = new Error('Some other error');
      mockExecuteApi.mockRejectedValue(otherError);

      await expect(
        isManagementAccount(new OrganizationsClient({}), MOCK_CONSTANTS.managementAccountId, MOCK_CONSTANTS.logPrefix),
      ).rejects.toThrow('Some other error');
    });
  });

  describe('getOrganizationDetails', () => {
    test('should return organization details successfully', async () => {
      const mockOrganization = {
        Id: MOCK_CONSTANTS.organizationId,
        Arn: `arn:aws:organizations::${MOCK_CONSTANTS.managementAccountId}:organization/${MOCK_CONSTANTS.organizationId}`,
        FeatureSet: 'ALL',
        MasterAccountArn: `arn:aws:organizations::${MOCK_CONSTANTS.managementAccountId}:account/${MOCK_CONSTANTS.organizationId}/${MOCK_CONSTANTS.managementAccountId}`,
        MasterAccountId: MOCK_CONSTANTS.managementAccountId,
        MasterAccountEmail: 'master@example.com',
      };

      mockExecuteApi.mockResolvedValue({
        Organization: mockOrganization,
      });

      const result = await getOrganizationDetails(MOCK_CONSTANTS.logPrefix);

      expect(result).toEqual(mockOrganization);
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DescribeOrganizationCommand',
        {},
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
        [AWSOrganizationsNotInUseException],
      );
    });

    test('should return organization details with custom client', async () => {
      const mockOrganization = {
        Id: MOCK_CONSTANTS.organizationId,
        MasterAccountId: MOCK_CONSTANTS.managementAccountId,
      };

      mockExecuteApi.mockResolvedValue({
        Organization: mockOrganization,
      });

      const customClient = new OrganizationsClient({});
      const result = await getOrganizationDetails(MOCK_CONSTANTS.logPrefix, customClient);

      expect(result).toEqual(mockOrganization);
    });

    test('should return organization details with client props', async () => {
      const mockOrganization = {
        Id: MOCK_CONSTANTS.organizationId,
        MasterAccountId: MOCK_CONSTANTS.managementAccountId,
      };

      mockExecuteApi.mockResolvedValue({
        Organization: mockOrganization,
      });

      const clientProps = {
        region: 'us-east-1',
        customUserAgent: 'test-agent',
      };

      const result = await getOrganizationDetails(MOCK_CONSTANTS.logPrefix, undefined, clientProps);

      expect(result).toEqual(mockOrganization);
    });

    test('should throw error when organization details are missing', async () => {
      mockExecuteApi.mockResolvedValue({
        Organization: undefined,
      });

      await expect(getOrganizationDetails(MOCK_CONSTANTS.logPrefix)).rejects.toThrow(
        "AWS Organization couldn't fetch organization details",
      );
    });

    test('should return undefined when AWSOrganizationsNotInUseException is thrown', async () => {
      // Mock executeApi to return undefined for expected exceptions (as the function expects)
      mockExecuteApi.mockResolvedValue(undefined);

      const result = await getOrganizationDetails(MOCK_CONSTANTS.logPrefix);

      expect(result).toBeUndefined();
    });

    test('should throw other errors', async () => {
      const otherError = new Error('Some other error');
      mockExecuteApi.mockRejectedValue(otherError);

      await expect(getOrganizationDetails(MOCK_CONSTANTS.logPrefix)).rejects.toThrow('Some other error');
    });
  });

  describe('getOrganizationAccountsFromSourceTable', () => {
    test('should retrieve accounts from source table successfully', async () => {
      mockQueryDynamoDBTable.mockResolvedValue({ items: MOCK_CONSTANTS.tableData });

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        Id: 'YYYYYYYYYYYY',
        Email: 'account1@example.com',
        Name: 'Account1',
        Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/YYYYYYYYYYYY',
        State: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date('2023-01-01T00:00:00Z'),
      });
      expect(result[1]).toEqual({
        Id: 'ZZZZZZZZZZZZ',
        Email: 'account2@example.com',
        Name: 'Account2',
        Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/ZZZZZZZZZZZZ',
        Status: 'ACTIVE',
        JoinedMethod: 'CREATED',
        JoinedTimestamp: new Date('2023-01-02T00:00:00Z'),
      });

      expect(mockQueryDynamoDBTable).toHaveBeenCalledWith({
        client: expect.any(DynamoDBClient),
        tableName: MOCK_CONSTANTS.organizationsDataSource.tableName,
        logPrefix: MOCK_CONSTANTS.logPrefix,
        filters: MOCK_CONSTANTS.organizationsDataSource.filters,
        filterOperator: MOCK_CONSTANTS.organizationsDataSource.filterOperator,
        pagination: { enabled: true },
      });
    });

    test('should throw error when no data found in table', async () => {
      mockQueryDynamoDBTable.mockResolvedValue({ items: undefined });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('No organization accounts found in source table test-table (1 filters applied)');
    });

    test('should throw error when no data found in table with no filters', async () => {
      mockQueryDynamoDBTable.mockResolvedValue({ items: undefined });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: { ...MOCK_CONSTANTS.organizationsDataSource, filters: undefined },
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('No organization accounts found in source table test-table (0 filters applied)');
    });

    test('should skip invalid account types', async () => {
      const tableDataWithInvalidType = [
        ...MOCK_CONSTANTS.tableData,
        {
          awsKey: '333333333333',
          acceleratorKey: 'account3@example.com',
          dataType: 'invalidType',
          dataBag: JSON.stringify({ name: 'Account3' }),
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue({ items: tableDataWithInvalidType });

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(2); // Should skip the invalid type
    });

    test('should throw error when awsKey is missing', async () => {
      const tableDataWithMissingAwsKey = [
        {
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
          dataBag: JSON.stringify({ name: 'Account1' }),
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue({ items: tableDataWithMissingAwsKey });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow("Missing required field 'awsKey' for account item in source table");
    });

    test('should throw error when acceleratorKey is missing', async () => {
      const tableDataWithMissingAcceleratorKey = [
        {
          awsKey: 'YYYYYYYYYYYY',
          dataType: 'mandatoryAccount',
          dataBag: JSON.stringify({ name: 'Account1' }),
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue({ items: tableDataWithMissingAcceleratorKey });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow(
        "Missing required field 'acceleratorKey' for account item in source table, unable to get account email",
      );
    });

    test('should throw error when dataBag is missing', async () => {
      const tableDataWithMissingDataBag = [
        {
          awsKey: 'YYYYYYYYYYYY',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue({ items: tableDataWithMissingDataBag });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow(
        "Missing required field 'dataBag' for account item in source table, unable to get account details",
      );
    });

    test('should throw error when dataBag contains invalid JSON', async () => {
      const tableDataWithInvalidJson = [
        {
          awsKey: 'YYYYYYYYYYYY',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
          dataBag: 'invalid json',
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue({ items: tableDataWithInvalidJson });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('Invalid JSON in dataBag field for account account1@example.com:');
    });

    test('should throw error when orgInfo contains invalid JSON', async () => {
      mockQueryDynamoDBTable.mockResolvedValue({
        items: [
          {
            awsKey: 'YYYYYYYYYYYY',
            acceleratorKey: 'account1@example.com',
            dataType: 'mandatoryAccount',
            dataBag: JSON.stringify({ name: 'Account1' }),
            orgInfo: 'invalid json',
          },
        ],
      });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('Invalid JSON in orgInfo field for account account1@example.com:');
    });

    test('should handle minimal account data', async () => {
      const minimalTableData = [
        {
          awsKey: 'YYYYYYYYYYYY',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
          dataBag: JSON.stringify({}), // Empty dataBag
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue({ items: minimalTableData });

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        Id: 'YYYYYYYYYYYY',
        Email: 'account1@example.com',
      });
    });

    test('should handle partial account data', async () => {
      const partialTableData = [
        {
          awsKey: 'YYYYYYYYYYYY',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
          dataBag: JSON.stringify({
            name: 'Account1',
            status: 'ACTIVE',
          }),
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue({ items: partialTableData });

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        Id: 'YYYYYYYYYYYY',
        Email: 'account1@example.com',
        Name: 'Account1',
        Status: 'ACTIVE',
      });
    });

    test('should handle both mandatoryAccount and workloadAccount types', async () => {
      mockQueryDynamoDBTable.mockResolvedValue({ items: MOCK_CONSTANTS.tableData });

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(2);
      expect(result.some(account => account.Id === 'YYYYYYYYYYYY')).toBe(true);
      expect(result.some(account => account.Id === 'ZZZZZZZZZZZZ')).toBe(true);
    });

    test('should exclude accounts whose cached status is not ACTIVE', async () => {
      const tableDataWithSuspended = [
        ...MOCK_CONSTANTS.tableData,
        {
          awsKey: 'AAAAAAAAAAAA',
          acceleratorKey: 'suspended@example.com',
          dataType: 'workloadAccount',
          dataBag: JSON.stringify({
            name: 'SuspendedAccount',
            arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/AAAAAAAAAAAA',
            status: 'SUSPENDED',
            joinedMethod: 'INVITED',
            joinedTimestamp: '2024-06-01T00:00:00Z',
          }),
        },
        {
          awsKey: 'BBBBBBBBBBBB',
          acceleratorKey: 'pending-closure@example.com',
          dataType: 'workloadAccount',
          dataBag: JSON.stringify({
            name: 'PendingClosureAccount',
            arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/BBBBBBBBBBBB',
            status: 'PENDING_CLOSURE',
            joinedMethod: 'INVITED',
            joinedTimestamp: '2024-07-01T00:00:00Z',
          }),
        },
      ];
      mockQueryDynamoDBTable.mockResolvedValue({ items: tableDataWithSuspended });

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(2);
      expect(result.map(a => a.Id)).not.toContain('AAAAAAAAAAAA');
      expect(result.map(a => a.Id)).not.toContain('BBBBBBBBBBBB');
    });

    test('should exclude accounts whose nested legacy Organizations status is not ACTIVE', async () => {
      const nestedLegacyStatusAccountId = 'AAAAAAAAAAAA';
      mockQueryDynamoDBTable.mockResolvedValue({
        items: [
          ...MOCK_CONSTANTS.tableData,
          {
            awsKey: nestedLegacyStatusAccountId,
            acceleratorKey: 'suspended@example.com',
            dataType: 'workloadAccount',
            dataBag: JSON.stringify({
              name: 'SuspendedAccount',
            }),
            orgInfo: JSON.stringify({
              orgsApiResponse: {
                Status: 'SUSPENDED',
              },
            }),
          },
        ],
      });

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result.map(account => account.Id)).not.toContain(nestedLegacyStatusAccountId);
    });
  });

  describe('helper functions coverage', () => {
    test('should validate isValidAccountType function', async () => {
      const validTypes = [
        { dataType: 'mandatoryAccount', expected: true },
        { dataType: 'workloadAccount', expected: true },
        { dataType: 'invalidType', expected: false },
        { dataType: 'otherType', expected: false },
      ];

      for (const { dataType, expected } of validTypes) {
        const tableData = [
          {
            awsKey: 'YYYYYYYYYYYY',
            acceleratorKey: 'account1@example.com',
            dataType,
            dataBag: JSON.stringify({ name: 'Account1' }),
          },
        ];

        mockQueryDynamoDBTable.mockResolvedValue({ items: tableData });

        const result = await getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        });

        expect(result).toHaveLength(expected ? 1 : 0);
      }
    });

    test('should handle validateRequiredFields edge cases', async () => {
      const testCases = [
        {
          description: 'missing awsKey',
          data: { acceleratorKey: 'test@example.com', dataType: 'mandatoryAccount', dataBag: '{}' },
          expectedError: "Missing required field 'awsKey' for account item in source table",
        },
      ];

      for (const testCase of testCases) {
        mockQueryDynamoDBTable.mockResolvedValue({ items: [testCase.data] });

        await expect(
          getOrganizationAccountsFromSourceTable({
            client: new DynamoDBClient({}),
            organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
            logPrefix: MOCK_CONSTANTS.logPrefix,
          }),
        ).rejects.toThrow(testCase.expectedError);
      }
    });

    test('should cover defensive awsKey check in buildAccountFromItem', async () => {
      // This test is designed to cover the defensive check in buildAccountFromItem (lines 85-88)
      // Since validateRequiredFields and buildAccountFromItem use the same check (!item['awsKey']),
      // we need to mock the validation to pass but then have the build fail

      // Create a spy that will allow the first call (validation) to pass but second call (build) to see missing awsKey
      let callCount = 0;
      const mockItem = {
        get awsKey() {
          callCount++;
          return callCount === 1 ? 'YYYYYYYYYYYY' : null; // First call returns value, second returns null
        },
        acceleratorKey: 'account1@example.com',
        dataType: 'mandatoryAccount',
        dataBag: JSON.stringify({ name: 'Account1' }),
      };

      mockQueryDynamoDBTable.mockResolvedValue({ items: [mockItem] });

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow("Missing required field 'awsKey' for account item in source table, unable to get account id");
    });
  });

  describe('getDelegatedAdministratorAccountId', () => {
    test('should return delegated administrator account ID when one exists', async () => {
      const mockResponse = {
        DelegatedAdministrators: [
          {
            Id: 'AAAAAAAAAAAA',
            Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/AAAAAAAAAAAA',
            Email: 'admin@example.com',
            Name: 'Admin Account',
            Status: 'ACTIVE',
            JoinedMethod: 'INVITED',
            JoinedTimestamp: new Date('2023-01-01T00:00:00Z'),
            DelegationEnabledDate: new Date('2023-01-01T00:00:00Z'),
          },
        ],
      };

      mockExecuteApi.mockResolvedValue(mockResponse);

      const result = await getDelegatedAdministratorAccountId(
        new OrganizationsClient({}),
        'macie.amazonaws.com',
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBe('AAAAAAAAAAAA');
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'ListDelegatedAdministratorsCommand',
        { ServicePrincipal: 'macie.amazonaws.com' },
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
      );
    });

    test('should return undefined when no delegated administrator exists', async () => {
      const mockResponse = {
        DelegatedAdministrators: [],
      };

      mockExecuteApi.mockResolvedValue(mockResponse);

      const result = await getDelegatedAdministratorAccountId(
        new OrganizationsClient({}),
        'macie.amazonaws.com',
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBeUndefined();
    });

    test('should return undefined when DelegatedAdministrators is undefined', async () => {
      const mockResponse = {};

      mockExecuteApi.mockResolvedValue(mockResponse);

      const result = await getDelegatedAdministratorAccountId(
        new OrganizationsClient({}),
        'macie.amazonaws.com',
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBeUndefined();
    });

    test('should throw error when multiple delegated administrators exist', async () => {
      const mockResponse = {
        DelegatedAdministrators: [
          {
            Id: 'AAAAAAAAAAAA',
            Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/AAAAAAAAAAAA',
            Email: 'admin1@example.com',
            Name: 'Admin Account 1',
          },
          {
            Id: 'BBBBBBBBBBBB',
            Arn: 'arn:aws:organizations::XXXXXXXXXXXX:account/o-test123456/BBBBBBBBBBBB',
            Email: 'admin2@example.com',
            Name: 'Admin Account 2',
          },
        ],
      };

      mockExecuteApi.mockResolvedValue(mockResponse);

      await expect(
        getDelegatedAdministratorAccountId(
          new OrganizationsClient({}),
          'macie.amazonaws.com',
          MOCK_CONSTANTS.logPrefix,
        ),
      ).rejects.toThrow(
        `${MODULE_EXCEPTIONS.SERVICE_EXCEPTION}: Multiple delegated administrators found for service macie.amazonaws.com: AAAAAAAAAAAA, BBBBBBBBBBBB`,
      );
    });

    test('should work with different service principals', async () => {
      const mockResponse = {
        DelegatedAdministrators: [
          {
            Id: 'CCCCCCCCCCCC',
            Name: 'SecurityHub Admin',
          },
        ],
      };

      mockExecuteApi.mockResolvedValue(mockResponse);

      const result = await getDelegatedAdministratorAccountId(
        new OrganizationsClient({}),
        'securityhub.amazonaws.com',
        MOCK_CONSTANTS.logPrefix,
      );

      expect(result).toBe('CCCCCCCCCCCC');
      expect(mockExecuteApi).toHaveBeenCalledWith(
        'ListDelegatedAdministratorsCommand',
        { ServicePrincipal: 'securityhub.amazonaws.com' },
        expect.any(Function),
        expect.anything(),
        MOCK_CONSTANTS.logPrefix,
      );
    });

    test('should propagate executeApi errors', async () => {
      const apiError = new Error('API Error');
      mockExecuteApi.mockRejectedValue(apiError);

      await expect(
        getDelegatedAdministratorAccountId(
          new OrganizationsClient({}),
          'macie.amazonaws.com',
          MOCK_CONSTANTS.logPrefix,
        ),
      ).rejects.toThrow('API Error');
    });
  });

  describe('deregisterDelegatedAdministrator', () => {
    test('should deregister delegated administrator successfully', async () => {
      mockExecuteApi.mockResolvedValue({});

      await deregisterDelegatedAdministrator(
        new OrganizationsClient({}),
        'AAAAAAAAAAAA',
        'macie.amazonaws.com',
        false,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DeregisterDelegatedAdministratorCommand',
        {
          AccountId: 'AAAAAAAAAAAA',
          ServicePrincipal: 'macie.amazonaws.com',
        },
        expect.any(Function),
        expect.objectContaining({
          info: expect.any(Function),
          warn: expect.any(Function),
          error: expect.any(Function),
        }),
        MOCK_CONSTANTS.logPrefix,
        expect.arrayContaining([expect.any(Function)]),
      );
    });

    test('should perform dry run without making API call', async () => {
      await deregisterDelegatedAdministrator(
        new OrganizationsClient({}),
        'AAAAAAAAAAAA',
        'macie.amazonaws.com',
        true,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(mockExecuteApi).not.toHaveBeenCalled();
    });

    test('should work with different service principals', async () => {
      mockExecuteApi.mockResolvedValue({});

      await deregisterDelegatedAdministrator(
        new OrganizationsClient({}),
        'CCCCCCCCCCCC',
        'securityhub.amazonaws.com',
        false,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DeregisterDelegatedAdministratorCommand',
        {
          AccountId: 'CCCCCCCCCCCC',
          ServicePrincipal: 'securityhub.amazonaws.com',
        },
        expect.any(Function),
        expect.objectContaining({
          info: expect.any(Function),
          warn: expect.any(Function),
          error: expect.any(Function),
        }),
        MOCK_CONSTANTS.logPrefix,
        expect.arrayContaining([expect.any(Function)]),
      );
    });

    test('should work with different account IDs', async () => {
      mockExecuteApi.mockResolvedValue({});

      await deregisterDelegatedAdministrator(
        new OrganizationsClient({}),
        'YYYYYYYYYYYY',
        'guardduty.amazonaws.com',
        false,
        MOCK_CONSTANTS.logPrefix,
      );

      expect(mockExecuteApi).toHaveBeenCalledWith(
        'DeregisterDelegatedAdministratorCommand',
        {
          AccountId: 'YYYYYYYYYYYY',
          ServicePrincipal: 'guardduty.amazonaws.com',
        },
        expect.any(Function),
        expect.objectContaining({
          info: expect.any(Function),
          warn: expect.any(Function),
          error: expect.any(Function),
        }),
        MOCK_CONSTANTS.logPrefix,
        expect.arrayContaining([expect.any(Function)]),
      );
    });

    test('should propagate executeApi errors', async () => {
      const apiError = new Error('Deregistration failed');
      mockExecuteApi.mockRejectedValue(apiError);

      await expect(
        deregisterDelegatedAdministrator(
          new OrganizationsClient({}),
          'AAAAAAAAAAAA',
          'macie.amazonaws.com',
          false,
          MOCK_CONSTANTS.logPrefix,
        ),
      ).rejects.toThrow('Deregistration failed');
    });

    test('should handle empty response from API', async () => {
      mockExecuteApi.mockResolvedValue(undefined);

      await expect(
        deregisterDelegatedAdministrator(
          new OrganizationsClient({}),
          'AAAAAAAAAAAA',
          'macie.amazonaws.com',
          false,
          MOCK_CONSTANTS.logPrefix,
        ),
      ).resolves.not.toThrow();
    });

    test('should handle AccountNotRegisteredException as expected behavior', async () => {
      const { AccountNotRegisteredException } = await import('@aws-sdk/client-organizations');
      const accountNotRegisteredException = new AccountNotRegisteredException({
        message: 'Account is not a registered delegated administrator',
        $metadata: {},
      });
      mockExecuteApi.mockRejectedValue(accountNotRegisteredException);

      // Should not throw - this is expected behavior
      await expect(
        deregisterDelegatedAdministrator(
          new OrganizationsClient({}),
          'AAAAAAAAAAAA',
          'macie.amazonaws.com',
          false,
          MOCK_CONSTANTS.logPrefix,
        ),
      ).resolves.not.toThrow();

      // Verify executeApi was called (this covers the catch block)
      expect(mockExecuteApi).toHaveBeenCalled();
    });
  });
});

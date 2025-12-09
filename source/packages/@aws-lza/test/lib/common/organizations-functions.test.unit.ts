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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  Account,
  AccountJoinedMethod,
  AccountStatus,
  AWSOrganizationsNotInUseException,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import {
  getOrganizationAccounts,
  isManagementAccount,
  getOrganizationAccountsFromSourceTable,
} from '../../../lib/common/organizations-functions';
import { IModuleOrganizationsDataSource } from '../../../lib/common/interfaces';

// Mock dependencies
vi.mock('@aws-sdk/client-organizations', () => ({
  OrganizationsClient: vi.fn(),
  DescribeOrganizationCommand: vi.fn(),
  paginateListAccounts: vi.fn(),
  AWSOrganizationsNotInUseException: vi.fn(),
  AccountStatus: {},
  AccountJoinedMethod: {},
}));

vi.mock('../../../lib/common/utility', () => ({
  executeApi: vi.fn(),
}));

vi.mock('../../../lib/common/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    commandExecution: vi.fn(),
    commandSuccess: vi.fn(),
  })),
}));

vi.mock('../../../lib/common/dynamodb-table-functions', () => ({
  queryDynamoDBTable: vi.fn(),
}));

// Mock constants
const MOCK_CONSTANTS = {
  logPrefix: 'test-prefix',
  managementAccountId: '123456789012',
  organizationId: 'o-test123456',
  accounts: [
    {
      Id: '111111111111',
      Name: 'Account1',
      Email: 'account1@example.com',
      Status: 'ACTIVE' as AccountStatus,
      JoinedMethod: 'INVITED' as AccountJoinedMethod,
      Arn: 'arn:aws:organizations::123456789012:account/o-test123456/111111111111',
      JoinedTimestamp: new Date('2023-01-01T00:00:00Z'),
    },
    {
      Id: '222222222222',
      Name: 'Account2',
      Email: 'account2@example.com',
      Status: 'ACTIVE' as AccountStatus,
      JoinedMethod: 'CREATED' as AccountJoinedMethod,
      Arn: 'arn:aws:organizations::123456789012:account/o-test123456/222222222222',
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
      awsKey: '111111111111',
      acceleratorKey: 'account1@example.com',
      dataType: 'mandatoryAccount',
      dataBag: JSON.stringify({
        name: 'Account1',
        arn: 'arn:aws:organizations::123456789012:account/o-test123456/111111111111',
        status: 'ACTIVE',
        joinedMethod: 'INVITED',
        joinedTimestamp: '2023-01-01T00:00:00Z',
      }),
    },
    {
      awsKey: '222222222222',
      acceleratorKey: 'account2@example.com',
      dataType: 'workloadAccount',
      dataBag: JSON.stringify({
        name: 'Account2',
        arn: 'arn:aws:organizations::123456789012:account/o-test123456/222222222222',
        status: 'ACTIVE',
        joinedMethod: 'CREATED',
        joinedTimestamp: '2023-01-02T00:00:00Z',
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

    const utility = await import('../../../lib/common/utility');
    const dynamodbFunctions = await import('../../../lib/common/dynamodb-table-functions');
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

      const result = await getOrganizationAccounts(new OrganizationsClient({}), MOCK_CONSTANTS.logPrefix);

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

      const result = await getOrganizationAccounts(new OrganizationsClient({}), MOCK_CONSTANTS.logPrefix);

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

      const result = await getOrganizationAccounts(new OrganizationsClient({}), MOCK_CONSTANTS.logPrefix);

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

      const result = await getOrganizationAccounts(new OrganizationsClient({}), MOCK_CONSTANTS.logPrefix);

      expect(result).toHaveLength(2);
      expect(result).toEqual(MOCK_CONSTANTS.accounts);
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
      const notInUseError = new AWSOrganizationsNotInUseException({
        message: 'Organization not in use',
        $metadata: {},
      });
      mockExecuteApi.mockRejectedValue(notInUseError);

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

  describe('getOrganizationAccountsFromSourceTable', () => {
    test('should retrieve accounts from source table successfully', async () => {
      mockQueryDynamoDBTable.mockResolvedValue(MOCK_CONSTANTS.tableData);

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        Id: '111111111111',
        Email: 'account1@example.com',
        Name: 'Account1',
        Arn: 'arn:aws:organizations::123456789012:account/o-test123456/111111111111',
        Status: 'ACTIVE',
        JoinedMethod: 'INVITED',
        JoinedTimestamp: new Date('2023-01-01T00:00:00Z'),
      });
      expect(result[1]).toEqual({
        Id: '222222222222',
        Email: 'account2@example.com',
        Name: 'Account2',
        Arn: 'arn:aws:organizations::123456789012:account/o-test123456/222222222222',
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
      });
    });

    test('should throw error when no data found in table', async () => {
      mockQueryDynamoDBTable.mockResolvedValue(undefined);

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('No organization accounts found in source table test-table (1 filters applied)');
    });

    test('should throw error when no data found in table with no filters', async () => {
      mockQueryDynamoDBTable.mockResolvedValue(undefined);

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

      mockQueryDynamoDBTable.mockResolvedValue(tableDataWithInvalidType);

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

      mockQueryDynamoDBTable.mockResolvedValue(tableDataWithMissingAwsKey);

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
          awsKey: '111111111111',
          dataType: 'mandatoryAccount',
          dataBag: JSON.stringify({ name: 'Account1' }),
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue(tableDataWithMissingAcceleratorKey);

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
          awsKey: '111111111111',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue(tableDataWithMissingDataBag);

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
          awsKey: '111111111111',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
          dataBag: 'invalid json',
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue(tableDataWithInvalidJson);

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow('Invalid JSON in dataBag field for account account1@example.com:');
    });

    test('should handle minimal account data', async () => {
      const minimalTableData = [
        {
          awsKey: '111111111111',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
          dataBag: JSON.stringify({}), // Empty dataBag
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue(minimalTableData);

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        Id: '111111111111',
        Email: 'account1@example.com',
      });
    });

    test('should handle partial account data', async () => {
      const partialTableData = [
        {
          awsKey: '111111111111',
          acceleratorKey: 'account1@example.com',
          dataType: 'mandatoryAccount',
          dataBag: JSON.stringify({
            name: 'Account1',
            status: 'ACTIVE',
          }),
        },
      ];

      mockQueryDynamoDBTable.mockResolvedValue(partialTableData);

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        Id: '111111111111',
        Email: 'account1@example.com',
        Name: 'Account1',
        Status: 'ACTIVE',
      });
    });

    test('should handle both mandatoryAccount and workloadAccount types', async () => {
      mockQueryDynamoDBTable.mockResolvedValue(MOCK_CONSTANTS.tableData);

      const result = await getOrganizationAccountsFromSourceTable({
        client: new DynamoDBClient({}),
        organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
        logPrefix: MOCK_CONSTANTS.logPrefix,
      });

      expect(result).toHaveLength(2);
      expect(result.some(account => account.Id === '111111111111')).toBe(true);
      expect(result.some(account => account.Id === '222222222222')).toBe(true);
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
        const tableData = expected
          ? [
              {
                awsKey: '111111111111',
                acceleratorKey: 'account1@example.com',
                dataType,
                dataBag: JSON.stringify({ name: 'Account1' }),
              },
            ]
          : [
              {
                awsKey: '111111111111',
                acceleratorKey: 'account1@example.com',
                dataType,
                dataBag: JSON.stringify({ name: 'Account1' }),
              },
            ];

        mockQueryDynamoDBTable.mockResolvedValue(tableData);

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
        mockQueryDynamoDBTable.mockResolvedValue([testCase.data]);

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
          return callCount === 1 ? '111111111111' : null; // First call returns value, second returns null
        },
        acceleratorKey: 'account1@example.com',
        dataType: 'mandatoryAccount',
        dataBag: JSON.stringify({ name: 'Account1' }),
      };

      mockQueryDynamoDBTable.mockResolvedValue([mockItem]);

      await expect(
        getOrganizationAccountsFromSourceTable({
          client: new DynamoDBClient({}),
          organizationsDataSource: MOCK_CONSTANTS.organizationsDataSource,
          logPrefix: MOCK_CONSTANTS.logPrefix,
        }),
      ).rejects.toThrow("Missing required field 'awsKey' for account item in source table, unable to get account id");
    });
  });
});

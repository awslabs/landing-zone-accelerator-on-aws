import { describe, test, expect } from '@jest/globals';
import { AccountConfig, AccountsConfig } from '../../lib/accounts-config';
import { AccountsConfigValidator } from '../../validator/accounts-config-validator';
import { OrganizationalUnitConfig, OrganizationConfig } from '../../lib/organization-config';

describe('AccountsValidator', () => {
  const mockOrganizationConfig: Partial<OrganizationConfig> = {
    enable: true,
    organizationalUnits: [
      {
        name: 'Security',
      } as OrganizationalUnitConfig,
      {
        name: 'Infrastructure',
      } as OrganizationalUnitConfig,
      {
        name: 'Suspended',
        ignore: true,
      } as OrganizationalUnitConfig,
    ],
    serviceControlPolicies: [],
    taggingPolicies: [],
    chatbotPolicies: [],
    backupPolicies: [],
  };

  test('account without OU', () => {
    const mockAccountsConfiguration: Partial<AccountsConfig> = {
      mandatoryAccounts: [
        {
          name: 'Management',
          description: 'mockManagement',
          email: 'mockManagement@example.com',
          organizationalUnit: 'Root',
        },
        {
          name: 'LogArchive',
          description: 'mockLogArchive',
          email: 'mockLogArchive@example.com',
          organizationalUnit: 'Security',
        },
        {
          name: 'Audit',
          description: 'mockAudit',
          email: 'mockAudit@example.com',
          organizationalUnit: 'Security',
        },
      ] as AccountConfig[],
      workloadAccounts: [
        {
          name: 'SharedServices',
          description: 'mockSharedServices',
          email: 'mockSharedServices@example.com',
        },
      ] as AccountConfig[],
      accountIds: [
        {
          email: 'mockAccount1@example.com',
          accountId: '111111111111',
          status: 'ACTIVE',
          orgsApiResponse: {},
        },
        {
          email: 'mockAccount2@example.com',
          accountId: '222222222222',
          status: 'ACTIVE',
          orgsApiResponse: {},
        },
      ],
    };

    expect(
      () =>
        new AccountsConfigValidator(
          mockAccountsConfiguration as AccountsConfig,
          mockOrganizationConfig as OrganizationConfig,
        ),
    ).toThrow('Organizational Unit not defined for account SharedServices');
  });
});

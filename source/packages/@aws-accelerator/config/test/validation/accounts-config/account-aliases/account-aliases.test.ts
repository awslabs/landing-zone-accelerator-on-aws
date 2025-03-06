import { AccountsConfigValidator } from '../../../../validator/accounts-config-validator';
import { OrganizationConfig } from '../../../../lib/organization-config';
import { AccountsConfig } from '../../../../lib/accounts-config';
import { describe, it, expect } from '@jest/globals';
import * as path from 'path';

describe('AccountsConfigValidator', () => {
  const accountsDuplicateAliases = AccountsConfig.load(
    path.resolve('./test/validation/accounts-config/account-aliases/duplicate-config'),
  );
  const accountsNoDuplicateAliases = AccountsConfig.load(
    path.resolve('./test/validation/accounts-config/account-aliases/no-duplicate-config'),
  );
  const organization = OrganizationConfig.load(
    path.resolve('./test/validation/accounts-config/account-aliases/duplicate-config'),
  );

  it('should throw error when duplicate aliases are found', () => {
    const errMsg = `Workload Account alias "tenant-alias" is duplicated. Account aliases must be unique across all accounts.`;
    expect(() => {
      new AccountsConfigValidator(accountsDuplicateAliases, organization);
    }).toThrow(errMsg);
  });

  it('should validate unique aliases successfully', () => {
    expect(() => {
      new AccountsConfigValidator(accountsNoDuplicateAliases, organization);
    }).not.toThrow();
  });

  it('should throw error for invalid alias format', () => {
    const accountsInvalidAlias = new AccountsConfig(
      {
        managementAccountEmail: 'alias+root@example.com',
        logArchiveAccountEmail: 'alias+log@example.com',
        auditAccountEmail: 'alias+audit@example.com',
      },
      {
        mandatoryAccounts: [
          {
            name: 'Management',
            email: 'alias+root@example.com',
            accountAlias: 'Invalid-Alias-With-Uppercase',
          },
          {
            name: 'LogArchive',
            email: 'alias+log@example.com',
          },
          {
            name: 'Audit',
            email: 'alias+audit@example.com',
          },
        ],
        workloadAccounts: [],
        accountIds: [],
      },
    );
    const errMsg =
      `Account alias "Invalid-Alias-With-Uppercase" is invalid. Aliases must be between 3 and 63 characters long, ` +
      `contain only lowercase letters, numbers, and hyphens, and must start and end with a letter or number.`;
    expect(() => {
      new AccountsConfigValidator(accountsInvalidAlias, organization);
    }).toThrow(errMsg);
  });

  it('should pass valid alias format', () => {
    const accountsValidAlias = new AccountsConfig(
      {
        managementAccountEmail: 'alias+root@example.com',
        logArchiveAccountEmail: 'alias+log@example.com',
        auditAccountEmail: 'alias+audit@example.com',
      },
      {
        mandatoryAccounts: [
          {
            name: 'Management',
            email: 'alias+root@example.com',
            accountAlias: 'valid-alias',
          },
          {
            name: 'LogArchive',
            email: 'alias+log@example.com',
          },
          {
            name: 'Audit',
            email: 'alias+audit@example.com',
          },
        ],
        workloadAccounts: [],
        accountIds: [],
      },
    );
    expect(() => {
      new AccountsConfigValidator(accountsValidAlias, organization);
    }).not.toThrow();
  });
});

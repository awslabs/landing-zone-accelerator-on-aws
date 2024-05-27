import { AccountsConfigValidator } from '../../../../validator/accounts-config-validator';
import { OrganizationConfig } from '../../../../lib/organization-config';
import { AccountsConfig } from '../../../../lib/accounts-config';
import { describe, it, expect } from '@jest/globals';
import * as path from 'path';

// it should throw error when duplicate emails are found
describe('AccountsConfigValidator', () => {
  it('should throw error when duplicate emails are found', () => {
    const loadedAccounts = AccountsConfig.load(
      path.resolve('./test/validation/accounts-config/duplicate-emails/no-org-config'),
    );
    const loadedOus = OrganizationConfig.load(
      path.resolve('./test/validation/accounts-config/duplicate-emails/no-org-config'),
    );
    function duplicateEmailError() {
      new AccountsConfigValidator(loadedAccounts, loadedOus);
    }
    const errMsg = `accounts-config.yaml has 1 issues:\nDuplicate email: alias+no-org-tenant01@example.com, associated with multiple accounts: Tenant01, Tenant01Duplicate`;
    expect(duplicateEmailError).toThrow(new Error(errMsg));
  });
});

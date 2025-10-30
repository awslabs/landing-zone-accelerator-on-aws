import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccountConfig, AccountsConfig } from '../../lib/accounts-config';
import { AccountsConfigValidator } from '../../validator/accounts-config-validator';
import { OrganizationalUnitConfig, OrganizationConfig } from '../../lib/organization-config';

describe('AccountsConfigValidator', () => {
  let validateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    validateSpy = vi.spyOn(AccountsConfigValidator.prototype, 'validate');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'];
  });

  // Helper functions
  const createMockOrganizationConfig = (customOUs?: OrganizationalUnitConfig[]): OrganizationConfig => {
    const mockConfig = {
      enable: true,
      organizationalUnits: customOUs || [
        { name: 'Security' } as OrganizationalUnitConfig,
        { name: 'Infrastructure' } as OrganizationalUnitConfig,
        { name: 'Suspended', ignore: true } as OrganizationalUnitConfig,
      ],
      serviceControlPolicies: [],
      taggingPolicies: [],
      chatbotPolicies: [],
      backupPolicies: [],
    };
    return mockConfig as unknown as OrganizationConfig;
  };

  const createMockAccountConfig = (overrides: Partial<AccountConfig> = {}): AccountConfig =>
    ({
      name: 'TestAccount',
      description: 'Test Account Description',
      email: 'test@example.com',
      organizationalUnit: 'Security',
      ...overrides,
    }) as AccountConfig;

  const createValidAccountsConfig = (overrides: Partial<AccountsConfig> = {}): AccountsConfig =>
    ({
      mandatoryAccounts: [
        createMockAccountConfig({
          name: 'Management',
          email: 'management-valid@example.com',
          organizationalUnit: 'Root',
        }),
        createMockAccountConfig({ name: 'LogArchive', email: 'logarchive-valid@example.com' }),
        createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
      ],
      workloadAccounts: [],
      accountIds: [],
      ...overrides,
    }) as AccountsConfig;

  describe('constructor', () => {
    test('should call validate method when explicitly called', () => {
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      new AccountsConfigValidator(accountsConfig, orgConfig).validate();

      expect(validateSpy).toHaveBeenCalledWith();
    });
  });

  describe('validate', () => {
    test('should pass validation with valid configuration', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).not.toThrow();
    });

    test('should throw error when validation fails', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [createMockAccountConfig({ name: 'Management', email: 'invalid-email' })],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow();
    });
  });

  describe('validateAccountAliases - additional coverage', () => {
    test('should handle workload account alias duplicates', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({
            name: 'WorkloadAccount1',
            email: 'workload1@example.com',
            accountAlias: 'duplicate-workload-alias',
          }),
          createMockAccountConfig({
            name: 'WorkloadAccount2',
            email: 'workload2@example.com',
            accountAlias: 'duplicate-workload-alias',
          }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Workload Account alias "duplicate-workload-alias" is duplicated',
      );
    });

    test('should handle mixed mandatory and workload account alias duplicates', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({
            name: 'Management',
            email: 'management-valid@example.com',
            organizationalUnit: 'Root',
            accountAlias: 'mixed-duplicate',
          }),
          createMockAccountConfig({ name: 'LogArchive', email: 'logarchive-valid@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
        ],
        workloadAccounts: [
          createMockAccountConfig({
            name: 'WorkloadAccount',
            email: 'workload@example.com',
            accountAlias: 'mixed-duplicate',
          }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'alias "mixed-duplicate" is duplicated',
      );
    });

    test('should handle alias that is exactly 3 characters (minimum valid length)', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({
            name: 'Management',
            email: 'management-valid@example.com',
            organizationalUnit: 'Root',
            accountAlias: 'abc',
          }),
          createMockAccountConfig({ name: 'LogArchive', email: 'logarchive-valid@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).not.toThrow();
    });

    test('should handle alias that is exactly 63 characters (maximum valid length)', () => {
      validateSpy.mockRestore();
      const longValidAlias = 'a' + '0'.repeat(61) + 'z'; // 63 characters: a + 61 zeros + z
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({
            name: 'Management',
            email: 'management-valid@example.com',
            organizationalUnit: 'Root',
            accountAlias: longValidAlias,
          }),
          createMockAccountConfig({ name: 'LogArchive', email: 'logarchive-valid@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).not.toThrow();
    });

    test('should fail with alias that is too long (64 characters)', () => {
      validateSpy.mockRestore();
      const tooLongAlias = 'a' + '0'.repeat(62) + 'z'; // 64 characters
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({
            name: 'Management',
            email: 'management-valid@example.com',
            organizationalUnit: 'Root',
            accountAlias: tooLongAlias,
          }),
          createMockAccountConfig({ name: 'LogArchive', email: 'logarchive-valid@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        `Account alias "${tooLongAlias}" is invalid`,
      );
    });

    test('should handle null/undefined accounts arrays gracefully', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [],
        workloadAccounts: [],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Unable to find mandatory account',
      );
    });
  });

  describe('validateEmails - additional coverage', () => {
    test('should handle all three default emails', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({ name: 'Management', email: 'log-archive@example.com', organizationalUnit: 'Root' }),
          createMockAccountConfig({ name: 'LogArchive', email: 'logarchive-valid@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Default email (log-archive@example.com) found',
      );
    });

    test('should handle single account mode with false string value', () => {
      process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] = 'false';
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({ name: 'Account1', email: 'duplicate@example.com' }),
          createMockAccountConfig({ name: 'Account2', email: 'duplicate@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Duplicate email: duplicate@example.com',
      );
    });

    test('should handle single account mode with undefined environment variable', () => {
      delete process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'];
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({ name: 'Account1', email: 'duplicate@example.com' }),
          createMockAccountConfig({ name: 'Account2', email: 'duplicate@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Duplicate email: duplicate@example.com',
      );
    });
  });

  describe('findDuplicateEmails - additional coverage', () => {
    test('should handle case where first occurrence is not flagged as duplicate', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({ name: 'Management', email: 'unique1@example.com', organizationalUnit: 'Root' }),
          createMockAccountConfig({ name: 'LogArchive', email: 'unique2@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'unique3@example.com' }),
        ],
        workloadAccounts: [
          createMockAccountConfig({ name: 'FirstAccount', email: 'test@example.com' }),
          createMockAccountConfig({ name: 'SecondAccount', email: 'test@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Duplicate email: test@example.com, associated with multiple accounts: FirstAccount, SecondAccount',
      );
    });
  });

  describe('validateAccountNames - additional coverage', () => {
    test('should handle account name with space at the beginning', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [createMockAccountConfig({ name: ' AccountWithLeadingSpace' })],
      });
      const orgConfig = createMockOrganizationConfig();

      // Leading spaces are not caught by the current validator logic (indexOf(' ') > 0)
      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).not.toThrow();
    });

    test('should handle account name with multiple spaces', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [createMockAccountConfig({ name: 'Account With Multiple Spaces' })],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Account name (Account With Multiple Spaces) found with spaces',
      );
    });
  });

  describe('edge cases and error combinations', () => {
    test('should accumulate multiple validation errors', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({ name: 'Management', email: 'invalid-email', accountAlias: 'ab' }),
          createMockAccountConfig({ name: 'LogArchive With Spaces', email: 'duplicate@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'duplicate@example.com' }),
        ],
        workloadAccounts: [createMockAccountConfig({ name: 'TestAccount', organizationalUnit: 'NonExistent' })],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow();
    });

    test('should handle empty accounts arrays', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [],
        workloadAccounts: [],
      });
      const orgConfig = createMockOrganizationConfig();

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'Unable to find mandatory account',
      );
    });

    test('should handle organization config with no OUs', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig([]);

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow(
        'does not exist in organization-config.yaml file',
      );
    });

    test('should handle empty organizational units array', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig([]);

      expect(() => new AccountsConfigValidator(accountsConfig, orgConfig).validate()).toThrow();
    });
  });

  describe('getOuIdNames', () => {
    test('should return list of OU names from organization config', () => {
      validateSpy.mockRestore();
      const orgConfig = createMockOrganizationConfig([
        { name: 'Security' } as OrganizationalUnitConfig,
        { name: 'Infrastructure' } as OrganizationalUnitConfig,
        { name: 'Development' } as OrganizationalUnitConfig,
      ]);
      const accountsConfig = createValidAccountsConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const ouNames = validator['getOuIdNames']();

      expect(ouNames).toEqual(['Security', 'Infrastructure', 'Development']);
    });

    test('should return empty array when no OUs are defined', () => {
      validateSpy.mockRestore();
      const orgConfig = createMockOrganizationConfig([]);
      const accountsConfig = createValidAccountsConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const ouNames = validator['getOuIdNames']();

      expect(ouNames).toEqual([]);
    });
  });

  describe('validateAccountOrganizationalUnit', () => {
    test('should return no errors for valid OUs', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountOrganizationalUnit']();

      expect(errors).toHaveLength(0);
    });

    test('should return error for missing OU', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [createMockAccountConfig({ name: 'TestAccount', organizationalUnit: undefined })],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountOrganizationalUnit']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Organizational Unit not defined for account TestAccount');
    });

    test('should return error for non-existent OU', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [createMockAccountConfig({ name: 'TestAccount', organizationalUnit: 'NonExistent' })],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountOrganizationalUnit']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('OU NonExistent for account TestAccount does not exist');
    });

    test('should return error for ignored OU', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [createMockAccountConfig({ name: 'TestAccount', organizationalUnit: 'Suspended' })],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountOrganizationalUnit']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('OU Suspended for account TestAccount is ignored');
    });
  });

  describe('validateMandatoryAccountNames', () => {
    test('should return no errors when all mandatory accounts are present', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateMandatoryAccountNames']();

      expect(errors).toHaveLength(0);
    });

    test('should return error for missing Management account', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({ name: 'LogArchive' }),
          createMockAccountConfig({ name: 'Audit' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateMandatoryAccountNames']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Unable to find mandatory account with name Management');
    });

    test('should return multiple errors for multiple missing accounts', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [createMockAccountConfig({ name: 'Management' })],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateMandatoryAccountNames']();

      expect(errors).toHaveLength(2);
      expect(errors.some(error => error.includes('Unable to find mandatory account with name LogArchive'))).toBe(true);
      expect(errors.some(error => error.includes('Unable to find mandatory account with name Audit'))).toBe(true);
    });
  });

  describe('validateAccountNames', () => {
    test('should return no errors for unique account names without spaces', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountNames']();

      expect(errors).toHaveLength(0);
    });

    test('should return error for duplicate account names', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({ name: 'DuplicateName', email: 'test1@example.com' }),
          createMockAccountConfig({ name: 'DuplicateName', email: 'test2@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountNames']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Duplicate account names defined');
    });

    test('should return error for account names with spaces', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [createMockAccountConfig({ name: 'Account With Spaces' })],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountNames']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Account name (Account With Spaces) found with spaces');
    });
  });

  describe('validateEmails', () => {
    test('should return no errors for valid unique emails', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateEmails']();

      expect(errors).toHaveLength(0);
    });

    test('should return error for invalid email format', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [createMockAccountConfig({ email: 'invalid-email' })],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateEmails']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Invalid email invalid-email');
    });

    test('should return error for default email addresses', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({ name: 'Management', email: 'management-account@example.com' }),
          createMockAccountConfig({ name: 'LogArchive', email: 'logarchive@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'audit@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateEmails']();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(error => error.includes('Default email (management-account@example.com) found'))).toBe(true);
    });

    test('should return error for duplicate emails in multi-account mode', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({ name: 'Account1', email: 'duplicate@example.com' }),
          createMockAccountConfig({ name: 'Account2', email: 'duplicate@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateEmails']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Duplicate email: duplicate@example.com');
    });

    test('should return no errors for duplicate emails in single account mode', () => {
      process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] = 'true';
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({ name: 'Account1', email: 'duplicate@example.com' }),
          createMockAccountConfig({ name: 'Account2', email: 'duplicate@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateEmails']();

      expect(errors).toHaveLength(0);
    });
  });

  describe('validateAccountAliases', () => {
    test('should return no errors for valid unique aliases', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({
            name: 'Management',
            email: 'management-valid@example.com',
            organizationalUnit: 'Root',
            accountAlias: 'mgmt-account',
          }),
          createMockAccountConfig({
            name: 'LogArchive',
            email: 'logarchive-valid@example.com',
            accountAlias: 'log-archive',
          }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com', accountAlias: 'audit-account' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountAliases']();

      expect(errors).toHaveLength(0);
    });

    test('should return error for duplicate aliases', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({
            name: 'Management',
            email: 'management-valid@example.com',
            organizationalUnit: 'Root',
            accountAlias: 'duplicate-alias',
          }),
          createMockAccountConfig({
            name: 'LogArchive',
            email: 'logarchive-valid@example.com',
            accountAlias: 'duplicate-alias',
          }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountAliases']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('alias "duplicate-alias" is duplicated');
    });

    test('should return error for invalid alias format', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        mandatoryAccounts: [
          createMockAccountConfig({
            name: 'Management',
            email: 'management-valid@example.com',
            organizationalUnit: 'Root',
            accountAlias: 'Invalid-Alias',
          }),
          createMockAccountConfig({ name: 'LogArchive', email: 'logarchive-valid@example.com' }),
          createMockAccountConfig({ name: 'Audit', email: 'audit-valid@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountAliases']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Account alias "Invalid-Alias" is invalid');
    });

    test('should return no errors when no aliases are defined', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['validateAccountAliases']();

      expect(errors).toHaveLength(0);
    });
  });

  describe('findDuplicateEmails', () => {
    test('should return no errors when no duplicate emails exist', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig();
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['findDuplicateEmails']();

      expect(errors).toHaveLength(0);
    });

    test('should return error with account names for duplicate emails', () => {
      validateSpy.mockRestore();
      const accountsConfig = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({ name: 'FirstAccount', email: 'duplicate@example.com' }),
          createMockAccountConfig({ name: 'SecondAccount', email: 'duplicate@example.com' }),
        ],
      });
      const orgConfig = createMockOrganizationConfig();

      const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
      const errors = validator['findDuplicateEmails']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Duplicate email: duplicate@example.com');
      expect(errors[0]).toContain('FirstAccount, SecondAccount');
    });
  });
});

import { expect, describe, it } from '@jest/globals';
import { AccountsConfig } from '@aws-accelerator/config';
import { policyReplacements } from '../lib/policy-replacements';

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

const acceleratorPrefix = 'aws-accelerator';
const managementAccountAccessRole = 'AcceleratorAccessRole';
const partition = 'aws';
const acceleratorName = 'AWS-Accelerator';
const additionalReplacements = {
  '\\${ADDITIONAL_REPLACEMENT}': 'replaced-value',
};

const accountsConfig = new AccountsConfig(
  {
    managementAccountEmail: 'some-management-account@example.com',
    logArchiveAccountEmail: 'some-logarchive-account@example.com',
    auditAccountEmail: 'some-audit-account@example.com',
  },
  accountsConfigObject,
);

describe('ACCOUNT_ID lookup test ', () => {
  it('should throw an error when accountsConfig is missing', () => {
    const content = '${ACCEL_LOOKUP::ACCOUNT_ID:ORG}';

    expect(() =>
      policyReplacements({
        content,
        acceleratorPrefix,
        managementAccountAccessRole,
        partition,
        additionalReplacements,
        acceleratorName,
      }),
    ).toThrow('Missing accountConfig for policy statement with ACCOUNT parameters');
  });

  it('should return all account IDs for ORG scope', () => {
    const content = '${ACCEL_LOOKUP::ACCOUNT_ID:ORG}';
    const result = policyReplacements({
      content,
      acceleratorPrefix,
      managementAccountAccessRole,
      partition,
      additionalReplacements,
      acceleratorName,
      accountsConfig,
    });
    expect(result).toBe('"111111111111","222222222222","333333333333","444444444444","555555555555"');
  });

  it('should return account ID for Network Account', () => {
    const content = '${ACCEL_LOOKUP::ACCOUNT_ID:ACCOUNT:Network}';
    const result = policyReplacements({
      content,
      acceleratorPrefix,
      managementAccountAccessRole,
      partition,
      additionalReplacements,
      acceleratorName,
      accountsConfig,
    });
    expect(result).toBe('"555555555555"');
  });

  it('should return all account IDs for Infrastructure OU', () => {
    const content = '${ACCEL_LOOKUP::ACCOUNT_ID:OU:Infrastructure}';
    const result = policyReplacements({
      content,
      acceleratorPrefix,
      managementAccountAccessRole,
      partition,
      additionalReplacements,
      acceleratorName,
      accountsConfig,
    });
    expect(result).toBe('"444444444444","555555555555"');
  });

  it('should replace all the occurrences of Network ACCOUNT_ID LOOKUP in the content', () => {
    const content = '${ACCEL_LOOKUP::ACCOUNT_ID:ACCOUNT:Network}\n${ACCEL_LOOKUP::ACCOUNT_ID:ACCOUNT:Network}';
    const result = policyReplacements({
      content,
      acceleratorPrefix,
      managementAccountAccessRole,
      partition,
      additionalReplacements,
      acceleratorName,
      accountsConfig,
    });
    expect(result).toBe(`"555555555555"
"555555555555"`);
  });
});

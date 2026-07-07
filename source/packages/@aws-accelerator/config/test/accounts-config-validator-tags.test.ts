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

import { describe, it, expect } from 'vitest';
import { AccountConfig, AccountsConfig } from '../lib/accounts-config';
import { AccountsConfigValidator } from '../validator/accounts-config-validator';
import { OrganizationalUnitConfig, OrganizationConfig } from '../lib/organization-config';
import { randomInt, randomString, randomValidTagKey, randomValidTagArray } from './tag-generators';

type InvalidTagScenario = 'keyTooLong' | 'valueTooLong' | 'tooManyTags' | 'duplicateKey' | 'emptyKey' | 'awsPrefix';

function randomInvalidTagArray(): { tags: Array<{ key: string; value: string }>; scenario: InvalidTagScenario } {
  const scenarios: InvalidTagScenario[] = [
    'keyTooLong',
    'valueTooLong',
    'tooManyTags',
    'duplicateKey',
    'emptyKey',
    'awsPrefix',
  ];
  const scenario = scenarios[randomInt(0, scenarios.length - 1)];

  switch (scenario) {
    case 'keyTooLong': {
      const tags = randomValidTagArray(5);
      tags.push({ key: randomString(129, 200), value: randomString(0, 50) });
      return { tags, scenario };
    }
    case 'valueTooLong': {
      const tags = randomValidTagArray(5);
      tags.push({ key: randomValidTagKey(), value: randomString(257, 400) });
      return { tags, scenario };
    }
    case 'tooManyTags': {
      const count = randomInt(51, 60);
      const tags: Array<{ key: string; value: string }> = [];
      for (let i = 0; i < count; i++) {
        tags.push({ key: `tag-key-${i}`, value: `val-${i}` });
      }
      return { tags, scenario };
    }
    case 'duplicateKey': {
      const dupKey = randomValidTagKey();
      return {
        tags: [
          { key: dupKey, value: 'a' },
          { key: dupKey, value: 'b' },
        ],
        scenario,
      };
    }
    case 'emptyKey':
      return { tags: [{ key: '', value: 'some-value' }], scenario };
    case 'awsPrefix':
      return { tags: [{ key: `aws:${randomString(1, 10)}`, value: 'val' }], scenario };
  }
}

const createMockOrganizationConfig = (): OrganizationConfig =>
  ({
    enable: true,
    organizationalUnits: [
      { name: 'Security' } as OrganizationalUnitConfig,
      { name: 'Workloads' } as OrganizationalUnitConfig,
    ],
    serviceControlPolicies: [],
    taggingPolicies: [],
    chatbotPolicies: [],
    backupPolicies: [],
  }) as unknown as OrganizationConfig;

const createMockAccountConfig = (overrides: Partial<AccountConfig> = {}): AccountConfig =>
  ({
    name: 'TestAccount',
    description: 'Test',
    email: 'test@example.com',
    organizationalUnit: 'Security',
    ...overrides,
  }) as AccountConfig;

const createValidAccountsConfig = (overrides: Partial<AccountsConfig> = {}): AccountsConfig =>
  ({
    mandatoryAccounts: [
      createMockAccountConfig({ name: 'Management', email: 'mgmt@example.com', organizationalUnit: 'Root' }),
      createMockAccountConfig({ name: 'LogArchive', email: 'log@example.com' }),
      createMockAccountConfig({ name: 'Audit', email: 'audit@example.com' }),
    ],
    workloadAccounts: [],
    accountIds: [],
    ...overrides,
  }) as AccountsConfig;

function callValidateAccountTags(accountsConfig: AccountsConfig): string[] {
  const orgConfig = createMockOrganizationConfig();
  const validator = new AccountsConfigValidator(accountsConfig, orgConfig);
  return validator['validateAccountTags']();
}

// Feature: lza-account-tags, Property 3: Validator rejects tags violating AWS constraints
describe('Property 3: Validator rejects tags violating AWS constraints', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
   */
  it('should report at least one error for any tag constraint violation across 100 iterations', () => {
    for (let i = 0; i < 100; i++) {
      const { tags } = randomInvalidTagArray();
      const config = createValidAccountsConfig({
        workloadAccounts: [
          createMockAccountConfig({
            name: 'WorkloadWithBadTags',
            email: 'wl@example.com',
            organizationalUnit: 'Workloads',
            tags,
          } as Partial<AccountConfig>),
        ],
      });

      const errors = callValidateAccountTags(config);
      expect(errors.length).toBeGreaterThan(0);
    }
  });
});

describe('validateAccountTags unit tests', () => {
  it('should pass with empty tags array', () => {
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags: [],
        } as Partial<AccountConfig>),
      ],
    });
    expect(callValidateAccountTags(config)).toHaveLength(0);
  });

  it('should pass with exactly 50 tags', () => {
    const tags = Array.from({ length: 50 }, (_, i) => ({ key: `key-${i}`, value: `val-${i}` }));
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    expect(callValidateAccountTags(config)).toHaveLength(0);
  });

  it('should fail with 51 tags', () => {
    const tags = Array.from({ length: 51 }, (_, i) => ({ key: `key-${i}`, value: `val-${i}` }));
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    const errors = callValidateAccountTags(config);
    expect(errors.some(e => e.includes('exceeding the AWS limit of 50'))).toBe(true);
  });

  it('should pass with key exactly 128 chars', () => {
    const tags = [{ key: 'a'.repeat(128), value: 'val' }];
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    expect(callValidateAccountTags(config)).toHaveLength(0);
  });

  it('should fail with key of 129 chars', () => {
    const tags = [{ key: 'a'.repeat(129), value: 'val' }];
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    const errors = callValidateAccountTags(config);
    expect(errors.some(e => e.includes('exceeding 128 characters'))).toBe(true);
  });

  it('should pass with value exactly 256 chars', () => {
    const tags = [{ key: 'mykey', value: 'v'.repeat(256) }];
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    expect(callValidateAccountTags(config)).toHaveLength(0);
  });

  it('should fail with value of 257 chars', () => {
    const tags = [{ key: 'mykey', value: 'v'.repeat(257) }];
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    const errors = callValidateAccountTags(config);
    expect(errors.some(e => e.includes('exceeding 256 characters'))).toBe(true);
  });

  it('should reject empty key string', () => {
    const tags = [{ key: '', value: 'val' }];
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    const errors = callValidateAccountTags(config);
    expect(errors.some(e => e.includes('empty key'))).toBe(true);
  });

  it('should reject aws: prefix', () => {
    const tags = [{ key: 'aws:reserved', value: 'val' }];
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    const errors = callValidateAccountTags(config);
    expect(errors.some(e => e.includes('reserved "aws:" prefix'))).toBe(true);
  });

  it('should reject duplicate keys', () => {
    const tags = [
      { key: 'dup', value: 'a' },
      { key: 'dup', value: 'b' },
    ];
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({
          name: 'Wl',
          email: 'wl@example.com',
          organizationalUnit: 'Workloads',
          tags,
        } as Partial<AccountConfig>),
      ],
    });
    const errors = callValidateAccountTags(config);
    expect(errors.some(e => e.includes('duplicate tag key'))).toBe(true);
  });

  it('should validate tags on mandatory accounts too', () => {
    const tags = [{ key: '', value: 'val' }];
    const config = createValidAccountsConfig({
      mandatoryAccounts: [
        createMockAccountConfig({
          name: 'Management',
          email: 'mgmt@example.com',
          organizationalUnit: 'Root',
          tags,
        } as Partial<AccountConfig>),
        createMockAccountConfig({ name: 'LogArchive', email: 'log@example.com' }),
        createMockAccountConfig({ name: 'Audit', email: 'audit@example.com' }),
      ],
    });
    const errors = callValidateAccountTags(config);
    expect(errors.some(e => e.includes('Management') && e.includes('empty key'))).toBe(true);
  });

  it('should pass when tags is undefined (omitted)', () => {
    const config = createValidAccountsConfig({
      workloadAccounts: [
        createMockAccountConfig({ name: 'Wl', email: 'wl@example.com', organizationalUnit: 'Workloads' }),
      ],
    });
    expect(callValidateAccountTags(config)).toHaveLength(0);
  });
});

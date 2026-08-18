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

import { describe, test, expect } from 'vitest';
import { AccountConfig, AccountsConfig } from '../../lib/accounts-config';
import { CustomizationsConfig } from '../../lib/customizations-config';
import { GlobalConfig } from '../../lib/global-config';
import { IamConfig } from '../../lib/iam-config';
import { NetworkConfig } from '../../lib/network-config';
import { OrganizationConfig } from '../../lib/organization-config';
import { SecurityConfig } from '../../lib/security-config';
import { AccountReferenceValidator } from '../../validator/account-reference-validator';

const VALID_ACCOUNTS = ['Management', 'LogArchive', 'Audit', 'Workload'];

function makeAccountsConfig(): AccountsConfig {
  return {
    mandatoryAccounts: VALID_ACCOUNTS.slice(0, 3).map(
      name =>
        ({
          name,
          email: `${name.toLowerCase()}@example.com`,
          organizationalUnit: name === 'Management' ? 'Root' : 'Security',
        }) as AccountConfig,
    ),
    workloadAccounts: [
      {
        name: 'Workload',
        email: 'workload@example.com',
        organizationalUnit: 'Infrastructure',
      } as AccountConfig,
    ],
    accountIds: [],
  } as unknown as AccountsConfig;
}

describe('AccountReferenceValidator', () => {
  test('passes when no configs reference an unknown account', () => {
    const accounts = makeAccountsConfig();
    expect(() => new AccountReferenceValidator(accounts).validate()).not.toThrow();
  });

  test('flags dangling reference in deploymentTargets.accounts', () => {
    const accounts = makeAccountsConfig();
    const globalConfig = {
      reports: {
        budgets: [{ deploymentTargets: { accounts: ['DeletedAccount'] } }],
      },
    } as unknown as GlobalConfig;

    expect(() => new AccountReferenceValidator(accounts, globalConfig).validate()).toThrow(
      /global-config\.yaml.*DeletedAccount/s,
    );
  });

  test('flags dangling reference in deploymentTargets.excludedAccounts', () => {
    const accounts = makeAccountsConfig();
    const globalConfig = {
      reports: {
        budgets: [{ deploymentTargets: { accounts: ['Management'], excludedAccounts: ['Removed'] } }],
      },
    } as unknown as GlobalConfig;

    expect(() => new AccountReferenceValidator(accounts, globalConfig).validate()).toThrow(/Removed/);
  });

  test('flags an unknown Tag Policy account target in organization-config', () => {
    const accounts = makeAccountsConfig();
    const organizationConfig = new OrganizationConfig({
      enable: true,
      organizationalUnits: [],
      serviceControlPolicies: [],
      taggingPolicies: [
        {
          name: 'TagPolicy',
          description: 'Test tag policy',
          policy: 'tag-policy.json',
          deploymentTargets: { accounts: ['DeletedAccount'] },
        },
      ],
      backupPolicies: [],
    });

    expect(() =>
      new AccountReferenceValidator(
        accounts,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        organizationConfig,
      ).validate(),
    ).toThrow(/organization-config\.yaml.*taggingPolicies\[0\].*accounts\[0\].*DeletedAccount/s);
  });

  test('flags an unknown Backup Policy excluded account in organization-config', () => {
    const accounts = makeAccountsConfig();
    const organizationConfig = new OrganizationConfig({
      enable: true,
      organizationalUnits: [],
      serviceControlPolicies: [],
      taggingPolicies: [],
      backupPolicies: [
        {
          name: 'BackupPolicy',
          description: 'Test backup policy',
          policy: 'backup-policy.json',
          deploymentTargets: {
            accounts: ['Workload'],
            excludedAccounts: ['RemovedAccount'],
          },
        },
      ],
    });

    expect(() =>
      new AccountReferenceValidator(
        accounts,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        organizationConfig,
      ).validate(),
    ).toThrow(/organization-config\.yaml.*backupPolicies\[0\].*excludedAccounts\[0\].*RemovedAccount/s);
  });

  test('flags dangling reference in shareTargets.accounts', () => {
    const accounts = makeAccountsConfig();
    const networkConfig = {
      transitGateways: [{ shareTargets: { accounts: ['StaleAccount'] } }],
    } as unknown as NetworkConfig;

    expect(() => new AccountReferenceValidator(accounts, undefined, undefined, networkConfig).validate()).toThrow(
      /network-config\.yaml.*StaleAccount/s,
    );
  });

  test('flags dangling reference in singular account field', () => {
    const accounts = makeAccountsConfig();
    const networkConfig = {
      vpcs: [
        { name: 'GoodVpc', account: 'Workload' },
        { name: 'BadVpc', account: 'GoneAccount' },
      ],
    } as unknown as NetworkConfig;

    expect(() => new AccountReferenceValidator(accounts, undefined, undefined, networkConfig).validate()).toThrow(
      /vpcs\[1\]\.account.*GoneAccount/s,
    );
  });

  test('flags dangling reference in cloudWatchLogs.exclusions[].accounts', () => {
    const accounts = makeAccountsConfig();
    const globalConfig = {
      logging: {
        account: 'LogArchive',
        cloudwatchLogs: {
          exclusions: [{ accounts: ['Workload', 'StaleExclusion'] }],
        },
      },
    } as unknown as GlobalConfig;

    expect(() => new AccountReferenceValidator(accounts, globalConfig).validate()).toThrow(/StaleExclusion/);
  });

  test('flags dangling reference in security delegatedAdminAccount', () => {
    const accounts = makeAccountsConfig();
    const securityConfig = {
      centralSecurityServices: { delegatedAdminAccount: 'DeletedAuditAccount' },
    } as unknown as SecurityConfig;

    expect(() =>
      new AccountReferenceValidator(accounts, undefined, undefined, undefined, securityConfig).validate(),
    ).toThrow(/security-config\.yaml.*delegatedAdminAccount.*DeletedAuditAccount/s);
  });

  test('flags dangling reference in iam managed AD account', () => {
    const accounts = makeAccountsConfig();
    const iamConfig = {
      managedActiveDirectories: [{ name: 'main-ad', account: 'NoSuchAccount' }],
    } as unknown as IamConfig;

    expect(() => new AccountReferenceValidator(accounts, undefined, iamConfig).validate()).toThrow(
      /iam-config\.yaml.*NoSuchAccount/s,
    );
  });

  test('flags dangling reference in customizations portfolio account', () => {
    const accounts = makeAccountsConfig();
    const customizationsConfig = {
      customizations: {
        serviceCatalogPortfolios: [{ name: 'p1', account: 'NotInAccountsConfig' }],
      },
    } as unknown as CustomizationsConfig;

    expect(() =>
      new AccountReferenceValidator(
        accounts,
        undefined,
        undefined,
        undefined,
        undefined,
        customizationsConfig,
      ).validate(),
    ).toThrow(/customizations-config\.yaml.*NotInAccountsConfig/s);
  });

  test('aggregates multiple errors into a single thrown error', () => {
    const accounts = makeAccountsConfig();
    const globalConfig = {
      reports: { budgets: [{ deploymentTargets: { accounts: ['Bad1', 'Bad2'] } }] },
    } as unknown as GlobalConfig;

    expect(() => new AccountReferenceValidator(accounts, globalConfig).validate()).toThrow(
      /found 2 dangling reference\(s\)/,
    );
  });

  test('ignores empty strings', () => {
    const accounts = makeAccountsConfig();
    const networkConfig = {
      gwlbs: [{ name: 'optional-gwlb', account: '' }],
    } as unknown as NetworkConfig;

    expect(() => new AccountReferenceValidator(accounts, undefined, undefined, networkConfig).validate()).not.toThrow();
  });

  test('flags dangling reference in DX virtual interface ownerAccount', () => {
    const accounts = makeAccountsConfig();
    const networkConfig = {
      directConnectGateways: [
        {
          name: 'dxgw',
          account: 'Workload',
          virtualInterfaces: [{ name: 'vif1', ownerAccount: 'StaleVifOwner' }],
        },
      ],
    } as unknown as NetworkConfig;

    expect(() => new AccountReferenceValidator(accounts, undefined, undefined, networkConfig).validate()).toThrow(
      /ownerAccount.*StaleVifOwner/s,
    );
  });

  test('flags dangling reference in managed AD sharedAccounts', () => {
    const accounts = makeAccountsConfig();
    const iamConfig = {
      managedActiveDirectories: [{ name: 'ad', account: 'Workload', sharedAccounts: ['Audit', 'GoneSharedAccount'] }],
    } as unknown as IamConfig;

    expect(() => new AccountReferenceValidator(accounts, undefined, iamConfig).validate()).toThrow(
      /sharedAccounts.*GoneSharedAccount/s,
    );
  });

  test('flags dangling reference in excludeAccounts (singular Exclude)', () => {
    const accounts = makeAccountsConfig();
    const globalConfig = {
      logging: { sessionManager: { excludeAccounts: ['Workload', 'NoLongerHere'] } },
    } as unknown as GlobalConfig;

    expect(() => new AccountReferenceValidator(accounts, globalConfig).validate()).toThrow(
      /excludeAccounts.*NoLongerHere/s,
    );
  });

  test('flags dangling reference in config rule targetAccountName', () => {
    const accounts = makeAccountsConfig();
    const securityConfig = {
      awsConfig: {
        ruleSets: [
          {
            rules: [{ name: 'rule1', remediation: { targetAccountName: 'RemovedAccount' } }],
          },
        ],
      },
    } as unknown as SecurityConfig;

    expect(() =>
      new AccountReferenceValidator(accounts, undefined, undefined, undefined, securityConfig).validate(),
    ).toThrow(/targetAccountName.*RemovedAccount/s);
  });

  test('skips runtime-populated iamRoleSsmParameters', () => {
    const accounts = makeAccountsConfig();
    const globalConfig = {
      iamRoleSsmParameters: [{ account: '111111111111', region: 'us-east-1', parametersByPath: {} }],
    } as unknown as GlobalConfig;

    expect(() => new AccountReferenceValidator(accounts, globalConfig).validate()).not.toThrow();
  });
});

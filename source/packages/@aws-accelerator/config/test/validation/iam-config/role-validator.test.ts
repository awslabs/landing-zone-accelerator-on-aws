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

import { describe, expect, test } from '@jest/globals';
import { IamConfig } from '../../../lib/iam-config';
import { IamConfigValidator } from '../../../validator/iam-config-validator';
import { AccountsConfig } from '../../../lib/accounts-config';
import { NetworkConfig } from '../../../lib/network-config';
import { OrganizationConfig } from '../../../lib/organization-config';
import { ReplacementsConfig } from '../../../lib/replacements-config';
import { SecurityConfig } from '../../../lib/security-config';

const configDir = './test/validation/global-config/regional-deploy/config';
const accountsConfig = AccountsConfig.load(configDir);
const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
const iamConfig = IamConfig.load(configDir, replacementsConfig);
const organizationConfig = OrganizationConfig.load(configDir, replacementsConfig);
const securityConfig = SecurityConfig.load(configDir, replacementsConfig);
const networkConfig = NetworkConfig.load(configDir, replacementsConfig);
const validator = new IamConfigValidator(
  iamConfig,
  accountsConfig,
  networkConfig,
  organizationConfig,
  securityConfig,
  configDir,
);

describe('validateRoleNames', () => {
  let errors: string[];

  beforeEach(() => {
    errors = [];
  });

  // Test case 1: No duplicate role names
  test('should not add errors when there are no duplicate role names', () => {
    const values: IamConfig = {
      roleSets: [
        {
          roles: [
            {
              name: 'Role1',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account1'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
        {
          roles: [
            {
              name: 'Role2',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account2'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
      ],
      providers: [],
      policySets: [],
      groupSets: [],
      userSets: [],
      identityCenter: undefined,
      managedActiveDirectories: undefined,
      getManageActiveDirectoryAdminSecretName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretAccountName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretRegion: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySharedAccountNames: function (): string[] {
        throw new Error('Function not implemented.');
      },
      getAccountsByOU: function (): string[] {
        throw new Error('Function not implemented.');
      },
    } as unknown as IamConfig;

    const accountsConfig: AccountsConfig = {
      accountNames: ['account1', 'account2'],
    } as unknown as AccountsConfig;

    validator['validateRoleNames'](values, accountsConfig, errors);
    expect(errors).toHaveLength(0);
  });

  // Test case 2: Duplicate role names in different accounts (valid case)
  test('should not add errors when duplicate role names are in different accounts', () => {
    const values: IamConfig = {
      roleSets: [
        {
          roles: [
            {
              name: 'AdminRole',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account1'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
        {
          roles: [
            {
              name: 'AdminRole',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account2'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
      ],
      providers: [],
      policySets: [],
      groupSets: [],
      userSets: [],
      identityCenter: undefined,
      managedActiveDirectories: undefined,
      getManageActiveDirectoryAdminSecretName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretAccountName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretRegion: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySharedAccountNames: function (): string[] {
        throw new Error('Function not implemented.');
      },
      getAccountsByOU: function (): string[] {
        throw new Error('Function not implemented.');
      },
    } as unknown as IamConfig;

    const accountsConfig: AccountsConfig = {
      accountNames: ['account1', 'account2'],
    } as unknown as AccountsConfig;

    validator['validateRoleNames'](values, accountsConfig, errors);
    expect(errors).toHaveLength(0);
  });

  // Test case 3: Duplicate role names in same account (invalid case)
  test('should add error when duplicate role names exist in the same account', () => {
    const values: IamConfig = {
      roleSets: [
        {
          roles: [
            {
              name: 'AdminRole',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account1'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
        {
          roles: [
            {
              name: 'AdminRole',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account1'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
      ],
      providers: [],
      policySets: [],
      groupSets: [],
      userSets: [],
      identityCenter: undefined,
      managedActiveDirectories: undefined,
      getManageActiveDirectoryAdminSecretName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretAccountName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretRegion: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySharedAccountNames: function (): string[] {
        throw new Error('Function not implemented.');
      },
      getAccountsByOU: function (): string[] {
        throw new Error('Function not implemented.');
      },
    } as unknown as IamConfig;

    const accountsConfig: AccountsConfig = {
      accountNames: ['account1'],
    } as unknown as AccountsConfig;

    validator['validateRoleNames'](values, accountsConfig, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBe(
      'Duplicate role names defined. Role names must be unique in each AWS account. Role name: AdminRole',
    );
  });

  // Test case 4: Empty roleSets
  test('should handle empty roleSets without errors', () => {
    const values: IamConfig = {
      roleSets: [],
      providers: [],
      policySets: [],
      groupSets: [],
      userSets: [],
      identityCenter: undefined,
      managedActiveDirectories: undefined,
      getManageActiveDirectoryAdminSecretName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretAccountName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretRegion: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySharedAccountNames: function (): string[] {
        throw new Error('Function not implemented.');
      },
      getAccountsByOU: function (): string[] {
        throw new Error('Function not implemented.');
      },
    } as unknown as IamConfig;

    const accountsConfig: AccountsConfig = {
      accountNames: ['account1'],
    } as unknown as AccountsConfig;

    validator['validateRoleNames'](values, accountsConfig, errors);
    expect(errors).toHaveLength(0);
  });

  // Test case 5: Multiple roles in roleSet
  test('should handle multiple roles in roleSet correctly', () => {
    const values: IamConfig = {
      roleSets: [
        {
          roles: [
            {
              name: 'Role1',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
            {
              name: 'Role2',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account1'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
        {
          roles: [
            {
              name: 'Role2',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            }, // Duplicate of Role2
            {
              name: 'Role3',
              assumedBy: [],
              instanceProfile: undefined,
              boundaryPolicy: '',
              policies: undefined,
            },
          ],
          deploymentTargets: {
            accounts: ['account1'],
            organizationalUnits: [],
            excludedRegions: [],
            excludedAccounts: [],
          },
          path: undefined,
        },
      ],
      providers: [],
      policySets: [],
      groupSets: [],
      userSets: [],
      identityCenter: undefined,
      managedActiveDirectories: undefined,
      getManageActiveDirectoryAdminSecretName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretAccountName: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySecretRegion: function (): string {
        throw new Error('Function not implemented.');
      },
      getManageActiveDirectorySharedAccountNames: function (): string[] {
        throw new Error('Function not implemented.');
      },
      getAccountsByOU: function (): string[] {
        throw new Error('Function not implemented.');
      },
    } as unknown as IamConfig;

    const accountsConfig: AccountsConfig = {
      accountNames: ['account1'],
    } as unknown as AccountsConfig;

    validator['validateRoleNames'](values, accountsConfig, errors);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Role2');
  });
});

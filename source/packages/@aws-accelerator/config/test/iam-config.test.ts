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

import { describe, expect, it } from '@jest/globals';
import * as path from 'path';
import { AccountsConfig } from '../lib/accounts-config';
import {
  AssumedByConfig,
  GroupConfig,
  GroupSetConfig,
  IamConfig,
  IdentityCenterAssignmentConfig,
  IdentityCenterConfig,
  IdentityCenterPermissionSetConfig,
  PoliciesConfig,
  PolicyConfig,
  PolicySetConfig,
  RoleConfig,
  RoleSetConfig,
  SamlProviderConfig,
  UserConfig,
  UserSetConfig,
} from '../lib/iam-config';
import { ReplacementsConfig } from '../lib/replacements-config';

const configDir = path.resolve('../accelerator/test/configs/snapshot-only');

describe('IamConfig', () => {
  describe('Test config', () => {
    it('test static types', () => {
      const groupSetConfig = new GroupSetConfig();
      expect(groupSetConfig.groups).toEqual([]);

      const groupConfig = new GroupConfig();
      expect(groupConfig.name).toEqual('');

      const policiesConfig = new PoliciesConfig();
      expect(policiesConfig.awsManaged).toEqual(undefined);

      const userSetConfig = new UserSetConfig();
      expect(userSetConfig.users).toEqual([]);

      const userConfig = new UserConfig();
      expect(userConfig.username).toEqual('');

      const samlProviderConfig = new SamlProviderConfig();
      expect(samlProviderConfig.name).toEqual('');

      const assumedByConfig = new AssumedByConfig();
      expect(assumedByConfig.principal).toEqual('');

      const roleConfig = new RoleConfig();
      expect(roleConfig.assumedBy).toEqual([]);

      const roleSetConfig = new RoleSetConfig();
      expect(roleSetConfig.roles).toEqual([]);

      const policyConfig = new PolicyConfig();
      expect(policyConfig.name).toEqual('');

      const policySetConfig = new PolicySetConfig();
      expect(policySetConfig.policies).toEqual([]);

      const identityCenterConfig = new IdentityCenterConfig();
      expect(identityCenterConfig.name).toEqual('');

      const identityCenterAssignmentConfig = new IdentityCenterAssignmentConfig();
      expect(identityCenterAssignmentConfig.name).toEqual('');

      const identityCenterPermissionSetConfig = new IdentityCenterPermissionSetConfig();
      expect(identityCenterPermissionSetConfig.name).toEqual('');
    });
  });

  it('loads from file', () => {
    const accountsConfig = AccountsConfig.load(configDir);
    const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
    const iamConfig = IamConfig.load(configDir, replacementsConfig);
    if (!iamConfig) {
      throw new Error('iamConfig is not defined');
    }
  });

  it('yaml !include works', () => {
    const accountsConfig = AccountsConfig.load(configDir);
    const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
    const iamConfig = IamConfig.load(configDir, replacementsConfig);
    expect(iamConfig.managedActiveDirectories).toHaveLength(1);
    expect(iamConfig.managedActiveDirectories![0].name).toBe('AcceleratorManagedActiveDirectory');
  });
});

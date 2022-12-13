/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import {
  IamConfig,
  UserConfig,
  PolicySetConfig,
  PolicyConfig,
  RoleSetConfig,
  SamlProviderConfig,
  GroupSetConfig,
  GroupConfig,
  PoliciesConfig,
  UserSetConfig,
  AssumedByConfig,
  RoleConfig,
  IdentityCenterAssignmentConfig,
  IdentityCenterConfig,
  IdentityCenterPermissionSetConfig,
} from '../lib/iam-config';
import { describe, it, expect } from '@jest/globals';
import * as path from 'path';
import * as fs from 'fs';

describe('IamConfig', () => {
  describe('Test config', () => {
    // it('has loaded successfully', () => {
    //   const iamConfig = new IamConfig();
    //   const iamConfigFromFile = IamConfig.load(path.resolve('../accelerator/test/configs/all-enabled'), true);
    //   expect(iamConfig.ouIdNames).toEqual(['Root']);
    //   expect(iamConfigFromFile.ouIdNames).toEqual(['Root', 'Security', 'Infrastructure']);
    // });

    it('test static types', () => {
      const groupSetConfig = new GroupSetConfig();
      expect(groupSetConfig.groups).toEqual([]);

      const groupConfig = new GroupConfig();
      expect(groupConfig.name).toEqual('');

      const policiesConfig = new PoliciesConfig();
      expect(policiesConfig.awsManaged).toEqual([]);

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

  it('loads from string', () => {
    const buffer = fs.readFileSync(path.join('../accelerator/test/configs/all-enabled', IamConfig.FILENAME), 'utf8');
    const iamConfigFromString = IamConfig.loadFromString(buffer);
    if (!iamConfigFromString) {
      throw new Error('iamConfigFromString is not defined');
    }
  });
});

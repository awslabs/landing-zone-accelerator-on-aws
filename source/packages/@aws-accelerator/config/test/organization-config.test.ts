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

import { OrganizationConfig } from '../lib/organization-config';
import { describe, expect } from '@jest/globals';
import * as path from 'path';

describe('OrganizationConfig', () => {
  describe('Test config', () => {
    const organizationConfigFromFile = OrganizationConfig.load(path.resolve('../accelerator/test/configs/all-enabled'));
    const organizationConfig = new OrganizationConfig();
    it('has loaded successfully', () => {
      expect(organizationConfigFromFile.enable).toBe(true);
      expect(organizationConfig.enable).toBe(true);
    });

    it('gets organization lookup', () => {
      expect(() => {
        organizationConfigFromFile.getOrganizationalUnitId('hello');
      }).toThrow();
      expect(organizationConfigFromFile.getOrganizationalUnitId('Security')).toEqual('ou-asdf-11111111');

      expect(() => {
        organizationConfigFromFile.getOrganizationalUnitArn('hello');
      }).toThrow();
      expect(organizationConfigFromFile.getOrganizationalUnitArn('Security')).toEqual(
        'arn:aws:organizations::111111111111:ou/o-asdf123456/ou-asdf-11111111',
      );

      expect(organizationConfigFromFile.getPath('Security')).toEqual('/');
      expect(organizationConfigFromFile.getPath('Security/MorePath')).toEqual('/Security');

      expect(organizationConfigFromFile.getOuName('Security')).toEqual('Security');
      expect(organizationConfigFromFile.getOuName('Security/MorePath')).toEqual('MorePath');

      expect(organizationConfigFromFile.getParentOuName('Security')).toEqual('');
      expect(organizationConfigFromFile.getParentOuName('Security/MorePath')).toEqual('Security');
      expect(organizationConfigFromFile.getParentOuName('')).toEqual('');
    });
  });
});

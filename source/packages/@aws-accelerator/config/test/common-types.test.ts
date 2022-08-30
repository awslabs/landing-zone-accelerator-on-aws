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

import { parse } from '../lib/common-types';
import { describe, it, expect } from '@jest/globals';
import { OrganizationConfigTypes } from '../lib/organization-config';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';

describe('parse method', () => {
  describe('parse a valid config', () => {
    it('should return an object', () => {
      const buffer = fs.readFileSync(
        path.resolve('../accelerator/test/configs/all-enabled/organization-config.yaml'),
        'utf8',
      );
      const r = parse(OrganizationConfigTypes.organizationConfig, yaml.load(buffer));
      expect(r && typeof r === 'object').toBe(true);
    });
  });
  describe('parse an incomplete config', () => {
    it('should throw an error', () => {
      const loadedyaml = `
{
      enable: true,
      organizationalUnits: [ { name: 'Security' }, { name: 'Infrastructure' } ],
      quarantineNewAccounts: { enable: true, scpPolicyName: 'Quarantine' },
    }`;
      expect(() => {
        parse(OrganizationConfigTypes.organizationConfig, loadedyaml);
      }).toThrow();
    });
  });
});

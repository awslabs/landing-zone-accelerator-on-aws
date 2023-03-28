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

import { describe, expect, it } from '@jest/globals';
import * as path from 'path';
import { SecurityConfig } from '../lib/security-config';

describe('SecurityConfig', () => {
  describe('Test config', () => {
    const securityConfigFromFile = SecurityConfig.load(path.resolve('../accelerator/test/configs/all-enabled'));
    // const securityConfig = new SecurityConfig();

    it('has loaded successfully', () => {
      // expect(securityConfig.).toEqual([]);
      //   expect(securityConfigFromFile.accountNames).toStrictEqual([
      //     'Management',
      //     'LogArchive',
      //     'Audit',
      //     'SharedServices',
      //     'Network',
      //   ]);

      expect(securityConfigFromFile.getDelegatedAccountName()).toBe('Audit');
    });
  });
});

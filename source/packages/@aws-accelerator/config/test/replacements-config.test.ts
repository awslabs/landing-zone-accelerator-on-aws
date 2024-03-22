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
import { GlobalConfig } from '../lib/global-config';
import { AccountsConfig } from '../lib/accounts-config';
import { ReplacementsConfig } from '../lib/replacements-config';

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

const accountConfig = new AccountsConfig(
  {
    managementAccountEmail: 'some-management-account@example.com',
    logArchiveAccountEmail: 'some-logarchive-account@example.com',
    auditAccountEmail: 'some-audit-account@example.com',
  },
  accountsConfigObject,
);
const replacementsConfig = ReplacementsConfig.load(
  path.resolve('../accelerator/test/configs/snapshot-only'),
  accountConfig,
);
let globalConfigWithReplacements: GlobalConfig;

describe('GlobalConfig', () => {
  describe('Test config', () => {
    it('has loaded successfully', async () => {
      await replacementsConfig.loadReplacementValues({ region: 'us-east-1' }, true);
      globalConfigWithReplacements = GlobalConfig.load(
        path.resolve('../accelerator/test/configs/snapshot-only'),
        replacementsConfig,
      );
      expect(globalConfigWithReplacements.homeRegion).toBe('us-east-1');
    });

    it('has ignored undefined replacements', () => {
      expect(globalConfigWithReplacements.tags[1].value).toEqual('{{UNDEFINED_PLACEHOLDER}}');
    });

    it('has loaded defined replacements from replacements-config.yaml', () => {
      expect(globalConfigWithReplacements.tags[2].value).toEqual('TagReplacementValue');
    });

    it('has loaded account id replacements successfully', () => {
      expect(globalConfigWithReplacements.tags[3].value).toEqual('111111111111');
    });

    it('does not modify ssm dynamic references', () => {
      expect(globalConfigWithReplacements.tags[4].value).toEqual('{{resolve:ssm:/accelerator/lza-prefix}}');
    });
  });
});

describe('Replacement config', () => {
  describe('Test config', () => {
    const replacementsConfig = ReplacementsConfig.load(
      path.resolve('../accelerator/test/configs/snapshot-only'),
      accountConfig,
      true,
    );
    it('has loaded successfully', () => {
      expect(replacementsConfig.globalReplacements).toHaveLength(4);
    });
  });
});

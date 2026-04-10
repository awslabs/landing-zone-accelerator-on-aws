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
import { AccountsConfig, OrganizationConfig } from '@aws-accelerator/config';
import { isOrganizationalUnitIncluded } from '../../lib/stacks/custom-stack';

describe('isOrganizationalUnitIncluded', () => {
  it('should return false when account is in an ignored OU', () => {
    const accountsConfig = new AccountsConfig(
      {
        managementAccountEmail: 'mgmt@example.com',
        logArchiveAccountEmail: 'log@example.com',
        auditAccountEmail: 'audit@example.com',
      },
      {
        mandatoryAccounts: [
          { name: 'Management', email: 'mgmt@example.com', organizationalUnit: 'Root' },
          { name: 'LogArchive', email: 'log@example.com', organizationalUnit: 'Security' },
          { name: 'Audit', email: 'audit@example.com', organizationalUnit: 'Security' },
        ],
        workloadAccounts: [
          { name: 'SuspendedAccount', email: 'suspended@example.com', organizationalUnit: 'Suspended' },
        ],
      },
    );

    accountsConfig.accountIds = [
      { email: 'mgmt@example.com', accountId: '111111111111' },
      { email: 'log@example.com', accountId: '222222222222' },
      { email: 'audit@example.com', accountId: '333333333333' },
      { email: 'suspended@example.com', accountId: '444444444444' },
    ];

    const orgConfig = new OrganizationConfig({
      organizationalUnits: [
        { name: 'Security', ignore: false },
        { name: 'Suspended', ignore: true },
      ],
    });

    const result = isOrganizationalUnitIncluded(['Root'], '444444444444', accountsConfig, orgConfig);
    expect(result).toBe(false);
  });

  it('should return true when account is in a non-ignored OU', () => {
    const accountsConfig = new AccountsConfig(
      {
        managementAccountEmail: 'mgmt@example.com',
        logArchiveAccountEmail: 'log@example.com',
        auditAccountEmail: 'audit@example.com',
      },
      {
        mandatoryAccounts: [
          { name: 'Management', email: 'mgmt@example.com', organizationalUnit: 'Root' },
          { name: 'LogArchive', email: 'log@example.com', organizationalUnit: 'Security' },
          { name: 'Audit', email: 'audit@example.com', organizationalUnit: 'Security' },
        ],
        workloadAccounts: [{ name: 'ProdAccount', email: 'prod@example.com', organizationalUnit: 'Production' }],
      },
    );

    accountsConfig.accountIds = [
      { email: 'mgmt@example.com', accountId: '111111111111' },
      { email: 'log@example.com', accountId: '222222222222' },
      { email: 'audit@example.com', accountId: '333333333333' },
      { email: 'prod@example.com', accountId: '555555555555' },
    ];

    const orgConfig = new OrganizationConfig({
      organizationalUnits: [
        { name: 'Security', ignore: false },
        { name: 'Production', ignore: false },
      ],
    });

    const result = isOrganizationalUnitIncluded(['Root'], '555555555555', accountsConfig, orgConfig);
    expect(result).toBe(true);
  });
});

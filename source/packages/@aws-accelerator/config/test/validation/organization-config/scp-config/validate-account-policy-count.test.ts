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

import { describe, expect, it } from 'vitest';

import { OrganizationConfig } from '../../../../lib/organization-config';
import { IOrganizationConfig, ITaggingPolicyConfig } from '../../../../lib/models/organization-config';
import { OrganizationConfigValidator } from '../../../../validator/organization-config-validator';

const POLICY_TYPES = [
  { field: 'taggingPolicies', displayName: 'Tag Policy' },
  { field: 'backupPolicies', displayName: 'Backup Policy' },
] as const;

describe('direct account policy attachment validation', () => {
  it.each(POLICY_TYPES)('allows 10 configured direct $displayName attachments', ({ field }) => {
    const organizationConfig = createOrganizationConfig(field, createPolicies(10));

    expect(() => new OrganizationConfigValidator(organizationConfig, undefined, __dirname)).not.toThrow();
  });

  it.each(POLICY_TYPES)('rejects 11 configured direct $displayName attachments', ({ field, displayName }) => {
    const organizationConfig = createOrganizationConfig(field, createPolicies(11));

    expect(() => new OrganizationConfigValidator(organizationConfig, undefined, __dirname)).toThrow(
      `Account - Workload has 11 configured direct ${displayName} attachments, exceeding the AWS Organizations hard limit of 10`,
    );
  });

  it.each(POLICY_TYPES)('does not count excluded $displayName account targets', ({ field }) => {
    const policies = createPolicies(11);
    policies[10] = {
      ...policies[10],
      deploymentTargets: {
        accounts: ['Workload'],
        excludedAccounts: ['Workload'],
      },
    };
    const organizationConfig = createOrganizationConfig(field, policies);

    expect(() => new OrganizationConfigValidator(organizationConfig, undefined, __dirname)).not.toThrow();
  });
});

function createPolicies(count: number): ITaggingPolicyConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Policy${index + 1}`,
    description: `Test policy ${index + 1}`,
    policy: './boguspolicy.yaml',
    deploymentTargets: { accounts: ['Workload'] },
  }));
}

function createOrganizationConfig(
  field: (typeof POLICY_TYPES)[number]['field'],
  policies: ITaggingPolicyConfig[],
): OrganizationConfig {
  const values: IOrganizationConfig = {
    enable: true,
    organizationalUnits: [],
    serviceControlPolicies: [],
    taggingPolicies: field === 'taggingPolicies' ? policies : [],
    backupPolicies: field === 'backupPolicies' ? policies : [],
  };
  return new OrganizationConfig(values);
}

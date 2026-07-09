import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationConfigValidator } from '../../../../validator/organization-config-validator';
import { OrganizationConfig } from '../../../../lib/organization-config';
import { IOrganizationConfig, IServiceControlPolicyConfig } from '../../../../lib/models/organization-config';
import { IDeploymentTargets } from '../../../../lib/common';

describe('Organization policy limits validation', () => {
  beforeEach(() => {
    delete process.env['ORGANIZATIONAL_UNIT_SCP_LIMIT'];
    delete process.env['ACCOUNT_SCP_LIMIT'];
  });

  it('fails validation if a policy description exceeds 512 characters', () => {
    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: [getScp('SomePolicy1', { organizationalUnits: ['TrustedEntity'] }, 'a'.repeat(513))],
    };

    expect(() => {
      new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, __dirname);
    }).toThrow(
      'Description for service control policy SomePolicy1 exceeds the maximum length of 512 characters, found 513 characters',
    );
  });

  it('passes validation if a policy description is exactly 512 characters', () => {
    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: [getScp('SomePolicy1', { organizationalUnits: ['TrustedEntity'] }, 'a'.repeat(512))],
    };

    const orgConfigValidator = new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, __dirname);
    expect(orgConfigValidator).toBeDefined();
  });

  it('allows 10 SCP attachments per target by default', () => {
    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: Array.from({ length: 10 }, (_, i) =>
        getScp(`SomePolicy${i + 1}`, { organizationalUnits: ['TrustedEntity'] }),
      ),
    };

    const orgConfigValidator = new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, __dirname);
    expect(orgConfigValidator).toBeDefined();
  });

  it('fails validation if a target has more than 10 SCP attachments by default', () => {
    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: Array.from({ length: 11 }, (_, i) =>
        getScp(`SomePolicy${i + 1}`, { organizationalUnits: ['TrustedEntity'] }),
      ),
    };

    expect(() => {
      new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, __dirname);
    }).toThrow('TrustedEntity has 11 out of 10 allowed scps');
  });
});

function getScp(
  name: string,
  deploymentTargets: IDeploymentTargets,
  description = 'a description',
): IServiceControlPolicyConfig {
  return {
    name,
    description,
    policy: './boguspolicy.yaml',
    type: 'customerManaged',
    deploymentTargets,
  };
}

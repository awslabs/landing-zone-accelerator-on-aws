import { describe, it, expect, beforeEach } from 'vitest';
import { OrganizationConfigValidator } from '../../../../validator/organization-config-validator';
import { OrganizationConfig } from '../../../../lib/organization-config';
import { IOrganizationConfig, IServiceControlPolicyConfig } from '../../../../lib/models/organization-config';
import { IDeploymentTargets } from '../../../../lib/common';

describe('Organization config validation', () => {
  beforeEach(() => {
    process.env['ORGANIZATIONAL_UNIT_SCP_LIMIT'] = '5';
    process.env['ACCOUNT_SCP_LIMIT'] = '6';
  });

  it('counts SCP attachments for OUs and accounts separately', () => {
    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: [
        getScpWithDeploymentTargets('SomePolicy1', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy2', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy3', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy4', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy5', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy6', {
          accounts: ['TrustedEntity'],
        }),
      ],
    };

    const orgConfigValidator = new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, __dirname);
    expect(orgConfigValidator).toBeDefined();
  });

  it('fails validation if an OU has more than 5 attachments', () => {
    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: [
        getScpWithDeploymentTargets('SomePolicy1', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy2', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy3', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy4', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy5', {
          organizationalUnits: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy6', {
          organizationalUnits: ['TrustedEntity'],
        }),
      ],
    };

    expect(() => {
      new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, __dirname);
    }).toThrow('TrustedEntity has 6 out of 5 allowed scps');
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('fails validation if an Account has more than %i attachments', limit => {
    process.env['ACCOUNT_SCP_LIMIT'] = limit.toString();
    const policies = Array.from({ length: limit + 1 }, (_, i) =>
      getScpWithDeploymentTargets(`SomePolicy${i + 1}`, {
        accounts: ['TrustedEntity'],
      }),
    );

    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: policies,
    };

    expect(() => {
      new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, __dirname);
    }).toThrow(`TrustedEntity has ${limit + 1} out of ${limit} allowed scps`);

    process.env['ACCOUNT_SCP_LIMIT'] = '5';
  });
});

function getScpWithDeploymentTargets(name: string, deploymentTargets: IDeploymentTargets): IServiceControlPolicyConfig {
  return {
    name,
    description: 'a description',
    policy: './boguspolicy.yaml',
    type: 'customerManaged',
    deploymentTargets,
  };
}

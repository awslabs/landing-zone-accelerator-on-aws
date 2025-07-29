import { describe, it, expect } from '@jest/globals';
import { OrganizationConfigValidator } from '../../../../validator/organization-config-validator';
import { OrganizationConfig } from '../../../../lib/organization-config';
import { IOrganizationConfig, IServiceControlPolicyConfig } from '../../../../lib/models/organization-config';
import { IDeploymentTargets } from '../../../../lib/common';

describe('Organization config validation', () => {
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

    const orgConfigValidator = new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, './');
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
      new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, './');
    }).toThrow('TrustedEntity has 6 out of 5 allowed scps');
  });

  it('fails validation if an Account has more than 6 attachments', () => {
    const orgConfig: IOrganizationConfig = {
      enable: true,
      taggingPolicies: [],
      backupPolicies: [],
      organizationalUnits: [{ name: 'TrustedEntity' }],
      serviceControlPolicies: [
        getScpWithDeploymentTargets('SomePolicy1', {
          accounts: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy2', {
          accounts: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy3', {
          accounts: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy4', {
          accounts: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy5', {
          accounts: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy6', {
          accounts: ['TrustedEntity'],
        }),
        getScpWithDeploymentTargets('SomePolicy6', {
          accounts: ['TrustedEntity'],
        }),
      ],
    };

    expect(() => {
      new OrganizationConfigValidator(new OrganizationConfig(orgConfig), undefined, './');
    }).toThrow('TrustedEntity has 7 out of 6 allowed scps');
  });
});

function getScpWithDeploymentTargets(name: string, deploymentTargets: IDeploymentTargets): IServiceControlPolicyConfig {
  return {
    name,
    description: 'a description',
    policy: './test/validation/organization-config/scp-config/boguspolicy.yaml',
    type: 'customerManaged',
    deploymentTargets,
  };
}

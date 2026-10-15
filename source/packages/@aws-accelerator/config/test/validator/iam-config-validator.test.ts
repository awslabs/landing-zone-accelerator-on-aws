import { describe, test, expect, beforeEach, vi } from 'vitest';
import { IamConfig } from '../../lib/iam-config';
import { AccountsConfig } from '../../lib/accounts-config';
import { NetworkConfig } from '../../lib/network-config';
import { OrganizationConfig } from '../../lib/organization-config';
import { SecurityConfig } from '../../lib/security-config';
import { IamConfigValidator } from '../../validator/iam-config-validator';

describe('IamConfigValidator', () => {
  let mockAccountsConfig: AccountsConfig;
  let mockNetworkConfig: NetworkConfig;
  let mockOrganizationConfig: OrganizationConfig;
  let mockSecurityConfig: SecurityConfig;
  let mockConfigDir: string;

  beforeEach(() => {
    mockAccountsConfig = {
      mandatoryAccounts: [{ name: 'Management', organizationalUnit: 'Root' }],
      workloadAccounts: [],
    } as unknown as AccountsConfig;

    mockNetworkConfig = { vpcs: [], vpcTemplates: [] } as unknown as NetworkConfig;
    mockOrganizationConfig = { organizationalUnits: [] } as unknown as OrganizationConfig;
    mockSecurityConfig = {} as unknown as SecurityConfig;
    mockConfigDir = '/mock/config';
  });

  const createValidatorWithConfig = (iamConfig: Partial<IamConfig>) => {
    const fullConfig = {
      providers: [],
      roleSets: [],
      groupSets: [],
      userSets: [],
      managedActiveDirectories: [],
      ...iamConfig,
    } as IamConfig;

    return new IamConfigValidator(
      fullConfig,
      mockAccountsConfig,
      mockNetworkConfig,
      mockOrganizationConfig,
      mockSecurityConfig,
      mockConfigDir,
    );
  };

  describe('validateIdentityCenterPermissionSetPolicies - Policy Name Length', () => {
    test('accepts policy names with 32 characters or less', () => {
      const shortName = 'ShortName'; // 9 characters
      const exactlyThirtyTwo = 'A'.repeat(32); // exactly 32 characters

      const iamConfig = {
        policySets: [
          {
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedRegions: [],
              excludedAccounts: [],
            },
            identityCenterDependency: false,
            name: shortName,
            policies: [{ name: shortName, policy: 'policy.json' }],
          },
          {
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedRegions: [],
              excludedAccounts: [],
            },
            identityCenterDependency: false,
            name: exactlyThirtyTwo,
            policies: [{ name: exactlyThirtyTwo, policy: 'policy.json' }],
          },
        ],
        identityCenter: {
          name: 'TestIdentityCenter',
          delegatedAdminAccount: 'Management',
          identityCenterPermissionSets: [
            {
              name: shortName,
              policies: undefined,
              sessionDuration: undefined,
              description: undefined,
            },
            {
              name: exactlyThirtyTwo,
              policies: undefined,
              sessionDuration: undefined,
              description: undefined,
            },
          ],
          identityCenterAssignments: [],
        },
      };
      const validator = createValidatorWithConfig(iamConfig);
      const errors = validator['validateIdentityCenterPermissionSetName']();
      expect(errors).toHaveLength(0);
    });

    test('rejects policy names longer than 32 characters', () => {
      const tooLongName = 'A'.repeat(33); // 33 characters - should fail

      const iamConfig = {
        policySets: [
          {
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedRegions: [],
              excludedAccounts: [],
            },
            name: tooLongName,
            identityCenterDependency: false,
            policies: [{ name: tooLongName, policy: 'policy.json' }],
          },
        ],
        identityCenter: {
          name: 'TestIdentityCenter',
          delegatedAdminAccount: 'Management',
          identityCenterPermissionSets: [
            {
              name: tooLongName,
              policies: undefined,
              sessionDuration: undefined,
              description: undefined,
            },
          ],
          identityCenterAssignments: [],
        },
      };

      const validator = createValidatorWithConfig(iamConfig);
      const errors = validator['validateIdentityCenterPermissionSetName']();
      expect(errors).toHaveLength(1);
    });

    test('handles empty policy sets gracefully', () => {
      const iamConfig = {
        policySets: [],
        identityCenter: {
          name: 'TestIdentityCenter',
          delegatedAdminAccount: 'Management',
          identityCenterPermissionSets: [],
          identityCenterAssignments: [],
        },
      };

      const validator = createValidatorWithConfig(iamConfig);
      const errors = validator['validateIdentityCenterPermissionSetName']();
      expect(errors).toHaveLength(0);
    });

    test('handles missing identity center gracefully', () => {
      const iamConfig = {
        policySets: [
          {
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedRegions: [],
              excludedAccounts: [],
            },
            identityCenterDependency: false,
            policies: [{ name: 'ValidName', policy: 'policy.json' }],
          },
        ],
      };

      const validator = createValidatorWithConfig(iamConfig);
      const errors = validator['validateIdentityCenterPermissionSetName']();
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateIdentityCenterAssignmentPrincipalIds', () => {
    const createValidatorWithAssignments = (
      assignments: { name: string; principalId?: string; principalType?: string; principals?: unknown[] }[],
    ) =>
      createValidatorWithConfig({
        policySets: [],
        identityCenter: {
          name: 'TestIdentityCenter',
          delegatedAdminAccount: 'Management',
          identityCenterPermissionSets: [{ name: 'PS1' }],
          identityCenterAssignments: assignments.map(assignment => ({
            permissionSetName: 'PS1',
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedRegions: [],
              excludedAccounts: [],
            },
            ...assignment,
          })),
        },
      } as unknown as Partial<IamConfig>);

    test('rejects a group name supplied as principalId and points to the principals property', () => {
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principalId: 'Platform-Admins', principalType: 'GROUP' },
      ]);

      const errors = validator['validateIdentityCenterAssignmentPrincipalIds']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Platform-Admins');
      expect(errors[0]).toContain('Assignment1');
      expect(errors[0]).toContain('principals');
    });

    test('accepts a bare identity store id', () => {
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principalId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', principalType: 'GROUP' },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(0);
    });

    test('accepts the 47 character identity-store-prefixed id form', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'Assignment1',
          principalId: '906751796e-f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
          principalType: 'USER',
        },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(0);
    });

    test('accepts uppercase hexadecimal identity store ids', () => {
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principalId: 'F81D4FAE-7DEC-11D0-A765-00A0C91E6BF6', principalType: 'USER' },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(0);
    });

    test('rejects a truncated identity store id', () => {
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principalId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf', principalType: 'USER' },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(1);
    });

    test('rejects a value that only starts with an identity store id', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'Assignment1',
          principalId: '906751796e-f81d4fae-7dec-11d0-a765-00a0c91e6bf6a',
          principalType: 'USER',
        },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(1);
    });

    test('skips unresolved handlebars tokens and CloudFormation dynamic references', () => {
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principalId: '{{resolve:ssm:/accelerator/idc/group-id}}', principalType: 'GROUP' },
        { name: 'Assignment2', principalId: '{{MyGroupId}}', principalType: 'GROUP' },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(0);
    });

    test('ignores assignments that use the principals property', () => {
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principals: [{ type: 'GROUP', name: 'Platform-Admins' }] },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(0);
    });

    test('ignores a non identity store principalId when the assignment also sets principals', () => {
      // The assignment custom resource branches on principals and never reads principalId in this
      // shape, so such a configuration deploys today and must keep passing validation.
      const validator = createValidatorWithAssignments([
        {
          name: 'Assignment1',
          principalId: 'Platform-Admins',
          principalType: 'GROUP',
          principals: [{ type: 'GROUP', name: 'Platform-Admins' }],
        },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(0);
    });

    test('ignores a non identity store principalId when principals is an empty list', () => {
      // An empty principals list is still the principals branch at runtime, so principalId is unused.
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principalId: 'Platform-Admins', principalType: 'GROUP', principals: [] },
      ]);

      expect(validator['validateIdentityCenterAssignmentPrincipalIds']()).toHaveLength(0);
    });

    test('still reports a non identity store principalId on a sibling assignment without principals', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'MigratedAssignment',
          principalId: 'Platform-Admins',
          principalType: 'GROUP',
          principals: [{ type: 'GROUP', name: 'Platform-Admins' }],
        },
        { name: 'LegacyAssignment', principalId: 'Platform-Admins', principalType: 'GROUP' },
      ]);

      const errors = validator['validateIdentityCenterAssignmentPrincipalIds']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('LegacyAssignment');
      expect(errors[0]).not.toContain('MigratedAssignment');
    });

    test('reports only the offending assignment when other assignments are valid', () => {
      const validator = createValidatorWithAssignments([
        { name: 'ValidAssignment', principalId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6', principalType: 'USER' },
        { name: 'InvalidAssignment', principalId: 'Platform-Admins', principalType: 'GROUP' },
      ]);

      const errors = validator['validateIdentityCenterAssignmentPrincipalIds']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('InvalidAssignment');
      expect(errors[0]).not.toContain('ValidAssignment');
    });

    test('is reached by validateIdentityCenter', () => {
      const validator = createValidatorWithAssignments([
        { name: 'Assignment1', principalId: 'Platform-Admins', principalType: 'GROUP' },
      ]);

      const errors = validator['validateIdentityCenter']();

      expect(errors.filter(error => error.includes('Platform-Admins'))).toHaveLength(1);
    });
  });

  describe('getIdentityCenterAssignmentOverlapWarnings', () => {
    beforeEach(() => {
      mockAccountsConfig = {
        mandatoryAccounts: [{ name: 'Management', organizationalUnit: 'Root' }],
        workloadAccounts: [
          { name: 'Prod', organizationalUnit: 'Workloads' },
          { name: 'Dev', organizationalUnit: 'Workloads' },
          { name: 'Sandbox', organizationalUnit: 'Sandbox' },
        ],
      } as unknown as AccountsConfig;
    });

    const createValidatorWithAssignments = (
      assignments: {
        name: string;
        permissionSetName?: string;
        principalId?: string;
        principalType?: string;
        principals?: unknown[];
        deploymentTargets?: { accounts?: string[]; organizationalUnits?: string[]; excludedAccounts?: string[] };
      }[],
    ) =>
      createValidatorWithConfig({
        policySets: [],
        identityCenter: {
          name: 'TestIdentityCenter',
          delegatedAdminAccount: 'Management',
          identityCenterPermissionSets: [{ name: 'PS1' }, { name: 'PS2' }],
          identityCenterAssignments: assignments.map(assignment => ({
            permissionSetName: 'PS1',
            ...assignment,
            deploymentTargets: {
              accounts: [],
              organizationalUnits: [],
              excludedRegions: [],
              excludedAccounts: [],
              ...assignment.deploymentTargets,
            },
          })),
        },
      } as unknown as Partial<IamConfig>);

    test('warns about two assignments that grant the same group the same permission set on the same account', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'AdminsProd',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { accounts: ['Prod'] },
        },
        {
          name: 'AdminsAll',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { accounts: ['Prod', 'Dev'] },
        },
      ]);

      const warnings = validator['getIdentityCenterAssignmentOverlapWarnings']();

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('assignments AdminsProd and AdminsAll');
      expect(warnings[0]).toContain('permission set PS1 to [GROUP Admins] on accounts [Prod]');
    });

    test('warns about an overlap where one assignment targets the account through its organizational unit', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'WorkloadsAdmins',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { organizationalUnits: ['Workloads'] },
        },
        {
          name: 'ProdAdmins',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { accounts: ['Prod'] },
        },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(1);
    });

    test('warns about an overlap with an assignment that targets the Root organizational unit', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'RootReadOnly',
          principals: [{ type: 'GROUP', name: 'Auditors' }],
          deploymentTargets: { organizationalUnits: ['Root'] },
        },
        {
          name: 'SandboxReadOnly',
          principals: [{ type: 'GROUP', name: 'Auditors' }],
          deploymentTargets: { accounts: ['Sandbox'] },
        },
      ]);

      const warnings = validator['getIdentityCenterAssignmentOverlapWarnings']();

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('on accounts [Sandbox]');
    });

    test('warns only about the shared principals when assignments list several principals', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'A',
          principals: [
            { type: 'GROUP', name: 'Admins' },
            { type: 'USER', name: 'jane.doe' },
          ],
          deploymentTargets: { accounts: ['Prod'] },
        },
        {
          name: 'B',
          principals: [
            { type: 'GROUP', name: 'Developers' },
            { type: 'USER', name: 'jane.doe' },
          ],
          deploymentTargets: { accounts: ['Prod'] },
        },
      ]);

      const warnings = validator['getIdentityCenterAssignmentOverlapWarnings']();

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('to [USER jane.doe] on accounts');
    });

    test('warns once for every overlapping pair', () => {
      const validator = createValidatorWithAssignments(
        ['One', 'Two', 'Three'].map(name => ({
          name,
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { accounts: ['Prod'] },
        })),
      );

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(3);
    });

    test('compares principal names without case sensitivity', () => {
      const validator = createValidatorWithAssignments([
        { name: 'A', principals: [{ type: 'GROUP', name: 'Admins' }], deploymentTargets: { accounts: ['Prod'] } },
        { name: 'B', principals: [{ type: 'GROUP', name: 'admins' }], deploymentTargets: { accounts: ['Prod'] } },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(1);
    });

    test('warns about two assignments that grant the same deprecated principalId the same permission set', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'Legacy1',
          principalType: 'GROUP',
          principalId: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
          deploymentTargets: { accounts: ['Prod'] },
        },
        {
          name: 'Legacy2',
          principalType: 'GROUP',
          principalId: 'F81D4FAE-7DEC-11D0-A765-00A0C91E6BF6',
          deploymentTargets: { accounts: ['Prod'] },
        },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(1);
    });

    test('limits the number of accounts listed in a warning', () => {
      mockAccountsConfig = {
        mandatoryAccounts: [],
        workloadAccounts: Array.from({ length: 15 }, (_, index) => ({
          name: `Account${index + 1}`,
          organizationalUnit: 'Workloads',
        })),
      } as unknown as AccountsConfig;
      const validator = createValidatorWithAssignments([
        {
          name: 'A',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { organizationalUnits: ['Workloads'] },
        },
        {
          name: 'B',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { organizationalUnits: ['Root'] },
        },
      ]);

      const warnings = validator['getIdentityCenterAssignmentOverlapWarnings']();

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('Account10 and 5 more]');
      expect(warnings[0]).not.toContain('Account11');
    });

    test('does not warn about the same group and permission set on disjoint accounts', () => {
      const validator = createValidatorWithAssignments([
        { name: 'A', principals: [{ type: 'GROUP', name: 'Admins' }], deploymentTargets: { accounts: ['Prod'] } },
        { name: 'B', principals: [{ type: 'GROUP', name: 'Admins' }], deploymentTargets: { accounts: ['Dev'] } },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(0);
    });

    test('does not warn about the same group on the same account with different permission sets', () => {
      const validator = createValidatorWithAssignments([
        { name: 'A', principals: [{ type: 'GROUP', name: 'Admins' }], deploymentTargets: { accounts: ['Prod'] } },
        {
          name: 'B',
          permissionSetName: 'PS2',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { accounts: ['Prod'] },
        },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(0);
    });

    test('does not warn about different principals with the same permission set on the same account', () => {
      const validator = createValidatorWithAssignments([
        { name: 'A', principals: [{ type: 'GROUP', name: 'Admins' }], deploymentTargets: { accounts: ['Prod'] } },
        { name: 'B', principals: [{ type: 'USER', name: 'Admins' }], deploymentTargets: { accounts: ['Prod'] } },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(0);
    });

    test('does not warn about an overlap that is removed by excludedAccounts', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'A',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { organizationalUnits: ['Workloads'], excludedAccounts: ['Prod'] },
        },
        { name: 'B', principals: [{ type: 'GROUP', name: 'Admins' }], deploymentTargets: { accounts: ['Prod'] } },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(0);
    });

    test('ignores the deprecated principalId when the assignment sets an empty principals list', () => {
      // The custom resource only reads principalId when principals is not set, so it is not a granted principal here.
      const principalId = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';
      const validator = createValidatorWithAssignments([
        {
          name: 'A',
          principalType: 'GROUP',
          principalId,
          principals: [],
          deploymentTargets: { accounts: ['Prod'] },
        },
        { name: 'B', principalType: 'GROUP', principalId, deploymentTargets: { accounts: ['Prod'] } },
      ]);

      expect(validator['getIdentityCenterAssignmentOverlapWarnings']()).toHaveLength(0);
    });

    test('logs overlaps as warnings without failing validation', () => {
      const validator = createValidatorWithAssignments([
        {
          name: 'OverlapOne',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { accounts: ['Prod'] },
        },
        {
          name: 'OverlapTwo',
          principals: [{ type: 'GROUP', name: 'Admins' }],
          deploymentTargets: { accounts: ['Prod'] },
        },
      ]);
      const warnSpy = vi.spyOn(validator['logger'], 'warn').mockImplementation(() => validator['logger']);

      expect(() => validator.validate()).not.toThrow();
      expect(validator['validateIdentityCenter']().some(error => error.includes('OverlapOne'))).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('assignments OverlapOne and OverlapTwo'));
    });
  });

  describe('validateAssumedByConditionsForIamRoles', () => {
    test('returns an error when duplicate operator+key condition entries exist for a single assumedBy principal', () => {
      const iamConfig = {
        roleSets: [
          {
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedAccounts: [],
              excludedRegions: [],
            },
            roles: [
              {
                name: 'TestRole-DuplicateConditions',
                assumedBy: [
                  {
                    type: 'account',
                    principal: '111111111111',
                    conditions: [
                      { type: 'StringEquals', key: 'sts:ExternalId', values: ['id-1'] },
                      { type: 'StringEquals', key: 'sts:ExternalId', values: ['id-2'] }, // duplicate type+key
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const validator = createValidatorWithConfig(iamConfig);
      const errors = validator['validateAssumedByConditionsForIamRoles']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Duplicate AssumedBy condition');
    });

    test('returns an error when a condition has an empty values array', () => {
      const iamConfig = {
        roleSets: [
          {
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedAccounts: [],
              excludedRegions: [],
            },
            roles: [
              {
                name: 'TestRole-EmptyValues',
                assumedBy: [
                  {
                    type: 'account',
                    principal: '111111111111',
                    conditions: [{ type: 'StringEquals', key: 'aws:PrincipalArn', values: [] }], // invalid
                  },
                ],
              },
            ],
          },
        ],
      };

      const validator = createValidatorWithConfig(iamConfig);
      const errors = validator['validateAssumedByConditionsForIamRoles']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('must include at least one value');
    });

    test('returns an error when sts:ExternalId is used for a non-account/non-principalArn assumedBy type', () => {
      const iamConfig = {
        roleSets: [
          {
            deploymentTargets: {
              accounts: ['Management'],
              organizationalUnits: [],
              excludedAccounts: [],
              excludedRegions: [],
            },
            roles: [
              {
                name: 'TestRole-ExternalIdWrongType',
                assumedBy: [
                  {
                    type: 'service',
                    principal: 'ec2.amazonaws.com',
                    conditions: [{ type: 'StringEquals', key: 'sts:ExternalId', values: ['ext-123'] }], // invalid for service principal
                  },
                ],
              },
            ],
          },
        ],
      };

      const validator = createValidatorWithConfig(iamConfig);
      const errors = validator['validateAssumedByConditionsForIamRoles']();

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('sts:ExternalId');
      expect(errors[0]).toContain('only supported');
    });
  });
});

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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';

// The validator reports advisory findings through a module level logger. Capture them so the
// tests can assert on what was reported without depending on winston transports.
const { loggedErrors, loggedWarnings } = vi.hoisted(() => ({
  loggedErrors: [] as string[],
  loggedWarnings: [] as string[],
}));

vi.mock('@aws-accelerator/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@aws-accelerator/utils')>();
  return {
    ...actual,
    createLogger: () => ({
      info: () => undefined,
      debug: () => undefined,
      warn: (message: string) => loggedWarnings.push(String(message)),
      error: (message: string) => loggedErrors.push(String(message)),
    }),
  };
});

import { SecurityConfigValidator } from '../../validator/security-config-validator';
import {
  IAwsConfigRuleSet,
  IConfigRule,
  ICustomRuleConfigType,
  ISecurityConfig,
} from '../../lib/models/security-config';
import { DeploymentTargets, ILifecycleRule, setConfigValidationMode } from '../../lib/common';
import { AccountsConfig } from '../../lib/accounts-config';
import { OrganizationConfig } from '../../lib/organization-config';
import { AwsConfigRuleSet } from '../../lib/security-config';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateConfigRuleAssets = (SecurityConfigValidator.prototype as any)['validateConfigRuleAssets'].bind({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateSecurityHubStandardDeploymentTargets = (SecurityConfigValidator.prototype as any)[
  'validateSecurityHubStandardDeploymentTargetsInSecurityHubDeploymentTargets'
].bind({});

// validateConfigRuleTags delegates to another private method, so it is invoked through the prototype.
const configRuleTagValidator = SecurityConfigValidator.prototype as unknown as {
  validateConfigRuleTags(
    ruleSets: AwsConfigRuleSet[],
    accountsConfig: AccountsConfig,
    organizationConfig: OrganizationConfig,
    errors: string[],
  ): void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSecurityHubValues(securityHub: any) {
  return {
    centralSecurityServices: {
      securityHub,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const mockAccountsConfig = {
  mandatoryAccounts: [{ name: 'Audit', organizationalUnit: 'Security' }],
  workloadAccounts: [{ name: 'Workload01', organizationalUnit: 'Workloads' }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const mockGlobalConfig = {
  enabledRegions: ['us-east-1', 'us-west-2'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

function createCustomRule(overrides: {
  name?: string;
  lookupType?: string;
  lookupKey?: string;
  lookupValue?: string[];
  periodic?: boolean;
  configurationChanges?: boolean;
  includeMaximumExecutionFrequency?: boolean;
  includeTriggeringResources?: boolean;
}): IConfigRule {
  const customRule: ICustomRuleConfigType = {
    lambda: {
      sourceFilePath: 'lambda/custom-rule.zip',
      handler: 'index.handler',
      runtime: 'nodejs18.x',
      rolePolicyFile: 'lambda/custom-rule-policy.json',
    },
    periodic: overrides.periodic ?? true,
    configurationChanges: overrides.configurationChanges ?? true,
    ...(overrides.includeMaximumExecutionFrequency === false ? {} : { maximumExecutionFrequency: 'Six_Hours' }),
    ...(overrides.includeTriggeringResources === false
      ? {}
      : {
          triggeringResources: {
            lookupType: overrides.lookupType ?? 'ResourceTypes',
            lookupKey: overrides.lookupKey,
            lookupValue: overrides.lookupValue ?? ['AWS::EC2::Instance'],
          },
        }),
  };

  return {
    name: overrides.name ?? 'test-custom-rule',
    type: 'Custom',
    customRule,
  };
}

function createRuleSet(rules: IConfigRule[]): IAwsConfigRuleSet {
  return {
    deploymentTargets: new DeploymentTargets(),
    rules,
  };
}

function createRemediationRule(
  parameters: { name: string; value: string; type: 'String' | 'StringList' }[],
  overrides: { name?: string; targetId?: string } = {},
): IConfigRule {
  return {
    name: overrides.name ?? 'test-remediation-rule',
    type: 'Custom',
    remediation: {
      targetId: overrides.targetId ?? 'Custom-Remediation-Document',
      rolePolicyFile: 'custom-config-rules/remediation-role.json',
      automatic: true,
      parameters,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const configRuleTagAccountsConfig = {
  getAccounts: () => [
    { name: 'Audit', organizationalUnit: 'Security' },
    { name: 'Workload01', organizationalUnit: 'Workloads' },
  ],
} as unknown as AccountsConfig;

function createTagRuleSet(
  rules: { name: string; tags?: { key: string; value: string }[] }[],
  deploymentTargets: Partial<DeploymentTargets> = { organizationalUnits: ['Root'] },
): AwsConfigRuleSet {
  return { deploymentTargets, rules } as unknown as AwsConfigRuleSet;
}

/**
 * Create organization config for Config rule tag target-resolution tests.
 *
 * @param ignoredOuNames OU names excluded from accelerator deployment
 * @returns Organization configuration with deterministic Security and Workloads OUs
 */
function createConfigRuleTagOrganizationConfig(ignoredOuNames: readonly string[] = []): OrganizationConfig {
  const organizationConfig = new OrganizationConfig();
  Object.assign(organizationConfig, {
    organizationalUnits: ['Security', 'Workloads'].map(name => ({
      name,
      ignore: ignoredOuNames.includes(name) || undefined,
    })),
  });
  return organizationConfig;
}

function validateConfigRuleTags(ruleSets: AwsConfigRuleSet[], ignoredOuNames: readonly string[] = []): string[] {
  const errors: string[] = [];
  configRuleTagValidator.validateConfigRuleTags(
    ruleSets,
    configRuleTagAccountsConfig,
    createConfigRuleTagOrganizationConfig(ignoredOuNames),
    errors,
  );
  return errors;
}

function validateRuleTags(ruleTags: { key: string; value: string }[]): string[] {
  return validateConfigRuleTags([createTagRuleSet([{ name: 'test-rule', tags: ruleTags }])]);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SecurityConfigValidator', () => {
  describe('AWS Config rule tag validation', () => {
    it('returns no errors when no rule sets are configured', () => {
      expect(validateConfigRuleTags([])).toEqual([]);
    });

    it('validates every rule of a deployed rule set', () => {
      const errors = validateConfigRuleTags([
        createTagRuleSet([
          { name: 'first-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] },
          { name: 'second-rule', tags: [{ key: 'Owner', value: 'v'.repeat(257) }] },
        ]),
      ]);

      expect(errors).toEqual([
        'AWS Config rule "first-rule" tag key "aws:Reserved" uses the reserved aws: prefix',
        'AWS Config rule "second-rule" tag value for "Owner" exceeds 256 characters',
      ]);
    });

    it.each([
      ['an organizational unit without member accounts', { organizationalUnits: ['EmptyOu'] }],
      ['an account that is not declared in accounts config', { accounts: ['Unknown'] }],
      [
        'fully excluded deployment targets',
        { organizationalUnits: ['Root'], excludedAccounts: ['Audit', 'Workload01'] },
      ],
      ['empty deployment targets', {}],
    ])('skips a rule set targeting %s', (_description, deploymentTargets) => {
      expect(
        validateConfigRuleTags([
          createTagRuleSet([{ name: 'skipped-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], {
            ...deploymentTargets,
          }),
        ]),
      ).toEqual([]);
    });

    it('skips a rule set that targets only an ignored OU', () => {
      expect(
        validateConfigRuleTags(
          [
            createTagRuleSet([{ name: 'ignored-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], {
              organizationalUnits: ['Security'],
            }),
          ],
          ['Security'],
        ),
      ).toEqual([]);
    });

    it('validates a rule set that targets both ignored and active OUs', () => {
      expect(
        validateConfigRuleTags(
          [
            createTagRuleSet([{ name: 'mixed-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], {
              organizationalUnits: ['Security', 'Workloads'],
            }),
          ],
          ['Security'],
        ),
      ).toEqual(['AWS Config rule "mixed-rule" tag key "aws:Reserved" uses the reserved aws: prefix']);
    });

    it('validates Root targets when at least one account is outside ignored OUs', () => {
      expect(
        validateConfigRuleTags(
          [
            createTagRuleSet([{ name: 'root-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], {
              organizationalUnits: ['Root'],
            }),
          ],
          ['Security'],
        ),
      ).toEqual(['AWS Config rule "root-rule" tag key "aws:Reserved" uses the reserved aws: prefix']);
    });

    it('still validates a deployed rule set alongside a rule set that resolves to no accounts', () => {
      const errors = validateConfigRuleTags([
        createTagRuleSet([{ name: 'skipped-rule', tags: [{ key: 'aws:Skipped', value: 'value' }] }], {
          organizationalUnits: ['EmptyOu'],
        }),
        createTagRuleSet([{ name: 'deployed-rule', tags: [{ key: 'aws:Deployed', value: 'value' }] }], {
          organizationalUnits: ['Security'],
        }),
      ]);

      expect(errors).toEqual(['AWS Config rule "deployed-rule" tag key "aws:Deployed" uses the reserved aws: prefix']);
    });

    it('validates a rule set targeting a single declared account', () => {
      expect(
        validateConfigRuleTags([
          createTagRuleSet([{ name: 'deployed-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], {
            accounts: ['Workload01'],
          }),
        ]),
      ).toEqual(['AWS Config rule "deployed-rule" tag key "aws:Reserved" uses the reserved aws: prefix']);
    });

    it('resolves deployment targets from the single account pool when single account mode is enabled', () => {
      vi.stubEnv('ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE', 'true');
      const singleAccountConfig = {
        getAccounts: (enableSingleAccountMode?: boolean) =>
          enableSingleAccountMode
            ? [{ name: 'Management', organizationalUnit: 'Root' }]
            : [
                { name: 'Management', organizationalUnit: 'Root' },
                { name: 'Workload01', organizationalUnit: 'Workloads' },
              ],
      } as unknown as AccountsConfig;
      const errors: string[] = [];
      const organizationConfig = createConfigRuleTagOrganizationConfig(['Workloads']);

      configRuleTagValidator.validateConfigRuleTags(
        [
          createTagRuleSet([{ name: 'workload-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], {
            organizationalUnits: ['Workloads'],
          }),
        ],
        singleAccountConfig,
        organizationConfig,
        errors,
      );

      expect(errors).toEqual([]);

      const rootErrors: string[] = [];
      configRuleTagValidator.validateConfigRuleTags(
        [
          createTagRuleSet([{ name: 'management-rule', tags: [{ key: 'aws:Reserved', value: 'value' }] }], {
            organizationalUnits: ['Root'],
          }),
        ],
        singleAccountConfig,
        organizationConfig,
        rootErrors,
      );

      expect(rootErrors).toEqual([
        'AWS Config rule "management-rule" tag key "aws:Reserved" uses the reserved aws: prefix',
      ]);
    });

    it.each([
      ['an empty key', { key: '', value: 'value' }, 'must contain between 1 and 128 characters'],
      ['a 129-character key', { key: 'k'.repeat(129), value: 'value' }, 'must contain between 1 and 128 characters'],
      ['a 257-character value', { key: 'Key', value: 'v'.repeat(257) }, 'exceeds 256 characters'],
      ['a case-insensitive reserved prefix', { key: 'AWS:Reserved', value: 'value' }, 'reserved aws: prefix'],
    ])('rejects %s', (_description, tag, expectedError) => {
      expect(validateRuleTags([tag]).some(error => error.includes(expectedError))).toBe(true);
    });

    it.each([
      ['an unsupported value character', { key: 'Key', value: 'invalid!' }],
      ['an unsupported key character', { key: 'Key!', value: 'value' }],
      ['a case-insensitive reserved value prefix', { key: 'Owner', value: 'AWS:Reserved' }],
    ])('keeps %s outside the config-time compatibility-safe subset', (_description, tag) => {
      expect(validateRuleTags([tag])).toEqual([]);
    });

    it('rejects more than 50 rule-specific tag keys', () => {
      const ruleTags = Array.from({ length: 51 }, (_, index) => ({ key: `Rule${index}`, value: 'value' }));

      expect(validateRuleTags(ruleTags)).toEqual([
        'AWS Config rule "test-rule" has 51 rule-specific tag keys, exceeding the limit of 50',
      ]);
    });

    it('accepts 50 rule-specific tag keys', () => {
      const ruleTags = Array.from({ length: 50 }, (_, index) => ({ key: `Rule${index}`, value: 'value' }));

      expect(validateRuleTags(ruleTags)).toEqual([]);
    });

    it.each([
      ['a plaintext SSM reference', '{{resolve:ssm:/p}}'],
      ['a versioned plaintext SSM reference', '{{resolve:ssm:/p:42}}'],
      ['a secure SSM reference', '{{resolve:ssm-secure:/accelerator/secret}}'],
      ['a Secrets Manager reference', '{{resolve:secretsmanager:x}}'],
      ['an embedded reference', 'prefix-{{resolve:ssm:/accelerator/tag}}'],
      ['a reference with otherwise unsupported characters', '{{resolve:ssm:/path with space}}'],
      ['an unterminated reference', '{{resolve:ssm:/accelerator/tag'],
    ])('keeps %s outside config-time compatibility-safe validation', (_description, value) => {
      expect(validateRuleTags([{ key: 'Owner', value }])).toEqual([]);
    });

    it('keeps dynamic rule tag keys outside config-time compatibility-safe validation', () => {
      expect(validateRuleTags([{ key: 'aws:{{resolve:ssm:/path}}', value: 'invalid!' }])).toEqual([]);
    });

    it('uses last-key-wins for duplicate rule tags before validation', () => {
      expect(
        validateRuleTags([
          { key: 'Duplicate', value: 'v'.repeat(257) },
          { key: 'Duplicate', value: 'valid' },
        ]),
      ).toEqual([]);
      expect(
        validateRuleTags([
          { key: 'Duplicate', value: 'valid' },
          { key: 'Duplicate', value: 'v'.repeat(257) },
        ]),
      ).toEqual(['AWS Config rule "test-rule" tag value for "Duplicate" exceeds 256 characters']);
    });

    it('counts astral Unicode letters as single code points for key and value limits', () => {
      const astralLetter = '\u{10400}';

      expect(validateRuleTags([{ key: astralLetter.repeat(128), value: astralLetter.repeat(256) }])).toEqual([]);
      expect(
        validateRuleTags([{ key: astralLetter.repeat(129), value: 'value' }]).some(error =>
          error.includes('must contain between 1 and 128 characters'),
        ),
      ).toBe(true);
      expect(
        validateRuleTags([{ key: 'Owner', value: astralLetter.repeat(257) }]).some(error =>
          error.includes('exceeds 256 characters'),
        ),
      ).toBe(true);
    });

    it('does not repeat rule tag values in validation messages', () => {
      const errors = validateRuleTags([{ key: 'Owner', value: `super-secret-${'v'.repeat(257)}` }]);

      expect(errors).toHaveLength(1);
      expect(errors[0]).not.toContain('super-secret');
    });
  });

  describe('lifecycle rule validation', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const proto = SecurityConfigValidator.prototype as any;
    const validateMacie = proto['macieLifecycleRules'].bind(proto);
    const validateGuardDuty = proto['guarddutyLifecycleRules'].bind(proto);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const macieConfig = (lifecycleRules: Partial<ILifecycleRule>[]) =>
      ({ centralSecurityServices: { macie: { lifecycleRules } } }) as unknown as ISecurityConfig;
    const guardDutyConfig = (lifecycleRules: Partial<ILifecycleRule>[]) =>
      ({ centralSecurityServices: { guardduty: { lifecycleRules } } }) as unknown as ISecurityConfig;

    const deleteMarkerOnlyRule = { id: 'DeleteMarkerOnly', enabled: true, expiredObjectDeleteMarker: true };
    const fullRule = {
      id: 'Full',
      enabled: true,
      abortIncompleteMultipartUpload: 7,
      expiration: 365,
      noncurrentVersionExpiration: 1,
    };

    describe.each([
      ['Macie', validateMacie, macieConfig],
      ['GuardDuty', validateGuardDuty, guardDutyConfig],
    ])('%s', (label, validate, makeConfig) => {
      it('does not require abortIncompleteMultipartUpload for an expired-object-delete-marker-only rule', () => {
        const errors: string[] = [];
        validate(makeConfig([deleteMarkerOnlyRule]), errors);
        expect(errors).toHaveLength(0);
      });

      it('accepts a fully specified rule', () => {
        const errors: string[] = [];
        validate(makeConfig([fullRule]), errors);
        expect(errors).toHaveLength(0);
      });

      it('rejects expiredObjectDeleteMarker combined with expiration', () => {
        const errors: string[] = [];
        validate(makeConfig([{ id: 'Bad', enabled: true, expiration: 365, expiredObjectDeleteMarker: true }]), errors);
        expect(errors).toContain(`You may not configure expiredObjectDeleteMarker with expiration. ${label}`);
      });

      it('still requires abortIncompleteMultipartUpload for a plain expiration rule', () => {
        const errors: string[] = [];
        validate(
          makeConfig([{ id: 'Expire', enabled: true, expiration: 365, noncurrentVersionExpiration: 1 }]),
          errors,
        );
        expect(errors).toContain(`You must supply a value for abortIncompleteMultipartUpload. ${label}`);
      });

      it('still requires abortIncompleteMultipartUpload when expiredObjectDeleteMarker is combined with transitions', () => {
        const errors: string[] = [];
        validate(
          makeConfig([
            {
              id: 'DeleteMarkerWithTransition',
              enabled: true,
              expiredObjectDeleteMarker: true,
              transitions: [{ storageClass: 'GLACIER', transitionAfter: 365 }],
            },
          ]),
          errors,
        );
        expect(errors).toContain(`You must supply a value for abortIncompleteMultipartUpload. ${label}`);
      });

      it('still requires abortIncompleteMultipartUpload when expiredObjectDeleteMarker is combined with noncurrentVersionTransitions', () => {
        const errors: string[] = [];
        validate(
          makeConfig([
            {
              id: 'DeleteMarkerWithNoncurrentTransition',
              enabled: true,
              expiredObjectDeleteMarker: true,
              noncurrentVersionTransitions: [{ storageClass: 'GLACIER', transitionAfter: 365 }],
            },
          ]),
          errors,
        );
        expect(errors).toContain(`You must supply a value for abortIncompleteMultipartUpload. ${label}`);
      });

      it('accepts the mixed rule set from issue #3672', () => {
        const errors: string[] = [];
        validate(makeConfig([fullRule, deleteMarkerOnlyRule]), errors);
        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('validateConfigRuleAssets - lookupType and lookupKey validation', () => {
    const configDir = '/mock/config';

    beforeEach(() => {
      vi.restoreAllMocks();
      // Stub file existence checks so only lookupType/lookupKey logic is exercised
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    });

    it('should not produce errors for lookupType ResourceTypes', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([createCustomRule({ lookupType: 'ResourceTypes', lookupValue: ['AWS::EC2::Instance'] })]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('should not produce errors for lookupType Tag with a lookupKey', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([createCustomRule({ lookupType: 'Tag', lookupKey: 'Environment' })]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('should not produce errors for lookupType ResourceId with a lookupKey', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([createCustomRule({ lookupType: 'ResourceId', lookupKey: 'i-1234567890abcdef0' })]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('should produce an unsupported lookupType error for an invalid lookupType', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(configDir, createRuleSet([createCustomRule({ lookupType: 'InvalidType' })]), errors);
      expect(errors.some(e => e.includes("unsupported lookupType 'InvalidType'"))).toBe(true);
      expect(errors.some(e => e.includes('Valid values are: ResourceId, Tag, ResourceTypes'))).toBe(true);
    });

    it('should produce only the unsupported lookupType error for an invalid lookupType (no lookupKey check)', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(configDir, createRuleSet([createCustomRule({ lookupType: 'SomethingElse' })]), errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("unsupported lookupType 'SomethingElse'");
    });

    it('should produce only the unsupported lookupType error when an invalid lookupType has a lookupKey', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([createCustomRule({ lookupType: 'BadType', lookupKey: 'some-key' })]),
        errors,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("unsupported lookupType 'BadType'");
    });

    it('should produce a missing lookupKey error for lookupType Tag without lookupKey', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(configDir, createRuleSet([createCustomRule({ lookupType: 'Tag' })]), errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('requires a lookupKey value');
    });

    it('should produce a missing lookupKey error for lookupType ResourceId without lookupKey', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(configDir, createRuleSet([createCustomRule({ lookupType: 'ResourceId' })]), errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('requires a lookupKey value');
    });

    it('should include the rule name in error messages', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([createCustomRule({ name: 'my-specific-rule', lookupType: 'Bogus' })]),
        errors,
      );
      for (const error of errors) {
        expect(error).toContain('my-specific-rule');
      }
    });

    it('should allow a periodic-only rule without triggeringResources', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([
          createCustomRule({
            periodic: true,
            configurationChanges: false,
            includeTriggeringResources: false,
          }),
        ]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('should allow a configuration-change-only rule without maximumExecutionFrequency', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([
          createCustomRule({
            periodic: false,
            configurationChanges: true,
            includeMaximumExecutionFrequency: false,
          }),
        ]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('should reject a rule with no enabled evaluation mode', () => {
      const errors: string[] = [];
      validateConfigRuleAssets(
        configDir,
        createRuleSet([createCustomRule({ periodic: false, configurationChanges: false })]),
        errors,
      );
      expect(errors).toEqual([
        'Custom rule: test-custom-rule must enable at least one evaluation mode: periodic or configurationChanges',
      ]);
    });
  });

  describe('validateBlockPublicAmi', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validateBlockPublicAmi = (SecurityConfigValidator.prototype as any)['validateBlockPublicAmi'].bind({});

    it('should emit exactly one error for an invalid excludeAccounts entry', () => {
      const errors: string[] = [];
      validateBlockPublicAmi(
        { enable: true, excludeAccounts: ['NonExistentAccount'] },
        ['Management', 'Audit'],
        errors,
      );
      const matchingErrors = errors.filter(e => e.includes('NonExistentAccount'));
      expect(matchingErrors).toHaveLength(1);
    });

    it('should not emit errors when excludeAccounts are valid', () => {
      const errors: string[] = [];
      validateBlockPublicAmi({ enable: true, excludeAccounts: ['Management'] }, ['Management', 'Audit'], errors);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateAccessAnalyzerConfig', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validateAccessAnalyzerConfig = (SecurityConfigValidator.prototype as any)[
      'validateAccessAnalyzerConfig'
    ].bind({});

    it('should emit an error when the account analyzer is enabled but accessAnalyzer is disabled', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig({ enable: false, accountAnalyzer: { enable: true } }, errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('accountAnalyzer.enable');
    });

    it('should not emit errors when both are enabled', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig({ enable: true, accountAnalyzer: { enable: true } }, errors);
      expect(errors).toHaveLength(0);
    });

    it('should not emit errors when the account analyzer is omitted', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig({ enable: false }, errors);
      expect(errors).toHaveLength(0);
    });

    it('should not emit errors when the account analyzer is explicitly disabled', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig({ enable: false, accountAnalyzer: { enable: false } }, errors);
      expect(errors).toHaveLength(0);
    });

    it('should emit an error when deploymentTargets only excludes and would match nothing', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig(
        { enable: true, accountAnalyzer: { enable: true, deploymentTargets: { excludedRegions: ['cn-north-1'] } } },
        errors,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('no account or organizational unit was specified');
    });

    it('should emit an error when deploymentTargets has empty account and organizational unit lists', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig(
        {
          enable: true,
          accountAnalyzer: { enable: true, deploymentTargets: { accounts: [], organizationalUnits: [] } },
        },
        errors,
      );
      expect(errors).toHaveLength(1);
    });

    it('should not emit errors when deploymentTargets names an organizational unit alongside exclusions', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig(
        {
          enable: true,
          accountAnalyzer: {
            enable: true,
            deploymentTargets: { organizationalUnits: ['Root'], excludedRegions: ['cn-north-1'] },
          },
        },
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('should not emit errors when deploymentTargets names an account', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig(
        { enable: true, accountAnalyzer: { enable: true, deploymentTargets: { accounts: ['Audit'] } } },
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('should not emit deploymentTargets errors when the account analyzer is disabled', () => {
      const errors: string[] = [];
      validateAccessAnalyzerConfig(
        { enable: true, accountAnalyzer: { enable: false, deploymentTargets: { excludedRegions: ['cn-north-1'] } } },
        errors,
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateAccountAnalyzerDeploymentTargets', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validateAccounts = (SecurityConfigValidator.prototype as any)[
      'validateAccountAnalyzerDeploymentTargetAccounts'
    ].bind({});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validateOus = (SecurityConfigValidator.prototype as any)['validateAccountAnalyzerDeploymentTargetOUs'].bind(
      {},
    );

    const buildValues = (deploymentTargets: unknown) => ({
      accessAnalyzer: { enable: true, accountAnalyzer: { enable: true, deploymentTargets } },
    });

    it('should emit an error when a deployment target account does not exist', () => {
      const errors: string[] = [];
      validateAccounts(buildValues({ accounts: ['DoesNotExist'] }), ['Management', 'Audit'], errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('DoesNotExist');
    });

    it('should not emit errors when deployment target accounts exist', () => {
      const errors: string[] = [];
      validateAccounts(buildValues({ accounts: ['Audit'] }), ['Management', 'Audit'], errors);
      expect(errors).toHaveLength(0);
    });

    it('should emit an error when a deployment target OU does not exist', () => {
      const errors: string[] = [];
      validateOus(buildValues({ organizationalUnits: ['DoesNotExist'] }), ['Root', 'Infrastructure'], errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('DoesNotExist');
    });

    it('should not emit errors when deployment target OUs exist', () => {
      const errors: string[] = [];
      validateOus(buildValues({ organizationalUnits: ['Infrastructure'] }), ['Root', 'Infrastructure'], errors);
      expect(errors).toHaveLength(0);
    });

    it('should not emit errors when deploymentTargets is not defined', () => {
      const errors: string[] = [];
      validateAccounts({ accessAnalyzer: { enable: true, accountAnalyzer: { enable: true } } }, ['Audit'], errors);
      validateOus({ accessAnalyzer: { enable: true, accountAnalyzer: { enable: true } } }, ['Root'], errors);
      expect(errors).toHaveLength(0);
    });

    it('should not emit errors when accountAnalyzer is not defined', () => {
      const errors: string[] = [];
      validateAccounts({ accessAnalyzer: { enable: true } }, ['Audit'], errors);
      validateOus({ accessAnalyzer: { enable: true } }, ['Root'], errors);
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateSecurityHubStandardDeploymentTargets', () => {
    it('should return early when securityHub deploymentTargets is not defined', () => {
      const errors: string[] = [];
      const values = buildSecurityHubValues({
        deploymentTargets: undefined,
        standards: [{ name: 'AWS Foundational Security Best Practices v1.0.0', enable: true }],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors).toHaveLength(0);
    });

    it('should return early when securityHub deploymentTargets include Root', () => {
      const errors: string[] = [];
      const values = buildSecurityHubValues({
        deploymentTargets: { organizationalUnits: ['Root'] },
        standards: [{ name: 'AWS Foundational Security Best Practices v1.0.0', enable: true }],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors).toHaveLength(0);
    });

    it('should require deploymentTargets for an enabled standard when securityHub deploymentTargets is defined', () => {
      const errors: string[] = [];
      const values = buildSecurityHubValues({
        deploymentTargets: { accounts: ['Workload01'] },
        standards: [{ name: 'CIS AWS Foundations Benchmark v1.2.0', enable: true }],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(
        '"deploymentTargets" is required for enabled standards when "deploymentTargets" for securityHub is defined',
      );
    });

    it('should NOT require deploymentTargets for a disabled standard', () => {
      const errors: string[] = [];
      const values = buildSecurityHubValues({
        deploymentTargets: { accounts: ['Workload01'] },
        standards: [{ name: 'CIS AWS Foundations Benchmark v1.2.0', enable: false }],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors).toHaveLength(0);
    });

    it('should NOT validate subset targets for a disabled standard targeting an account outside securityHub targets', () => {
      const errors: string[] = [];
      // securityHub targets only Workload01; the disabled standard points at Audit, which is
      // outside the securityHub targets. Because the standard is disabled it must be skipped entirely.
      const values = buildSecurityHubValues({
        deploymentTargets: { accounts: ['Workload01'] },
        standards: [
          {
            name: 'AWS Foundational Security Best Practices v1.0.0',
            enable: false,
            deploymentTargets: { accounts: ['Audit'] },
          },
        ],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors).toHaveLength(0);
    });

    it('should NOT validate subset targets for a disabled standard targeting a region outside securityHub targets', () => {
      const errors: string[] = [];
      // securityHub excludes us-west-2 (regions = [us-east-1]); the disabled standard excludes nothing
      // (regions = [us-east-1, us-west-2]), so us-west-2 falls outside the securityHub regions.
      // Because the standard is disabled it must be skipped entirely.
      const values = buildSecurityHubValues({
        deploymentTargets: { accounts: ['Workload01'], excludedRegions: ['us-west-2'] },
        standards: [
          {
            name: 'AWS Foundational Security Best Practices v1.0.0',
            enable: false,
            deploymentTargets: { accounts: ['Workload01'] },
          },
        ],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors).toHaveLength(0);
    });

    it('should produce no errors when an enabled standard targets are a subset of securityHub targets', () => {
      const errors: string[] = [];
      const values = buildSecurityHubValues({
        deploymentTargets: { accounts: ['Workload01'] },
        standards: [
          {
            name: 'AWS Foundational Security Best Practices v1.0.0',
            enable: true,
            deploymentTargets: { accounts: ['Workload01'] },
          },
        ],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors).toHaveLength(0);
    });

    it('should error when an enabled standard targets an account outside securityHub targets', () => {
      const errors: string[] = [];
      const values = buildSecurityHubValues({
        deploymentTargets: { accounts: ['Workload01'] },
        standards: [
          {
            name: 'AWS Foundational Security Best Practices v1.0.0',
            enable: true,
            deploymentTargets: { accounts: ['Audit'] },
          },
        ],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(errors.some(e => e.includes('not present in deployment targets for securityHub'))).toBe(true);
    });

    it('should error when an enabled standard targets a region outside securityHub targets', () => {
      const errors: string[] = [];
      // securityHub excludes us-west-2 (regions = [us-east-1]); the standard excludes nothing
      // (regions = [us-east-1, us-west-2]), so us-west-2 falls outside the securityHub regions.
      const values = buildSecurityHubValues({
        deploymentTargets: { accounts: ['Workload01'], excludedRegions: ['us-west-2'] },
        standards: [
          {
            name: 'AWS Foundational Security Best Practices v1.0.0',
            enable: true,
            deploymentTargets: { accounts: ['Workload01'] },
          },
        ],
      });
      validateSecurityHubStandardDeploymentTargets(values, mockAccountsConfig, mockGlobalConfig, errors);
      expect(
        errors.some(e => e.includes('region: "us-west-2" not present in deployment targets for securityHub')),
      ).toBe(true);
    });
  });

  describe('validateConfigRuleRemediationParameterTypes', () => {
    const configDir = '/mock/config';
    const ssmDocuments = [{ name: 'Custom-Remediation-Document', template: 'ssm-documents/remediation.yaml' }];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const proto = SecurityConfigValidator.prototype as any;
    const validateParameterTypesRaw = proto['validateConfigRuleRemediationParameterTypes'].bind(proto);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    // Collects blocking errors so the default (non-strict) cases can assert none were raised.
    let blockingErrors: string[];

    const validateParameterTypes = (
      dir: string,
      ruleSet: IAwsConfigRuleSet,
      documents: { name: string; template: string }[],
    ) => validateParameterTypesRaw(dir, ruleSet, documents, blockingErrors);

    const mockTemplate = (content: string) => {
      vi.spyOn(fs, 'readFileSync').mockReturnValue(content);
    };

    beforeEach(() => {
      vi.restoreAllMocks();
      loggedErrors.length = 0;
      loggedWarnings.length = 0;
      blockingErrors = [];
      setConfigValidationMode('off');
    });

    // The validation mode is process global, so restore it to keep later tests independent.
    afterEach(() => {
      setConfigValidationMode('off');
    });

    it('reports a type mismatch when String is configured but the document declares StringList', () => {
      mockTemplate(`
parameters:
  Policies:
    type: StringList
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Policies', value: 'PolicyA,PolicyB', type: 'String' }])]),
        ssmDocuments,
      );
      expect(
        loggedErrors.some(
          e =>
            e.includes('Policies') &&
            e.includes('configured as type String') &&
            e.includes('declares it as StringList'),
        ),
      ).toBe(true);
    });

    it('reports a type mismatch when StringList is configured but the document declares String', () => {
      mockTemplate(`
parameters:
  Configuration:
    type: String
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Configuration', value: 'a,b', type: 'StringList' }])]),
        ssmDocuments,
      );
      expect(
        loggedErrors.some(e => e.includes('configured as type StringList') && e.includes('declares it as String')),
      ).toBe(true);
    });

    it('does not report when configured types match the document declaration', () => {
      mockTemplate(`
parameters:
  ResourceId:
    type: String
  Policies:
    type: StringList
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([
          createRemediationRule([
            { name: 'ResourceId', value: 'RESOURCE_ID', type: 'String' },
            { name: 'Policies', value: 'PolicyA,PolicyB', type: 'StringList' },
          ]),
        ]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
    });

    it('does not report a type mismatch when the value has no comma and both types submit the same value', () => {
      mockTemplate(`
parameters:
  LogDestination:
    type: String
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([
          createRemediationRule([{ name: 'LogDestination', value: 'my-log-bucket', type: 'StringList' }]),
        ]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
    });

    it('does not report a type mismatch for an unresolved replacement value', () => {
      mockTemplate(`
parameters:
  KMSMasterKey:
    type: String
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([
          createRemediationRule([{ name: 'KMSMasterKey', value: '${ACCEL_LOOKUP::KMS}', type: 'StringList' }]),
        ]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
    });

    it.each(['StringMap', 'MapList', 'Integer', 'Boolean'])(
      'does not report a type mismatch when the document declares the non-comparable type %s',
      documentType => {
        mockTemplate(`
parameters:
  Payload:
    type: ${documentType}
`);
        validateParameterTypes(
          configDir,
          createRuleSet([createRemediationRule([{ name: 'Payload', value: 'a,b', type: 'String' }])]),
          ssmDocuments,
        );
        expect(loggedErrors).toHaveLength(0);
        expect(blockingErrors).toHaveLength(0);
      },
    );

    it('does not block a non-comparable document type in strict mode', () => {
      setConfigValidationMode('strict');
      mockTemplate(`
parameters:
  Tags:
    type: StringMap
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Tags', value: '{"a":"b","c":"d"}', type: 'String' }])]),
        ssmDocuments,
      );
      expect(blockingErrors).toHaveLength(0);
    });

    it('still reports a missing required parameter declared with a non-comparable type', () => {
      mockTemplate(`
parameters:
  Tags:
    type: StringMap
`);
      validateParameterTypes(configDir, createRuleSet([createRemediationRule([])]), ssmDocuments);
      expect(loggedErrors.some(e => e.includes('requires parameter Tags'))).toBe(true);
    });

    it('does not report a type mismatch when the document type is not a string', () => {
      mockTemplate(`
parameters:
  Broken:
    type:
      nested: value
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Broken', value: 'a,b', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
    });

    it('reports a type mismatch on an optional parameter that is configured', () => {
      mockTemplate(`
parameters:
  Optional:
    type: StringList
    default: []
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Optional', value: 'PolicyA,PolicyB', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(1);
      expect(loggedErrors[0]).toContain('configured as type String');
      expect(loggedErrors[0]).toContain('declares it as StringList');
    });

    it('blocks a type mismatch on an optional parameter in strict mode', () => {
      setConfigValidationMode('strict');
      mockTemplate(`
parameters:
  Optional:
    type: String
    default: ""
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Optional', value: 'a,b', type: 'StringList' }])]),
        ssmDocuments,
      );
      expect(blockingErrors).toHaveLength(1);
      expect(blockingErrors[0]).toContain('configured as type StringList');
    });

    it('does not report a configured parameter that the target document does not declare', () => {
      mockTemplate(`
parameters:
  ResourceId:
    type: String
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([
          createRemediationRule([
            { name: 'ResourceId', value: 'RESOURCE_ID', type: 'String' },
            { name: 'Extra', value: 'value', type: 'String' },
          ]),
        ]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
    });

    it('reports a required document parameter that is missing from the configuration', () => {
      mockTemplate(`
parameters:
  ResourceId:
    type: String
  RequiredTags:
    type: String
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'ResourceId', value: 'RESOURCE_ID', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors.some(e => e.includes('requires parameter RequiredTags'))).toBe(true);
    });

    it('does not report AutomationAssumeRole or parameters with defaults as missing', () => {
      mockTemplate(`
parameters:
  ResourceId:
    type: String
  Optional:
    type: StringList
    default: []
  AutomationAssumeRole:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'ResourceId', value: 'RESOURCE_ID', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
    });

    it('skips documents owned by AWS because their definition is not available locally', () => {
      // A template that would report a mismatch is resolvable for this target, so the test fails if
      // the AWS owned document is not skipped before the template is read.
      mockTemplate(`
parameters:
  Anything:
    type: StringList
`);
      validateParameterTypes(
        configDir,
        createRuleSet([
          createRemediationRule([{ name: 'Anything', value: 'value', type: 'String' }], {
            targetId: 'AWSConfigRemediation-EnableS3BucketEncryption',
          }),
        ]),
        [
          ...ssmDocuments,
          {
            name: 'AWSConfigRemediation-EnableS3BucketEncryption',
            template: 'ssm-documents/aws-owned.yaml',
          },
        ],
      );
      expect(fs.readFileSync).not.toHaveBeenCalled();
      expect(loggedErrors).toHaveLength(0);
    });

    it('does not report when the template cannot be parsed', () => {
      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        throw new Error('ENOENT');
      });
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Policies', value: 'a,b', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
    });

    it('logs without blocking validation in off mode', () => {
      mockTemplate(`
parameters:
  Policies:
    type: StringList
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Policies', value: 'PolicyA,PolicyB', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(1);
      expect(blockingErrors).toHaveLength(0);
    });

    it('logs without blocking validation in warn mode', () => {
      setConfigValidationMode('warn');
      mockTemplate(`
parameters:
  Policies:
    type: StringList
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Policies', value: 'PolicyA,PolicyB', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(1);
      expect(blockingErrors).toHaveLength(0);
    });

    it('fails validation in strict mode instead of only logging', () => {
      setConfigValidationMode('strict');
      mockTemplate(`
parameters:
  Policies:
    type: StringList
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Policies', value: 'PolicyA,PolicyB', type: 'String' }])]),
        ssmDocuments,
      );
      expect(loggedErrors).toHaveLength(0);
      expect(blockingErrors).toHaveLength(1);
      expect(blockingErrors[0]).toContain('configured as type String');
      expect(blockingErrors[0]).toContain('declares it as StringList');
    });

    it('logs without blocking a missing required parameter even in strict mode', () => {
      setConfigValidationMode('strict');
      mockTemplate(`
parameters:
  RequiredTags:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([createRemediationRule([{ name: 'Extra', value: 'value', type: 'String' }])]),
        ssmDocuments,
      );
      expect(blockingErrors).toHaveLength(0);
      expect(loggedErrors).toHaveLength(1);
      expect(loggedErrors[0]).toContain('requires parameter RequiredTags');
    });

    it('does not fail validation in strict mode when the value equivalence gate applies', () => {
      setConfigValidationMode('strict');
      mockTemplate(`
parameters:
  LogDestination:
    type: String
`);
      validateParameterTypes(
        configDir,
        createRuleSet([
          createRemediationRule([{ name: 'LogDestination', value: 'my-log-bucket', type: 'StringList' }]),
        ]),
        ssmDocuments,
      );
      expect(blockingErrors).toHaveLength(0);
      expect(loggedErrors).toHaveLength(0);
    });
  });

  describe('validateConfigRuleRemediationParameterValues', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const proto = SecurityConfigValidator.prototype as any;
    const validateParameterValues = proto['validateConfigRuleRemediationParameterValues'].bind(proto);
    /* eslint-enable @typescript-eslint/no-explicit-any */

    it('reports a String value longer than the 256 character StaticValue limit', () => {
      const errors: string[] = [];
      validateParameterValues(
        createRuleSet([createRemediationRule([{ name: 'LongValue', value: 'a'.repeat(257), type: 'String' }])]),
        errors,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('length 257');
      expect(errors[0]).toContain('exceeds the AWS Config limit of 256 characters');
    });

    it('accepts a String value exactly at the 256 character limit', () => {
      const errors: string[] = [];
      validateParameterValues(
        createRuleSet([createRemediationRule([{ name: 'MaxValue', value: 'a'.repeat(256), type: 'String' }])]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('does not split a String value on commas when checking length', () => {
      const errors: string[] = [];
      // 300 characters total, but each comma separated segment is short.
      const value = Array.from({ length: 60 }, () => 'abcd').join(',');
      validateParameterValues(
        createRuleSet([createRemediationRule([{ name: 'CommaValue', value, type: 'String' }])]),
        errors,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('of type String');
    });

    it('reports a StringList resolving to more than 25 items', () => {
      const errors: string[] = [];
      const value = Array.from({ length: 26 }, (_, index) => `item${index}`).join(',');
      validateParameterValues(
        createRuleSet([createRemediationRule([{ name: 'TooManyItems', value, type: 'StringList' }])]),
        errors,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('resolves to 26 values');
      expect(errors[0]).toContain('exceeds the AWS Config limit of 25');
    });

    it('accepts a StringList resolving to exactly 25 items', () => {
      const errors: string[] = [];
      const value = Array.from({ length: 25 }, (_, index) => `item${index}`).join(',');
      validateParameterValues(
        createRuleSet([createRemediationRule([{ name: 'MaxItems', value, type: 'StringList' }])]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('reports a StringList item longer than the 256 character limit', () => {
      const errors: string[] = [];
      validateParameterValues(
        createRuleSet([
          createRemediationRule([{ name: 'LongItem', value: `short,${'b'.repeat(257)}`, type: 'StringList' }]),
        ]),
        errors,
      );
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('of type StringList');
      expect(errors[0]).toContain('length 257');
    });

    it('skips RESOURCE_ID and ACCEL_LOOKUP replacement values', () => {
      const errors: string[] = [];
      validateParameterValues(
        createRuleSet([
          createRemediationRule([
            { name: 'ResourceId', value: 'RESOURCE_ID', type: 'String' },
            { name: 'Kms', value: '${ACCEL_LOOKUP::KMS}', type: 'String' },
          ]),
        ]),
        errors,
      );
      expect(errors).toHaveLength(0);
    });

    it('includes the rule name in reported errors', () => {
      const errors: string[] = [];
      validateParameterValues(
        createRuleSet([
          createRemediationRule([{ name: 'LongValue', value: 'a'.repeat(300), type: 'String' }], {
            name: 'my-specific-rule',
          }),
        ]),
        errors,
      );
      expect(errors[0]).toContain('my-specific-rule');
    });
  });
});

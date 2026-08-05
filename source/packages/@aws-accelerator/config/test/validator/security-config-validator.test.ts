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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { SecurityConfigValidator } from '../../validator/security-config-validator';
import {
  IAwsConfigRuleSet,
  IConfigRule,
  ICustomRuleConfigType,
  ISecurityConfig,
} from '../../lib/models/security-config';
import { DeploymentTargets, ILifecycleRule } from '../../lib/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateConfigRuleAssets = (SecurityConfigValidator.prototype as any)['validateConfigRuleAssets'].bind({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateSecurityHubStandardDeploymentTargets = (SecurityConfigValidator.prototype as any)[
  'validateSecurityHubStandardDeploymentTargetsInSecurityHubDeploymentTargets'
].bind({});

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

describe('SecurityConfigValidator', () => {
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
});

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
import { IAwsConfigRuleSet, IConfigRule, ICustomRuleConfigType } from '../../lib/models/security-config';
import { DeploymentTargets } from '../../lib/common';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const validateConfigRuleAssets = (SecurityConfigValidator.prototype as any)['validateConfigRuleAssets'].bind({});

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
});

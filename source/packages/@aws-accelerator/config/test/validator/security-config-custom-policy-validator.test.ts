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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { IAwsConfigRuleSet } from '../../lib/models/security-config';
import { SecurityConfigValidator } from '../../validator/security-config-validator';

/**
 * Tests for the validateConfigRuleAssets private method in SecurityConfigValidator.
 *
 * We access the private method directly via bracket notation on the prototype,
 * and mock fs.existsSync / fs.readFileSync to avoid filesystem side effects.
 */
describe('SecurityConfigValidator - validateConfigRuleAssets (CustomPolicy)', () => {
  let existsSyncSpy: ReturnType<typeof vi.spyOn>;
  let readFileSyncSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    existsSyncSpy = vi.spyOn(fs, 'existsSync');
    readFileSyncSpy = vi.spyOn(fs, 'readFileSync');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Calls the private validateConfigRuleAssets method directly.
   * Returns the errors array after validation.
   */
  function callValidateConfigRuleAssets(ruleSet: IAwsConfigRuleSet): string[] {
    const errors: string[] = [];
    // Access private method via prototype bracket notation
    SecurityConfigValidator.prototype['validateConfigRuleAssets'].call(null, '/mock/config', ruleSet, errors);
    return errors;
  }

  it('should produce no errors for a valid CustomPolicy rule with inline policyText', () => {
    // Inline text is not a file path, so existsSync returns false
    existsSyncSpy.mockReturnValue(false);

    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'guard-inline-test',
          type: 'CustomPolicy',
          description: 'Test guard rule',
          complianceResourceTypes: ['AWS::S3::Bucket'],
          customPolicyRule: {
            policyText: 'rule check when resourceType == "AWS::S3::Bucket" { configuration.BucketName exists }',
            enableDebugLog: false,
          },
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(0);
  });

  it('should produce no errors for a valid CustomPolicy rule with file path policyText under 10k', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue('rule check { configuration.BucketName exists }');

    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'guard-file-test',
          type: 'CustomPolicy',
          complianceResourceTypes: ['AWS::S3::Bucket'],
          customPolicyRule: {
            policyText: 'rules/my-rule.guard',
          },
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(0);
  });

  it('should error when type is CustomPolicy but customPolicyRule is missing', () => {
    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'guard-no-config',
          type: 'CustomPolicy',
          complianceResourceTypes: ['AWS::S3::Bucket'],
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('has type "CustomPolicy" but no customPolicyRule configuration provided');
  });

  it('should error when guard policy file content exceeds 10,000 characters', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue('x'.repeat(10001));

    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'guard-oversized-file',
          type: 'CustomPolicy',
          complianceResourceTypes: ['AWS::S3::Bucket'],
          customPolicyRule: {
            policyText: 'rules/oversized.guard',
          },
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('guard policy file content exceeds 10,000 character limit');
  });

  it('should error when inline policyText exceeds 10,000 characters', () => {
    // Not a file path, so existsSync returns false
    existsSyncSpy.mockReturnValue(false);

    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'guard-oversized-inline',
          type: 'CustomPolicy',
          complianceResourceTypes: ['AWS::S3::Bucket'],
          customPolicyRule: {
            policyText: 'x'.repeat(10001),
          },
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('inline policyText exceeds 10,000 character limit');
  });

  it('should error when type is Custom but customRule is missing', () => {
    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'custom-no-config',
          type: 'Custom',
          complianceResourceTypes: ['AWS::S3::Bucket'],
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('has type "Custom" but no customRule configuration provided');
  });

  it('should produce no errors for managed rules (backward compatibility)', () => {
    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'managed-rule',
          complianceResourceTypes: ['AWS::IAM::User'],
          identifier: 'IAM_USER_GROUP_MEMBERSHIP_CHECK',
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(0);
  });

  it('should produce no errors for empty rules array', () => {
    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(0);
  });

  it('should validate mixed rule types correctly', () => {
    existsSyncSpy.mockReturnValue(false);

    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'managed-rule',
          complianceResourceTypes: ['AWS::IAM::User'],
          identifier: 'IAM_USER_GROUP_MEMBERSHIP_CHECK',
        },
        {
          name: 'guard-rule',
          type: 'CustomPolicy',
          complianceResourceTypes: ['AWS::S3::Bucket'],
          customPolicyRule: {
            policyText: 'rule check { configuration.BucketName exists }',
          },
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(0);
  });

  it('should not error for file content exactly at 10,000 characters', () => {
    existsSyncSpy.mockReturnValue(true);
    readFileSyncSpy.mockReturnValue('x'.repeat(10000));

    const errors = callValidateConfigRuleAssets({
      deploymentTargets: { organizationalUnits: ['Root'] },
      rules: [
        {
          name: 'guard-exact-limit',
          type: 'CustomPolicy',
          complianceResourceTypes: ['AWS::S3::Bucket'],
          customPolicyRule: {
            policyText: 'rules/exact-limit.guard',
          },
        },
      ],
    } as unknown as IAwsConfigRuleSet);

    expect(errors).toHaveLength(0);
  });
});

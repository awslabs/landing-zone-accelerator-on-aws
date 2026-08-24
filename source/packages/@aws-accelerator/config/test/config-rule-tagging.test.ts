/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeConfigRuleGlobalTags, getConfigRuleTagValidationErrors } from '../lib/config-rule-tagging';

const baseProps = {
  ruleName: 'test-rule',
  partition: 'aws',
  acceleratorPrefix: 'AWSAccelerator',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('analyzeConfigRuleGlobalTags', () => {
  it('manages static global and Accelerator tags while rule keys take precedence', () => {
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [
        { key: 'Owner', value: 'global' },
        { key: 'GlobalOnly', value: 'global' },
      ],
      ruleTags: [
        { key: 'Owner', value: 'rule' },
        { key: 'RuleOnly', value: 'rule' },
      ],
    });

    expect(result).toEqual({
      moduleTags: [
        { key: 'Accelerator', value: 'AWSAccelerator' },
        { key: 'GlobalOnly', value: 'global' },
      ],
      externallyManagedTagKeys: ['Owner', 'RuleOnly'],
      skippedGlobalTags: [],
    });
  });

  it('yields ownership of colliding global and Accelerator keys to rule tags', () => {
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [
        { key: 'Owner', value: 'global' },
        { key: 'GlobalOnly', value: 'global' },
      ],
      ruleTags: [
        { key: 'Owner', value: 'rule' },
        { key: 'Accelerator', value: 'rule' },
      ],
    });

    expect(result.moduleTags).toEqual([{ key: 'GlobalOnly', value: 'global' }]);
    expect(result.externallyManagedTagKeys).toEqual(['Accelerator', 'Owner']);
    expect(result.skippedGlobalTags).toEqual([]);
  });

  it.each([
    '{{resolve:ssm:/path}}',
    '{{resolve:ssm:/path:42}}',
    'prefix-{{resolve:ssm:/path}}',
    '{{resolve:ssm:/one}}-{{resolve:ssm:/two:3}}-{{resolve:ssm:/one}}',
  ])('returns a target-resolved template for plaintext SSM global value %s', value => {
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [{ key: 'DynamicGlobal', value }],
    });

    expect(result.moduleTags).toEqual([
      { key: 'Accelerator', value: 'AWSAccelerator' },
      { key: 'DynamicGlobal', dynamicValue: value },
    ]);
    expect(result.skippedGlobalTags).toEqual([]);
  });

  it.each([
    '{{resolve:ssm-secure:/secret}}',
    '{{resolve:secretsmanager:secret-id:SecretString:value}}',
    '{{resolve:unknown:identifier}}',
    '{{resolve:ssm:/path:not-a-version}}',
    '{{resolve:ssm:/path with space}}',
    '{{resolve:ssm:/path:}}',
    '{{resolve:ssm:/path',
  ])('skips unsupported or malformed global dynamic value %s before request construction', value => {
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [{ key: 'DynamicGlobal', value }],
    });

    expect(result.moduleTags).toEqual([{ key: 'Accelerator', value: 'AWSAccelerator' }]);
    expect(result.skippedGlobalTags).toEqual([{ key: 'DynamicGlobal', reason: 'unsupported-dynamic-reference' }]);
    expect(JSON.stringify(result)).not.toContain(value);
  });

  it('skips a dynamic global key without blocking analysis', () => {
    const key = 'team-{{resolve:secretsmanager:secret-id:SecretString:key}}';
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [{ key, value: 'value' }],
    });

    expect(result.skippedGlobalTags).toEqual([{ key, reason: 'unsupported-dynamic-reference' }]);
    expect(result.moduleTags).toEqual([{ key: 'Accelerator', value: 'AWSAccelerator' }]);
  });

  it.each([
    '{{resolve:ssm:/rule-tag:7}}',
    '{{resolve:ssm-secure:/secret}}',
    '{{resolve:secretsmanager:secret-id:SecretString:value}}',
    'prefix-{{resolve:ssm:/path}}',
  ])('leaves a rule tag with dynamic value %s to the custom resource', value => {
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [{ key: 'GlobalOnly', value: 'global' }],
      ruleTags: [{ key: 'RuleDynamic', value }],
    });

    expect(result.externallyManagedTagKeys).toEqual(['RuleDynamic']);
    expect(result.moduleTags.map(tag => tag.key)).toEqual(['Accelerator', 'GlobalOnly']);
    expect(result.skippedGlobalTags).toEqual([]);
  });

  it('manages nothing on a rule with a dynamic rule tag key', () => {
    const key = '{{resolve:ssm:/rule-key}}';
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [{ key: 'GlobalOnly', value: 'global' }],
      ruleTags: [
        { key, value: 'value' },
        { key: 'StaticRuleTag', value: 'value' },
      ],
    });

    expect(result.moduleTags).toEqual([]);
    expect(result.skippedGlobalTags).toEqual([{ key, reason: 'dynamic-rule-key' }]);
    expect(result.externallyManagedTagKeys).toEqual(['StaticRuleTag']);
  });

  it('skips invalid static globals without exposing values', () => {
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [
        { key: 'CommaValue', value: 'one,two' },
        { key: 'InvalidValue', value: 'secret!' },
      ],
    });

    expect(result.skippedGlobalTags).toEqual([
      { key: 'CommaValue', reason: 'unsupported-characters' },
      { key: 'InvalidValue', reason: 'unsupported-characters' },
    ]);
    expect(JSON.stringify(result.skippedGlobalTags)).not.toContain('one,two');
    expect(JSON.stringify(result.skippedGlobalTags)).not.toContain('secret!');
  });

  it('returns every eligible candidate without config-time capacity truncation', () => {
    const ruleTags = Array.from({ length: 48 }, (_, index) => ({ key: `Rule${index}`, value: 'value' }));
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [
        { key: 'GlobalA', value: 'value' },
        { key: 'GlobalB', value: 'value' },
      ],
      ruleTags,
    });

    expect(result.moduleTags).toEqual([
      { key: 'Accelerator', value: 'AWSAccelerator' },
      { key: 'GlobalA', value: 'value' },
      { key: 'GlobalB', value: 'value' },
    ]);
    expect(result.skippedGlobalTags).toEqual([]);
  });

  it('filters an unsupported dynamic candidate before a later valid static candidate', () => {
    const unsupportedValue = '{{resolve:ssm-secure:/sensitive/capacity-slot}}';
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags: [
        { key: 'AUnsupported', value: unsupportedValue },
        { key: 'ZValid', value: 'value' },
      ],
    });

    expect(result.moduleTags).toEqual([
      { key: 'Accelerator', value: 'AWSAccelerator' },
      { key: 'ZValid', value: 'value' },
    ]);
    expect(result.skippedGlobalTags).toEqual([{ key: 'AUnsupported', reason: 'unsupported-dynamic-reference' }]);
    expect(JSON.stringify(result)).not.toContain(unsupportedValue);
  });

  it('does not count a rule and global collision twice', () => {
    const globalTags = Array.from({ length: 49 }, (_, index) => ({ key: `Global${index}`, value: 'value' }));
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      globalTags,
      ruleTags: [{ key: 'Global0', value: 'rule' }],
    });

    expect(result.moduleTags).toHaveLength(49);
    expect(result.externallyManagedTagKeys).toEqual(['Global0']);
  });

  it('omits global and Accelerator tags when tagging is disabled for ISO', () => {
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      partition: 'aws-iso',
      globalTags: [{ key: 'GlobalOnly', value: 'global' }],
      ruleTags: [{ key: 'RuleOnly', value: 'rule' }],
    });

    expect(result.moduleTags).toEqual([]);
    expect(result.externallyManagedTagKeys).toEqual(['RuleOnly']);
  });

  it('honors the ISO Accelerator tag override', () => {
    vi.stubEnv('ACCELERATOR_ENABLE_TAG', 'true');
    const result = analyzeConfigRuleGlobalTags({
      ...baseProps,
      partition: 'aws-iso-b',
      globalTags: [{ key: 'GlobalOnly', value: 'global' }],
    });

    expect(result.moduleTags).toEqual([
      { key: 'Accelerator', value: 'AWSAccelerator' },
      { key: 'GlobalOnly', value: 'global' },
    ]);
  });
});

describe('getConfigRuleTagValidationErrors', () => {
  it('returns no errors when rule tags are absent', () => {
    expect(getConfigRuleTagValidationErrors('test-rule')).toEqual([]);
    expect(getConfigRuleTagValidationErrors('test-rule', [])).toEqual([]);
  });

  it.each([
    ['a plaintext SSM reference', '{{resolve:ssm:/p}}'],
    ['a versioned plaintext SSM reference', '{{resolve:ssm:/p:42}}'],
    ['a secure SSM reference', '{{resolve:ssm-secure:/accelerator/secret}}'],
    ['a Secrets Manager reference', '{{resolve:secretsmanager:x}}'],
    ['an embedded reference', 'prefix-{{resolve:ssm:/p}}'],
    ['a reference with an invalid static character', '{{resolve:ssm:/path with space}}'],
  ])('keeps %s outside config-time compatibility-safe validation', (_description, value) => {
    expect(getConfigRuleTagValidationErrors('test-rule', [{ key: 'Owner', value }])).toEqual([]);
  });

  it('keeps dynamic rule tag keys outside config-time compatibility-safe validation', () => {
    expect(
      getConfigRuleTagValidationErrors('test-rule', [{ key: 'aws:{{resolve:ssm:/p}}', value: 'invalid!' }]),
    ).toEqual([]);
  });

  it.each([
    ['an empty key', { key: '', value: 'value' }, 'must contain between 1 and 128 characters'],
    ['a 129-character key', { key: 'k'.repeat(129), value: 'value' }, 'must contain between 1 and 128 characters'],
    ['a reserved key prefix', { key: 'AWS:Reserved', value: 'value' }, 'reserved aws: prefix'],
    ['a 257-character value', { key: 'Owner', value: 'v'.repeat(257) }, 'exceeds 256 characters'],
  ])('rejects %s', (_description, tag, expectedMessage) => {
    const errors = getConfigRuleTagValidationErrors('test-rule', [tag]);

    expect(errors.some(error => error.message.includes(expectedMessage))).toBe(true);
  });

  it.each([
    ['an illegal key character', { key: 'Owner!', value: 'value' }],
    ['an illegal value character', { key: 'Owner', value: 'invalid!' }],
    ['a reserved value prefix', { key: 'Owner', value: 'AWS:Reserved' }],
  ])('keeps %s outside the config-time compatibility-safe subset', (_description, tag) => {
    expect(getConfigRuleTagValidationErrors('test-rule', [tag])).toEqual([]);
  });

  it('counts astral Unicode letters as single code points for key and value limits', () => {
    const astralLetter = '\u{10400}';

    expect(
      getConfigRuleTagValidationErrors('test-rule', [
        { key: astralLetter.repeat(128), value: astralLetter.repeat(256) },
      ]),
    ).toEqual([]);
    expect(
      getConfigRuleTagValidationErrors('test-rule', [{ key: astralLetter.repeat(129), value: 'value' }]).map(
        error => error.reason,
      ),
    ).toEqual(['key-too-long']);
    expect(
      getConfigRuleTagValidationErrors('test-rule', [{ key: 'Owner', value: astralLetter.repeat(257) }]).map(
        error => error.reason,
      ),
    ).toEqual(['value-too-long']);
  });

  it('uses last-key-wins for duplicate rule tags before validation', () => {
    expect(
      getConfigRuleTagValidationErrors('test-rule', [
        { key: 'Duplicate', value: 'v'.repeat(257) },
        { key: 'Duplicate', value: 'valid' },
      ]),
    ).toEqual([]);
    expect(
      getConfigRuleTagValidationErrors('test-rule', [
        { key: 'Duplicate', value: 'valid' },
        { key: 'Duplicate', value: 'v'.repeat(257) },
      ]).map(error => error.reason),
    ).toEqual(['value-too-long']);
  });

  it('does not report the tag limit for 50 deduplicated rule tags', () => {
    const ruleTags = Array.from({ length: 50 }, (_, index) => ({ key: `Rule${index}`, value: 'value' }));

    expect(getConfigRuleTagValidationErrors('test-rule', [...ruleTags, ruleTags[0]])).toEqual([]);
  });

  it('reports the tag limit for more than 50 rule tags', () => {
    const ruleTags = Array.from({ length: 51 }, (_, index) => ({ key: `Rule${index}`, value: 'value' }));

    expect(getConfigRuleTagValidationErrors('test-rule', ruleTags)).toEqual([
      {
        reason: 'too-many-configured-tags',
        message: 'AWS Config rule "test-rule" has 51 rule-specific tag keys, exceeding the limit of 50',
      },
    ]);
  });

  it('never repeats a tag value in a validation message', () => {
    const errors = getConfigRuleTagValidationErrors('test-rule', [
      { key: 'Owner', value: `super-secret-${'v'.repeat(257)}` },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0].message).not.toContain('super-secret');
  });
});

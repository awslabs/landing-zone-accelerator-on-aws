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

import { describe, it, expect } from 'vitest';
import { ConfigRule, CustomPolicyRuleConfig, CustomRuleConfig } from '../lib/security-config';

describe('CustomPolicyRuleConfig', () => {
  describe('constructor defaults', () => {
    it('should initialize with empty policyText', () => {
      const config = new CustomPolicyRuleConfig();
      expect(config.policyText).toBe('');
    });

    it('should initialize with undefined enableDebugLog', () => {
      const config = new CustomPolicyRuleConfig();
      expect(config.enableDebugLog).toBeUndefined();
    });
  });
});

describe('ConfigRule with customPolicyRule', () => {
  it('should have customPolicyRule as undefined by default', () => {
    const rule = new ConfigRule();
    expect(rule.customPolicyRule).toBeUndefined();
  });

  it('should still have customRule as undefined by default', () => {
    const rule = new ConfigRule();
    expect(rule.customRule).toBeUndefined();
  });

  it('should have all existing default values unchanged', () => {
    const rule = new ConfigRule();
    expect(rule.name).toBe('');
    expect(rule.description).toBe('');
    expect(rule.identifier).toBe('');
    expect(rule.inputParameters).toStrictEqual({});
    expect(rule.complianceResourceTypes).toStrictEqual([]);
    expect(rule.type).toBe('');
    expect(rule.tags).toStrictEqual([]);
    expect(rule.remediation).toBeDefined();
  });
});

describe('CustomRuleConfig backward compatibility', () => {
  it('should still initialize correctly', () => {
    const config = new CustomRuleConfig();
    expect(config.lambda).toBeDefined();
    expect(config.maximumExecutionFrequency).toBeUndefined();
    expect(config.triggeringResources).toBeUndefined();
  });
});

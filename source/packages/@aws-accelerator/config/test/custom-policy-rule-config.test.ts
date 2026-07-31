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
import { AccountsConfig } from '../lib/accounts-config';
import { ReplacementsConfig } from '../lib/replacements-config';
import { SecurityConfig } from '../lib/security-config';
import { SNAPSHOT_CONFIG } from './config-test-helper';

const configDir = SNAPSHOT_CONFIG;

const MINIMAL_SECURITY_CONFIG = `
centralSecurityServices:
  delegatedAdminAccount: Audit
  ebsDefaultVolumeEncryption:
    enable: false
  s3PublicAccessBlock:
    enable: false
  macie:
    enable: false
    publishSensitiveDataFindings: false
  guardduty:
    enable: false
    s3Protection:
      enable: false
    exportConfiguration:
      enable: false
      destinationType: S3
      exportFrequency: FIFTEEN_MINUTES
  securityHub:
    enable: false
    standards: []
  ssmAutomation:
    documentSets: []
accessAnalyzer:
  enable: false
iamPasswordPolicy:
  allowUsersToChangePassword: true
  hardExpiry: false
  requireUppercaseCharacters: true
  requireLowercaseCharacters: true
  requireSymbols: true
  requireNumbers: true
  minimumPasswordLength: 14
  passwordReusePrevention: 24
  maxPasswordAge: 90
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;

describe('SecurityConfig with CustomPolicy rules', () => {
  const accountsConfig = AccountsConfig.load(configDir);
  const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);

  it('should parse a config with a CustomPolicy rule with inline policyText', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: accelerator-dynamodb-pitr-check
          type: CustomPolicy
          description: Check DynamoDB PITR is enabled
          complianceResourceTypes:
            - AWS::DynamoDB::Table
          customPolicyRule:
            policyText: |
              rule checkcompliance when
                  resourceType == "AWS::DynamoDB::Table" {
                  let pitr = supplementaryConfiguration.ContinuousBackupsDescription.pointInTimeRecoveryDescription.pointInTimeRecoveryStatus
                  %pitr == "ENABLED"
              }
            enableDebugLog: false
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();

    const ruleSet = securityConfig!.awsConfig.ruleSets[0];
    expect(ruleSet).toBeDefined();
    expect(ruleSet.rules).toHaveLength(1);

    const rule = ruleSet.rules[0];
    expect(rule.name).toBe('accelerator-dynamodb-pitr-check');
    expect(rule.type).toBe('CustomPolicy');
    expect(rule.description).toBe('Check DynamoDB PITR is enabled');
    expect(rule.complianceResourceTypes).toStrictEqual(['AWS::DynamoDB::Table']);
    expect(rule.customPolicyRule).toBeDefined();
    expect(rule.customPolicyRule!.policyText).toContain('checkcompliance');
    expect(rule.customPolicyRule!.enableDebugLog).toBe(false);
    // customRule should be undefined for CustomPolicy type
    expect(rule.customRule).toBeUndefined();
  });

  it('should parse a config with a CustomPolicy rule with file path policyText', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: accelerator-s3-encryption-check
          type: CustomPolicy
          description: Check S3 encryption
          complianceResourceTypes:
            - AWS::S3::Bucket
          customPolicyRule:
            policyText: custom-config-rules/s3-encryption.guard
            enableDebugLog: true
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();

    const rule = securityConfig!.awsConfig.ruleSets[0].rules[0];
    expect(rule.name).toBe('accelerator-s3-encryption-check');
    expect(rule.type).toBe('CustomPolicy');
    expect(rule.customPolicyRule).toBeDefined();
    expect(rule.customPolicyRule!.policyText).toBe('custom-config-rules/s3-encryption.guard');
    expect(rule.customPolicyRule!.enableDebugLog).toBe(true);
  });

  it('should parse a config with mixed rule types (managed, Custom, CustomPolicy)', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: accelerator-iam-check
          complianceResourceTypes:
            - AWS::IAM::User
          identifier: IAM_USER_GROUP_MEMBERSHIP_CHECK
        - name: accelerator-guard-rule
          type: CustomPolicy
          description: Guard-based rule
          complianceResourceTypes:
            - AWS::S3::Bucket
          customPolicyRule:
            policyText: |
              rule check when resourceType == "AWS::S3::Bucket" {
                configuration.BucketName exists
              }
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();

    const rules = securityConfig!.awsConfig.ruleSets[0].rules;
    expect(rules).toHaveLength(2);

    // First rule: managed
    expect(rules[0].name).toBe('accelerator-iam-check');
    expect(rules[0].identifier).toBe('IAM_USER_GROUP_MEMBERSHIP_CHECK');
    expect(rules[0].customPolicyRule).toBeUndefined();

    // Second rule: CustomPolicy
    expect(rules[1].name).toBe('accelerator-guard-rule');
    expect(rules[1].type).toBe('CustomPolicy');
    expect(rules[1].customPolicyRule).toBeDefined();
    expect(rules[1].customPolicyRule!.policyText).toContain('check when resourceType');
  });

  it('should parse a config with no ruleSets (backward compatibility)', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();
    expect(securityConfig!.awsConfig.ruleSets).toStrictEqual([]);
  });

  it('should parse a config with only managed rules (backward compatibility)', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: accelerator-iam-check
          complianceResourceTypes:
            - AWS::IAM::User
          identifier: IAM_USER_GROUP_MEMBERSHIP_CHECK
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();

    const rule = securityConfig!.awsConfig.ruleSets[0].rules[0];
    expect(rule.name).toBe('accelerator-iam-check');
    expect(rule.customPolicyRule).toBeUndefined();
    expect(rule.customRule).toBeUndefined();
  });

  it('should parse CustomPolicy rule with enableDebugLog defaulting to undefined when not specified', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: accelerator-minimal-guard-rule
          type: CustomPolicy
          complianceResourceTypes:
            - AWS::EC2::Instance
          customPolicyRule:
            policyText: |
              rule check when resourceType == "AWS::EC2::Instance" {
                configuration.instanceType exists
              }
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();

    const rule = securityConfig!.awsConfig.ruleSets[0].rules[0];
    expect(rule.customPolicyRule).toBeDefined();
    expect(rule.customPolicyRule!.enableDebugLog).toBeUndefined();
  });

  it('should support inputParameters on CustomPolicy rules', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: accelerator-parameterized-guard-rule
          type: CustomPolicy
          description: Guard rule with parameters
          inputParameters:
            desiredInstanceType: t3.micro
          complianceResourceTypes:
            - AWS::EC2::Instance
          customPolicyRule:
            policyText: |
              rule check when resourceType == "AWS::EC2::Instance" {
                configuration.instanceType exists
              }
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();

    const rule = securityConfig!.awsConfig.ruleSets[0].rules[0];
    expect(rule.inputParameters).toStrictEqual({ desiredInstanceType: 't3.micro' });
    expect(rule.customPolicyRule).toBeDefined();
  });

  it('should support tags on CustomPolicy rules', () => {
    const configYaml = `${MINIMAL_SECURITY_CONFIG}
awsConfig:
  enableConfigurationRecorder: false
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: accelerator-tagged-guard-rule
          type: CustomPolicy
          complianceResourceTypes:
            - AWS::S3::Bucket
          tags:
            - key: Environment
              value: Production
          customPolicyRule:
            policyText: |
              rule check when resourceType == "AWS::S3::Bucket" {
                configuration.BucketName exists
              }
`;

    const securityConfig = SecurityConfig.loadFromString(configYaml, replacementsConfig);
    expect(securityConfig).toBeDefined();

    const rule = securityConfig!.awsConfig.ruleSets[0].rules[0];
    expect(rule.tags).toStrictEqual([{ key: 'Environment', value: 'Production' }]);
  });
});

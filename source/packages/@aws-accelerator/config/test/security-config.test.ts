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

import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsConfig } from '../lib/accounts-config';
import { ReplacementsConfig } from '../lib/replacements-config';
import { parseSecurityConfig } from '../lib/common/parse';
import {
  AccessAnalyzerConfig,
  AccountAnalyzerConfig,
  AlarmConfig,
  AlarmSetConfig,
  AuditManagerConfig,
  AuditManagerDefaultReportsDestinationConfig,
  AwsConfigAggregation,
  AwsConfigRuleSet,
  BlockPublicDocumentSharingConfig,
  ConfigRule,
  CustomPolicyRuleConfig,
  DetectiveConfig,
  DocumentConfig,
  DocumentSetConfig,
  EncryptionConfig,
  GuardDutyEksProtectionConfig,
  IsPublicSsmDoc,
  KeyConfig,
  LogGroupsConfig,
  MetricConfig,
  MetricSetConfig,
  SecurityConfig,
  SecurityHubLoggingCloudwatchConfig,
  SecurityHubLoggingConfig,
  SecurityHubStandardConfig,
  SnsSubscriptionConfig,
  SsmSettingsConfig,
} from '../lib/security-config';
import { SNAPSHOT_CONFIG } from './config-test-helper';

const configDir = SNAPSHOT_CONFIG;

describe('SecurityConfig', () => {
  describe('Test config', () => {
    const accountsConfig = AccountsConfig.load(configDir);
    const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
    const securityConfigFromFile = SecurityConfig.load(configDir, replacementsConfig);
    it('has loaded successfully', () => {
      expect(securityConfigFromFile.getDelegatedAccountName()).toBe('Audit');
    });

    it('has expected macie configuration', () => {
      expect(securityConfigFromFile.centralSecurityServices.macie?.enable).toBe(true);
      // that field is missing, so it's undefined. Ideally, it should be false as indicated by the code
      expect(securityConfigFromFile.centralSecurityServices.macie?.publishPolicyFindings).toBe(undefined);
      expect(securityConfigFromFile.centralSecurityServices.macie?.publishSensitiveDataFindings).toBe(true);
      expect(securityConfigFromFile.centralSecurityServices.macie?.policyFindingsPublishingFrequency).toBe(
        'FIFTEEN_MINUTES',
      );
    });

    expect(new KeyConfig().name).toEqual('');

    expect(new GuardDutyEksProtectionConfig().enable).toBe(false);

    expect(new AuditManagerDefaultReportsDestinationConfig().enable).toBe(false);

    expect(new AuditManagerConfig().enable).toBe(false);

    expect(new DetectiveConfig().enable).toBe(false);

    expect(new SecurityHubStandardConfig().enable).toBe(true);

    const securityHubLoggingCloudwatchConfig = new SecurityHubLoggingCloudwatchConfig();
    expect(securityHubLoggingCloudwatchConfig.enable).toEqual(true);
    expect(securityHubLoggingCloudwatchConfig.logGroupName).toBe(undefined);
    expect(securityHubLoggingCloudwatchConfig.logLevel).toEqual('HIGH');

    expect(new SecurityHubLoggingConfig().cloudWatch).toBeDefined();

    expect(new SnsSubscriptionConfig().email).toBe('');

    expect(new DocumentConfig().name).toBe('');

    expect(new DocumentSetConfig().documents).toStrictEqual([]);

    expect(new AwsConfigAggregation().enable).toBe(true);

    expect(new ConfigRule().name).toBe('');

    // CustomPolicyRuleConfig defaults
    const customPolicyRuleConfig = new CustomPolicyRuleConfig();
    expect(customPolicyRuleConfig.policyText).toBe('');
    expect(customPolicyRuleConfig.enableDebugLog).toBeUndefined();

    // ConfigRule should have customPolicyRule as undefined by default
    const configRule = new ConfigRule();
    expect(configRule.customPolicyRule).toBeUndefined();

    expect(new AwsConfigRuleSet().rules).toStrictEqual([]);

    expect(new MetricConfig().filterName).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(new MetricSetConfig().regions).toBeUndefined;

    expect(new AlarmConfig().alarmName).toBe('');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(new AlarmSetConfig().regions).toBeUndefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(new EncryptionConfig().kmsKeyName).toBeUndefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(new LogGroupsConfig().encryption).toBeUndefined;

    // Test BlockPublicDocumentSharingConfig
    const blockPublicDocumentSharingConfig = new BlockPublicDocumentSharingConfig();
    expect(blockPublicDocumentSharingConfig.enable).toBe(false);
    expect(blockPublicDocumentSharingConfig.excludeAccounts).toStrictEqual([]);

    // Test SsmSettingsConfig
    const ssmSettingsConfig = new SsmSettingsConfig();
    expect(ssmSettingsConfig.blockPublicDocumentSharing).toBeUndefined();
  });
});

describe('should throw an exception for wrong config', () => {
  it('should throw error when loading invalid config string', () => {
    function loadError() {
      const accountsConfig = AccountsConfig.load(configDir);
      const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
      SecurityConfig.loadFromString('some random string', replacementsConfig);
    }

    const errMsg = 'could not load configuration';
    expect(loadError).toThrow(new Error(errMsg));
  });
});

describe('should return right values for correct config', () => {
  it('should load config from string correctly', () => {
    const accountsConfig = AccountsConfig.load(configDir);
    const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);
    const buffer = fs.readFileSync(path.join(path.resolve(configDir), SecurityConfig.FILENAME), 'utf8');
    const securityConfigFromString = SecurityConfig.loadFromString(buffer, replacementsConfig);
    expect(securityConfigFromString?.awsConfig.enableConfigurationRecorder).toBe(true);
  });
});

describe('isPublicSsmDoc', () => {
  it('should return false for non-public documents', () => {
    expect(IsPublicSsmDoc('AWSDoc')).toBeFalsy(); // not public doc
    expect(IsPublicSsmDoc('Doc')).toBeFalsy(); // not public doc
    expect(IsPublicSsmDoc('AWSAccelerator-Attach-IAM-Instance-Profile')).toBeFalsy(); // not public doc
  });

  it('should return true for public documents', () => {
    expect(IsPublicSsmDoc('AWS-AWSAccelerator-Attach-IAM-Instance-Profile')).toBeTruthy(); //public doc
  });
});

describe('BlockPublicDocumentSharingConfig', () => {
  const accountsConfig = AccountsConfig.load(configDir);
  const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);

  describe('configuration parsing and validation', () => {
    it('should parse valid configuration with enable true and no excluded accounts', () => {
      const validConfig = `
centralSecurityServices:
  delegatedAdminAccount: Audit
  ebsDefaultVolumeEncryption:
    enable: false
  s3PublicAccessBlock:
    enable: false
  ssmSettings:
    blockPublicDocumentSharing:
      enable: true
      excludeAccounts: []
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
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
      const securityConfig = SecurityConfig.loadFromString(validConfig, replacementsConfig);

      expect(securityConfig).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing!.enable).toBe(true);
      expect(
        securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing!.excludeAccounts,
      ).toStrictEqual([]);
    });

    it('should parse valid configuration with enable false', () => {
      const validConfig = `
centralSecurityServices:
  delegatedAdminAccount: Audit
  ebsDefaultVolumeEncryption:
    enable: false
  s3PublicAccessBlock:
    enable: false
  ssmSettings:
    blockPublicDocumentSharing:
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
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
      const securityConfig = SecurityConfig.loadFromString(validConfig, replacementsConfig);

      expect(securityConfig).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing!.enable).toBe(false);
    });

    it('should parse valid configuration with excluded accounts', () => {
      const validConfig = `
centralSecurityServices:
  delegatedAdminAccount: Audit
  ebsDefaultVolumeEncryption:
    enable: false
  s3PublicAccessBlock:
    enable: false
  ssmSettings:
    blockPublicDocumentSharing:
      enable: true
      excludeAccounts:
        - Network
        - SharedServices
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
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
      const securityConfig = SecurityConfig.loadFromString(validConfig, replacementsConfig);

      expect(securityConfig).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing!.enable).toBe(true);
      expect(
        securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing!.excludeAccounts,
      ).toStrictEqual(['Network', 'SharedServices']);
    });

    it('should handle duplicate account names in excludeAccounts gracefully', () => {
      const validConfig = `
centralSecurityServices:
  delegatedAdminAccount: Audit
  ebsDefaultVolumeEncryption:
    enable: false
  s3PublicAccessBlock:
    enable: false
  ssmSettings:
    blockPublicDocumentSharing:
      enable: true
      excludeAccounts:
        - Network
        - Network
        - SharedServices
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
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
      const securityConfig = SecurityConfig.loadFromString(validConfig, replacementsConfig);

      expect(securityConfig).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing).toBeDefined();
      expect(
        securityConfig!.centralSecurityServices.ssmSettings!.blockPublicDocumentSharing!.excludeAccounts,
      ).toStrictEqual(['Network', 'Network', 'SharedServices']);
    });

    it('should reject configuration with invalid enable value', () => {
      const invalidConfig = `
centralSecurityServices:
  delegatedAdminAccount: Audit
  ebsDefaultVolumeEncryption:
    enable: false
  s3PublicAccessBlock:
    enable: false
  ssmSettings:
    blockPublicDocumentSharing:
      enable: "invalid"
  macie:
    enable: false
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
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
      expect(() => {
        SecurityConfig.loadFromString(invalidConfig, replacementsConfig);
      }).toThrow();
    });

    it('should accept configuration missing optional publishSensitiveDataFindings property', () => {
      const validConfig = `
centralSecurityServices:
  delegatedAdminAccount: Audit
  ebsDefaultVolumeEncryption:
    enable: false
  s3PublicAccessBlock:
    enable: false
  ssmSettings:
    blockPublicDocumentSharing:
      enable: true
      excludeAccounts: []
  macie:
    enable: false
    # publishSensitiveDataFindings is now optional
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
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
      const securityConfig = SecurityConfig.loadFromString(validConfig, replacementsConfig);
      expect(securityConfig).toBeDefined();
      expect(securityConfig!.centralSecurityServices.macie?.enable).toBe(false);
      expect(securityConfig!.centralSecurityServices.macie?.publishSensitiveDataFindings).toBeUndefined();
    });

    it('should accept configuration when ssmSettings property is missing and default to undefined', () => {
      const validConfig = `
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
awsConfig:
  enableConfigurationRecorder: false
  ruleSets: []
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
      const securityConfig = SecurityConfig.loadFromString(validConfig, replacementsConfig);

      expect(securityConfig).toBeDefined();
      expect(securityConfig!.centralSecurityServices.ssmSettings).toBeUndefined();
      // Verify other properties are still accessible
      expect(securityConfig!.centralSecurityServices.delegatedAdminAccount).toBe('Audit');
      expect(securityConfig!.centralSecurityServices.s3PublicAccessBlock.enable).toBe(false);
    });
  });
});
describe('YAML include functionality', () => {
  const testConfigDir = path.join(__dirname, 'test-configs');

  beforeAll(() => {
    fs.mkdirSync(testConfigDir, { recursive: true });

    fs.writeFileSync(
      path.join(testConfigDir, 'key-policy.json'),
      `{
"Version": "2012-10-17",
"Statement": [{
  "Sid": "Enable IAM User Permissions",
  "Effect": "Allow",
  "Principal": { "AWS": "*" },
  "Action": "kms:*",
  "Resource": "*"
}]
}`,
    );

    fs.writeFileSync(
      path.join(testConfigDir, 'ssm-document.yaml'),
      `schemaVersion: '2.2'
description: 'Test SSM document'
parameters:
  Parameter1:
    type: String
    description: Test parameter
mainSteps:
- action: aws:runShellScript
  name: TestStep
  inputs:
    runCommand:
      - echo "Hello World"`,
    );

    const securityConfig = {
      accessAnalyzer: { enable: false },
      awsConfig: {
        enableConfigurationRecorder: false,
        ruleSets: [],
      },
      centralSecurityServices: {
        delegatedAdminAccount: 'Audit',
        ebsDefaultVolumeEncryption: {
          enable: false,
          excludeAccounts: [],
          excludeRegions: [],
        },
        macie: {
          enable: false,
          publishSensitiveDataFindings: false,
          excludeRegions: [],
        },
        guardduty: {
          enable: false,
          s3Protection: { enable: false },
          exportConfiguration: {
            enable: false,
            destinationType: 'S3',
            exportFrequency: 'FIFTEEN_MINUTES',
          },
          excludeRegions: [],
        },
        securityHub: {
          enable: false,
          standards: [],
          excludeRegions: [],
        },
        ssmAutomation: {
          documentSets: [
            {
              shareTargets: {
                organizationalUnits: ['Root'],
              },
              documents: [
                {
                  name: 'TestDocument',
                  template: fs.readFileSync(path.join(testConfigDir, 'ssm-document.yaml'), 'utf8'),
                },
              ],
            },
          ],
        },
        s3PublicAccessBlock: {
          enable: false,
          excludeAccounts: [],
        },
        scpRevertChangesConfig: {
          enable: false,
        },
        snsSubscriptions: [],
      },
      cloudWatch: {
        metricSets: [],
        alarmSets: [],
      },
      iamPasswordPolicy: {
        allowUsersToChangePassword: true,
        hardExpiry: false,
        requireUppercaseCharacters: true,
        requireLowercaseCharacters: true,
        requireSymbols: true,
        requireNumbers: true,
        minimumPasswordLength: 14,
        passwordReusePrevention: 24,
        maxPasswordAge: 90,
      },
      keyManagementService: {
        keySets: [
          {
            name: 'TestKey',
            alias: 'alias/test-key',
            policy: fs.readFileSync(path.join(testConfigDir, 'key-policy.json'), 'utf8'),
            description: 'Test KMS key',
            enableKeyRotation: true,
            enabled: true,
            deploymentTargets: {
              organizationalUnits: ['Root'],
            },
          },
        ],
      },
    };

    fs.writeFileSync(path.join(testConfigDir, SecurityConfig.FILENAME), yaml.dump(securityConfig, { noRefs: true }));

    const accountsConfig = {
      mandatoryAccounts: [
        {
          name: 'Management',
          email: 'management@example.com',
          organizationalUnit: 'Root',
        },
        {
          name: 'Audit',
          email: 'audit@example.com',
          organizationalUnit: 'Security',
        },
      ],
      workloadAccounts: [],
    };

    fs.writeFileSync(path.join(testConfigDir, 'accounts-config.yaml'), yaml.dump(accountsConfig));
    fs.writeFileSync(path.join(testConfigDir, 'replacements-config.yaml'), 'definitions: []');
  });

  afterAll(() => {
    fs.rmSync(testConfigDir, { recursive: true });
  });

  it('loads configuration with included KMS key policy', () => {
    const accountsConfig = AccountsConfig.load(testConfigDir);
    const replacementsConfig = ReplacementsConfig.load(testConfigDir, accountsConfig);
    const config = SecurityConfig.load(testConfigDir, replacementsConfig);
    const keySet = config.keyManagementService.keySets[0];

    expect(config.keyManagementService.keySets).toHaveLength(1);
    expect(keySet.name).toBe('TestKey');
    expect(keySet.policy).toContain('Enable IAM User Permissions');
    expect(keySet.policy).toContain('kms:*');
  });

  it('loads configuration with included SSM document', () => {
    const accountsConfig = AccountsConfig.load(testConfigDir);
    const replacementsConfig = ReplacementsConfig.load(testConfigDir, accountsConfig);
    const config = SecurityConfig.load(testConfigDir, replacementsConfig);
    const documentSet = config.centralSecurityServices.ssmAutomation.documentSets[0];
    const document = documentSet.documents[0];

    expect(documentSet.documents).toHaveLength(1);
    expect(document.name).toBe('TestDocument');
    expect(document.template).toContain("schemaVersion: '2.2'");
    expect(document.template).toContain('Hello World');
  });

  it('handles missing included files', () => {
    const brokenConfig = yaml.dump({
      centralSecurityServices: {
        delegatedAdminAccount: 'Audit',
        ebsDefaultVolumeEncryption: {
          enable: false,
          excludeAccounts: [],
          excludeRegions: [],
        },
        macie: {
          enable: false,
          publishSensitiveDataFindings: false,
          excludeRegions: [],
        },
        guardduty: {
          enable: false,
          s3Protection: { enable: false },
          exportConfiguration: { enable: false },
          excludeRegions: [],
        },
        securityHub: {
          enable: false,
          standards: [],
          excludeRegions: [],
        },
        ssmAutomation: {
          documentSets: [
            {
              documents: [
                {
                  name: 'MissingDoc',
                  template: '!include missing-file.yaml',
                },
              ],
              shareTargets: {
                organizationalUnits: ['Root'],
              },
            },
          ],
        },
        s3PublicAccessBlock: {
          enable: false,
          excludeAccounts: [],
        },
        scpRevertChangesConfig: {
          enable: false,
        },
        snsSubscriptions: [],
      },
    });

    fs.writeFileSync(path.join(testConfigDir, SecurityConfig.FILENAME), brokenConfig);

    const accountsConfig = AccountsConfig.load(testConfigDir);
    const replacementsConfig = ReplacementsConfig.load(testConfigDir, accountsConfig);

    expect(() => {
      SecurityConfig.load(testConfigDir, replacementsConfig);
    }).toThrow();
  });
});

describe('targetDocumentLambda backward compatibility', () => {
  it('should still parse when rolePolicyFile is present under targetDocumentLambda', () => {
    const configWithLegacyField = `
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
awsConfig:
  enableConfigurationRecorder: true
  ruleSets:
    - deploymentTargets:
        organizationalUnits:
          - Root
      rules:
        - name: test-rule
          type: Custom
          customRule:
            lambda:
              sourceFilePath: custom-config-rules/test.zip
              handler: index.handler
              runtime: nodejs18.x
              rolePolicyFile: custom-config-rules/detection-role.json
            periodic: true
            maximumExecutionFrequency: Six_Hours
            configurationChanges: true
            triggeringResources:
              lookupType: ResourceTypes
              lookupKey: ResourceTypes
              lookupValue:
                - AWS::EC2::Instance
          remediation:
            rolePolicyFile: custom-config-rules/remediation-role.json
            automatic: true
            targetId: My-SSM-Document
            targetDocumentLambda:
              sourceFilePath: custom-config-rules/remediation.zip
              handler: index.handler
              runtime: nodejs18.x
              rolePolicyFile: custom-config-rules/old-unused-role.json
            retryAttemptSeconds: 60
            maximumAutomaticAttempts: 5
cloudWatch:
  metricSets: []
  alarmSets: []
keyManagementService:
  keySets: []
`;
    expect(() => parseSecurityConfig(yaml.load(configWithLegacyField))).not.toThrow();
  });
});

describe('custom Config rule evaluation modes', () => {
  const customRuleLambda = {
    sourceFilePath: 'custom-config-rules/test.zip',
    handler: 'index.handler',
    runtime: 'nodejs18.x',
    rolePolicyFile: 'custom-config-rules/detection-role.json',
  };

  function createSecurityConfig(customRule: Record<string, unknown>) {
    return {
      centralSecurityServices: {
        delegatedAdminAccount: 'Audit',
        ebsDefaultVolumeEncryption: { enable: false },
        s3PublicAccessBlock: { enable: false },
        macie: { enable: false, publishSensitiveDataFindings: false },
        guardduty: {
          enable: false,
          s3Protection: { enable: false },
          exportConfiguration: {
            enable: false,
            destinationType: 'S3',
            exportFrequency: 'FIFTEEN_MINUTES',
          },
        },
        securityHub: { enable: false, standards: [] },
        ssmAutomation: { documentSets: [] },
      },
      accessAnalyzer: { enable: false },
      iamPasswordPolicy: {
        allowUsersToChangePassword: true,
        hardExpiry: false,
        requireUppercaseCharacters: true,
        requireLowercaseCharacters: true,
        requireSymbols: true,
        requireNumbers: true,
        minimumPasswordLength: 14,
        passwordReusePrevention: 24,
        maxPasswordAge: 90,
      },
      awsConfig: {
        enableConfigurationRecorder: true,
        ruleSets: [
          {
            deploymentTargets: { organizationalUnits: ['Root'] },
            rules: [{ name: 'test-rule', type: 'Custom', customRule }],
          },
        ],
      },
      cloudWatch: { metricSets: [], alarmSets: [] },
      keyManagementService: { keySets: [] },
    };
  }

  it('should parse a periodic-only rule without triggeringResources', () => {
    const config = createSecurityConfig({
      lambda: customRuleLambda,
      periodic: true,
      configurationChanges: false,
    });

    expect(() => parseSecurityConfig(config)).not.toThrow();
  });

  it('should parse a configuration-change-only rule without maximumExecutionFrequency', () => {
    const config = createSecurityConfig({
      lambda: customRuleLambda,
      periodic: false,
      configurationChanges: true,
      triggeringResources: {
        lookupType: 'ResourceTypes',
        lookupValue: ['AWS::EC2::Instance'],
      },
    });

    expect(() => parseSecurityConfig(config)).not.toThrow();
  });
});

describe('accessAnalyzer account level analyzer', () => {
  function createSecurityConfig(accessAnalyzer: Record<string, unknown>) {
    return {
      centralSecurityServices: {
        delegatedAdminAccount: 'Audit',
        ebsDefaultVolumeEncryption: { enable: false },
        s3PublicAccessBlock: { enable: false },
        macie: { enable: false, publishSensitiveDataFindings: false },
        guardduty: {
          enable: false,
          s3Protection: { enable: false },
          exportConfiguration: {
            enable: false,
            destinationType: 'S3',
            exportFrequency: 'FIFTEEN_MINUTES',
          },
        },
        securityHub: { enable: false, standards: [] },
        ssmAutomation: { documentSets: [] },
      },
      accessAnalyzer,
      iamPasswordPolicy: {
        allowUsersToChangePassword: true,
        hardExpiry: false,
        requireUppercaseCharacters: true,
        requireLowercaseCharacters: true,
        requireSymbols: true,
        requireNumbers: true,
        minimumPasswordLength: 14,
        passwordReusePrevention: 24,
        maxPasswordAge: 90,
      },
      awsConfig: { enableConfigurationRecorder: false, ruleSets: [] },
      cloudWatch: { metricSets: [], alarmSets: [] },
      keyManagementService: { keySets: [] },
    };
  }

  it('should default accountAnalyzer to undefined', () => {
    expect(new AccessAnalyzerConfig().accountAnalyzer).toBeUndefined();
  });

  it('should default accountAnalyzer enable to false', () => {
    expect(new AccountAnalyzerConfig().enable).toBe(false);
  });

  it('should parse accountAnalyzer when provided', () => {
    const config = parseSecurityConfig(createSecurityConfig({ enable: true, accountAnalyzer: { enable: true } }));

    expect(config.accessAnalyzer.accountAnalyzer?.enable).toBe(true);
  });

  it('should parse without accountAnalyzer for backward compatibility', () => {
    const config = parseSecurityConfig(createSecurityConfig({ enable: true }));

    expect(config.accessAnalyzer.accountAnalyzer).toBeUndefined();
  });

  it('should throw when accountAnalyzer enable is not a boolean', () => {
    expect(() =>
      parseSecurityConfig(createSecurityConfig({ enable: true, accountAnalyzer: { enable: 'true' } })),
    ).toThrow();
  });

  it('should treat an empty accountAnalyzer as disabled', () => {
    const config = parseSecurityConfig(createSecurityConfig({ enable: true, accountAnalyzer: {} }));

    expect(config.accessAnalyzer.accountAnalyzer?.enable).toBeUndefined();
  });

  it('should default accountAnalyzer deploymentTargets to undefined', () => {
    expect(new AccountAnalyzerConfig().deploymentTargets).toBeUndefined();
  });

  it('should parse accountAnalyzer deploymentTargets when provided', () => {
    const config = parseSecurityConfig(
      createSecurityConfig({
        enable: true,
        accountAnalyzer: {
          enable: true,
          deploymentTargets: {
            organizationalUnits: ['Infrastructure'],
            excludedAccounts: ['SharedServices'],
            excludedRegions: ['cn-north-1'],
          },
        },
      }),
    );

    expect(config.accessAnalyzer.accountAnalyzer?.deploymentTargets?.organizationalUnits).toEqual(['Infrastructure']);
    expect(config.accessAnalyzer.accountAnalyzer?.deploymentTargets?.excludedAccounts).toEqual(['SharedServices']);
    expect(config.accessAnalyzer.accountAnalyzer?.deploymentTargets?.excludedRegions).toEqual(['cn-north-1']);
  });

  it('should leave accountAnalyzer deploymentTargets undefined when omitted', () => {
    const config = parseSecurityConfig(createSecurityConfig({ enable: true, accountAnalyzer: { enable: true } }));

    expect(config.accessAnalyzer.accountAnalyzer?.deploymentTargets).toBeUndefined();
  });

  it('should throw when accountAnalyzer deploymentTargets is not an object', () => {
    expect(() =>
      parseSecurityConfig(
        createSecurityConfig({ enable: true, accountAnalyzer: { enable: true, deploymentTargets: 'Root' } }),
      ),
    ).toThrow();
  });
});

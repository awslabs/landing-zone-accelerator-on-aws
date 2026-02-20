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

/* eslint @typescript-eslint/no-explicit-any: 0 */

import { describe, expect, vi, it, afterEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { SecurityResourcesStack } from '../../lib/stacks/security-resources-stack';
import { createAcceleratorStackProps, createSecurityStackProps } from './stack-props-test-helper';
import { Template } from 'aws-cdk-lib/assertions';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import path from 'path';

describe('SecurityResourcesStack - Config Recorder', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 1 Config recorder when Control Tower is disabled', () => {
    const props = createConfigRecorderProps({ controlTowerEnabled: false });
    const { template } = createSecurityResourcesStackWithTemplate('test-config-1', props);
    expect(Object.keys(template.findResources('AWS::Config::ConfigurationRecorder')).length).toBe(1);
  });

  it('should create exactly 1 Config recorder in management account when Control Tower is enabled', () => {
    const props = createConfigRecorderProps({ controlTowerEnabled: true, isManagementAccount: true });
    const { template } = createSecurityResourcesStackWithTemplate('test-config-2', props);
    expect(Object.keys(template.findResources('AWS::Config::ConfigurationRecorder')).length).toBe(1);
  });

  it('should create exactly 0 Config recorders in member account when Control Tower is enabled', () => {
    const props = createConfigRecorderProps({ controlTowerEnabled: true, isManagementAccount: false });
    const { template } = createSecurityResourcesStackWithTemplate('test-config-3', props);
    expect(Object.keys(template.findResources('AWS::Config::ConfigurationRecorder')).length).toBe(0);
  });

  it('should create exactly 1 Config delivery channel when recorder is enabled', () => {
    const props = createConfigRecorderProps({ controlTowerEnabled: false });
    const { template } = createSecurityResourcesStackWithTemplate('test-config-4', props);
    expect(Object.keys(template.findResources('AWS::Config::DeliveryChannel')).length).toBe(1);
  });
});

describe('SecurityResourcesStack - CloudWatch Metrics', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 0 metric filters when log group does not exist', () => {
    const { template } = createSecurityResourcesStackWithTemplate('test-metrics-1', createCloudWatchProps('metrics'));
    expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBe(0);
  });

  it('should create exactly 0 metric filters when region is excluded', () => {
    const props = createCloudWatchProps('metrics', { region: 'us-west-2', excludeRegions: ['us-west-2'] });
    const { template } = createSecurityResourcesStackWithTemplate('test-metrics-2', props);
    expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBe(0);
  });
});

describe('SecurityResourcesStack - CloudWatch Alarms', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 0 alarms when SNS topic does not exist', () => {
    const { template } = createSecurityResourcesStackWithTemplate('test-alarms-1', createCloudWatchProps('alarms'));
    expect(Object.keys(template.findResources('AWS::CloudWatch::Alarm')).length).toBe(0);
  });

  it('should create exactly 0 alarms when region is excluded', () => {
    const props = createCloudWatchProps('alarms', { region: 'eu-west-1', excludeRegions: ['eu-west-1'] });
    const { template } = createSecurityResourcesStackWithTemplate('test-alarms-2', props);
    expect(Object.keys(template.findResources('AWS::CloudWatch::Alarm')).length).toBe(0);
  });
});

describe('SecurityResourcesStack - CloudWatch Log Groups', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 0 log groups when deployment targets do not match', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-loggroups-1',
      createCloudWatchProps('logGroups'),
    );
    expect(Object.keys(template.findResources('Custom::CloudWatchLogGroups')).length).toBe(0);
  });

  it('should create exactly 0 log groups when account is excluded', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-loggroups-2',
      createCloudWatchProps('logGroups', { excludeAccount: true }),
    );
    expect(Object.keys(template.findResources('Custom::CloudWatchLogGroups')).length).toBe(0);
  });
});

describe('SecurityResourcesStack - Session Manager', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 1 Session Manager settings when enabled', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-ssm-1',
      createSessionManagerProps({ enabled: true }),
    );
    expect(Object.keys(template.findResources('Custom::SsmSessionManagerSettings')).length).toBe(1);
  });

  it('should create exactly 1 Session Manager settings when account exclusion does not work', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-ssm-2',
      createSessionManagerProps({ enabled: true, excludeAccount: true }),
    );
    expect(Object.keys(template.findResources('Custom::SsmSessionManagerSettings')).length).toBe(1);
  });

  it('should create exactly 0 Session Manager settings when region is excluded', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-ssm-3',
      createSessionManagerProps({ enabled: true, excludeRegion: true }),
    );
    expect(Object.keys(template.findResources('Custom::SsmSessionManagerSettings')).length).toBe(0);
  });
});

describe('SecurityResourcesStack - Account CloudTrail', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 0 CloudTrails when deployment targets do not match', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-trail-1',
      createAccountCloudTrailProps({ enabled: true }),
    );
    expect(Object.keys(template.findResources('AWS::CloudTrail::Trail')).length).toBe(0);
  });

  it('should create exactly 0 CloudTrails when disabled', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-trail-2',
      createAccountCloudTrailProps({ enabled: false }),
    );
    expect(Object.keys(template.findResources('AWS::CloudTrail::Trail')).length).toBe(0);
  });

  it('should create exactly 0 CloudTrails when region is not included', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-trail-3',
      createAccountCloudTrailProps({ enabled: true, wrongRegion: true }),
    );
    expect(Object.keys(template.findResources('AWS::CloudTrail::Trail')).length).toBe(0);
  });

  it('should create exactly 1 CloudWatch log group when sendToCloudWatchLogs is enabled', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-trail-4',
      createAccountCloudTrailProps({ enabled: true, sendToCloudWatchLogs: true }),
    );
    expect(Object.keys(template.findResources('AWS::Logs::LogGroup')).length).toBe(1);
  });
});

describe('SecurityResourcesStack - SecurityHub Events', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 0 SecurityHub events when deployment targets do not match', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-sh-1',
      createSecurityHubEventsProps({ enabled: true }),
    );
    expect(Object.keys(template.findResources('Custom::SecurityHubEventsLog')).length).toBe(0);
  });

  it('should create exactly 0 SecurityHub events when SecurityHub is disabled', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-sh-2',
      createSecurityHubEventsProps({ enabled: false }),
    );
    expect(Object.keys(template.findResources('Custom::SecurityHubEventsLog')).length).toBe(0);
  });

  it('should create exactly 0 SecurityHub events when CloudWatch logging is disabled', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-sh-3',
      createSecurityHubEventsProps({ enabled: true, cloudWatchLoggingDisabled: true }),
    );
    expect(Object.keys(template.findResources('Custom::SecurityHubEventsLog')).length).toBe(0);
  });
});

describe('SecurityResourcesStack - Resource Count Validation', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 2 IAM roles for Config recorder', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-roles',
      createConfigRecorderProps({ controlTowerEnabled: false }),
    );
    expect(Object.keys(template.findResources('AWS::IAM::Role')).length).toBe(2);
  });

  it('should create exactly 2 Lambda functions for Session Manager', () => {
    const { template } = createSecurityResourcesStackWithTemplate(
      'test-lambdas',
      createSessionManagerProps({ enabled: true }),
    );
    expect(Object.keys(template.findResources('AWS::Lambda::Function')).length).toBe(2);
  });
});

describe('SecurityResourcesStack - Account IDs', () => {
  afterEach(() => vi.clearAllMocks());

  it('should use correct audit account ID', () => {
    const { stack } = createSecurityResourcesStackWithTemplate('test-audit-id', createSecurityStackProps());
    expect(stack.auditAccountId).toBe('456789012');
  });

  it('should use correct log archive account ID', () => {
    const { stack } = createSecurityResourcesStackWithTemplate('test-log-id', createSecurityStackProps());
    expect(stack.logArchiveAccountId).toBe('345678901');
  });
});

describe('SecurityResourcesStack - Config Rule Dependencies', () => {
  afterEach(() => vi.clearAllMocks());

  it('should add DependsOn between managed config rules', () => {
    const props = createConfigRulesProps({ managedRuleCount: 4 });
    const { template } = createSecurityResourcesStackWithTemplate('test-deps-managed', props);
    const configRules = template.findResources('AWS::Config::ConfigRule');
    const ruleIds = Object.keys(configRules);

    expect(ruleIds.length).toBe(4);

    const rulesWithDependsOn = ruleIds.filter(id => {
      const resource = configRules[id];
      return resource.DependsOn && resource.DependsOn.some((dep: string) => ruleIds.includes(dep));
    });

    expect(rulesWithDependsOn.length).toBeGreaterThan(0);
  });

  it('should add DependsOn between custom config rules', () => {
    const props = createConfigRulesProps({ customRuleCount: 4 });
    const { template } = createSecurityResourcesStackWithTemplate('test-deps-custom', props);
    const configRules = template.findResources('AWS::Config::ConfigRule');
    const ruleIds = Object.keys(configRules);

    expect(ruleIds.length).toBe(4);

    const rulesWithCrossRuleDeps = ruleIds.filter(id => {
      const resource = configRules[id];
      return resource.DependsOn && resource.DependsOn.some((dep: string) => ruleIds.includes(dep));
    });

    expect(rulesWithCrossRuleDeps.length).toBeGreaterThan(0);
  });

  it('should add DependsOn across mixed managed and custom config rules', () => {
    const props = createConfigRulesProps({ managedRuleCount: 2, customRuleCount: 2 });
    const { template } = createSecurityResourcesStackWithTemplate('test-deps-mixed', props);
    const configRules = template.findResources('AWS::Config::ConfigRule');
    const ruleIds = Object.keys(configRules);

    expect(ruleIds.length).toBe(4);

    const rulesWithCrossRuleDeps = ruleIds.filter(id => {
      const resource = configRules[id];
      return resource.DependsOn && resource.DependsOn.some((dep: string) => ruleIds.includes(dep));
    });

    expect(rulesWithCrossRuleDeps.length).toBeGreaterThan(0);
  });

  it('should not add DependsOn when there is only 1 config rule', () => {
    const props = createConfigRulesProps({ managedRuleCount: 1 });
    const { template } = createSecurityResourcesStackWithTemplate('test-deps-single', props);
    const configRules = template.findResources('AWS::Config::ConfigRule');
    const ruleIds = Object.keys(configRules);

    expect(ruleIds.length).toBe(1);

    const rulesWithCrossRuleDeps = ruleIds.filter(id => {
      const resource = configRules[id];
      return resource.DependsOn && resource.DependsOn.some((dep: string) => ruleIds.includes(dep));
    });

    expect(rulesWithCrossRuleDeps.length).toBe(0);
  });

  it('should create no config rules when ruleSets is empty', () => {
    const props = createConfigRulesProps({});
    const { template } = createSecurityResourcesStackWithTemplate('test-deps-empty', props);
    const configRules = template.findResources('AWS::Config::ConfigRule');

    expect(Object.keys(configRules).length).toBe(0);
  });
});

// Helper functions
function createConfigRecorderProps(options: { controlTowerEnabled?: boolean; isManagementAccount?: boolean }) {
  const accountId = options.isManagementAccount ? '234567890' : '00000001';
  const baseProps = createAcceleratorStackProps();
  return createSecurityStackProps({
    globalConfig: {
      ...baseProps.globalConfig,
      controlTower: {
        ...baseProps.globalConfig.controlTower,
        enable: options.controlTowerEnabled ?? false,
      },
    },
    securityConfig: {
      ...baseProps.securityConfig,
      awsConfig: {
        ...baseProps.securityConfig.awsConfig,
        enableConfigurationRecorder: true,
        ruleSets: [],
      },
      cloudWatch: { metricSets: [], alarmSets: [], logGroups: [] },
    },
    env: { region: 'us-east-1', account: accountId },
  });
}

function createCloudWatchProps(
  type: 'metrics' | 'alarms' | 'logGroups',
  options?: { region?: string; excludeRegions?: string[]; excludeAccount?: boolean },
) {
  const region = options?.region ?? 'us-east-1';
  const baseProps = createAcceleratorStackProps();

  const cloudWatch = {
    metricSets:
      type === 'metrics'
        ? [
            {
              regions: options?.excludeRegions ? ['us-east-1'] : [region],
              deploymentTargets: { accounts: [], organizationalUnits: [] },
              metrics: [
                {
                  filterName: 'TestMetricFilter',
                  logGroupName: '/aws/test',
                  filterPattern: 'ERROR',
                  metricNamespace: 'TestNamespace',
                  metricName: 'TestMetric',
                  metricValue: '1',
                },
              ],
            },
          ]
        : [],
    alarmSets:
      type === 'alarms'
        ? [
            {
              regions: options?.excludeRegions ? ['us-east-1'] : [region],
              deploymentTargets: { accounts: [], organizationalUnits: [] },
              alarms: [
                {
                  alarmName: 'TestAlarm',
                  alarmDescription: 'Test alarm',
                  snsAlertLevel: 'High',
                  metricName: 'TestMetric',
                  namespace: 'TestNamespace',
                  comparisonOperator: 'GreaterThanThreshold',
                  evaluationPeriods: 1,
                  period: 300,
                  statistic: 'Sum',
                  threshold: 1,
                  treatMissingData: 'notBreaching',
                },
              ],
            },
          ]
        : [],
    logGroups:
      type === 'logGroups'
        ? [
            {
              logGroupName: '/aws/test-log-group',
              logRetentionInDays: 30,
              deploymentTargets: options?.excludeAccount
                ? { accounts: ['999999999'], organizationalUnits: [] }
                : { accounts: [], organizationalUnits: [] },
            },
          ]
        : [],
  };

  return createSecurityStackProps({
    configDirPath: './',
    securityConfig: {
      ...baseProps.securityConfig,
      awsConfig: { ...baseProps.securityConfig.awsConfig, ruleSets: [] },
      cloudWatch,
    },
    env: { region, account: '00000001' },
  });
}

function createSessionManagerProps(options: { enabled?: boolean; excludeAccount?: boolean; excludeRegion?: boolean }) {
  const baseProps = createAcceleratorStackProps();
  const enabled = options.enabled ?? false;
  return createSecurityStackProps({
    globalConfig: {
      ...baseProps.globalConfig,
      logging: {
        ...baseProps.globalConfig.logging,
        sessionManager: {
          ...baseProps.globalConfig.logging.sessionManager,
          sendToCloudWatchLogs: enabled,
          sendToS3: enabled,
          excludeAccounts: options.excludeAccount ? ['00000001'] : [],
          excludeRegions: options.excludeRegion ? ['us-east-1'] : [],
        },
      },
    },
    env: { region: 'us-east-1', account: '00000001' },
  });
}

function createAccountCloudTrailProps(options: {
  enabled?: boolean;
  wrongRegion?: boolean;
  sendToCloudWatchLogs?: boolean;
}) {
  const region = options.wrongRegion ? 'us-west-2' : 'us-east-1';
  const baseProps = createAcceleratorStackProps();
  const enabled = options.enabled ?? false;
  const sendToLogs = options.sendToCloudWatchLogs ?? false;
  return createSecurityStackProps({
    globalConfig: {
      ...baseProps.globalConfig,
      logging: {
        ...baseProps.globalConfig.logging,
        cloudtrail: {
          ...baseProps.globalConfig.logging.cloudtrail,
          enable: enabled,
          organizationTrail: false,
          accountTrails: enabled
            ? [
                {
                  name: 'AWSAccelerator-Account-CloudTrail' as any,
                  regions: ['us-east-1'],
                  deploymentTargets: { accounts: [], organizationalUnits: [] },
                  settings: {
                    multiRegionTrail: false,
                    globalServiceEvents: false,
                    managementEvents: true,
                    s3DataEvents: false,
                    lambdaDataEvents: false,
                    sendToCloudWatchLogs: sendToLogs,
                    apiCallRateInsight: false,
                    apiErrorRateInsight: false,
                  },
                },
              ]
            : [],
        },
      },
    },
    env: { region, account: '00000001' },
  });
}

function createSecurityHubEventsProps(options: { enabled?: boolean; cloudWatchLoggingDisabled?: boolean }) {
  const baseProps = createAcceleratorStackProps();
  const enabled = options.enabled ?? false;
  const loggingDisabled = options.cloudWatchLoggingDisabled ?? false;
  return createSecurityStackProps({
    securityConfig: {
      ...baseProps.securityConfig,
      awsConfig: { ...baseProps.securityConfig.awsConfig, ruleSets: [] },
      cloudWatch: { metricSets: [], alarmSets: [], logGroups: [] },
      centralSecurityServices: {
        ...baseProps.securityConfig.centralSecurityServices,
        securityHub: {
          enable: enabled,
          excludeRegions: [],
          standards: [],
          logging: {
            cloudWatch: {
              enable: !loggingDisabled,
              logLevel: 'HIGH' as any,
            },
          },
        } as any,
      },
    },
    env: { region: 'us-east-1', account: '00000001' },
  });
}

function createSecurityResourcesStackWithTemplate(
  stackName: string,
  props: AcceleratorStackProps,
): { stack: SecurityResourcesStack; template: Template } {
  const stack = new SecurityResourcesStack(new cdk.App(), stackName, props);
  const template = Template.fromStack(stack);
  return { stack, template };
}

function createConfigRulesProps(options: {
  managedRuleCount?: number;
  customRuleCount?: number;
}): AcceleratorStackProps {
  const baseProps = createAcceleratorStackProps();
  const managedCount = options.managedRuleCount ?? 0;
  const customCount = options.customRuleCount ?? 0;

  const testAccountId = '00000001';
  const testAccountName = 'TestAccount';

  const managedRules = Array.from({ length: managedCount }, (_, i) => ({
    name: `test-managed-rule-${i}`,
    description: `Test managed rule ${i}`,
    identifier: 'IAM_USER_GROUP_MEMBERSHIP_CHECK',
    inputParameters: {},
    complianceResourceTypes: ['AWS::IAM::User'],
    type: 'Managed',
    tags: [],
    remediation: undefined,
  }));

  const customRules = Array.from({ length: customCount }, (_, i) => ({
    name: `test-custom-rule-${i}`,
    description: `Test custom rule ${i}`,
    identifier: '',
    inputParameters: {},
    complianceResourceTypes: [],
    type: 'Custom',
    tags: [],
    remediation: undefined,
    customRule: {
      lambda: {
        sourceFilePath: 'custom-config-rules/attach-ec2-instance-profile.zip',
        handler: 'index.handler',
        runtime: 'nodejs18.x',
        rolePolicyFile: 'custom-config-rules/attach-ec2-instance-profile-detection-role.json',
        timeout: 3,
      },
      periodic: true,
      maximumExecutionFrequency: 'Six_Hours',
      configurationChanges: false,
      triggeringResources: {
        lookupType: 'ResourceTypes',
        lookupKey: '',
        lookupValue: ['AWS::EC2::Instance'],
      },
    },
  }));

  const rules = [...managedRules, ...customRules];

  return createSecurityStackProps({
    configDirPath: path.join(__dirname, '../configs/snapshot-only'),
    accountsConfig: {
      ...baseProps.accountsConfig,
      getAccountId: vi.fn((name: string) => (name === testAccountName ? testAccountId : '123456789' + name)),
      getAccount: vi.fn(() => ({ name: testAccountName, organizationalUnit: 'Root' })),
      getManagementAccountId: vi.fn(() => '234567890'),
      getLogArchiveAccountId: vi.fn(() => '345678901'),
      getAuditAccountId: vi.fn(() => '456789012'),
      getAccountNameById: vi.fn(() => testAccountName),
      containsAccount: vi.fn(() => true),
      mandatoryAccounts: [{ name: testAccountName, organizationalUnit: 'Root' }],
      workloadAccounts: [],
    } as any,
    organizationConfig: {
      ...baseProps.organizationConfig,
      isIgnored: vi.fn(() => false),
    } as any,
    securityConfig: {
      ...baseProps.securityConfig,
      awsConfig: {
        ...baseProps.securityConfig.awsConfig,
        enableConfigurationRecorder: false,
        ruleSets:
          rules.length > 0
            ? [
                {
                  deploymentTargets: { accounts: [testAccountName], organizationalUnits: [] },
                  rules,
                },
              ]
            : [],
      },
      cloudWatch: { metricSets: [], alarmSets: [], logGroups: [] },
    },
    env: { region: 'us-east-1', account: testAccountId },
  });
}

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
import {
  AccountsConfig,
  CustomizationsConfig,
  GlobalConfig,
  IamConfig,
  NetworkConfig,
  OrganizationConfig,
  ReplacementsConfig,
  SecurityConfig,
} from '@aws-accelerator/config';

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

  it('should skip metric filter when log group references org trail that is not enabled', () => {
    const props = createOrgTrailMetricFilterProps({
      cloudtrailEnabled: false,
      organizationTrail: false,
      sendToCloudWatchLogs: false,
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-metrics-orgtrail-disabled', props);
    expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBe(0);
  });

  it('should create metric filter when log group references org trail with sendToCloudWatchLogs false', () => {
    // The org trail CloudWatch log group is created whenever the org trail is
    // enabled, independent of sendToCloudWatchLogs (see
    // OrganizationsStack.configureOrganizationCloudTrail), so the filter must be kept.
    const props = createOrgTrailMetricFilterProps({
      cloudtrailEnabled: true,
      organizationTrail: true,
      sendToCloudWatchLogs: false,
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-metrics-orgtrail-nologs', props);
    expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBe(1);
  });

  it('should create metric filter when log group references org trail with sendToCloudWatchLogs true', () => {
    const props = createOrgTrailMetricFilterProps({
      cloudtrailEnabled: true,
      organizationTrail: true,
      sendToCloudWatchLogs: true,
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-metrics-orgtrail-enabled', props);
    expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBe(1);
  });

  it('should skip metric filter when cloudtrail is disabled but org trail flag is set', () => {
    // Exercises the cloudtrailConfig.enable term of the skip condition: the org
    // trail log group is only created when enable AND organizationTrail are both
    // true, so enable=false must still skip even with organizationTrail=true.
    const props = createOrgTrailMetricFilterProps({
      cloudtrailEnabled: false,
      organizationTrail: true,
      sendToCloudWatchLogs: true,
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-metrics-orgtrail-enable-false', props);
    expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBe(0);
  });

  describe('against real all-enabled config', () => {
    it('keeps every metric filter when none reference the organization trail log group', () => {
      // all-enabled has cloudtrail.organizationTrail = false and its metric
      // filters reference the account trail log group, not the org trail log
      // group (aws-accelerator-cloudtrail-logs). The org-trail-only guard must
      // therefore leave all of them intact - this is the no-regression guard.
      const props = loadAllEnabledProps();
      const template = synthSecurityResourcesTemplateForAllEnabled(props);

      expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBeGreaterThan(0);
    });

    it('skips every metric filter that references the organization trail log group when the org trail is disabled', () => {
      // Reproduce issue #327 through the real config: all-enabled already has
      // cloudtrail.organizationTrail = false, so a metric filter that references
      // the org trail log group aws-accelerator-cloudtrail-logs points at a log
      // group that will never exist. Redirect every filter at that name and
      // confirm the guard skips them all.
      const props = loadAllEnabledProps();
      const orgTrailLogGroupName = `${props.prefixes.trailLogName}-cloudtrail-logs`;
      const metricSets = props.securityConfig.cloudWatch.metricSets;
      expect(metricSets.length).toBeGreaterThan(0);

      let redirected = 0;
      for (const metricSet of metricSets) {
        for (const metric of metricSet.metrics ?? []) {
          (metric as { logGroupName: string }).logGroupName = orgTrailLogGroupName;
          redirected++;
        }
      }
      expect(redirected).toBeGreaterThan(0);

      const template = synthSecurityResourcesTemplateForAllEnabled(props);

      expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBe(0);
    });

    it('keeps metric filters when an account trail named "logs" owns the org-trail log group name', () => {
      // Name collision: an account trail named `logs` produces the log group
      // aws-accelerator-cloudtrail-logs, identical to the org trail log group.
      // With the org trail disabled the guard must NOT skip such filters, because
      // the account trail creates that log group in this same stack.
      const props = loadAllEnabledProps();
      expect(props.globalConfig.logging.cloudtrail.organizationTrail).toBe(false);

      const trails = props.globalConfig.logging.cloudtrail.accountTrails;
      expect(trails.length).toBeGreaterThan(0);
      for (const trail of trails) {
        (trail as { name: string }).name = 'logs';
        trail.settings.sendToCloudWatchLogs = true;
      }

      const orgTrailLogGroupName = `${props.prefixes.trailLogName}-cloudtrail-logs`;
      for (const metricSet of props.securityConfig.cloudWatch.metricSets) {
        for (const metric of metricSet.metrics ?? []) {
          (metric as { logGroupName: string }).logGroupName = orgTrailLogGroupName;
        }
      }

      const template = synthSecurityResourcesTemplateForAllEnabled(props);

      expect(Object.keys(template.findResources('AWS::Logs::MetricFilter')).length).toBeGreaterThan(0);
    });
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

describe('SecurityResourcesStack - Account level IAM Access Analyzer', () => {
  afterEach(() => vi.clearAllMocks());

  it('should create exactly 1 ACCOUNT analyzer when accessAnalyzer and accountAnalyzer are enabled', () => {
    const props = createAccessAnalyzerProps({ enable: true, accountAnalyzer: { enable: true } });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-1', props);
    const analyzers = template.findResources('AWS::AccessAnalyzer::Analyzer');

    expect(Object.keys(analyzers).length).toBe(1);
    expect(Object.values(analyzers)[0].Properties.Type).toBe('ACCOUNT');
  });

  it('should create exactly 0 analyzers when accountAnalyzer is not enabled', () => {
    const props = createAccessAnalyzerProps({ enable: true, accountAnalyzer: { enable: false } });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-2', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
  });

  it('should create exactly 0 analyzers when accountAnalyzer is omitted', () => {
    const props = createAccessAnalyzerProps({ enable: true });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-3', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
  });

  it('should create exactly 0 analyzers when accessAnalyzer is disabled', () => {
    const props = createAccessAnalyzerProps({ enable: false, accountAnalyzer: { enable: true } });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-4', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
  });

  it('should create exactly 0 analyzers when accountAnalyzer is present but empty', () => {
    const props = createAccessAnalyzerProps({ enable: true, accountAnalyzer: {} });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-5', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
  });

  it('should create an analyzer when deploymentTargets includes the account', () => {
    const props = createAccessAnalyzerProps({
      enable: true,
      accountAnalyzer: { enable: true, deploymentTargets: { accounts: ['TestAccount'], organizationalUnits: [] } },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-6', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(1);
  });

  it('should create an analyzer when deploymentTargets includes the organizational unit', () => {
    const props = createAccessAnalyzerProps({
      enable: true,
      accountAnalyzer: { enable: true, deploymentTargets: { accounts: [], organizationalUnits: ['Root'] } },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-7', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(1);
  });

  it('should create exactly 0 analyzers when deploymentTargets does not include the account', () => {
    const props = createAccessAnalyzerProps({
      enable: true,
      accountAnalyzer: { enable: true, deploymentTargets: { accounts: ['OtherAccount'], organizationalUnits: [] } },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-8', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
  });

  it('should create exactly 0 analyzers when deploymentTargets excludes the account', () => {
    const props = createAccessAnalyzerProps({
      enable: true,
      accountAnalyzer: {
        enable: true,
        deploymentTargets: {
          accounts: [],
          organizationalUnits: ['Root'],
          excludedAccounts: ['TestAccount'],
        },
      },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-9', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
  });

  it('should create exactly 0 analyzers when deploymentTargets excludes the region', () => {
    const props = createAccessAnalyzerProps({
      enable: true,
      accountAnalyzer: {
        enable: true,
        deploymentTargets: {
          accounts: ['TestAccount'],
          organizationalUnits: [],
          excludedRegions: ['us-east-1'],
        },
      },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-10', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
  });

  it('should create exactly 0 analyzers when deploymentTargets is empty', () => {
    const props = createAccessAnalyzerProps({
      enable: true,
      accountAnalyzer: { enable: true, deploymentTargets: { accounts: [], organizationalUnits: [] } },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-analyzer-11', props);
    expect(Object.keys(template.findResources('AWS::AccessAnalyzer::Analyzer')).length).toBe(0);
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

describe('SecurityResourcesStack - Custom Config Rule Evaluation Modes', () => {
  afterEach(() => vi.clearAllMocks());

  it('should synthesize a periodic-only rule without triggeringResources or maximumExecutionFrequency', () => {
    const props = createConfigRulesProps({
      customRuleCount: 1,
      customRuleOverrides: {
        periodic: true,
        configurationChanges: false,
        maximumExecutionFrequency: undefined,
        triggeringResources: undefined,
      },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-periodic-only-rule', props);
    const configRule = Object.values(template.findResources('AWS::Config::ConfigRule'))[0] as any;

    expect(configRule.Properties.MaximumExecutionFrequency).toBeUndefined();
    expect(configRule.Properties.Scope).toBeUndefined();
    expect(configRule.Properties.Source.SourceDetails).toEqual([
      {
        EventSource: 'aws.config',
        MessageType: 'ScheduledNotification',
      },
    ]);
  });

  it('should synthesize a configuration-change-only rule without triggeringResources', () => {
    const props = createConfigRulesProps({
      customRuleCount: 1,
      customRuleOverrides: {
        periodic: false,
        configurationChanges: true,
        maximumExecutionFrequency: undefined,
        triggeringResources: undefined,
      },
    });
    const { template } = createSecurityResourcesStackWithTemplate('test-configuration-change-only-rule', props);
    const configRule = Object.values(template.findResources('AWS::Config::ConfigRule'))[0] as any;

    expect(configRule.Properties.MaximumExecutionFrequency).toBeUndefined();
    expect(configRule.Properties.Scope).toBeUndefined();
    expect(configRule.Properties.Source.SourceDetails).toEqual([
      {
        EventSource: 'aws.config',
        MessageType: 'ConfigurationItemChangeNotification',
      },
      {
        EventSource: 'aws.config',
        MessageType: 'OversizedConfigurationItemChangeNotification',
      },
    ]);
  });
});

describe('SecurityResourcesStack - Policy Replacement Variables', () => {
  afterEach(() => vi.clearAllMocks());

  it('should substitute ${PARTITION}, ${ACCOUNT_ID}, and ${REGION} in custom config rule lambda role policies', () => {
    const props = createConfigRulesWithReplacementsProps();
    const { template } = createSecurityResourcesStackWithTemplate('test-policy-replacements', props);

    const policies = template.findResources('AWS::IAM::Policy');
    const lambdaRolePolicy = Object.values(policies).find((p: any) =>
      JSON.stringify(p).includes('LambdaRolePolicy'),
    ) as any;

    expect(lambdaRolePolicy).toBeDefined();

    const policyDoc = lambdaRolePolicy.Properties.PolicyDocument;
    const policyJson = JSON.stringify(policyDoc);

    // Variables should be substituted, not present as literals
    expect(policyJson).not.toContain('${PARTITION}');
    expect(policyJson).not.toContain('${ACCOUNT_ID}');
    expect(policyJson).not.toContain('${REGION}');

    // Substituted values should be present
    expect(policyJson).toContain('unit-test'); // partition from test props
    expect(policyJson).toContain('00000001'); // account from test props
    expect(policyJson).toContain('us-east-1'); // region from test props
  });

  it('should produce valid ARNs after substitution in custom config rule lambda role policies', () => {
    const props = createConfigRulesWithReplacementsProps();
    const { template } = createSecurityResourcesStackWithTemplate('test-policy-arns', props);

    const policies = template.findResources('AWS::IAM::Policy');
    const lambdaRolePolicy = Object.values(policies).find((p: any) =>
      JSON.stringify(p).includes('LambdaRolePolicy'),
    ) as any;

    expect(lambdaRolePolicy).toBeDefined();

    const statements = lambdaRolePolicy.Properties.PolicyDocument.Statement;
    const resourceArns = statements.flatMap((s: any) => (Array.isArray(s.Resource) ? s.Resource : [s.Resource]));

    // Verify ARNs have the expected format after substitution
    for (const arn of resourceArns) {
      expect(arn).toMatch(/^arn:unit-test:logs:us-east-1:00000001:/);
    }
  });
});

// Helper functions
function createConfigRulesWithReplacementsProps(): AcceleratorStackProps {
  const baseProps = createAcceleratorStackProps();
  const testAccountId = '00000001';
  const testAccountName = 'TestAccount';

  const customRules = [
    {
      name: 'test-replacement-rule',
      description: 'Test rule with policy replacement variables',
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
          rolePolicyFile: 'custom-config-rules/policy-with-replacements-role.json',
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
    },
  ];

  return createSecurityStackProps({
    configDirPath: path.join(__dirname, '../configs/snapshot-only'),
    accountsConfig: {
      ...baseProps.accountsConfig,
      getAccountId: vi.fn((name: string) => (name === testAccountName ? testAccountId : '123456789' + name)),
      getAccount: vi.fn(function () {
        return { name: testAccountName, organizationalUnit: 'Root' };
      }),
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
        ruleSets: [
          {
            deploymentTargets: { accounts: [testAccountName], organizationalUnits: [] },
            rules: customRules,
          },
        ],
      },
      cloudWatch: { metricSets: [], alarmSets: [], logGroups: [] },
    },
    env: { region: 'us-east-1', account: testAccountId },
  });
}

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

function createAccessAnalyzerProps(accessAnalyzer: {
  enable: boolean;
  accountAnalyzer?: {
    enable?: boolean;
    deploymentTargets?: {
      accounts?: string[];
      organizationalUnits?: string[];
      excludedAccounts?: string[];
      excludedRegions?: string[];
    };
  };
}) {
  const accountName = 'TestAccount';
  const accountId = '00000001';
  const baseProps = createAcceleratorStackProps();
  return createSecurityStackProps({
    accountsConfig: {
      ...baseProps.accountsConfig,
      getAccountId: vi.fn((name: string) => (name === accountName ? accountId : '123456789' + name)),
      getAccount: vi.fn(() => ({ name: accountName, organizationalUnit: 'Root' })),
      getAccountNameById: vi.fn(() => accountName),
      mandatoryAccounts: [{ name: accountName, organizationalUnit: 'Root' }],
      workloadAccounts: [],
    } as any,
    organizationConfig: {
      ...baseProps.organizationConfig,
      isIgnored: vi.fn(() => false),
    } as any,
    securityConfig: {
      ...baseProps.securityConfig,
      accessAnalyzer: accessAnalyzer as any,
      awsConfig: { ...baseProps.securityConfig.awsConfig, ruleSets: [] },
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
  customRuleOverrides?: Record<string, unknown>;
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
      ...options.customRuleOverrides,
    },
  }));

  const rules = [...managedRules, ...customRules];

  return createSecurityStackProps({
    configDirPath: path.join(__dirname, '../configs/snapshot-only'),
    accountsConfig: {
      ...baseProps.accountsConfig,
      getAccountId: vi.fn((name: string) => (name === testAccountName ? testAccountId : '123456789' + name)),
      getAccount: vi.fn(function () {
        return { name: testAccountName, organizationalUnit: 'Root' };
      }),
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

function createOrgTrailMetricFilterProps(options: {
  cloudtrailEnabled: boolean;
  organizationTrail: boolean;
  sendToCloudWatchLogs: boolean;
}): AcceleratorStackProps {
  const baseProps = createAcceleratorStackProps();
  const testAccountId = '00000001';
  const testAccountName = 'TestAccount';
  const trailLogName = 'aws-accelerator';
  const orgTrailLogGroupName = `${trailLogName}-cloudtrail-logs`;

  return createSecurityStackProps({
    configDirPath: './',
    prefixes: {
      ...baseProps.prefixes,
      trailLogName,
    },
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
    globalConfig: {
      ...baseProps.globalConfig,
      logging: {
        ...baseProps.globalConfig.logging,
        cloudtrail: {
          enable: options.cloudtrailEnabled,
          organizationTrail: options.organizationTrail,
          organizationTrailSettings: options.organizationTrail
            ? {
                multiRegionTrail: true,
                globalServiceEvents: true,
                managementEvents: true,
                s3DataEvents: true,
                lambdaDataEvents: true,
                sendToCloudWatchLogs: options.sendToCloudWatchLogs,
                apiErrorRateInsight: false,
                apiCallRateInsight: false,
              }
            : undefined,
          accountTrails: [],
        },
      } as any,
    },
    securityConfig: {
      ...baseProps.securityConfig,
      awsConfig: { ...baseProps.securityConfig.awsConfig, ruleSets: [] },
      cloudWatch: {
        metricSets: [
          {
            regions: ['us-east-1'],
            deploymentTargets: { accounts: [testAccountName], organizationalUnits: [] },
            metrics: [
              {
                filterName: 'OrgTrailMetricFilter',
                logGroupName: orgTrailLogGroupName,
                filterPattern: '{$.userIdentity.type="Root"}',
                metricNamespace: 'CloudTrailMetrics',
                metricName: 'RootAccount',
                metricValue: '1',
              },
            ],
          },
        ],
        alarmSets: [],
        logGroups: [],
      },
    },
    env: { region: 'us-east-1', account: testAccountId },
  });
}

/**
 * Load the on-disk all-enabled test configs into in-memory AcceleratorStackProps.
 * Used by the "against real all-enabled config" tests to exercise the real LZA
 * config parser + stack synth path, mutating only the cloudtrail settings needed
 * for the assertion (no config folder clone).
 */
function loadAllEnabledProps(): AcceleratorStackProps {
  const configDir = path.join(__dirname, '..', 'configs', 'all-enabled');

  const accountsConfig = AccountsConfig.load(configDir);
  const replacementsConfig = ReplacementsConfig.load(configDir, accountsConfig);

  const baseProps = createAcceleratorStackProps();

  return {
    ...baseProps,
    configDirPath: configDir,
    accountsConfig,
    customizationsConfig: new CustomizationsConfig(),
    globalConfig: GlobalConfig.load(configDir, replacementsConfig),
    iamConfig: IamConfig.load(configDir, replacementsConfig),
    networkConfig: NetworkConfig.load(configDir, replacementsConfig),
    organizationConfig: OrganizationConfig.load(configDir, replacementsConfig),
    securityConfig: SecurityConfig.load(configDir, replacementsConfig),
    replacementsConfig,
    // The metric filter log group names in all-enabled are formed with the real
    // LZA prefix (aws-accelerator-cloudtrail-...). The default fixture prefix is
    // empty, which would break the fix's pattern match.
    prefixes: { ...baseProps.prefixes, trailLogName: 'aws-accelerator' },
    env: { account: accountsConfig.getManagementAccountId(), region: 'us-east-1' },
  };
}

/**
 * Synthesize a SecurityResourcesStack against all-enabled props and return its template.
 */
function synthSecurityResourcesTemplateForAllEnabled(props: AcceleratorStackProps): Template {
  const app = new cdk.App();
  const stack = new SecurityResourcesStack(app, 'AllEnabledSecurityResourcesStack', props);
  return Template.fromStack(stack);
}

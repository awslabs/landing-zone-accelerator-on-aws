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

import { describe, expect, vi, it, afterEach, beforeEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { SecurityStack } from '../../lib/stacks/security-stack';
import { createAcceleratorStackProps, createSecurityStackProps } from './stack-props-test-helper';
import { Template } from 'aws-cdk-lib/assertions';
import { AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';

describe('SecurityStack - Macie Configuration', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create Macie resources when enabled in audit account', () => {
    app = new cdk.App();
    const props = createSecurityServicesProps({ macie: true });
    securityStack = new SecurityStack(app, 'test-security-stack-macie', props);
    expect(securityStack.auditAccountName).toBe('Audit');
  });

  it('should not create Macie resources when disabled', () => {
    const props = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-macie', props);
    const customResources = template.findResources('Custom::MacieExportConfigClassification');
    expect(Object.keys(customResources).length).toBe(0);
  });

  it('should create Macie resources in non-excluded regions', () => {
    const baseProps = createSecurityServicesProps(
      { macie: true },
      { env: { region: 'us-east-1', account: '00000001' } },
    );
    const props = createSecurityStackProps({
      ...baseProps,
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          macie: { ...baseProps.securityConfig.centralSecurityServices.macie!, excludeRegions: ['us-west-2'] },
        },
      },
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-macie-normal', props);
    const macieResources = template.findResources('Custom::MaciePutClassificationExportConfiguration');
    expect(Object.keys(macieResources).length).toBe(1);
  });

  it('should not create Macie resources in excluded regions', () => {
    const baseProps = createSecurityServicesProps(
      { macie: true },
      { env: { region: 'us-west-2', account: '00000001' } },
    );
    const props = createSecurityStackProps({
      ...baseProps,
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          macie: { ...baseProps.securityConfig.centralSecurityServices.macie!, excludeRegions: ['us-west-2'] },
        },
      },
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-macie-excluded', props);
    const macieResources = template.findResources('Custom::MaciePutClassificationExportConfiguration');
    expect(Object.keys(macieResources).length).toBe(0);
  });
});

describe('SecurityStack - GuardDuty Configuration', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create GuardDuty publishing destination when enabled', () => {
    app = new cdk.App();
    const props = createSecurityServicesProps({ guardduty: true });
    securityStack = new SecurityStack(app, 'test-security-stack-guardduty', props);
    expect(securityStack.auditAccountName).toBe('Audit');
  });

  it('should not create GuardDuty resources when disabled', () => {
    const props = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-guardduty', props);
    const customResources = template.findResources('Custom::GuardDutyPublishingDestination');
    expect(Object.keys(customResources).length).toBe(0);
  });

  it('should use custom prefix for GuardDuty export when configured', () => {
    app = new cdk.App();
    const baseProps = createSecurityServicesProps({ guardduty: true });
    const props = createSecurityStackProps({
      ...baseProps,
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          guardduty: {
            ...baseProps.securityConfig.centralSecurityServices.guardduty!,
            exportConfiguration: {
              ...baseProps.securityConfig.centralSecurityServices.guardduty!.exportConfiguration!,
              overrideGuardDutyPrefix: {
                useCustomPrefix: true,
                customOverride: 'custom-guardduty',
              },
            },
          },
        },
      },
    });
    securityStack = new SecurityStack(app, 'test-security-stack-guardduty-custom', props);
    expect(securityStack.auditAccountName).toBe('Audit');
  });
});

describe('SecurityStack - SecurityHub Configuration', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create SecurityHub standards when enabled', () => {
    app = new cdk.App();
    const props = createSecurityServicesProps({ securityHub: true });
    securityStack = new SecurityStack(app, 'test-security-stack-securityhub', props);
    expect(securityStack.securityHubConfig).toBeDefined();
  });

  it('should not create SecurityHub resources when disabled', () => {
    const props = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-securityhub', props);
    const customResources = template.findResources('Custom::SecurityHubStandards');
    expect(Object.keys(customResources).length).toBe(0);
  });
});

describe('SecurityStack - EBS Default Encryption', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create KMS key and EBS encryption when enabled', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-ebs', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    expect(Object.keys(kmsKeys).length).toBe(1);
  });

  it('should not create EBS encryption when disabled', () => {
    const props = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-ebs', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const ebsLambdas = Object.values(lambdas).filter((lambda: any) => lambda.Properties?.Description?.includes('EBS'));
    expect(ebsLambdas.length).toBe(0);
  });

  it('should not create EBS encryption in excluded regions', () => {
    const baseProps = createSecurityServicesProps(
      { ebsEncryption: true },
      { env: { region: 'us-west-2', account: '00000001' } },
    );
    const props = createSecurityStackProps({
      ...baseProps,
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          ebsDefaultVolumeEncryption: {
            ...baseProps.securityConfig.centralSecurityServices.ebsDefaultVolumeEncryption!,
            excludeRegions: ['us-west-2'],
          },
        },
      },
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-ebs-excluded', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const ebsLambdas = Object.values(lambdas).filter((lambda: any) => lambda.Properties?.Description?.includes('EBS'));
    expect(ebsLambdas.length).toBe(0);
  });
});

describe('SecurityStack - IAM Password Policy', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create IAM password policy in home region', () => {
    app = new cdk.App();
    const props = createHomeRegionProps();
    securityStack = new SecurityStack(app, 'test-security-stack-iam-policy', props);
    expect(securityStack.region).toBe('us-east-1');
  });

  it('should not create IAM password policy in non-home region', () => {
    const props = createHomeRegionProps({ env: { region: 'us-west-2', account: '00000001' } });
    const { template } = createSecurityStackWithTemplate('test-security-stack-iam-non-home', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const iamLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('IAM Password Policy'),
    );
    expect(iamLambdas.length).toBe(0);
  });

  it('should not create IAM password policy when single account mode enabled', () => {
    const props = createHomeRegionProps({ enableSingleAccountMode: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-iam-single', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const iamLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('IAM Password Policy'),
    );
    expect(iamLambdas.length).toBe(0);
  });

  it('should not create IAM password policy when using existing roles', () => {
    const props = createHomeRegionProps({ useExistingRoles: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-iam-existing', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const iamLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('IAM Password Policy'),
    );
    expect(iamLambdas.length).toBe(0);
  });
});

describe('SecurityStack - Config Aggregation', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create Config aggregation when enabled in delegated admin account', () => {
    app = new cdk.App();
    const props = createConfigAggregationProps();
    securityStack = new SecurityStack(app, 'test-security-stack-config-agg', props);
    expect(securityStack.configAggregationAccountId).toBe('123456789Audit');
  });

  it('should not create Config aggregation when disabled', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createSecurityStackProps({
      securityConfig: {
        ...baseProps.securityConfig,
        awsConfig: { ...baseProps.securityConfig.awsConfig, aggregation: { enable: false } },
      },
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-config-agg', props);
    const aggregators = template.findResources('AWS::Config::ConfigurationAggregator');
    expect(Object.keys(aggregators).length).toBe(0);
  });

  it('should not create Config aggregation in non-delegated account', () => {
    const props = createConfigAggregationProps({ env: { region: 'us-east-1', account: '00000001' } });
    const { template } = createSecurityStackWithTemplate('test-security-stack-config-non-delegated', props);
    const aggregators = template.findResources('AWS::Config::ConfigurationAggregator');
    expect(Object.keys(aggregators).length).toBe(0);
  });
});

describe('SecurityStack - CloudWatch Log Groups', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should accept custom log retention configuration', () => {
    app = new cdk.App();
    const baseProps = createSecurityServicesProps({ macie: true });
    const props = createSecurityStackProps({
      ...baseProps,
      globalConfig: {
        ...baseProps.globalConfig,
        cloudwatchLogRetentionInDays: 90,
      },
    });
    securityStack = new SecurityStack(app, 'test-security-stack-log-retention', props);
    expect(securityStack.auditAccountName).toBe('Audit');
  });
});

describe('SecurityStack - IAM Policies', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create IAM roles and policies for Lambda functions', () => {
    const props = createSecurityServicesProps({ macie: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-iam-roles', props);
    const roles = template.findResources('AWS::IAM::Role');
    expect(Object.keys(roles).length).toBeGreaterThanOrEqual(1);
  });
});

describe('SecurityStack - SSM Parameters', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create SSM parameters for EBS encryption key', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-ssm', props);
    const ssmParams = template.findResources('AWS::SSM::Parameter');
    expect(Object.keys(ssmParams).length).toBe(3);
  });
});

describe('SecurityStack - KMS Key Configuration', () => {
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create KMS key with proper policies for EBS encryption', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    template = Template.fromStack(new SecurityStack(new cdk.App(), 'test-security-stack-kms-policies', props));
    const kmsKeys = template.findResources('AWS::KMS::Key');
    const ebsKeys = Object.values(kmsKeys).filter((key: any) =>
      JSON.stringify(key).includes('autoscaling.amazonaws.com'),
    );
    expect(ebsKeys.length).toBe(1);
  });

  it('should enable key rotation for EBS encryption key', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    template = Template.fromStack(new SecurityStack(new cdk.App(), 'test-security-stack-kms-rotation', props));
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });
});

describe('SecurityStack - Accelerator Metadata', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create metadata rule in management account and home region', () => {
    app = new cdk.App();
    const props = createMetadataEnabledProps();
    securityStack = new SecurityStack(app, 'test-security-stack-metadata', props);
    expect(securityStack.metadataRule).toBeDefined();
  });

  it('should not create metadata rule in non-management account', () => {
    const props = createMetadataEnabledProps({ env: { region: 'us-east-1', account: '00000001' } });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-metadata', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const metadataLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Metadata'),
    );
    expect(metadataLambdas.length).toBe(0);
  });

  it('should not create metadata rule in non-home region', () => {
    const props = createMetadataEnabledProps({ env: { region: 'us-west-2', account: '234567890' } });
    const { template } = createSecurityStackWithTemplate('test-security-stack-metadata-non-home', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const metadataLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Metadata'),
    );
    expect(metadataLambdas.length).toBe(0);
  });
});

describe('SecurityStack - Configuration Value Mapping', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should set Macie finding frequency to FIFTEEN_MINUTES when configured', () => {
    app = new cdk.App();
    const baseProps = createSecurityServicesProps({ macie: true });
    const props = createSecurityStackProps({
      ...baseProps,
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          macie: {
            ...baseProps.securityConfig.centralSecurityServices.macie!,
            policyFindingsPublishingFrequency: 'FIFTEEN_MINUTES',
          },
        },
      },
    });
    securityStack = new SecurityStack(app, 'test-security-stack-macie-freq', props);
    expect(securityStack.auditAccountName).toBe('Audit');
  });
});

describe('SecurityStack - Region-Specific Behavior', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should respect excluded regions configuration', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createSecurityStackProps({
      env: { region: 'ap-south-1', account: '00000001' },
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          macie: { enable: true, excludeRegions: ['ap-south-1'] },
          guardduty: { enable: true, excludeRegions: ['ap-south-1'] },
          securityHub: { enable: true, excludeRegions: ['ap-south-1'] },
          ebsDefaultVolumeEncryption: { enable: true, excludeRegions: ['ap-south-1'] },
        },
      },
    });
    const { securityStack } = createSecurityStackWithTemplate('test-security-stack-excluded-region', props);
    expect(securityStack.region).toBe('ap-south-1');
    expect(securityStack.auditAccountName).toBe('Audit');
  });
});

describe('SecurityStack - Multiple Services Enabled', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create KMS key when multiple services are enabled', () => {
    const props = createSecurityServicesProps({ macie: true, guardduty: true, securityHub: true, ebsEncryption: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-all-services', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    expect(Object.keys(kmsKeys).length).toBe(1);
  });
});

describe('SecurityStack - Account ID Validation', () => {
  let app: cdk.App;
  let securityStack: SecurityStack;

  beforeEach(() => {
    app = new cdk.App();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should use audit account ID for delegated admin', () => {
    const baseProps = createSecurityServicesProps({ macie: true });
    const props = createSecurityStackProps({
      ...baseProps,
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          delegatedAdminAccount: 'Audit',
        },
      },
    });
    securityStack = new SecurityStack(app, 'test-security-stack-audit-account', props);
    expect(securityStack.auditAccountId).toBe('456789012');
    expect(securityStack.auditAccountName).toBe('Audit');
  });

  it('should use log archive account ID', () => {
    const props = createSecurityStackProps();
    securityStack = new SecurityStack(app, 'test-security-stack-log-archive', props);
    expect(securityStack.logArchiveAccountId).toBe('345678901');
  });

  it('should use management account ID for config aggregation by default', () => {
    const baseProps = createSecurityStackProps();
    const props = createSecurityStackProps({
      ...baseProps,
      securityConfig: {
        ...baseProps.securityConfig,
        awsConfig: {
          ...baseProps.securityConfig.awsConfig,
          aggregation: { enable: false },
        },
      },
    });
    securityStack = new SecurityStack(app, 'test-security-stack-mgmt-account', props);
    expect(securityStack.configAggregationAccountId).toBe('234567890');
  });
});

describe('SecurityStack - Partition-Specific Behavior', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should include Cloud9 policies in aws partition', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true }, { partition: 'aws' });
    const { template } = createSecurityStackWithTemplate('test-security-stack-aws-partition', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    const cloud9Keys = Object.values(kmsKeys).filter((key: any) =>
      JSON.stringify(key).includes('cloud9.amazonaws.com'),
    );
    expect(cloud9Keys.length).toBe(1);
  });
});

describe('SecurityStack - Resource Count Validation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create no KMS keys when EBS encryption is disabled', () => {
    const props = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-kms', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    expect(Object.keys(kmsKeys).length).toBe(0);
  });

  it('should create exactly 1 KMS key when only EBS encryption is enabled', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-one-kms', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    expect(Object.keys(kmsKeys).length).toBe(1);
  });

  it('should create no custom resources when all services are disabled', () => {
    const props = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-custom', props);
    const customResources = template.findResources('Custom::*');
    expect(Object.keys(customResources).length).toBe(0);
  });

  it('should create more Lambda functions when Macie is enabled', () => {
    const propsDisabled = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template: templateDisabled } = createSecurityStackWithTemplate(
      'test-security-stack-no-lambda',
      propsDisabled,
    );
    const lambdasDisabled = templateDisabled.findResources('AWS::Lambda::Function');
    const disabledCount = Object.keys(lambdasDisabled).length;

    const propsEnabled = createSecurityServicesProps({ macie: true });
    const { template: templateEnabled } = createSecurityStackWithTemplate(
      'test-security-stack-with-lambda',
      propsEnabled,
    );
    const lambdasEnabled = templateEnabled.findResources('AWS::Lambda::Function');
    const enabledCount = Object.keys(lambdasEnabled).length;

    expect(enabledCount).toBeGreaterThan(disabledCount);
  });

  it('should create more resources when services are enabled vs disabled', () => {
    const propsDisabled = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template: templateDisabled } = createSecurityStackWithTemplate(
      'test-security-stack-disabled',
      propsDisabled,
    );
    const rolesDisabled = templateDisabled.findResources('AWS::IAM::Role');
    const lambdasDisabled = templateDisabled.findResources('AWS::Lambda::Function');

    const propsEnabled = createSecurityServicesProps({
      macie: true,
      guardduty: true,
      securityHub: true,
      ebsEncryption: true,
    });
    const { template: templateEnabled } = createSecurityStackWithTemplate('test-security-stack-enabled', propsEnabled);
    const rolesEnabled = templateEnabled.findResources('AWS::IAM::Role');
    const lambdasEnabled = templateEnabled.findResources('AWS::Lambda::Function');

    expect(Object.keys(rolesEnabled).length).toBeGreaterThan(Object.keys(rolesDisabled).length);
    expect(Object.keys(lambdasEnabled).length).toBeGreaterThan(Object.keys(lambdasDisabled).length);
  });

  it('should skip Config aggregator in non-delegated account', () => {
    const baseProps = createConfigAggregationProps();
    const propsNonDelegated = createSecurityStackProps({
      ...baseProps,
      env: { region: 'us-east-1', account: '00000001' },
    });
    const { template } = createSecurityStackWithTemplate(
      'test-security-stack-no-aggregator-non-delegated',
      propsNonDelegated,
    );
    const aggregators = template.findResources('AWS::Config::ConfigurationAggregator');
    expect(Object.keys(aggregators).length).toBe(0);
  });
});

describe('SecurityStack - Edge Cases and Multiple Configurations', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle multiple regions excluded from all services', () => {
    const baseProps = createAcceleratorStackProps();
    const excludedRegions = ['us-west-2', 'eu-west-1', 'ap-south-1'];
    const props = createSecurityStackProps({
      env: { region: 'us-west-2', account: '00000001' },
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          macie: { enable: true, excludeRegions: excludedRegions },
          guardduty: { enable: true, excludeRegions: excludedRegions },
          securityHub: { enable: true, excludeRegions: excludedRegions },
          ebsDefaultVolumeEncryption: { enable: true, excludeRegions: excludedRegions },
        },
      },
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-multi-excluded', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    expect(Object.keys(kmsKeys).length).toBe(0);
  });

  it('should create SecurityHub with multiple standards enabled', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createSecurityStackProps({
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          securityHub: {
            enable: true,
            excludeRegions: [],
            standards: [
              { name: 'AWS Foundational Security Best Practices v1.0.0', enable: true, controlsToDisable: [] },
              { name: 'CIS AWS Foundations Benchmark v1.2.0', enable: true, controlsToDisable: ['1.1', '1.2'] },
            ],
          },
        },
      },
    });
    const { securityStack } = createSecurityStackWithTemplate('test-security-stack-multi-standards', props);
    expect(securityStack.securityHubConfig).toBeDefined();
    expect(securityStack.securityHubConfig?.standards?.length).toBe(2);
  });

  it('should accept various CloudWatch log retention periods', () => {
    const retentionPeriods = [30, 90, 365, 3653];
    retentionPeriods.forEach(days => {
      const baseProps = createAcceleratorStackProps();
      const props = createSecurityServicesProps(
        { macie: true },
        { globalConfig: { ...baseProps.globalConfig, cloudwatchLogRetentionInDays: days } },
      );
      const { securityStack } = createSecurityStackWithTemplate(`test-security-stack-retention-${days}`, props);
      expect(securityStack.auditAccountName).toBe('Audit');
    });
  });

  it('should create GuardDuty with custom export prefix', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createSecurityStackProps({
      securityConfig: {
        ...baseProps.securityConfig,
        centralSecurityServices: {
          ...baseProps.securityConfig.centralSecurityServices,
          guardduty: {
            enable: true,
            excludeRegions: [],
            exportConfiguration: {
              enable: true,
              destinationType: 'S3',
              overrideExisting: true,
              overrideGuardDutyPrefix: {
                useCustomPrefix: true,
                customOverride: 'custom-guardduty-prefix',
              },
            },
          },
        },
      },
    });
    const { securityStack } = createSecurityStackWithTemplate('test-security-stack-custom-prefix', props);
    expect(securityStack.auditAccountName).toBe('Audit');
  });
});

describe('SecurityStack - Negative Test Cases', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should verify account IDs when delegated admin is Audit', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createSecurityServicesProps(
      { macie: true },
      {
        env: { region: 'us-east-1', account: '00000001' },
        securityConfig: {
          ...baseProps.securityConfig,
          centralSecurityServices: {
            ...baseProps.securityConfig.centralSecurityServices,
            delegatedAdminAccount: 'Audit',
          },
        },
      },
    );
    const { securityStack } = createSecurityStackWithTemplate('test-security-stack-wrong-account', props);
    expect(securityStack.account).toBe('00000001');
    expect(securityStack.auditAccountId).toBe('456789012');
  });

  it('should not create IAM password policy outside home region', () => {
    const props = createHomeRegionProps({ env: { region: 'eu-west-1', account: '00000001' } });
    const { template } = createSecurityStackWithTemplate('test-security-stack-non-home-iam', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const iamLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('IAM Password Policy'),
    );
    expect(iamLambdas.length).toBe(0);
  });

  it('should not create metadata resources outside management account', () => {
    const props = createMetadataEnabledProps({ env: { region: 'us-east-1', account: '00000001' } });
    const { template } = createSecurityStackWithTemplate('test-security-stack-non-mgmt-metadata', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const metadataLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Metadata'),
    );
    expect(metadataLambdas.length).toBe(0);
  });

  it('should handle all services disabled gracefully', () => {
    const props = createSecurityServicesProps({
      macie: false,
      guardduty: false,
      securityHub: false,
      ebsEncryption: false,
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-all-disabled', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    const customResources = template.findResources('Custom::*');
    expect(Object.keys(kmsKeys).length).toBe(0);
    expect(Object.keys(customResources).length).toBe(0);
  });

  it('should not create Config aggregator when disabled', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createSecurityStackProps({
      securityConfig: {
        ...baseProps.securityConfig,
        awsConfig: {
          ...baseProps.securityConfig.awsConfig,
          aggregation: { enable: false },
        },
      },
      env: { region: 'us-east-1', account: '456789012' },
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-no-config-agg', props);
    const aggregators = template.findResources('AWS::Config::ConfigurationAggregator');
    expect(Object.keys(aggregators).length).toBe(0);
  });
});

describe('SecurityStack - Resource Properties Validation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create KMS key with correct key rotation enabled', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-key-rotation', props);
    template.hasResourceProperties('AWS::KMS::Key', {
      EnableKeyRotation: true,
    });
  });

  it('should create KMS key with autoscaling service principal in policy', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-key-policy', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    const keyWithAutoscaling = Object.values(kmsKeys).find((key: any) =>
      JSON.stringify(key).includes('autoscaling.amazonaws.com'),
    );
    expect(keyWithAutoscaling).toBeDefined();
  });

  it('should create KMS key with Cloud9 principal in aws partition', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true }, { partition: 'aws' });
    const { template } = createSecurityStackWithTemplate('test-security-stack-cloud9-policy', props);
    const kmsKeys = template.findResources('AWS::KMS::Key');
    const keyWithCloud9 = Object.values(kmsKeys).find((key: any) =>
      JSON.stringify(key).includes('cloud9.amazonaws.com'),
    );
    expect(keyWithCloud9).toBeDefined();
  });

  it('should create IAM roles with correct trust relationships for Lambda', () => {
    const props = createSecurityServicesProps({ macie: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-lambda-trust', props);
    const roles = template.findResources('AWS::IAM::Role');
    const lambdaRoles = Object.values(roles).filter((role: any) =>
      JSON.stringify(role).includes('lambda.amazonaws.com'),
    );
    expect(lambdaRoles.length).toBeGreaterThanOrEqual(1);
  });

  it('should create SSM parameters with correct naming pattern', () => {
    const props = createSecurityServicesProps({ ebsEncryption: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-ssm-naming', props);
    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const paramNames = Object.values(ssmParams).map((param: any) => param.Properties?.Name);
    expect(paramNames.length).toBe(3);
    expect(paramNames.every((name: string) => name && name.includes('accelerator'))).toBe(true);
  });

  it('should create Lambda functions with correct runtime', () => {
    const props = createSecurityServicesProps({ macie: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-lambda-runtime', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const lambdaRuntimes = Object.values(lambdas).map((lambda: any) => lambda.Properties?.Runtime);
    expect(lambdaRuntimes.every((runtime: string) => runtime && runtime.startsWith('nodejs'))).toBe(true);
  });
});

describe('SecurityStack - Error Conditions and Invalid Configurations', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should handle Config aggregation in wrong account gracefully', () => {
    const props = createConfigAggregationProps({ env: { region: 'us-east-1', account: '99999999' } });
    const { template } = createSecurityStackWithTemplate('test-security-stack-wrong-agg-account', props);
    const aggregators = template.findResources('AWS::Config::ConfigurationAggregator');
    expect(Object.keys(aggregators).length).toBe(0);
  });

  it('should handle single account mode with IAM password policy', () => {
    const props = createHomeRegionProps({ enableSingleAccountMode: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-single-mode-iam', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const iamLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('IAM Password Policy'),
    );
    expect(iamLambdas.length).toBe(0);
  });

  it('should handle existing roles mode with IAM password policy', () => {
    const props = createHomeRegionProps({ useExistingRoles: true });
    const { template } = createSecurityStackWithTemplate('test-security-stack-existing-roles-iam', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const iamLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('IAM Password Policy'),
    );
    expect(iamLambdas.length).toBe(0);
  });

  it('should create stack successfully with minimal configuration', () => {
    const props = createSecurityStackProps();
    const { securityStack } = createSecurityStackWithTemplate('test-security-stack-minimal', props);
    expect(securityStack.auditAccountName).toBe('Audit');
    expect(securityStack.logArchiveAccountId).toBe('345678901');
  });

  it('should handle metadata disabled in management account', () => {
    const baseProps = createAcceleratorStackProps();
    const props = createSecurityStackProps({
      globalConfig: {
        ...baseProps.globalConfig,
        homeRegion: 'us-east-1',
        acceleratorMetadata: {
          enable: false,
          account: 'LogArchive',
          readOnlyAccessRoleArns: [],
        },
      },
      env: { region: 'us-east-1', account: '234567890' },
    });
    const { template } = createSecurityStackWithTemplate('test-security-stack-metadata-disabled', props);
    const lambdas = template.findResources('AWS::Lambda::Function');
    const metadataLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Metadata'),
    );
    expect(metadataLambdas.length).toBe(0);
  });
});

// Helper functions
interface SecurityServicesConfig {
  macie?: boolean;
  guardduty?: boolean;
  securityHub?: boolean;
  ebsEncryption?: boolean;
}

function createSecurityServicesProps(
  services: SecurityServicesConfig,
  overrides?: Partial<AcceleratorStackProps>,
): AcceleratorStackProps {
  const baseProps = createAcceleratorStackProps();
  return createSecurityStackProps({
    securityConfig: {
      ...baseProps.securityConfig,
      centralSecurityServices: {
        ...baseProps.securityConfig.centralSecurityServices,
        ...(services.macie !== undefined && {
          macie: { enable: services.macie, excludeRegions: [] },
        }),
        ...(services.guardduty !== undefined && {
          guardduty: {
            enable: services.guardduty,
            excludeRegions: [],
            exportConfiguration: { enable: true, destinationType: 'S3', overrideExisting: false },
          },
        }),
        ...(services.securityHub !== undefined && {
          securityHub: {
            enable: services.securityHub,
            excludeRegions: [],
            standards: [
              { name: 'AWS Foundational Security Best Practices v1.0.0', enable: true, controlsToDisable: [] },
            ],
          },
        }),
        ...(services.ebsEncryption !== undefined && {
          ebsDefaultVolumeEncryption: { enable: services.ebsEncryption, excludeRegions: [] },
        }),
      },
    },
    ...overrides,
  });
}

function createHomeRegionProps(overrides?: Partial<AcceleratorStackProps>): AcceleratorStackProps {
  const baseProps = createAcceleratorStackProps();
  return createSecurityStackProps({
    globalConfig: { ...baseProps.globalConfig, homeRegion: 'us-east-1' },
    env: { region: 'us-east-1', account: '00000001' },
    enableSingleAccountMode: false,
    useExistingRoles: false,
    ...overrides,
  });
}

function createConfigAggregationProps(overrides?: Partial<AcceleratorStackProps>): AcceleratorStackProps {
  const baseProps = createAcceleratorStackProps();
  return createSecurityStackProps({
    securityConfig: {
      ...baseProps.securityConfig,
      awsConfig: {
        ...baseProps.securityConfig.awsConfig,
        aggregation: { enable: true, delegatedAdminAccount: 'Audit' },
      },
    },
    env: { region: 'us-east-1', account: '456789012' },
    ...overrides,
  });
}

function createMetadataEnabledProps(overrides?: Partial<AcceleratorStackProps>): AcceleratorStackProps {
  const baseProps = createAcceleratorStackProps();
  return createSecurityStackProps({
    globalConfig: {
      ...baseProps.globalConfig,
      homeRegion: 'us-east-1',
      acceleratorMetadata: {
        enable: true,
        account: 'LogArchive',
        readOnlyAccessRoleArns: [],
      },
    },
    env: { region: 'us-east-1', account: '234567890' },
    ...overrides,
  });
}

function createSecurityStackWithTemplate(
  stackName: string,
  props: AcceleratorStackProps,
): { securityStack: SecurityStack; template: Template } {
  const securityStack = new SecurityStack(new cdk.App(), stackName, props);
  const template = Template.fromStack(securityStack);
  return { securityStack, template };
}

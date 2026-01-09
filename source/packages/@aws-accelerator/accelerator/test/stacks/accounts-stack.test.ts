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

import { beforeEach, describe, expect, vi, it, afterEach } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { AccountsStack, AccountsStackProps } from '../../lib/stacks/accounts-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';
import { Template } from 'aws-cdk-lib/assertions';
import { Create } from '../accelerator-test-helpers';
import { AcceleratorStage } from '../../lib/accelerator-stage';

const LOG_RETENTION_DAYS = 123;
const EVENT_RETRY_ATTEMPTS = 3;

function createTestAccountsStackProps(overrides?: Partial<AccountsStackProps>): AccountsStackProps {
  const baseProps = createAcceleratorStackProps();
  return {
    ...baseProps,
    configDirPath: './',
    ...overrides,
  };
}

function createGlobalRegionProps(overrides?: Partial<AccountsStackProps>): AccountsStackProps {
  const baseProps = createTestAccountsStackProps({
    globalRegion: 'us-east-1',
    env: { region: 'us-east-1', account: '00000001' },
    ...overrides,
  });
  return {
    ...baseProps,
    ...overrides,
  };
}

function createMoveAccountRuleProps(overrides?: Partial<AccountsStackProps>): AccountsStackProps {
  const baseProps = createAcceleratorStackProps();
  return createGlobalRegionProps({
    organizationConfig: {
      ...baseProps.organizationConfig,
      enable: true,
    },
    globalConfig: {
      ...baseProps.globalConfig,
      controlTower: { enable: false },
    },
    ...overrides,
  });
}

describe('AccountsStack - OptInRegions', () => {
  let app: cdk.App;
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create OptInRegions when enableOptInRegions is true', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createTestAccountsStackProps({
      globalConfig: {
        ...baseProps.globalConfig,
        enableOptInRegions: true,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-optin', props);
    template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const optInLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Opt-in Regions'),
    );
    expect(optInLambdas.length).toBe(2);
  });

  it('should not create OptInRegions when enableOptInRegions is false', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createTestAccountsStackProps({
      globalConfig: {
        ...baseProps.globalConfig,
        enableOptInRegions: false,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-no-optin', props);
    template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const optInLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Opt-in Regions'),
    );
    expect(optInLambdas.length).toBe(0);
  });

  it('should create Step Functions state machine for OptInRegions', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createTestAccountsStackProps({
      globalConfig: {
        ...baseProps.globalConfig,
        enableOptInRegions: true,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-sfn', props);
    template = Template.fromStack(accountsStack);

    const stateMachines = template.findResources('AWS::StepFunctions::StateMachine');
    expect(Object.keys(stateMachines).length).toBe(1);
  });

  it('should create 2 Lambda functions for OptInRegions', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createTestAccountsStackProps({
      globalConfig: {
        ...baseProps.globalConfig,
        enableOptInRegions: true,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-optin-lambdas', props);
    template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const optInLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Opt-in Regions'),
    );
    expect(optInLambdas.length).toBe(2);
  });
});

describe('AccountsStack - MoveAccountRule', () => {
  let app: cdk.App;
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create MoveAccountRule in global region when organization is enabled and ControlTower is disabled', () => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps();
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-move', props);
    template = Template.fromStack(accountsStack);

    template.hasResourceProperties('AWS::Events::Rule', {
      Description: 'CloudWatch Events rule to monitor for Organizations MoveAccount events',
      EventPattern: {
        source: ['aws.organizations'],
        'detail-type': ['AWS API Call via CloudTrail'],
        detail: {
          eventName: ['MoveAccount'],
          eventSource: ['organizations.amazonaws.com'],
        },
      },
    });
  });

  it('should not create MoveAccountRule when ControlTower is enabled', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: true },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-no-move', props);
    template = Template.fromStack(accountsStack);

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(0);
  });

  it('should not create MoveAccountRule when organization is disabled', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      organizationConfig: {
        ...baseProps.organizationConfig,
        enable: false,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-no-org', props);
    template = Template.fromStack(accountsStack);

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(0);
  });

  it('should not create MoveAccountRule in non-global region', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createTestAccountsStackProps({
      globalRegion: 'us-east-1',
      env: { region: 'us-west-2', account: '00000001' },
      organizationConfig: {
        ...baseProps.organizationConfig,
        enable: true,
      },
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-non-global', props);
    template = Template.fromStack(accountsStack);

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(0);
  });
});

describe('AccountsStack - MoveAccountRule Lambda Configuration', () => {
  let app: cdk.App;
  let accountsStack: AccountsStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps();
    accountsStack = new AccountsStack(app, 'test-accounts-stack-lambda', props);
    template = Template.fromStack(accountsStack);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should configure MoveAccountRule Lambda with HOME_REGION, GLOBAL_REGION, and CONFIG_TABLE_NAME', () => {
    const lambdas = template.findResources('AWS::Lambda::Function');
    const moveAccountLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountLambdas.length).toBe(1);

    const moveAccountLambda = moveAccountLambdas[0] as any;
    expect(moveAccountLambda.Properties.Environment.Variables).toHaveProperty('HOME_REGION');
    expect(moveAccountLambda.Properties.Environment.Variables).toHaveProperty('GLOBAL_REGION');
    expect(moveAccountLambda.Properties.Environment.Variables).toHaveProperty('CONFIG_TABLE_NAME');
  });

  it('should configure MoveAccountRule Lambda with IAM policies', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const moveAccountPolicies = Object.values(policies).filter((policy: any) =>
      JSON.stringify(policy).includes('MoveAccount'),
    );
    expect(moveAccountPolicies.length).toBe(1);
  });
});

describe('AccountsStack - Global Region Actions', () => {
  let app: cdk.App;
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not create MoveAccount resources in non-global region', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createTestAccountsStackProps({
      globalRegion: 'us-east-1',
      env: { region: 'us-west-2', account: '00000001' },
      organizationConfig: {
        ...baseProps.organizationConfig,
        enable: true,
      },
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-non-global-actions', props);
    template = Template.fromStack(accountsStack);

    expect(accountsStack.region).toBe('us-west-2');

    const lambdas = template.findResources('AWS::Lambda::Function');
    const moveAccountLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountLambdas.length).toBe(0);
  });
});

describe('AccountsStack - CloudWatch Log Groups', () => {
  let app: cdk.App;
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create CloudWatch log groups for Lambda functions', () => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps();
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-logs', props);
    template = Template.fromStack(accountsStack);

    const logGroups = template.findResources('AWS::Logs::LogGroup');
    expect(Object.keys(logGroups).length).toBe(1);
  });

  it('should configure log retention for CloudWatch log groups', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
        cloudwatchLogRetentionInDays: LOG_RETENTION_DAYS,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-log-retention', props);
    template = Template.fromStack(accountsStack);

    const logGroups = template.findResources('AWS::Logs::LogGroup');
    const logGroupsWithRetention = Object.values(logGroups).filter(
      (logGroup: any) => logGroup.Properties?.RetentionInDays === LOG_RETENTION_DAYS,
    );
    expect(logGroupsWithRetention.length).toBe(1);
  });
});

describe('AccountsStack - EventBridge Rules', () => {
  let app: cdk.App;
  let accountsStack: AccountsStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps();
    accountsStack = new AccountsStack(app, 'test-accounts-stack-events', props);
    template = Template.fromStack(accountsStack);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should configure EventBridge rule with 3 retry attempts', () => {
    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(1);

    const moveAccountRule = moveAccountRules[0] as any;
    expect(moveAccountRule.Properties.Targets[0].RetryPolicy.MaximumRetryAttempts).toBe(EVENT_RETRY_ATTEMPTS);
  });

  it('should configure EventBridge rule state as ENABLED', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      State: 'ENABLED',
    });
  });
});

describe('AccountsStack - IAM Roles and Policies', () => {
  let app: cdk.App;
  let accountsStack: AccountsStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps();
    accountsStack = new AccountsStack(app, 'test-accounts-stack-iam', props);
    template = Template.fromStack(accountsStack);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create IAM policies with DynamoDB Query permissions', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const dynamoDbPolicies = Object.values(policies).filter((policy: any) =>
      JSON.stringify(policy).includes('dynamodb:Query'),
    );
    expect(dynamoDbPolicies.length).toBe(1);
  });

  it('should create IAM policies with Organizations MoveAccount permissions', () => {
    const policies = template.findResources('AWS::IAM::Policy');
    const orgsPolicies = Object.values(policies).filter((policy: any) =>
      JSON.stringify(policy).includes('organizations:MoveAccount'),
    );
    expect(orgsPolicies.length).toBe(1);
  });
});

describe('AccountsStack - OptInRegions in All Regions', () => {
  let app: cdk.App;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create OptInRegions in non-global regions when enabled', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createTestAccountsStackProps({
      globalRegion: 'us-east-1',
      env: { region: 'us-west-2', account: '00000001' },
      globalConfig: {
        ...baseProps.globalConfig,
        enableOptInRegions: true,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-optin-all-regions', props);
    const template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const optInLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('Opt-in Regions'),
    );
    expect(optInLambdas.length).toBe(2);
  });
});

describe('AccountsStack - Configuration Value Mapping', () => {
  let app: cdk.App;
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test that cloudwatchLogRetentionInDays configuration maps to CloudFormation
  it('should set log retention to 30 days when configured', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
        cloudwatchLogRetentionInDays: 30,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-retention-30', props);
    template = Template.fromStack(accountsStack);

    const logGroups = template.findResources('AWS::Logs::LogGroup');
    const logGroupsWithRetention = Object.values(logGroups).filter(
      (logGroup: any) => logGroup.Properties?.RetentionInDays === 30,
    );
    expect(logGroupsWithRetention.length).toBe(1);
  });

  it('should set log retention to 90 days when configured', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
        cloudwatchLogRetentionInDays: 90,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-retention-90', props);
    template = Template.fromStack(accountsStack);

    const logGroups = template.findResources('AWS::Logs::LogGroup');
    const logGroupsWithRetention = Object.values(logGroups).filter(
      (logGroup: any) => logGroup.Properties?.RetentionInDays === 90,
    );
    expect(logGroupsWithRetention.length).toBe(1);
  });

  it('should set log retention to 365 days when configured', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
        cloudwatchLogRetentionInDays: 365,
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-retention-365', props);
    template = Template.fromStack(accountsStack);

    const logGroups = template.findResources('AWS::Logs::LogGroup');
    const logGroupsWithRetention = Object.values(logGroups).filter(
      (logGroup: any) => logGroup.Properties?.RetentionInDays === 365,
    );
    expect(logGroupsWithRetention.length).toBe(1);
  });

  // Test that homeRegion configuration maps to Lambda environment variables
  it('should set HOME_REGION environment variable to ap-southeast-2', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      globalConfig: {
        ...baseProps.globalConfig,
        homeRegion: 'ap-southeast-2',
        controlTower: { enable: false },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-home-ap-southeast-2', props);
    template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const moveAccountLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountLambdas.length).toBe(1);

    const moveAccountLambda = moveAccountLambdas[0] as any;
    expect(moveAccountLambda.Properties.Environment.Variables.HOME_REGION).toBe('ap-southeast-2');
  });

  it('should set HOME_REGION environment variable to eu-west-1', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      globalRegion: 'eu-west-1',
      env: { region: 'eu-west-1', account: '00000001' },
      globalConfig: {
        ...baseProps.globalConfig,
        homeRegion: 'eu-west-1',
        controlTower: { enable: false },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-home-eu-west-1', props);
    template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const moveAccountLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountLambdas.length).toBe(1);

    const moveAccountLambda = moveAccountLambdas[0] as any;
    expect(moveAccountLambda.Properties.Environment.Variables.HOME_REGION).toBe('eu-west-1');
  });

  // Test that globalRegion configuration maps to Lambda environment variables
  it('should set GLOBAL_REGION environment variable to us-west-2 when configured', () => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps({
      globalRegion: 'us-west-2',
      env: { region: 'us-west-2', account: '00000001' },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-global-us-west-2', props);
    template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const moveAccountLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountLambdas.length).toBe(1);

    const moveAccountLambda = moveAccountLambdas[0] as any;
    expect(moveAccountLambda.Properties.Environment.Variables.GLOBAL_REGION).toBe('us-west-2');
  });

  // Test that accelerator prefix configuration maps to Lambda environment variables
  it('should set STACK_PREFIX environment variable to custom-prefix when configured', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createMoveAccountRuleProps({
      prefixes: {
        ...baseProps.prefixes,
        accelerator: 'custom-prefix',
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-custom-prefix', props);
    template = Template.fromStack(accountsStack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const moveAccountLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountLambdas.length).toBe(1);

    const moveAccountLambda = moveAccountLambdas[0] as any;
    expect(moveAccountLambda.Properties.Environment.Variables.STACK_PREFIX).toBe('custom-prefix');
  });
});

describe('AccountsStack - Quarantine SCP Functionality', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create quarantine Lambda function when quarantine is enabled', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.ACCOUNTS);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const quarantineLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('quarantine scp'),
    );
    expect(quarantineLambdas.length).toBe(1);
  });

  it('should create EventBridge rule for CreateAccount events when quarantine is enabled', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.ACCOUNTS);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    template.hasResourceProperties('AWS::Events::Rule', {
      Description: 'Rule to notify when a new account is created.',
      EventPattern: {
        source: ['aws.organizations'],
        'detail-type': ['AWS API Call via CloudTrail'],
        detail: {
          eventName: ['CreateAccount'],
          eventSource: ['organizations.amazonaws.com'],
        },
      },
    });
  });

  it('should configure Lambda with correct SCP_POLICY_NAME environment variable', () => {
    const stack = Create.stack('Management-us-east-1', AcceleratorStage.ACCOUNTS);
    expect(stack).toBeDefined();
    const template = Template.fromStack(stack!);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const quarantineLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('quarantine scp'),
    );
    expect(quarantineLambdas.length).toBe(1);

    const quarantineLambda = quarantineLambdas[0] as any;
    expect(quarantineLambda.Properties.Environment.Variables.SCP_POLICY_NAME).toBe('Quarantine');
  });
});

describe('AccountsStack - MoveAccountRule Configuration Combinations', () => {
  let app: cdk.App;
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test various combinations of organization and ControlTower settings
  it('should create MoveAccountRule when organization=true and ControlTower=false', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createGlobalRegionProps({
      organizationConfig: {
        ...baseProps.organizationConfig,
        enable: true,
      },
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-org-true-ct-false', props);
    template = Template.fromStack(accountsStack);

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(1);
  });

  it('should not create MoveAccountRule when organization=true and ControlTower=true', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createGlobalRegionProps({
      organizationConfig: {
        ...baseProps.organizationConfig,
        enable: true,
      },
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: true },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-org-true-ct-true', props);
    template = Template.fromStack(accountsStack);

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(0);
  });

  it('should not create MoveAccountRule when organization=false and ControlTower=false', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createGlobalRegionProps({
      organizationConfig: {
        ...baseProps.organizationConfig,
        enable: false,
      },
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: false },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-org-false-ct-false', props);
    template = Template.fromStack(accountsStack);

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(0);
  });

  it('should not create MoveAccountRule when organization=false and ControlTower=true', () => {
    app = new cdk.App();
    const baseProps = createAcceleratorStackProps();
    const props = createGlobalRegionProps({
      organizationConfig: {
        ...baseProps.organizationConfig,
        enable: false,
      },
      globalConfig: {
        ...baseProps.globalConfig,
        controlTower: { enable: true },
      },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-org-false-ct-true', props);
    template = Template.fromStack(accountsStack);

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(0);
  });
});

describe('AccountsStack - Region-Specific Behavior', () => {
  let app: cdk.App;
  let template: Template;

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test that resources are created differently based on region
  it('should create MoveAccountRule in us-east-1 when it is the global region', () => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps({
      globalRegion: 'us-east-1',
      env: { region: 'us-east-1', account: '00000001' },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-us-east-1-global', props);
    template = Template.fromStack(accountsStack);

    expect(accountsStack.region).toBe('us-east-1');

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(1);
  });

  it('should set GLOBAL_REGION environment variable to eu-west-1 when it is the global region', () => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps({
      globalRegion: 'eu-west-1',
      env: { region: 'eu-west-1', account: '00000001' },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-eu-west-1-global', props);
    template = Template.fromStack(accountsStack);

    expect(accountsStack.region).toBe('eu-west-1');

    const lambdas = template.findResources('AWS::Lambda::Function');
    const moveAccountLambdas = Object.values(lambdas).filter((lambda: any) =>
      lambda.Properties?.Description?.includes('MoveAccount'),
    );
    const moveAccountLambda = moveAccountLambdas[0] as any;
    expect(moveAccountLambda.Properties.Environment.Variables.GLOBAL_REGION).toBe('eu-west-1');
  });

  it('should not create MoveAccountRule in non-global region', () => {
    app = new cdk.App();
    const props = createMoveAccountRuleProps({
      globalRegion: 'us-east-1',
      env: { region: 'us-west-2', account: '00000001' },
    });
    const accountsStack = new AccountsStack(app, 'test-accounts-stack-us-west-2-non-global', props);
    template = Template.fromStack(accountsStack);

    expect(accountsStack.region).toBe('us-west-2');

    const rules = template.findResources('AWS::Events::Rule');
    const moveAccountRules = Object.values(rules).filter((rule: any) =>
      rule.Properties?.Description?.includes('MoveAccount'),
    );
    expect(moveAccountRules.length).toBe(0);
  });
});

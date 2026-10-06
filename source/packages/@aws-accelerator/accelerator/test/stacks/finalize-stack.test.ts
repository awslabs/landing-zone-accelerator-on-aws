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

import { OrganizationConfig } from '@aws-accelerator/config';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AcceleratorStack, AcceleratorStackProps } from '../../lib/stacks/accelerator-stack';
import { FinalizeStack } from '../../lib/stacks/finalize-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

const GLOBAL_REGION = 'us-east-1';
const NON_GLOBAL_REGION = 'us-west-2';

function buildFinalizeProps(overrides?: {
  region?: string;
  globalRegion?: string;
  partition?: string;
  quarantineEnabled?: boolean;
  quarantinePolicyName?: string;
}): AcceleratorStackProps {
  const base = createAcceleratorStackProps();
  const region = overrides?.region ?? GLOBAL_REGION;
  const globalRegion = overrides?.globalRegion ?? GLOBAL_REGION;

  const organizationConfig = {
    ...base.organizationConfig,
    quarantineNewAccounts: {
      enable: overrides?.quarantineEnabled ?? false,
      scpPolicyName: overrides?.quarantinePolicyName ?? 'Quarantine',
    },
  } as OrganizationConfig;

  return {
    ...base,
    env: { account: '234567890', region },
    globalRegion,
    partition: overrides?.partition ?? 'aws',
    organizationConfig,
  } as AcceleratorStackProps;
}

let app: cdk.App;
let originalCommitId: string | undefined;

beforeEach(() => {
  app = new cdk.App();
  originalCommitId = process.env['CONFIG_COMMIT_ID'];
  // Stub the accelerator key lookups so tests do not require SSM
  vi.spyOn(AcceleratorStack.prototype, 'getAcceleratorKey').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCommitId === undefined) {
    delete process.env['CONFIG_COMMIT_ID'];
  } else {
    process.env['CONFIG_COMMIT_ID'] = originalCommitId;
  }
});

describe('FinalizeStack - region gating', () => {
  test('non-global region produces no Lambda functions', () => {
    delete process.env['CONFIG_COMMIT_ID'];
    const props = buildFinalizeProps({ region: NON_GLOBAL_REGION, globalRegion: GLOBAL_REGION });
    const stack = new FinalizeStack(app, 'test-finalize-non-global', props);
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Lambda::Function', 0);
  });

  test('non-global region produces no quarantine resources', () => {
    const props = buildFinalizeProps({
      region: NON_GLOBAL_REGION,
      globalRegion: GLOBAL_REGION,
      quarantineEnabled: true,
    });
    const stack = new FinalizeStack(app, 'test-finalize-non-global-quarantine', props);
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::Events::Rule', 0);
    template.resourceCountIs('AWS::Lambda::Function', 0);
  });
});

describe('FinalizeStack - CONFIG_COMMIT_ID env var', () => {
  test('creates SSM parameter when CONFIG_COMMIT_ID is set', () => {
    process.env['CONFIG_COMMIT_ID'] = 'test-commit-id-123';
    const props = buildFinalizeProps({ region: GLOBAL_REGION, globalRegion: GLOBAL_REGION });
    const stack = new FinalizeStack(app, 'test-finalize-commit-id', props);
    const template = Template.fromStack(stack);

    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const commitParam = Object.values(ssmParams).find(
      (p: any) => typeof p.Properties?.Name === 'string' && p.Properties.Name.endsWith('/configuration/configCommitId'),
    );
    expect(commitParam).toBeDefined();
    expect((commitParam as any).Properties.Value).toBe('test-commit-id-123');
  });

  test('does not create SSM parameter when CONFIG_COMMIT_ID is not set', () => {
    delete process.env['CONFIG_COMMIT_ID'];
    const props = buildFinalizeProps({ region: GLOBAL_REGION, globalRegion: GLOBAL_REGION });
    const stack = new FinalizeStack(app, 'test-finalize-no-commit-id', props);
    const template = Template.fromStack(stack);

    const ssmParams = template.findResources('AWS::SSM::Parameter');
    const commitParam = Object.values(ssmParams).find(
      (p: any) => typeof p.Properties?.Name === 'string' && p.Properties.Name.endsWith('/configuration/configCommitId'),
    );
    expect(commitParam).toBeUndefined();
  });
});

describe('FinalizeStack - quarantineNewAccounts gating', () => {
  test('does not create quarantine Lambda when feature is disabled', () => {
    const props = buildFinalizeProps({ quarantineEnabled: false });
    const stack = new FinalizeStack(app, 'test-finalize-quarantine-off', props);
    const template = Template.fromStack(stack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const quarantineLambdas = Object.values(lambdas).filter((l: any) =>
      l.Properties?.Description?.toLowerCase().includes('quarantine'),
    );
    expect(quarantineLambdas.length).toBe(0);
  });

  test('creates quarantine resources when enabled on aws partition', () => {
    const props = buildFinalizeProps({ quarantineEnabled: true, partition: 'aws' });
    const stack = new FinalizeStack(app, 'test-finalize-quarantine-aws', props);
    const template = Template.fromStack(stack);

    const lambdas = template.findResources('AWS::Lambda::Function');
    const quarantineLambdas = Object.values(lambdas).filter((l: any) =>
      JSON.stringify(l).toLowerCase().includes('quarantine'),
    );
    expect(quarantineLambdas.length).toBeGreaterThan(0);
  });

  test.each(['aws-us-gov', 'aws-cn', 'aws-iso', 'aws-iso-b', 'aws-iso-f', 'aws-iso-e', 'aws-eusc'])(
    'creates quarantine detach resources on %s partition when enabled',
    partition => {
      const props = buildFinalizeProps({ quarantineEnabled: true, partition });
      const stack = new FinalizeStack(app, `test-finalize-quarantine-${partition}`, props);
      const template = Template.fromStack(stack);

      template.resourceCountIs('Custom::DetachQuarantineScp', 1);
    },
  );

  test('detach resource policy uses the partition-correct Organizations ARNs', () => {
    const props = buildFinalizeProps({ quarantineEnabled: true, partition: 'aws-us-gov' });
    const stack = new FinalizeStack(app, 'test-finalize-quarantine-usgov-arns', props);
    const template = Template.fromStack(stack);

    const policies = JSON.stringify(template.findResources('AWS::IAM::Role'));
    expect(policies).toContain('arn:aws-us-gov:organizations::');
    expect(policies).not.toContain('arn:aws:organizations::');
  });
});

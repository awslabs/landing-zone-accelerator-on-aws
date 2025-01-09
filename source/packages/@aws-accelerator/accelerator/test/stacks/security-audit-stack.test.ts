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

import { GuardDutyConfig, GuardDutyExportFindingsConfig, Region } from '@aws-accelerator/config';
import { describe } from '@jest/globals';
import * as cdk from 'aws-cdk-lib';
import { SecurityAuditStack } from '../../lib/stacks/security-audit-stack';
import { createAcceleratorStackProps } from './stack-props-test-helper';

describe('unit tests', () => {
  let app: cdk.App;

  beforeEach(() => {
    app = new cdk.App();
  });

  test('processRegionExclusions with true values', () => {
    const props = createAcceleratorStackProps();
    const stack = new SecurityAuditStack(app, 'unit-test-stack', props);

    const config = createConfig(true, []);
    const result = stack['processRegionExclusions'](config);
    expect(result).toHaveLength(7);
    expect(result[0]).toBeTruthy();
    expect(result[1]).toBeTruthy();
  });

  test('processRegionExclusions with false', () => {
    const props = createAcceleratorStackProps();
    const stack = new SecurityAuditStack(app, 'unit-test-stack', props);

    const config = createConfig(false, []);
    const result = stack['processRegionExclusions'](config);
    expect(result).toHaveLength(7);
    expect(result[0]).toBeFalsy();
    expect(result[1]).toBeFalsy();
  });

  test('processRegionExclusions with region excluded', () => {
    const props = createAcceleratorStackProps();
    const stack = new SecurityAuditStack(app, 'unit-test-stack', props);

    const config = createConfig(true, ['us-east-1']);
    const result = stack['processRegionExclusions'](config);
    expect(result).toHaveLength(7);
    expect(result[0]).toBeFalsy();
    expect(result[1]).toBeFalsy();
  });
});

function createConfig(enable: boolean, excludedRegions: Region[]): GuardDutyConfig {
  const config: GuardDutyConfig = {
    enable: enable,
    excludeRegions: [],
    s3Protection: {
      enable: enable,
      excludeRegions: excludedRegions,
    },
    eksProtection: {
      enable: enable,
      manageAgent: enable,
      excludeRegions: excludedRegions,
    },
    ec2Protection: {
      enable: enable,
      excludeRegions: excludedRegions,
      keepSnapshots: enable,
    },
    rdsProtection: {
      enable: enable,
      excludeRegions: excludedRegions,
    },
    lambdaProtection: {
      enable: enable,
      excludeRegions: excludedRegions,
    },
    deploymentTargets: undefined,
    autoEnableOrgMembers: undefined,
    exportConfiguration: new GuardDutyExportFindingsConfig(),
    lifecycleRules: undefined,
  };
  return config;
}

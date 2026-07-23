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

import { describe, expect, test, vi } from 'vitest';
import { getOrganizationFeaturesEnabled } from '../index';

// Mock console output
vi.spyOn(console, 'log').mockImplementation(() => {
  /* mock implementation */
});

describe('getOrganizationFeaturesEnabled', () => {
  test('Runtime Monitoring with all agents emits RUNTIME_MONITORING and suppresses legacy EKS_RUNTIME_MONITORING', () => {
    // s3, eks(audit), eksAgent, ec2, rds, lambda, runtimeMonitoring, manageEks, manageEcsFargate, manageEc2, autoEnable
    const result = getOrganizationFeaturesEnabled(
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      'ALL',
    );

    expect(result.find(feature => feature.Name === 'EKS_RUNTIME_MONITORING')).toBeUndefined();
    const runtime = result.find(feature => feature.Name === 'RUNTIME_MONITORING');
    expect(runtime).not.toBeUndefined();
    expect(runtime!.AutoEnable).toBe('ALL');
    expect(runtime!.AdditionalConfiguration).toHaveLength(3);
    const names = runtime!.AdditionalConfiguration!.map(config => config.Name);
    expect(names).toContain('EKS_ADDON_MANAGEMENT');
    expect(names).toContain('ECS_FARGATE_AGENT_MANAGEMENT');
    expect(names).toContain('EC2_AGENT_MANAGEMENT');
  });

  test('Runtime Monitoring suppresses legacy EKS agent even when eksAgent is also requested', () => {
    const result = getOrganizationFeaturesEnabled(
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      'ALL',
    );

    expect(result.find(feature => feature.Name === 'EKS_RUNTIME_MONITORING')).toBeUndefined();
    const runtime = result.find(feature => feature.Name === 'RUNTIME_MONITORING');
    expect(runtime).not.toBeUndefined();
    expect(runtime!.AdditionalConfiguration).toBeUndefined();
  });

  test('legacy EKS agent path is unchanged when Runtime Monitoring is disabled', () => {
    const result = getOrganizationFeaturesEnabled(
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      'ALL',
    );

    expect(result.find(feature => feature.Name === 'RUNTIME_MONITORING')).toBeUndefined();
    const eks = result.find(feature => feature.Name === 'EKS_RUNTIME_MONITORING');
    expect(eks).not.toBeUndefined();
    expect(eks!.AdditionalConfiguration).toHaveLength(1);
    expect(eks!.AdditionalConfiguration![0].Name).toBe('EKS_ADDON_MANAGEMENT');
  });

  test('Runtime Monitoring with no agent management omits AdditionalConfiguration', () => {
    const result = getOrganizationFeaturesEnabled(
      false,
      false,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      'NONE',
    );

    const runtime = result.find(feature => feature.Name === 'RUNTIME_MONITORING');
    expect(runtime).not.toBeUndefined();
    expect(runtime!.AutoEnable).toBe('NONE');
    expect(runtime!.AdditionalConfiguration).toBeUndefined();
  });
});

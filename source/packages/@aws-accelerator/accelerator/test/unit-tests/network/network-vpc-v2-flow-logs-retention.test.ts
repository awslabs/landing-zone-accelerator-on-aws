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

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as yaml from 'js-yaml';
import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { NetworkConfig } from '@aws-accelerator/config';

import { AcceleratorStage } from '../../../lib/accelerator-stage';
import { Create } from '../../accelerator-test-helpers';

// Regression test for the CloudWatch Logs retention of v2 VPC flow log groups.
// The v2 VpcBaseStack must use vpcFlowLogs.destinationsConfig.cloudWatchLogs.retentionInDays
// when it is set, and fall back to the global-config cloudwatchLogRetentionInDays when it is
// not. It must also synthesize when destinationsConfig is omitted entirely.
//
// The snapshot-only v2-network-config.yaml is adjusted in memory (by wrapping
// NetworkConfig.loadFromString, which the test synth helper uses to load that file) so
// each case uses a distinct retention value:
//   - Network-Secondary-V2: VPC-level cloudWatchLogs.retentionInDays = 30 (override)
//   - Network-Secondary: inherits the top-level vpcFlowLogs, whose destinationsConfig
//     is left with only an s3 block (destinationsConfig present, cloudWatchLogs absent)
//   - Network-Endpoints: VPC-level vpcFlowLogs with no destinationsConfig at all
const GLOBAL_LOG_RETENTION_IN_DAYS = 3653;
const VPC_FLOW_LOG_RETENTION_IN_DAYS = 30;

const OVERRIDE_VPC = 'Network-Secondary-V2';
const INHERITED_NO_CWL_CONFIG_VPC = 'Network-Secondary';
const NO_DESTINATIONS_CONFIG_VPC = 'Network-Endpoints';

interface FlowLogsYaml {
  destinations: string[];
  destinationsConfig?: { s3?: unknown; cloudWatchLogs?: { retentionInDays?: number } };
}

interface NetworkConfigYaml {
  vpcFlowLogs?: FlowLogsYaml;
  vpcs: { name: string; vpcFlowLogs?: FlowLogsYaml }[];
}

function getVpc(config: NetworkConfigYaml, name: string) {
  const vpc = config.vpcs.find(item => item.name === name);
  if (!vpc) {
    throw new Error(`Test fixture is missing VPC ${name} in v2-network-config.yaml`);
  }
  return vpc;
}

function applyRetentionScenarios(content: string): string {
  const config = yaml.load(content) as NetworkConfigYaml;

  const overrideFlowLogs = getVpc(config, OVERRIDE_VPC).vpcFlowLogs;
  if (!overrideFlowLogs) {
    throw new Error(`Test fixture VPC ${OVERRIDE_VPC} must define vpcFlowLogs`);
  }
  overrideFlowLogs.destinationsConfig = {
    ...overrideFlowLogs.destinationsConfig,
    cloudWatchLogs: { retentionInDays: VPC_FLOW_LOG_RETENTION_IN_DAYS },
  };

  if (getVpc(config, INHERITED_NO_CWL_CONFIG_VPC).vpcFlowLogs) {
    throw new Error(`Test fixture VPC ${INHERITED_NO_CWL_CONFIG_VPC} must inherit the top-level vpcFlowLogs`);
  }
  if (!config.vpcFlowLogs?.destinationsConfig?.s3) {
    throw new Error('Test fixture top-level vpcFlowLogs must define destinationsConfig.s3');
  }
  delete config.vpcFlowLogs.destinationsConfig.cloudWatchLogs;

  const noDestinationsConfigFlowLogs = getVpc(config, NO_DESTINATIONS_CONFIG_VPC).vpcFlowLogs;
  if (!noDestinationsConfigFlowLogs || noDestinationsConfigFlowLogs.destinationsConfig) {
    throw new Error(
      `Test fixture VPC ${NO_DESTINATIONS_CONFIG_VPC} must define vpcFlowLogs without destinationsConfig`,
    );
  }

  return yaml.dump(config, { noRefs: true });
}

describe('NetworkVpcV2FlowLogs CloudWatch Logs retention', () => {
  const templates = new Map<string, Template>();

  beforeAll(() => {
    const testDir = path.join(__dirname, '../..');
    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
      if (typeof filePath === 'string' && filePath.startsWith('cfn-templates')) {
        const correctedPath = path.join(testDir, filePath);
        return originalReadFileSync(correctedPath, ...args);
      }
      return originalReadFileSync(filePath, ...args);
    });

    const originalLoadFromString = NetworkConfig.loadFromString.bind(NetworkConfig);
    const loadFromStringSpy = vi
      .spyOn(NetworkConfig, 'loadFromString')
      .mockImplementation((content, replacementsConfig) =>
        originalLoadFromString(applyRetentionScenarios(content), replacementsConfig),
      );

    const stacks = Create.stacks(AcceleratorStage.NETWORK_VPC);
    stacks.synthV2NetworkVpcStacks();
    // Guards against the v2 config being loaded some other way, which would make the
    // fallback cases pass without exercising the adjusted fixture.
    expect(loadFromStringSpy).toHaveBeenCalled();
    for (const vpcName of [OVERRIDE_VPC, INHERITED_NO_CWL_CONFIG_VPC, NO_DESTINATIONS_CONFIG_VPC]) {
      const stack = stacks.stacks.get(`VpcStack-Network-us-east-1-${vpcName}`) as Stack | undefined;
      expect(stack, `VpcStack for ${vpcName}`).toBeDefined();
      templates.set(vpcName, Template.fromStack(stack!));
    }
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  function flowLogGroupRetention(vpcName: string): unknown {
    const template = templates.get(vpcName)!;
    template.hasResourceProperties('AWS::EC2::FlowLog', { LogDestinationType: 'cloud-watch-logs' });
    const logGroups = Object.values(template.findResources('AWS::Logs::LogGroup'));
    expect(logGroups).toHaveLength(1);
    return logGroups[0].Properties?.RetentionInDays;
  }

  it('uses vpcFlowLogs.destinationsConfig.cloudWatchLogs.retentionInDays when it is set', () => {
    expect(flowLogGroupRetention(OVERRIDE_VPC)).toBe(VPC_FLOW_LOG_RETENTION_IN_DAYS);
  });

  it('falls back to the global cloudwatchLogRetentionInDays when destinationsConfig has no cloudWatchLogs', () => {
    expect(flowLogGroupRetention(INHERITED_NO_CWL_CONFIG_VPC)).toBe(GLOBAL_LOG_RETENTION_IN_DAYS);
  });

  it('falls back to the global cloudwatchLogRetentionInDays when destinationsConfig is omitted', () => {
    expect(flowLogGroupRetention(NO_DESTINATIONS_CONFIG_VPC)).toBe(GLOBAL_LOG_RETENTION_IN_DAYS);
  });
});

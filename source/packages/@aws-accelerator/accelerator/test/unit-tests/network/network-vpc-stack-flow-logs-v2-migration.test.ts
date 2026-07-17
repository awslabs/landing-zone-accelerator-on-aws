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
import { Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';

import { AcceleratorStage } from '../../../lib/accelerator-stage';
import { Create } from '../../accelerator-test-helpers';

/**
 * Regression test for the V1->V2 migration bug: a VPC created by a V1
 * NetworkVpcStack fails cdk-nag AwsSolutions-VPC7 after useV2Stacks is enabled
 * and flow-log ownership for that VPC is delegated to the V2 stack.
 *
 * The scenario is driven entirely through the LZAResourceLookup: the downloaded
 * V1 template (redirected to the test fixture) contains the Network-Endpoints
 * VPC but NOT its flow log resources. With useV2Stacks enabled this means:
 *   - resourceExists(VPC) === true   -> the VPC stays in the V1 stack
 *   - resourceExists(FLOW_LOG) === false -> the flow log is owned by the V2 stack
 *
 * The V1 NetworkVpcStack must therefore create no flow log for that VPC AND
 * retain the AwsSolutions-VPC7 suppression, instead of dropping the suppression
 * (which caused the false-positive "The VPC does not have an associated Flow
 * Log" failure).
 */
describe('NetworkVpcStack flow-log V1->V2 migration', () => {
  const testDir = path.join(__dirname, '../../../test');
  const fixturePath = path.join(
    testDir,
    'cfn-templates/666666666666/us-east-1/AWSAccelerator-NetworkVpcStack-666666666666-us-east-1.json',
  );
  let template: Template;
  let flowLogOwnedByV1Vpc: string;

  beforeAll(() => {
    const originalReadFileSync = fs.readFileSync;

    // Build a V1 template where the Network-Endpoints VPC exists but its flow
    // logs do not - i.e. flow-log ownership has moved to the V2 stack. Capture
    // the name of a VPC that still owns its flow log (for the control assertion).
    const originalTemplate = JSON.parse(originalReadFileSync(fixturePath).toString());
    const migratedTemplate = JSON.parse(JSON.stringify(originalTemplate));
    for (const [logicalId, resource] of Object.entries<{ Type?: string; Metadata?: Record<string, unknown> }>(
      migratedTemplate.Resources,
    )) {
      const lookup = (resource.Metadata?.lzaLookup ?? {}) as { vpcName?: string };
      if (resource.Type === 'AWS::EC2::FlowLog') {
        flowLogOwnedByV1Vpc = lookup.vpcName ?? flowLogOwnedByV1Vpc;
        delete migratedTemplate.Resources[logicalId];
      }
    }

    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
      if (typeof filePath === 'string' && filePath.startsWith('cfn-templates')) {
        // Serve the flow-log-stripped template for the migration lookup.
        return JSON.stringify(migratedTemplate);
      }
      return originalReadFileSync(filePath, ...args);
    });

    const stack = Create.stack(`Network-us-east-1`, {
      stage: AcceleratorStage.NETWORK_VPC,
      configFolderName: 'network-refactor',
    }) as Stack;
    template = Template.fromStack(stack);
    vi.restoreAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('does not create a flow log for the VPC whose flow log ownership moved to V2', () => {
    template.resourceCountIs('AWS::EC2::FlowLog', 0);
  });

  it('retains the AwsSolutions-VPC7 suppression on the migrated VPC', () => {
    const vpcs = template.findResources('AWS::EC2::VPC');
    const suppressedVpcs = Object.values(vpcs).filter(vpc =>
      ((vpc.Metadata?.cdk_nag?.rules_to_suppress ?? []) as { id?: string }[]).some(
        rule => rule.id === 'AwsSolutions-VPC7',
      ),
    );

    // Every VPC synthesized in this stack has its flow log owned by V2, so all of
    // them must keep the suppression to avoid a false-positive cdk-nag failure.
    expect(suppressedVpcs.length).toBe(Object.keys(vpcs).length);
    expect(suppressedVpcs.length).toBeGreaterThan(0);
  });

  it('confirms the fixture actually exercised a VPC that previously owned a flow log', () => {
    // Guards against the fixture silently losing its flow log resources, which
    // would make the test pass vacuously.
    expect(flowLogOwnedByV1Vpc).toBeDefined();
  });
});

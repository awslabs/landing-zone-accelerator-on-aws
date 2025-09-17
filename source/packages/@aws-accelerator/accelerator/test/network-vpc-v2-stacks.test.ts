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

import { AcceleratorStage } from '../lib/accelerator-stage';
import { describe, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { snapShotTest } from './snapshot-test';
import { Create } from './accelerator-test-helpers';

const v2TestNamePatterns: { testName: string; stackKey: string }[] = [
  {
    testName: 'Construct(VpcStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'VpcStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(VpcStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'VpcStack-Network-us-east-1-Network-Secondary',
  },
  {
    testName: 'Construct(RouteTableStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'RouteTableStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(RouteTableStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'RouteTableStack-Network-us-east-1-Network-Secondary',
  },
  {
    testName: 'Construct(SecurityGroupStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'SecurityGroupStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(SecurityGroupStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'SecurityGroupStack-Network-us-east-1-Network-Secondary',
  },
  {
    testName: 'Construct(SubnetStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'SubnetStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(SubnetStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'SubnetStack-Network-us-east-1-Network-Secondary',
  },
  {
    testName: 'Construct(SubnetStack-SharedServices-us-east-1-SharedServices-Main-V2): ',
    stackKey: 'SubnetStack-SharedServices-us-east-1-SharedServices-Main-V2',
  },
  {
    testName: 'Construct(SubnetShareStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'SubnetShareStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(SubnetShareStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'SubnetShareStack-Network-us-east-1-Network-Secondary',
  },
  {
    testName: 'Construct(RouteEntriesStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'RouteEntriesStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(RouteEntriesStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'RouteEntriesStack-Network-us-east-1-Network-Secondary',
  },
  {
    testName: 'Construct(RouteEntriesStack-Network-us-east-1-Network-Inspection-V2): ',
    stackKey: 'RouteEntriesStack-Network-us-east-1-Network-Inspection-V2',
  },
  {
    testName: 'Construct(NackStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'NackStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(NackStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'NackStack-Network-us-east-1-Network-Secondary',
  },
  {
    testName: 'Construct(LbStack-Network-us-east-1-Network-Secondary-V2): ',
    stackKey: 'LbStack-Network-us-east-1-Network-Secondary-V2',
  },
  {
    testName: 'Construct(LbStack-Network-us-east-1-Network-Secondary): ',
    stackKey: 'LbStack-Network-us-east-1-Network-Secondary',
  },
];

describe('NetworkVpcV2Stacks', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, '..');
    const originalReadFileSync = fs.readFileSync;
    vi.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
      if (typeof filePath === 'string' && filePath.startsWith('cfn-templates')) {
        const correctedPath = path.join(testDir, filePath);
        return originalReadFileSync(correctedPath, ...args);
      }
      return originalReadFileSync(filePath, ...args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const v2StackProvider = (stackKey: string) => () => {
    const stacks = Create.stacks(AcceleratorStage.NETWORK_VPC);
    stacks.synthV2NetworkVpcStacks();
    return stacks.stacks.get(stackKey);
  };

  for (const { testName, stackKey } of v2TestNamePatterns) {
    snapShotTest(testName, v2StackProvider(stackKey));
  }
});

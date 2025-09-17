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

const testNamePrefix = 'Construct(NetworkVpcStack): ';

describe('NetworkVpcStack', () => {
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

  snapShotTest(testNamePrefix, Create.stackProvider(`Network-us-east-1`, AcceleratorStage.NETWORK_VPC));
});

describe('NoVpcFlowLogStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`Management-us-east-1`, [
      AcceleratorStage.NETWORK_VPC,
      'aws',
      'us-east-1',
      'all-enabled-ou-targets',
    ]),
  );
});

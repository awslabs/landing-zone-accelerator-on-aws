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

import { afterAll, beforeAll, describe } from 'vitest';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { Create, memoize } from './accelerator-test-helpers';
import { snapShotTest } from './snapshot-test';

const testNamePrefix = 'Construct(SecurityStack): ';

describe('SecurityStack', () => {
  snapShotTest(testNamePrefix, Create.stackProvider(`Management-us-east-1`, AcceleratorStage.SECURITY));
});

describe('delegatedAdminStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`Management-us-east-1`, [
      AcceleratorStage.SECURITY,
      'aws',
      'us-east-1',
      'all-enabled-delegated-admin',
    ]),
  );
});

// Test with SKIP_MACIE_MODULE environment variable set
describe('SecurityStack with SkipMacie', () => {
  beforeAll(() => {
    // Set environment variable before creating the stack
    process.env['SKIP_MACIE_MODULE'] = 'true';
  });

  afterAll(() => {
    delete process.env['SKIP_MACIE_MODULE'];
  });

  const getStackWithSkipMacie = memoize(Create.stackProvider(`Management-us-east-1`, AcceleratorStage.SECURITY));
  snapShotTest('Construct(SecurityStack with SkipMacie): ', getStackWithSkipMacie);
});

// Test with SKIP_GUARDDUTY_MODULE environment variable set
describe('SecurityStack with SkipGuardDuty', () => {
  beforeAll(() => {
    process.env['SKIP_GUARDDUTY_MODULE'] = 'true';
  });

  afterAll(() => {
    delete process.env['SKIP_GUARDDUTY_MODULE'];
  });

  const getStackWithSkipGuardDuty = memoize(Create.stackProvider(`Management-us-east-1`, AcceleratorStage.SECURITY));
  snapShotTest('Construct(SecurityStack with SkipGuardDuty): ', getStackWithSkipGuardDuty);
});

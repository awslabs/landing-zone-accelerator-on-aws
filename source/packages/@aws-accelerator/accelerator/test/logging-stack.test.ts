/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { AcceleratorSynthStacks } from './accelerator-synth-stacks';
import { describe } from '@jest/globals';
import { snapShotTest } from './snapshot-test';

const testNamePrefix = 'Construct(LoggingStack): ';

const acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.LOGGING, 'aws', 'us-east-1');
const stack = acceleratorTestStacks.stacks.get(`LogArchive-us-east-1`)!;

describe('LoggingStack', () => {
  snapShotTest(testNamePrefix, stack);
});

const acceleratorTestStacksOuTargets = new AcceleratorSynthStacks(
  AcceleratorStage.LOGGING,
  'aws',
  'us-east-1',
  'all-enabled-ou-targets',
);
const stackOuTargets = acceleratorTestStacksOuTargets.stacks.get(`LogArchive-us-east-1`)!;

describe('LoggingStackOuTargets', () => {
  snapShotTest('Construct(LoggingStackOuTargets): ', stackOuTargets);
});

const centralizedRegionTestStacks = new AcceleratorSynthStacks(AcceleratorStage.LOGGING, 'aws', 'us-west-2');
const centralizedRegionTestStack = centralizedRegionTestStacks.stacks.get(`LogArchive-us-west-2`)!;

describe('LoggingStack', () => {
  snapShotTest(testNamePrefix, centralizedRegionTestStack);
});

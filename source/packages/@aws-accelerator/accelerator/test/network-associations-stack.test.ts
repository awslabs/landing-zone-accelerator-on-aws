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

import { describe, expect } from '@jest/globals';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { snapShotTest } from './snapshot-test';
import { Create } from './accelerator-test-helpers';
import { NetworkAssociationsStack } from '../lib/stacks/network-stacks/network-associations-stack/network-associations-stack';

const testNamePrefix = 'Construct(NetworkAssociationsStack): ';

describe('NetworkAssociationsStack', () => {
  const acceleratorTestStacks = Create.stacks(AcceleratorStage.NETWORK_ASSOCIATIONS);
  const stackNames = ['Network-us-east-1', 'SharedServices-us-east-1', 'Network-us-west-2', 'SharedServices-us-west-2'];

  stackNames.forEach(n => snapShotTest(testNamePrefix, () => acceleratorTestStacks.stacks.get(n)));

  test('Route Table Lookup', () => {
    const stackPdx = acceleratorTestStacks.stacks.get(`Network-us-east-1`)! as unknown as NetworkAssociationsStack;

    expect(Array.from(stackPdx['routeTableMap'].keys())).toEqual(
      expect.arrayContaining([
        'SharedServices-Main_444444444444_SharedServices-App-A',
        'Network-Ipam-West_555555555555_Network-West-A-Rt', // same account, cross region lookup
        'Network-Endpoints_Network-Endpoints-A',
      ]),
    );
  });
});

describe('NoVpcFlowLogStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`Network-us-east-1`, [
      AcceleratorStage.NETWORK_ASSOCIATIONS,
      'aws',
      'us-east-1',
      'all-enabled-ou-targets',
    ]),
  );
});

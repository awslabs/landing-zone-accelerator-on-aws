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
import { describe } from '@jest/globals';
import { snapShotTest } from './snapshot-test';
import { Create, memoize } from './accelerator-test-helpers';

const getStacks = memoize(Create.stacksProvider(AcceleratorStage.ACCOUNTS));

describe('AccountsStack us-east-1', () => {
  snapShotTest('Construct(AccountsStack): ', Create.stackProviderFromStacks(`Management-us-east-1`, getStacks));
});

describe('AccountsStack us-west-2', () => {
  snapShotTest('Construct(AccountsStackUsWest2): ', Create.stackProviderFromStacks(`Management-us-west-2`, getStacks));
});

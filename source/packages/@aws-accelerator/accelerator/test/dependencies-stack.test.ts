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
import { describe, test } from '@jest/globals';
import { snapShotTest } from './snapshot-test';
import { Template } from 'aws-cdk-lib/assertions';
import { Create, memoize } from './accelerator-test-helpers';

describe('DependenciesStack', () => {
  snapShotTest(
    'Construct(DependenciesStack): ',
    Create.stackProvider('Management-us-east-1', AcceleratorStage.DEPENDENCIES),
  );
});

const getMultiOuStack = memoize(
  Create.stackProvider('Management-us-east-1', [
    AcceleratorStage.DEPENDENCIES,
    'aws',
    'us-east-1',
    'all-enabled-ou-targets',
  ]),
);

describe('default event bus policy', () => {
  test('default event bus policy is created', () => {
    const multiOuStack = getMultiOuStack()!;
    const template = Template.fromStack(multiOuStack);

    template.hasResourceProperties('AWS::Events::EventBusPolicy', { EventBusName: 'default' });
    template.resourceCountIs('AWS::Events::EventBusPolicy', 4);
  });
});

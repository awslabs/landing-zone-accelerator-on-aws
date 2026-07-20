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
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, test } from 'vitest';
import { snapShotTest } from './snapshot-test';
import { Create, memoize } from './accelerator-test-helpers';

const testNamePrefix = 'Construct(CustomizationsStack): ';

const getStacks = memoize(Create.stacksProvider(AcceleratorStage.CUSTOMIZATIONS));

describe('CustomizationsStack', () => {
  snapShotTest(testNamePrefix, Create.stackProviderFromStacks(`Management-us-east-1`, getStacks));

  test(`${testNamePrefix} launch constraint depends on portfolio product association`, () => {
    const stack = Create.stackProviderFromStacks(`Management-us-east-1`, getStacks)();

    expect(stack).toBeDefined();
    if (!stack) return;

    const template = Template.fromStack(stack);
    const associations = template.findResources('AWS::ServiceCatalog::PortfolioProductAssociation');
    const launchConstraints = template.findResources('AWS::ServiceCatalog::LaunchRoleConstraint');

    expect(Object.keys(associations)).toHaveLength(1);
    expect(Object.values(launchConstraints)).toHaveLength(1);
    expect(Object.values(launchConstraints)[0].DependsOn).toContain(Object.keys(associations)[0]);
  });
});
describe('CustomizationsStack', () => {
  snapShotTest(testNamePrefix, Create.stackProviderFromStacks(`SharedServices-us-east-1`, getStacks));
});

describe('CustomizationsStack', () => {
  const stacksProvider = Create.stacksProvider([AcceleratorStage.CUSTOMIZATIONS, 'aws', 'us-east-1', 'all-enabled']);
  snapShotTest(testNamePrefix, Create.stackProviderFromStacks('Management-us-east-1', stacksProvider));
  snapShotTest(testNamePrefix, Create.stackProviderFromStacks('SharedServices-us-east-1', stacksProvider));
});

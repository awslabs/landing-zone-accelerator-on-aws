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
import { describe, test } from '@jest/globals';
import { snapShotTest } from './snapshot-test';
import { Template } from 'aws-cdk-lib/assertions';

const testNamePrefix = 'Construct(OrganizationsStack): ';

/**
 * OrganizationsStack
 */
const acceleratorTestStacks = new AcceleratorSynthStacks(
  AcceleratorStage.ORGANIZATIONS,
  'all-enabled',
  'aws',
  'us-east-1',
);
const stack = acceleratorTestStacks.stacks.get(`Management-us-east-1`)!;

describe('OrganizationsStack', () => {
  snapShotTest(testNamePrefix, stack);
});

const multiOuTestStacks = new AcceleratorSynthStacks(
  AcceleratorStage.ORGANIZATIONS,
  'all-enabled-ou-targets',
  'aws',
  'us-east-1',
);
const multiOuStack = multiOuTestStacks.stacks.get(`Management-us-east-1`)!;

describe('MultiOuOrganizationsStack', () => {
  snapShotTest(testNamePrefix, multiOuStack);
});

const delegatedAdminTestStacks = new AcceleratorSynthStacks(
  AcceleratorStage.ORGANIZATIONS,
  'all-enabled-delegated-admin',
  'aws',
  'us-east-1',
);
const delegatedAdminStack = delegatedAdminTestStacks.stacks.get(`Management-us-east-1`)!;

describe('delegatedAdminStack', () => {
  snapShotTest(testNamePrefix, delegatedAdminStack);
});

describe('tagging policies', () => {
  test("two OU's both get tagging policies", () => {
    const template = Template.fromStack(multiOuStack);

    template.hasResourceProperties('Custom::CreatePolicy', { name: 'TagPolicy', type: 'TAG_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-11111111', type: 'TAG_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-22222222', type: 'TAG_POLICY' });

    // 2 policies for backup and tagging policies, 2 targets -> 4 attachments
    template.resourceCountIs('Custom::CreatePolicy', 2);
    template.resourceCountIs('Custom::AttachPolicy', 4);
  });

  test('Root OU gets tagging policies', () => {
    const template = Template.fromStack(stack);

    template.hasResourceProperties('Custom::CreatePolicy', { name: 'TagPolicy', type: 'TAG_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'r-asdf', type: 'TAG_POLICY' });

    // 2 policies for backup and tagging policies, 1 target -> 2 attachments
    template.resourceCountIs('Custom::CreatePolicy', 2);
    template.resourceCountIs('Custom::AttachPolicy', 2);
  });
});

describe('backup policies', () => {
  test("two OU's both get backup policies", () => {
    const template = Template.fromStack(multiOuStack);

    template.hasResourceProperties('Custom::CreatePolicy', { name: 'BackupPolicy', type: 'BACKUP_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-11111111', type: 'BACKUP_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-22222222', type: 'BACKUP_POLICY' });

    // 2 policies for backup and tagging policies, 2 targets -> 4 attachments
    template.resourceCountIs('Custom::CreatePolicy', 2);
    template.resourceCountIs('Custom::AttachPolicy', 4);
  });
});

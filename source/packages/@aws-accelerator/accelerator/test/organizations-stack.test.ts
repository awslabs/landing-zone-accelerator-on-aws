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

const testNamePrefix = 'Construct(OrganizationsStack): ';

/**
 * OrganizationsStack
 */
const getOrganizationStack = memoize(Create.stackProvider(`Management-us-east-1`, AcceleratorStage.ORGANIZATIONS));
describe('OrganizationsStack', () => {
  snapShotTest(testNamePrefix, getOrganizationStack);
});

const getMultiOuStack = memoize(
  Create.stackProvider('Management-us-east-1', [
    AcceleratorStage.ORGANIZATIONS,
    'aws',
    'us-east-1',
    'all-enabled-ou-targets',
  ]),
);

describe('MultiOuOrganizationsStack', () => {
  snapShotTest(testNamePrefix, getMultiOuStack);
});

describe('delegatedAdminStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`Management-us-east-1`, [
      AcceleratorStage.ORGANIZATIONS,
      'aws',
      'us-east-1',
      'all-enabled-delegated-admin',
    ]),
  );
});

describe('tagging policies', () => {
  test("two OU's both get tagging policies", () => {
    const multiOuStack = getMultiOuStack()!;
    const template = Template.fromStack(multiOuStack);

    template.hasResourceProperties('Custom::CreatePolicy', { name: 'BackupPolicy', type: 'BACKUP_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-11111111', type: 'TAG_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-22222222', type: 'TAG_POLICY' });

    // 2 policies for backup and tagging policies, 2 targets -> 4 attachments
    template.resourceCountIs('Custom::CreatePolicy', 2);
    template.resourceCountIs('Custom::AttachPolicy', 4);
  });

  test('Root OU gets tagging policies', () => {
    const stack = getOrganizationStack()!;
    const template = Template.fromStack(stack);

    template.hasResourceProperties('Custom::CreatePolicy', { name: 'TagPolicy01', type: 'TAG_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'r-asdf', type: 'TAG_POLICY' });

    // 5 policies for backup, tagging and chatbot policies, 2 targets -> 2 attachments each
    template.resourceCountIs('Custom::CreatePolicy', 5);
    template.resourceCountIs('Custom::AttachPolicy', 6);
  });
});

describe('backup policies', () => {
  test("two OU's both get backup policies", () => {
    const multiOuStack = getMultiOuStack()!;

    const template = Template.fromStack(multiOuStack);

    template.hasResourceProperties('Custom::CreatePolicy', { name: 'BackupPolicy', type: 'BACKUP_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-11111111', type: 'BACKUP_POLICY' });
    template.hasResourceProperties('Custom::AttachPolicy', { targetId: 'ou-asdf-22222222', type: 'BACKUP_POLICY' });

    // 2 policies for backup and tagging policies, 2 targets -> 4 attachments
    template.resourceCountIs('Custom::CreatePolicy', 2);
    template.resourceCountIs('Custom::AttachPolicy', 4);
  });
});

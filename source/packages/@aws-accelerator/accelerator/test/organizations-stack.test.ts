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

import { Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { Create, memoize } from './accelerator-test-helpers';
import { snapShotTest } from './snapshot-test';

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

describe('OrganizationsStack with CloudTrail advanced event selectors', () => {
  const getAdvancedSelectorsStack = memoize(
    Create.stackProvider('Management-us-east-1', [
      AcceleratorStage.ORGANIZATIONS,
      'aws',
      'us-east-1',
      'cloudtrail-advanced-selectors',
    ]),
  );

  test('organization trail is created with AdvancedEventSelectors and without basic EventSelectors', () => {
    const stack = getAdvancedSelectorsStack()!;
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::CloudTrail::Trail', {
      IsOrganizationTrail: true,
      AdvancedEventSelectors: [
        {
          Name: 'ManagementEvents',
          FieldSelectors: [{ Field: 'eventCategory', Equals: ['Management'] }],
        },
        {
          Name: 'S3DataEventsExcludingCentralLogBucket',
          FieldSelectors: [
            { Field: 'eventCategory', Equals: ['Data'] },
            { Field: 'resources.type', Equals: ['AWS::S3::Object'] },
            { Field: 'resources.ARN', NotStartsWith: ['arn:aws:s3:::central-log-bucket/'] },
          ],
        },
      ],
    });

    // Basic and advanced event selectors are mutually exclusive on a trail; the synthesized
    // template must not carry the basic selectors CloudTrail's Trail construct builds by default.
    const trails = template.findResources('AWS::CloudTrail::Trail');
    expect(Object.keys(trails)).toHaveLength(1);
    for (const trail of Object.values(trails)) {
      expect(trail['Properties']['EventSelectors']).toBeUndefined();
    }
  });
});

// Test with SKIP_MACIE_MODULE environment variable set
describe('OrganizationsStack with SkipMacie', () => {
  beforeAll(() => {
    // Set environment variable before creating the stack
    process.env['SKIP_MACIE_MODULE'] = 'true';
  });

  afterAll(() => {
    delete process.env['SKIP_MACIE_MODULE'];
  });

  const getStackWithSkipMacie = memoize(Create.stackProvider(`Management-us-east-1`, AcceleratorStage.ORGANIZATIONS));
  snapShotTest('Construct(OrganizationsStack with SkipMacie): ', getStackWithSkipMacie);
});

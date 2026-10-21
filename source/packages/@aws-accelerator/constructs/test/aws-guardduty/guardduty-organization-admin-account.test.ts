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

import * as cdk from 'aws-cdk-lib';
import { describe, expect, test } from 'vitest';
import {
  GuardDutyOrganizationAdminAccount,
  GuardDutyEnableOrganizationAdminAccountPolicyStatements,
} from '../../lib/aws-guardduty/guardduty-organization-admin-account';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(GuardDutyOrganizationAdminAccount): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new GuardDutyOrganizationAdminAccount(stack, 'GuardDutyOrganizationAdminAccount', {
  adminAccountId: stack.account,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

/**
 * GuardDutyOrganizationAdminAccount construct test
 */
describe('GuardDutyOrganizationAdminAccount', () => {
  snapShotTest(testNamePrefix, stack);
});

describe('GuardDuty organization administrator IAM permissions', () => {
  test('includes organizations:ListRoots permission', () => {
    const organizationActions = GuardDutyEnableOrganizationAdminAccountPolicyStatements.find(
      statement => statement.Sid === 'GuardDutyEnableOrganizationAdminAccountTaskOrganizationActions',
    );

    expect(organizationActions).toBeDefined();
    expect(organizationActions?.Action).toContain('organizations:ListRoots');
  });
});

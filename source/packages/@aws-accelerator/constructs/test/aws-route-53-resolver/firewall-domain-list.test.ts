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

import * as cdk from 'aws-cdk-lib';
import {
  ResolverFirewallDomainList,
  ResolverFirewallDomainListType,
} from '../../lib/aws-route-53-resolver/firewall-domain-list';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ResolverFirewallDomainList): ';

const stack = new cdk.Stack();

// Custom domain list
new ResolverFirewallDomainList(stack, 'TestDomainList', {
  name: 'TestDomainList',
  path: __dirname,
  tags: [],
  type: ResolverFirewallDomainListType.CUSTOM,
  kmsKey: new cdk.aws_kms.Key(stack, 'TestDomainListKey', {}),
  logRetentionInDays: 3653,
});

// Managed domain list
new ResolverFirewallDomainList(stack, 'TestManagedDomainList', {
  name: 'TestManagedDomainList',
  type: ResolverFirewallDomainListType.MANAGED,
  kmsKey: new cdk.aws_kms.Key(stack, 'TestManagedDomainListKey', {}),
  logRetentionInDays: 3653,
});

/**
 * DNS firewall domain list construct test
 */
describe('ResolverFirewallDomainList', () => {
  snapShotTest(testNamePrefix, stack);
});

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
import { ResourceShare, ResourceShareOwner, ResourceShareItem } from '../../lib/aws-ram/resource-share';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(ResourceShare): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ResourceShare(stack, 'ResourceShare', {
  name: 'TestResourceShare',
  allowExternalPrincipals: true,
  permissionArns: [
    `arn:${stack.partition}:s3:::test-bucket-1-${stack.account}-${stack.region}`,
    `arn:${stack.partition}:s3:::test-bucket-2-${stack.account}-${stack.region}`,
  ],

  principals: ['accountID', 'organizationUnitId'],
  resourceArns: ['ec2:TransitGateway'],
});

const stackLookup = new cdk.Stack();

// Lookup resource share
ResourceShare.fromLookup(stackLookup, 'ResourceShareLookup', {
  resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
  resourceShareName: 'ResourceShareName',
  owningAccountId: '111111111111',
});

/**
 * ResourceShare construct test
 */
describe('ResourceShare', () => {
  snapShotTest(testNamePrefix, stack);
});

//Lookup Resource share item
// const resourceShare: IResourceShare =
ResourceShareItem.fromLookup(stackLookup, 'ResourceShareItem', {
  logRetentionInDays: 7,
  kmsKey: new cdk.aws_kms.Key(stack, 'CustomKey', {}),
  resourceShareItemType: 'resourceShareItemType',
  resourceShare: ResourceShare.fromLookup(stackLookup, 'ResourceShareItemLookup', {
    resourceShareOwner: ResourceShareOwner.OTHER_ACCOUNTS,
    resourceShareName: 'ResourceShareName',
    owningAccountId: '111111111111',
  }),
});

/**
 * ResourceShare construct test
 */
describe('ResourceShareItem', () => {
  snapShotTest(testNamePrefix, stack);
});

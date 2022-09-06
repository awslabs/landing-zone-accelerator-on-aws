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
import { TransitGatewayPrefixListReference } from '../../lib/aws-ec2/transit-gateway-prefix-list-reference';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(TransitGatewayPrefixListReference): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new TransitGatewayPrefixListReference(stack, 'TestTransitGatewayPrefixListReference', {
  prefixListId: 'pl-test',
  transitGatewayAttachmentId: 'tgw-attach-test',
  transitGatewayRouteTableId: 'Test',
  logGroupKmsKey: new cdk.aws_kms.Key(stack, 'TestKms', {}),
  logRetentionInDays: 3653,
});

/**
 * Transit gateway prefix list reference construct test
 */
describe('TransitGatewayPrefixListReference', () => {
  snapShotTest(testNamePrefix, stack);
});

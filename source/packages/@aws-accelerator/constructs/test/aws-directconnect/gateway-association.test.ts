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

import { DirectConnectGatewayAssociation } from '../../lib/aws-directconnect/gateway-association';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(DirectConnectGateway): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const key = new cdk.aws_kms.Key(stack, 'Key');

// Test DX Gateway Association
new DirectConnectGatewayAssociation(stack, 'TestDxGatewayAssociation', {
  allowedPrefixes: ['0.0.0.0/0'],
  directConnectGatewayId: 'test-dxgw-id',
  gatewayId: 'test-tgw-id',
  kmsKey: key,
  logRetentionInDays: 3653,
  acceleratorPrefix: 'AWSAccelerator',
});

// Test DX Gateway Association Proposal
new DirectConnectGatewayAssociation(stack, 'TestDxGatewayAssociaionProposal', {
  allowedPrefixes: ['0.0.0.0/0'],
  directConnectGatewayId: 'test-dxgw-id',
  directConnectGatewayOwnerAccount: '111111111',
  gatewayId: 'test-tgw-id',
  kmsKey: key,
  logRetentionInDays: 3653,
  acceleratorPrefix: 'AWSAccelerator',
});

/**
 * DirectConnectGatewayAssociation construct test
 */
describe('DirectConnectGatewayAssociation', () => {
  snapShotTest(testNamePrefix, stack);
});

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
import { VpcPeering } from '../../lib/aws-ec2/vpc-peering';
import { snapShotTest } from '../snapshot-test';
import { describe, it, expect } from '@jest/globals';

const testNamePrefix = 'Construct(VpcPeering): ';

//Initialize stack for tests
const stack = new cdk.Stack();

const vpcPeer = new VpcPeering(stack, 'TestPeering', {
  name: 'Test',
  peerOwnerId: '111111111111',
  peerRegion: 'us-east-1',
  peerVpcId: 'AccepterVpc',
  vpcId: 'RequesterVpc',
  peerRoleName: 'TestRole',
  tags: [{ key: 'key', value: 'value' }],
});

vpcPeer.addPeeringRoute(
  'vpcPeeringRoute',
  'rt-12345',
  '10.0.0.5/32',
  undefined,
  new cdk.aws_kms.Key(stack, 'kmsKey'),
  10,
);

const crLambda = new cdk.aws_lambda.Function(stack, 'test', {
  code: new cdk.aws_lambda.InlineCode('foo'),
  handler: 'handler',
  runtime: cdk.aws_lambda.Runtime.NODEJS_16_X,
});
const crProvider = new cdk.custom_resources.Provider(stack, 'myProvider', { onEventHandler: crLambda });

vpcPeer.addCrossAcctPeeringRoute({
  id: 'crossAccountPeerRoute',
  ownerAccount: '111111111111',
  ownerRegion: stack.region,
  partition: stack.partition,
  provider: crProvider,
  roleName: 'role',
  routeTableId: 'rt-3456',
  destination: '10.0.0.6/32',
});
/**
 * VPC peering construct test
 */
describe('VpcPeering', () => {
  it('destinationPrefix list without kms throws error', () => {
    function noKmsKey() {
      vpcPeer.addPeeringRoute('vpcPeeringRoute1', 'rt-12345', '10.0.0.5/32', 'destinationRoute', undefined, 10);
    }
    expect(noKmsKey).toThrow(new Error('Attempting to add prefix list route without specifying log group KMS key'));
  });
  it('destinationPrefix list without logRetention throws error', () => {
    function noLogRetention() {
      vpcPeer.addPeeringRoute(
        'vpcPeeringRoute2',
        'rt-12345',
        '10.0.0.5/32',
        'destinationRoute',
        new cdk.aws_kms.Key(stack, 'kmsKey1'),
        undefined,
      );
    }
    expect(noLogRetention).toThrow(
      new Error('Attempting to add prefix list route without specifying log group retention period'),
    );
  });
  it('destinationPrefix list test', () => {
    vpcPeer.addPeeringRoute(
      'vpcPeeringRoute3',
      'rt-12345',
      '10.0.0.5/32',
      'destinationRoute',
      new cdk.aws_kms.Key(stack, 'kmsKey2'),
      10,
    );
  });
  it('no destination throws error', () => {
    function noDest() {
      vpcPeer.addPeeringRoute(
        'vpcPeeringRoute4',
        'rt-12345',
        undefined,
        undefined,
        new cdk.aws_kms.Key(stack, 'kmsKey3'),
        10,
      );
    }
    expect(noDest).toThrow(new Error('Attempting to add CIDR route without specifying destination'));
  });
  snapShotTest(testNamePrefix, stack);
});

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
import { ResolverRule, ResolverRuleAssociation } from '../../lib/aws-route-53-resolver/resolver-rule';
import { snapShotTest } from '../snapshot-test';
import { describe, expect, it } from '@jest/globals';

const testNamePrefix = 'Construct(ResolverRule): ';

const forwardRuleStack = new cdk.Stack();
const systemRuleStack = new cdk.Stack();

const ipAddresses = [{ ip: '1.1.1.1' }, { ip: '2.2.2.2' }];

const forwardRule = new ResolverRule(forwardRuleStack, 'TestResolverRule', {
  domainName: 'test.com',
  name: 'TestResolverRule',
  resolverEndpointId: 'TestEndpoint',
  targetIps: ipAddresses,
  tags: [],
  kmsKey: new cdk.aws_kms.Key(forwardRuleStack, 'CustomKey', {}),
  logRetentionInDays: 3653,
});

new ResolverRuleAssociation(forwardRuleStack, 'TestResolverRuleAssoc', {
  resolverRuleId: forwardRule.ruleId,
  vpcId: 'TestVpc',
});

const systemRule = new ResolverRule(systemRuleStack, 'TestResolverRule', {
  domainName: 'test.com',
  name: 'TestResolverRule',
  resolverEndpointId: 'TestEndpoint',
  targetIps: ipAddresses,
  tags: [],
  kmsKey: new cdk.aws_kms.Key(systemRuleStack, 'CustomKey', {}),
  logRetentionInDays: 3653,
  ruleType: 'SYSTEM',
});

new ResolverRuleAssociation(systemRuleStack, 'TestResolverRuleAssoc', {
  resolverRuleId: systemRule.ruleId,
  vpcId: 'TestVpc',
});

describe('ResolverRule', () => {
  snapShotTest(testNamePrefix, forwardRuleStack);
  snapShotTest(testNamePrefix, systemRuleStack);
  it('throw error when targetInbound is specified without kmsKey', () => {
    function targetInboundKmsKeyError() {
      new ResolverRule(systemRuleStack, 'TargetInboundKmsKeyError', {
        domainName: 'test.com',
        name: 'TestResolverRule',
        resolverEndpointId: 'TestEndpoint',
        targetIps: ipAddresses,
        tags: [],
        targetInbound: 'targetInbound',
        logRetentionInDays: 3653,
        ruleType: 'SYSTEM',
      });
    }
    expect(targetInboundKmsKeyError).toThrow(
      new Error('kmsKey property must be included if targetInbound property is defined.'),
    );
  });
  it('throw error when targetInbound is specified without logRetention', () => {
    function targetInboundLogRetentionError() {
      new ResolverRule(systemRuleStack, 'TargetInboundLogRetentionError', {
        domainName: 'test.com',
        name: 'TestResolverRule',
        resolverEndpointId: 'TestEndpoint',
        targetIps: ipAddresses,
        tags: [],
        targetInbound: 'targetInbound',
        kmsKey: new cdk.aws_kms.Key(systemRuleStack, 'CustomKeyTargetInboundLogRetentionError', {}),
        ruleType: 'SYSTEM',
      });
    }
    expect(targetInboundLogRetentionError).toThrow(
      new Error('logRetentionInDays property must be included if targetInbound property is defined.'),
    );
  });
  it('test private function lookup inbound', () => {
    const testLookupInbound = new ResolverRule(systemRuleStack, 'TestLookupInbound', {
      domainName: 'test.com',
      name: 'TestResolverRule',
      resolverEndpointId: 'TestEndpoint',
      targetIps: ipAddresses,
      tags: [],
      targetInbound: 'targetInbound',
      kmsKey: new cdk.aws_kms.Key(systemRuleStack, 'CustomKeyTestLookupInbound', {}),
      logRetentionInDays: 3653,
      ruleType: 'SYSTEM',
    });
    //output of testLookupId ruleId is a cdk token hash so the check here is to make sure its a string
    expect(typeof testLookupInbound.ruleId).toBe('string');
  });
});

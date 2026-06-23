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
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ApplicationLoadBalancer } from '../../lib/aws-elasticloadbalancingv2/application-load-balancer';
import { snapShotTest } from '../snapshot-test';
import { describe, expect, test } from 'vitest';

const testNamePrefix = 'Construct(ApplicationLoadBalancer): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ApplicationLoadBalancer(stack, 'Test', {
  name: 'Test',
  ssmPrefix: '/accelerator',
  subnets: ['subnet-test123', 'subnet-test456'],
  securityGroups: ['sg-test123', 'sg-test456'],
  scheme: 'internal',
  accessLogsBucket: 'test-bucket',
  attributes: {
    deletionProtection: true,
    idleTimeout: 60,
    routingHttpDropInvalidHeader: true,
    routingHttpXAmznTlsCipherEnable: true,
    routingHttpXffClientPort: true,
    routingHttpXffHeaderProcessingMode: 'append',
    http2Enabled: true,
    wafFailOpen: true,
  },
  listeners: [
    {
      name: 'string',
      certificate: 'fully-qualified-arn-acm',
      port: 80,
      protocol: 'HTTP',
      type: 'forward',
      sslPolicy: 'ELBSecurityPolicy-2016-08',
      targetGroup: '${ACCEL_LOOKUP::TargetGroup:target-group-test}',
      order: 1,
      forwardConfig: {
        targetGroupStickinessConfig: { durationSeconds: 1000, enabled: true },
      },
      fixedResponseConfig: undefined,
      redirectConfig: undefined,
    },
    {
      name: 'string1',
      certificate: 'fully-qualified-arn-acm',
      port: 81,
      protocol: 'HTTP',
      order: 2,
      type: 'fixed-response',
      fixedResponseConfig: {
        statusCode: 'statusCode',
        contentType: 'contentType',
        messageBody: 'messageBody',
      },
      forwardConfig: undefined,
      redirectConfig: undefined,
      sslPolicy: 'ELBSecurityPolicy-2016-08',
      targetGroup: 'target-group-test1',
    },
    {
      name: 'string2',
      certificate: 'fully-qualified-arn-acm',
      port: 82,
      protocol: 'HTTP',
      type: 'redirect',
      order: 3,
      redirectConfig: {
        statusCode: 'statusCode',
        host: 'host',
        path: 'path',
        port: 82,
        protocol: 'protocol',
        query: 'query',
      },
      forwardConfig: undefined,
      fixedResponseConfig: undefined,
      sslPolicy: 'ELBSecurityPolicy-2016-08',
      targetGroup: 'target-group-test2',
    },
  ],
});

/**
 * NLB construct test
 */
describe('ApplicationLoadBalancer', () => {
  snapShotTest(testNamePrefix, stack);
});

describe('ApplicationLoadBalancer listener actions', () => {
  // targetGroupArn is only valid for forward actions; redirect/fixed-response must omit it
  const assertStack = new cdk.Stack();
  new ApplicationLoadBalancer(assertStack, 'Test', {
    name: 'Test',
    ssmPrefix: '/accelerator',
    subnets: ['subnet-test123', 'subnet-test456'],
    securityGroups: ['sg-test123'],
    scheme: 'internal',
    accessLogsBucket: 'test-bucket',
    listeners: [
      {
        name: 'forward',
        port: 80,
        protocol: 'HTTP',
        type: 'forward',
        targetGroup: 'target-group-forward',
        order: 1,
        certificate: undefined,
        sslPolicy: undefined,
        fixedResponseConfig: undefined,
        forwardConfig: undefined,
        redirectConfig: undefined,
      },
      {
        name: 'redirect',
        port: 81,
        protocol: 'HTTP',
        type: 'redirect',
        order: 2,
        certificate: undefined,
        sslPolicy: undefined,
        targetGroup: undefined,
        fixedResponseConfig: undefined,
        forwardConfig: undefined,
        redirectConfig: { statusCode: 'HTTP_301', port: 443, protocol: 'HTTPS' },
      },
      {
        name: 'fixedResponse',
        port: 82,
        protocol: 'HTTP',
        type: 'fixed-response',
        order: 3,
        certificate: undefined,
        sslPolicy: undefined,
        targetGroup: undefined,
        forwardConfig: undefined,
        redirectConfig: undefined,
        fixedResponseConfig: { statusCode: '200', contentType: 'text/plain', messageBody: 'ok' },
      },
    ],
  });
  const template = Template.fromStack(assertStack);

  test('forward listener keeps TargetGroupArn', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: [Match.objectLike({ Type: 'forward', TargetGroupArn: 'target-group-forward' })],
    });
  });

  test('redirect listener omits TargetGroupArn', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: [
        Match.objectLike({
          Type: 'redirect',
          RedirectConfig: Match.objectLike({ StatusCode: 'HTTP_301' }),
          TargetGroupArn: Match.absent(),
        }),
      ],
    });
  });

  test('fixed-response listener omits TargetGroupArn', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      DefaultActions: [
        Match.objectLike({
          Type: 'fixed-response',
          FixedResponseConfig: Match.objectLike({ StatusCode: '200' }),
          TargetGroupArn: Match.absent(),
        }),
      ],
    });
  });

  test('forward listener without targetGroup throws', () => {
    const throwStack = new cdk.Stack();
    expect(
      () =>
        new ApplicationLoadBalancer(throwStack, 'Throw', {
          name: 'Throw',
          ssmPrefix: '/accelerator',
          subnets: ['subnet-test123', 'subnet-test456'],
          accessLogsBucket: 'test-bucket',
          listeners: [
            {
              name: 'forward-no-tg',
              port: 80,
              protocol: 'HTTP',
              type: 'forward',
              order: 1,
              certificate: undefined,
              sslPolicy: undefined,
              targetGroup: undefined,
              fixedResponseConfig: undefined,
              forwardConfig: undefined,
              redirectConfig: undefined,
            },
          ],
        }),
    ).toThrow(/forward but targetGroup is not defined/);
  });
});

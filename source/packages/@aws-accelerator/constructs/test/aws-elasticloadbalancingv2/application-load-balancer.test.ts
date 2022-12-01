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
import { ApplicationLoadBalancer } from '../../lib/aws-elasticloadbalancingv2/application-load-balancer';
import { snapShotTest } from '../snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(ApplicationLoadBalancer): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ApplicationLoadBalancer(stack, 'Test', {
  name: 'Test',
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

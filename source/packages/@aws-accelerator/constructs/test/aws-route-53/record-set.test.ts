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
import { HostedZone, RecordSet, SecurityGroup, VpcEndpoint } from '../../index';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(RecordSet): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const hostedZoneName = HostedZone.getHostedZoneNameForService('s3-global.accesspoint', stack.region);

const hostedZone = new HostedZone(stack, `TestHostedZone`, {
  hostedZoneName,
  vpcId: 'Test',
});

const securityGroup = new SecurityGroup(stack, 'TestSecurityGroup`', {
  securityGroupName: 'TestSecurityGroup',
  description: `AWS Private Endpoint Zone`,
  vpcId: 'Test',
  tags: [],
});

// Create the interface endpoint
const endpoint = new VpcEndpoint(stack, `TestVpcEndpoint`, {
  vpcId: 'Test',
  vpcEndpointType: cdk.aws_ec2.VpcEndpointType.INTERFACE,
  service: 'ec2',
  subnets: ['Test1', 'Test2'],
  securityGroups: [securityGroup],
  privateDnsEnabled: false,
  policyDocument: new cdk.aws_iam.PolicyDocument({
    statements: [
      new cdk.aws_iam.PolicyStatement({
        sid: 'AccessToTrustedPrincipalsAndResources',
        actions: ['*'],
        effect: cdk.aws_iam.Effect.ALLOW,
        resources: ['*'],
        principals: [new cdk.aws_iam.AnyPrincipal()],
        conditions: {
          StringEquals: {
            'aws:PrincipalOrgID': ['organizationId'],
          },
        },
      }),
    ],
  }),
});

new RecordSet(stack, `TestRecordSet`, {
  type: 'A',
  name: hostedZoneName,
  hostedZone: hostedZone,
  dnsName: endpoint.dnsName,
  hostedZoneId: endpoint.hostedZoneId,
});

/**
 * RecordSet construct test
 */
describe('RecordSet', () => {
  snapShotTest(testNamePrefix, stack);
});

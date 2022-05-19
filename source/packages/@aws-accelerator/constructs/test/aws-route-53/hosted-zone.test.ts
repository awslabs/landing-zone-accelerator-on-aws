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

import { SynthUtils } from '@aws-cdk/assert';

import { HostedZone } from '../../index';

const testNamePrefix = 'Construct(HostedZone): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();
const hostedZoneName = HostedZone.getHostedZoneNameForService('s3-global.accesspoint', stack.region);

new HostedZone(stack, `TestHostedZone`, {
  hostedZoneName,
  vpcId: 'Test',
});

/**
 * HostedZone construct test
 */
describe('HostedZone', () => {
  /**
   * Snapshot test
   */
  test(`${testNamePrefix} Snapshot Test`, () => {
    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });

  /**
   * Number of hosted zone test
   */
  test(`${testNamePrefix} Hosted zone count test`, () => {
    cdk.assertions.Template.fromStack(stack).resourceCountIs('AWS::Route53::HostedZone', 1);
  });

  /**
   * HostedZone resource configuration test
   */
  test(`${testNamePrefix} HostedZone resource configuration test`, () => {
    cdk.assertions.Template.fromStack(stack).templateMatches({
      Resources: {
        TestHostedZone68F306E4: {
          Type: 'AWS::Route53::HostedZone',
          Properties: {
            Name: 's3-global.accesspoint.aws.com',
            VPCs: [
              {
                VPCId: 'Test',
                VPCRegion: {
                  Ref: 'AWS::Region',
                },
              },
            ],
          },
        },
      },
    });
  });
});

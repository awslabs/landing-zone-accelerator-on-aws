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
import { LaunchTemplate } from '../../lib/aws-ec2/create-launch-template';
import { snapShotTest } from '../snapshot-test';
import * as path from 'path';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(LaunchTemplate): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new LaunchTemplate(stack, 'Test', {
  name: 'Test',
  appName: 'appA',
  userData: path.join(__dirname, 'launchTemplateFiles/testUserData.sh'),
  vpc: 'test',
  instanceType: 't3.micro',
  imageId: 'ami-1234',
  securityGroups: ['sg-1234'],
  blockDeviceMappings: [
    {
      deviceName: 'test',
      ebs: { deleteOnTermination: true, encrypted: true, iops: 300, kmsKeyId: 'test', volumeSize: 10 },
    },
  ],
});

/**
 * GWLB construct test
 */
describe('LaunchTemplate', () => {
  snapShotTest(testNamePrefix, stack);
});

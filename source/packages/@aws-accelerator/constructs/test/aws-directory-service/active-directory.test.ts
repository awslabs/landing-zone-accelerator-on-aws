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
import { ActiveDirectory } from '../../index';
import { snapShotTest } from '../snapshot-test';

const testNamePrefix = 'Construct(ActiveDirectory): ';

//Initialize stack for snapshot test and resource configuration test
const stack = new cdk.Stack();

new ActiveDirectory(stack, 'ActiveDirectory', {
  directoryName: 'AcceleratorManagedActiveDirectory',
  dnsName: 'example.com',
  vpcId: 'vpcId',
  madSubnetIds: ['subnet01', 'subnet02'],
  adminSecretValue: cdk.SecretValue.secretsManager('adminSecretArn'),
  edition: 'Enterprise',
  netBiosDomainName: 'example',
  logGroupName: '/aws/directoryservice/AcceleratorManagedActiveDirectory',
  logRetentionInDays: 30,
  lambdaKey: new cdk.aws_kms.Key(stack, 'CustomLambdaKey', {}),
  cloudwatchKey: new cdk.aws_kms.Key(stack, 'CustomCWLKey', {}),
  cloudwatchLogRetentionInDays: 30,
});
/**
 * ActiveDirectory construct test
 */
describe('ActiveDirectory', () => {
  snapShotTest(testNamePrefix, stack);
});

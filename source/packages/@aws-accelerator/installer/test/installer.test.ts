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
import { InstallerStack } from '../lib/installer-stack';
import { SynthUtils } from '@aws-cdk/assert';
import { expect, test, describe } from '@jest/globals';

// Test prefix
const testNamePrefix = 'Stack(installer): ';

const stacks: InstallerStack[] = [
  //Initialize stack from management account with tester pipeline
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: false,
    enableTester: true,
    useS3Source: false,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    managementCrossAccountRoleName: 'AWSControlTowerExecution',
    enableSingleAccountMode: false,
    usePermissionBoundary: false,
    enableRegionByRegionDeployment: false,
  }),
  // Initialize stack from management account without tester pipeline
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: false,
    enableTester: false,
    useS3Source: false,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    enableSingleAccountMode: false,
    usePermissionBoundary: false,
    enableRegionByRegionDeployment: false,
  }),
  //Initialize stack from external pipeline account with tester pipeline
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: true,
    enableTester: true,
    useS3Source: false,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    managementCrossAccountRoleName: 'AWSControlTowerExecution',
    enableSingleAccountMode: false,
    usePermissionBoundary: false,
    enableRegionByRegionDeployment: false,
  }),
  //Initialize stack from external pipeline account without tester pipeline
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: true,
    enableTester: false,
    useS3Source: false,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    enableSingleAccountMode: false,
    usePermissionBoundary: false,
    enableRegionByRegionDeployment: false,
  }),
  //Initialize stack from external pipeline account without tester pipeline
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: true,
    enableTester: false,
    useS3Source: false,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    enableSingleAccountMode: true,
    usePermissionBoundary: false,
    enableRegionByRegionDeployment: false,
  }),
  //Initialize stack from management account with permission boundary
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: false,
    enableTester: false,
    useS3Source: false,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    enableSingleAccountMode: false,
    usePermissionBoundary: true,
    enableRegionByRegionDeployment: false,
  }),
  // Initialize stack with LZA source code from S3 bucket and object
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: false,
    enableTester: false,
    useS3Source: true,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    enableSingleAccountMode: false,
    usePermissionBoundary: false,
    enableRegionByRegionDeployment: false,
  }),
  // Initialize stack with LZA region by region deployment
  new InstallerStack(new cdk.App(), 'AWSAccelerator-Test-InstallerStack', {
    synthesizer: new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
    }),
    useExternalPipelineAccount: false,
    enableTester: false,
    useS3Source: true,
    s3SourceKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
    enableSingleAccountMode: false,
    usePermissionBoundary: false,
    enableRegionByRegionDeployment: true,
  }),
];

/**
 * InstallerStack construct test
 */
describe('InstallerStack', () => {
  test(`${testNamePrefix} Snapshot Test`, () => {
    stacks.forEach(item => expect(SynthUtils.toCloudFormation(item)).toMatchSnapshot());
  });
});

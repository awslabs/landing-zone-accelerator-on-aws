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

import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { snapShotTest } from './snapshot-test';
import { describe } from '@jest/globals';
import { memoize } from './accelerator-test-helpers';

const testNamePrefix = 'Construct(PipelineStack): ';

const getStacks = memoize(() => {
  /**
   * Pipeline Stack
   */
  const app = new cdk.App();
  const stacks = [
    new PipelineStack(app, 'PipelineStack', {
      sourceRepository: 'codecommit',
      sourceRepositoryOwner: 'awslabs',
      sourceRepositoryName: 'accelerator-source',
      sourceBranchName: 'main',
      sourceBucketName: 'my-accelerator-source-bucket',
      sourceBucketObject: 'release/v9.8.7.zip',
      sourceBucketKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
      enableApprovalStage: true,
      qualifier: 'aws-accelerator',
      managementAccountId: app.account,
      managementAccountRoleName: 'AcceleratorAccountAccessRole',
      managementAccountEmail: 'accelerator-root@example.com',
      logArchiveAccountEmail: 'accelerator-log-archive@example.com',
      auditAccountEmail: 'accelerator-audit@example.com',
      controlTowerEnabled: 'Yes',
      partition: 'aws',
      env: {
        account: '000000000000',
        region: 'us-east-1',
      },
      useExistingConfigRepo: false,
      configRepositoryLocation: 'codecommit',
      configRepositoryName: 'aws-accelerator-config',
      configRepositoryBranchName: 'main',
      configRepositoryOwner: '',
      prefixes: {
        accelerator: 'AWSAccelerator',
        kmsAlias: 'alias/accelerator',
        bucketName: 'aws-accelerator',
        ssmParamName: '/accelerator',
        snsTopicName: 'accelerator',
        repoName: 'aws-accelerator',
        secretName: '/accelerator',
        trailLogName: 'aws-accelerator',
        databaseName: 'aws-accelerator',
      },
      enableSingleAccountMode: false,
      pipelineAccountId: '000000000000',
      useExistingRoles: false,
      codeconnectionArn: '',
      // installerStackName: 'InstallerStack',
    }),
    new PipelineStack(app, 'PipelineStackRegionalDeploy', {
      sourceRepository: 'codecommit',
      sourceRepositoryOwner: 'awslabs',
      sourceRepositoryName: 'accelerator-source',
      sourceBranchName: 'main',
      sourceBucketName: 'my-accelerator-source-bucket',
      sourceBucketObject: 'release/v9.8.7.zip',
      sourceBucketKmsKeyArn: 'arn:aws:kms:us-east-1:000000000000:key/aaaaaaaa-1111-bbbb-2222-cccccc333333',
      enableApprovalStage: true,
      qualifier: 'aws-accelerator',
      managementAccountId: app.account,
      managementAccountRoleName: 'AcceleratorAccountAccessRole',
      managementAccountEmail: 'accelerator-root@example.com',
      logArchiveAccountEmail: 'accelerator-log-archive@example.com',
      auditAccountEmail: 'accelerator-audit@example.com',
      controlTowerEnabled: 'Yes',
      partition: 'aws',
      env: {
        account: '000000000000',
        region: 'us-east-1',
      },
      useExistingConfigRepo: false,
      configRepositoryLocation: 'codecommit',
      configRepositoryName: 'aws-accelerator-config',
      configRepositoryBranchName: 'main',
      configRepositoryOwner: '',
      prefixes: {
        accelerator: 'AWSAccelerator',
        kmsAlias: 'alias/accelerator',
        bucketName: 'aws-accelerator',
        ssmParamName: '/accelerator',
        snsTopicName: 'accelerator',
        repoName: 'aws-accelerator',
        secretName: '/accelerator',
        trailLogName: 'aws-accelerator',
        databaseName: 'aws-accelerator',
      },
      enableSingleAccountMode: false,
      pipelineAccountId: '000000000000',
      useExistingRoles: false,
      codeconnectionArn: '',
      regionByRegionDeploymentOrder: 'us-east-1,us-west-1',
      // installerStackName: 'InstallerStack',
    }),
  ];
  return stacks;
});

describe('PipelineStack', () => {
  snapShotTest(testNamePrefix, () => getStacks()[0]);
  snapShotTest(testNamePrefix, () => getStacks()[1]);
});

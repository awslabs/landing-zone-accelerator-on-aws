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
import { describe, it, expect } from 'vitest';
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
      installerStackName: 'AWSAccelerator-InstallerStack',
      secureBucketName: 'test-bucket',
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
      installerStackName: 'AWSAccelerator-InstallerStack',
      secureBucketName: 'test-bucket',
    }),
    new PipelineStack(app, 'PipelineStackCustomS3Path', {
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
      installerStackName: 'AWSAccelerator-InstallerStack',
      secureBucketName: 'test-bucket',
    }),
    new PipelineStack(app, 'PipelineStackConfigInS3', {
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
      configRepositoryLocation: 's3',
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
      installerStackName: 'AWSAccelerator-InstallerStack',
      secureBucketName: 'test-bucket',
    }),
  ];
  return stacks;
});

describe('PipelineStack', () => {
  for (let i = 0; i < getStacks().length; i++) {
    snapShotTest(testNamePrefix, () => getStacks()[i]);
  }
});
describe('PipelineStack customS3Path', () => {
  const originalEnv = process.env['ACCELERATOR_CUSTOM_SOURCE_KEY'];
  process.env['ACCELERATOR_CUSTOM_SOURCE_KEY'] = 'custom/path/source.zip';

  snapShotTest(testNamePrefix, () => getStacks()[2]);

  // Restore original environment
  if (originalEnv) {
    process.env['ACCELERATOR_CUSTOM_SOURCE_KEY'] = originalEnv;
  } else {
    delete process.env['ACCELERATOR_CUSTOM_SOURCE_KEY'];
  }
});

describe('PipelineStack approval review link', () => {
  it('uses the aws-eusc console domain in the aws-eusc partition', () => {
    const app = new cdk.App();
    const stack = new PipelineStack(app, 'PipelineStackEusc', {
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
      partition: 'aws-eusc',
      env: {
        account: '000000000000',
        region: 'eusc-de-east-1',
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
      installerStackName: 'AWSAccelerator-InstallerStack',
      secureBucketName: 'test-bucket',
    });
    const templateJson = JSON.stringify(cdk.assertions.Template.fromStack(stack).toJSON());

    expect(templateJson).toContain('https://eusc-de-east-1.console.amazonaws-eusc.eu/s3/buckets/');
  });
});

describe('PipelineStack post_build diagnostics', () => {
  it('ToolkitProject buildspec includes post_build phase with collect-diagnostics', () => {
    const stack = getStacks()[0];
    const template = cdk.assertions.Template.fromStack(stack);
    const templateJson = JSON.stringify(template.toJSON());

    // The buildspec should contain a post_build phase referencing collect-diagnostics.sh
    expect(templateJson).toContain('post_build');
    expect(templateJson).toContain('collect-diagnostics.sh');
  });
});

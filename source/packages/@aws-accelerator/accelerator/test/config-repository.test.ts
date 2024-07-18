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

import { CodeCommitConfigRepository, S3ConfigRepository } from '../lib/config-repository';
import * as cdk from 'aws-cdk-lib';
import { describe, it, expect } from '@jest/globals';
import { Repository } from 'aws-cdk-lib/aws-codecommit';
import * as fs from 'fs';

describe('configRepository', () => {
  const stack = new cdk.Stack();
  const configRepository = new CodeCommitConfigRepository(stack, 'ConfigRepository', {
    repositoryName: 'aws-accelerator-config',
    repositoryBranchName: 'main',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'yes',
    enableSingleAccountMode: false,
  });

  const configRepository2 = new CodeCommitConfigRepository(stack, 'ConfigRepository2', {
    repositoryName: 'aws-accelerator-config',
    repositoryBranchName: 'main',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'no',
    enableSingleAccountMode: false,
  });

  const s3ConfigRepository = new S3ConfigRepository(stack, 'S3ConfigRepository', {
    configBucketName: 'aws-accelerator-config',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'no',
    enableSingleAccountMode: false,
    installerKey: new cdk.aws_kms.Key(stack, 'InstallerKey', {}),
    serverAccessLogsBucketName: 'server-access-logging-bucket',
  });

  describe('createRepository', () => {
    it('is created successfully', () => {
      expect(configRepository.getRepository()).toBeInstanceOf(Repository);
      expect(configRepository2.getRepository()).toBeInstanceOf(Repository);
      expect(s3ConfigRepository.getRepository()).toBeInstanceOf(cdk.aws_s3.Bucket);
    });

    it('creates the correct number of files', () => {
      const filesInCodeCommitRepo = fs.readdirSync(configRepository.tempDirPath).length;
      const filesInS3Repo = fs.readdirSync(s3ConfigRepository.tempDirPath).length;
      expect(filesInCodeCommitRepo).toEqual(6);
      expect(filesInS3Repo).toEqual(7);
    });
  });
});

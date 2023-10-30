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

import { ConfigRepository } from '../lib/config-repository';
import * as cdk from 'aws-cdk-lib';
import { describe, it, expect } from '@jest/globals';
import { Repository } from 'aws-cdk-lib/aws-codecommit';

describe('accounts-config', () => {
  const stack = new cdk.Stack();
  const configRepository = new ConfigRepository(stack, 'ConfigRepository', {
    repositoryName: 'aws-accelerator-config',
    repositoryBranchName: 'main',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'yes',
    enableSingleAccountMode: false,
  });

  const configRepository2 = new ConfigRepository(stack, 'ConfigRepository2', {
    repositoryName: 'aws-accelerator-config',
    repositoryBranchName: 'main',
    description: 'LZA config repo',
    managementAccountEmail: 'example1@example.com',
    logArchiveAccountEmail: 'example2@example.com',
    auditAccountEmail: 'example3@example.com',
    controlTowerEnabled: 'no',
    enableSingleAccountMode: false,
  });

  describe('AccountIdConfig', () => {
    it('is tested', () => {
      expect(configRepository.getRepository()).toBeInstanceOf(Repository);
      expect(configRepository2.getRepository()).toBeInstanceOf(Repository);
    });
  });
});

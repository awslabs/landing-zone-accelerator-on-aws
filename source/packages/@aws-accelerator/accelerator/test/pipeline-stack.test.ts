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

import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { snapShotTest } from './snapshot-test';
import { describe } from '@jest/globals';

const testNamePrefix = 'Construct(PipelineStack): ';

/**
 * Pipeline Stack
 */
const app = new cdk.App();
const stack = new PipelineStack(app, 'PipelineStack', {
  sourceRepository: 'codecommit',
  sourceRepositoryOwner: 'awslabs',
  sourceRepositoryName: 'accelerator-source',
  sourceBranchName: 'main',
  enableApprovalStage: true,
  qualifier: 'aws-accelerator',
  managementAccountId: app.account,
  managementAccountRoleName: 'AcceleratorAccountAccessRole',
  managementAccountEmail: 'accelerator-root@mydomain.com',
  logArchiveAccountEmail: 'accelerator-log-archive@mydomain.com',
  auditAccountEmail: 'accelerator-audit@mydomain.com',
  partition: 'aws',
});


describe('PipelineStack', () => {
  snapShotTest(testNamePrefix, stack);
});

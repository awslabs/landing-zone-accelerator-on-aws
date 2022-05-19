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

import { expect as expectCDK, haveResourceLike } from '@aws-cdk/assert';
import { test, describe } from '@jest/globals';
import * as TestConfig from './test-config';
import * as CdkExtensions from '../index';

describe('Initialized CodeCommit Repository', () => {
  test('Initialization Properties Test', () => {
    new CdkExtensions.Repository(TestConfig.stack, 'SnapshotTest', TestConfig.repositoryProps);

    expectCDK(TestConfig.stack).to(
      haveResourceLike('AWS::CodeCommit::Repository', {
        RepositoryName: TestConfig.repositoryProps.repositoryName,
        Code: {
          BranchName: TestConfig.repositoryProps.repositoryBranchName,
          S3: {
            Bucket: TestConfig.repositoryProps.s3BucketName,
            Key: TestConfig.repositoryProps.s3key,
          },
        },
      }),
    );
  });
});

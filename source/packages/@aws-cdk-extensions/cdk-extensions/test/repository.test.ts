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

import { expect as expectCDK, haveResource, SynthUtils } from '@aws-cdk/assert';
import * as cdk from 'aws-cdk-lib';
import * as CdkExtensions from '../index';
import { test, describe, expect } from '@jest/globals';

describe('Initialized CodeCommit Repository', () => {
  const props: CdkExtensions.RepositoryProps = {
    repositoryName: 'AWS-accelerator',
    repositoryBranchName: 'main',
    s3BucketName: 'Testbucket',
    s3key: 'testkey',
  };

  test('Initialization Properties Test', () => {
    const stack = new cdk.Stack();

    new CdkExtensions.Repository(stack, 'SnapshotTest', props);

    expectCDK(stack).to(
      haveResource('AWS::CodeCommit::Repository', {
        RepositoryName: props.repositoryName,
        Code: {
          BranchName: props.repositoryBranchName,
          S3: {
            Bucket: props.s3BucketName,
            Key: props.s3key,
          },
        },
      }),
    );
  });

  /**
   * Snapshot Test - Initialzed Repository
   */
  test('Snapshot Test', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    new CdkExtensions.Repository(stack, 'SnapshotTest', {
      repositoryBranchName: props.repositoryBranchName,
      repositoryName: props.repositoryName,
      s3BucketName: props.s3BucketName,
      s3key: props.s3key,
    });

    expect(SynthUtils.toCloudFormation(stack)).toMatchSnapshot();
  });
});

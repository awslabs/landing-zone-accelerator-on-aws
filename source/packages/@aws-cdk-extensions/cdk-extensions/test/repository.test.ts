import { expect as expectCDK, haveResource, SynthUtils } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
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

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

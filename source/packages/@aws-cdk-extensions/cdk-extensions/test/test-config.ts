import { Stack } from 'aws-cdk-lib';
import * as CdkExtensions from '../index';

/**
 * Stack Initialization
 */
export const stack = new Stack();
/**
 * Accelerator Pipeline Secure Bucket Properties
 */
export const repositoryProps: CdkExtensions.RepositoryProps = {
  repositoryName: 'AWS-accelerator',
  repositoryBranchName: 'main',
  s3BucketName: 'Testbucket',
  s3key: 'testkey',
};

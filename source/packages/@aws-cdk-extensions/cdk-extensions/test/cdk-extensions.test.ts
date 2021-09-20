import { expect as expectCDK, countResources } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as CdkExtensions from '../index';

/*
 * Example test
 */
test('CdkExtensions.Repository', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');
  // WHEN
  new CdkExtensions.Repository(stack, 'MyTestConstruct', {
    repositoryBranchName: 'main',
    repositoryName: 'AWS-accelerator',
    s3BucketName: 'Testbucket',
    s3key: 'testkey',
  });
  // THEN
  expectCDK(stack).to(countResources('AWS::SNS::Topic', 0));
});

import { expect as expectCDK, countResources } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import { SecureS3Bucket } from '../lib/index';

/*
 * Example test
 */
test('SNS Topic Created', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');
  // WHEN
  new SecureS3Bucket(stack, 'MyTestConstruct', {
    kmsDescription: 'secure-s3-bucket-description',
    s3BucketName: 'test-bucket',
    kmsAliasName: 'test-bucket-alias',
  });
  // THEN
  expectCDK(stack).to(countResources('AWS::SNS::Topic', 0));
});

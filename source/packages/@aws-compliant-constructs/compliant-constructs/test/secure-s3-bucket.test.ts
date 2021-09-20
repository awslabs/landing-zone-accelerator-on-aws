import { expect as expectCDK, countResources } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as compliant_constructs from '../index';

/*
 * Example test
 */
test('compliant_constructs.SecureS3Bucket', () => {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, 'TestStack');
  // WHEN
  new compliant_constructs.SecureS3Bucket(stack, 'MyTestConstruct', {
    kmsDescription: 'secure-s3-bucket-description',
    s3BucketName: 'test-bucket',
    kmsAliasName: 'test-bucket-alias',
  });
  // THEN
  expectCDK(stack).to(countResources('AWS::SNS::Topic', 0));
});

import { SynthUtils } from '@aws-cdk/assert';
import { test, describe, expect } from '@jest/globals';
import * as compliant_constructs from '../lib/secure-s3-bucket';
import * as TestConfig from './test-config';

describe('Secure S3 Bucket', () => {
  /**
   * Snapshot Test - Compliant Constructor Secure S3 Bucket
   */
  test.skip('Snapshot Test', () => {
    new compliant_constructs.SecureS3Bucket(TestConfig.stack, 'SecureBucket', TestConfig.secureBucketProps);
    expect(SynthUtils.toCloudFormation(TestConfig.stack)).toMatchSnapshot();
  });
});

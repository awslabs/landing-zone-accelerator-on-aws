import { Stack } from 'aws-cdk-lib';
import * as compliant_constructs from '../lib/secure-s3-bucket';

/**
 * Stack Initialization
 */
export const stack = new Stack();
/**
 * Accelerator Pipeline Secure Bucket Name
 */
export const secureBucketName = 'aws-accelerator-secure-bucket';

/**
 * Accelerator Pipeline Secure Bucket Properties
 */
export const secureBucketProps: compliant_constructs.SecureS3BucketProps = {
  s3BucketName: secureBucketName,
  kmsAliasName: 'alias/accelerator/installer/s3',
  kmsDescription: 'AWS Accelerator Installer Bucket CMK',
  awsPrincipalAccesses: {
    principalAccesses: [{ principal: 'macie.amazonaws.com', accessType: 'readwrite' }],
  },
};

/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { GetBucketEncryptionCommand, S3Client } from '@aws-sdk/client-s3';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * put-bucket-prefix - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string | undefined;
      Data: { bucketKmsArn: string } | undefined;
    }
  | undefined
> {
  const bucketName: string = event.ResourceProperties['bucketName'];
  const validationCheckList: string[] = event.ResourceProperties['validationCheckList'];
  const encryptionType: 'kms' | 's3' = event.ResourceProperties['encryptionType'];
  const solutionId = process.env['SOLUTION_ID'];
  const s3Client = new S3Client({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update': {
      let validationStatus = true;
      let bucketKmsArn: string | undefined;
      if (validationCheckList.includes('encryption')) {
        const response = await validateEncryption(s3Client, bucketName, encryptionType);
        validationStatus = response.status;
        bucketKmsArn = response.bucketKmsArn;
      }

      if (validationStatus) {
        return {
          PhysicalResourceId: bucketName,
          Status: 'SUCCESS',
          Data: { bucketKmsArn: bucketKmsArn! },
        };
      } else {
        return {
          PhysicalResourceId: bucketName,
          Status: 'FAILURE',
          Data: undefined,
        };
      }
    }

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
        Data: undefined,
      };
  }
}

/**
 * Function to validate bucket encryption
 * @param s3Client - {@link S3Client}
 * @param bucketName - string
 * @returns
 */
async function validateEncryption(
  s3Client: S3Client,
  bucketName: string,
  encryptionType: 'kms' | 's3',
): Promise<{ bucketKmsArn: string | undefined; status: boolean }> {
  const response = await throttlingBackOff(() => s3Client.send(new GetBucketEncryptionCommand({ Bucket: bucketName })));

  if (encryptionType === 'kms') {
    if (
      response.ServerSideEncryptionConfiguration?.Rules![0].ApplyServerSideEncryptionByDefault?.SSEAlgorithm ===
        'aws:kms' &&
      response.ServerSideEncryptionConfiguration?.Rules[0].ApplyServerSideEncryptionByDefault?.KMSMasterKeyID
    ) {
      return {
        status: true,
        bucketKmsArn:
          response.ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.KMSMasterKeyID,
      };
    } else {
      console.warn(
        `Existing bucket ${bucketName} must have server-side encryption with AWS Key Management service keys (SSE-KMS)`,
      );
      return {
        status: true,
        bucketKmsArn: undefined,
      };
    }
  } else {
    if (
      response.ServerSideEncryptionConfiguration?.Rules![0].ApplyServerSideEncryptionByDefault?.SSEAlgorithm ===
      'AES256'
    ) {
      return {
        status: true,
        bucketKmsArn: undefined,
      };
    } else {
      console.warn(
        `Existing bucket ${bucketName} must have server-side encryption with Amazon S3 managed keys (SSE-S3).`,
      );
      return {
        status: true,
        bucketKmsArn: undefined,
      };
    }
  }
}

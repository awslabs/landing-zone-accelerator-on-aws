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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * put-bucket-prefix - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string | undefined;
    }
  | undefined
> {
  const bucketName: string = event.ResourceProperties['bucketName'];
  const kmsKeyArn: string = event.ResourceProperties['kmsKeyArn'];
  const solutionId = process.env['SOLUTION_ID'];
  const s3Client = new AWS.S3({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await throttlingBackOff(() =>
        s3Client
          .putBucketEncryption({
            Bucket: bucketName,
            ServerSideEncryptionConfiguration: {
              Rules: [
                {
                  BucketKeyEnabled: false,
                  ApplyServerSideEncryptionByDefault: {
                    SSEAlgorithm: 'aws:kms',
                    KMSMasterKeyID: kmsKeyArn,
                  },
                },
              ],
            },
          })
          .promise(),
      );

      return {
        PhysicalResourceId: bucketName,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

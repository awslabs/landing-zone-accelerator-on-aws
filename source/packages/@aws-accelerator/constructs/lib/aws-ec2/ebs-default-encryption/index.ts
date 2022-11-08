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

/**
 * aws-ec2-eanble-ebs-encryption - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';
import { throttlingBackOff } from '@aws-accelerator/utils';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const kmsKeyId = event.ResourceProperties['kmsKeyId'] || undefined;
  const solutionId = process.env['SOLUTION_ID'];

  const ec2 = new AWS.EC2({ customUserAgent: solutionId });
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const enableResponse = await throttlingBackOff(() => ec2.enableEbsEncryptionByDefault({}).promise());
      console.log(`Enable encryption response ${enableResponse}`);

      if (kmsKeyId) {
        const response = await throttlingBackOff(() => ec2.modifyEbsDefaultKmsKeyId({ KmsKeyId: kmsKeyId }).promise());
        console.log(`Modify KMS Key response ${response}`);
      } else {
        const response = await throttlingBackOff(() => ec2.resetEbsDefaultKmsKeyId({}).promise());
        console.log(`Modify KMS Key response ${response}`);
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const disableResponse = await throttlingBackOff(() => ec2.disableEbsEncryptionByDefault({}).promise());
      console.log(`Modify KMS Key response ${disableResponse}`);
      return { Status: 'Success', StatusCode: 200 };
  }
}

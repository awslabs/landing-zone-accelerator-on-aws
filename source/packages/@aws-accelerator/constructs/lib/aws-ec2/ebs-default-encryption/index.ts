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
 * aws-ec2-enable-ebs-encryption - lambda handler
 *
 * @param event
 * @returns
 */

import { setRetryStrategy, throttlingBackOff } from '@aws-accelerator/utils';
import {
  DisableEbsEncryptionByDefaultCommand,
  EC2Client,
  EnableEbsEncryptionByDefaultCommand,
  ModifyEbsDefaultKmsKeyIdCommand,
} from '@aws-sdk/client-ec2';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const kmsKeyId = event.ResourceProperties['kmsKeyId'] as string;
  const solutionId = process.env['SOLUTION_ID'];

  const ec2Client = new EC2Client({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const enableResponse = await throttlingBackOff(() => ec2Client.send(new EnableEbsEncryptionByDefaultCommand({})));
      console.log(`Enable encryption response ${JSON.stringify(enableResponse)}`);

      const response = await throttlingBackOff(() =>
        ec2Client.send(new ModifyEbsDefaultKmsKeyIdCommand({ KmsKeyId: kmsKeyId })),
      );
      console.log(`Modify KMS Key response ${JSON.stringify(response)}`);

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      const disableResponse = await throttlingBackOff(() =>
        ec2Client.send(new DisableEbsEncryptionByDefaultCommand({})),
      );
      console.log(`Disable EBS encryption response ${JSON.stringify(disableResponse)}`);
      return { Status: 'Success', StatusCode: 200 };
  }
}

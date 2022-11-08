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
 * maciePutClassificationExportConfigurationFunction - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const region = event.ResourceProperties['region'];
  const bucketName = event.ResourceProperties['bucketName'];
  const keyPrefix = event.ResourceProperties['keyPrefix'];
  const kmsKeyArn = event.ResourceProperties['kmsKeyArn'];
  const solutionId = process.env['SOLUTION_ID'];

  const macie2Client = new AWS.Macie2({ region: region, customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (!(await isMacieEnable(macie2Client))) {
        console.log('start enable of macie');
        await throttlingBackOff(() => macie2Client.enableMacie({ status: 'ENABLED' }).promise());
      }

      await throttlingBackOff(() =>
        macie2Client
          .putClassificationExportConfiguration({
            configuration: {
              s3Destination: {
                bucketName: bucketName,
                keyPrefix: keyPrefix,
                kmsKeyArn: kmsKeyArn,
              },
            },
          })
          .promise(),
      );
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Function to check if macie is enabled
 * @param macie2Client
 */
async function isMacieEnable(macie2Client: AWS.Macie2): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() => macie2Client.getMacieSession({}).promise());
    return response.status === 'ENABLED';
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (
      // SDKv2 Error Structure
      e.code === 'ResourceConflictException' ||
      // SDKv3 Error Structure
      e.name === 'ResourceConflictException'
    ) {
      console.warn(e.name + ': ' + e.message);
      return false;
    }

    // This is required when macie is not enabled AccessDeniedException exception issues
    if (
      // SDKv2 Error Structure
      e.code === 'AccessDeniedException' ||
      // SDKv3 Error Structure
      e.name === 'AccessDeniedException'
    ) {
      console.warn(e.name + ': ' + e.message);
      return false;
    }

    throw new Error(`Macie enable issue error message - ${e}`);
  }
}

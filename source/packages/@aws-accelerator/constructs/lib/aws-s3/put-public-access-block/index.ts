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
 * put-public-access-block - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const accountId: string = event.ResourceProperties['accountId'];
  const blockPublicAcls: boolean = event.ResourceProperties['blockPublicAcls'] === 'true';
  const blockPublicPolicy: boolean = event.ResourceProperties['blockPublicPolicy'] === 'true';
  const ignorePublicAcls: boolean = event.ResourceProperties['ignorePublicAcls'] === 'true';
  const restrictPublicBuckets: boolean = event.ResourceProperties['restrictPublicBuckets'] === 'true';
  const solutionId = process.env['SOLUTION_ID'];

  const s3ControlClient = new AWS.S3Control({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await throttlingBackOff(() =>
        s3ControlClient
          .putPublicAccessBlock({
            AccountId: accountId,
            PublicAccessBlockConfiguration: {
              BlockPublicAcls: blockPublicAcls,
              BlockPublicPolicy: blockPublicPolicy,
              IgnorePublicAcls: ignorePublicAcls,
              RestrictPublicBuckets: restrictPublicBuckets,
            },
          })
          .promise(),
      );
      return {
        PhysicalResourceId: `s3-bpa-${accountId}`,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

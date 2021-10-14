/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import * as console from 'console';
import { Macie2Client, PutClassificationExportConfigurationCommand } from '@aws-sdk/client-macie2';

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

  const macie2Client = new Macie2Client({ region: region });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('Started update');
      await throttlingBackOff(() =>
        macie2Client.send(
          new PutClassificationExportConfigurationCommand({
            configuration: {
              s3Destination: {
                bucketName: bucketName,
                keyPrefix: keyPrefix,
                kmsKeyArn: kmsKeyArn,
              },
            },
          }),
        ),
      );
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      return { Status: 'Success', StatusCode: 200 };
  }
}

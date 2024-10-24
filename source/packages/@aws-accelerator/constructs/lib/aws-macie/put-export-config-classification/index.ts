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
import {
  Macie2Client,
  EnableMacieCommand,
  UpdateMacieSessionCommand,
  PutFindingsPublicationConfigurationCommand,
  PutClassificationExportConfigurationCommand,
  GetMacieSessionCommand,
} from '@aws-sdk/client-macie2';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

import { Logger } from '@aws-sdk/types';

const consoleLogger: Logger = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

/**
 * maciePutClassificationExportConfigurationFunction - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
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

  const publishClassificationFindings = event.ResourceProperties['publishClassificationFindings'] === 'true';
  const publishPolicyFindings = event.ResourceProperties['publishPolicyFindings'] === 'true';
  const findingPublishingFrequency = event.ResourceProperties['findingPublishingFrequency'];

  const macie2Client = new Macie2Client({ region: region, customUserAgent: solutionId, logger: consoleLogger });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (!(await isMacieEnable(macie2Client))) {
        console.log('start enable of macie');
        await throttlingBackOff(() =>
          macie2Client.send(
            new EnableMacieCommand({
              findingPublishingFrequency: findingPublishingFrequency,
              status: 'ENABLED',
            }),
          ),
        );
      }
      console.log('start update of macie');
      await throttlingBackOff(() =>
        macie2Client.send(
          new UpdateMacieSessionCommand({
            findingPublishingFrequency: findingPublishingFrequency,
            status: 'ENABLED',
          }),
        ),
      );

      console.log('start putFindingsPublicationConfiguration of macie');
      await throttlingBackOff(() =>
        macie2Client.send(
          new PutFindingsPublicationConfigurationCommand({
            securityHubConfiguration: {
              publishClassificationFindings: publishClassificationFindings,
              publishPolicyFindings: publishPolicyFindings,
            },
          }),
        ),
      );

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
      // As discussed, Macie remains enabled even after LZA stacks are deleted
      return { Status: 'Success', StatusCode: 200 };
  }
}

/**
 * Function to check if macie is enabled
 * @param macie2Client
 */
async function isMacieEnable(macie2Client: Macie2Client): Promise<boolean> {
  try {
    const response = await throttlingBackOff(() => macie2Client.send(new GetMacieSessionCommand({})));
    return response.status === 'ENABLED';
  } catch (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    e: any
  ) {
    if (e.name === 'ResourceConflictException') {
      console.warn(e.name + ': ' + e.message);
      return false;
    }

    // This is required when macie is not enabled AccessDeniedException exception issues
    // TODO if access is denied why do we want to say it's not enabled, leading the caller to want to enable it?
    if (e.name === 'AccessDeniedException') {
      console.warn(e.name + ': ' + e.message);
      return false;
    }

    throw new Error(`Macie enable issue error message - ${e}`);
  }
}

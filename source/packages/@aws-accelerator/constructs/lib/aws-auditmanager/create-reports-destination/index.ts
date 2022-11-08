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
 * create-auditmanager-default-reports-destination - lambda handler
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
  const defaultReportsDestinationType = event.ResourceProperties['defaultReportsDestinationType'];
  const bucket = event.ResourceProperties['bucket'];
  const kmsKeyArn = event.ResourceProperties['kmsKeyArn'];
  const solutionId = process.env['SOLUTION_ID'];

  const auditManagerClient = new AWS.AuditManager({ region: region, customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('starting - CreateDefaultLoggingDestination');

      await throttlingBackOff(() =>
        auditManagerClient
          .updateSettings({
            defaultAssessmentReportsDestination: {
              destination: bucket,
              destinationType: defaultReportsDestinationType,
            },
            kmsKey: kmsKeyArn,
          })
          .promise(),
      );

      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('starting - DeleteDefaultReportDestination');

      return { Status: 'Success', StatusCode: 200 };
  }
}

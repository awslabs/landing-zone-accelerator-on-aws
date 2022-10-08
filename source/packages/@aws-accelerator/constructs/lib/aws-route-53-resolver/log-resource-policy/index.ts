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

import * as AWS from 'aws-sdk';
import { throttlingBackOff } from '@aws-accelerator/utils';

AWS.config.logger = console;

/**
 * log-resource-policy - Lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  interface ResourceLogPolicy {
    policyName: string;
    policyStatements: [];
  }

  const resourceLogPolicy = event.ResourceProperties as unknown as ResourceLogPolicy;
  const policyName = resourceLogPolicy.policyName;
  const policyDocument = {
    Version: '2012-10-17',
    Statement: resourceLogPolicy.policyStatements,
  };
  console.log(policyDocument);

  const logsClient = new AWS.CloudWatchLogs();

  switch (event.RequestType) {
    case 'Update':
    case 'Create':
      console.log(`Creating CloudWatch log resource policy.`);
      await throttlingBackOff(() =>
        logsClient
          .putResourcePolicy({
            policyName: policyName,
            policyDocument: JSON.stringify(policyDocument),
          })
          .promise(),
      );
      return {
        PhysicalResourceId: policyName,
        Status: 'SUCCESS',
      };
    case 'Delete':
      console.log(`Deleting CloudWatch log resource policy.`);
      await throttlingBackOff(() => logsClient.deleteResourcePolicy({ policyName: policyName }).promise());
      return {
        PhysicalResourceId: policyName,
        Status: 'SUCCESS',
      };
  }
}

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

import {
  CloudWatchLogsClient,
  DeleteResourcePolicyCommand,
  PutResourcePolicyCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * log-resource-policy - Lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
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

  const solutionId = process.env['SOLUTION_ID'];
  const resourceLogPolicy = event.ResourceProperties as unknown as ResourceLogPolicy;
  const policyName = resourceLogPolicy.policyName;
  const policyDocument = JSON.stringify({
    Version: '2012-10-17',
    Statement: resourceLogPolicy.policyStatements,
  });
  console.log(policyDocument);

  const logsClient = new CloudWatchLogsClient({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Update':
    case 'Create':
      console.log(`Creating CloudWatch log resource policy.`);
      await throttlingBackOff(() => logsClient.send(new PutResourcePolicyCommand({ policyName, policyDocument })));
      return {
        PhysicalResourceId: policyName,
        Status: 'SUCCESS',
      };
    case 'Delete':
      console.log(`Deleting CloudWatch log resource policy.`);
      await throttlingBackOff(() => logsClient.send(new DeleteResourcePolicyCommand({ policyName })));

      return {
        PhysicalResourceId: policyName,
        Status: 'SUCCESS',
      };
  }
}

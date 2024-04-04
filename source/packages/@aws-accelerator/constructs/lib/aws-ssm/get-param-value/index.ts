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

import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { STSClient } from '@aws-sdk/client-sts';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy, getStsCredentials } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * get ssm parameter custom control
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const parameterRegion = event.ResourceProperties['parameterRegion'];
  const invokingAccountID = event.ResourceProperties['invokingAccountID'];
  const parameterAccountID = event.ResourceProperties['parameterAccountID'];
  const assumeRoleArn = event.ResourceProperties['assumeRoleArn'];
  const parameterName = event.ResourceProperties['parameterName'];
  const solutionId = process.env['SOLUTION_ID'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let ssmClient: SSMClient;
      if (invokingAccountID !== parameterAccountID) {
        const stsClient = new STSClient({
          region: parameterRegion,
          customUserAgent: solutionId,
          retryStrategy: setRetryStrategy(),
        });
        ssmClient = new SSMClient({
          region: parameterRegion,
          credentials: await getStsCredentials(stsClient, assumeRoleArn),
          customUserAgent: solutionId,
          retryStrategy: setRetryStrategy(),
        });
      } else {
        ssmClient = new SSMClient({
          region: parameterRegion,
          customUserAgent: solutionId,
          retryStrategy: setRetryStrategy(),
        });
      }

      const response = await throttlingBackOff(() => ssmClient.send(new GetParameterCommand({ Name: parameterName })));

      return { PhysicalResourceId: response.Parameter!.Value, Status: 'SUCCESS' };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: undefined,
        Status: 'SUCCESS',
      };
  }
}

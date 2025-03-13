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
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { DescribeVpcsCommand, EC2Client } from '@aws-sdk/client-ec2';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

/**
 * add-macie-members - lambda handler
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
  console.log(event);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('start GetVpcId');

      const vpcName = event.ResourceProperties['vpcName'];
      const solutionId = process.env['SOLUTION_ID'];
      const ec2Client = new EC2Client({
        customUserAgent: solutionId,
        retryStrategy: setRetryStrategy(),
      });

      let nextToken: string | undefined = undefined;

      do {
        const page = await throttlingBackOff(() =>
          ec2Client.send(
            new DescribeVpcsCommand({
              Filters: [{ Name: 'tag:Name', Values: [vpcName] }],
              NextToken: nextToken,
            }),
          ),
        );

        for (const vpc of page.Vpcs ?? []) {
          return {
            PhysicalResourceId: vpc.VpcId,
            Status: 'SUCCESS',
          };
        }

        nextToken = page.NextToken;
      } while (nextToken);

      throw new Error(
        `Vpc ${vpcName} not found, if this is shared vpc, make sure vpc has tag with key Name and value as ${vpcName} `,
      );

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

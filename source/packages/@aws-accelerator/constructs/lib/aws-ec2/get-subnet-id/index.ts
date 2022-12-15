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
 * add-macie-members - lambda handler
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
  console.log(event);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log('start GetSubnetId');

      const vpcId = event.ResourceProperties['vpcId'];
      const subnetName = event.ResourceProperties['subnetName'];
      const solutionId = process.env['SOLUTION_ID'];
      const ec2Client = new AWS.EC2({ customUserAgent: solutionId });

      let nextToken: string | undefined = undefined;

      do {
        const page = await throttlingBackOff(() =>
          ec2Client
            .describeSubnets({
              Filters: [
                { Name: 'vpc-id', Values: [vpcId] },
                { Name: 'tag:Name', Values: [subnetName] },
              ],
              NextToken: nextToken,
            })
            .promise(),
        );

        for (const subnet of page.Subnets ?? []) {
          console.log(`Subnet ${subnetName} id is : ${subnet.SubnetId}`);
          return {
            PhysicalResourceId: subnet.SubnetId,
            Status: 'SUCCESS',
          };
        }

        nextToken = page.NextToken;
      } while (nextToken);

      throw new Error(
        `Subnet ${subnetName} not found, if this is shared subnet, make sure vpc has tag with key Name and value as ${subnetName} `,
      );

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

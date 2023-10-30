/**
 *  Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
/**
 * get-resource-type - lambda handler
 *
 * @param event
 * @returns
 */

import {
  CloudFormationClient,
  DescribeStackResourceCommand,
  DescribeStackResourceCommandOutput,
} from '@aws-sdk/client-cloudformation';
import { throttlingBackOff } from '@aws-accelerator/utils';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const stackName = event.ResourceProperties['stackName'];
  const logicalResourceId = event.ResourceProperties['logicalResourceId'];
  const solutionId = process.env['SOLUTION_ID'];
  let resourceDetails: DescribeStackResourceCommandOutput | undefined = undefined;
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const cloudformationClient = new CloudFormationClient({ customUserAgent: solutionId });
      try {
        resourceDetails = await throttlingBackOff(() =>
          cloudformationClient.send(
            new DescribeStackResourceCommand({ StackName: stackName, LogicalResourceId: logicalResourceId }),
          ),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        if (e.name === 'ValidationError') {
          return {
            PhysicalResourceId: undefined,
            Status: 'SUCCESS',
          };
        } else {
          console.log(`Error: ${JSON.stringify(e)}`);
          throw new Error(`Error retrieving CloudFormation stack named ${stackName}`);
        }
      }
      if (resourceDetails && resourceDetails.StackResourceDetail?.LogicalResourceId) {
        return {
          PhysicalResourceId: resourceDetails.StackResourceDetail?.ResourceType,
          Status: 'SUCCESS',
        };
      }
      return {
        PhysicalResourceId: undefined,
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

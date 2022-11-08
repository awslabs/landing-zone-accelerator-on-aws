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
 * SecurityHubRegionAggregation - lambda handler
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
  const solutionId = process.env['SOLUTION_ID'];

  const securityHubClient = new AWS.SecurityHub({ region: region, customUserAgent: solutionId });

  // check if existing finding aggregator exists
  const result = await throttlingBackOff(() => securityHubClient.listFindingAggregators({}).promise());

  let findingAggregatorArn = '';
  if (result['FindingAggregators']!.length > 0)
    findingAggregatorArn = result['FindingAggregators']![0]['FindingAggregatorArn']!;

  switch (event.RequestType) {
    case 'Create':
      //don't try to create finding aggregator if it exists
      if (findingAggregatorArn) {
        console.log('Existing Finding Aggregator found, skipping creation', findingAggregatorArn);
      } else {
        console.log('Enable Finding Aggreggation');
        try {
          await throttlingBackOff(() =>
            securityHubClient.createFindingAggregator({ RegionLinkingMode: 'ALL_REGIONS' }).promise(),
          );
        } catch (error) {
          console.log(error);
          return { Status: 'Failure', StatusCode: 400 };
        }
      }
      return { Status: 'Success', StatusCode: 200 };
    case 'Update':
      console.log('Update Finding Aggregator Arn', findingAggregatorArn);
      try {
        await throttlingBackOff(() =>
          securityHubClient
            .updateFindingAggregator({
              FindingAggregatorArn: findingAggregatorArn,
              RegionLinkingMode: 'ALL_REGIONS',
            })
            .promise(),
        );
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('Delete Finding Aggregator Arn', findingAggregatorArn);
      try {
        await throttlingBackOff(() =>
          securityHubClient.deleteFindingAggregator({ FindingAggregatorArn: findingAggregatorArn }).promise(),
        );
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

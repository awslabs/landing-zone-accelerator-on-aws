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

import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import {
  CreateFindingAggregatorCommand,
  DeleteFindingAggregatorCommand,
  FindingAggregator,
  paginateListFindingAggregators,
  SecurityHubClient,
  UpdateFindingAggregatorCommand,
} from '@aws-sdk/client-securityhub';

/**
 * SecurityHubRegionAggregation - lambda handler
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
  const solutionId = process.env['SOLUTION_ID'];

  const client = new SecurityHubClient({
    region: region,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  // check if existing finding aggregator exists
  const findingAggregators: FindingAggregator[] = [];
  const paginator = paginateListFindingAggregators({ client }, {});

  for await (const page of paginator) {
    if (page.FindingAggregators) {
      findingAggregators.push(...page.FindingAggregators);
    }
  }

  let findingAggregatorArn: string | undefined;
  for (const findingAggregator of findingAggregators) {
    if (findingAggregator.FindingAggregatorArn) {
      findingAggregatorArn = findingAggregator.FindingAggregatorArn;
    }
  }

  switch (event.RequestType) {
    case 'Create':
      //don't try to create finding aggregator if it exists
      if (findingAggregatorArn) {
        console.log('Existing Finding Aggregator found, skipping creation', findingAggregatorArn);
      } else {
        console.log('Enable Finding Aggregation');
        try {
          await throttlingBackOff(() =>
            client.send(new CreateFindingAggregatorCommand({ RegionLinkingMode: 'ALL_REGIONS' })),
          );
        } catch (error: unknown) {
          console.log(error);
          return { Status: 'Failure', StatusCode: 400 };
        }
      }
      return { Status: 'Success', StatusCode: 200 };
    case 'Update':
      console.log('Update Finding Aggregator Arn', findingAggregatorArn);
      try {
        await throttlingBackOff(() =>
          client.send(
            new UpdateFindingAggregatorCommand({
              FindingAggregatorArn: findingAggregatorArn,
              RegionLinkingMode: 'ALL_REGIONS',
            }),
          ),
        );
      } catch (error: unknown) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };

    case 'Delete':
      console.log('Delete Finding Aggregator Arn', findingAggregatorArn);
      try {
        await throttlingBackOff(() =>
          client.send(new DeleteFindingAggregatorCommand({ FindingAggregatorArn: findingAggregatorArn })),
        );
      } catch (error) {
        console.log(error);
        return { Status: 'Failure', StatusCode: 400 };
      }
      return { Status: 'Success', StatusCode: 200 };
  }
}

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
/**
 * get-portfolio-id - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';
import { throttlingBackOff } from '@aws-accelerator/utils';

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const displayName = event.ResourceProperties['displayName'];
  const providerName = event.ResourceProperties['providerName'];
  const solutionId = process.env['SOLUTION_ID'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const serviceCatalogClient = new AWS.ServiceCatalog({ customUserAgent: solutionId });
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          serviceCatalogClient.listPortfolios({ PageToken: nextToken }).promise(),
        );
        for (const portfolio of page.PortfolioDetails ?? []) {
          if (portfolio.DisplayName === displayName && portfolio.ProviderName === providerName) {
            const portfolioId = portfolio.Id;
            if (portfolioId) {
              console.log(portfolioId);
              return {
                PhysicalResourceId: portfolioId,
                Status: 'SUCCESS',
              };
            }
          }
        }
        nextToken = page.NextPageToken;
      } while (nextToken);

      return {
        PhysicalResourceId: 'none',
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

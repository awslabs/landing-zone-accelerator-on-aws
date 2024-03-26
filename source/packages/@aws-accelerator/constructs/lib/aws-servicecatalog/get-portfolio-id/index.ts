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
/**
 * get-portfolio-id - lambda handler
 *
 * @param event
 * @returns
 */

import { paginateListPortfolios, ServiceCatalogClient } from '@aws-sdk/client-service-catalog';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

const serviceCatalogClient = new ServiceCatalogClient({
  retryStrategy: setRetryStrategy(),
  customUserAgent: process.env['SOLUTION_ID'],
});
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  const displayName = event.ResourceProperties['displayName'];
  const providerName = event.ResourceProperties['providerName'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const portfolioId = await getPortfolioId(serviceCatalogClient, displayName, providerName);
      return {
        PhysicalResourceId: portfolioId,
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
async function getPortfolioId(serviceCatalogClient: ServiceCatalogClient, displayName: string, providerName: string) {
  const portfolios = [];
  // get all portfolio id for specific provider and display name
  for await (const page of paginateListPortfolios({ client: serviceCatalogClient }, {})) {
    for (const portfolio of page.PortfolioDetails ?? []) {
      if (portfolio.DisplayName === displayName && portfolio.ProviderName === providerName) {
        portfolios.push(portfolio.Id);
      }
    }
  }
  // there are no portfolios in the account for that specified filter
  if (portfolios.length === 0) {
    throw new Error(`No portfolio ID was found for ${displayName} ${providerName} in the account`);
  }
  // this is to handle the case where there are multiple portfolios with the same display name and provider name
  if (portfolios.length > 1) {
    throw new Error(`Multiple portfolio IDs were found for ${displayName} ${providerName} in the account`);
  }
  return portfolios[0];
}

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
 * share-portfolio-with-org - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';
import { throttlingBackOff } from '@aws-accelerator/utils';

const serviceCatalogClient = new AWS.ServiceCatalog();

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(event);
  const portfolioId = event.ResourceProperties['portfolioId'];
  const organizationalUnitId = event.ResourceProperties['organizationalUnitId'];
  const organizationId = event.ResourceProperties['organizationId'];
  const tagShareOptions = event.ResourceProperties['tagShareOptions'] === 'true';

  try {
    if (organizationalUnitId) {
      await modifyPortfolioShare(
        organizationalUnitId,
        event.RequestType,
        portfolioId,
        tagShareOptions,
        'ORGANIZATIONAL_UNIT',
      );
    } else if (organizationId) {
      await modifyPortfolioShare(organizationId, event.RequestType, portfolioId, tagShareOptions, 'ORGANIZATION');
    } else {
      throw new Error('Either organizational unit id or organization id is required');
    }
    await delay(3000);
  } catch (error) {
    console.error(
      `Failed to ${event.RequestType} portfolio share for portfolio ${portfolioId} with organizational unit ${organizationalUnitId}`,
    );
    console.error(error);
    return {
      PhysicalResourceId: 'none',
      Status: 'FAILED',
    };
  }

  return {
    PhysicalResourceId: 'none',
    Status: 'SUCCESS',
  };
}

export async function modifyPortfolioShare(
  orgResourceId: string,
  requestType: string,
  portfolioId: string,
  tagShareOptions: boolean,
  nodeType: string,
) {
  switch (requestType) {
    case 'Create':
      await throttlingBackOff(() =>
        serviceCatalogClient
          .createPortfolioShare({
            PortfolioId: portfolioId,
            OrganizationNode: {
              Type: nodeType,
              Value: orgResourceId,
            },
            ShareTagOptions: tagShareOptions,
          })
          .promise(),
      );
      console.log(
        `Portfolio share for portfolio ${portfolioId} with organizational resource ${orgResourceId} created successfully.`,
      );
      break;
    case 'Update':
      await throttlingBackOff(() =>
        serviceCatalogClient
          .updatePortfolioShare({
            PortfolioId: portfolioId,
            OrganizationNode: {
              Type: nodeType,
              Value: orgResourceId,
            },
            ShareTagOptions: tagShareOptions,
          })
          .promise(),
      );
      console.log(
        `Portfolio share for portfolio ${portfolioId} with organizational resource ${orgResourceId} updated successfully.`,
      );
      break;
    case 'Delete':
      await throttlingBackOff(() =>
        serviceCatalogClient
          .deletePortfolioShare({
            PortfolioId: portfolioId,
            OrganizationNode: {
              Type: nodeType,
              Value: orgResourceId,
            },
          })
          .promise(),
      );
      console.log(
        `Portfolio share for portfolio ${portfolioId} with organizational resource ${orgResourceId} deleted successfully.`,
      );
      break;
  }
}

/**
 * Function to sleep process
 * @param ms
 * @returns
 */
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

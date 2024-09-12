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
 * share-portfolio-with-org - lambda handler
 *
 * @param event
 * @returns
 */

import {
  CreatePortfolioShareCommand,
  DeletePortfolioShareCommand,
  DescribePortfolioShareStatusCommand,
  ServiceCatalogClient,
  UpdatePortfolioShareCommand,
  OrganizationNodeType,
} from '@aws-sdk/client-service-catalog';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
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
  console.log(event);
  const portfolioId = event.ResourceProperties['portfolioId'];
  const organizationalUnitId = event.ResourceProperties['organizationalUnitId'];
  const organizationId = event.ResourceProperties['organizationId'];
  const tagShareOptions = event.ResourceProperties['tagShareOptions'] === 'true';

  try {
    if (organizationId && organizationalUnitId) {
      throw new Error('Both organizational unit id and organization id is specified');
    } else if (organizationalUnitId) {
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

export async function createPortfolioShare(
  orgResourceId: string,
  portfolioId: string,
  tagShareOptions: boolean,
  nodeType: string,
): Promise<string> {
  try {
    const response = await throttlingBackOff(() =>
      serviceCatalogClient.send(
        new CreatePortfolioShareCommand({
          PortfolioId: portfolioId,
          OrganizationNode: {
            Type: nodeType as OrganizationNodeType,
            Value: orgResourceId,
          },
          ShareTagOptions: tagShareOptions,
        }),
      ),
    );
    return response.PortfolioShareToken!;
  } catch (error) {
    console.error(error);
    throw new Error(
      `Error while trying to create portfolio share with organization resource id: ${orgResourceId} with portfolio id: ${portfolioId}`,
    );
  }
}

export async function updatePortfolioShare(
  orgResourceId: string,
  portfolioId: string,
  tagShareOptions: boolean,
  nodeType: string,
): Promise<string> {
  try {
    const response = await throttlingBackOff(() =>
      serviceCatalogClient.send(
        new UpdatePortfolioShareCommand({
          PortfolioId: portfolioId,
          OrganizationNode: {
            Type: nodeType as OrganizationNodeType,
            Value: orgResourceId,
          },
          ShareTagOptions: tagShareOptions,
        }),
      ),
    );
    return response.PortfolioShareToken!;
  } catch (error) {
    throw new Error(
      `UpdatePortfolioShare ran into error with portfolio id: ${portfolioId} on organization resource: ${orgResourceId}`,
    );
  }
}

export async function deletePortfolioShare(
  orgResourceId: string,
  portfolioId: string,
  nodeType: string,
): Promise<string> {
  try {
    const response = await throttlingBackOff(() =>
      serviceCatalogClient.send(
        new DeletePortfolioShareCommand({
          PortfolioId: portfolioId,
          OrganizationNode: {
            Type: nodeType as OrganizationNodeType,
            Value: orgResourceId,
          },
        }),
      ),
    );
    return response.PortfolioShareToken!;
  } catch (error) {
    throw new Error(`Delete Portfolio share failed on portfolio: ${portfolioId}, organization unit: ${orgResourceId}`);
  }
}

export async function checkPortfolioShareTokenStatus(
  portfolioShareToken: string,
  portfolioId: string,
): Promise<string> {
  try {
    const response = await throttlingBackOff(() =>
      serviceCatalogClient.send(
        new DescribePortfolioShareStatusCommand({
          PortfolioShareToken: portfolioShareToken,
        }),
      ),
    );
    console.log(response);
    return response.Status!;
  } catch (error) {
    throw new Error(`Error on checking portfolio share status with portfolioId: ${portfolioId}`);
  }
}

export async function retryCheckPortfolioShareTokenStatus(
  portfolioShareToken: string,
  portfolioId: string,
): Promise<string> {
  let portfolioShareStatus = 'NOT_STARTED';

  do {
    await delay(1000);
    portfolioShareStatus = await checkPortfolioShareTokenStatus(portfolioShareToken, portfolioId);
  } while (
    portfolioShareStatus === 'NOT_STARTED' ||
    portfolioShareStatus === 'IN_PROGRESS' ||
    portfolioShareStatus === 'error'
  );
  return portfolioShareStatus;
}

export async function modifyPortfolioShare(
  orgResourceId: string,
  requestType: string,
  portfolioId: string,
  tagShareOptions: boolean,
  nodeType: string,
) {
  // Random delay to reduce the chance to process more than one portfolio share action at the same time which triggers InvalidStateException
  await delay(Math.floor(Math.random() * 5) * 5000);
  let portfolioShareToken = '';
  let portfolioShareStatus = 'NOT_STARTED';
  switch (requestType) {
    case 'Create':
      portfolioShareToken = await createPortfolioShare(orgResourceId, portfolioId, tagShareOptions, nodeType);
      portfolioShareStatus = await retryCheckPortfolioShareTokenStatus(portfolioShareToken, portfolioId);
      console.log(
        `Create portfolio share for portfolio ${portfolioId} with organizational resource ${orgResourceId} status is ${portfolioShareStatus} (portfolioShareToken: ${portfolioShareToken}).`,
      );
      break;
    case 'Update':
      portfolioShareToken = await updatePortfolioShare(orgResourceId, portfolioId, tagShareOptions, nodeType);
      portfolioShareStatus = await retryCheckPortfolioShareTokenStatus(portfolioShareToken, portfolioId);
      console.log(
        `Update portfolio share for portfolio ${portfolioId} with organizational resource ${orgResourceId} status is ${portfolioShareStatus} (portfolioShareToken:${portfolioShareToken}.`,
      );
      break;
    case 'Delete':
      portfolioShareToken = await deletePortfolioShare(orgResourceId, portfolioId, nodeType);
      portfolioShareStatus = await retryCheckPortfolioShareTokenStatus(portfolioShareToken, portfolioId);
      console.log(
        `Delete portfolio share for portfolio ${portfolioId} with organizational resource ${orgResourceId} status is ${portfolioShareStatus} (portfolioShareToken:${portfolioShareToken}.`,
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

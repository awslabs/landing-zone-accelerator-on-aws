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

import * as AWS from 'aws-sdk';

import { throttlingBackOff } from '@aws-accelerator/utils';

/**
 * direct-connect-gateway-association - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Data: {
        TransitGatewayAttachmentId: string;
      };
      Status: string;
    }
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  // Set variables
  const allowedPrefixesInitial: string[] = event.ResourceProperties['allowedPrefixes'];
  const directConnectGatewayId: string = event.ResourceProperties['directConnectGatewayId'];
  const solutionId = process.env['SOLUTION_ID'];
  const dx = new AWS.DirectConnect({ customUserAgent: solutionId });
  const ec2 = new AWS.EC2({ customUserAgent: solutionId });
  const gatewayId: string = event.ResourceProperties['gatewayId'];
  const lambdaClient = new AWS.Lambda({ customUserAgent: solutionId });
  let attachmentId: string | undefined = undefined;

  switch (event.RequestType) {
    case 'Create':
      const allowedPrefixes = allowedPrefixesInitial.map(item => {
        return { cidr: item };
      });
      // Create gateway association
      const response = await throttlingBackOff(() =>
        dx
          .createDirectConnectGatewayAssociation({
            directConnectGatewayId,
            addAllowedPrefixesToDirectConnectGateway: allowedPrefixes,
            gatewayId,
          })
          .promise(),
      );
      const associationId = response.directConnectGatewayAssociation?.associationId;

      // Validate associationId exists
      if (!associationId) {
        throw new Error(
          `Unable to associate Direct Connect Gateway ${directConnectGatewayId} with gateway ${gatewayId}`,
        );
      }

      // Validate association state
      if (await validateAssociationState(dx, associationId, 'associated')) {
        attachmentId = await getDxAttachmentId(ec2, directConnectGatewayId, gatewayId);
        return {
          PhysicalResourceId: associationId,
          Data: {
            TransitGatewayAttachmentId: attachmentId,
          },
          Status: 'SUCCESS',
        };
      }

      // Retry Lambda
      await retryLambda(lambdaClient, event);
      await sleep(120000);
      return;

    case 'Update':
      // Update association
      if (!(await inProgress(dx, event.PhysicalResourceId))) {
        const allowedPrefixesPrevious: string[] = event.OldResourceProperties['allowedPrefixes'];
        const [addPrefixes, removePrefixes] = getPrefixUpdates(allowedPrefixesInitial, allowedPrefixesPrevious);

        await throttlingBackOff(() =>
          dx
            .updateDirectConnectGatewayAssociation({
              associationId: event.PhysicalResourceId,
              addAllowedPrefixesToDirectConnectGateway: addPrefixes,
              removeAllowedPrefixesToDirectConnectGateway: removePrefixes,
            })
            .promise(),
        );
      }

      if (await validateAssociationState(dx, event.PhysicalResourceId, 'associated')) {
        attachmentId = await getDxAttachmentId(ec2, directConnectGatewayId, gatewayId);
        return {
          PhysicalResourceId: event.PhysicalResourceId,
          Data: {
            TransitGatewayAttachmentId: attachmentId,
          },
          Status: 'SUCCESS',
        };
      }

      // Retry Lambda
      await retryLambda(lambdaClient, event);
      await sleep(120000);
      return;

    case 'Delete':
      if (!(await inProgress(dx, event.PhysicalResourceId))) {
        await throttlingBackOff(() =>
          dx.deleteDirectConnectGatewayAssociation({ associationId: event.PhysicalResourceId }).promise(),
        );
      }

      if (await validateAssociationState(dx, event.PhysicalResourceId, 'disassociated')) {
        return {
          PhysicalResourceId: event.PhysicalResourceId,
          Status: 'SUCCESS',
        };
      }

      // Retry Lambda
      await retryLambda(lambdaClient, event);
      await sleep(120000);
      return;
  }
}

/**
 * Validate the gateway association state is `associated`
 * or `disassociated`
 * @param dx
 * @param associationId
 * @param expectedState
 */
async function validateAssociationState(
  dx: AWS.DirectConnect,
  associationId: string,
  expectedState: string,
): Promise<boolean> {
  let currentState: string | undefined;
  let retries = 0;

  // Describe gateway association until it is in the expected state
  do {
    const response = await throttlingBackOff(() =>
      dx.describeDirectConnectGatewayAssociations({ associationId }).promise(),
    );
    if (!response.directConnectGatewayAssociations) {
      throw new Error(`Unable to retrieve gateway association ${associationId}`);
    }

    // Check case where association ID is removed from the list during deletion
    if (expectedState === 'disassociated' && response.directConnectGatewayAssociations.length === 0) {
      return true;
    }

    // Determine association state
    currentState = response.directConnectGatewayAssociations[0].associationState;
    if (currentState !== expectedState) {
      await sleep(60000);
    }

    // Increase retry index until timeout nears
    retries += 1;
    if (retries > 13) {
      return false;
    }
  } while (currentState !== expectedState);
  return true;
}

/**
 * Get the transit gateway attachment ID for the Direct Connect Gateway association
 * @param directConnectGatewayId
 * @returns
 */
async function getDxAttachmentId(ec2: AWS.EC2, directConnectGatewayId: string, gatewayId: string): Promise<string> {
  let nextToken: string | undefined = undefined;
  let attachmentId: string | undefined = undefined;

  // Get transit gateway attachment ID
  do {
    const page = await throttlingBackOff(() =>
      ec2
        .describeTransitGatewayAttachments({
          Filters: [
            { Name: 'resource-id', Values: [directConnectGatewayId] },
            { Name: 'transit-gateway-id', Values: [gatewayId] },
          ],
          NextToken: nextToken,
        })
        .promise(),
    );
    // Set attachment ID
    for (const attachment of page.TransitGatewayAttachments ?? []) {
      if (attachment.State === 'available') {
        attachmentId = attachment.TransitGatewayAttachmentId;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  // Validate attachment ID exists
  if (!attachmentId) {
    throw new Error(
      `Unable to retrieve transit gateway attachment ID for Direct Connect Gateway ${directConnectGatewayId}`,
    );
  }
  return attachmentId;
}

/**
 * Determines the prefixes that need to be added/removed during the update operation.
 * @param updatePrefixes
 * @param previousPrefixes
 */
function getPrefixUpdates(
  updatePrefixes: string[],
  previousPrefixes: string[],
): [{ cidr: string }[], { cidr: string }[] | undefined] {
  // Determine prefixes that need to be removed
  let removePrefixes: { cidr: string }[] | undefined = undefined;
  const removePrefixesInitial = previousPrefixes.filter(item => !updatePrefixes.includes(item));

  if (removePrefixesInitial.length > 0) {
    removePrefixes = removePrefixesInitial.map(item => {
      return { cidr: item };
    });
  }

  // Convert update prefixes
  const addPrefixes = updatePrefixes.map(item => {
    return { cidr: item };
  });

  return [addPrefixes, removePrefixes];
}

/**
 * Re-invoke the Lambda function if the timeout is close to being reached
 * @param lambdaClient
 * @param event
 */
async function retryLambda(
  lambdaClient: AWS.Lambda,
  event: AWSLambda.CloudFormationCustomResourceEvent,
): Promise<void> {
  // Add retry attempt to event
  if (!event.ResourceProperties['retryAttempt']) {
    event.ResourceProperties['retryAttempt'] = 0;
  }
  event.ResourceProperties['retryAttempt'] += 1;

  // Throw error for max number of retries
  if (event.ResourceProperties['retryAttempt'] > 3) {
    throw new Error(
      `Exceeded maximum number of retries. Please check the Direct Connect console for the status of your gateway association.`,
    );
  }

  // Invoke Lambda
  await throttlingBackOff(() =>
    lambdaClient
      .invoke({ FunctionName: event.ServiceToken, InvocationType: 'Event', Payload: JSON.stringify(event) })
      .promise(),
  );
}

/**
 * Check if a mutating action is in progress
 * @param dx
 * @param associationId
 * @returns
 */
async function inProgress(dx: AWS.DirectConnect, associationId: string): Promise<boolean> {
  const response = await throttlingBackOff(() =>
    dx.describeDirectConnectGatewayAssociations({ associationId }).promise(),
  );

  if (!response.directConnectGatewayAssociations) {
    throw new Error(`Unable to retrieve gateway association ${associationId}`);
  }
  if (
    response.directConnectGatewayAssociations.length === 0 ||
    ['associated', 'disassociated'].includes(response.directConnectGatewayAssociations[0].associationState!)
  ) {
    return false;
  }
  return true;
}

/**
 * Sleep for a specified number of milliseconds
 * @param ms
 * @returns
 */
async function sleep(ms: number) {
  return new Promise(f => setTimeout(f, ms));
}

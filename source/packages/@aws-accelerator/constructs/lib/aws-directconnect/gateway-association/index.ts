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
  const dx = new AWS.DirectConnect();
  const gatewayId: string = event.ResourceProperties['gatewayId'];
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

      // Get attachment ID
      await validateAssociationState(dx, associationId);
      attachmentId = await getDxAttachmentId(directConnectGatewayId);

      return {
        PhysicalResourceId: associationId,
        Data: {
          TransitGatewayAttachmentId: attachmentId,
        },
        Status: 'SUCCESS',
      };

    case 'Update':
      const allowedPrefixesPrevious: string[] = event.OldResourceProperties['allowedPrefixes'];
      const [addPrefixes, removePrefixes] = getPrefixUpdates(allowedPrefixesInitial, allowedPrefixesPrevious);
      attachmentId = await getDxAttachmentId(directConnectGatewayId);

      // Update association
      await throttlingBackOff(() =>
        dx
          .updateDirectConnectGatewayAssociation({
            associationId: event.PhysicalResourceId,
            addAllowedPrefixesToDirectConnectGateway: addPrefixes,
            removeAllowedPrefixesToDirectConnectGateway: removePrefixes,
          })
          .promise(),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Data: {
          TransitGatewayAttachmentId: attachmentId,
        },
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        dx.deleteDirectConnectGatewayAssociation({ associationId: event.PhysicalResourceId }).promise(),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Validate the gateway association state is `associated`
 * @param dx
 * @param associationId
 */
async function validateAssociationState(dx: AWS.DirectConnect, associationId: string): Promise<void> {
  let state: string | undefined;
  let retries = 0;

  // Describe gateway association until it is in the expected state
  do {
    const response = await throttlingBackOff(() =>
      dx.describeDirectConnectGatewayAssociations({ associationId }).promise(),
    );
    if (!response.directConnectGatewayAssociations) {
      throw new Error(`Unable to retrieve gateway association ${associationId}`);
    }
    // Determine association state
    state = response.directConnectGatewayAssociations[0].associationState;
    if (state !== 'associated') {
      await sleep(30000);
    }

    // Increase retry index
    retries += 1;
    if (retries > 28) {
      throw new Error(`Gateway association ${associationId} did not complete within the expected time interval.`);
    }
  } while (state !== 'associated');
}

/**
 * Get the transit gateway attachment ID for the Direct Connect Gateway association
 * @param directConnectGatewayId
 * @returns
 */
async function getDxAttachmentId(directConnectGatewayId: string): Promise<string> {
  const ec2 = new AWS.EC2();
  let nextToken: string | undefined = undefined;
  let attachmentId: string | undefined = undefined;

  // Get transit gateway attachment ID
  do {
    const page = await throttlingBackOff(() =>
      ec2
        .describeTransitGatewayAttachments({
          Filters: [{ Name: 'resource-id', Values: [directConnectGatewayId] }],
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

async function sleep(ms: number) {
  return new Promise(f => setTimeout(f, ms));
}

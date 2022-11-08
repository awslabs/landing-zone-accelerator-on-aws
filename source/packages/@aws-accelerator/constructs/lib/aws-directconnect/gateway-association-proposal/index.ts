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
 * direct-connect-gateway-association-proposal - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string;
      Status: string;
    }
  | undefined
> {
  // Set variables
  const allowedPrefixesInitial: string[] = event.ResourceProperties['allowedPrefixes'];
  const directConnectGatewayId: string = event.ResourceProperties['directConnectGatewayId'];
  const directConnectGatewayOwnerAccount: string = event.ResourceProperties['directConnectGatewayOwnerAccount'];
  const solutionId = process.env['SOLUTION_ID'];
  const dx = new AWS.DirectConnect({ customUserAgent: solutionId });
  const gatewayId: string = event.ResourceProperties['gatewayId'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const allowedPrefixes = allowedPrefixesInitial.map(item => {
        return { cidr: item };
      });
      // Create gateway association
      const response = await throttlingBackOff(() =>
        dx
          .createDirectConnectGatewayAssociationProposal({
            directConnectGatewayId,
            directConnectGatewayOwnerAccount,
            addAllowedPrefixesToDirectConnectGateway: allowedPrefixes,
            gatewayId,
          })
          .promise(),
      );
      const associationId = response.directConnectGatewayAssociationProposal?.proposalId;

      // Validate associationId exists
      if (!associationId) {
        throw new Error(
          `Unable to associate Direct Connect Gateway ${directConnectGatewayId} with gateway ${gatewayId}`,
        );
      }

      return {
        PhysicalResourceId: associationId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      await throttlingBackOff(() =>
        dx.deleteDirectConnectGatewayAssociationProposal({ proposalId: event.PhysicalResourceId }).promise(),
      );

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

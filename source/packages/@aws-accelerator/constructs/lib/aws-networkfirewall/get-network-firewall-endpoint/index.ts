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

AWS.config.logger = console;

/**
 * get-network-firewall-endpoint - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  // Set variables passed in event
  const endpointAz: string = event.ResourceProperties['endpointAz'];
  const firewallArn: string = event.ResourceProperties['firewallArn'];
  const region: string = event.ResourceProperties['region'];
  const solutionId = process.env['SOLUTION_ID'];

  const nfwClient = new AWS.NetworkFirewall({ region: region, customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      let endpointId: string | undefined = undefined;
      const response = await throttlingBackOff(() =>
        nfwClient.describeFirewall({ FirewallArn: firewallArn }).promise(),
      );

      // Check for endpoint in specified AZ
      if (response.FirewallStatus?.SyncStates) {
        endpointId = response.FirewallStatus?.SyncStates[endpointAz].Attachment?.EndpointId;
      }

      if (endpointId) {
        return {
          PhysicalResourceId: endpointId,
          Status: 'SUCCESS',
        };
      } else {
        throw new Error(`Unable to locate Network Firewall endpoint in AZ ${endpointAz}`);
      }

    case 'Delete':
      // Do nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

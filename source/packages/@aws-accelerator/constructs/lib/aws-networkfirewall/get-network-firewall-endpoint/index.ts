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

import { DescribeAvailabilityZonesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { DescribeFirewallCommand, NetworkFirewallClient } from '@aws-sdk/client-network-firewall';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
/**
 * get-network-firewall-endpoint - lambda handler
 *
 * @param event
 * @returns
 */

export async function handler(event: CloudFormationCustomResourceEvent): Promise<
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

  const ec2Client = new EC2Client({ customUserAgent: solutionId });
  const nfwClient = new NetworkFirewallClient({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const logicalZoneName = await getAvailabilityZone(ec2Client, endpointAz, region);
      let endpointId: string | undefined = undefined;

      try {
        const response = await throttlingBackOff(() =>
          nfwClient.send(new DescribeFirewallCommand({ FirewallArn: firewallArn })),
        );
        //
        // Check for endpoint in specified AZ
        if (response.FirewallStatus?.SyncStates) {
          endpointId = response.FirewallStatus.SyncStates[logicalZoneName].Attachment?.EndpointId;
        }
        //
        // Validate endpoint ID
        if (!endpointId) {
          throw new Error(`Unable to locate Network Firewall endpoint in AZ ${endpointAz}`);
        }

        return {
          PhysicalResourceId: endpointId,
          Status: 'SUCCESS',
        };
      } catch (e) {
        throw new Error(`Error retrieving Network Firewall endpoint: ${e}`);
      }

    case 'Delete':
      // Do nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Returns the logical zone name for the specified AZ
 * @param ec2Client
 * @param endpointAz
 * @param region
 * @returns
 */
async function getAvailabilityZone(ec2Client: EC2Client, endpointAz: string, region: string): Promise<string> {
  if (endpointAz.includes(region)) {
    return endpointAz;
  }

  try {
    const response = await throttlingBackOff(() =>
      ec2Client.send(
        new DescribeAvailabilityZonesCommand({
          ZoneIds: [endpointAz],
        }),
      ),
    );
    //
    // Validate response
    if (!response.AvailabilityZones) {
      throw new Error(`Unable to retrieve details for AZ ${endpointAz}`);
    }
    if (!response.AvailabilityZones[0].ZoneName) {
      throw new Error(`Unable to retrieve logical zone name for AZ ${endpointAz}`);
    }
    return response.AvailabilityZones[0].ZoneName;
  } catch (e) {
    throw new Error(`Error retrieving logical zone name: ${e}`);
  }
}

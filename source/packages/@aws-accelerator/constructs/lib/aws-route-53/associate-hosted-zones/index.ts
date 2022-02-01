/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { throttlingBackOff } from '@aws-accelerator/utils';
import { EC2Client, paginateDescribeVpcs } from '@aws-sdk/client-ec2';
import {
  AssociateVPCWithHostedZoneCommand,
  CreateVPCAssociationAuthorizationCommand,
  DeleteVPCAssociationAuthorizationCommand,
  GetHostedZoneCommand,
  Route53Client,
} from '@aws-sdk/client-route-53';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

/**
 * associate-hosted-zones - lambda handler
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
  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const accountIds: string[] = event.ResourceProperties['accountIds'];
      const hostedZoneIds: string[] = event.ResourceProperties['hostedZoneIds'];
      const hostedZoneAccountId = event.ResourceProperties['hostedZoneAccountId'];
      const partition = event.ResourceProperties['partition'];
      const region = event.ResourceProperties['region'];
      const roleName = event.ResourceProperties['roleName'];
      const tagFilters: {
        key: string;
        value: string;
      }[] = event.ResourceProperties['tagFilters'];

      // Loop through all the associated accounts
      for (const accountId of accountIds ?? []) {
        //
        // Create clients
        //
        let targetEc2Client: EC2Client;
        let targetRoute53Client: Route53Client;
        const hostedZoneRoute53Client: Route53Client = new Route53Client({});

        if (accountId === hostedZoneAccountId) {
          console.log('Running in hosted zone account, create local clients');
          targetEc2Client = new EC2Client({});
          targetRoute53Client = new Route53Client({});
        } else {
          console.log('Not running in hosted zone account, assume role to create clients');
          const stsClient = new STSClient({});
          const assumeRoleResponse = await throttlingBackOff(() =>
            stsClient.send(
              new AssumeRoleCommand({
                RoleArn: `arn:${partition}:iam::${accountId}:role/${roleName}`,
                RoleSessionName: 'AssociateHostedZone',
              }),
            ),
          );

          targetEc2Client = new EC2Client({
            credentials: {
              accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
              secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
              sessionToken: assumeRoleResponse.Credentials?.SessionToken,
            },
          });

          targetRoute53Client = new Route53Client({
            credentials: {
              accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
              secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
              sessionToken: assumeRoleResponse.Credentials?.SessionToken,
            },
          });
        }

        //
        // Find all the VPCs in the account to create associations
        //
        for await (const page of paginateDescribeVpcs({ client: targetEc2Client }, {})) {
          for (const vpc of page.Vpcs ?? []) {
            console.log(`Checking vpc: ${vpc.VpcId}`);
            console.log('Tags:');
            console.log(vpc.Tags);

            // Verify all tag filters are present for the VPC
            let includeVpc = true;
            tagFilters.forEach(tagFilter => {
              if (!vpc.Tags?.find(tagItem => tagItem.Key === tagFilter.key && tagItem.Value == tagFilter.value)) {
                includeVpc = false;
              }
            });

            if (includeVpc) {
              // Create the association for each hosted zone
              for (const hostedZoneId of hostedZoneIds ?? []) {
                // Check if vpc is already connected to the HostedZone
                const response = await throttlingBackOff(() =>
                  hostedZoneRoute53Client.send(new GetHostedZoneCommand({ Id: hostedZoneId })),
                );
                if (response.VPCs?.find(item => item.VPCId === vpc.VpcId && item.VPCRegion === region)) {
                  console.log(`${vpc.VpcId} is already attached to the hosted zone ${hostedZoneId}`);
                  continue;
                }

                const hostedZoneProps = {
                  HostedZoneId: hostedZoneId,
                  VPC: {
                    VPCId: vpc.VpcId,
                    VPCRegion: region,
                  },
                };

                // authorize association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
                if (accountId !== hostedZoneAccountId) {
                  await throttlingBackOff(() =>
                    hostedZoneRoute53Client.send(new CreateVPCAssociationAuthorizationCommand(hostedZoneProps)),
                  );
                }

                // associate VPC with Hosted zones
                console.log(`Associating hosted zone ${hostedZoneId} with VPC ${vpc.VpcId}...`);
                await throttlingBackOff(() =>
                  targetRoute53Client.send(new AssociateVPCWithHostedZoneCommand(hostedZoneProps)),
                );

                // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
                if (accountId !== hostedZoneAccountId) {
                  await throttlingBackOff(() =>
                    hostedZoneRoute53Client.send(new DeleteVPCAssociationAuthorizationCommand(hostedZoneProps)),
                  );
                }
              }
            }
          }
        }
      }

      return {
        PhysicalResourceId: 'associate-hosted-zones',
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

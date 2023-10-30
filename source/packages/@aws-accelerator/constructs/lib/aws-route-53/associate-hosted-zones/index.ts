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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

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
  const solutionId = process.env['SOLUTION_ID'];

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
        let targetEc2Client: AWS.EC2;
        let targetRoute53Client: AWS.Route53;
        const hostedZoneRoute53Client: AWS.Route53 = new AWS.Route53({ customUserAgent: solutionId });

        if (accountId === hostedZoneAccountId) {
          console.log('Running in hosted zone account, create local clients');
          targetEc2Client = new AWS.EC2({ customUserAgent: solutionId });
          targetRoute53Client = new AWS.Route53({ customUserAgent: solutionId });
        } else {
          console.log('Not running in hosted zone account, assume role to create clients');
          const stsClient = new AWS.STS({ customUserAgent: solutionId, region: region });
          const assumeRoleResponse = await throttlingBackOff(() =>
            stsClient
              .assumeRole({
                RoleArn: `arn:${partition}:iam::${accountId}:role/${roleName}`,
                RoleSessionName: 'AssociateHostedZone',
              })
              .promise(),
          );

          targetEc2Client = new AWS.EC2({
            credentials: {
              accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
              secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
              sessionToken: assumeRoleResponse.Credentials?.SessionToken,
            },
            customUserAgent: solutionId,
          });

          targetRoute53Client = new AWS.Route53({
            credentials: {
              accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
              secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
              sessionToken: assumeRoleResponse.Credentials?.SessionToken,
            },
            customUserAgent: solutionId,
          });
        }

        //
        // Find all the VPCs in the account to create associations
        //
        let nextToken: string | undefined = undefined;
        do {
          const page = await throttlingBackOff(() => targetEc2Client.describeVpcs({ NextToken: nextToken }).promise());
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
                  hostedZoneRoute53Client.getHostedZone({ Id: hostedZoneId }).promise(),
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
                    hostedZoneRoute53Client.createVPCAssociationAuthorization(hostedZoneProps).promise(),
                  );
                }

                // associate VPC with Hosted zones
                console.log(`Associating hosted zone ${hostedZoneId} with VPC ${vpc.VpcId}...`);
                await throttlingBackOff(() =>
                  targetRoute53Client.associateVPCWithHostedZone(hostedZoneProps).promise(),
                );

                // delete association of VPC with Hosted zones when VPC and Hosted Zones are defined in two different accounts
                if (accountId !== hostedZoneAccountId) {
                  await throttlingBackOff(() =>
                    hostedZoneRoute53Client.deleteVPCAssociationAuthorization(hostedZoneProps).promise(),
                  );
                }
              }
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);
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

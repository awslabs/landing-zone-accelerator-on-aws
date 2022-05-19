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
 * get-transit-gateway-attachment - lambda handler
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
  const name = event.ResourceProperties['name'];
  const transitGatewayId = event.ResourceProperties['transitGatewayId'];
  const roleArn = event.ResourceProperties['roleArn'];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const stsClient = new AWS.STS({});

      const assumeRoleResponse = await throttlingBackOff(() =>
        stsClient
          .assumeRole({
            RoleArn: roleArn,
            RoleSessionName: 'GetTransitGatewayAttachmentSession',
          })
          .promise(),
      );

      const ec2Client = new AWS.EC2({
        credentials: {
          accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
          secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
          sessionToken: assumeRoleResponse.Credentials?.SessionToken,
        },
      });

      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          ec2Client.describeTransitGatewayAttachments({ NextToken: nextToken }).promise(),
        );
        for (const attachment of page.TransitGatewayAttachments ?? []) {
          if (attachment.TransitGatewayId === transitGatewayId && attachment.State === 'available') {
            const nameTag = attachment.Tags?.find(t => t.Key === 'Name');
            if (nameTag && nameTag.Value === name) {
              console.log(attachment);
              return {
                PhysicalResourceId: attachment.TransitGatewayAttachmentId,
                Status: 'SUCCESS',
              };
            }
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      throw new Error(`Attachment ${name} for ${transitGatewayId} not found`);

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

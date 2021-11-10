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
import { EC2Client, paginateDescribeTransitGatewayAttachments } from '@aws-sdk/client-ec2';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

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
      const stsClient = new STSClient({});

      const assumeRoleResponse = await throttlingBackOff(() =>
        stsClient.send(
          new AssumeRoleCommand({
            RoleArn: roleArn,
            RoleSessionName: 'GetTransitGatewayAttachmentSession',
          }),
        ),
      );

      const ec2Client = new EC2Client({
        credentials: {
          accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
          secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
          sessionToken: assumeRoleResponse.Credentials?.SessionToken,
        },
      });

      for await (const page of paginateDescribeTransitGatewayAttachments({ client: ec2Client }, {})) {
        for (const attachment of page.TransitGatewayAttachments ?? []) {
          if (attachment.TransitGatewayId === transitGatewayId) {
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
      }

      throw new Error(`Attachment ${name} for ${transitGatewayId} not found`);

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

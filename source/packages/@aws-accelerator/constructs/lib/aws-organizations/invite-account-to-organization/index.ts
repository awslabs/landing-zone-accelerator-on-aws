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
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * invite-account-to-organization - lambda handler
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
      const accountId = event.ResourceProperties['accountId'];
      const roleArn = event.ResourceProperties['roleArn'];
      const partition = event.ResourceProperties['partition'];

      //
      // Obtain an Organizations client
      //
      let organizationsClient: AWS.Organizations;
      if (partition === 'aws-us-gov') {
        organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
      } else {
        organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
      }

      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.listAccounts({ NextToken: nextToken }).promise(),
        );
        for (const item of page.Accounts ?? []) {
          if (item.Id === accountId) {
            console.log(`Account ${accountId} already added to organization`);
            if (item.Status)
              return {
                PhysicalResourceId: accountId,
                Status: 'SUCCESS',
              };
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      // Account was not found, invite it
      console.log('InviteAccountToOrganizationCommand');
      const invite = await throttlingBackOff(() =>
        organizationsClient.inviteAccountToOrganization({ Target: { Type: 'ACCOUNT', Id: accountId } }).promise(),
      );
      console.log(invite);
      console.log(`Invite handshake id: ${invite.Handshake?.Id}`);

      const stsClient = new AWS.STS({});

      const assumeRoleResponse = await throttlingBackOff(() =>
        stsClient.assumeRole({ RoleArn: roleArn, RoleSessionName: 'AcceptHandshakeSession' }).promise(),
      );

      if (partition === 'aws-us-gov') {
        organizationsClient = new AWS.Organizations({
          credentials: {
            accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
            secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
            sessionToken: assumeRoleResponse.Credentials?.SessionToken,
          },
        });
      } else {
        organizationsClient = new AWS.Organizations({
          credentials: {
            accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
            secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
            sessionToken: assumeRoleResponse.Credentials?.SessionToken,
          },
          region: 'us-east-1',
        });
      }

      console.log('AcceptHandshakeCommand');
      const response = await throttlingBackOff(() =>
        organizationsClient.acceptHandshake({ HandshakeId: invite.Handshake!.Id! }).promise(),
      );
      console.log(response);

      return {
        PhysicalResourceId: accountId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing, leave Policy Type enabled
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

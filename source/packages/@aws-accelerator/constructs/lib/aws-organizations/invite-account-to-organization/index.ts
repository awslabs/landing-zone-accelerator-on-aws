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
import {
  DescribeOrganizationCommand,
  EnablePolicyTypeCommand,
  InviteAccountToOrganizationCommand,
  OrganizationsClient,
  paginateListRoots,
  paginateListAccounts,
  AcceptHandshakeCommand,
} from '@aws-sdk/client-organizations';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

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

      //
      // Obtain an Organizations client
      //
      let organizationsClient: OrganizationsClient = new OrganizationsClient({});

      for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
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
      }

      // Account was not found, invite it
      console.log('InviteAccountToOrganizationCommand');
      const invite = await throttlingBackOff(() =>
        organizationsClient.send(
          new InviteAccountToOrganizationCommand({
            Target: {
              Type: 'ACCOUNT',
              Id: accountId,
            },
          }),
        ),
      );
      console.log(invite);
      console.log(`Invite handshake id: ${invite.Handshake?.Id}`);

      const stsClient = new STSClient({});

      const assumeRoleResponse = await throttlingBackOff(() =>
        stsClient.send(
          new AssumeRoleCommand({
            RoleArn: roleArn,
            RoleSessionName: 'AcceptHandshakeSession',
          }),
        ),
      );

      organizationsClient = new OrganizationsClient({
        credentials: {
          accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
          secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
          sessionToken: assumeRoleResponse.Credentials?.SessionToken,
        },
      });

      console.log('AcceptHandshakeCommand');
      const response = await throttlingBackOff(() =>
        organizationsClient.send(
          new AcceptHandshakeCommand({
            HandshakeId: invite.Handshake?.Id,
          }),
        ),
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

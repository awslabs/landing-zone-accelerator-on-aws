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

import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  AcceptResourceShareInvitationCommand,
  GetResourceShareInvitationsCommand,
  GetResourceSharesCommand,
  RAMClient,
  ResourceOwner,
  ResourceShareInvitationStatus,
} from '@aws-sdk/client-ram';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * get-resource-share - lambda handler
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
  const ramClient = new RAMClient({
    customUserAgent: process.env['SOLUTION_ID'],
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const resourceOwner = event.ResourceProperties['resourceOwner'];
      const owningAccountId = event.ResourceProperties['owningAccountId'];
      const name = event.ResourceProperties['name'];

      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          ramClient.send(new GetResourceShareInvitationsCommand({ nextToken })),
        );
        for (const resourceShareInvitation of page.resourceShareInvitations ?? []) {
          if (
            resourceShareInvitation.status == ResourceShareInvitationStatus.PENDING &&
            resourceShareInvitation.senderAccountId == owningAccountId &&
            resourceShareInvitation.resourceShareName === name
          ) {
            console.log(resourceShareInvitation);
            await throttlingBackOff(() =>
              ramClient.send(
                new AcceptResourceShareInvitationCommand({
                  resourceShareInvitationArn: resourceShareInvitation.resourceShareInvitationArn!,
                }),
              ),
            );

            const found = await validateResourceShare(ramClient, owningAccountId, name, resourceOwner);

            if (found == false) {
              throw new Error(`Resource share ${name} not accepted successfully`); //share not found after multiple attempts
            }
          }
          nextToken = page.nextToken;
        }
      } while (nextToken);
      nextToken = undefined;
      do {
        const page = await throttlingBackOff(() =>
          ramClient.send(new GetResourceSharesCommand({ resourceOwner, nextToken: nextToken })),
        );
        for (const resourceShare of page.resourceShares ?? []) {
          if (resourceShare.owningAccountId == owningAccountId && resourceShare.name === name) {
            console.log(resourceShare);
            if (resourceShare.resourceShareArn) {
              return {
                PhysicalResourceId: resourceShare.resourceShareArn.split('/')[1],
                Status: 'SUCCESS',
              };
            }
          }
        }
        nextToken = page.nextToken;
      } while (nextToken);

      throw new Error(`Resource share ${name} not found`);

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

async function validateResourceShare(
  ramClient: RAMClient,
  owningAccountId: string,
  name: string,
  resourceOwner?: ResourceOwner,
): Promise<boolean | undefined> {
  let found = false;
  let counter = 5;
  do {
    const nextTokenShare: string | undefined = undefined;
    const pageResoureShares = await throttlingBackOff(() =>
      ramClient.send(new GetResourceSharesCommand({ resourceOwner, nextToken: nextTokenShare })),
    );
    if (pageResoureShares.resourceShares === undefined || pageResoureShares.resourceShares.length == 0) {
      await delay(5000); //delay 5 seconds and try again, no shares found
      console.log('resource share not found, waiting 5 seconds');
      counter = counter - 1;
      continue;
    } else {
      for (const resourceShare of pageResoureShares.resourceShares ?? []) {
        if (resourceShare.owningAccountId == owningAccountId && resourceShare.name === name) {
          found = true;
          break;
        }
      }
    }
    await delay(5000); //delay 5 seconds and try again, share not found
    console.log('resource share not found, waiting 5 seconds');
    counter = counter - 1;
  } while (found == false && counter >= 0);

  return found;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

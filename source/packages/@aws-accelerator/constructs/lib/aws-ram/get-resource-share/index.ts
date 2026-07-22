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
import { delay, throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  AcceptResourceShareInvitationCommand,
  GetResourceShareInvitationsCommand,
  GetResourceSharesCommand,
  RAMClient,
  ResourceOwner,
  ResourceShareInvitationStatus,
} from '@aws-sdk/client-ram';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

const MAX_ATTEMPTS = 6;

/**
 * Determines whether an error is the transient `UnauthorizedException` that RAM
 * raises while a freshly created resource share is still propagating to the
 * target account (eventual consistency), as opposed to a genuine IAM/config error.
 *
 * @param e error thrown by a RAM API call
 * @returns true if the error is a RAM `UnauthorizedException`
 */
function isUnauthorizedException(e: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = e as any;
  return err?.name === 'UnauthorizedException' || err?.code === 'UnauthorizedException';
}

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

      // RAM resource shares are eventually consistent: a freshly created share may
      // not yet have propagated to the target account, and the first invitation
      // fetch can fail with a transient `UnauthorizedException` (a timing signal
      // from RAM, not an IAM problem). Retry the invitation fetch/accept flow with
      // a bounded quadratic backoff (0, 1, 4, 9, 16, 25 s) before giving up, mirroring
      // the sibling get-resource-share-item Lambda. Non-transient errors are not
      // retried, and a persistent UnauthorizedException still surfaces after the
      // retry window so genuine errors are never masked.
      let lastError: unknown = undefined;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        await delay(attempt ** 2 * 1000);
        try {
          await fetchAndAcceptInvitations(ramClient, owningAccountId, name, resourceOwner);
          lastError = undefined;
          break;
        } catch (e) {
          if (!isUnauthorizedException(e)) {
            throw e;
          }
          lastError = e;
          console.log(
            `RAM resource share not yet propagated (UnauthorizedException) on attempt ${
              attempt + 1
            }/${MAX_ATTEMPTS}, retrying`,
          );
        }
      }
      if (lastError) {
        throw lastError;
      }

      let nextToken: string | undefined = undefined;
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

/**
 * Fetches pending resource share invitations and accepts any that match the
 * owning account and share name, validating each accepted share.
 *
 * @param ramClient RAM client
 * @param owningAccountId account that owns (shared) the resource share
 * @param name resource share name
 * @param resourceOwner resource owner filter for share lookups
 */
async function fetchAndAcceptInvitations(
  ramClient: RAMClient,
  owningAccountId: string,
  name: string,
  resourceOwner?: ResourceOwner,
): Promise<void> {
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => ramClient.send(new GetResourceShareInvitationsCommand({ nextToken })));
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

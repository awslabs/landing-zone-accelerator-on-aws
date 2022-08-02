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
 * attach-policy - lambda handler
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
  const policyId: string = event.ResourceProperties['policyId'];
  const targetId: string = event.ResourceProperties['targetId'] ?? undefined;
  const type: string = event.ResourceProperties['type'];
  const partition: string = event.ResourceProperties['partition'];

  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }

  let nextToken: string | undefined = undefined;

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      //
      // Check if already exists, update and return the ID
      //
      do {
        const page: AWS.Organizations.ListPoliciesForTargetResponse = await getListPoliciesForTarget(
          organizationsClient,
          type,
          targetId,
          nextToken,
        );
        for (const policy of page.Policies ?? []) {
          if (policy.Id === policyId) {
            console.log('Policy already attached');
            return {
              PhysicalResourceId: `${policyId}_${targetId}`,
              Status: 'SUCCESS',
            };
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      //
      // Create if not found
      //
      await throttlingBackOff(() =>
        organizationsClient.attachPolicy({ PolicyId: policyId, TargetId: targetId }).promise(),
      );

      return {
        PhysicalResourceId: `${policyId}_${targetId}`,
        Status: 'SUCCESS',
      };

    case 'Delete':
      //
      // Detach policy, let CDK manage where it's deployed,
      //
      // do not remove FullAWSAccess
      if (policyId !== 'p-FullAWSAccess') {
        do {
          const page: AWS.Organizations.ListPoliciesForTargetResponse = await getListPoliciesForTarget(
            organizationsClient,
            type,
            targetId,
            nextToken,
          );
          for (const policy of page.Policies ?? []) {
            if (policy.Id === policyId) {
              await throttlingBackOff(() =>
                organizationsClient.detachPolicy({ PolicyId: policyId, TargetId: targetId }).promise(),
              );
            }
          }
          nextToken = page.NextToken;
        } while (nextToken);
      }

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

async function getListPoliciesForTarget(
  organizationsClient: AWS.Organizations,
  type: string,
  targetId: string,
  nextToken?: string,
): Promise<AWS.Organizations.ListPoliciesForTargetResponse> {
  return throttlingBackOff(() =>
    organizationsClient.listPoliciesForTarget({ Filter: type, TargetId: targetId, NextToken: nextToken }).promise(),
  );
}

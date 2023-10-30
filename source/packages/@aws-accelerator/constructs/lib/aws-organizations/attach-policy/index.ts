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
  const strategy: string = event.ResourceProperties['strategy'];
  const partition: string = event.ResourceProperties['partition'];
  const configPolicyNames: string[] = event.ResourceProperties['configPolicyNames'];
  const policyTagKey: string = event.ResourceProperties['policyTagKey'];
  const solutionId = process.env['SOLUTION_ID'];

  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1', customUserAgent: solutionId });
  } else if (partition === 'aws-cn') {
    organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1', customUserAgent: solutionId });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1', customUserAgent: solutionId });
  }

  let nextToken: string | undefined = undefined;

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      //
      // First detach all non config policies from target
      //
      await detachNonConfigPolicies(organizationsClient, targetId, configPolicyNames, policyTagKey);

      //
      // Check if already exists, update and return the ID
      //
      let policyAttached = false;
      let fullAwsAccessPolicyAttached = false;
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
            policyAttached = true;
            continue;
          }
          if (policy.Id === 'p-FullAWSAccess') {
            console.log('FullAWSAccess policy attached');
            fullAwsAccessPolicyAttached = true;
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      //
      // Create if not found
      //
      if (!policyAttached) {
        await throttlingBackOff(() =>
          organizationsClient.attachPolicy({ PolicyId: policyId, TargetId: targetId }).promise(),
        );
      }

      // if SCP strategy is allow-list, then FullAWSAccess policy should be detached
      if (strategy === 'allow-list' && fullAwsAccessPolicyAttached) {
        console.log('detaching FullAWSAccess policy because the strategy is allow-list');
        await throttlingBackOff(() =>
          organizationsClient.detachPolicy({ PolicyId: 'p-FullAWSAccess', TargetId: targetId }).promise(),
        );
      }

      // if SCP strategy is changed from allow-list to deny list, then FullAWSAccess policy should be attached
      if (strategy === 'deny-list' && !fullAwsAccessPolicyAttached) {
        console.log('attaching FullAWSAccess policy because the strategy is deny-list');
        await throttlingBackOff(() =>
          organizationsClient.detachPolicy({ PolicyId: 'p-FullAWSAccess', TargetId: targetId }).promise(),
        );
      }

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

async function detachNonConfigPolicies(
  organizationsClient: AWS.Organizations,
  targetId: string,
  configPolicyNames: string[],
  policyTagKey: string,
): Promise<void> {
  console.log(`Detaching non config policies from target ${targetId}`);
  console.log(`Config policies are ${configPolicyNames.join(',')}`);
  const attachedPolicies: { name: string; id: string }[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient
        .listPoliciesForTarget({ Filter: 'SERVICE_CONTROL_POLICY', TargetId: targetId, NextToken: nextToken })
        .promise(),
    );
    for (const policy of page.Policies ?? []) {
      attachedPolicies.push({ name: policy.Name!, id: policy.Id! });
    }
    nextToken = page.NextToken;
  } while (nextToken);

  const attachedPolicyNames: string[] = [];
  for (const attachedPolicy of attachedPolicies) {
    attachedPolicyNames.push(attachedPolicy.name);
  }
  console.log(`Existing attached polices are [${attachedPolicyNames.join(',')}]`);

  const removePolicies = attachedPolicies.filter(item => configPolicyNames.indexOf(item.name) === -1);

  const removePolicyNames: string[] = [];
  const removeLzaPolicies: { name: string; id: string }[] = [];
  for (const removePolicy of removePolicies) {
    if (await isLzaManagedPolicy(organizationsClient, removePolicy.id, policyTagKey)) {
      removePolicyNames.push(removePolicy.name);
      removeLzaPolicies.push(removePolicy);
    }
  }

  console.log(`Polices to be detached [${removePolicyNames.join(',')}]`);

  for (const removeLzaPolicy of removeLzaPolicies) {
    console.log(`Detaching ${removeLzaPolicy.name} policy from ${targetId} target`);
    try {
      await throttlingBackOff(() =>
        organizationsClient.detachPolicy({ PolicyId: removeLzaPolicy.id, TargetId: targetId }).promise(),
      );
      console.log(`${removeLzaPolicy.name} policy detached successfully from ${targetId} target`);
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (
        // SDKv2 Error Structure
        e.code === 'PolicyNotAttachedException' ||
        // SDKv3 Error Structure
        e.name === 'PolicyNotAttachedException'
      ) {
        console.log(`${removeLzaPolicy.name} policy not found to detach`);
      } else {
        throw new Error(`Policy detach error message - ${e}`);
      }
    }
  }
}

/**
 * Function to check if policy is managed by LZA, this is by checking lzaManaged tag with Yes value
 * @param policyId
 * @returns
 */
async function isLzaManagedPolicy(
  organizationsClient: AWS.Organizations,
  policyId: string,
  policyTagKey: string,
): Promise<boolean> {
  if (policyId === 'p-FullAWSAccess') {
    return false;
  }

  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient
        .listTagsForResource({
          ResourceId: policyId,
          NextToken: nextToken,
        })
        .promise(),
    );
    for (const tag of page.Tags ?? []) {
      if (tag.Key === policyTagKey && tag.Value === 'Yes') {
        return true;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return false;
}

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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy, getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import {
  OrganizationsClient,
  paginateListTagsForResource,
  PolicyNotAttachedException,
  PolicyNotFoundException,
  DetachPolicyCommand,
  paginateListPoliciesForTarget,
  paginateListPolicies,
  AttachPolicyCommand,
  DuplicatePolicyAttachmentException,
  PolicyType,
} from '@aws-sdk/client-organizations';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * attach-policy - lambda handler
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
  const policyId: string = event.ResourceProperties['policyId'];
  const targetId: string = event.ResourceProperties['targetId'] ?? undefined;
  const type: string = event.ResourceProperties['type'];
  const strategy: string = event.ResourceProperties['strategy'];
  const partition: string = event.ResourceProperties['partition'];
  const configPolicyNames: string[] = event.ResourceProperties['configPolicyNames'];
  const policyTagKey: string = event.ResourceProperties['policyTagKey'];
  const globalRegion = getGlobalRegion(partition);

  const solutionId = process.env['SOLUTION_ID'];
  const organizationsClient = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Any configured AWS Organization Service Control Policies (SCPs) are also created and attached to configuration-specified deployment targets in accounts stage in global region

      //
      // First detach all non config policies from target
      //
      await detachNonConfigPolicies(organizationsClient, targetId, configPolicyNames, policyTagKey);

      //
      // Check if already exists, update and return the ID
      //
      const attachedPolicies = await getListPoliciesForTarget(organizationsClient, type, targetId);

      // check if policyId exists in attachedPolicies id
      const policyAttached = attachedPolicies?.some(p => p.id === policyId);
      const fullAwsAccessPolicyAttached = attachedPolicies?.some(p => p.id === 'p-FullAWSAccess');

      // Attach if not attached already.
      if (!policyAttached) {
        await attachSpecificPolicy(organizationsClient, policyId, targetId);
      }

      // if SCP strategy is allow-list, then FullAWSAccess policy should be detached
      if (strategy === 'allow-list' && fullAwsAccessPolicyAttached) {
        console.log('detaching FullAWSAccess policy because the strategy is allow-list');
        await detachSpecificPolicy(organizationsClient, 'p-FullAWSAccess', targetId);
      }

      // if SCP strategy is changed from allow-list to deny list, then FullAWSAccess policy should be attached
      if (strategy === 'deny-list' && !fullAwsAccessPolicyAttached) {
        console.log('attaching FullAWSAccess policy because the strategy is deny-list');
        await attachSpecificPolicy(organizationsClient, 'p-FullAWSAccess', targetId);
      }

      return {
        PhysicalResourceId: `${policyId}_${targetId}`,
        Status: 'SUCCESS',
      };

    case 'Delete':
      //
      // Detach policy, let CDK manage where it's deployed,
      //
      // do not remove FullAWSAccess and do nothing for NoOperation
      if (
        !['p-FullAWSAccess', 'NoOperation'].includes(policyId) &&
        // check the org to see if the policy is present
        // policy id can change due to out of band change
        // if no policy is found, no action should be taken
        (await isPolicyInOrg(policyId, type, organizationsClient))
      ) {
        const attachedPolicies = await getListPoliciesForTarget(organizationsClient, type, targetId);
        await detachPolicyFromSpecificTarget(attachedPolicies, targetId, organizationsClient, policyTagKey);
      }

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

async function isPolicyInOrg(policyId: string, type: string, organizationsClient: OrganizationsClient) {
  for await (const page of paginateListPolicies({ client: organizationsClient }, { Filter: type as PolicyType })) {
    for (const policy of page.Policies ?? []) {
      if (policy.Id === policyId) {
        return true;
      }
    }
  }
  // went through all policies and did not find that policy ID, return false
  return false;
}

async function detachSpecificPolicy(organizationsClient: OrganizationsClient, policyId: string, targetId: string) {
  try {
    await throttlingBackOff(() =>
      organizationsClient.send(new DetachPolicyCommand({ PolicyId: policyId, TargetId: targetId })),
    );
  } catch (error: unknown) {
    // Swallow the error if it's PolicyNotAttachedException
    // The policy might already be detached by other attach-policy custom resource concurrently.
    if (error instanceof PolicyNotAttachedException) {
      console.log(`Policy: ${policyId} was not attached. Continuing...`);
    } else if (error instanceof PolicyNotFoundException) {
      // if policy was recreated outside of accelerator
      // incoming policy will have a unique ID which is not the org and throw this exception
      // ignore it and proceed with next step
      console.log('Policy: ${policyId} was not found. Continuing...');
    } else {
      throw new Error(`Error while trying to detach policy: ${policyId}. Error message: ${JSON.stringify(error)}`);
    }
  }
}
async function attachSpecificPolicy(organizationsClient: OrganizationsClient, policyId: string, targetId: string) {
  try {
    await throttlingBackOff(() =>
      organizationsClient.send(new AttachPolicyCommand({ PolicyId: policyId, TargetId: targetId })),
    );
  } catch (error: unknown) {
    if (error instanceof DuplicatePolicyAttachmentException) {
      console.log('Policy already attached. Continuing...');
    } else {
      throw new Error(`Error while trying to attach policy: ${policyId}. Error message: ${JSON.stringify(error)}`);
    }
  }
}

async function getListPoliciesForTarget(organizationsClient: OrganizationsClient, type: string, targetId: string) {
  const attachedPolicies: { name: string; id: string }[] = [];
  for await (const page of paginateListPoliciesForTarget(
    { client: organizationsClient },
    { Filter: type as PolicyType, TargetId: targetId },
  )) {
    attachedPolicies.push(...(page.Policies! ?? []).map(p => ({ name: p.Name!, id: p.Id! })));
  }
  return attachedPolicies;
}

async function detachNonConfigPolicies(
  organizationsClient: OrganizationsClient,
  targetId: string,
  configPolicyNames: string[],
  policyTagKey: string,
): Promise<void> {
  console.log(`Detaching non config policies from target ${targetId}`);
  console.log(`Config policies are ${configPolicyNames.join(',')}`);
  const attachedPolicies = await getListPoliciesForTarget(organizationsClient, 'SERVICE_CONTROL_POLICY', targetId);

  const attachedPolicyNames: string[] = [];
  for (const attachedPolicy of attachedPolicies) {
    attachedPolicyNames.push(attachedPolicy.name);
  }
  console.log(`Existing attached polices are [${attachedPolicyNames.join(',')}]`);

  const removePolicies = attachedPolicies.filter(item => configPolicyNames.indexOf(item.name) === -1);

  await detachPolicyFromSpecificTarget(removePolicies, targetId, organizationsClient, policyTagKey);
}

async function detachPolicyFromSpecificTarget(
  removeLzaPolicies: { name: string; id: string }[],
  targetId: string,
  organizationsClient: OrganizationsClient,
  policyTagKey: string,
) {
  for (const removeLzaPolicy of removeLzaPolicies) {
    // only remove policies that are managed by LZA
    if (await isLzaManagedPolicy(organizationsClient, removeLzaPolicy.id, policyTagKey)) {
      console.log(`Detaching ${removeLzaPolicy.name} policy from ${targetId} target`);
      await detachSpecificPolicy(organizationsClient, removeLzaPolicy.id, targetId);
    }
  }
}

/**
 * Function to check if policy is managed by LZA, this is by checking lzaManaged tag with Yes value
 * @param policyId
 * @returns
 */
async function isLzaManagedPolicy(
  organizationsClient: OrganizationsClient,
  policyId: string,
  policyTagKey: string,
): Promise<boolean> {
  // keep full access and operations that were imported by createPolicy called NoOperation
  if (policyId === 'p-FullAWSAccess' || policyId === 'NoOperation') {
    return false;
  }
  for await (const page of paginateListTagsForResource({ client: organizationsClient }, { ResourceId: policyId })) {
    for (const tag of page.Tags ?? []) {
      if (tag.Key === policyTagKey && tag.Value === 'Yes') {
        return true;
      }
    }
  }
  return false;
}

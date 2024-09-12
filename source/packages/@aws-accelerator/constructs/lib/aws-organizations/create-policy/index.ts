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

import { setRetryStrategy, getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import {
  OrganizationsClient,
  Tag,
  paginateListPolicies,
  DeletePolicyCommand,
  paginateListTargetsForPolicy,
  DetachPolicyCommand,
  PolicyNotAttachedException,
  PolicyNotFoundException,
  CreatePolicyCommand,
  UpdatePolicyCommand,
  DuplicatePolicyException,
  PolicyType,
} from '@aws-sdk/client-organizations';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * create-policy - lambda handler
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
  const bucket: string = event.ResourceProperties['bucket'];
  const key: string = event.ResourceProperties['key'];
  const name: string = event.ResourceProperties['name'];
  const description = event.ResourceProperties['description'] || '';
  const type: PolicyType = event.ResourceProperties['type'];
  const tags: Tag[] = event.ResourceProperties['tags'] || [];
  const partition: string = event.ResourceProperties['partition'];
  const policyTagKey: string = event.ResourceProperties['policyTagKey'];
  const globalRegion = getGlobalRegion(partition);

  const solutionId = process.env['SOLUTION_ID'];
  const organizationsClient = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const s3Client = new S3Client({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // Any configured AWS Organization Service Control Policies (SCPs) are also created and attached to configuration-specified deployment targets in accounts stage in global region

      //
      // Read in the policy content from the specified S3 location
      //
      const s3Object = await throttlingBackOff(() => s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key })));
      // as per javascript section in https://docs.aws.amazon.com/AmazonS3/latest/userguide/example_s3_GetObject_section.html
      const content = await s3Object.Body!.transformToString();

      const policyId = await createPolicy(
        { name, type, content, description, tags, policyTagKey },
        organizationsClient,
      );

      return {
        PhysicalResourceId: policyId,
        Status: 'SUCCESS',
      };

    case 'Delete':
      const deleteEventPolicyId = event.PhysicalResourceId;
      const deletePolicyId = await getPolicyId(organizationsClient, name, type);

      // only detach if policy ID from event matches policy ID from AWS Organizations
      if (deletePolicyId === deleteEventPolicyId) {
        console.log(`${type} ${name} found for deletion`);
        console.log(`Checking if policy ${name} has any attachments`);
        await detachPolicyFromAllAttachedTargets(organizationsClient, { name: name, id: deletePolicyId });

        console.log(`Deleting policy ${name}, policy type is ${type}`);
        await deletePolicy(deletePolicyId, organizationsClient);
        console.log(`Policy ${name} deleted successfully!`);
      } else {
        // Policy set for deletion was not found in AWS Organizations. Log message and send success.
        console.warn(`Policy: ${name} was not found in AWS Organizations`);
      }

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Function to delete specific policy
 */
async function deletePolicy(policyId: string, organizationsClient: OrganizationsClient): Promise<void> {
  try {
    await throttlingBackOff(() => organizationsClient.send(new DeletePolicyCommand({ PolicyId: policyId })));
  } catch (error: unknown) {
    if (error instanceof PolicyNotFoundException) {
      // if policy was recreated outside of accelerator
      // it will have a unique ID which is not the org and throw this exception
      // ignore it and proceed with next step
      console.log(`Policy: ${policyId} was not found. Continuing...`);
    } else {
      throw new Error(`Error while trying to delete policy: ${policyId}. Error message: ${JSON.stringify(error)}`);
    }
  }
}
/**
 * Function to get policy Id required for deletion
 * @param organizationsClient
 * @param policyName
 * @param type
 */
async function getPolicyId(
  organizationsClient: OrganizationsClient,
  policyName: string,
  type: PolicyType,
): Promise<string | undefined> {
  for await (const page of paginateListPolicies({ client: organizationsClient }, { Filter: type })) {
    for (const policy of page.Policies ?? []) {
      if (policy.Name === policyName) {
        return policy.Id;
      }
    }
  }

  return undefined;
}

/**
 * Function to detach all targets from given policy, before deleting the policy
 * @param organizationsClient
 * @param removePolicy
 */
async function detachPolicyFromAllAttachedTargets(
  organizationsClient: OrganizationsClient,
  removePolicy: {
    name: string;
    id: string;
  },
): Promise<void> {
  const targetIds: string[] = [];
  for await (const page of paginateListTargetsForPolicy(
    { client: organizationsClient },
    { PolicyId: removePolicy.id },
  )) {
    for (const target of page.Targets ?? []) {
      targetIds.push(target.TargetId!);
    }
  }

  const targetDetachPromise = [];
  for (const targetId of targetIds) {
    console.log(`Started detach of target ${targetId} from policy ${removePolicy.id}`);
    targetDetachPromise.push(detachTargetFromSpecificTarget(targetId, organizationsClient, removePolicy));
  }
  await Promise.all(targetDetachPromise);
}

/**
 * Function to detach a specific target based on target Id
 * @param targetId
 * @param organizationsClient
 * @param removePolicy
 */
async function detachTargetFromSpecificTarget(
  targetId: string,
  organizationsClient: OrganizationsClient,
  removePolicy: {
    name: string;
    id: string;
  },
) {
  try {
    throttlingBackOff(() =>
      organizationsClient.send(new DetachPolicyCommand({ PolicyId: removePolicy.id, TargetId: targetId })),
    );
  } catch (error) {
    if (error instanceof PolicyNotAttachedException) {
      console.log(`${removePolicy.name} policy not found to detach`);
    } else {
      throw new Error(`Policy ${removePolicy.name} detach error message - ${JSON.stringify(error)}`);
    }
  }
}

/**
 * Function to create organization policy
 * @param policyMetadata
 * @param organizationsClient
 * @returns
 */
async function createPolicy(
  policyMetadata: {
    name: string;
    type: PolicyType;
    content: string;
    description: string;
    tags: Tag[];
    policyTagKey: string;
  },
  organizationsClient: OrganizationsClient,
) {
  try {
    const createPolicyResponse = await throttlingBackOff(() =>
      organizationsClient.send(
        new CreatePolicyCommand({
          Content: policyMetadata.content,
          Description: policyMetadata.description,
          Name: policyMetadata.name,
          Type: policyMetadata.type as PolicyType,
          Tags: [...policyMetadata.tags, { Key: policyMetadata.policyTagKey, Value: 'Yes' }],
        }),
      ),
    );

    return createPolicyResponse.Policy!.PolicySummary!.Id; // return policy id for create policy response
  } catch (error) {
    if (error instanceof DuplicatePolicyException) {
      const policyId = await getPolicyId(organizationsClient, policyMetadata.name, policyMetadata.type)!;
      console.log(`Policy ${policyMetadata.name} already exists, updating`);
      await throttlingBackOff(() =>
        organizationsClient.send(
          new UpdatePolicyCommand({
            Content: policyMetadata.content,
            Description: policyMetadata.description,
            Name: policyMetadata.name,
            PolicyId: policyId,
          }),
        ),
      );
      console.log(`Policy ${policyMetadata.name} updated successfully.`);
      return await getPolicyId(organizationsClient, policyMetadata.name, policyMetadata.type)!; // return if policy already exists, no need to create it again.
    }
    throw new Error(
      `Error in creating policy ${policyMetadata.name} in AWS Organizations. Exception: ${JSON.stringify(error)}`,
    );
  }
}

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
 * create-policy - lambda handler
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
  const bucket: string = event.ResourceProperties['bucket'];
  const key: string = event.ResourceProperties['key'];
  const name: string = event.ResourceProperties['name'];
  const description = event.ResourceProperties['description'] || '';
  const type: string = event.ResourceProperties['type'];
  const tags: AWS.Organizations.Tag[] = event.ResourceProperties['tags'] || [];
  const partition: string = event.ResourceProperties['partition'];
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
  const s3Client = new AWS.S3({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      //
      // Read in the policy content from the specified S3 location
      //
      const s3Object = await throttlingBackOff(() => s3Client.getObject({ Bucket: bucket, Key: key }).promise());
      const content = s3Object.Body!.toString();
      console.log(content);

      //
      // Check if already exists, update and return the ID
      //
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.listPolicies({ Filter: type, NextToken: nextToken }).promise(),
        );
        for (const policy of page.Policies ?? []) {
          if (policy.Name === name) {
            console.log('Existing Policy found');

            if (policy.AwsManaged) {
              return {
                PhysicalResourceId: policy.Id,
                Status: 'SUCCESS',
              };
            }

            const updatePolicyResponse = await throttlingBackOff(() =>
              organizationsClient
                .updatePolicy({ Name: name, Content: content, Description: description, PolicyId: policy.Id! })
                .promise(),
            );

            // update tags for existing resources
            await throttlingBackOff(() =>
              organizationsClient
                .tagResource({
                  ResourceId: policy.Id!,
                  Tags: [...tags, { Key: policyTagKey, Value: 'Yes' }],
                })
                .promise(),
            );

            console.log(updatePolicyResponse.Policy?.PolicySummary?.Id);

            return {
              PhysicalResourceId: updatePolicyResponse.Policy?.PolicySummary?.Id,
              Status: 'SUCCESS',
            };
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

      //
      // Create if not found
      //
      const createPolicyResponse = await throttlingBackOff(() =>
        organizationsClient
          .createPolicy({
            Content: content,
            Description: description,
            Name: name,
            Type: type,
            Tags: [...tags, { Key: policyTagKey, Value: 'Yes' }],
          })
          .promise(),
      );

      console.log(createPolicyResponse.Policy?.PolicySummary?.Id);

      return {
        PhysicalResourceId: createPolicyResponse.Policy?.PolicySummary?.Id,
        Status: 'SUCCESS',
      };

    case 'Delete':
      const policyId = await getPolicyId(organizationsClient, name, type);

      if (policyId) {
        console.log(`${type} ${name} found for deletion`);
        console.log(`Checking policy ${name} have any attachment before deletion`);
        await detachPolicyFromAllAttachedTargets(organizationsClient, { name: name, id: policyId });

        console.log(`Deleting policy ${name}, policy type is ${type}`);
        await throttlingBackOff(() =>
          organizationsClient
            .deletePolicy({
              PolicyId: policyId,
            })
            .promise(),
        );
        console.log(`Policy ${name} deleted successfully!`);
      }

      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

/**
 * Function to get policy Id required for deletion
 * @param organizationsClient
 * @param removePolicy
 */
async function getPolicyId(
  organizationsClient: AWS.Organizations,
  policyName: string,
  type: string,
): Promise<string | undefined> {
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.listPolicies({ Filter: type, NextToken: nextToken }).promise(),
    );
    for (const policy of page.Policies ?? []) {
      if (policy.Name === policyName) {
        return policy.Id!;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  return undefined;
}

/**
 * Function to detach all targets from given policy, before deleting the policy
 * @param organizationsClient
 * @param removePolicy
 */
async function detachPolicyFromAllAttachedTargets(
  organizationsClient: AWS.Organizations,
  removePolicy: {
    name: string;
    id: string;
  },
): Promise<void> {
  let nextToken: string | undefined = undefined;
  const targetIds: string[] = [];
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.listTargetsForPolicy({ PolicyId: removePolicy.id, NextToken: nextToken }).promise(),
    );
    for (const target of page.Targets ?? []) {
      targetIds.push(target.TargetId!);
    }
    nextToken = page.NextToken;
  } while (nextToken);

  for (const targetId of targetIds) {
    console.log(`Started detach of target ${targetId} from policy ${removePolicy.id}`);
    try {
      await throttlingBackOff(() =>
        organizationsClient.detachPolicy({ PolicyId: removePolicy.id, TargetId: targetId }).promise(),
      );
      console.log(`Completed detach of target ${targetId} from policy ${removePolicy.id}`);
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
        console.log(`${removePolicy.name} policy not found to detach`);
      } else {
        throw new Error(`Policy detach error message - ${e}`);
      }
    }
  }
}

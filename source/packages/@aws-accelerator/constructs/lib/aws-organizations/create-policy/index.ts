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
  CreatePolicyCommand,
  OrganizationsClient,
  paginateListPolicies,
  Tag,
  UpdatePolicyCommand,
} from '@aws-sdk/client-organizations';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

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
  const tags: Tag[] = event.ResourceProperties['tags'] || [];

  const organizationsClient = new OrganizationsClient({});
  const s3Client = new S3Client({});

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      //
      // Create a helper function to convert a ReadableStream to a string.
      //
      const streamToString = (stream: Readable) =>
        new Promise((resolve, reject) => {
          const chunks: Uint8Array[] = [];
          stream.on('data', chunk => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });

      //
      // Read in the policy content from the specified S3 location
      //
      const s3Object = await throttlingBackOff(() =>
        s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        ),
      );

      //
      // Stream in the content
      //
      const content = (await streamToString(s3Object.Body as Readable)) as string;

      console.log(content);

      //
      // Check if already exists, update and return the ID
      //
      for await (const page of paginateListPolicies({ client: organizationsClient }, { Filter: type })) {
        for (const policy of page.Policies ?? []) {
          if (policy.Name === name) {
            console.log('Existing Policy found');

            if (policy.AwsManaged) {
              return {
                PhysicalResourceId: policy.Id,
                Status: 'SUCCESS',
              };
            }

            const response = await throttlingBackOff(() =>
              organizationsClient.send(
                new UpdatePolicyCommand({
                  Name: name,
                  Content: content,
                  Description: description,
                  PolicyId: policy.Id,
                }),
              ),
            );

            console.log(response.Policy?.PolicySummary?.Id);

            return {
              PhysicalResourceId: response.Policy?.PolicySummary?.Id,
              Status: 'SUCCESS',
            };
          }
        }
      }

      //
      // Create if not found
      //
      const response = await throttlingBackOff(() =>
        organizationsClient.send(
          new CreatePolicyCommand({
            Content: content,
            Description: description,
            Name: name,
            Tags: tags,
            Type: type,
          }),
        ),
      );

      console.log(response.Policy?.PolicySummary?.Id);

      return {
        PhysicalResourceId: response.Policy?.PolicySummary?.Id,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing, we will leave any created SCPs behind
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

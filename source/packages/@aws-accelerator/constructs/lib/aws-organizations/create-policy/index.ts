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
          .createPolicy({ Content: content, Description: description, Name: name, Tags: tags, Type: type })
          .promise(),
      );

      console.log(createPolicyResponse.Policy?.PolicySummary?.Id);

      return {
        PhysicalResourceId: createPolicyResponse.Policy?.PolicySummary?.Id,
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

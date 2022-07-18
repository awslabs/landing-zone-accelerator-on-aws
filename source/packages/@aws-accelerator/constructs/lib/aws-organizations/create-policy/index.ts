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
  const acceleratorPrefix: string = event.ResourceProperties['acceleratorPrefix'];
  const managementAccountAccessRole: string = event.ResourceProperties['managementAccountAccessRole'];

  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }
  const s3Client = new AWS.S3({});

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      //
      // Read in the policy content from the specified S3 location
      //
      const s3Object = await throttlingBackOff(() => s3Client.getObject({ Bucket: bucket, Key: key }).promise());
      const content = s3Object.Body!.toString();
      console.log(content);

      // Minify and update placeholder values
      let policyContent: string = JSON.stringify(JSON.parse(content));
      policyContent = replaceDefaults({
        content: policyContent,
        acceleratorPrefix: acceleratorPrefix,
        managementAccountAccessRole: managementAccountAccessRole,
        partition: partition,
        additionalReplacements: {},
      });
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
                .updatePolicy({ Name: name, Content: policyContent, Description: description, PolicyId: policy.Id! })
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
          .createPolicy({ Content: policyContent, Description: description, Name: name, Tags: tags, Type: type })
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

function replaceDefaults(props: {
  content: string;
  acceleratorPrefix: string;
  managementAccountAccessRole: string;
  partition: string;
  additionalReplacements: { [key: string]: string | string[] };
}): string {
  const { acceleratorPrefix, additionalReplacements, managementAccountAccessRole, partition } = props;
  let { content } = props;

  for (const [key, value] of Object.entries(additionalReplacements)) {
    console.log(`key: ${key}, value: ${value}`);
    content = content.replace(new RegExp(key, 'g'), StringType.is(value) ? value : JSON.stringify(value));
  }

  const replacements = {
    '\\${MANAGEMENT_ACCOUNT_ACCESS_ROLE}': managementAccountAccessRole,
    '\\${ACCELERATOR_PREFIX}': acceleratorPrefix,
    '\\${PARTITION}': partition,
  };

  for (const [key, value] of Object.entries(replacements)) {
    console.log(`key: ${key}, value: ${value}`);
    content = content.replace(new RegExp(key, 'g'), value);
  }

  console.log(`Policy with placeholder values ${content}`);

  return content;
}

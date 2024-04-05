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

import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import {
  AccountPolicy,
  CloudWatchLogsClient,
  DeleteAccountPolicyCommand,
  DescribeAccountPoliciesCommand,
  PolicyType,
  PutAccountPolicyCommand,
  Scope,
} from '@aws-sdk/client-cloudwatch-logs';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

/**
 * create-log-groups - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
    }
  | undefined
> {
  const centralLogBucketName: string = event.ResourceProperties['centralLogBucketName'];
  const identifierNames: string[] = event.ResourceProperties['identifierNames'];
  const overrideExisting = event.ResourceProperties['overrideExisting'] === 'true' ? true : false;
  const partition = event.ResourceProperties['partition'];

  const solutionId = process.env['SOLUTION_ID'];

  const client = new CloudWatchLogsClient({
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });

  const existingPolicies = await getExistingPolicies(client);

  let isPolicyExists = false;

  if (existingPolicies.length === 1) {
    isPolicyExists = true;
  }

  let policyName = 'ACCELERATOR_ACCOUNT_DATA_PROTECTION_POLICY';

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (isPolicyExists && !overrideExisting) {
        console.warn(
          `Existing policy ${existingPolicies[0]
            .policyName!} found, and override existing flag is set to false, skip update of policy.`,
        );
        return {
          Status: 'SUCCESS',
        };
      }

      if (isPolicyExists) {
        policyName = existingPolicies[0].policyName!;
        console.log(
          `Existing policy ${existingPolicies[0]
            .policyName!} found, and override existing flag is set to true, policy will be updated.`,
        );
      } else {
        console.log(`No existing policy found, policy ${policyName} will be created.`);
      }

      const dataIdentifiers: string[] = identifierNames.map(
        item => `arn:${partition}:dataprotection::${partition}:data-identifier/${item}`,
      );

      const policyDocument = {
        Name: policyName,
        Description: 'Accelerator deployed CloudWatch log data protection policy',
        Version: '2021-06-01',
        Statement: [
          {
            Sid: 'audit-policy',
            DataIdentifier: dataIdentifiers,
            Operation: {
              Audit: {
                FindingsDestination: {
                  S3: {
                    Bucket: centralLogBucketName,
                  },
                },
              },
            },
          },
          {
            Sid: 'redact-policy',
            DataIdentifier: dataIdentifiers,
            Operation: {
              Deidentify: {
                MaskConfig: {},
              },
            },
          },
        ],
      };

      await throttlingBackOff(() =>
        client.send(
          new PutAccountPolicyCommand({
            policyName: policyName,
            policyDocument: JSON.stringify(policyDocument),
            policyType: PolicyType.DATA_PROTECTION_POLICY,
            scope: Scope.ALL,
          }),
        ),
      );

      return {
        Status: 'SUCCESS',
      };

    case 'Delete':
      if (isPolicyExists) {
        // Delete policy deployed by the solution only
        if (existingPolicies[0].policyName! === policyName) {
          console.log(
            `Existing policy ${existingPolicies[0]
              .policyName!} found, which is similar to solution deployed policy, policy will be deleted.`,
          );
          await throttlingBackOff(() =>
            client.send(
              new DeleteAccountPolicyCommand({
                policyName: policyName,
                policyType: PolicyType.DATA_PROTECTION_POLICY,
              }),
            ),
          );
        }
      }

      return {
        Status: 'SUCCESS',
      };
  }

  /**
   * Function to get existing account policy configuration
   * @param client {@link CloudWatchLogsClient}
   * @returns policyConfiguration {@link AccountPolicy}[]
   */
  async function getExistingPolicies(client: CloudWatchLogsClient): Promise<AccountPolicy[]> {
    const response = await throttlingBackOff(() =>
      client.send(
        new DescribeAccountPoliciesCommand({
          policyType: PolicyType.DATA_PROTECTION_POLICY,
        }),
      ),
    );

    if (!response.accountPolicies) {
      throw new Error(`Undefined accountPolicies property received from DescribeAccountPolicies API.`);
    }

    return response.accountPolicies;
  }
}

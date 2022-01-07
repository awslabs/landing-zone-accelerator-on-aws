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
  DescribeOrganizationCommand,
  EnablePolicyTypeCommand,
  OrganizationsClient,
  paginateListRoots,
} from '@aws-sdk/client-organizations';

/**
 * enable-policy-type - lambda handler
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
  switch (event.RequestType) {
    case 'Create':
      const policyType = event.ResourceProperties['policyType'];

      //
      // Obtain an Organizations client
      //
      const organizationsClient: OrganizationsClient = new OrganizationsClient({});

      // Verify policy type from the describe organizations call
      const organization = await throttlingBackOff(() => organizationsClient.send(new DescribeOrganizationCommand({})));
      if (organization.Organization?.AvailablePolicyTypes?.find(item => item.Type === policyType) === undefined) {
        throw new Error(`Policy Type ${policyType} not supported`);
      }

      for await (const page of paginateListRoots({ client: organizationsClient }, {})) {
        for (const item of page.Roots ?? []) {
          if (item.Name === 'Root') {
            if (item.PolicyTypes?.find(item => item.Type === policyType && item.Status === 'ENABLED')) {
              return {
                PhysicalResourceId: policyType,
                Status: 'SUCCESS',
              };
            }

            await throttlingBackOff(() =>
              organizationsClient.send(new EnablePolicyTypeCommand({ PolicyType: policyType, RootId: item.Id })),
            );

            return {
              PhysicalResourceId: policyType,
              Status: 'SUCCESS',
            };
          }
        }
      }

      throw new Error(`Error enabling policy type for Root`);

    case 'Update':
    case 'Delete':
      // Do Nothing, leave Policy Type enabled
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'SUCCESS',
      };
  }
}

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

import { setOrganizationsClient, throttlingBackOff } from '@aws-accelerator/utils';
import { EnablePolicyTypeCommand, ListRootsCommand } from '@aws-sdk/client-organizations';

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
      const partition = event.ResourceProperties['partition'];
      const solutionId = process.env['SOLUTION_ID'];

      //
      // Obtain an Organizations client
      //
      const organizationsClient = setOrganizationsClient(partition, solutionId);

      // Verify policy type from the listRoots call
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          organizationsClient.send(new ListRootsCommand({ NextToken: nextToken })),
        );
        for (const orgRoot of page.Roots ?? []) {
          if (orgRoot.Name === 'Root') {
            if (orgRoot.PolicyTypes?.find(item => item.Type === policyType && item.Status === 'ENABLED')) {
              return {
                PhysicalResourceId: policyType,
                Status: 'SUCCESS',
              };
            }

            await throttlingBackOff(() =>
              organizationsClient.send(new EnablePolicyTypeCommand({ PolicyType: policyType, RootId: orgRoot.Id! })),
            );

            return {
              PhysicalResourceId: policyType,
              Status: 'SUCCESS',
            };
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);

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

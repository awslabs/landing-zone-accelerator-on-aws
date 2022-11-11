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
 * list-policy-for-target - lambda handler
 *
 * @param event
 * @returns
 */

export type accountItem = {
  accountId: string;
  name: string;
};
export type orgItem = {
  id: string;
  name: string;
};
type validateScpItem = {
  orgEntity: string;
  orgEntityType: string;
  orgEntityId: string;
  appliedScpName: string[];
};
const errors: string[] = [];
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
    }
  | undefined
> {
  const partition = event.ResourceProperties['partition'];

  const organizationUnits: orgItem[] = event.ResourceProperties['organizationUnits'];
  const accounts: accountItem[] = event.ResourceProperties['accounts'];
  const scps: validateScpItem[] = event.ResourceProperties['scps'];

  let organizationsClient: AWS.Organizations;
  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else if (partition === 'aws-cn') {
    organizationsClient = new AWS.Organizations({ region: 'cn-northwest-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      await checkOrganizationUnits(organizationUnits, organizationsClient, scps);
      await checkAccounts(accounts, organizationsClient, scps);
      if (errors.length > 0) {
        throw new Error(`Error: ${errors}`);
      }
      return { Status: 'SUCCESS' };

    case 'Delete':
      return { Status: 'SUCCESS' };
  }
}

async function checkOrganizationUnits(
  organizationUnits: orgItem[],
  organizationsClient: AWS.Organizations,
  scps: validateScpItem[],
) {
  for (const organizationUnit of organizationUnits) {
    // get all scps attached to this particular OU
    // this cannot be more than 5 so not paginating
    const attachedScps: AWS.Organizations.ListPoliciesForTargetResponse = await throttlingBackOff(() =>
      organizationsClient
        .listPoliciesForTarget({
          Filter: 'SERVICE_CONTROL_POLICY',
          TargetId: organizationUnit.id,
          MaxResults: 10,
        })
        .promise(),
    );
    if (attachedScps.Policies) {
      // Get all scp names attached by solution from the config
      // for this particular organization unit
      const accelOuScpsFiltered = scps.filter(obj => {
        return obj.orgEntityId === organizationUnit.id;
      });
      let accelOuScps: string[] = [];
      if (accelOuScpsFiltered.length > 0) {
        accelOuScps = accelOuScpsFiltered[0].appliedScpName;
      }

      // filter out name of accelerator scps.
      // Whatever remains is from external resource (control tower or user)
      const nonAccelScps = [];
      for (const policy of attachedScps.Policies) {
        if (!accelOuScps.includes(policy.Name!)) {
          nonAccelScps.push(policy.Name);
        }
      }
      if (nonAccelScps.length + accelOuScps.length > 5) {
        errors.push(
          `Max Allowed SCPs for OU "${organizationUnit.name}" is 5, found already attached scps count ${nonAccelScps.length} and Accelerator OU scps ${accelOuScps.length} => ${accelOuScps}`,
        );
      }
    }
  }
}

async function checkAccounts(accounts: accountItem[], organizationsClient: AWS.Organizations, scps: validateScpItem[]) {
  for (const account of accounts) {
    // get all scps attached to this particular account
    // this cannot be more than 5 so not paginating
    const attachedScps: AWS.Organizations.ListPoliciesForTargetResponse = await throttlingBackOff(() =>
      organizationsClient
        .listPoliciesForTarget({
          Filter: 'SERVICE_CONTROL_POLICY',
          TargetId: account.accountId,
          MaxResults: 10,
        })
        .promise(),
    );
    if (attachedScps.Policies) {
      // Get all scp names attached by solution from the config
      // for this particular account
      const accelOuScpsFiltered = scps.filter(obj => {
        return obj.orgEntityId === account.accountId;
      });
      let accelOuScps: string[] = [];
      if (accelOuScpsFiltered.length > 0) {
        accelOuScps = accelOuScpsFiltered[0].appliedScpName;
      }

      // filter out name of accelerator scps.
      // Whatever remains is from external resource (control tower or user)
      const nonAccelScps = [];
      for (const policy of attachedScps.Policies) {
        if (!accelOuScps.includes(policy.Name!)) {
          nonAccelScps.push(policy.Name);
        }
      }
      if (nonAccelScps.length + accelOuScps.length > 5) {
        errors.push(
          `Max Allowed SCPs for Account "${account.name}" is 5, found already attached scps count ${nonAccelScps.length} and Accelerator OU scps ${accelOuScps.length} => ${accelOuScps}`,
        );
      }
    }
  }
}

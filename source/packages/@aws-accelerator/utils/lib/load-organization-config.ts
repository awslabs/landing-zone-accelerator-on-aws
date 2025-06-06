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

import {
  OrganizationsClient,
  ListOrganizationalUnitsForParentCommand,
  ListRootsCommand,
  ListOrganizationalUnitsForParentCommandOutput,
  OrganizationalUnit,
  Root,
} from '@aws-sdk/client-organizations';
import { getGlobalRegion, setRetryStrategy } from './common-functions';
import { throttlingBackOff } from './throttle';

type AcceleratorOu = {
  name: string;
  id: string;
  arn: string;
  orgsApiResponse: OrganizationalUnit | Root;
};
type OrganizationConfigArray = {
  name: string;
  ignore: boolean | undefined;
};

export async function loadOrganizationalUnits(
  partition: string,
  arrayFromConfig: OrganizationConfigArray[],
  /**
   * Management account credential when deployed from external account, otherwise this should remain undefined
   */ managementAccountCredentials?: AWS.Credentials,
): Promise<AcceleratorOu[]> {
  const client = new OrganizationsClient({
    retryStrategy: setRetryStrategy(),
    region: getGlobalRegion(partition),
    credentials: managementAccountCredentials,
  });
  const acceleratorOrganizationalUnit: AcceleratorOu[] = [];
  const rootResults = await throttlingBackOff(() => client.send(new ListRootsCommand({})));

  let rootId: string;
  if (rootResults.Roots) {
    rootId = rootResults.Roots[0].Id!;
    acceleratorOrganizationalUnit.push({
      name: rootResults.Roots[0].Name!,
      arn: rootResults.Roots[0].Arn!,
      id: rootId,
      orgsApiResponse: rootResults.Roots[0],
    });
  }
  const level0 = await getChildrenForParent(rootId!, undefined, client);
  const level1 = await processLevel(level0, client);
  const level2 = await processLevel(level1, client);
  const level3 = await processLevel(level2, client);
  const level4 = await processLevel(level3, client);
  acceleratorOrganizationalUnit.push(...level0, ...level1, ...level2, ...level3, ...level4);

  const filteredArray = acceleratorOrganizationalUnit.filter(obj => {
    return arrayFromConfig.filter(value => {
      return value.name === obj.name;
    });
  });
  return filteredArray;
}

async function processLevel(levelArray: AcceleratorOu[], client: OrganizationsClient): Promise<AcceleratorOu[]> {
  const output: AcceleratorOu[] = [];
  for (const ou of levelArray) {
    const results = await getChildrenForParent(ou.id, ou.name, client);
    output.push(...results);
  }
  return output;
}

async function getChildrenForParent(
  parentId: string,
  parentName: string | undefined,
  client: OrganizationsClient,
): Promise<AcceleratorOu[]> {
  const orgUnits: AcceleratorOu[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const results: ListOrganizationalUnitsForParentCommandOutput = await throttlingBackOff(() =>
      client.send(
        new ListOrganizationalUnitsForParentCommand({
          ParentId: parentId,
          NextToken: nextToken,
        }),
      ),
    );
    nextToken = results.NextToken;
    if (results.OrganizationalUnits) {
      for (const item of results.OrganizationalUnits) {
        // if parentName is defined, prefix parent name or else just return item.Name
        const itemName = parentName ? `${parentName}/${item.Name!}` : item.Name!;
        orgUnits.push({
          id: item.Id!,
          name: itemName,
          arn: item.Arn!,
          orgsApiResponse: item,
        });
      }
    }
  } while (nextToken);

  return orgUnits;
}

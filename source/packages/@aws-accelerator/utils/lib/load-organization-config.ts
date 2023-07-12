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

import {
  OrganizationsClient,
  ListOrganizationalUnitsForParentCommand,
  ListRootsCommand,
  ListOrganizationalUnitsForParentCommandOutput,
} from '@aws-sdk/client-organizations';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';

type OrgUnit = {
  Id: string;
  ParentId: string;
  Name: string;
  Arn: string;
};

type OrgUnits = OrgUnit[];

type AcceleratorOu = {
  name: string;
  id: string;
  arn: string;
};
type OrganizationConfigArray = {
  name: string;
  ignore: boolean | undefined;
};

export async function loadOrganizationalUnits(
  partition: string,
  arrayFromConfig: OrganizationConfigArray[],
): Promise<AcceleratorOu[]> {
  const client = new OrganizationsClient({
    retryStrategy: new ConfiguredRetryStrategy(10, (attempt: number) => 100 + attempt * 1000),
    region: await getRegion(partition),
  });
  const acceleratorOrganizationalUnit: AcceleratorOu[] = [];
  const rootResults = await client.send(new ListRootsCommand({}));

  let rootId: string;
  if (rootResults.Roots) {
    rootId = rootResults.Roots[0].Id!;
    acceleratorOrganizationalUnit.push({
      name: rootResults.Roots[0].Name!,
      arn: rootResults.Roots[0].Arn!,
      id: rootId,
    });
  }

  const level0 = await getChildrenForParent(rootId!, undefined, client);
  const level1 = await processLevel(level0, client);
  const level2 = await processLevel(level1, client);
  const level3 = await processLevel(level2, client);
  const level4 = await processLevel(level3, client);
  acceleratorOrganizationalUnit.push(...(await parseArray(level0)));
  acceleratorOrganizationalUnit.push(...(await parseArray(level1)));
  acceleratorOrganizationalUnit.push(...(await parseArray(level2)));
  acceleratorOrganizationalUnit.push(...(await parseArray(level3)));
  acceleratorOrganizationalUnit.push(...(await parseArray(level4)));

  const filteredArray = acceleratorOrganizationalUnit.filter(obj => {
    return arrayFromConfig.filter(value => {
      return value.name === obj.name;
    });
  });
  return filteredArray;
}

async function getRegion(partition: string): Promise<string> {
  let region: string;
  if (partition === 'aws-us-gov') {
    region = 'us-gov-west-1';
  } else if (partition === 'aws-cn') {
    region = 'cn-northwest-1';
  } else {
    region = 'us-east-1';
  }
  return region;
}

async function parseArray(levelArray: OrgUnits): Promise<AcceleratorOu[]> {
  const output: AcceleratorOu[] = [];
  for (const item of levelArray) {
    output.push({
      name: item.Name,
      id: item.Id,
      arn: item.Arn,
    });
  }
  return output;
}

async function processLevel(levelArray: OrgUnits, client: OrganizationsClient): Promise<OrgUnits> {
  const output: OrgUnits = [];
  for (const ou of levelArray) {
    const results = await getChildrenForParent(ou.Id!, ou.Name!, client);
    output.push(...results);
  }
  return output;
}

async function getChildrenForParent(
  parentId: string,
  parentName: string | undefined,
  client: OrganizationsClient,
): Promise<OrgUnits> {
  const orgUnits: OrgUnits = [];
  let nextToken: string | undefined = undefined;
  do {
    const results: ListOrganizationalUnitsForParentCommandOutput = await client.send(
      new ListOrganizationalUnitsForParentCommand({
        ParentId: parentId,
        NextToken: nextToken,
      }),
    );
    nextToken = results.NextToken;
    if (results.OrganizationalUnits) {
      for (const item of results.OrganizationalUnits) {
        // if parentName is defined, prefix parent name or else just return item.Name
        const itemName = parentName ? `${parentName}/${item.Name!}` : item.Name!;
        orgUnits.push({
          Id: item.Id!,
          ParentId: parentId,
          Name: itemName,
          Arn: item.Arn!,
        });
      }
    }
  } while (nextToken);

  return orgUnits;
}

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
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

let organizationsClient: AWS.Organizations;
const dynamodbClient = new AWS.DynamoDB.DocumentClient();
/**
 * create-organizational-units - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string;
    }
  | undefined
> {
  const configTableName = event.ResourceProperties['configTableName'];
  const partition = event.ResourceProperties['partition'];

  const organizationalUnitsToCreate: AWS.DynamoDB.DocumentClient.AttributeMap = [];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (partition === 'aws-us-gov') {
        organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
      } else {
        organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
      }

      //read config from table
      const organizationalUnitList = (await getConfigFromTable(configTableName)).Items;
      console.log(`Organizational Units retrieved from config table: ${JSON.stringify(organizationalUnitList)}`);

      //build list of organizational units that need to be created
      if (organizationalUnitList) {
        for (const organizationalUnit of organizationalUnitList) {
          if (!organizationalUnit['awsKey']) {
            organizationalUnitsToCreate['push'](organizationalUnit);
          }
        }
      }

      //get organzational root id
      const rootId = await getRootId();
      console.log(`Root OU ID ${rootId}`);

      //sort by number of elements in order to
      //create parent organizational units first
      const sortedOrganizationalUnits = organizationalUnitsToCreate['sort']((a, b) =>
        a['acceleratorKey'].split('/').length > b['acceleratorKey'].split('/').length ? 1 : -1,
      );

      console.log(`Sorted list of OU's to create ${sortedOrganizationalUnits}`);
      for (const organizationalUnit of sortedOrganizationalUnits) {
        console.log(`Creating organizational unit ${organizationalUnit['acceleratorKey']}`);
        const createResponse = await createOrganizationalUnitFromPath(
          rootId,
          organizationalUnit['acceleratorKey'],
          configTableName,
        );
        if (!createResponse) {
          return {
            Status: 'FAILURE',
          };
        }
      }
      return {
        Status: 'SUCCESS',
      };

    case 'Delete':
      // Do Nothing
      return {
        Status: 'SUCCESS',
      };
  }
}

async function lookupOrganizationalUnit(name: string, parentId: string): Promise<string> {
  let nextToken: string | undefined = undefined;
  const page = await throttlingBackOff(() =>
    organizationsClient.listOrganizationalUnitsForParent({ ParentId: parentId, NextToken: nextToken }).promise(),
  );
  for (const ou of page.OrganizationalUnits ?? []) {
    if (ou.Name == name && ou.Id) {
      return ou.Id;
    }
    nextToken = page.NextToken;
  }
  while (nextToken);
  return '';
}

async function getConfigFromTable(configTableName: string): Promise<AWS.DynamoDB.DocumentClient.QueryOutput> {
  const params = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'organization',
    },
    Select: 'ALL_ATTRIBUTES',
  };
  const response = await throttlingBackOff(() => dynamodbClient.query(params).promise());
  return response;
}

async function getRootId(): Promise<string> {
  // get root ou id
  let rootId = '';
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => organizationsClient.listRoots({ NextToken: nextToken }).promise());
    for (const item of page.Roots ?? []) {
      if (item.Name === 'Root' && item.Id && item.Arn) {
        rootId = item.Id;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return rootId;
}

function getPath(name: string): string {
  //get the parent path
  const pathIndex = name.lastIndexOf('/');
  const path = name.slice(0, pathIndex + 1).slice(0, -1);
  if (path === '') {
    return '/';
  }
  return '/' + path;
}

function getOuName(name: string): string {
  const result = name.split('/').pop();
  if (result === undefined) {
    return name;
  }
  return result;
}

async function createOrganizationalUnitFromPath(
  rootId: string,
  acceleratorKey: string,
  configTableName: string,
): Promise<boolean> {
  let parentId = rootId;

  const path = getPath(acceleratorKey);
  const name = getOuName(acceleratorKey);
  //find parent for ou
  // create parent ou's if needed - maybe
  for (const parent of path.split('/')) {
    if (parent) {
      const orgId = await lookupOrganizationalUnit(parent, parentId);
      if (orgId !== '') {
        console.log(`Found parent ou with id ${orgId}`);
        parentId = orgId;
      } else {
        console.log(`Need to create ou ${parent} for parentId ${parentId} in the organizations config`);
        return false;
      }
    }
  }

  // Create the OU if not found
  try {
    const organizationsResponse = await throttlingBackOff(() =>
      organizationsClient
        .createOrganizationalUnit({
          Name: name,
          ParentId: parentId,
        })
        .promise(),
    );
    console.log(`Created OU with id: ${organizationsResponse.OrganizationalUnit?.Id}`);
    const params = {
      TableName: configTableName,
      Key: {
        dataType: 'organization',
        acceleratorKey: acceleratorKey,
      },
      UpdateExpression: 'set #attribute = :x',
      ExpressionAttributeNames: { '#attribute': 'awsKey' },
      ExpressionAttributeValues: { ':x': organizationsResponse.OrganizationalUnit?.Id },
    };
    const dynamodbResponse = await throttlingBackOff(() => dynamodbClient.update(params).promise());
    console.log(dynamodbResponse);
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

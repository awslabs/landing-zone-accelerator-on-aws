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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  UpdateCommandInput,
  paginateQuery,
  DynamoDBDocumentPaginationConfiguration,
} from '@aws-sdk/lib-dynamodb';

import {
  OrganizationsClient,
  ListOrganizationalUnitsForParentCommand,
  ListOrganizationalUnitsForParentCommandOutput,
  ListRootsCommand,
  ListRootsCommandOutput,
  CreateOrganizationalUnitCommand,
} from '@aws-sdk/client-organizations';
import { ConfiguredRetryStrategy } from '@aws-sdk/util-retry';

AWS.config.logger = console;
let organizationsClient: OrganizationsClient;
const marshallOptions = {
  convertEmptyValues: false,
  //overriding default value of false
  removeUndefinedValues: true,
  convertClassInstanceToMap: false,
};
const unmarshallOptions = {
  wrapNumbers: false,
};
const translateConfig = { marshallOptions, unmarshallOptions };
let paginationConfig: DynamoDBDocumentPaginationConfiguration;
let dynamodbClient: DynamoDBClient;
let documentClient: DynamoDBDocumentClient;

type OrganizationConfigRecord = {
  dataType: string;
  acceleratorKey: string;
  dataBag: string;
  awsKey: string;
  commitId: string;
};
type OrganizationConfigRecords = Array<OrganizationConfigRecord>;
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
  const commitId = event.ResourceProperties['commitId'];
  const organizationsEnabled = event.ResourceProperties['organizationsEnabled'];
  const partition = event.ResourceProperties['partition'];
  const organizationalUnitsToCreate: OrganizationConfigRecords = [];
  const solutionId = process.env['SOLUTION_ID'];

  dynamodbClient = new DynamoDBClient({ customUserAgent: solutionId });
  documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);
  paginationConfig = {
    client: documentClient,
    pageSize: 100,
  };

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      if (organizationsEnabled == 'false') {
        console.log('Stopping, Organizations not enabled.');
        return {
          Status: 'SUCCESS',
        };
      }
      if (partition === 'aws-us-gov') {
        organizationsClient = new OrganizationsClient({
          retryStrategy: new ConfiguredRetryStrategy(10, (attempt: number) => 100 + attempt * 1000),
          region: 'us-gov-west-1',
        });
      } else if (partition === 'aws-cn') {
        organizationsClient = new OrganizationsClient({
          retryStrategy: new ConfiguredRetryStrategy(10, (attempt: number) => 100 + attempt * 1000),
          region: 'cn-northwest-1',
        });
      } else {
        organizationsClient = new OrganizationsClient({
          retryStrategy: new ConfiguredRetryStrategy(10, (attempt: number) => 100 + attempt * 1000),
          region: 'us-east-1',
        });
      }
      //read config from table
      const organizationalUnitList = await getConfigFromTable(configTableName, commitId);
      console.log(`Organizational Units retrieved from config table: ${JSON.stringify(organizationalUnitList)}`);
      //build list of organizational units that need to be created
      if (organizationalUnitList) {
        for (const organizationalUnit of organizationalUnitList) {
          if (!organizationalUnit.awsKey) {
            organizationalUnitsToCreate.push(organizationalUnit);
          }
        }
      }
      //get organzational root id
      const rootId = await getRootId();
      console.log(`Root OU ID ${rootId}`);
      //sort by number of elements in order to
      //create parent organizational units first
      const sortedOrganizationalUnits = organizationalUnitsToCreate.sort((a, b) =>
        a['acceleratorKey'].split('/').length > b['acceleratorKey'].split('/').length ? 1 : -1,
      );
      console.log(`Sorted list of OU's to create ${JSON.stringify(sortedOrganizationalUnits)}`);
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
  do {
    const page: ListOrganizationalUnitsForParentCommandOutput = await organizationsClient.send(
      new ListOrganizationalUnitsForParentCommand({ ParentId: parentId, NextToken: nextToken }),
    );
    for (const ou of page.OrganizationalUnits ?? []) {
      if (ou.Name == name) {
        return ou.Id!;
      }
      nextToken = page.NextToken;
    }
  } while (nextToken);
  return '';
}
async function getConfigFromTable(configTableName: string, commitId: string): Promise<OrganizationConfigRecords> {
  const params = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'organization',
    },
  };
  const items: OrganizationConfigRecords = [];
  const paginator = paginateQuery(paginationConfig, params);
  for await (const page of paginator) {
    if (page.Items) {
      for (const item of page.Items) {
        items.push(item as OrganizationConfigRecord);
      }
    }
  }
  const filterCommitIdResults = items.filter(item => item.commitId == commitId);
  return filterCommitIdResults;
}
async function getRootId(): Promise<string> {
  // get root ou id
  let rootId = '';
  let nextToken: string | undefined = undefined;
  do {
    const page: ListRootsCommandOutput = await organizationsClient.send(new ListRootsCommand({ NextToken: nextToken }));
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
    const organizationsResponse = await organizationsClient.send(
      new CreateOrganizationalUnitCommand({
        Name: name,
        ParentId: parentId,
      }),
    );
    console.log(`Created OU with id: ${organizationsResponse.OrganizationalUnit?.Id}`);
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: 'organization',
        acceleratorKey: acceleratorKey,
      },
      UpdateExpression: 'set #attribute = :x',
      ExpressionAttributeNames: { '#attribute': 'awsKey' },
      ExpressionAttributeValues: { ':x': organizationsResponse.OrganizationalUnit?.Id },
    };
    const updateConfigReponse = await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
    console.log(updateConfigReponse);
    return true;
  } catch (error) {
    console.log(error);
    return false;
  }
}

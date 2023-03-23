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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommandInput,
  paginateQuery,
  DynamoDBDocumentPaginationConfiguration,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

type ConfigOrganizationalUnitKeys = {
  acceleratorKey: string;
  awsKey: string;
  registered: boolean | undefined;
  ignore: boolean;
};

type DDBItem = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};
type DDBItems = Array<DDBItem>;

const solutionId: string = process.env['SOLUTION_ID'] ?? '';
const configTableName = process.env['CONFIG_TABLE_NAME'] ?? '';
const commitId = process.env['COMMIT_ID'] ?? '';
const homeRegion: string = process.env['HOME_REGION'] ?? '';
const globalRegion: string = process.env['GLOBAL_REGION'] ?? '';
const stackPrefix = process.env['STACK_PREFIX']!;

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

const dynamodbClient = new DynamoDBClient({ region: homeRegion, customUserAgent: solutionId });
const documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);
const paginationConfig: DynamoDBDocumentPaginationConfiguration = {
  client: documentClient,
  pageSize: 100,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<any> {
  console.log(JSON.stringify(event));

  if (event.detailType != 'AWS Service Event via CloudTrail' && event.source != 'aws.organizations') {
    console.error('Event was not the proper type.');
    return;
  }

  if (event.detail.eventName === 'MoveAccount') {
    const accountID: string = event.detail.requestParameters.accountId;
    const destinationParentId: string = event.detail.requestParameters.destinationParentId;
    const username: string = event.detail.userIdentity.sessionContext.sessionIssuer.userName;

    if (!username.includes(`${stackPrefix}-AccountsSt-`) && !username.includes(`${stackPrefix}-PrepareSta-`)) {
      const organizationsClient = new AWS.Organizations({ region: globalRegion, customUserAgent: solutionId });

      // Get all Ou details
      const configAllOuKeys = await getConfigOuKeys(organizationsClient, configTableName, commitId);

      // Get all account details
      const accountDetails = await getAccountDetails(configTableName, commitId, configAllOuKeys);

      const destSuspended = await isDestinationParentSuspended(configAllOuKeys, destinationParentId);

      const configTableSourceParent = accountDetails.find(item => item.accountId === accountID);
      if (!configTableSourceParent) {
        throw new Error(`Account id ${accountID}  not found in config table !!!`);
      }

      const eventDestParent = configAllOuKeys.find(item => item.awsKey === destinationParentId);
      if (!eventDestParent) {
        throw new Error(`Event's destination parent id ${destinationParentId} not found in organization !!!`);
      }

      if (configTableSourceParent.ouId !== destinationParentId) {
        if (destSuspended) {
          console.log(
            `Account id ${accountID} with email ${configTableSourceParent.email} was moved by non LZA user named ${username}, from source ou named ${configTableSourceParent.ouName} to a SUSPENDED(ignored) destination ou named ${eventDestParent.acceleratorKey}, event time was ${event.detail.eventTime}, assumed principal was ${event.detail.userIdentity.principalId}, change will NOT perform rollback !!!!`,
          );
          return;
        }

        console.warn(
          `Account id ${accountID} with email ${configTableSourceParent.email} was moved by non LZA user named ${username}, from ${configTableSourceParent.ouName} ou to ${eventDestParent.acceleratorKey} ou, event time was ${event.detail.eventTime}, assumed principal was ${event.detail.userIdentity.principalId}, change will be rollback !!!!`,
        );

        console.log(
          `Start: moving account id ${accountID} with email ${configTableSourceParent.email} from ${eventDestParent.acceleratorKey} ou to ${configTableSourceParent.ouName} ou`,
        );
        try {
          await throttlingBackOff(() =>
            organizationsClient
              .moveAccount({
                AccountId: accountID,
                DestinationParentId: configTableSourceParent.ouId,
                SourceParentId: destinationParentId,
              })
              .promise(),
          );
          console.log(
            `End: Account id ${accountID} with email ${configTableSourceParent.email} successfully moved from ${eventDestParent.acceleratorKey} ou to ${configTableSourceParent.ouName} ou`,
          );
        } catch (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          e: any
        ) {
          if (
            // SDKv2 Error Structure
            e.code === 'DuplicateAccountException' ||
            // SDKv3 Error Structure
            e.name === 'DuplicateAccountException'
          ) {
            console.warn(e.name + ': ' + e.message);
          }
        }
      }
    }
  }
}

async function isDestinationParentSuspended(
  configAllOuKeys: ConfigOrganizationalUnitKeys[],
  destinationParentId: string,
): Promise<boolean> {
  const destParentOu = configAllOuKeys.find(ouItem => ouItem.awsKey === destinationParentId);

  if (!destParentOu) {
    throw new Error(`Destination parent ou id ${destinationParentId} not found in organization !!!`);
  }
  if (destParentOu.ignore) {
    return true;
  }
  return false;
}

async function getAccountDetailsFromConfigTable(
  configTableName: string,
  commitId: string,
  dataType: string,
): Promise<DDBItems> {
  const params: QueryCommandInput = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': dataType,
      ':commitId': commitId,
    },
    FilterExpression: 'contains (commitId, :commitId)',
  };

  const paginator = paginateQuery(paginationConfig, params);

  const items: DDBItems = [];

  for await (const page of paginator) {
    if (page.Items) {
      for (const item of page.Items) {
        items.push(item);
      }
    }
  }
  return items;
}

async function getAccountDetails(
  configTableName: string,
  commitId: string,
  configAllOuKeys: ConfigOrganizationalUnitKeys[],
): Promise<
  { accountType: string; accountId: string; email: string; ouName: string; ouId: string; ouIgnore: boolean }[]
> {
  const accounts: {
    accountType: string;
    accountId: string;
    email: string;
    ouName: string;
    ouId: string;
    ouIgnore: boolean;
  }[] = [];
  const mandatoryAccounts = await getAccountDetailsFromConfigTable(configTableName, commitId, 'mandatoryAccount');

  for (const mandatoryAccount of mandatoryAccounts ?? []) {
    const ouId = configAllOuKeys.find(ouItem => ouItem.acceleratorKey === mandatoryAccount['ouName']);

    if (!ouId) {
      throw new Error(`Ou ${mandatoryAccount['ouName']} not found in ${configTableName} !!!`);
    }

    accounts.push({
      accountType: 'mandatoryAccount',
      accountId: mandatoryAccount['awsKey'],
      email: mandatoryAccount['acceleratorKey'],
      ouName: mandatoryAccount['ouName'],
      ouId: ouId.awsKey,
      ouIgnore: ouId.ignore,
    });
  }

  const workloadAccounts = await getAccountDetailsFromConfigTable(configTableName, commitId, 'workloadAccount');

  for (const workloadAccount of workloadAccounts ?? []) {
    const ouId = configAllOuKeys.find(ouItem => ouItem.acceleratorKey === workloadAccount['ouName']);

    if (!ouId) {
      throw new Error(`Ou ${workloadAccount['ouName']} not found in ${configTableName} !!!`);
    }

    accounts.push({
      accountType: 'workloadAccount',
      accountId: workloadAccount['awsKey'],
      email: workloadAccount['acceleratorKey'],
      ouName: workloadAccount['ouName'],
      ouId: ouId.awsKey,
      ouIgnore: ouId.ignore,
    });
  }

  return accounts;
}

async function getConfigOuKeys(
  organizationsClient: AWS.Organizations,
  configTableName: string,
  commitId: string,
): Promise<ConfigOrganizationalUnitKeys[]> {
  const organizationParams: QueryCommandInput = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'organization',
      ':commitId': commitId,
    },
    FilterExpression: 'contains (commitId, :commitId)',
    ProjectionExpression: 'acceleratorKey, awsKey, registered, dataBag',
  };
  const organizationResponse = await throttlingBackOff(() => documentClient.send(new QueryCommand(organizationParams)));
  const ouKeys: ConfigOrganizationalUnitKeys[] = [];
  if (organizationResponse.Items) {
    for (const item of organizationResponse.Items) {
      const ouConfig = JSON.parse(item['dataBag']);
      const ignored = ouConfig['ignore'] ?? false;

      ouKeys.push({
        acceleratorKey: item['acceleratorKey'],
        awsKey: item['awsKey'],
        registered: item['registered'] ?? undefined,
        ignore: ignored,
      });
    }
  }
  // get root ou key
  const rootId = await getRootId(organizationsClient);
  ouKeys.push({
    acceleratorKey: 'Root',
    awsKey: rootId,
    registered: true,
    ignore: false,
  });
  return ouKeys;
}

async function getRootId(organizationsClient: AWS.Organizations): Promise<string> {
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

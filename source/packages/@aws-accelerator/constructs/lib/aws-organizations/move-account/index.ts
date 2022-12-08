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
  QueryCommand,
  QueryCommandInput,
  paginateQuery,
  DynamoDBDocumentPaginationConfiguration,
} from '@aws-sdk/lib-dynamodb';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import {
  ListAccountsForParentCommand,
  ListOrganizationalUnitsForParentCommand,
  ListRootsCommand,
  MoveAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { throttlingBackOff } from '@aws-accelerator/utils';

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
let cloudformationClient: CloudFormationClient;
let organizationsClient: OrganizationsClient;

type ConfigOrganizationalUnitKeys = {
  acceleratorKey: string;
  awsKey: string;
  registered: boolean | undefined;
  ignore: boolean;
};

type AwsOrganizationalUnitKeys = {
  acceleratorKey: string;
  awsKey: string;
};

type DDBItem = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};
type DDBItems = Array<DDBItem>;

let mandatoryAccounts: DDBItems = [];
let workloadAccounts: DDBItems = [];
const awsOuKeys: AwsOrganizationalUnitKeys[] = [];

/**
 * validate-environment - lambda handler
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
  const stackName = event.ResourceProperties['stackName'];
  const solutionId = process.env['SOLUTION_ID'];

  organizationsClient = new OrganizationsClient({
    region: event.ResourceProperties['globalRegion'],
    customUserAgent: solutionId,
  });

  dynamodbClient = new DynamoDBClient({ customUserAgent: solutionId });
  documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);
  cloudformationClient = new CloudFormationClient({ customUserAgent: solutionId });
  paginationConfig = {
    client: documentClient,
    pageSize: 100,
  };

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // if stack rollback is in progress don't do anything
      // the stack may have failed as the results of errors
      // from this construct
      // when rolling back this construct will execute and
      // fail again preventing stack rollback
      if (await isStackInRollback(stackName)) {
        return {
          Status: 'SUCCESS',
        };
      }
      console.log(`Configuration repository commit id ${commitId}`);

      const configAllOuKeys = await getConfigOuKeys(configTableName, commitId);

      mandatoryAccounts = await getConfigFromTableForCommit(configTableName, 'mandatoryAccount', commitId);
      workloadAccounts = await getConfigFromTableForCommit(configTableName, 'workloadAccount', commitId);

      const allAccountsFromConfigTable: DDBItems = mandatoryAccounts;
      for (const workloadAccount of workloadAccounts) {
        allAccountsFromConfigTable.push(workloadAccount);
      }

      await getAwsOrganizationalUnitKeys(await getRootId(), '');
      const allOrganizationAccounts = await getOrganizationAccounts(configAllOuKeys);

      const rootId = await getRootId();
      awsOuKeys.push({
        acceleratorKey: 'Root',
        awsKey: rootId,
      });

      await moveAccounts(awsOuKeys, allAccountsFromConfigTable, allOrganizationAccounts);

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

/**
 * Function to prepare list of accounts needs to move between org based on account config change
 * @param allAwsOuKeys
 * @param allAccountsFromConfigTable
 * @param allAccountsFromOrganization
 */
async function moveAccounts(
  allAwsOuKeys: AwsOrganizationalUnitKeys[],
  allAccountsFromConfigTable: DDBItems,
  allAccountsFromOrganization: { ouId: string; accountId: string; status: string }[],
): Promise<void> {
  const moveAccountList: {
    accountName: string;
    accountId: string;
    destinationParentName: string;
    destinationParentId: string;
    sourceParentName: string;
    sourceParentId: string;
  }[] = [];

  for (const account of allAccountsFromConfigTable) {
    // This is for new account yet to be created, in this case awsKey will not be present in config table
    if (!account['awsKey']) {
      console.warn(
        `Found account with email ${account['acceleratorKey']} without account id, account yet to be created !!!, ignoring the account for move accounts `,
      );
      continue;
    }

    const awsOuKey = allAwsOuKeys.find(ouKeyItem => ouKeyItem.acceleratorKey === account['ouName']);
    const awsAccountOuKey = allAccountsFromOrganization.find(
      accountOuKeyItem => accountOuKeyItem.accountId === account['awsKey'],
    );

    if (!awsOuKey) {
      throw new Error(
        `Source Ou ID ${account['ouName']} not found for account with email ${account['acceleratorKey']} to perform move account operation`,
      );
    }

    if (!awsAccountOuKey) {
      throw new Error(
        `Account with email ${account['acceleratorKey']} not found to determine source ou id for move account operation`,
      );
    }

    if (awsOuKey.awsKey !== awsAccountOuKey.ouId) {
      const sourceAwsOuKey = allAwsOuKeys.find(ouKeyItem => ouKeyItem.awsKey === awsAccountOuKey.ouId);
      if (!sourceAwsOuKey) {
        throw new Error(
          `Target Ou ID ${awsAccountOuKey.ouId} not found for account with email ${account['acceleratorKey']} to perform move accounts operation`,
        );
      }
      moveAccountList.push({
        accountName: account['acceleratorKey'],
        accountId: account['awsKey'],
        destinationParentName: awsOuKey.acceleratorKey,
        destinationParentId: awsOuKey.awsKey,
        sourceParentName: sourceAwsOuKey.acceleratorKey,
        sourceParentId: awsAccountOuKey.ouId,
      });
    }
  }

  if (moveAccountList.length === 0) {
    console.log(`There are no accounts to move between ou !!!`);
  } else {
    for (const account of moveAccountList) {
      await moveAccount(account);
    }
  }
}

/**
 * Function to move account between ou
 * @param account
 */
async function moveAccount(account: {
  accountName: string;
  accountId: string;
  destinationParentName: string;
  destinationParentId: string;
  sourceParentName: string;
  sourceParentId: string;
}) {
  console.log(
    `Moving account with email ${account.accountName} from ${account.sourceParentName} ou to ${account.destinationParentName} ou`,
  );
  try {
    await throttlingBackOff(() =>
      organizationsClient.send(
        new MoveAccountCommand({
          AccountId: account.accountId,
          DestinationParentId: account.destinationParentId,
          SourceParentId: account.sourceParentId,
        }),
      ),
    );
    console.log(
      `Account with email ${account.accountName} successfully moved from ${account.sourceParentName} ou to ${account.destinationParentName} ou`,
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

async function getOrganizationAccounts(
  organizationalUnitKeys: ConfigOrganizationalUnitKeys[],
): Promise<{ ouId: string; accountId: string; status: string }[]> {
  const organizationAccounts: { ouId: string; accountId: string; accountName: string; status: string }[] = [];
  for (const ouKey of organizationalUnitKeys) {
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        organizationsClient.send(new ListAccountsForParentCommand({ ParentId: ouKey.awsKey, NextToken: nextToken })),
      );
      for (const account of page.Accounts ?? []) {
        organizationAccounts.push({
          ouId: ouKey.awsKey,
          accountId: account.Id!,
          accountName: account.Name!,
          status: account.Status!,
        });
      }
      nextToken = page.NextToken;
    } while (nextToken);
  }
  return organizationAccounts;
}

async function getConfigFromTableForCommit(
  configTableName: string,
  dataType: string,
  commitId: string,
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
  const items: DDBItems = [];
  const paginator = paginateQuery(paginationConfig, params);
  for await (const page of paginator) {
    if (page.Items) {
      for (const item of page.Items) {
        items.push(item);
      }
    }
  }
  return items;
}

async function isStackInRollback(stackName: string): Promise<boolean> {
  const response = await throttlingBackOff(() =>
    cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName })),
  );
  if (response.Stacks && response.Stacks[0].StackStatus == 'UPDATE_ROLLBACK_IN_PROGRESS') {
    return true;
  }
  return false;
}

async function getRootId(): Promise<string> {
  // get root ou id
  let rootId = '';
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.send(new ListRootsCommand({ NextToken: nextToken })),
    );
    for (const item of page.Roots ?? []) {
      if (item.Name === 'Root' && item.Id && item.Arn) {
        rootId = item.Id;
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return rootId;
}

async function getConfigOuKeys(configTableName: string, commitId: string): Promise<ConfigOrganizationalUnitKeys[]> {
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

      if (item['awsKey']) {
        ouKeys.push({
          acceleratorKey: item['acceleratorKey'],
          awsKey: item['awsKey'],
          registered: item['registered'] ?? undefined,
          ignore: ignored,
        });
      }
    }
  }
  //get root ou key
  const rootId = await getRootId();
  ouKeys.push({
    acceleratorKey: 'Root',
    awsKey: rootId,
    registered: true,
    ignore: false,
  });
  return ouKeys;
}

async function getAwsOrganizationalUnitKeys(ouId: string, path: string) {
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      organizationsClient.send(new ListOrganizationalUnitsForParentCommand({ ParentId: ouId, NextToken: nextToken })),
    );
    for (const ou of page.OrganizationalUnits ?? []) {
      awsOuKeys.push({ acceleratorKey: `${path}${ou.Name!}`, awsKey: ou.Id! });
      await getAwsOrganizationalUnitKeys(ou.Id!, `${path}${ou.Name!}/`);
    }
    nextToken = page.NextToken;
  } while (nextToken);
}

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
  OrganizationsClient,
  ListRootsCommand,
  ListRootsCommandOutput,
  ListAccountsCommand,
  ListAccountsCommandOutput,
  InviteAccountToOrganizationCommand,
  AcceptHandshakeCommand,
  MoveAccountCommand,
} from '@aws-sdk/client-organizations';
import { DynamoDBDocumentClient, paginateQuery, DynamoDBDocumentPaginationConfiguration } from '@aws-sdk/lib-dynamodb';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

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
let dynamodbClient: DynamoDBClient;
let documentClient: DynamoDBDocumentClient;
let paginationConfig: DynamoDBDocumentPaginationConfiguration;

type OrganizationIdentifier = {
  acceleratorKey: string;
  awsKey: string;
};
type OrganizationIdentifiers = Array<OrganizationIdentifier>;

type AccountDetail = {
  accountId: string;
  ouName: string;
};
type AccountDetails = Array<AccountDetail>;

/**
 * invite-account-to-organization - lambda handler
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
  const assumeRoleName = event.ResourceProperties['assumeRoleName'];
  const partition = event.ResourceProperties['partition'];
  const solutionId = process.env['SOLUTION_ID'];

  dynamodbClient = new DynamoDBClient({ customUserAgent: solutionId });
  documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);
  paginationConfig = {
    client: documentClient,
    pageSize: 100,
  };

  let organizationsClient: OrganizationsClient;
  if (partition === 'aws-us-gov') {
    organizationsClient = new OrganizationsClient({ region: 'us-gov-west-1', customUserAgent: solutionId });
  } else if (partition === 'aws-cn') {
    organizationsClient = new OrganizationsClient({ region: 'cn-northwest-1', customUserAgent: solutionId });
  } else {
    organizationsClient = new OrganizationsClient({ region: 'us-east-1', customUserAgent: solutionId });
  }

  if (partition !== 'aws-us-gov') {
    return {
      Status: 'SUCCESS',
    };
  }
  console.log('CommitId: ', commitId);

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      const rootId = await getRootId(organizationsClient);
      console.log('Organizations Root Id: ', rootId);
      const accountsInOu = await listAccountsInOrganization(organizationsClient);
      const accountsInConfig = await getAccountsFromTable(configTableName, commitId);
      const organizationalUnitsInConfig = await getOrganizationsFromTable(configTableName, commitId);

      for (const account of accountsInConfig) {
        if (accountsInOu.find(item => item == account.accountId)) {
          console.log(`Account ${account.accountId} already added to organization`);
          continue;
        }
        const ouForAccount = organizationalUnitsInConfig.find(ou => ou.acceleratorKey === account.ouName);
        if (ouForAccount?.awsKey) {
          const roleArn = `arn:${partition}:iam::${account.accountId}:role/${assumeRoleName}`;
          await inviteAccountToOu(
            organizationsClient,
            account.accountId,
            roleArn,
            partition,
            rootId,
            ouForAccount?.awsKey,
          );
        } else {
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

async function inviteAccountToOu(
  organizationsClient: OrganizationsClient,
  accountId: string,
  roleArn: string,
  partition: string,
  rootId: string,
  organizationalUnitId: string,
): Promise<boolean> {
  console.log('InviteAccountToOrganizationCommand');
  const invite = await organizationsClient.send(
    new InviteAccountToOrganizationCommand({ Target: { Type: 'ACCOUNT', Id: accountId } }),
  );
  console.log(`Invite handshake id: ${invite.Handshake?.Id}`);

  const stsClient = new STSClient({});

  const assumeRoleResponse = await stsClient.send(
    new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'AcceptHandshakeSession' }),
  );

  let acceptOrganizationsClient: OrganizationsClient;
  if (partition === 'aws-us-gov') {
    acceptOrganizationsClient = new OrganizationsClient({
      credentials: {
        accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
        secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
        sessionToken: assumeRoleResponse.Credentials?.SessionToken,
      },
      region: 'us-gov-west-1',
    });
  } else if (partition === 'aws-cn') {
    acceptOrganizationsClient = new OrganizationsClient({
      credentials: {
        accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
        secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
        sessionToken: assumeRoleResponse.Credentials?.SessionToken,
      },
      region: 'cn-northwest-1',
    });
  } else {
    acceptOrganizationsClient = new OrganizationsClient({
      credentials: {
        accessKeyId: assumeRoleResponse.Credentials?.AccessKeyId ?? '',
        secretAccessKey: assumeRoleResponse.Credentials?.SecretAccessKey ?? '',
        sessionToken: assumeRoleResponse.Credentials?.SessionToken,
      },
      region: 'us-east-1',
    });
  }

  console.log('AcceptHandshakeCommand');
  const acceptResponse = await acceptOrganizationsClient.send(
    new AcceptHandshakeCommand({ HandshakeId: invite.Handshake!.Id! }),
  );
  console.log(acceptResponse);

  console.log('Move account to OU');
  const moveResponse = await organizationsClient.send(
    new MoveAccountCommand({
      AccountId: accountId,
      SourceParentId: rootId,
      DestinationParentId: organizationalUnitId,
    }),
  );
  console.log(moveResponse);

  return true;
}

async function getRootId(organizationsClient: OrganizationsClient): Promise<string> {
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

async function getOrganizationsFromTable(configTableName: string, commitId: string): Promise<OrganizationIdentifiers> {
  const params = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'organization',
      ':commitId': commitId,
    },
    FilterExpression: 'contains (commitId, :commitId)',
  };

  const items: OrganizationIdentifiers = [];
  const paginator = paginateQuery(paginationConfig, params);
  for await (const page of paginator) {
    if (page.Items) {
      for (const item of page.Items) {
        items.push({ acceleratorKey: item['acceleratorKey'], awsKey: item['awsKey'] });
      }
    }
  }
  return items;
}

async function getAccountsFromTable(configTableName: string, commitId: string): Promise<AccountDetails> {
  const workloadAccountParams = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'workloadAccount',
      ':commitId': commitId,
    },
    FilterExpression: 'contains (commitId, :commitId)',
  };

  const items: AccountDetails = [];
  const workloadPaginator = paginateQuery(paginationConfig, workloadAccountParams);
  for await (const page of workloadPaginator) {
    if (page.Items) {
      for (const item of page.Items) {
        items.push({ accountId: item['awsKey'], ouName: item['ouName'] });
      }
    }
  }

  const mandatoryAccountParams = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'mandatoryAccount',
      ':commitId': commitId,
    },
    FilterExpression: 'contains (commitId, :commitId)',
  };

  const mandatoryPaginator = paginateQuery(paginationConfig, mandatoryAccountParams);
  for await (const page of mandatoryPaginator) {
    if (page.Items) {
      for (const item of page.Items) {
        items.push({ accountId: item['awsKey'], ouName: item['ouName'] });
      }
    }
  }
  return items;
}

async function listAccountsInOrganization(organizationsClient: OrganizationsClient): Promise<string[]> {
  const accountsInOu: string[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page: ListAccountsCommandOutput = await organizationsClient.send(
      new ListAccountsCommand({ NextToken: nextToken }),
    );
    for (const item of page.Accounts ?? []) {
      accountsInOu.push(item.Id!);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return accountsInOu;
}

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

import * as AWS from 'aws-sdk';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  PutCommandInput,
  QueryCommand,
  QueryCommandInput,
  paginateQuery,
  DynamoDBDocumentPaginationConfiguration,
} from '@aws-sdk/lib-dynamodb';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
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
const dynamodbClient = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);
const serviceCatalogClient = new AWS.ServiceCatalog();
const cloudformationClient = new CloudFormationClient({});
let organizationsClient: AWS.Organizations;
const paginationConfig: DynamoDBDocumentPaginationConfiguration = {
  client: documentClient,
  pageSize: 100,
};

type AccountToAdd = {
  name: string;
  description: string;
  email: string;
  enableGovCloud?: boolean;
  organizationalUnitId: string;
};

type OrganizationalUnitKeys = {
  acceleratorKey: string;
  awsKey: string;
};

type DDBItem = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};
type DDBItems = Array<DDBItem>;

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
  const partition = event.ResourceProperties['partition'];
  const configTableName = event.ResourceProperties['configTableName'];
  const newOrgAccountsTableName = event.ResourceProperties['newOrgAccountsTableName'];
  const newCTAccountsTableName = event.ResourceProperties['newCTAccountsTableName'];
  const controlTowerEnabled = event.ResourceProperties['controlTowerEnabled'];
  const commitId = event.ResourceProperties['commitId'];
  const stackName = event.ResourceProperties['stackName'];
  const validationErrors: string[] = [];
  const ctAccountsToAdd = [];
  const orgAccountsToAdd = [];

  if (partition === 'aws-us-gov') {
    organizationsClient = new AWS.Organizations({ region: 'us-gov-west-1' });
  } else {
    organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
  }

  console.log(stackName);
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
      // get accounts from organizations
      const organizationAccounts = await getOrganizationAccounts();

      const mandatoryAccounts = await getConfigFromTableForCommit(configTableName, 'mandatoryAccount', commitId);
      const workloadAccounts = await getConfigFromTableForCommit(configTableName, 'workloadAccount', commitId);
      if (controlTowerEnabled === 'true' && mandatoryAccounts) {
        // confirm mandatory accounts exist in aws
        for (const mandatoryAccount of mandatoryAccounts) {
          const existingAccount = organizationAccounts.find(item => item.Email == mandatoryAccount['acceleratorKey']);
          if (existingAccount?.Status == 'ACTIVE') {
            console.log(`Mandatory Account ${mandatoryAccount['acceleratorKey']} exists.`);
          } else {
            validationErrors.push(
              `Mandatory account ${mandatoryAccount['acceleratorKey']} does not exist in AWS or is suspended`,
            );
          }
        }

        const validateOrganizationalUnits = await validateOrganizationalUnitsExist(configTableName, commitId);
        validationErrors.push(...validateOrganizationalUnits);

        const validateAccountsAreInOu = await validateAccountsInOu(configTableName, commitId);
        validationErrors.push(...validateAccountsAreInOu);

        // retrieve all of the accounts provisioned in control tower
        const provisionedControlTowerAccounts = await getControlTowerProvisionedAccounts();
        // confirm workload accounts exist in control tower without errors
        if (workloadAccounts) {
          for (const workloadAccount of workloadAccounts) {
            const accountConfig = JSON.parse(workloadAccount['dataBag']);
            const accountName = accountConfig['name'];
            const provisionedControlTowerAccount = provisionedControlTowerAccounts.find(
              pcta => pcta.Name == accountName,
            );
            if (provisionedControlTowerAccount) {
              switch (provisionedControlTowerAccount['Status']) {
                case 'AVAILABLE':
                  break;
                case 'TAINTED':
                  validationErrors.push(
                    `AWS Account ${workloadAccount['acceleratorKey']} is TAINTED state. Message: ${provisionedControlTowerAccount.StatusMessage}. Check Service Catalog`,
                  );
                  break;
                case 'ERROR':
                  validationErrors.push(
                    `AWS Account ${workloadAccount['acceleratorKey']} is in ERROR state. Message: ${provisionedControlTowerAccount.StatusMessage}. Check Service Catalog`,
                  );
                  break;
                case 'UNDER_CHANGE':
                  break;
                case 'PLAN_IN_PROGRESS':
                  break;
              }
            } else {
              // confirm account doesn't exist in control tower with a different name
              // if enrolled directly in console the name in service catalog won't match
              // look up by physical id if it exists
              const checkAccountId = organizationAccounts.find(oa => oa.Email == workloadAccount['acceleratorKey']);
              if (checkAccountId) {
                const provisionedControlTowerAccount = provisionedControlTowerAccounts.find(
                  pcta => pcta.PhysicalId === checkAccountId.Id,
                );
                if (
                  provisionedControlTowerAccount?.Status === 'TAINTED' ||
                  provisionedControlTowerAccount?.Status === 'ERROR'
                ) {
                  validationErrors.push(
                    `AWS Account ${workloadAccount['acceleratorKey']} is in ERROR state. Message: ${provisionedControlTowerAccount.StatusMessage}. Check Service Catalog`,
                  );
                }
                if (!provisionedControlTowerAccount) {
                  ctAccountsToAdd.push(workloadAccount);
                }
              } else {
                ctAccountsToAdd.push(workloadAccount);
              }
            }
          }
        }
      }

      // find organization accounts that need to be created
      console.log(`controlTowerEnabled value: ${controlTowerEnabled}`);
      if (controlTowerEnabled === 'false' && mandatoryAccounts) {
        for (const mandatoryAccount of mandatoryAccounts) {
          const mandatoryOrganizationAccount = organizationAccounts.find(
            item => item.Email == mandatoryAccount['acceleratorKey'],
          );
          if (mandatoryOrganizationAccount) {
            if (mandatoryOrganizationAccount.Status !== 'ACTIVE') {
              validationErrors.push(
                `Mandatory account ${mandatoryAccount['acceleratorKey']} is in ${mandatoryOrganizationAccount.Status}`,
              );
            }
          } else {
            orgAccountsToAdd.push(mandatoryAccount);
          }
        }
      }
      if (workloadAccounts) {
        for (const workloadAccount of workloadAccounts) {
          const organizationAccount = organizationAccounts.find(
            item => item.Email == workloadAccount['acceleratorKey'],
          );
          if (organizationAccount) {
            if (organizationAccount.Status !== 'ACTIVE') {
              validationErrors.push(
                `Workload account ${workloadAccount['acceleratorKey']} is in ${organizationAccount.Status}`,
              );
            }
          } else {
            const accountConfig = JSON.parse(workloadAccount['dataBag']);
            if (controlTowerEnabled === 'false' || accountConfig['enableGovCloud']) {
              orgAccountsToAdd.push(workloadAccount);
            }
          }
        }
      }

      const organizationalUnitKeys = await getOUKeys(configTableName, commitId);
      // put accounts to create in DynamoDb
      console.log(`Org Accounts to add: ${JSON.stringify(orgAccountsToAdd)}`);
      for (const account of orgAccountsToAdd) {
        const accountOu = organizationalUnitKeys.find(item => item.acceleratorKey === account['ouName']);
        const parsedDataBag = JSON.parse(account['dataBag']);
        let accountConfig: AccountToAdd;
        if (accountOu?.awsKey) {
          accountConfig = {
            name: parsedDataBag['name'],
            email: account['acceleratorKey'],
            description: parsedDataBag['description'],
            enableGovCloud: parsedDataBag['enableGovCloud'] || false,
            organizationalUnitId: accountOu?.awsKey,
          };
          const params: PutCommandInput = {
            TableName: newOrgAccountsTableName,
            Item: {
              accountEmail: accountConfig.email,
              accountConfig: JSON.stringify(accountConfig),
            },
          };
          await throttlingBackOff(() => documentClient.send(new PutCommand(params)));
        } else {
          // should not get here we just created and validated all of the ou's.
          validationErrors.push(`Unable to find Organizational Unit ${account['ouName']} in configuration`);
        }
      }

      console.log(`CT Accounts to add: ${JSON.stringify(ctAccountsToAdd)}`);
      for (const account of ctAccountsToAdd) {
        const accountOu = organizationalUnitKeys.find(item => item.acceleratorKey === account['ouName']);
        const parsedDataBag = JSON.parse(account['dataBag']);
        let accountConfig: AccountToAdd;
        if (accountOu?.awsKey) {
          accountConfig = {
            name: parsedDataBag['name'],
            email: account['acceleratorKey'],
            description: parsedDataBag['description'],
            // formatting for CT requirements to support nested ou's
            organizationalUnitId: (await getOuName(account['ouName'])) + ` (${accountOu.awsKey})`,
          };
          const params: PutCommandInput = {
            TableName: newCTAccountsTableName,
            Item: {
              accountEmail: accountConfig.email,
              accountConfig: JSON.stringify(accountConfig),
            },
          };
          await throttlingBackOff(() => documentClient.send(new PutCommand(params)));
        } else {
          // should not get here we just created and validated all of the ou's.
          validationErrors.push(`Unable to find Organizational Unit ${account['ouName']} in configuration`);
        }
      }

      console.log(`validationErrors: ${JSON.stringify(validationErrors)}`);

      if (validationErrors.length > 0) {
        throw new Error(validationErrors.toString());
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

async function getOuName(name: string): Promise<string> {
  const result = name.split('/').pop();
  if (result === undefined) {
    return name;
  }
  return result;
}

async function getControlTowerProvisionedAccounts(): Promise<AWS.ServiceCatalog.ProvisionedProductAttribute[]> {
  const provisionedProducts: AWS.ServiceCatalog.ProvisionedProductAttribute[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      serviceCatalogClient
        .searchProvisionedProducts({
          Filters: {
            SearchQuery: ['type: CONTROL_TOWER_ACCOUNT'],
          },
          AccessLevelFilter: {
            Key: 'Account',
            Value: 'self',
          },
          PageToken: nextToken,
        })
        .promise(),
    );

    for (const product of page.ProvisionedProducts ?? []) {
      provisionedProducts.push(product);
    }
    nextToken = page.NextPageToken;
  } while (nextToken);

  //console.log(`Provisioned Control Tower Accounts ${JSON.stringify(provisionedProducts)}`);
  return provisionedProducts;
}

async function getOrganizationAccounts(): Promise<AWS.Organizations.Account[]> {
  const organizationAccounts: AWS.Organizations.Account[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => organizationsClient.listAccounts({ NextToken: nextToken }).promise());
    for (const account of page.Accounts ?? []) {
      organizationAccounts.push(account);
    }
    nextToken = page.NextToken;
  } while (nextToken);

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

async function validateOrganizationalUnitsExist(configTableName: string, commitId: string): Promise<string[]> {
  const errors: string[] = [];
  const organizationalUnitKeys = await getOUKeys(configTableName, commitId);
  const missingOrganizationalUnits = organizationalUnitKeys.filter(item => item.awsKey === undefined);

  if (missingOrganizationalUnits.length > 0) {
    for (const item of missingOrganizationalUnits) {
      console.log(`Organizational Unit ${item.acceleratorKey} does not exist in AWS`);
      errors.push(
        `Organizational Unit ${item.acceleratorKey} does not exist in AWS. Either remove from configuration or add OU via console`,
      );
    }
  }
  return errors;
}

async function validateAccountsInOu(configTableName: string, commitId: string): Promise<string[]> {
  const errors: string[] = [];
  let nextToken: string | undefined = undefined;
  const organizationalUnitKeys = await getOUKeys(configTableName, commitId);

  const workloadAccountParams: QueryCommandInput = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'workloadAccount',
    },
    ProjectionExpression: 'acceleratorKey, awsKey, ouName',
  };
  const workloadAccountResponse = await throttlingBackOff(() =>
    documentClient.send(new QueryCommand(workloadAccountParams)),
  );
  const workloadAccountKeys: { acceleratorKey: string; awsKey: string; ouName: string }[] = [];
  if (workloadAccountResponse.Items) {
    for (const item of workloadAccountResponse.Items) {
      workloadAccountKeys.push({
        acceleratorKey: item['acceleratorKey'],
        awsKey: item['awsKey'],
        ouName: item['ouName'],
      });
    }
  }
  //console.log(workloadAccountKeys);

  const mandatoryAccountParams: QueryCommandInput = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'mandatoryAccount',
    },
    ProjectionExpression: 'acceleratorKey, awsKey, ouName',
  };
  const mandatoryAccountResponse = await throttlingBackOff(() =>
    documentClient.send(new QueryCommand(mandatoryAccountParams)),
  );
  const mandatoryAccountKeys: { acceleratorKey: string; awsKey: string; ouName: string }[] = [];
  if (mandatoryAccountResponse.Items) {
    for (const item of mandatoryAccountResponse.Items) {
      mandatoryAccountKeys.push({
        acceleratorKey: item['acceleratorKey'],
        awsKey: item['awsKey'],
        ouName: item['ouName'],
      });
    }
  }
  //console.log(mandatoryAccountKeys);

  const accountKeys = mandatoryAccountKeys;
  accountKeys.push(...workloadAccountKeys);

  for (const ou of organizationalUnitKeys) {
    const children: string[] = [];
    // if we don't have an awsKey then we didn't find the OU don't attempt to lookup child accounts
    if (!ou.awsKey) {
      continue;
    }
    do {
      const page = await throttlingBackOff(() =>
        organizationsClient.listChildren({ ChildType: 'ACCOUNT', ParentId: ou.awsKey, NextToken: nextToken }).promise(),
      );
      for (const child of page.Children ?? []) {
        const account = accountKeys.find(item => item.awsKey === child.Id);
        if (account) {
          children.push(account.awsKey);
          if (account.ouName !== ou.acceleratorKey) {
            errors.push(
              `Account ${account.acceleratorKey} with account id ${account.awsKey} is not in the correct OU. Account is in the ou named ${ou.acceleratorKey} and should be in ${account.ouName}`,
            );
          }
        } else {
          errors.push(`Found account with id ${child.Id} in OU ${ou.acceleratorKey} that is not in the configuration.`);
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
    console.log(`OU Name: ${ou.acceleratorKey} Child Account ID's: ${children}`);
  }

  return errors;
}

async function getOUKeys(configTableName: string, commitId: string): Promise<OrganizationalUnitKeys[]> {
  const organizationParams: QueryCommandInput = {
    TableName: configTableName,
    KeyConditionExpression: 'dataType = :hkey',
    ExpressionAttributeValues: {
      ':hkey': 'organization',
      ':commitId': commitId,
    },
    FilterExpression: 'contains (commitId, :commitId)',
    ProjectionExpression: 'acceleratorKey, awsKey',
  };
  const organizationResponse = await throttlingBackOff(() => documentClient.send(new QueryCommand(organizationParams)));
  const ouKeys: OrganizationalUnitKeys[] = [];
  if (organizationResponse.Items) {
    for (const item of organizationResponse.Items) {
      ouKeys.push({ acceleratorKey: item['acceleratorKey'], awsKey: item['awsKey'] });
    }
  }
  //console.log(ouKeys);
  return ouKeys;
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

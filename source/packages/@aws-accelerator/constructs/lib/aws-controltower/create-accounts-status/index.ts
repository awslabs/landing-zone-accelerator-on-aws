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
/**
 * aws-controltower-create-accounts-status - lambda handler
 *
 * @param event
 * @returns
 */

import * as AWS from 'aws-sdk';
import { throttlingBackOff } from '@aws-accelerator/utils';
import { v4 as uuidv4 } from 'uuid';

const tableName = process.env['NewAccountsTableName'] ?? '';
const solutionId = process.env['SOLUTION_ID'] ?? '';

const documentClient = new AWS.DynamoDB.DocumentClient({ customUserAgent: solutionId });
const serviceCatalogClient = new AWS.ServiceCatalog({ customUserAgent: solutionId });

interface AccountConfig {
  name: string;
  description: string;
  email: string;
  enableGovCloud?: boolean;
  organizationalUnitId?: string;
  createRequestId?: string;
}

type AccountConfigs = Array<AccountConfig>;

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<
  | {
      IsComplete: boolean;
    }
  | undefined
> {
  console.log(event);
  // if provisioning is in progress return
  // we cannot provision another account while
  // an account is being provisioned
  const accountsInProcess = await inProgress();
  if (accountsInProcess === 5) {
    console.log('Account provisioning in progress continuing to wait');
    return {
      IsComplete: false,
    };
  }

  try {
    //get a single accountConfig from table and attempt to provision
    //if no record is returned then all new accounts are provisioned
    const accountToAdd: AccountConfigs = await getSingleAccountConfigFromTable();
    if (accountToAdd.length === 0 && accountsInProcess === 0) {
      //check if any accounts in error or tainted state
      if (await provisionSuccess()) {
        console.log('Control Tower account provisioning complete.');
      } else {
        console.log('Control Tower account provisioning failed.');
        throw new Error('Accounts failed to enroll in Control Tower. Check Service Catalog Console');
      }

      return {
        IsComplete: true,
      };
    }

    if (accountToAdd.length > 0) {
      const provisionResponse = await provisionAccount(accountToAdd[0]);
      console.log(`Provision response: ${JSON.stringify(provisionResponse)}`);

      const deleteResponse = await deleteSingleAccountConfigFromTable(accountToAdd[0].email);
      console.log(`Delete response: ${JSON.stringify(deleteResponse)}`);
    }

    return {
      IsComplete: false,
    };
  } catch (e) {
    console.log(e);
    console.log(`Create accounts failed. Deleting pending account creation records`);
    await deleteAllRecordsFromTable(tableName);
    throw new Error(`Account creation failed. ${e}`);
  }
}

async function inProgress(): Promise<number> {
  const provisionedProductsUnderChange: AWS.ServiceCatalog.ProvisionedProductAttribute[] =
    await getProvisionedProductsWithStatus('UNDER_CHANGE');
  let accountsInProcess = 0;
  if (provisionedProductsUnderChange.length > 0) {
    console.log(`Products that are UNDER_CHANGE ${provisionedProductsUnderChange.length}`);
    accountsInProcess = accountsInProcess + provisionedProductsUnderChange.length;
  }

  const provisionedProductsPlan: AWS.ServiceCatalog.ProvisionedProductAttribute[] =
    await getProvisionedProductsWithStatus('PLAN_IN_PROGRESS');
  if (provisionedProductsPlan.length > 0) {
    console.log(`Products that are PLAN_IN_PROGRESS ${provisionedProductsPlan.length}`);
    accountsInProcess = accountsInProcess + provisionedProductsPlan.length;
  }

  console.log(`Total number of accounts in process ${accountsInProcess}`);
  return accountsInProcess;
}

async function provisionSuccess(): Promise<boolean> {
  const provisionedProductsError: AWS.ServiceCatalog.ProvisionedProductAttribute[] =
    await getProvisionedProductsWithStatus('ERROR');
  if (provisionedProductsError.length > 0) {
    console.log(`Provisioning failure error message: ${provisionedProductsError[0].StatusMessage}`);
    return false;
  }

  const provisionedProductsTainted: AWS.ServiceCatalog.ProvisionedProductAttribute[] =
    await getProvisionedProductsWithStatus('TAINTED');
  if (provisionedProductsTainted.length > 0) {
    return false;
  }

  return true;
}

async function getProvisionedProductsWithStatus(
  searchStatus: string,
): Promise<AWS.ServiceCatalog.ProvisionedProductAttribute[]> {
  const provisionedProducts: AWS.ServiceCatalog.ProvisionedProductAttribute[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      serviceCatalogClient
        .searchProvisionedProducts({
          Filters: {
            SearchQuery: [`status: ${searchStatus}`],
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
      if (product.Type === 'CONTROL_TOWER_ACCOUNT') {
        provisionedProducts.push(product);
      }
    }
    nextToken = page.NextPageToken;
  } while (nextToken);

  return provisionedProducts;
}

async function getSingleAccountConfigFromTable(): Promise<AccountConfigs> {
  const accountToAdd: AccountConfigs = [];
  const scanParams = {
    TableName: tableName,
    Limit: 1,
  };
  const response = await throttlingBackOff(() => documentClient.scan(scanParams).promise());

  console.log(`getSingleAccount response ${JSON.stringify(response)}`);
  const itemCount = response.Items?.length ?? 0;
  if (itemCount > 0) {
    const account: AccountConfig = JSON.parse(response.Items![0]['accountConfig']);
    accountToAdd.push(account);
    console.log(`Account to add ${JSON.stringify(accountToAdd)}`);
  }
  return accountToAdd;
}

async function deleteSingleAccountConfigFromTable(accountToDeleteEmail: string): Promise<string> {
  const deleteParams = {
    TableName: tableName,
    Key: {
      accountEmail: accountToDeleteEmail,
    },
  };
  const response = await throttlingBackOff(() => documentClient.delete(deleteParams).promise());
  return JSON.stringify(response);
}

async function provisionAccount(accountToAdd: AccountConfig): Promise<AWS.ServiceCatalog.ProvisionProductOutput> {
  const provisionToken = uuidv4();

  const searchProductsCommandOutput = await throttlingBackOff(() =>
    serviceCatalogClient
      .searchProducts({ Filters: { FullTextSearch: ['AWS Control Tower Account Factory'] } })
      .promise(),
  );

  const productId = searchProductsCommandOutput?.ProductViewSummaries?.[0]?.ProductId ?? '';

  console.log(`Service Catalog ProductId ${productId}`);

  const listProvisioningArtifactsOutput = await throttlingBackOff(() =>
    serviceCatalogClient.listProvisioningArtifacts({ ProductId: productId }).promise(),
  );

  const provisioningArtifact = listProvisioningArtifactsOutput?.ProvisioningArtifactDetails?.find(a => a.Active);
  const provisioningArtifactId = provisioningArtifact?.Id;
  console.log(`Service Catalog Provisioning Artifact Id ${provisioningArtifactId}`);

  const provisionInput = {
    ProductName: 'AWS Control Tower Account Factory',
    ProvisionToken: provisionToken,
    ProvisioningArtifactId: provisioningArtifactId,
    ProvisionedProductName: accountToAdd.name,
    ProvisioningParameters: [
      {
        Key: 'AccountName',
        Value: accountToAdd.name,
      },
      {
        Key: 'AccountEmail',
        Value: accountToAdd.email,
      },
      {
        Key: 'ManagedOrganizationalUnit',
        Value: accountToAdd.organizationalUnitId,
      },
      {
        Key: 'SSOUserEmail',
        Value: accountToAdd.email,
      },
      {
        Key: 'SSOUserFirstName',
        Value: accountToAdd.name,
      },
      {
        Key: 'SSOUserLastName',
        Value: accountToAdd.name,
      },
      {
        Key: 'VPCOptions',
        Value: 'No-Primary-VPC',
      },
      {
        Key: 'VPCRegion',
        Value: 'us-east-1', //dummy value, vpc is not created
      },
      {
        Key: 'VPCCidr',
        Value: '10.0.0.0/16', //dummy value, vpc is not created
      },
      {
        Key: 'PeerVPC',
        Value: 'false', //dummy value, vpc is not created
      },
    ],
  };

  return throttlingBackOff(() => serviceCatalogClient.provisionProduct(provisionInput).promise());
}

async function deleteAllRecordsFromTable(paramTableName: string) {
  const params = {
    TableName: paramTableName,
    ProjectionExpression: 'accountEmail',
  };
  const response = await documentClient.scan(params).promise();
  if (response.Items) {
    for (const item of response.Items) {
      console.log(item['accountEmail']);
      const itemParams = {
        TableName: paramTableName,
        Key: {
          accountEmail: item['accountEmail'],
        },
      };
      await documentClient.delete(itemParams).promise();
    }
  }
}

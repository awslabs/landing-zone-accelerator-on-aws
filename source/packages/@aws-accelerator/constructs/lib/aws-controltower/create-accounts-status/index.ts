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
/**
 * aws-controltower-create-accounts-status - lambda handler
 *
 * @param event
 * @returns
 */

import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  ServiceCatalogClient,
  ListProvisioningArtifactsCommand,
  SearchProductsCommandInput,
  paginateSearchProducts,
  ProductViewSummary,
  paginateSearchProvisionedProducts,
  SearchProvisionedProductsCommandInput,
  ProvisionProductOutput,
  ProvisionProductCommand,
  ProvisionedProductAttribute,
} from '@aws-sdk/client-service-catalog';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';

import { v4 as uuidv4 } from 'uuid';

const tableName = process.env['NewAccountsTableName'] ?? '';
const solutionId = process.env['SOLUTION_ID'] ?? '';

const dynamodbClient = new DynamoDBClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
const documentClient = DynamoDBDocumentClient.from(dynamodbClient);
const serviceCatalogClient = new ServiceCatalogClient({
  customUserAgent: solutionId,
  retryStrategy: setRetryStrategy(),
});

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
  const provisionedProductsUnderChange: ProvisionedProductAttribute[] = await getProvisionedProductsWithStatus(
    'UNDER_CHANGE',
  );
  let accountsInProcess = 0;
  if (provisionedProductsUnderChange.length > 0) {
    console.log(`Products that are UNDER_CHANGE ${provisionedProductsUnderChange.length}`);
    accountsInProcess = accountsInProcess + provisionedProductsUnderChange.length;
  }

  const provisionedProductsPlan: ProvisionedProductAttribute[] = await getProvisionedProductsWithStatus(
    'PLAN_IN_PROGRESS',
  );
  if (provisionedProductsPlan.length > 0) {
    console.log(`Products that are PLAN_IN_PROGRESS ${provisionedProductsPlan.length}`);
    accountsInProcess = accountsInProcess + provisionedProductsPlan.length;
  }

  console.log(`Total number of accounts in process ${accountsInProcess}`);
  return accountsInProcess;
}

async function provisionSuccess(): Promise<boolean> {
  const provisionedProductsError: ProvisionedProductAttribute[] = await getProvisionedProductsWithStatus('ERROR');
  if (provisionedProductsError.length > 0) {
    console.log(`Provisioning failure error message: ${provisionedProductsError[0].StatusMessage}`);
    return false;
  }

  const provisionedProductsTainted: ProvisionedProductAttribute[] = await getProvisionedProductsWithStatus('TAINTED');
  if (provisionedProductsTainted.length > 0) {
    return false;
  }

  return true;
}

async function getProvisionedProductsWithStatus(searchStatus: string): Promise<ProvisionedProductAttribute[]> {
  const provisionedProducts: ProvisionedProductAttribute[] = [];
  const inputParameters: SearchProvisionedProductsCommandInput = {
    Filters: {
      SearchQuery: [`status: ${searchStatus}`],
    },
    AccessLevelFilter: {
      Key: 'Account',
      Value: 'self',
    },
  };
  for await (const page of paginateSearchProvisionedProducts({ client: serviceCatalogClient }, inputParameters)) {
    page?.ProvisionedProducts?.forEach(product => {
      if (product.Type === 'CONTROL_TOWER_ACCOUNT') {
        provisionedProducts.push(product);
      }
    });
  }
  return provisionedProducts;
}

async function getSingleAccountConfigFromTable(): Promise<AccountConfigs> {
  const accountToAdd: AccountConfigs = [];
  const scanParams = {
    TableName: tableName,
    Limit: 1,
  };
  const scanResponse = await throttlingBackOff(() => documentClient.send(new ScanCommand(scanParams)));

  const itemCount = scanResponse.Items?.length ?? 0;
  if (itemCount > 0) {
    const account: AccountConfig = JSON.parse(scanResponse.Items![0]['accountConfig']);
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
  const deleteResponse = await throttlingBackOff(() => documentClient.send(new DeleteCommand(deleteParams)));
  return JSON.stringify(deleteResponse);
}

async function provisionAccount(accountToAdd: AccountConfig): Promise<ProvisionProductOutput> {
  const searchProducts: ProductViewSummary[] = [];
  const inputParameters: SearchProductsCommandInput = {
    Filters: { FullTextSearch: ['AWS Control Tower Account Factory'] },
  };

  for await (const page of paginateSearchProducts({ client: serviceCatalogClient }, inputParameters)) {
    searchProducts.push(...page.ProductViewSummaries!);
  }

  let productId: string;
  if (searchProducts.length === 0) {
    throw new Error('No products were found while searching for AWS Control Tower Account Factory');
  } else if (searchProducts.length > 1) {
    throw new Error('Multiple products were found while searching for AWS Control Tower Account Factory');
  } else {
    productId = searchProducts[0].ProductId!;
    console.log(`Service Catalog ProductId ${productId}`);
  }

  // this is non-paginated command
  // Ref: https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/service-catalog/command/ListProvisioningArtifactsCommand/
  const listProvisioningArtifactsOutput = await throttlingBackOff(() =>
    serviceCatalogClient.send(new ListProvisioningArtifactsCommand({ ProductId: productId })),
  );

  const provisioningArtifact = listProvisioningArtifactsOutput?.ProvisioningArtifactDetails?.find(a => a.Active);
  const provisioningArtifactId = provisioningArtifact?.Id;
  console.log(`Service Catalog Provisioning Artifact Id ${provisioningArtifactId}`);

  const provisionInput = {
    ProductName: 'AWS Control Tower Account Factory',
    ProvisionToken: uuidv4(),
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

  return throttlingBackOff(() => serviceCatalogClient.send(new ProvisionProductCommand(provisionInput)));
}

async function deleteAllRecordsFromTable(paramTableName: string) {
  const params = {
    TableName: paramTableName,
    ProjectionExpression: 'accountEmail',
  };
  const scanResponse = await throttlingBackOff(() => documentClient.send(new ScanCommand(params)));
  if (scanResponse.Items) {
    for (const item of scanResponse.Items) {
      console.log(item['accountEmail']);
      const itemParams = {
        TableName: paramTableName,
        Key: {
          accountEmail: item['accountEmail'],
        },
      };
      await throttlingBackOff(() => documentClient.send(new DeleteCommand(itemParams)));
    }
  }
}

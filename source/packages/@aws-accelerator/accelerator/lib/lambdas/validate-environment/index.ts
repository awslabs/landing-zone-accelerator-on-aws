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
import { throttlingBackOff } from '@aws-accelerator/utils';

//control tower operations are executed from us-east-1 region

const documentClient = new AWS.DynamoDB.DocumentClient();
const serviceCatalogClient = new AWS.ServiceCatalog();
const organizationsClient = new AWS.Organizations({ region: 'us-east-1' });
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
  const workloadAccounts = event.ResourceProperties['workloadAccounts'];
  const mandatoryAccounts = event.ResourceProperties['mandatoryAccounts'];
  const newOrgAccountsTableName = event.ResourceProperties['newOrgAccountsTableName'];
  const newCTAccountsTableName = event.ResourceProperties['newCTAccountsTableName'];
  const controlTowerEnabled = event.ResourceProperties['controlTowerEnabled'];
  const validationErrors: string[] = [];
  const ctAccountsToAdd = [];
  const orgAccountsToAdd = [];

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      // get accounts from organizations
      const organizationAccounts = await getOrganizationAccounts();
      console.log(`Organization Accounts: ${JSON.stringify(organizationAccounts)}`);

      if (controlTowerEnabled == 'true') {
        // confirm mandatory accounts exist
        for (const mandatoryAccount of mandatoryAccounts) {
          const existingAccount = organizationAccounts.find(item => item.Email == mandatoryAccount.email);
          if (existingAccount?.Status == 'ACTIVE') {
            console.log(`Mandatory Account ${mandatoryAccount.email} exists.`);
          } else {
            validationErrors.push(`Mandatory account ${mandatoryAccount.email} does not exist in AWS or is suspended`);
          }
        }

        // TODO: confirm all ou's exist if using control tower
        // retrieve all of the accounts provisioned in control tower
        const provisionedControlTowerAccounts = await getControlTowerProvisionedAccounts();
        // confirm workload accounts exist in control tower without errors
        for (const workloadAccount of workloadAccounts) {
          const provisionedControlTowerAccount = provisionedControlTowerAccounts.find(
            pcta => pcta.Name == workloadAccount.name,
          );
          if (provisionedControlTowerAccount) {
            switch (provisionedControlTowerAccount['Status']) {
              case 'AVAILABLE':
                break;
              case 'TAINTED':
                validationErrors.push(
                  `AWS Account ${workloadAccount.email} is TAINTED state. Message: ${provisionedControlTowerAccount.StatusMessage}. Check Service Catalog`,
                );
                break;
              case 'ERROR':
                validationErrors.push(
                  `AWS Account ${workloadAccount.email} is in ERROR state. Message: ${provisionedControlTowerAccount.StatusMessage}. Check Service Catalog`,
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
            const checkAccountId = organizationAccounts.find(oa => oa.Email == workloadAccount.email);
            if (checkAccountId) {
              const provisionedControlTowerAccount = provisionedControlTowerAccounts.find(
                pcta => pcta.PhysicalId === checkAccountId.Id,
              );
              if (
                provisionedControlTowerAccount?.Status === 'TAINTED' ||
                provisionedControlTowerAccount?.Status === 'ERROR'
              ) {
                validationErrors.push(
                  `AWS Account ${workloadAccount.email} is in ERROR state. Message: ${provisionedControlTowerAccount.StatusMessage}. Check Service Catalog`,
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

      // find organization accounts that need to be created
      if (controlTowerEnabled === 'false') {
        for (const mandatoryAccount of mandatoryAccounts) {
          const mandatoryOrganizationAccount = organizationAccounts.find(item => item.Email == mandatoryAccount.email);
          if (mandatoryOrganizationAccount) {
            if (mandatoryOrganizationAccount.Status !== 'ACTIVE') {
              validationErrors.push(
                `Mandatory account ${mandatoryAccount.email} is in ${mandatoryOrganizationAccount.Status}`,
              );
            }
          } else {
            orgAccountsToAdd.push(mandatoryAccount);
          }
        }
      }
      for (const workloadAccount of workloadAccounts) {
        const organizationAccount = organizationAccounts.find(item => item.Email == workloadAccount.email);
        if (organizationAccount) {
          if (organizationAccount.Status !== 'ACTIVE') {
            validationErrors.push(`Workload account ${workloadAccount.email} is in ${organizationAccount.Status}`);
          }
        } else {
          if (controlTowerEnabled === 'false' || workloadAccount.enableGovCloud) {
            orgAccountsToAdd.push(workloadAccount);
          }
        }
      }

      // put accounts to create in DynamoDb
      console.log(`Org Accounts to add: ${JSON.stringify(orgAccountsToAdd)}`);
      for (const accountToAdd of orgAccountsToAdd) {
        const params = {
          TableName: newOrgAccountsTableName,
          Item: {
            accountEmail: accountToAdd.email,
            accountConfig: JSON.stringify(accountToAdd),
          },
        };
        await throttlingBackOff(() => documentClient.put(params).promise());
      }

      console.log(`CT Accounts to add: ${JSON.stringify(ctAccountsToAdd)}`);
      for (const accountToAdd of ctAccountsToAdd) {
        const params = {
          TableName: newCTAccountsTableName,
          Item: {
            accountEmail: accountToAdd.email,
            accountConfig: JSON.stringify(accountToAdd),
          },
        };
        await throttlingBackOff(() => documentClient.put(params).promise());
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

  console.log(`Provisioned Control Tower Accounts ${JSON.stringify(provisionedProducts)}`);
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

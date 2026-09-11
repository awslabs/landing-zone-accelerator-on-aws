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
 * aws-organization-create-accounts - lambda handler
 *
 * @param event
 * @returns
 */

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { Account, CreateAccountResponse } from '@aws-sdk/client-organizations';
import { getGlobalRegion, setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import { CloudFormationCustomResourceEvent, Context } from '@aws-accelerator/utils/lib/common-types';
import {
  CreateAccountCommand,
  CreateGovCloudAccountCommand,
  DescribeAccountCommand,
  DescribeCreateAccountStatusCommand,
  DescribeCreateAccountStatusResponse,
  ListRootsCommand,
  MoveAccountCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import { AttributeValue, DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const newOrgAccountsTableName = process.env['NewOrgAccountsTableName'] ?? '';
const govCloudAccountMappingTableName = process.env['GovCloudAccountMappingTableName'] ?? '';
const accountRoleName = process.env['AccountRoleName'];
const solutionId = process.env['SOLUTION_ID'] ?? '';
const configTableName = process.env['ConfigTableName'] ?? '';

interface AccountConfig {
  name: string;
  description: string;
  email: string;
  enableGovCloud: string;
  organizationalUnitId: string;
  createRequestId?: string;
}

type AccountConfigs = Array<AccountConfig>;
let organizationsClient: OrganizationsClient;
let documentClient: DynamoDBDocumentClient;

/**
 * Builds the account information cached in the accelerator configuration table.
 *
 * @param email Account email used as the configuration key
 * @param accountId AWS account ID
 * @param orgsApiResponse DescribeAccount response
 * @returns Backward-compatible account cache object with normalized lifecycle state
 */
export function buildAccountOrgInfo(email: string, accountId: string, orgsApiResponse?: Account) {
  return {
    email,
    accountId,
    status: orgsApiResponse?.State ?? orgsApiResponse?.Status,
    orgsApiResponse,
  };
}

/**
 * Determines whether an AWS Organizations account has reached the ACTIVE lifecycle state.
 *
 * Resolves the lifecycle value with `State ?? Status` so it stays correct across the AWS
 * Organizations Status->State field migration: it prefers the current `State` field when the
 * API returns it, and falls back to the legacy `Status` field in partitions/SDKs that only
 * populate `Status`. Using the same resolution as {@link buildAccountOrgInfo} keeps the
 * completion gate and the persisted account cache consistent.
 *
 * @param account DescribeAccount response Account object
 * @returns true only when the resolved lifecycle state is ACTIVE
 */
export function isAccountLifecycleActive(account?: Account): boolean {
  return (account?.State ?? account?.Status) === 'ACTIVE';
}

export async function handler(
  event: CloudFormationCustomResourceEvent,
  context: Context,
): Promise<
  | {
      IsComplete: boolean;
    }
  | undefined
> {
  console.log(event);
  const partition = context.invokedFunctionArn.split(':')[1];
  const globalRegion = getGlobalRegion(partition);
  organizationsClient = new OrganizationsClient({
    region: globalRegion,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  documentClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      customUserAgent: solutionId,
      retryStrategy: setRetryStrategy(),
    }),
  );

  // get a single accountConfig from table and attempt to create
  // if no record is returned then all new accounts are provisioned
  try {
    const accountToAdd = await getSingleAccountConfigFromTable();
    if (accountToAdd.length === 0) {
      console.log('Finished adding accounts');
      return {
        IsComplete: true,
      };
    }

    if (partition === 'aws-us-gov') {
      console.error(
        'Cannot add accounts in the GovCloud partition.  Accounts must be added in the commercial parition.',
      );
      deleteAllRecordsFromTable(newOrgAccountsTableName);
      throw new Error(
        'Cannot create new accounts in the GovCloud partition. Did you add the accountId to the accounts-config file?',
      );
    }

    const singleAccountToAdd = accountToAdd[0];
    console.log(`enablegovcloud value: ${singleAccountToAdd.enableGovCloud}`);
    let createAccountResponse: CreateAccountResponse;
    // if the createRequestId is empty then we need to create the account
    if (singleAccountToAdd.createRequestId === '' || singleAccountToAdd.createRequestId === undefined) {
      if (singleAccountToAdd.enableGovCloud == 'true' || singleAccountToAdd.enableGovCloud) {
        createAccountResponse = await createGovCloudAccount(singleAccountToAdd.email, singleAccountToAdd.name);
      } else {
        createAccountResponse = await createOrganizationAccount(singleAccountToAdd.email, singleAccountToAdd.name);
      }
      switch (createAccountResponse.CreateAccountStatus?.State) {
        case 'IN_PROGRESS':
          console.log(`Initiated account creation for ${accountToAdd[0].email}`);
          singleAccountToAdd.createRequestId = createAccountResponse.CreateAccountStatus.Id;
          const updateAccountConfigResponse = await updateAccountConfig(singleAccountToAdd);
          if (!updateAccountConfigResponse) {
            throw new Error('Unable to update DynamoDB account record with request id');
          } else {
            return {
              IsComplete: false,
            };
          }
        case 'SUCCEEDED':
          if (!(await isNewAccountActive(createAccountResponse.CreateAccountStatus!.AccountId!))) {
            console.log(
              `Account ${createAccountResponse.CreateAccountStatus!.AccountId} created but not yet ACTIVE; waiting for activation`,
            );
            // Persist the create request id (as the IN_PROGRESS branch does) before deferring, so the
            // next poll resumes via the status-poll branch instead of re-entering the create branch and
            // re-running account creation (which would fail EMAIL_ALREADY_EXISTS and orphan the account).
            singleAccountToAdd.createRequestId = createAccountResponse.CreateAccountStatus!.Id;
            const updatePendingActivationResponse = await updateAccountConfig(singleAccountToAdd);
            if (!updatePendingActivationResponse) {
              throw new Error('Unable to update DynamoDB account record with request id');
            }
            return {
              IsComplete: false,
            };
          }
          await handleSucceededAccountCreation(
            createAccountResponse.CreateAccountStatus.AccountId!,
            createAccountResponse.CreateAccountStatus.GovCloudAccountId,
            createAccountResponse.CreateAccountStatus.AccountName!,
            singleAccountToAdd.email,
            singleAccountToAdd.organizationalUnitId,
          );
          break;
        case 'FAILED':
          if (createAccountResponse.CreateAccountStatus?.FailureReason === 'EMAIL_ALREADY_EXISTS') {
            console.warn(`Account with the email address of ${singleAccountToAdd.email} already exists`);
            await deleteSingleAccountConfigFromTable(singleAccountToAdd.email);
            return {
              IsComplete: true,
            };
          }
          throw new Error(
            `Could not create account ${singleAccountToAdd.email}. Response state: ${createAccountResponse.CreateAccountStatus?.State}. Failure reason: ${createAccountResponse.CreateAccountStatus?.FailureReason}`,
          );
        default:
          throw new Error(
            `Could not create account ${singleAccountToAdd.email}. Response state: ${createAccountResponse.CreateAccountStatus?.State}. Failure reason: ${createAccountResponse.CreateAccountStatus?.FailureReason}`,
          );
      }
    } else {
      // check status of account creation
      const createAccountStatusResponse = await getAccountCreationStatus(singleAccountToAdd.createRequestId);
      switch (createAccountStatusResponse.CreateAccountStatus?.State) {
        case 'IN_PROGRESS':
          console.log(`Account is still being created`);
          return {
            IsComplete: false,
          };
        case 'SUCCEEDED':
          if (!(await isNewAccountActive(createAccountStatusResponse.CreateAccountStatus!.AccountId!))) {
            console.log(
              `Account ${createAccountStatusResponse.CreateAccountStatus!.AccountId} created but not yet ACTIVE; waiting for activation`,
            );
            return {
              IsComplete: false,
            };
          }
          console.log(`Account with id ${createAccountStatusResponse.CreateAccountStatus?.AccountId} is complete`);
          await handleSucceededAccountCreation(
            createAccountStatusResponse.CreateAccountStatus.AccountId!,
            createAccountStatusResponse.CreateAccountStatus.GovCloudAccountId,
            singleAccountToAdd.name,
            singleAccountToAdd.email,
            singleAccountToAdd.organizationalUnitId,
          );
          break;
        case 'FAILED':
          if (createAccountStatusResponse.CreateAccountStatus?.FailureReason === 'EMAIL_ALREADY_EXISTS') {
            console.warn(`Account with the email address of ${singleAccountToAdd.email} already exists`);
            await deleteSingleAccountConfigFromTable(singleAccountToAdd.email);
            return {
              IsComplete: true,
            };
          }
          throw new Error(
            `Could not create account ${singleAccountToAdd.email}. Response state: ${createAccountStatusResponse.CreateAccountStatus?.State}, Failure reason: ${createAccountStatusResponse.CreateAccountStatus?.FailureReason}`,
          );
        default:
          throw new Error(
            `Could not create account ${singleAccountToAdd.email}. Response state: ${createAccountStatusResponse.CreateAccountStatus?.State}, Failure reason: ${createAccountStatusResponse.CreateAccountStatus?.FailureReason}`,
          );
      }
    }
    return {
      IsComplete: false,
    };
  } catch (e) {
    console.log(e);
    console.log(`Create accounts failed. Deleting pending account creation records`);
    await deleteAllRecordsFromTable(newOrgAccountsTableName);
    throw new Error(`Account creation failed. ${e}`);
  }
}

async function getSingleAccountConfigFromTable(): Promise<AccountConfigs> {
  const accountToAdd: AccountConfigs = [];
  const scanParams = {
    TableName: newOrgAccountsTableName,
    Limit: 1,
  };
  const response = await throttlingBackOff(() => documentClient.send(new ScanCommand(scanParams)));
  console.log(`getSingleAccount response ${JSON.stringify(response)}`);
  const itemCount = response.Items?.length ?? 0;

  if (itemCount > 0) {
    const accountConfigAttributeValue: AttributeValue = response.Items![0]['accountConfig'];
    if (typeof accountConfigAttributeValue['S'] === 'string') {
      const account: AccountConfig = JSON.parse(accountConfigAttributeValue['S']);
      accountToAdd.push(account);
      console.log(`Account to add ${JSON.stringify(accountToAdd)}`);
    }
  }
  return accountToAdd;
}

async function deleteSingleAccountConfigFromTable(accountToDeleteEmail: string): Promise<boolean> {
  const deleteParams = {
    TableName: newOrgAccountsTableName,
    Key: {
      accountEmail: accountToDeleteEmail,
    },
  };
  const response = await throttlingBackOff(() => documentClient.send(new DeleteCommand(deleteParams)));
  if (response.$metadata.httpStatusCode === 200) {
    return true;
  } else {
    console.log(response);
    return false;
  }
}

async function createOrganizationAccount(accountEmail: string, accountName: string): Promise<CreateAccountResponse> {
  const createAccountsParams = {
    AccountName: accountName,
    Email: accountEmail,
    RoleName: accountRoleName,
  };
  const createAccountResponse = await throttlingBackOff(() =>
    organizationsClient.send(new CreateAccountCommand(createAccountsParams)),
  );
  console.log(createAccountResponse);
  return createAccountResponse;
}

async function createGovCloudAccount(accountEmail: string, accountName: string): Promise<CreateAccountResponse> {
  const createAccountsParams = {
    AccountName: accountName,
    Email: accountEmail,
    RoleName: accountRoleName,
  };
  const createAccountResponse = await throttlingBackOff(() =>
    organizationsClient.send(new CreateGovCloudAccountCommand(createAccountsParams)),
  );
  console.log(createAccountResponse);
  return createAccountResponse;
}

async function getAccountCreationStatus(requestId: string): Promise<DescribeCreateAccountStatusResponse> {
  return await throttlingBackOff(() =>
    organizationsClient.send(new DescribeCreateAccountStatusCommand({ CreateAccountRequestId: requestId })),
  );
}

/**
 * Checks whether a newly created account has finished activating.
 *
 * AWS Organizations reports `CreateAccountStatus.State === 'SUCCEEDED'` as soon as the account
 * exists, but in some partitions (notably isolated/air-gapped regions) the account's own
 * lifecycle remains non-ACTIVE (e.g. PENDING_ACTIVATION) for several minutes afterward.
 * Completing creation before then persists that transient value into the config table and later
 * fails validate-environment in the Prepare stage, so we gate completion on the account actually
 * reaching ACTIVE.
 *
 * @param accountId AWS account ID of the newly created account
 * @returns true when the account lifecycle state is ACTIVE
 */
async function isNewAccountActive(accountId: string): Promise<boolean> {
  const describeAccountResponse = await throttlingBackOff(() =>
    organizationsClient.send(new DescribeAccountCommand({ AccountId: accountId })),
  );
  const account = describeAccountResponse.Account;
  console.log(`Account ${accountId} lifecycle state: ${account?.State ?? account?.Status}`);
  return isAccountLifecycleActive(account);
}

async function updateAccountConfig(accountConfig: AccountConfig): Promise<boolean> {
  const params = {
    TableName: newOrgAccountsTableName,
    Item: {
      accountEmail: accountConfig.email,
      accountConfig: JSON.stringify(accountConfig),
    },
  };
  const response = await throttlingBackOff(() => documentClient.send(new PutCommand(params)));
  if (response.$metadata.httpStatusCode === 200) {
    return true;
  } else {
    console.log(response);
    return false;
  }
}

async function moveAccountToOrgIdFromRoot(accountId: string, orgId: string): Promise<boolean> {
  const roots = await throttlingBackOff(() => organizationsClient.send(new ListRootsCommand({})));
  const rootOrg = roots.Roots?.find(item => item.Name === 'Root');
  const response = await throttlingBackOff(() =>
    organizationsClient.send(
      new MoveAccountCommand({
        AccountId: accountId,
        DestinationParentId: orgId,
        SourceParentId: rootOrg!.Id!,
      }),
    ),
  );
  if (response.$metadata.httpStatusCode === 200) {
    console.log(`Moved account ${accountId} to OU.`);
    return true;
  } else {
    console.log(
      `Failed to move account ${accountId} to OU. Move request status code: ${response.$metadata.httpStatusCode}`,
    );
  }
  return false;
}

async function saveGovCloudAccountMapping(
  commercialAccountId: string,
  govCloudAccountId: string,
  accountName: string,
): Promise<boolean> {
  const params = {
    TableName: govCloudAccountMappingTableName,
    Item: {
      commercialAccountId: commercialAccountId,
      govCloudAccountId: govCloudAccountId,
      accountName: accountName,
    },
  };
  const response = await throttlingBackOff(() => documentClient.send(new PutCommand(params)));
  if (response.$metadata.httpStatusCode === 200) {
    return true;
  } else {
    console.log(response);
    return false;
  }
}

async function deleteAllRecordsFromTable(paramTableName: string) {
  const params = {
    TableName: paramTableName,
    ProjectionExpression: 'accountEmail',
  };
  try {
    const response = await throttlingBackOff(() => documentClient.send(new ScanCommand(params)));
    if (response.Items) {
      for (const item of response.Items) {
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
  } catch (e) {
    console.warn('Failed to delete all records: ', e);
  }
}

async function updateConfigTableWithAccountInfo(accountId: string, email: string): Promise<void> {
  try {
    // First, find the account in the config table
    const getParams = {
      TableName: configTableName,
      Key: {
        dataType: 'workloadAccount',
        acceleratorKey: email,
      },
    };

    // Try with workloadAccount first
    let response = await throttlingBackOff(() => documentClient.send(new GetCommand(getParams)));
    let dataType = 'workloadAccount';

    // If not found, try with mandatoryAccount
    if (!response.Item) {
      getParams.Key.dataType = 'mandatoryAccount';
      dataType = 'mandatoryAccount';
      response = await throttlingBackOff(() => documentClient.send(new GetCommand(getParams)));

      // If still not found, throw error
      if (!response.Item) {
        throw new Error(`Account with email ${email} not found in config table`);
      }
    }

    // Get account details from Organizations API
    const describeAccountResponse = await throttlingBackOff(() =>
      organizationsClient.send(new DescribeAccountCommand({ AccountId: accountId })),
    );

    const orgsApiResponse = describeAccountResponse.Account;

    // Update the config table with account info using UpdateCommand
    const updateParams = {
      TableName: configTableName,
      Key: {
        dataType: dataType,
        acceleratorKey: email,
      },
      UpdateExpression: 'SET awsKey = :awsKey, orgInfo = :orgInfo',
      ExpressionAttributeValues: {
        ':awsKey': accountId,
        ':orgInfo': JSON.stringify(buildAccountOrgInfo(email, accountId, orgsApiResponse)),
      },
    };

    await throttlingBackOff(() => documentClient.send(new UpdateCommand(updateParams)));
    console.log(`Updated config table for account ${accountId}`);
  } catch (error) {
    console.error(`Error updating config table: ${error}`);
    throw error;
  }
}
async function handleSucceededAccountCreation(
  accountId: string,
  govCloudAccountId: string | undefined,
  accountName: string,
  email: string,
  organizationalUnitId: string,
): Promise<void> {
  if (govCloudAccountId) {
    console.log(`GovCloud account created with id ${govCloudAccountId}`);
    await saveGovCloudAccountMapping(accountId, govCloudAccountId, accountName);
  }
  console.log(`Account with id ${accountId} was created for email ${email}`);
  await moveAccountToOrgIdFromRoot(accountId, organizationalUnitId);
  await updateConfigTableWithAccountInfo(accountId, email);
  await deleteSingleAccountConfigFromTable(email);
}

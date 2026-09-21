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

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  UpdateCommand,
  UpdateCommandInput,
  ScanCommand,
  DeleteCommand,
  NativeAttributeValue,
} from '@aws-sdk/lib-dynamodb';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import * as fs from 'fs';
import AdmZip from 'adm-zip';
import {
  AccountConfig,
  AccountsConfig,
  AccountIdConfig,
  OrganizationalUnitConfig,
  OrganizationalUnitIdConfig,
  OrganizationConfig,
  ReplacementsConfig,
} from '@aws-accelerator/config';
import { Readable } from 'stream';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';

export {};
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
let cloudformationClient: CloudFormationClient;
let s3Client: S3Client;

/**
 * Returns the shared DynamoDB document client, lazily initializing it if the handler has not run yet.
 * This keeps the exported helpers usable in isolation (e.g. unit tests) while the handler continues to
 * initialize the module-scoped clients as before.
 */
function getDocumentClient(): DynamoDBDocumentClient {
  if (!documentClient) {
    dynamodbClient = new DynamoDBClient({ customUserAgent: process.env['SOLUTION_ID'] });
    documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);
  }
  return documentClient;
}

/**
 * load-config-table - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(event);
  const configTableName: string = event.ResourceProperties['configTableName'];
  const configRepositoryName: string = event.ResourceProperties['configRepositoryName'];
  const configS3Bucket: string = event.ResourceProperties['configS3Bucket'];
  const configDirS3Key: string = event.ResourceProperties['configDirS3Key'];
  const organizationsConfigS3Key: string = event.ResourceProperties['organizationsConfigS3Key'];
  const accountConfigS3Key: string = event.ResourceProperties['accountConfigS3Key'];
  const replacementsConfigS3Key: string = event.ResourceProperties['replacementsConfigS3Key'];
  const commitId: string = event.ResourceProperties['commitId'] ?? '';
  const partition: string = event.ResourceProperties['partition'];
  const stackName: string = event.ResourceProperties['stackName'];
  const solutionId = process.env['SOLUTION_ID'];
  const isOrgsEnabled: boolean = event.ResourceProperties['isOrgsEnabled'] === 'true';

  console.log(`Configuration Table Name: ${configTableName}`);
  console.log(`Configuration Repository Name: ${configRepositoryName}`);

  dynamodbClient = new DynamoDBClient({ customUserAgent: solutionId });
  documentClient = DynamoDBDocumentClient.from(dynamodbClient, translateConfig);
  cloudformationClient = new CloudFormationClient({ customUserAgent: solutionId });
  s3Client = new S3Client({ customUserAgent: solutionId });

  switch (event.RequestType) {
    case 'Create':
    case 'Update':
      console.log(stackName);
      // if stack rollback is in progress don't do anything
      // the stack may have failed as the results of errors
      // from this construct
      // when rolling back this construct will execute and
      // fail again preventing stack rollback
      if (await isStackInRollback(stackName)) {
        console.log('Stack in rollback exiting');
        return {
          PhysicalResourceId: 'loadConfigTableNone',
          Status: 'SUCCESS',
        };
      }

      return onCreateUpdateFunction(
        partition,
        configTableName,
        commitId,
        { name: configS3Bucket, configDirS3Key, organizationsConfigS3Key, accountConfigS3Key, replacementsConfigS3Key },
        isOrgsEnabled,
      );

    case 'Delete':
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'Success',
      };
  }
}

async function downloadConfigFiles(
  bucket: string,
  localDir: string,
  configKeys: { configDirS3Key: string },
): Promise<void> {
  console.log(`Downloading and extracting config directory from ${configKeys.configDirS3Key}`);
  const response = await throttlingBackOff(() =>
    s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: configKeys.configDirS3Key })),
  );

  const zipBuffer = await streamToBuffer(response.Body as Readable);

  try {
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(localDir, true);
  } catch (error) {
    throw new Error(`Failed to extract config directory from ${configKeys.configDirS3Key}: ${error}`);
  }
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export async function putOrganizationConfigInTable(
  configData: OrganizationalUnitConfig,
  configTableName: string,
  awsKey: string,
  commitId: string,
  orgInfo: OrganizationalUnitIdConfig,
): Promise<void> {
  const documentClient = getDocumentClient();
  if (awsKey != '') {
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: 'organization',
        acceleratorKey: configData.name,
      },
      UpdateExpression:
        'set #awsKey = :v_awsKey, #dataBag = :v_dataBag, #commitId = :v_commitId, #orgInfo = :v_orgInfo',
      ExpressionAttributeNames: {
        '#awsKey': 'awsKey',
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
        '#orgInfo': 'orgInfo',
      },
      ExpressionAttributeValues: {
        ':v_awsKey': awsKey,
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
        ':v_orgInfo': JSON.stringify(orgInfo),
      },
    };
    await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
  } else {
    // The organizational unit was not found in live AWS Organizations (awsKey === ''). Actively clear
    // any awsKey previously recorded on this row. Otherwise a stale awsKey (for example, the ID of an
    // OU that was deleted and is being recreated with the same name) survives this upsert. Downstream,
    // create-organizational-units treats the truthy awsKey as "already exists" and skips recreation;
    // validate-environment can then call AWS Organizations with an ID that no longer exists.
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: 'organization',
        acceleratorKey: configData.name,
      },
      UpdateExpression: 'set #dataBag = :v_dataBag, #commitId = :v_commitId, #orgInfo = :v_orgInfo remove #awsKey',
      ExpressionAttributeNames: {
        '#awsKey': 'awsKey',
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
        '#orgInfo': 'orgInfo',
      },
      ExpressionAttributeValues: {
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
        ':v_orgInfo': JSON.stringify(orgInfo),
      },
    };
    await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
  }
}

async function putAccountConfigInTable(
  accountType: string,
  configData: AccountConfig,
  configTableName: string,
  awsKey: string,
  commitId: string,
  ouName: string,
  accountIdData: AccountIdConfig,
): Promise<void> {
  if (awsKey !== '') {
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: accountType + 'Account',
        acceleratorKey: configData.email,
      },
      UpdateExpression:
        'set #awsKey = :v_awsKey, #dataBag = :v_dataBag, #commitId = :v_commitId, #ouName = :v_ouName, #orgInfo = :v_orgInfo',
      ExpressionAttributeNames: {
        '#awsKey': 'awsKey',
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
        '#ouName': 'ouName',
        '#orgInfo': 'orgInfo',
      },
      ExpressionAttributeValues: {
        ':v_awsKey': awsKey,
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
        ':v_ouName': ouName,
        ':v_orgInfo': JSON.stringify(accountIdData),
      },
    };
    await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
  } else {
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: accountType + 'Account',
        acceleratorKey: configData.email,
      },
      UpdateExpression:
        'set #dataBag = :v_dataBag, #commitId = :v_commitId, #ouName = :v_ouName, #orgInfo = :v_orgInfo',
      ExpressionAttributeNames: {
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
        '#ouName': 'ouName',
        '#orgInfo': 'orgInfo',
      },
      ExpressionAttributeValues: {
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
        ':v_ouName': ouName,
        ':v_orgInfo': JSON.stringify(accountIdData),
      },
    };
    await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
  }
}

async function putCommitIdInTable(configTableName: string, commitId: string): Promise<void> {
  const params: UpdateCommandInput = {
    TableName: configTableName,
    Key: {
      dataType: 'commitId',
      acceleratorKey: 'current',
    },
    UpdateExpression: 'set #commitId = :v_commitId',
    ExpressionAttributeNames: {
      '#commitId': 'commitId',
    },
    ExpressionAttributeValues: {
      ':v_commitId': commitId,
    },
  };
  await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
}

async function isStackInRollback(stackName: string): Promise<boolean> {
  const response = await throttlingBackOff(() =>
    cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName })),
  );
  console.log(response);
  if (response.Stacks && response.Stacks[0].StackStatus == 'UPDATE_ROLLBACK_IN_PROGRESS') {
    return true;
  }
  return false;
}

async function onCreateUpdateFunction(
  partition: string,
  configTableName: string,
  commitId: string,
  bucket: {
    name: string;
    configDirS3Key: string;
    organizationsConfigS3Key: string;
    accountConfigS3Key: string;
    replacementsConfigS3Key: string;
  },
  isOrgsEnabled: boolean,
): Promise<{
  PhysicalResourceId: string | undefined;
  Status: string;
}> {
  const configDir = '/tmp/config';
  fs.rmSync(configDir, { recursive: true, force: true });
  fs.mkdirSync(configDir, { recursive: true });

  await downloadConfigFiles(bucket.name, configDir, {
    configDirS3Key: bucket.configDirS3Key,
  });

  const accountsConfig = AccountsConfig.load(configDir);
  const replacementsConfig = bucket.replacementsConfigS3Key
    ? ReplacementsConfig.load(configDir, accountsConfig)
    : undefined;

  const organizationConfig = replacementsConfig
    ? OrganizationConfig.load(configDir, replacementsConfig)
    : OrganizationConfig.loadRawOrganizationsConfig(configDir);
  await organizationConfig.loadOrganizationalUnitIds(partition);

  await putAllOrganizationConfigInTable(organizationConfig, configTableName, commitId);

  const rootId = organizationConfig.organizationalUnitIds!.find(ou => ou.name === 'Root')!.id;
  const rootOrgInfo = organizationConfig.organizationalUnitIds!.find(ou => ou.name === 'Root')!;
  await putOrganizationConfigInTable(
    { name: 'Root', ignore: undefined },
    configTableName,
    rootId,
    commitId,
    rootOrgInfo,
  );

  // Boolean to set single account deployment mode
  const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
    ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
    : false;

  await accountsConfig.loadAccountIds(partition, enableSingleAccountMode, isOrgsEnabled, accountsConfig);

  for (const account of accountsConfig.mandatoryAccounts) {
    switch (account.name) {
      case 'Management':
        const managementId = accountsConfig.getManagementAccountId();
        await putAccountConfigInTable(
          'mandatory',
          account,
          configTableName,
          managementId,
          commitId,
          account.organizationalUnit,
          getAccountIdConfigForAccount(accountsConfig, managementId, account.email),
        );
        break;
      case 'LogArchive':
        const logArchiveId = accountsConfig.getLogArchiveAccountId();
        await putAccountConfigInTable(
          'mandatory',
          account,
          configTableName,
          logArchiveId,
          commitId,
          account.organizationalUnit,
          getAccountIdConfigForAccount(accountsConfig, logArchiveId, account.email),
        );
        break;
      case 'Audit':
        const auditId = accountsConfig.getAuditAccountId();
        await putAccountConfigInTable(
          'mandatory',
          account,
          configTableName,
          auditId,
          commitId,
          account.organizationalUnit,
          getAccountIdConfigForAccount(accountsConfig, auditId, account.email),
        );
        break;
    }
    const awsKey = accountsConfig.getAccountId(account.name) || '';
    await putAccountConfigInTable(
      'mandatory',
      account,
      configTableName,
      awsKey,
      commitId,
      account.organizationalUnit,
      getAccountIdConfigForAccount(accountsConfig, awsKey, account.email),
    );
  }
  for (const account of accountsConfig.workloadAccounts) {
    let accountId: string;
    try {
      accountId = accountsConfig.getAccountId(account.name);
    } catch {
      accountId = '';
    }
    await putAccountConfigInTable(
      'workload',
      account,
      configTableName,
      accountId,
      commitId,
      account.organizationalUnit,
      getAccountIdConfigForAccount(accountsConfig, accountId, account.email),
    );
  }
  // Delete accounts that are not in the config
  await cleanupNotInUseAccounts(configTableName, accountsConfig);
  // Delete organizational units that are not in the config
  await cleanupNotInUseOrganizationalUnits(configTableName, organizationConfig);
  await putCommitIdInTable(configTableName, commitId);

  return {
    PhysicalResourceId: commitId,
    Status: 'Success',
  };
}

/**
 * Deletes account entries from the DynamoDB table that are not present in the config
 *
 * @param configTableName The name of the DynamoDB table
 * @param accountsConfig The AccountsConfig object containing all valid accounts
 */
async function cleanupNotInUseAccounts(configTableName: string, accountsConfig: AccountsConfig): Promise<void> {
  console.log('Checking for accounts to remove from the DynamoDB table that are not in the config..');

  const configAccountEmails = new Set<string>();

  for (const account of accountsConfig.mandatoryAccounts) {
    configAccountEmails.add(account.email);
  }

  for (const account of accountsConfig.workloadAccounts) {
    configAccountEmails.add(account.email);
  }

  const accountTypes = ['mandatoryAccount', 'workloadAccount'];
  const accountsToDelete: Array<{ dataType: string; acceleratorKey: string }> = [];

  for (const accountType of accountTypes) {
    let lastEvaluatedKey: Record<string, NativeAttributeValue> | undefined = undefined;

    do {
      const scanParams: {
        TableName: string;
        FilterExpression: string;
        ExpressionAttributeValues: Record<string, string>;
        ExclusiveStartKey?: Record<string, NativeAttributeValue>;
      } = {
        TableName: configTableName,
        FilterExpression: 'dataType = :dataType',
        ExpressionAttributeValues: {
          ':dataType': accountType,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const response = await throttlingBackOff(() => documentClient.send(new ScanCommand(scanParams)));

      if (response.Items) {
        for (const item of response.Items) {
          const dataType = item['dataType'] as string;
          const acceleratorKey = item['acceleratorKey'] as string;

          if (!configAccountEmails.has(acceleratorKey)) {
            accountsToDelete.push({
              dataType,
              acceleratorKey,
            });
          }
        }
      }

      lastEvaluatedKey = response.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  }

  if (accountsToDelete.length > 0) {
    console.log(
      `Found ${accountsToDelete.length} accounts to delete from DynamoDB that are not in the accounts-config.yaml file`,
    );

    await Promise.all(
      accountsToDelete.map(async key => {
        const deleteParams = {
          TableName: configTableName,
          Key: {
            dataType: key.dataType,
            acceleratorKey: key.acceleratorKey,
          },
        };

        console.log(`Removing account: ${key.acceleratorKey} (${key.dataType}) from DynamoDB table`);
        await throttlingBackOff(() => documentClient.send(new DeleteCommand(deleteParams)));
      }),
    );

    console.log('Successfully removed accounts from the DynamoDB table that are not in the accounts-config.yaml file');
  } else {
    console.log('No accounts to remove from DynamoDB, all accounts in the table are in the accounts-config.yaml file');
  }
}

/**
 * Deletes organizational unit entries from the DynamoDB table that are not present in the config
 *
 * @remarks
 * Mirrors {@link cleanupNotInUseAccounts} for `dataType='organization'` rows. Without this, an OU
 * removed from organization-config.yaml leaves an orphaned row in the config table (OU rows are only
 * ever upserted, never deleted), which can block recreating an OU of the same name. The synthetic
 * `Root` row (written separately by {@link onCreateUpdateFunction}) is preserved because it is never
 * part of `organizationConfig.organizationalUnits`.
 *
 * @param configTableName The name of the DynamoDB table
 * @param organizationConfig The OrganizationConfig object containing all valid organizational units
 */
export async function cleanupNotInUseOrganizationalUnits(
  configTableName: string,
  organizationConfig: OrganizationConfig,
): Promise<void> {
  const documentClient = getDocumentClient();
  console.log('Checking for organizational units to remove from the DynamoDB table that are not in the config..');

  const configOuNames = new Set<string>();

  for (const organizationalUnit of organizationConfig.organizationalUnits) {
    configOuNames.add(organizationalUnit.name);
  }
  // The Root row is written separately by onCreateUpdateFunction and is not part of the
  // organizationalUnits list; keep it so it is never treated as orphaned.
  configOuNames.add('Root');

  const organizationalUnitsToDelete: Array<{ dataType: string; acceleratorKey: string }> = [];
  let lastEvaluatedKey: Record<string, NativeAttributeValue> | undefined = undefined;

  do {
    const scanParams: {
      TableName: string;
      FilterExpression: string;
      ExpressionAttributeValues: Record<string, string>;
      ExclusiveStartKey?: Record<string, NativeAttributeValue>;
    } = {
      TableName: configTableName,
      FilterExpression: 'dataType = :dataType',
      ExpressionAttributeValues: {
        ':dataType': 'organization',
      },
      ExclusiveStartKey: lastEvaluatedKey,
    };

    const response = await throttlingBackOff(() => documentClient.send(new ScanCommand(scanParams)));

    if (response.Items) {
      for (const item of response.Items) {
        const dataType = item['dataType'] as string;
        const acceleratorKey = item['acceleratorKey'] as string;

        if (!configOuNames.has(acceleratorKey)) {
          organizationalUnitsToDelete.push({
            dataType,
            acceleratorKey,
          });
        }
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (organizationalUnitsToDelete.length > 0) {
    console.log(
      `Found ${organizationalUnitsToDelete.length} organizational units to delete from DynamoDB that are not in the organization-config.yaml file`,
    );

    await Promise.all(
      organizationalUnitsToDelete.map(async key => {
        const deleteParams = {
          TableName: configTableName,
          Key: {
            dataType: key.dataType,
            acceleratorKey: key.acceleratorKey,
          },
        };

        console.log(`Removing organizational unit: ${key.acceleratorKey} (${key.dataType}) from DynamoDB table`);
        await throttlingBackOff(() => documentClient.send(new DeleteCommand(deleteParams)));
      }),
    );

    console.log(
      'Successfully removed organizational units from the DynamoDB table that are not in the organization-config.yaml file',
    );
  } else {
    console.log(
      'No organizational units to remove from DynamoDB, all organizational units in the table are in the organization-config.yaml file',
    );
  }
}

async function putAllOrganizationConfigInTable(
  organizationConfig: OrganizationConfig,
  configTableName: string,
  commitId: string,
) {
  for (const organizationalUnit of organizationConfig.organizationalUnits) {
    let awsKey = '';
    try {
      awsKey = organizationConfig.getOrganizationalUnitId(organizationalUnit.name);
    } catch (error) {
      let message;

      if (error instanceof Error) message = error.message;
      else message = String(error);

      if (message.startsWith('configuration validation failed')) awsKey = '';
      else throw error;
    }
    const orgIdInfo = organizationConfig.organizationalUnitIds!.find(ou => ou.name === organizationalUnit.name)!;
    await putOrganizationConfigInTable(organizationalUnit, configTableName, awsKey, commitId, orgIdInfo);
  }
}

function getAccountIdConfigForAccount(
  accountsConfig: AccountsConfig,
  accountId: string,
  email: string,
): AccountIdConfig {
  if (accountId === '') {
    return { accountId, email };
  }
  const account = accountsConfig.accountIds?.find(obj => obj.accountId === accountId);
  if (!account) {
    throw new Error(`No account found for accountId: ${accountId}`);
  }
  return account;
}

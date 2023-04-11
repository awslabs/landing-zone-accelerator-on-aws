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
import { DynamoDBDocumentClient, UpdateCommand, UpdateCommandInput } from '@aws-sdk/lib-dynamodb';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { throttlingBackOff } from '@aws-accelerator/utils';
import * as yaml from 'js-yaml';
import {
  AccountConfig,
  AccountsConfig,
  AccountsConfigTypes,
  OrganizationalUnitConfig,
  OrganizationConfig,
  OrganizationConfigTypes,
} from '@aws-accelerator/config';
import * as t from '@aws-accelerator/config/';
import { Readable } from 'stream';

export {};

let dynamodbClient: DynamoDBClient;
let documentClient: DynamoDBDocumentClient;
let cloudformationClient: CloudFormationClient;
let s3Client: S3Client;

/**
 * load-config-table - lambda handler
 *
 * @param event
 * @returns
 */
export async function handler(event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      PhysicalResourceId: string | undefined;
      Status: string;
    }
  | undefined
> {
  console.log(event);
  const configTableName: string = event.ResourceProperties['configTableName'];
  const configRepositoryName: string = event.ResourceProperties['configRepositoryName'];
  const managementAccountEmail: string = event.ResourceProperties['managementAccountEmail'];
  const auditAccountEmail: string = event.ResourceProperties['auditAccountEmail'];
  const logArchiveAccountEmail: string = event.ResourceProperties['logArchiveAccountEmail'];
  const configS3Bucket: string = event.ResourceProperties['configS3Bucket'];
  const organizationsConfigS3Key: string = event.ResourceProperties['organizationsConfigS3Key'];
  const accountConfigS3Key: string = event.ResourceProperties['accountConfigS3Key'];
  const commitId: string = event.ResourceProperties['commitId'] ?? '';
  const partition: string = event.ResourceProperties['partition'];
  const stackName: string = event.ResourceProperties['stackName'];
  const solutionId = process.env['SOLUTION_ID'];

  console.log(`Configuration Table Name: ${configTableName}`);
  console.log(`Configuration Repository Name: ${configRepositoryName}`);

  dynamodbClient = new DynamoDBClient({ customUserAgent: solutionId });
  documentClient = DynamoDBDocumentClient.from(dynamodbClient);
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
        { name: configS3Bucket, organizationsConfigS3Key, accountConfigS3Key },
        {
          managementAccount: managementAccountEmail,
          auditAccount: auditAccountEmail,
          logArchiveAccount: logArchiveAccountEmail,
        },
      );

    case 'Delete':
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'Success',
      };
  }
}

async function getConfigFileContents(configFileS3Bucket: string, configFileS3Key: string): Promise<string> {
  const response = await throttlingBackOff(() =>
    s3Client.send(new GetObjectCommand({ Bucket: configFileS3Bucket, Key: configFileS3Key })),
  );
  const stream = response.Body as Readable;
  return streamToString(stream);
}

async function streamToString(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

async function putOrganizationConfigInTable(
  configData: OrganizationalUnitConfig,
  configTableName: string,
  awsKey: string,
  commitId: string,
): Promise<void> {
  if (awsKey != '') {
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: 'organization',
        acceleratorKey: configData.name,
      },
      UpdateExpression: 'set #awsKey = :v_awsKey, #dataBag = :v_dataBag, #commitId = :v_commitId',
      ExpressionAttributeNames: {
        '#awsKey': 'awsKey',
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
      },
      ExpressionAttributeValues: {
        ':v_awsKey': awsKey,
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
      },
    };
    await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
  } else {
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: 'organization',
        acceleratorKey: configData.name,
      },
      UpdateExpression: 'set #dataBag = :v_dataBag, #commitId = :v_commitId',
      ExpressionAttributeNames: {
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
      },
      ExpressionAttributeValues: {
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
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
): Promise<void> {
  if (awsKey !== '') {
    const params: UpdateCommandInput = {
      TableName: configTableName,
      Key: {
        dataType: accountType + 'Account',
        acceleratorKey: configData.email,
      },
      UpdateExpression: 'set #awsKey = :v_awsKey, #dataBag = :v_dataBag, #commitId = :v_commitId, #ouName = :v_ouName',
      ExpressionAttributeNames: {
        '#awsKey': 'awsKey',
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
        '#ouName': 'ouName',
      },
      ExpressionAttributeValues: {
        ':v_awsKey': awsKey,
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
        ':v_ouName': ouName,
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
      UpdateExpression: 'set #dataBag = :v_dataBag, #commitId = :v_commitId, #ouName = :v_ouName',
      ExpressionAttributeNames: {
        '#dataBag': 'dataBag',
        '#commitId': 'commitId',
        '#ouName': 'ouName',
      },
      ExpressionAttributeValues: {
        ':v_dataBag': JSON.stringify(configData),
        ':v_commitId': commitId,
        ':v_ouName': ouName,
      },
    };
    await throttlingBackOff(() => documentClient.send(new UpdateCommand(params)));
  }
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
  bucket: { name: string; organizationsConfigS3Key: string; accountConfigS3Key: string },
  emails: {
    managementAccount: string;
    auditAccount: string;
    logArchiveAccount: string;
  },
): Promise<{
  PhysicalResourceId: string | undefined;
  Status: string;
}> {
  const organizationConfigContent = await getConfigFileContents(bucket.name, bucket.organizationsConfigS3Key);
  const organizationValues = t.parse(OrganizationConfigTypes.organizationConfig, yaml.load(organizationConfigContent));
  const organizationConfig = new OrganizationConfig(organizationValues);
  await organizationConfig.loadOrganizationalUnitIds(partition);

  await putAllOrganizationConfigInTable(organizationConfig, configTableName, commitId);

  const accountsConfigContent = await getConfigFileContents(bucket.name, bucket.accountConfigS3Key);
  const accountsValues = t.parse(AccountsConfigTypes.accountsConfig, yaml.load(accountsConfigContent));
  const accountsConfig = new AccountsConfig(
    {
      managementAccountEmail: emails.managementAccount,
      auditAccountEmail: emails.auditAccount,
      logArchiveAccountEmail: emails.logArchiveAccount,
    },
    accountsValues,
  );

  // Boolean to set single account deployment mode
  const enableSingleAccountMode = process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE']
    ? process.env['ACCELERATOR_ENABLE_SINGLE_ACCOUNT_MODE'] === 'true'
    : false;

  await accountsConfig.loadAccountIds(partition, enableSingleAccountMode);

  for (const account of accountsConfig.mandatoryAccounts) {
    switch (account.name) {
      case 'Management':
        const managmentId = accountsConfig.getManagementAccountId();
        await putAccountConfigInTable(
          'mandatory',
          account,
          configTableName,
          managmentId,
          commitId,
          account.organizationalUnit,
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
        );
        break;
    }
    const awsKey = accountsConfig.getAccountId(account.name) || '';
    await putAccountConfigInTable('mandatory', account, configTableName, awsKey, commitId, account.organizationalUnit);
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
    );
  }
  return {
    PhysicalResourceId: commitId,
    Status: 'Success',
  };
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
    await putOrganizationConfigInTable(organizationalUnit, configTableName, awsKey, commitId);
  }
}

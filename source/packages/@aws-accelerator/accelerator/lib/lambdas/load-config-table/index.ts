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
import { CodeCommitClient, GetFileCommand } from '@aws-sdk/client-codecommit';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
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

export {};
declare global {
  type File = unknown;
}

const dynamodbClient = new DynamoDBClient({});
const documentClient = DynamoDBDocumentClient.from(dynamodbClient);
const codeCommitClient = new CodeCommitClient({});
const cloudformationClient = new CloudFormationClient({});

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
  const configTableName: string = event.ResourceProperties['configTableName'] ?? '';
  const configRepositoryName: string = event.ResourceProperties['configRepositoryName' ?? ''];
  const managementAccountEmail: string = event.ResourceProperties['managementAccountEmail' ?? ''];
  const auditAccountEmail: string = event.ResourceProperties['auditAccountEmail' ?? ''];
  const logArchiveAccountEmail: string = event.ResourceProperties['logArchiveAccountEmail' ?? ''];
  const partition = event.ResourceProperties['partition'];
  const stackName = event.ResourceProperties['stackName'];

  console.log(`Configuration Table Name: ${configTableName}`);
  console.log(`Configuration Repository Name: ${configRepositoryName}`);

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
      const commitId = await getCommitId(configRepositoryName);
      const organizationConfigContent = await getConfigFileContents('organization-config.yaml', configRepositoryName);
      const organizationValues = t.parse(
        OrganizationConfigTypes.organizationConfig,
        yaml.load(organizationConfigContent),
      );
      const organizationConfig = new OrganizationConfig(organizationValues);
      await organizationConfig.loadOrganizationalUnitIds(partition);
      for (const organizationalUnit of organizationConfig.organizationalUnits) {
        const awsKey = organizationConfig.getOrganizationalUnitId(organizationalUnit.name) || '';
        await putOrganizationConfigInTable(organizationalUnit, configTableName, awsKey, commitId);
      }
      const accountsConfigContent = await getConfigFileContents('accounts-config.yaml', configRepositoryName);
      const accountsValues = t.parse(AccountsConfigTypes.accountsConfig, yaml.load(accountsConfigContent));
      const accountsConfig = new AccountsConfig(
        {
          managementAccountEmail: managementAccountEmail,
          auditAccountEmail: auditAccountEmail,
          logArchiveAccountEmail: logArchiveAccountEmail,
        },
        accountsValues,
      );
      await accountsConfig.loadAccountIds(partition);
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
        await putAccountConfigInTable(
          'mandatory',
          account,
          configTableName,
          awsKey,
          commitId,
          account.organizationalUnit,
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
        );
      }
      return {
        PhysicalResourceId: commitId,
        Status: 'Success',
      };
    case 'Delete':
      return {
        PhysicalResourceId: event.PhysicalResourceId,
        Status: 'Success',
      };
  }
}

async function getConfigFileContents(configFileName: string, configRepositoryName: string): Promise<string> {
  const response = await throttlingBackOff(() =>
    codeCommitClient.send(
      new GetFileCommand({ filePath: configFileName, repositoryName: configRepositoryName, commitSpecifier: 'main' }),
    ),
  );
  if (response.fileContent) {
    const contents = Buffer.from(response.fileContent).toString();
    return contents; //decodedContents;
  }
  return '';
}

async function putOrganizationConfigInTable(
  configData: OrganizationalUnitConfig,
  configTableName: string,
  awsKey: string,
  commitId: string,
): Promise<void> {
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

async function getCommitId(configRepositoryName: string): Promise<string> {
  const response = await throttlingBackOff(() =>
    codeCommitClient.send(
      new GetFileCommand({
        filePath: 'global-config.yaml',
        repositoryName: configRepositoryName,
        commitSpecifier: 'main',
      }),
    ),
  );
  if (response.commitId) {
    return response.commitId.slice(0, 8);
  } else {
    return '';
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

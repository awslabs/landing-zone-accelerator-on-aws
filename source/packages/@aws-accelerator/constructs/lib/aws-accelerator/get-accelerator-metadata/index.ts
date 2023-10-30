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

import { throttlingBackOff } from '@aws-accelerator/utils';
import * as AWS from 'aws-sdk';
AWS.config.logger = console;

/**
 * get-accelerator-metadata - lambda handler
 *
 * @param event
 * @returns
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handler(_event: AWSLambda.CloudFormationCustomResourceEvent): Promise<
  | {
      Status: string | undefined;
      StatusCode: number | undefined;
    }
  | undefined
> {
  const globalRegion = process.env['GLOBAL_REGION'];
  const solutionId = process.env['SOLUTION_ID'];
  const acceleratorPrefix = process.env['ACCELERATOR_PREFIX']!;
  const crossAccountRole = process.env['CROSS_ACCOUNT_ROLE']!;
  const logAccountId = process.env['LOG_ACCOUNT_ID']!;
  const partition = process.env['PARTITION']!;
  const repositoryName = process.env['CONFIG_REPOSITORY_NAME']!;
  const ssmAcceleratorVersionPath = process.env['ACCELERATOR_VERSION_SSM_PATH']!;
  const organizationId = process.env['ORGANIZATION_ID']!;
  const centralLoggingBucket = process.env['CENTRAL_LOG_BUCKET']!;
  const elbLogBucket = process.env['ELB_LOGGING_BUCKET']!;
  const metadataBucket = process.env['METADATA_BUCKET']!;
  const pipelineName = `${acceleratorPrefix}-Pipeline`;
  const codeCommitClient = new AWS.CodeCommit({ customUserAgent: solutionId });
  const s3Client = new AWS.S3({ customUserAgent: solutionId });
  const ssmClient = new AWS.SSM({ customUserAgent: solutionId });
  const organizationsClient = new AWS.Organizations({ customUserAgent: solutionId, region: globalRegion });
  const codePipelineClient = new AWS.CodePipeline({ customUserAgent: solutionId });
  const stsClient = new AWS.STS({ customUserAgent: solutionId, region: globalRegion });
  const assumeRoleCredentials = await assumeRole(stsClient, crossAccountRole, logAccountId, partition);
  const s3ClientLoggingAccount = new AWS.S3({ credentials: assumeRoleCredentials });
  const kmsClientLoggingAccount = new AWS.KMS({ credentials: assumeRoleCredentials });
  const lastSuccessfulExecution = await getLastSuccessfulPipelineExecution(codePipelineClient, pipelineName);
  if (!lastSuccessfulExecution) {
    throw new Error('No successful Accelerator CodePipeline executions found. Exiting...');
  }
  const pipelineExecutionInfo = await throttlingBackOff(() =>
    codePipelineClient
      .getPipelineExecution({ pipelineExecutionId: lastSuccessfulExecution.pipelineExecutionId!, pipelineName })
      .promise(),
  );

  const sourceConfigArtifact = pipelineExecutionInfo.pipelineExecution?.artifactRevisions
    ?.filter(artifactRevision => artifactRevision.name === 'Config')
    .pop();

  if (!sourceConfigArtifact?.revisionId) {
    throw new Error('No commitId found for config artifact in CodePipeline stage source. Exiting');
  }
  const commitId = sourceConfigArtifact.revisionId;
  const codeCommitFiles = await getAllCodeCommitFiles({ codeCommitClient, commitId, repositoryName });
  const version = await getSsmParameterValue(ssmClient, ssmAcceleratorVersionPath);
  const ous = await getAllOusWithPaths(organizationsClient);
  const accounts = await getAllOrgAccountsWithPaths(organizationsClient, ous);
  const logBucket = await getBucketInfo(
    s3ClientLoggingAccount,
    kmsClientLoggingAccount,
    centralLoggingBucket,
    'LogBucket',
  );
  const aesLogBucket = await getBucketInfo(s3ClientLoggingAccount, kmsClientLoggingAccount, elbLogBucket, 'AesBucket');

  const metadata = JSON.stringify(
    {
      lastSuccessfulExecution,
      lastSuccessfulCommitId: commitId,
      acceleratorCurrentVersion: version,
      logBucket,
      aesLogBucket,
      organizationId,
      accounts,
      ous,
    },
    null,
    4,
  );

  const bucketItems = await listBucketObjects(s3ClientLoggingAccount, metadataBucket);

  for (const item of bucketItems) {
    await s3ClientLoggingAccount.deleteObject({ Bucket: metadataBucket, Key: item.Key! }).promise();
  }

  await s3Client
    .putObject({ Bucket: metadataBucket, Key: 'metadata.json', Body: metadata, ACL: 'bucket-owner-full-control' })
    .promise();

  for (const file of codeCommitFiles) {
    await s3Client
      .putObject({
        Bucket: metadataBucket,
        Key: `config/${file.filePath}`,
        Body: file.fileContents,
        ACL: 'bucket-owner-full-control',
      })
      .promise();
  }

  return;
}

async function getRepositoryFolder(props: {
  codeCommitClient: AWS.CodeCommit;
  repositoryName: string;
  folderPath: string;
  commitId: string | undefined;
}): Promise<AWS.CodeCommit.GetFolderOutput> {
  return throttlingBackOff(() =>
    props.codeCommitClient
      .getFolder({
        folderPath: props.folderPath,
        repositoryName: props.repositoryName,
        commitSpecifier: props.commitId,
      })
      .promise(),
  );
}
async function downloadRepositoryFile(props: {
  codeCommitClient: AWS.CodeCommit;
  repositoryName: string;
  commitSpecifier: string;
  filePath: string;
}): Promise<{ fileContents: string; filePath: string }> {
  const file = await throttlingBackOff(() =>
    props.codeCommitClient
      .getFile({
        filePath: props.filePath,
        repositoryName: props.repositoryName,
        commitSpecifier: props.commitSpecifier,
      })
      .promise(),
  );
  return {
    fileContents: file.fileContent.toString(),
    filePath: file.filePath,
  };
}

async function getAllCodeCommitFilePaths(props: {
  codeCommitClient: AWS.CodeCommit;
  repositoryName: string;
  commitId: string;
}) {
  const folderPaths = ['/'];
  const files: AWS.CodeCommit.FileList = [];

  do {
    const folderPath = folderPaths.pop();
    if (folderPath) {
      const folderContents = await getRepositoryFolder({
        codeCommitClient: props.codeCommitClient,
        commitId: props.commitId,
        repositoryName: props.repositoryName,
        folderPath,
      });
      for (const subFolder of folderContents.subFolders ?? []) {
        if (subFolder.absolutePath) {
          folderPaths.push(subFolder.absolutePath);
        }
      }

      if (folderContents.files && folderContents.files.length > 0) {
        files.push(...folderContents.files);
      }
    }
  } while (folderPaths.length > 0);

  return files;
}

async function getAllCodeCommitFiles(props: {
  codeCommitClient: AWS.CodeCommit;
  repositoryName: string;
  commitId: string;
}) {
  const files = [];
  const filePaths = await getAllCodeCommitFilePaths({
    codeCommitClient: props.codeCommitClient,
    commitId: props.commitId,
    repositoryName: props.repositoryName,
  });
  for (const path of filePaths ?? []) {
    if (path.absolutePath) {
      const file = await downloadRepositoryFile({
        codeCommitClient: props.codeCommitClient,
        repositoryName: props.repositoryName,
        commitSpecifier: props.commitId,
        filePath: path.absolutePath,
      });

      files.push(file);
    }
  }

  return files;
}

async function getSsmParameterValue(ssmClient: AWS.SSM, parameterPath: string) {
  const getParamResponse = await throttlingBackOff(() => ssmClient.getParameter({ Name: parameterPath }).promise());
  return getParamResponse.Parameter?.Value;
}

async function listAllOuChildren(
  organizationsClient: AWS.Organizations,
  parentId: string,
  childType: 'ORGANIZATIONAL_UNIT' | 'ACCOUNT',
) {
  const children = [];
  let nextToken;
  do {
    const childrenResponse = await throttlingBackOff(() =>
      organizationsClient.listChildren({ ChildType: childType, ParentId: parentId }).promise(),
    );
    nextToken = childrenResponse.NextToken;
    if (childrenResponse.Children && childrenResponse.Children.length > 0) {
      children.push(...childrenResponse.Children);
    }
  } while (nextToken);
  return children.map(child => {
    return {
      id: child.Id!,
      parentId: parentId,
    };
  });
}

function getOrgPath(
  ous: {
    id: string;
    parentId: string;
    arn: string;
    name: string;
  }[],
  id: string,
  path = '',
): string {
  const filteredOus = ous.filter(ou => {
    return id === ou.id;
  });

  if (id.startsWith('r-')) {
    return path.slice(0, -1);
  } else {
    path = `${filteredOus[0]!.name}/${path}`;
  }

  return getOrgPath(ous, filteredOus[0].parentId, path);
}
async function getAllOusWithPaths(organizationsClient: AWS.Organizations) {
  const rootResponse = await throttlingBackOff(() => organizationsClient.listRoots({}).promise());
  const ouIdLookups: { id: string; parentId: string }[] = [];
  const ouIds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ous: any[] = [];
  if (rootResponse.Roots && rootResponse.Roots.length > 0) {
    ouIds.push(rootResponse.Roots[0].Id!);
    ouIdLookups.push({ id: rootResponse.Roots[0].Id!, parentId: '' });
    ous.push({
      id: rootResponse.Roots[0].Id!,
      parentId: '',
      arn: rootResponse.Roots[0].Arn!,
      name: rootResponse.Roots[0].Name!,
    });
  }

  while (ouIds.length > 0) {
    const ouId = ouIds.pop()!;
    const children = await listAllOuChildren(organizationsClient, ouId, 'ORGANIZATIONAL_UNIT');
    const ids = children.map(child => child.id);
    ouIds.push(...ids);
    ouIdLookups.push(...children);
  }

  for (const ou of ouIdLookups) {
    if (!ou.id.startsWith('r-')) {
      const ouInfo = await throttlingBackOff(() =>
        organizationsClient.describeOrganizationalUnit({ OrganizationalUnitId: ou.id }).promise(),
      );
      ous.push({
        id: ou.id,
        parentId: ou.parentId,
        arn: ouInfo.OrganizationalUnit?.Arn,
        name: ouInfo.OrganizationalUnit?.Name,
      });
    }
  }
  for (const ou of ous) {
    if (ou.id.startsWith('r-')) {
      ou['path'] = '/';
    } else {
      const path = getOrgPath(ous, ou.id);
      ou['path'] = path;
    }
  }
  return ous;
}

async function getAllOrgAccountsWithPaths(
  organizationsClient: AWS.Organizations,
  ous: {
    id: string;
    parentId: string;
    arn: string;
    name: string;
    path: string;
  }[],
) {
  const accounts = [];
  const orgAccounts: { id: string; arn: string; name: string; parentId: string; path?: string }[] = [];
  for (const ou of ous) {
    const childAccounts = await listAllOuChildren(organizationsClient, ou.id, 'ACCOUNT');
    accounts.push(...childAccounts);
  }

  for (const account of accounts) {
    const accountInfo = await throttlingBackOff(() =>
      organizationsClient.describeAccount({ AccountId: account.id }).promise(),
    );
    orgAccounts.push({
      id: accountInfo.Account!.Id!,
      arn: accountInfo.Account!.Arn!,
      name: accountInfo.Account!.Name!,
      parentId: account.parentId,
    });
  }

  for (const account of orgAccounts) {
    const path = getOrgPath([...ous, ...orgAccounts], account.id);
    account['path'] = path;
  }

  return orgAccounts;
}

function findSuccessfulPipelineExecution(
  executions: AWS.CodePipeline.ListPipelineExecutionsOutput,
): AWS.CodePipeline.PipelineExecutionSummary | undefined {
  for (const execution of executions.pipelineExecutionSummaries ?? []) {
    if (execution.status === 'Succeeded') {
      return execution;
    }
  }

  return;
}

async function getLastSuccessfulPipelineExecution(codePipelineClient: AWS.CodePipeline, pipelineName: string) {
  let nextToken: string | undefined;
  let lastSuccessfulExecution: AWS.CodePipeline.PipelineExecutionSummary | undefined;
  do {
    const executions = await throttlingBackOff(() =>
      codePipelineClient.listPipelineExecutions({ pipelineName, nextToken }).promise(),
    );
    lastSuccessfulExecution = findSuccessfulPipelineExecution(executions);
    nextToken = executions.nextToken;
  } while (nextToken || !lastSuccessfulExecution);

  return lastSuccessfulExecution;
}

async function getBucketInfo(
  s3client: AWS.S3,
  kmsClient: AWS.KMS,
  bucketName: string,
  type: 'LogBucket' | 'AesBucket',
) {
  const bucketRegion = await throttlingBackOff(() => s3client.getBucketLocation({ Bucket: bucketName }).promise());
  const bucketEncryption = await throttlingBackOff(() =>
    s3client.getBucketEncryption({ Bucket: bucketName }).promise(),
  );
  let encryptionKeyId: string | undefined;
  let encryptionKeyArn: string | undefined;
  let alias;
  for (const rule of bucketEncryption.ServerSideEncryptionConfiguration?.Rules || []) {
    if (rule.ApplyServerSideEncryptionByDefault?.KMSMasterKeyID) {
      encryptionKeyId = rule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID;
    }
  }
  if (encryptionKeyId) {
    const keyInfo = await kmsClient.describeKey({ KeyId: encryptionKeyId }).promise();
    encryptionKeyArn = keyInfo.KeyMetadata?.Arn;
    const aliasResponse = await kmsClient.listAliases({ KeyId: encryptionKeyId }).promise();
    if (aliasResponse.Aliases && aliasResponse.Aliases.length > 0) {
      alias = aliasResponse.Aliases.pop()?.AliasName;
    }
    console.log(keyInfo.KeyMetadata);
    console.log(alias);
  }
  const logBucket: {
    type: 'LogBucket' | 'AesBucket';
    value: {
      bucketArn: string;
      bucketName: string;
      encryptionKeyArn?: string;
      region?: string;
      encryptionKeyId?: string;
      encryptionKeyName?: string;
    };
  } = {
    type,
    value: {
      bucketArn: `arn:aws:s3:::${bucketName}`,
      bucketName,
      region: bucketRegion.LocationConstraint,
    },
  };
  if (encryptionKeyId) {
    logBucket.value.encryptionKeyId = encryptionKeyId;
  }
  if (encryptionKeyArn) {
    logBucket.value['encryptionKeyArn'] = encryptionKeyArn;
  }
  if (alias) {
    logBucket.value['encryptionKeyName'] = alias;
  }

  return logBucket;
}
async function assumeRole(
  stsClient: AWS.STS,
  assumeRoleName: string,
  accountId: string,
  partition: string,
): Promise<AWS.Credentials> {
  const roleArn = `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`;
  const assumeRole = await throttlingBackOff(() =>
    stsClient.assumeRole({ RoleArn: roleArn, RoleSessionName: 'MetadataAssumeRoleSession' }).promise(),
  );
  return new AWS.Credentials({
    accessKeyId: assumeRole.Credentials!.AccessKeyId,
    secretAccessKey: assumeRole.Credentials!.SecretAccessKey,
    sessionToken: assumeRole.Credentials!.SessionToken,
  });
}

async function listBucketObjects(s3Client: AWS.S3, bucket: string) {
  let nextToken: string | undefined;
  const bucketObjects = [];
  do {
    const listObjectsResponse = await throttlingBackOff(() =>
      s3Client.listObjectsV2({ Bucket: bucket, ContinuationToken: nextToken }).promise(),
    );
    nextToken = listObjectsResponse.ContinuationToken;
    if (listObjectsResponse.Contents && listObjectsResponse.Contents.length > 0) {
      bucketObjects.push(...listObjectsResponse.Contents);
    }
  } while (nextToken);
  return bucketObjects;
}

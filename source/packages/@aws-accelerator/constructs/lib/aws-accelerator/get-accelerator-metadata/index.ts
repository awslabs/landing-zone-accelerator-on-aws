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

import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { CloudFormationCustomResourceEvent } from '@aws-accelerator/utils/lib/common-types';
import { setRetryStrategy } from '@aws-accelerator/utils/lib/common-functions';
import {
  CodeCommitClient,
  File,
  GetFileCommand,
  GetFolderCommand,
  GetFolderCommandOutput,
} from '@aws-sdk/client-codecommit';
import {
  CodePipelineClient,
  GetPipelineExecutionCommand,
  ListPipelineExecutionsCommandOutput,
  PipelineExecutionSummary,
  paginateListPipelineExecutions,
} from '@aws-sdk/client-codepipeline';
import {
  ListObjectsV2Command,
  PutObjectCommand,
  GetBucketLocationCommand,
  GetBucketEncryptionCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { AssumeRoleCommand, Credentials, STSClient } from '@aws-sdk/client-sts';
import { KMSClient, DescribeKeyCommand, ListAliasesCommand } from '@aws-sdk/client-kms';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import {
  DescribeAccountCommand,
  OrganizationsClient,
  ListChildrenCommand,
  ListRootsCommand,
  DescribeOrganizationalUnitCommand,
} from '@aws-sdk/client-organizations';
import AdmZip from 'adm-zip';
import * as fs from 'fs';

/**
 * get-accelerator-metadata - lambda handler
 *
 * @param event
 * @returns
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function handler(_event: CloudFormationCustomResourceEvent): Promise<
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
  const configRepositoryLocation = process.env['CONFIG_REPOSITORY_LOCATION']!;
  const configBucketName = process.env['CONFIG_BUCKET_NAME']!;
  const pipelineName = `${acceleratorPrefix}-Pipeline`;
  const s3ConfigObjectKey = 'zipped/aws-accelerator-config.zip';

  const codeCommitClient = new CodeCommitClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
  const s3Client = new S3Client({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
  const ssmClient = new SSMClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
  const organizationsClient = new OrganizationsClient({
    customUserAgent: solutionId,
    region: globalRegion,
    retryStrategy: setRetryStrategy(),
  });
  const codePipelineClient = new CodePipelineClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
  const stsClient = new STSClient({ customUserAgent: solutionId, retryStrategy: setRetryStrategy() });
  const assumeRoleCredentials = await assumeRole(stsClient, crossAccountRole, logAccountId, partition);
  const loggingAccountCredentials = {
    accessKeyId: assumeRoleCredentials.AccessKeyId!,
    secretAccessKey: assumeRoleCredentials.SecretAccessKey!,
    sessionToken: assumeRoleCredentials.SessionToken!,
  };
  const s3ClientLoggingAccount = new S3Client({
    credentials: loggingAccountCredentials,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const kmsClientLoggingAccount = new KMSClient({
    credentials: loggingAccountCredentials,
    customUserAgent: solutionId,
    retryStrategy: setRetryStrategy(),
  });
  const lastSuccessfulExecution = await getLastSuccessfulPipelineExecution(codePipelineClient, pipelineName);
  if (!lastSuccessfulExecution) {
    throw new Error('No successful Accelerator CodePipeline executions found. Exiting...');
  }
  const pipelineExecutionInfo = await throttlingBackOff(() =>
    codePipelineClient.send(
      new GetPipelineExecutionCommand({
        pipelineExecutionId: lastSuccessfulExecution.pipelineExecutionId!,
        pipelineName,
      }),
    ),
  );

  const sourceConfigArtifact = pipelineExecutionInfo.pipelineExecution?.artifactRevisions
    ?.filter(artifactRevision => artifactRevision.name === 'Config')
    .pop();

  if (!sourceConfigArtifact?.revisionId) {
    throw new Error('No revisionId found for config artifact in CodePipeline stage source. Exiting');
  }
  const commitId = sourceConfigArtifact.revisionId;
  const configFiles = await getAllConfigFiles({
    codeCommitClient,
    commitId,
    repositoryName,
    configRepositoryLocation,
    s3Client,
    s3ConfigObjectKey,
    configBucketName,
  });
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
    await s3ClientLoggingAccount.send(new DeleteObjectCommand({ Bucket: metadataBucket, Key: item.Key! }));
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: metadataBucket,
      Key: 'metadata.json',
      Body: metadata,
      ACL: 'bucket-owner-full-control',
    }),
  );

  for (const file of configFiles) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: metadataBucket,
        Key: `config/${file.filePath}`,
        Body: file.fileContents,
        ACL: 'bucket-owner-full-control',
      }),
    );
  }

  return;
}

async function getRepositoryFolder(props: {
  codeCommitClient: CodeCommitClient;
  repositoryName: string;
  folderPath: string;
  commitId: string | undefined;
}): Promise<GetFolderCommandOutput> {
  return throttlingBackOff(() =>
    props.codeCommitClient.send(
      new GetFolderCommand({
        folderPath: props.folderPath,
        repositoryName: props.repositoryName,
        commitSpecifier: props.commitId,
      }),
    ),
  );
}
async function downloadRepositoryFile(props: {
  codeCommitClient: CodeCommitClient;
  repositoryName: string;
  commitSpecifier: string;
  filePath: string;
}): Promise<{ fileContents: string; filePath: string }> {
  const decoder = new TextDecoder();
  const file = await throttlingBackOff(() =>
    props.codeCommitClient.send(
      new GetFileCommand({
        filePath: props.filePath,
        repositoryName: props.repositoryName,
        commitSpecifier: props.commitSpecifier,
      }),
    ),
  );
  return {
    fileContents: decoder.decode(file.fileContent!),
    filePath: file.filePath!,
  };
}

async function getAllCodeCommitFilePaths(props: {
  codeCommitClient: CodeCommitClient;
  repositoryName: string;
  commitId: string;
}) {
  const folderPaths = ['/'];
  const files: File[] = [];

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

async function getAllConfigFiles(props: {
  codeCommitClient: CodeCommitClient;
  repositoryName: string;
  commitId: string;
  configRepositoryLocation: string;
  s3Client: S3Client;
  s3ConfigObjectKey: string;
  configBucketName: string;
}) {
  if (props.configRepositoryLocation === 'codecommit') {
    return await getAllCodeCommitFiles(props);
  } else if (props.configRepositoryLocation === 's3') {
    return await getAllS3Files(props);
  } else {
    throw new Error(`Invalid config repository location ${props.configRepositoryLocation}, exiting`);
  }
}

async function getFileFromS3(props: {
  s3Client: S3Client;
  configBucketName: string;
  commitId: string;
  s3ConfigObjectKey: string;
}) {
  const response = await throttlingBackOff(() =>
    props.s3Client.send(
      new GetObjectCommand({
        Bucket: props.configBucketName,
        Key: props.s3ConfigObjectKey,
        VersionId: props.commitId,
      }),
    ),
  );
  const zipFile = response.Body;

  if (!zipFile) {
    throw new Error('Failed to download the configuration file from S3.');
  }
  const tempFilePath = `/tmp/${props.s3ConfigObjectKey.split('/').pop()}`;
  await fs.promises.writeFile(tempFilePath, await zipFile.transformToByteArray());

  return tempFilePath;
}

async function getAllS3Files(props: {
  s3Client: S3Client;
  configBucketName: string;
  commitId: string;
  s3ConfigObjectKey: string;
}) {
  const files: { fileContents: string; filePath: string }[] = [];
  const tempFilePath = await getFileFromS3(props);

  const admZipInstance = new AdmZip(tempFilePath);
  const zipEntries = admZipInstance.getEntries();

  zipEntries.forEach(zipEntry => {
    if (!zipEntry.isDirectory) {
      const fileContent = admZipInstance.readAsText(zipEntry);
      console.log(`Reading file: ${zipEntry.entryName}`);
      files.push({
        filePath: zipEntry.entryName,
        fileContents: fileContent,
      });
    }
  });
  fs.unlinkSync(tempFilePath);

  return files;
}

async function getAllCodeCommitFiles(props: {
  codeCommitClient: CodeCommitClient;
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

async function getSsmParameterValue(ssmClient: SSMClient, parameterPath: string) {
  const getParamResponse = await throttlingBackOff(() =>
    ssmClient.send(new GetParameterCommand({ Name: parameterPath })),
  );
  return getParamResponse.Parameter?.Value;
}

async function listAllOuChildren(
  organizationsClient: OrganizationsClient,
  parentId: string,
  childType: 'ORGANIZATIONAL_UNIT' | 'ACCOUNT',
) {
  const children = [];
  let nextToken;
  do {
    const childrenResponse = await throttlingBackOff(() =>
      organizationsClient.send(new ListChildrenCommand({ ChildType: childType, ParentId: parentId })),
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
async function getAllOusWithPaths(organizationsClient: OrganizationsClient) {
  const rootResponse = await throttlingBackOff(() => organizationsClient.send(new ListRootsCommand({})));
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
        organizationsClient.send(new DescribeOrganizationalUnitCommand({ OrganizationalUnitId: ou.id })),
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
  organizationsClient: OrganizationsClient,
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
      organizationsClient.send(new DescribeAccountCommand({ AccountId: account.id })),
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
  executions: ListPipelineExecutionsCommandOutput,
): PipelineExecutionSummary | undefined {
  for (const execution of executions.pipelineExecutionSummaries ?? []) {
    if (execution.status === 'Succeeded') {
      return execution;
    }
  }

  return;
}

async function getLastSuccessfulPipelineExecution(codePipelineClient: CodePipelineClient, pipelineName: string) {
  let lastSuccessfulExecution: PipelineExecutionSummary | undefined;
  const paginator = paginateListPipelineExecutions({ client: codePipelineClient }, { pipelineName });

  for await (const page of paginator) {
    lastSuccessfulExecution = findSuccessfulPipelineExecution(page) ?? lastSuccessfulExecution;
  }

  return lastSuccessfulExecution;
}

async function getBucketInfo(
  s3client: S3Client,
  kmsClient: KMSClient,
  bucketName: string,
  type: 'LogBucket' | 'AesBucket',
) {
  const bucketRegion = await throttlingBackOff(() =>
    s3client.send(new GetBucketLocationCommand({ Bucket: bucketName })),
  );
  const bucketEncryption = await throttlingBackOff(() =>
    s3client.send(new GetBucketEncryptionCommand({ Bucket: bucketName })),
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
    const keyInfo = await kmsClient.send(new DescribeKeyCommand({ KeyId: encryptionKeyId }));
    encryptionKeyArn = keyInfo.KeyMetadata?.Arn;
    const aliasResponse = await kmsClient.send(new ListAliasesCommand({ KeyId: encryptionKeyId }));
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
  stsClient: STSClient,
  assumeRoleName: string,
  accountId: string,
  partition: string,
): Promise<Credentials> {
  const roleArn = `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`;
  const assumeRole = await throttlingBackOff(() =>
    stsClient.send(new AssumeRoleCommand({ RoleArn: roleArn, RoleSessionName: 'MetadataAssumeRoleSession' })),
  );
  return {
    AccessKeyId: assumeRole.Credentials!.AccessKeyId,
    SecretAccessKey: assumeRole.Credentials!.SecretAccessKey,
    SessionToken: assumeRole.Credentials!.SessionToken,
    Expiration: assumeRole.Credentials!.Expiration,
  };
}

async function listBucketObjects(s3Client: S3Client, bucket: string) {
  let nextToken: string | undefined;
  const bucketObjects = [];
  do {
    const listObjectsResponse = await throttlingBackOff(() =>
      s3Client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: nextToken })),
    );
    nextToken = listObjectsResponse.ContinuationToken;
    if (listObjectsResponse.Contents && listObjectsResponse.Contents.length > 0) {
      bucketObjects.push(...listObjectsResponse.Contents);
    }
  } while (nextToken);
  return bucketObjects;
}

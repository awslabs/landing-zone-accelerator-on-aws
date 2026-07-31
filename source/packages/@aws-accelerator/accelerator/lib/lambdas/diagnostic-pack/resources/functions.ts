import { AssumeRoleCommand, STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  CloudFormationClient,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { CodeCommitClient, GetFileCommand } from '@aws-sdk/client-codecommit';
import {
  ActionExecution,
  ArtifactDetail,
  CodePipelineClient,
  GetPipelineStateCommand,
  ListActionExecutionsCommand,
  ListPipelineExecutionsCommand,
  PipelineExecutionSummary,
} from '@aws-sdk/client-codepipeline';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

import {
  AccountDetailsType,
  ConfigSourceType,
  DiagnosticAccountsConfigType,
  InstallerStackMetadataType,
  LzaAccountsConfigType,
  LzaGlobalConfigType,
  LzaStackEnvironmentType,
  PipelineDetailStatusType,
  PipelineStatusType,
} from './types';

export function formatTableCellValue(cellMessage: string): string {
  if (cellMessage === 'Failed') {
    return `<td style="background-color: red; color: blue;">${cellMessage}</td>`;
  }
  return `<td>${cellMessage}</td>`;
}

function getAccountId(email: string, accountDetails: AccountDetailsType[]): string {
  for (const account of accountDetails) {
    if (account.accountEmail.toLocaleLowerCase() === email.toLocaleLowerCase()) {
      return account.accountId;
    }
  }

  throw new Error(`Account with email ${email} not found in organization accounts`);
}

function replaceAll(input: string, find: string, replace: string) {
  return input.replace(new RegExp(find, 'g'), replace);
}

async function getBuildLogErrors(
  cwlClient: CloudWatchLogsClient,
  logGroupName: string,
  logStreamName: string,
): Promise<string> {
  let buildErrorMessages = '<ul>';

  const errorPatterns: string[] = ['error', 'ERROR', 'fail', 'FAIL'];

  for (const errorPattern of errorPatterns) {
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cwlClient.send(
          new FilterLogEventsCommand({
            logGroupName: logGroupName,
            logStreamNames: [logStreamName],
            nextToken: nextToken,
            filterPattern: errorPattern,
          }),
        ),
      );
      for (const event of page.events ?? []) {
        buildErrorMessages += '<li>' + event.message + '</li>';
      }
      nextToken = page.nextToken;
    } while (nextToken);
  }

  buildErrorMessages += '</ul>';

  return buildErrorMessages;
}

function maskAccountIdAndEmails(input: string, accountDetails: AccountDetailsType[]): string {
  let maskedInput = input;

  for (const accountDetail of accountDetails) {
    const maskEmailInput = replaceAll(
      maskedInput,
      `${accountDetail.accountEmail}`,
      `${accountDetail.accountName}-account@email.com`,
    );
    const maskAccountIdInput = replaceAll(
      maskEmailInput,
      accountDetail.accountId,
      `[${accountDetail.accountName.toUpperCase()}-ACCOUNT-ID]`,
    );
    maskedInput = maskAccountIdInput;
  }
  return maskedInput;
}

function getStackNames(actionName: string, prefix: string, accountID: string, region: string): string[] {
  const stackNames: string[] = [];
  switch (actionName) {
    case 'Network_Associations':
      stackNames.push(`${prefix}-NetworkAssociationsStack-${accountID}-${region}`);
      stackNames.push(`${prefix}-NetworkAssociationsGwlbStack-${accountID}-${region}`);
      break;
    case 'Network_VPCs':
      stackNames.push(`${prefix}-NetworkVpcDnsStack-${accountID}-${region}`);
      stackNames.push(`${prefix}-NetworkVpcEndpointsStack-${accountID}-${region}`);
      stackNames.push(`${prefix}-NetworkVpcStack-${accountID}-${region}`);
      break;
    case 'Network_Prepare':
      stackNames.push(`${prefix}-NetworkPrepStack-${accountID}-${region}`);
      break;
    case 'Security_Resources':
      stackNames.push(`${prefix}-SecurityResourcesStack-${accountID}-${region}`);
      break;
    case 'Bootstrap':
      stackNames.push(`${prefix}-CDKToolkit-${accountID}-${region}`);
      break;
    case 'Key':
      stackNames.push(`${prefix}-${actionName}Stack-${accountID}-${region}`);
      stackNames.push(`${prefix}-DependenciesStack-${accountID}-${region}`);
      break;
    case 'Install':
      stackNames.push(`${prefix}-InstallerStack-${accountID}-${region}`);
      break;
    default:
      stackNames.push(`${prefix}-${actionName}Stack-${accountID}-${region}`);
  }

  return stackNames;
}

async function getManagementAccountCredentials(
  partition: string,
  homeRegion: string,
  pipelineAccountId: string,
  managementAccountRoleName?: string,
  managementAccountId?: string,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined> {
  if (managementAccountRoleName && managementAccountId && pipelineAccountId !== managementAccountId) {
    const stsClient = new STSClient({ region: homeRegion });
    const response = await throttlingBackOff(() =>
      stsClient.send(
        new AssumeRoleCommand({
          RoleArn: `arn:${partition}:iam::${managementAccountId}:role/${managementAccountRoleName}`,
          RoleSessionName: 'LZADiagnosticReportSession',
          DurationSeconds: 900,
        }),
      ),
    );

    return {
      accessKeyId: response.Credentials!.AccessKeyId!,
      secretAccessKey: response.Credentials!.SecretAccessKey!,
      sessionToken: response.Credentials!.SessionToken,
    };
  } else {
    return undefined;
  }
}

async function getWorkLoadAccountCredentials(
  prefix: string,
  partition: string,
  region: string,
  accountId: string,
): Promise<{ accessKeyId: string; secretAccessKey: string; sessionToken?: string } | undefined> {
  const assumeRoleName = `${prefix}-DiagnosticsPackAccessRole`;
  const stsClient = new STSClient({ region: region });
  const callerIdentityResponse = await throttlingBackOff(() => stsClient.send(new GetCallerIdentityCommand({})));
  if (callerIdentityResponse.Account === accountId) {
    return undefined;
  }
  const response = await throttlingBackOff(() =>
    stsClient.send(
      new AssumeRoleCommand({
        RoleArn: `arn:${partition}:iam::${accountId}:role/${assumeRoleName}`,
        RoleSessionName: 'LZADiagnosticReportAccountSession',
        DurationSeconds: 900,
      }),
    ),
  );

  return {
    accessKeyId: response.Credentials!.AccessKeyId!,
    secretAccessKey: response.Credentials!.SecretAccessKey!,
    sessionToken: response.Credentials!.SessionToken,
  };
}

export async function getInstallerStackMetadata(
  homeRegion: string,
  stackName: string,
): Promise<InstallerStackMetadataType> {
  const cfnClient = new CloudFormationClient({ region: homeRegion });
  const response = await throttlingBackOff(() => cfnClient.send(new DescribeStacksCommand({ StackName: stackName })));
  const installerMetadata: InstallerStackMetadataType = {
    lzaVersion: 'Version 1.0.0.',
    isExternal: false,
    prefix: 'AWSAccelerator',
    releaseBranch: 'main',
  };

  installerMetadata.lzaVersion = response
    .Stacks![0].Description!.replace('(SO0199) Landing Zone Accelerator on AWS. Version ', '')
    .slice(0, -1);

  for (const parameter of response.Stacks![0].Parameters ?? []) {
    switch (parameter.ParameterKey!) {
      case 'RepositoryBranchName':
        installerMetadata.releaseBranch = parameter.ParameterValue!;
        break;
      case 'AcceleratorPrefix':
        installerMetadata.prefix = parameter.ParameterValue!;
        break;
      case 'AcceleratorQualifier':
        installerMetadata.qualifier = parameter.ParameterValue;
        break;
      case 'ManagementAccountId':
        installerMetadata.managementAccountId = parameter.ParameterValue;
        break;
    }
  }

  // External deployment
  if (installerMetadata.qualifier && installerMetadata.managementAccountId) {
    installerMetadata.isExternal = true;
  }
  return installerMetadata;
}

export async function getOrgAccountDetails(
  homeRegion: string,
  partition: string,
  pipelineAccountId: string,
  installerStackMetadata: InstallerStackMetadataType,
  managementAccountRoleName?: string,
): Promise<AccountDetailsType[]> {
  const managementAccountCredential = await getManagementAccountCredentials(
    partition,
    homeRegion,
    pipelineAccountId,
    managementAccountRoleName,
    installerStackMetadata.managementAccountId,
  );

  const orgClient = new OrganizationsClient({ region: homeRegion, credentials: managementAccountCredential });

  const accountDetails: AccountDetailsType[] = [];
  let nextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() => orgClient.send(new ListAccountsCommand({ NextToken: nextToken })));
    for (const account of page.Accounts ?? []) {
      if (account.Id && account.Name) {
        accountDetails.push({ accountName: account.Name, accountEmail: account.Email!, accountId: account.Id });
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  if (installerStackMetadata.isExternal) {
    accountDetails.push({
      accountName: 'ExternalPipeline',
      accountEmail: 'ExternalPipelineAccount@email.com',
      accountId: pipelineAccountId,
    });
  }

  return accountDetails;
}

/**
 * S3 object key of the zipped LZA configuration files within the configuration bucket.
 */
const S3_CONFIG_OBJECT_KEY = 'zipped/aws-accelerator-config.zip';

/**
 * Local directory the S3 configuration zip is extracted to.
 */
const S3_CONFIG_EXTRACT_DIR = '/tmp/lza-source-config';

/**
 * Prepares the LZA configuration source for reading.
 *
 * When the configuration is stored in CodeCommit, individual files are read on
 * demand via the CodeCommit API. When it is stored in S3 (`s3`), the
 * configuration zip is downloaded once from the config bucket and extracted to a
 * local temp directory so subsequent reads happen from disk. When it is stored
 * in an external repository accessed via `codeconnection`, the configuration is
 * delivered to the pipeline artifact bucket; its location is resolved from the
 * pipeline's last successful execution and the zip is downloaded and extracted
 * the same way. This mirrors the approach used by the get-accelerator-metadata
 * custom resource and fixes the `RepositoryDoesNotExistException` seen on
 * deployments where no CodeCommit repository exists.
 *
 * @param options config source options
 * @returns {@link ConfigSourceType}
 */
export async function prepareLzaConfigSource(options: {
  homeRegion: string;
  configRepositoryLocation: string;
  repositoryName: string;
  configBucketName?: string;
  pipelineName?: string;
}): Promise<ConfigSourceType> {
  const configSource: ConfigSourceType = { ...options };

  if (options.configRepositoryLocation === 's3') {
    if (!options.configBucketName) {
      throw new Error('CONFIG_BUCKET_NAME environment variable is required when config repository location is "s3"');
    }
    configSource.localConfigDirPath = await downloadAndExtractS3Config(
      options.homeRegion,
      options.configBucketName,
      S3_CONFIG_OBJECT_KEY,
    );
  } else if (options.configRepositoryLocation === 'codeconnection') {
    if (!options.pipelineName) {
      throw new Error('pipelineName is required when config repository location is "codeconnection"');
    }
    try {
      const { bucket, key } = await getCodeConnectionConfigLocation(options.homeRegion, options.pipelineName);
      configSource.localConfigDirPath = await downloadAndExtractS3Config(options.homeRegion, bucket, key);
    } catch (error) {
      console.warn(
        `Unable to resolve codeconnection configuration for pipeline "${options.pipelineName}"; ` +
          `continuing without configuration files. Reason: ${error}`,
      );
      configSource.configUnavailableReason =
        'Configuration could not be read from the CodeConnection source. The LZA pipeline may not have a ' +
        'successful execution yet, or its configuration artifact was unavailable. See the diagnostics ' +
        'Lambda CloudWatch logs for details.';
    }
  }

  return configSource;
}

/**
 * Resolves the S3 location of the LZA configuration for `codeconnection`
 * deployments. The configuration is delivered to the pipeline artifact bucket
 * rather than the config bucket, so the bucket and key are read from the `Config`
 * input artifact of the pipeline's last successful execution. Mirrors the
 * get-accelerator-metadata custom resource.
 * @param homeRegion home region
 * @param pipelineName LZA pipeline name
 * @returns the artifact bucket name and object key of the configuration zip
 */
async function getCodeConnectionConfigLocation(
  homeRegion: string,
  pipelineName: string,
): Promise<{ bucket: string; key: string }> {
  const codePipelineClient = new CodePipelineClient({ region: homeRegion });

  // Find the most recent successful execution. ListPipelineExecutions returns
  // executions newest-first; paginate manually with backoff (rather than the SDK
  // paginator) so throttling is handled consistently with the rest of this file.
  let lastSuccessfulExecution: PipelineExecutionSummary | undefined;
  let executionsNextToken: string | undefined = undefined;
  do {
    const page = await throttlingBackOff(() =>
      codePipelineClient.send(new ListPipelineExecutionsCommand({ pipelineName, nextToken: executionsNextToken })),
    );
    lastSuccessfulExecution = (page.pipelineExecutionSummaries ?? []).find(
      execution => execution.status === 'Succeeded',
    );
    executionsNextToken = page.nextToken;
  } while (!lastSuccessfulExecution && executionsNextToken);

  if (!lastSuccessfulExecution?.pipelineExecutionId) {
    throw new Error(`No successful execution found for pipeline ${pipelineName}`);
  }

  // Locate the `Config` input artifact, paginating action executions with backoff
  // so the artifact is still found on pipelines whose actions span multiple pages.
  let configArtifact: ArtifactDetail | undefined;
  let actionsNextToken: string | undefined = undefined;
  do {
    const actionExecutions = await throttlingBackOff(() =>
      codePipelineClient.send(
        new ListActionExecutionsCommand({
          pipelineName,
          filter: { pipelineExecutionId: lastSuccessfulExecution!.pipelineExecutionId },
          nextToken: actionsNextToken,
        }),
      ),
    );
    configArtifact = (actionExecutions.actionExecutionDetails ?? [])
      .flatMap(detail => detail.input?.inputArtifacts ?? [])
      .find(artifact => artifact.name === 'Config');
    actionsNextToken = actionExecutions.nextToken;
  } while (!configArtifact && actionsNextToken);

  if (!configArtifact?.s3location?.bucket || !configArtifact.s3location.key) {
    throw new Error(`Config artifact S3 location not found for pipeline ${pipelineName}`);
  }

  return { bucket: configArtifact.s3location.bucket, key: configArtifact.s3location.key };
}

/**
 * Downloads a configuration zip from S3 and extracts it to a local directory.
 * @param homeRegion home region
 * @param bucketName bucket holding the configuration zip
 * @param objectKey object key of the configuration zip
 * @returns local directory path the configuration files were extracted to
 */
async function downloadAndExtractS3Config(homeRegion: string, bucketName: string, objectKey: string): Promise<string> {
  const s3Client = new S3Client({ region: homeRegion });
  const response = await throttlingBackOff(() =>
    s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: objectKey })),
  );

  if (!response.Body) {
    throw new Error(`Unable to download configuration from s3://${bucketName}/${objectKey}`);
  }

  const zipFileName = objectKey.split('/').pop();
  if (!zipFileName) {
    throw new Error(`Invalid S3 object key: ${objectKey}`);
  }
  const tempZipPath = path.join('/tmp', zipFileName);
  await fs.promises.writeFile(tempZipPath, await response.Body.transformToByteArray());

  if (fs.existsSync(S3_CONFIG_EXTRACT_DIR)) {
    fs.rmSync(S3_CONFIG_EXTRACT_DIR, { recursive: true });
  }
  fs.mkdirSync(S3_CONFIG_EXTRACT_DIR, { recursive: true });

  try {
    const admZip = new AdmZip(tempZipPath);
    admZip.extractAllTo(S3_CONFIG_EXTRACT_DIR, true);
  } finally {
    if (fs.existsSync(tempZipPath)) {
      fs.rmSync(tempZipPath, { force: true });
    }
  }

  return S3_CONFIG_EXTRACT_DIR;
}

/**
 * Reads a single configuration file from the prepared configuration source.
 * @param configSource {@link ConfigSourceType}
 * @param fileName configuration file name, e.g. `global-config.yaml`
 * @returns file content as a string, or `undefined` when the file does not exist
 */
async function getConfigFileContent(configSource: ConfigSourceType, fileName: string): Promise<string | undefined> {
  if (configSource.configRepositoryLocation === 'codecommit') {
    const codeCommitClient = new CodeCommitClient({ region: configSource.homeRegion });
    const response = await throttlingBackOff(() =>
      codeCommitClient.send(
        new GetFileCommand({
          repositoryName: configSource.repositoryName,
          filePath: fileName,
        }),
      ),
    );

    return response.fileContent ? new TextDecoder().decode(response.fileContent) : undefined;
  }

  if (!configSource.localConfigDirPath) {
    // No local configuration was prepared.
    // Treat every file as absent so the report degrades gracefully.
    return undefined;
  }

  const configFilePath = resolveConfigFilePath(configSource.localConfigDirPath, fileName);
  if (!configFilePath) {
    return undefined;
  }

  return fs.readFileSync(configFilePath, 'utf8');
}

/**
 * Resolves the on-disk path of a configuration file within an extracted config
 * directory. Checks the directory root first (the expected layout), then falls
 * back to a breadth-first search so configuration archives that nest the YAML
 * files under a subdirectory are still read rather than silently skipped (which
 * would otherwise produce an empty report with no error).
 * @param rootDir extracted configuration directory
 * @param fileName configuration file name, e.g. `global-config.yaml`
 * @returns absolute path to the shallowest matching file, or `undefined` when not present
 */
function resolveConfigFilePath(rootDir: string, fileName: string): string | undefined {
  const rootCandidate = path.join(rootDir, fileName);
  if (fs.existsSync(rootCandidate)) {
    return rootCandidate;
  }

  // Breadth-first search returns the shallowest match, avoiding accidental
  // matches deeper in the tree when a root-level file is absent.
  const queue: string[] = [rootDir];
  while (queue.length > 0) {
    const dir = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
      } else if (entry.isFile() && entry.name === fileName) {
        return entryPath;
      }
    }
  }

  return undefined;
}

export async function getLzaGlobalConfigMetadata(configSource: ConfigSourceType): Promise<LzaGlobalConfigType> {
  const enabledRegions: string[] = [];

  const textContent = await getConfigFileContent(configSource, 'global-config.yaml');

  if (textContent) {
    const config = yaml.load(textContent) as LzaGlobalConfigType;
    enabledRegions.push(...config.enabledRegions);
  }

  return {
    enabledRegions: enabledRegions,
    homeRegion: configSource.homeRegion,
  };
}

export async function getEnabledAccounts(
  configSource: ConfigSourceType,
  accountDetails: AccountDetailsType[],
): Promise<DiagnosticAccountsConfigType[]> {
  const diagnosticsAccountList: DiagnosticAccountsConfigType[] = [];

  const textContent = await getConfigFileContent(configSource, 'accounts-config.yaml');

  if (textContent) {
    const config = yaml.load(textContent) as LzaAccountsConfigType;
    for (const account of [...config.mandatoryAccounts, ...config.workloadAccounts]) {
      const accountId = getAccountId(account.email, accountDetails);
      diagnosticsAccountList.push({
        name: account.name,
        organizationalUnit: account.organizationalUnit,
        id: accountId,
      });
    }
  }
  return diagnosticsAccountList;
}

/**
 * Function to get stack status
 * @param homeRegion
 * @param stackName
 * @returns
 */
export async function getStackStatus(
  homeRegion: string,
  stackName: string,
): Promise<{ status: string; message: string }> {
  const cfnClient = new CloudFormationClient({ region: homeRegion });
  const response = await throttlingBackOff(() => cfnClient.send(new DescribeStacksCommand({ StackName: stackName })));
  if (response.Stacks![0].StackStatus!.includes('FAILED')) {
    return { status: 'Failed', message: response.Stacks![0].StackStatus! };
  }
  return { status: 'Success', message: response.Stacks![0].StackStatus! };
}

export async function getPipelineStatus(
  prefix: string,
  partition: string,
  homeRegion: string,
  pipelineName: string,
  organizationAccountDetails: AccountDetailsType[],
  lzaEnabledAccounts: DiagnosticAccountsConfigType[],
  lzaGlobalConfigMetadata: LzaGlobalConfigType,
  isInstaller: boolean,
  daysSincePipelineFailed: number,
): Promise<{ pipelineStatus: PipelineStatusType; cfnStatuses: string[] }> {
  const pipelineClient = new CodePipelineClient({ region: homeRegion });
  const response = await throttlingBackOff(() =>
    pipelineClient.send(new GetPipelineStateCommand({ name: pipelineName })),
  );

  const responseData: PipelineDetailStatusType[] = [];
  const cfnStatuses: string[] = [];
  let failCounter = 0;
  let pipelineStatus = 'Succeeded';

  for (const stage of response.stageStates ?? []) {
    pipelineStatus = stage.latestExecution!.status!;
    if (stage.latestExecution?.status === 'InProgress') {
      return { pipelineStatus: { status: stage.latestExecution?.status, detailStatus: [] }, cfnStatuses: [] };
    }
    if (stage.latestExecution?.status == 'Failed') {
      failCounter += 1;
      for (const actionState of stage.actionStates ?? []) {
        if (actionState.latestExecution?.status == 'Failed') {
          const maskedBuildErrorMessages = await getFailedBuildLogs(
            partition,
            homeRegion,
            prefix,
            isInstaller,
            daysSincePipelineFailed,
            organizationAccountDetails,
            lzaGlobalConfigMetadata,
            lzaEnabledAccounts,
            actionState.latestExecution,
            cfnStatuses,
            actionState.latestExecution.externalExecutionId,
          );

          responseData.push({
            stageName: stage.stageName!,
            stageLastExecutionStatus: stage.latestExecution?.status,
            actionName: actionState.actionName!,
            actionLastExecutionTime: actionState.latestExecution.lastStatusChange ?? 'NotFound',
            actionLastExecutionStatus: actionState.latestExecution.status ?? 'NotFound',
            buildErrorMessages: maskedBuildErrorMessages,
          });
        }
      }
    }
  }

  if (failCounter > 0) {
    return { pipelineStatus: { status: undefined, detailStatus: responseData }, cfnStatuses: cfnStatuses };
  } else {
    return { pipelineStatus: { status: pipelineStatus, detailStatus: [] }, cfnStatuses: cfnStatuses };
  }
}

async function getFailedCloudFormationStackDetails(
  partition: string,
  isInstaller: boolean,
  prefix: string,
  daysSincePipelineFailed: number,
  buildErrorMessages: string,
  organizationAccountDetails: AccountDetailsType[],
  lzaGlobalConfigMetadata: LzaGlobalConfigType,
  lzaEnabledAccounts: DiagnosticAccountsConfigType[],
  cfnStatuses: string[],
): Promise<void> {
  if (!isInstaller) {
    const lzaStackEnvironments = getAllLzaStackEnvironments(prefix, lzaEnabledAccounts, lzaGlobalConfigMetadata);

    for (const lzaStackEnvironment of lzaStackEnvironments) {
      if (buildErrorMessages.includes(lzaStackEnvironment.name)) {
        cfnStatuses.push(
          await getFailedStackDetails(
            prefix,
            partition,
            lzaStackEnvironment,
            organizationAccountDetails,
            daysSincePipelineFailed,
          ),
        );
      }
    }
  }
}

async function getFailedBuildLogs(
  partition: string,
  homeRegion: string,
  prefix: string,
  isInstaller: boolean,
  daysSincePipelineFailed: number,
  organizationAccountDetails: AccountDetailsType[],
  lzaGlobalConfigMetadata: LzaGlobalConfigType,
  lzaEnabledAccounts: DiagnosticAccountsConfigType[],
  latestExecution: ActionExecution,
  cfnStatuses: string[],
  externalExecutionId?: string,
): Promise<string> {
  let maskedBuildErrorMessages = 'Build error log not found';
  if (externalExecutionId) {
    const logGroupName = `/aws/codebuild/${externalExecutionId.split(':')[0]}`;
    const logStreamName = externalExecutionId.split(':')[1];
    const cwlClient = new CloudWatchLogsClient({ region: homeRegion });
    const buildErrorMessages = await getBuildLogErrors(cwlClient, logGroupName, logStreamName);
    maskedBuildErrorMessages = maskAccountIdAndEmails(buildErrorMessages, organizationAccountDetails);

    await getFailedCloudFormationStackDetails(
      partition,
      isInstaller,
      prefix,
      daysSincePipelineFailed,
      buildErrorMessages,
      organizationAccountDetails,
      lzaGlobalConfigMetadata,
      lzaEnabledAccounts,
      cfnStatuses,
    );
  } else {
    maskedBuildErrorMessages = maskAccountIdAndEmails(
      latestExecution.errorDetails!.message!,
      organizationAccountDetails,
    );
  }

  return maskedBuildErrorMessages;
}

function getAllLzaStackEnvironments(
  prefix: string,
  lzaEnabledAccounts: DiagnosticAccountsConfigType[],
  lzaGlobalConfigMetadata: LzaGlobalConfigType,
): LzaStackEnvironmentType[] {
  const lzaPipelineActionNames: string[] = [
    'Finalize',
    'Customizations',
    'Network_Associations',
    'Security_Resources',
    'Network_VPCs',
    'Operations',
    'Security',
    'Network_Prepare',
    'SecurityAudit',
    'Organizations',
    'Logging',
    'Key',
    'Accounts',
    'Prepare',
    'Bootstrap',
  ];
  const stackEnvironments: LzaStackEnvironmentType[] = [];
  for (const lzaPipelineActionName of lzaPipelineActionNames) {
    for (const lzaEnabledAccount of lzaEnabledAccounts) {
      for (const enabledRegion of lzaGlobalConfigMetadata.enabledRegions) {
        const stackNames = getStackNames(lzaPipelineActionName, prefix, lzaEnabledAccount.id, enabledRegion);
        for (const stackName of stackNames) {
          stackEnvironments.push({ name: stackName, region: enabledRegion, accountId: lzaEnabledAccount.id });
        }
      }
    }
  }
  return stackEnvironments;
}

async function getFailedStackDetails(
  prefix: string,
  partition: string,
  failedStackEnvironment: LzaStackEnvironmentType,
  organizationAccountDetails: AccountDetailsType[],
  daysSincePipelineFailed: number,
): Promise<string> {
  const workLoadAccountCredentials = await getWorkLoadAccountCredentials(
    prefix,
    partition,
    failedStackEnvironment.region,
    failedStackEnvironment.accountId,
  );
  const cfnDetailsHtmlStart = '<html><head><style>table, th, td {border: 1px solid orange; } </style></head><body>';
  const cfnDetailsHtmlTableStart =
    '<center><font color="orange" size="12"><b>CloudFormation Stack Failures</b></font><table border="2"><tr><th>StackName</th><th>Account</th><th>DateTime</th><th>ErrorMessage</th></tr>';
  const cfnDetailsHtmlEnd = '</table></body></html>';

  let cfnDetailsHtmlMessage = cfnDetailsHtmlStart + cfnDetailsHtmlTableStart;
  const cfnClient = new CloudFormationClient({
    region: failedStackEnvironment.region,
    credentials: workLoadAccountCredentials,
  });
  let nextToken: string | undefined = undefined;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - daysSincePipelineFailed);
  do {
    const page = await throttlingBackOff(() =>
      cfnClient.send(
        new DescribeStackEventsCommand({
          StackName: failedStackEnvironment.name,
          NextToken: nextToken,
        }),
      ),
    );
    for (const stackEvent of page.StackEvents ?? []) {
      const eventDate = stackEvent.Timestamp!;

      if (stackEvent.ResourceStatus!.includes('FAILED') && stackEvent.ResourceStatusReason && eventDate >= startDate) {
        cfnDetailsHtmlMessage +=
          '<tr><td>' +
          maskAccountIdAndEmails(failedStackEnvironment.name, organizationAccountDetails) +
          '</td><td>' +
          maskAccountIdAndEmails(failedStackEnvironment.accountId, organizationAccountDetails) +
          '</td><td>' +
          stackEvent.Timestamp +
          '</td><td>' +
          maskAccountIdAndEmails(stackEvent.ResourceStatusReason, organizationAccountDetails) +
          '</td></tr>';
      }
    }
    nextToken = page.NextToken;
  } while (nextToken);

  cfnDetailsHtmlMessage += cfnDetailsHtmlEnd;

  return cfnDetailsHtmlMessage;
}

function maskConfigContent(fileName: string, textContent: string, accountDetails: AccountDetailsType[]): string {
  let maskedContent = `##=============Masked LZA Config File ${fileName} =============`;
  for (const originalLine of textContent.split('\n')) {
    let maskedLine = originalLine;

    for (const accountDetail of accountDetails) {
      if (originalLine.includes(accountDetail.accountEmail)) {
        maskedLine = originalLine.replace(accountDetail.accountEmail, `${accountDetail.accountName}-account@email.com`);
      }
      if (originalLine.includes(accountDetail.accountId)) {
        maskedLine = originalLine.replace(
          accountDetail.accountEmail,
          `[${accountDetail.accountName.toUpperCase()}-ACCOUNT-ID]`,
        );
      }
    }
    maskedContent = maskedContent + '\n' + maskedLine;
  }

  return maskedContent;
}

export async function getLzaConfigFiles(
  configSource: ConfigSourceType,
  accountDetails: AccountDetailsType[],
  tempConfigDirPath: string,
): Promise<void> {
  const requiredConfigFileNames: string[] = [
    'accounts-config.yaml',
    'customizations-config.yaml',
    'global-config.yaml',
    'iam-config.yaml',
    'network-config.yaml',
    'organization-config.yaml',
    'replacements-config.yaml',
    'security-config.yaml',
  ];

  for (const requiredConfigFileName of requiredConfigFileNames) {
    try {
      const textContent = await getConfigFileContent(configSource, requiredConfigFileName);

      if (textContent) {
        const configFilePath = path.join(tempConfigDirPath, requiredConfigFileName);
        const maskedContent = maskConfigContent(requiredConfigFileName, textContent, accountDetails);
        fs.writeFileSync(configFilePath, maskedContent, 'utf8');
      } else {
        console.warn(`Config file ${requiredConfigFileName} not found !!!!`);
      }
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: any
    ) {
      if (error.name === 'FileDoesNotExistException') {
        console.warn(`Config file ${requiredConfigFileName} not found !!!!`);
      } else {
        console.warn(`Error reading config file ${requiredConfigFileName}, skipping: ${error}`);
      }
    }
  }
}

export async function uploadReports(
  acceleratorPrefix: string,
  region: string,
  reportData: string,
  bucketName: string,
  tempConfigDirPath: string,
  lzaFailed: boolean,
) {
  try {
    const summaryReportName = 'diagnostic-report.html';

    const s3Client = new S3Client({ region: region });
    const now = new Date();
    const destinationPrefix =
      `${acceleratorPrefix}-Diagnostics-Pack/` +
      now.getMonth() +
      '-' +
      now.getDate() +
      '-' +
      now.getFullYear() +
      ' ' +
      now.getHours() +
      ':' +
      now.getMinutes();

    if (lzaFailed) {
      const files = fs.readdirSync(tempConfigDirPath);
      for (const file of files) {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Body: fs.readFileSync(`${tempConfigDirPath}/${file}`),
            Key: `${destinationPrefix}/lza-config/${file}`,
          }),
        );
      }
    }

    fs.writeFileSync(path.join(tempConfigDirPath, summaryReportName), reportData, 'utf8');

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Body: fs.readFileSync(path.join(tempConfigDirPath, summaryReportName)),
        Key: `${destinationPrefix}/${summaryReportName}`,
      }),
    );
  } catch (e) {
    console.log(JSON.stringify(e));
    throw e;
  }
}

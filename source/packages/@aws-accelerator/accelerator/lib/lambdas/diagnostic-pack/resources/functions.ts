import { AssumeRoleCommand, STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import {
  CloudFormationClient,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
} from '@aws-sdk/client-cloudformation';
import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import { CodeCommitClient, GetFileCommand } from '@aws-sdk/client-codecommit';
import { ActionExecution, CodePipelineClient, GetPipelineStateCommand } from '@aws-sdk/client-codepipeline';
import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

import {
  AccountDetailsType,
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

export async function getLzaGlobalConfigMetadata(
  homeRegion: string,
  repositoryName: string,
): Promise<LzaGlobalConfigType> {
  const enabledRegions: string[] = [];

  const codeCommitClient = new CodeCommitClient({ region: homeRegion });

  const response = await throttlingBackOff(() =>
    codeCommitClient.send(
      new GetFileCommand({
        repositoryName: repositoryName,
        filePath: 'global-config.yaml',
      }),
    ),
  );

  if (response.fileContent) {
    const textContent = new TextDecoder().decode(response.fileContent);
    const config = yaml.load(textContent) as LzaGlobalConfigType;
    enabledRegions.push(...config.enabledRegions);
  }

  return {
    enabledRegions: enabledRegions,
    homeRegion: homeRegion,
  };
}

export async function getEnabledAccounts(
  homeRegion: string,
  repositoryName: string,
  accountDetails: AccountDetailsType[],
): Promise<DiagnosticAccountsConfigType[]> {
  const codeCommitClient = new CodeCommitClient({ region: homeRegion });
  const diagnosticsAccountList: DiagnosticAccountsConfigType[] = [];

  const response = await throttlingBackOff(() =>
    codeCommitClient.send(
      new GetFileCommand({
        repositoryName: repositoryName,
        filePath: 'accounts-config.yaml',
      }),
    ),
  );

  if (response.fileContent) {
    const textContent = new TextDecoder().decode(response.fileContent);
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
  homeRegion: string,
  accountDetails: AccountDetailsType[],
  repositoryName: string,
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

  const codeCommitClient = new CodeCommitClient({ region: homeRegion });

  for (const requiredConfigFileName of requiredConfigFileNames) {
    try {
      const response = await codeCommitClient.send(
        new GetFileCommand({
          repositoryName: repositoryName,
          filePath: requiredConfigFileName,
        }),
      );

      if (response.fileContent) {
        const configFilePath = path.join(tempConfigDirPath, requiredConfigFileName);
        const textContent = new TextDecoder().decode(response.fileContent);
        const maskedContent = maskConfigContent(requiredConfigFileName, textContent, accountDetails);
        fs.writeFileSync(configFilePath, maskedContent, 'utf8');
      }
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error: any
    ) {
      if (error.name === 'FileDoesNotExistException') {
        console.warn(`Config file ${requiredConfigFileName} not found !!!!`);
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

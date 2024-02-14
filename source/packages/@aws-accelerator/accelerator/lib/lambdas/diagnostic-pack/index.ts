import {
  getInstallerStackMetadata,
  getOrgAccountDetails,
  getLzaGlobalConfigMetadata,
  getEnabledAccounts,
  getStackStatus,
  getPipelineStatus,
  getLzaConfigFiles,
  formatTableCellValue,
  uploadReports,
} from './resources/functions';
import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handler(event: any): Promise<void> {
  console.log(event);

  let lzaPipelineDetailHtmlMessage: string | undefined;
  let installerPipelineDetailHtmlMessage: string | undefined;
  const htmlStart = '<html><head><style>table, th, td {border: 1px solid orange; } </style></head><body>';
  const htmlTableStart =
    '<center><font color="orange" size="12"><b>Landing Zone Accelerator on AWS Diagnostics Report</b></font><table border="2"><tr><th>Resource</th><th>Status</th></tr>';
  const htmlEnd = '</table></body></html>';

  let htmlBodyMessage = htmlStart + htmlTableStart;

  //
  // Set variables
  //
  const installerStackName = process.env['INSTALLER_STACK_NAME'] ?? 'AWSAccelerator-InstallerStack';
  const homeRegion = process.env['HOME_REGION'] ?? 'us-east-1';
  const pipelineAccountId = process.env['PIPELINE_ACCOUNT_ID'] ?? '111111111111';
  const partition = process.env['PARTITION'] ?? 'aws';
  const reportBucketName = process.env['REPORT_BUCKET_NAME'] ?? 'lza-diagnostics-report';
  const daysSincePipelineFailed = process.env['DAYS_SINCE_FAILURE'] ?? '3';
  const managementAccountRoleName = process.env['MANAGEMENT_ACCOUNT_ROLE_NAME'];
  const configRepoName = process.env['CONFIG_REPO_NAME'] ?? 'aws-accelerator-config';

  // Get installer metadata
  const installerStackMetadata = await getInstallerStackMetadata(homeRegion, installerStackName);

  // Set resource names
  let pipelineStackName = `${installerStackMetadata.prefix}-PipelineStack-${pipelineAccountId}-${homeRegion}`;
  let installerPipelineName = `${installerStackMetadata.prefix}-Installer`;
  let lzaPipelineName = `${installerStackMetadata.prefix}-Pipeline`;

  if (installerStackMetadata.qualifier) {
    pipelineStackName = `${installerStackMetadata.qualifier}-pipeline-stack-${pipelineAccountId}-${homeRegion}`;
    installerPipelineName = `${installerStackMetadata.qualifier}-installer`;
    lzaPipelineName = `${installerStackMetadata.qualifier}-pipeline`;
  }

  //
  // Get Organization account details
  //
  const accountDetails = await getOrgAccountDetails(
    homeRegion,
    partition,
    pipelineAccountId,
    installerStackMetadata,
    managementAccountRoleName,
  );

  //
  // Get LZA Global config metadata
  //
  const lzaGlobalConfigMetadata = await getLzaGlobalConfigMetadata(homeRegion, configRepoName);

  //
  // Get LZA enabled account details
  const lzaEnabledAccounts = await getEnabledAccounts(homeRegion, configRepoName, accountDetails);

  //
  // Get Installer Stack Status
  //
  const installerStackStatus = await getStackStatus(homeRegion, installerStackName);

  //
  // Get Pipeline Stack Status
  //
  const pipelineStackStatus = await getStackStatus(homeRegion, pipelineStackName);

  //
  // Get Installer Pipeline Status
  //
  const installerPipelineStatuses = await getPipelineStatus(
    installerStackMetadata.prefix,
    partition,
    homeRegion,
    installerPipelineName,
    accountDetails,
    lzaEnabledAccounts,
    lzaGlobalConfigMetadata,
    true,
    Number(daysSincePipelineFailed),
  );

  //
  // Get LZA Pipeline Status
  //
  const lzaPipelineStatuses = await getPipelineStatus(
    installerStackMetadata.prefix,
    partition,
    homeRegion,
    lzaPipelineName,
    accountDetails,
    lzaEnabledAccounts,
    lzaGlobalConfigMetadata,
    false,
    Number(daysSincePipelineFailed),
  );

  //
  // Print LZA External/Internal Deployment
  //
  const externalDeploymentStatus = installerStackMetadata.isExternal ? 'Yes' : 'No';
  htmlBodyMessage = htmlBodyMessage + '<tr><td>External Deployment</td><td>' + externalDeploymentStatus + '</td></tr>';

  //
  // Print LZA Version
  //
  htmlBodyMessage = htmlBodyMessage + '<tr><td>Version</td><td>' + installerStackMetadata.lzaVersion + '</td></tr>';

  //
  // Print home region
  //
  htmlBodyMessage = htmlBodyMessage + '<tr><td>Home region</td><td>' + homeRegion + '</td></tr>';

  //
  // Print enabled regions
  //
  let regionString = '<ul>';
  for (const enableRegion of lzaGlobalConfigMetadata.enabledRegions) {
    regionString += '<li>' + enableRegion + '</li>';
  }
  regionString += '</ul>';
  htmlBodyMessage = htmlBodyMessage + '<tr><td>Enabled regions</td><td>' + regionString + '</td></tr>';

  //
  // Print Installer Stack Status
  //
  htmlBodyMessage =
    htmlBodyMessage + '<tr><td>Installer Stack</td>' + formatTableCellValue(installerStackStatus.message) + '</tr>';

  //
  // Print Pipeline Stack Status
  //
  htmlBodyMessage =
    htmlBodyMessage + '<tr><td>Pipeline Stack</td>' + formatTableCellValue(pipelineStackStatus.message) + '</tr>';

  //
  // Print Installer Pipeline Status
  //
  if (installerPipelineStatuses.pipelineStatus.detailStatus.length > 0) {
    htmlBodyMessage = htmlBodyMessage + '<tr><td>Installer Pipeline</td>' + formatTableCellValue('Failed') + '</tr>';

    //
    // Get Failed Stage and action details
    //
    const installerPipelineDetailsHtmlStart =
      '<html><head><style>table, th, td {border: 1px solid orange; } </style></head><body>';
    const installerPipelineDetailsHtmlTableStart =
      '<center><font color="orange" size="12"><b>Installer Pipeline Status</b></font><table border="2"><tr><th>StageName</th><th>Status</th><th>ActionName</th><th>ActionLastStatusChanged</th><th>ActionStatus</th><th>BuildErrorMessages</th></tr>';
    const installerPipelineDetailsHtmlEnd = '</table></body></html>';
    installerPipelineDetailHtmlMessage = installerPipelineDetailsHtmlStart + installerPipelineDetailsHtmlTableStart;
    for (const installerPipelineStatus of installerPipelineStatuses.pipelineStatus.detailStatus) {
      installerPipelineDetailHtmlMessage +=
        '<tr><td>' +
        installerPipelineStatus.stageName +
        '</td><td>' +
        installerPipelineStatus.stageLastExecutionStatus +
        '</td><td>' +
        installerPipelineStatus.actionName +
        '</td><td>' +
        installerPipelineStatus.actionLastExecutionTime +
        '</td><td>' +
        installerPipelineStatus.actionLastExecutionStatus +
        '</td><td>' +
        installerPipelineStatus.buildErrorMessages;
    }
    installerPipelineDetailHtmlMessage = installerPipelineDetailHtmlMessage + installerPipelineDetailsHtmlEnd;
  } else {
    htmlBodyMessage =
      htmlBodyMessage +
      '<tr><td>Installer Pipeline</td>' +
      formatTableCellValue(installerPipelineStatuses.pipelineStatus.status!) +
      '</tr>';
  }

  //
  // Print LZA Pipeline Status
  //
  if (lzaPipelineStatuses.pipelineStatus.detailStatus.length > 0) {
    htmlBodyMessage = htmlBodyMessage + '<tr><td>LZA Pipeline</td>' + formatTableCellValue('Failed') + '</tr>';

    //
    // Get Failed Stage and action details
    //
    const lzaPipelineDetailsHtmlStart =
      '<html><head><style>table, th, td {border: 1px solid orange; } </style></head><body>';
    const lzaPipelineDetailsHtmlTableStart =
      '<center><font color="orange" size="12"><b>LZA Pipeline Status</b></font><table border="2"><tr><th>StageName</th><th>Status</th><th>ActionName</th><th>ActionLastStatusChanged</th><th>ActionStatus</th><th>BuildErrorMessages</th></tr>';
    const lzaPipelineDetailsHtmlEnd = '</table></body></html>';

    lzaPipelineDetailHtmlMessage = lzaPipelineDetailsHtmlStart + lzaPipelineDetailsHtmlTableStart;

    for (const lzaPipelineStatus of lzaPipelineStatuses.pipelineStatus.detailStatus) {
      lzaPipelineDetailHtmlMessage +=
        '<tr><td>' +
        lzaPipelineStatus.stageName +
        '</td><td>' +
        lzaPipelineStatus.stageLastExecutionStatus +
        '</td><td>' +
        lzaPipelineStatus.actionName +
        '</td><td>' +
        lzaPipelineStatus.actionLastExecutionTime +
        '</td><td>' +
        lzaPipelineStatus.actionLastExecutionStatus +
        '</td><td>' +
        lzaPipelineStatus.buildErrorMessages;
    }
    lzaPipelineDetailHtmlMessage = lzaPipelineDetailHtmlMessage + lzaPipelineDetailsHtmlEnd;
  } else {
    htmlBodyMessage =
      htmlBodyMessage +
      '<tr><td>LZA Pipeline</td>' +
      formatTableCellValue(lzaPipelineStatuses.pipelineStatus.status!) +
      '</tr>';
  }

  // Complete the Html
  //
  htmlBodyMessage = htmlBodyMessage + htmlEnd;

  if (installerPipelineDetailHtmlMessage) {
    htmlBodyMessage = htmlBodyMessage + '\n' + installerPipelineDetailHtmlMessage;
  }

  if (lzaPipelineDetailHtmlMessage) {
    htmlBodyMessage = htmlBodyMessage + '\n' + lzaPipelineDetailHtmlMessage;
  }

  //
  // Display CFN failure stack details
  for (const cfnStatus of lzaPipelineStatuses.cfnStatuses) {
    htmlBodyMessage = htmlBodyMessage + '\n' + cfnStatus;
  }

  //
  // set LZA status
  //
  let lzaFailed = false;
  if (
    lzaPipelineStatuses.pipelineStatus.status === 'Failed' &&
    installerPipelineStatuses.pipelineStatus.status === 'Failed' &&
    !installerStackStatus.message.includes('FAIL') &&
    !pipelineStackStatus.message.includes('FAIL')
  ) {
    lzaFailed = true;
  }

  //
  // Create temp directory
  //
  const tempConfigDirPath = '/tmp/accel-config';
  if (fs.existsSync(tempConfigDirPath)) {
    fs.rmdirSync(tempConfigDirPath, { recursive: true });
  }
  fs.mkdirSync(tempConfigDirPath);

  //
  // Get LZA config files only when config is failed
  //
  if (lzaFailed) {
    await getLzaConfigFiles(homeRegion, accountDetails, configRepoName, tempConfigDirPath);
  }

  //
  // Upload files to S3
  //
  await uploadReports(
    installerStackMetadata.prefix,
    homeRegion,
    htmlBodyMessage,
    reportBucketName,
    tempConfigDirPath,
    lzaFailed,
  );
}

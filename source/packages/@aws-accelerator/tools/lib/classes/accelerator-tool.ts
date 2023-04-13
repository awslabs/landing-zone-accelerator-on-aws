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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as winston from 'winston';

import { GlobalConfig, SecurityConfig } from '@aws-accelerator/config';
import { createLogger, throttlingBackOff } from '@aws-accelerator/utils';
import { BackupClient, DeleteBackupVaultCommand } from '@aws-sdk/client-backup';
import {
  CloudFormationClient,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStackResourcesCommand,
  Stack,
  StackStatus,
  UpdateTerminationProtectionCommand,
} from '@aws-sdk/client-cloudformation';
import { CloudWatchLogsClient, DeleteLogGroupCommand, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import {
  BatchDeleteBuildsCommand,
  BatchGetProjectsCommand,
  CodeBuildClient,
  ListBuildsForProjectCommand,
} from '@aws-sdk/client-codebuild';
import { CodeCommitClient, DeleteRepositoryCommand, GetFileCommand } from '@aws-sdk/client-codecommit';
import { CodePipelineClient, GetPipelineCommand, StageDeclaration } from '@aws-sdk/client-codepipeline';
import { DeleteRepositoryCommand as DeleteEcr, DescribeRepositoriesCommand, ECRClient } from '@aws-sdk/client-ecr';
import { DetachRolePolicyCommand, IAMClient, ListAttachedRolePoliciesCommand } from '@aws-sdk/client-iam';
import {
  DescribeKeyCommand,
  DisableKeyCommand,
  KeyState,
  KMSClient,
  ScheduleKeyDeletionCommand,
} from '@aws-sdk/client-kms';
import { ListAccountsCommand, OrganizationsClient } from '@aws-sdk/client-organizations';
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  ListObjectVersionsCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  AssumeRoleCommand,
  AssumeRoleCommandOutput,
  Credentials,
  GetCallerIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts';

/**
 * Type for pipeline stage action information with order and action name
 */
type stageActionType = { order: number; name: string; stackPrefix: string };

/**
 * Pipeline Stack Type
 */
type pipelineStackType = {
  stageOrder: number;
  order: number;
  stackName: string;
};

type deleteStacksType = {
  clients: {
    cloudFormation: CloudFormationClient;
    cloudWatchLogs: CloudWatchLogsClient;
    s3: S3Client;
    backup: BackupClient;
    iam: IAMClient;
    kms: KMSClient;
  };
  stackName: string;
  accountID: string;
  region: string;
};

/**
 * Pipeline Management Account Type, with account ID, role name to assume and sts credential
 */
type ManagementAccountType =
  | {
      accountId: string;
      assumeRoleName: string | undefined;
      credentials: Credentials | undefined;
    }
  | undefined;

/**
 * Accelerator AcceleratorToolProps
 */
export interface AcceleratorToolProps {
  readonly installerStackName: string;
  readonly partition: string;
  readonly fullDestroy: boolean;
  readonly deleteAccelerator: boolean;
  readonly keepBootstraps: boolean;
  readonly keepData: boolean;
  readonly keepPipelineAndConfig: boolean;
  readonly stageName: string;
  readonly actionName: string;
  readonly debug: boolean;
  readonly ignoreTerminationProtection: boolean;
}

/**
 * AcceleratorTool Class
 */
export class AcceleratorTool {
  /**
   * Executing Account ID
   * @private
   */
  private executingAccountId: string | undefined;

  /**
   * Pipeline Global Config
   * @private
   */
  private globalConfig: GlobalConfig | undefined;

  /**
   * Pipeline security Config
   * @private
   */
  private securityConfig: SecurityConfig | undefined;

  /**
   * globalRegion
   * @private
   */
  private globalRegion = 'us-east-1';

  /**
   * acceleratorToolProps
   * @private
   */
  private readonly acceleratorToolProps: AcceleratorToolProps;

  /**
   * Pipeline Source Config repository details
   * @private
   */
  private pipelineConfigSourceRepo: { repositoryName: string; branch: string; provider: string } | undefined;

  /**
   * bootstrapBuildEnvironmentVariables
   * @private
   */
  private bootstrapBuildEnvironmentVariables: { name: string; value: string }[] | undefined;

  /**
   * organizationAccounts - for list of accounts in organization
   * @private
   */
  private organizationAccounts: {
    accountName: string;
    accountId: string;
  }[] = [];

  /**
   *
   */
  private deleteStackLists: deleteStacksType[] = [];

  /**
   * pipelineStageActions
   * List Accelerator stacks in delete order
   * Any changes in stacks creation in accelerator needs will need changes of this field
   * @private
   */
  private pipelineStageActions: {
    stage: string;
    order: number;
    actions: stageActionType[];
  }[] = [
    {
      stage: 'Deploy',
      order: 7,
      actions: [
        { order: 7, name: 'Finalize', stackPrefix: '-FinalizeStack' },
        { order: 6, name: 'Customizations', stackPrefix: '-CustomizationsStack' },
        { order: 5, name: 'Network_Associations', stackPrefix: '-NetworkAssociationsStack' },
        { order: 5, name: 'Network_Associations', stackPrefix: '-NetworkAssociationsGwlbStack' },
        { order: 2, name: 'Security_Resources', stackPrefix: '-SecurityResourcesStack' },
        { order: 4, name: 'Network_VPCs', stackPrefix: '-NetworkVpcDnsStack' },
        { order: 3, name: 'Network_VPCs', stackPrefix: '-NetworkVpcEndpointsStack' },
        { order: 2, name: 'Network_VPCs', stackPrefix: '-NetworkVpcStack' },
        { order: 1, name: 'Operations', stackPrefix: '-OperationsStack' },
        { order: 1, name: 'Security', stackPrefix: '-SecurityStack' },
        { order: 1, name: 'Network_Prepare', stackPrefix: '-NetworkPrepStack' },
      ],
    },
    {
      stage: 'SecurityAudit',
      order: 6,
      actions: [{ order: 1, name: 'SecurityAudit', stackPrefix: '-SecurityAuditStack' }],
    },
    {
      stage: 'Organization',
      order: 5,
      actions: [{ order: 1, name: 'Organizations', stackPrefix: '-OrganizationsStack' }],
    },
    {
      stage: 'Logging',
      order: 4,
      actions: [
        { order: 2, name: 'Logging', stackPrefix: '-LoggingStack' },
        { order: 1, name: 'Key', stackPrefix: '-KeyStack' },
        { order: 1, name: 'Key', stackPrefix: '-DependenciesStack' },
      ],
    },
    {
      stage: 'Accounts',
      order: 3,
      actions: [{ order: 1, name: 'Accounts', stackPrefix: '-AccountsStack' }],
    },
    {
      stage: 'Prepare',
      order: 2,
      actions: [{ order: 1, name: 'Prepare', stackPrefix: '-PrepareStack' }],
    },
    {
      stage: 'Bootstrap',
      order: 1,
      actions: [{ order: 1, name: 'Bootstrap', stackPrefix: '-CDKToolkit' }],
    },
  ];

  /**
   * List of pipeline stage names
   */
  private pipelineStageNames: string[] = [];

  /**
   * List of pipeline action names
   */
  private pipelineActionNames: string[] = [];

  /**
   * List of Kms key will be used to delete post stack deletion
   */
  private kmsKeys: { client: KMSClient; stackName: string; key: string }[] = [];

  /**
   * List of backup vaults will be used to delete post stack deletion
   */
  private backupVaults: { client: BackupClient; stackName: string; backup: string }[] = [];

  /**
   * List of log groups will be used to delete post stack deletion
   */
  private logGroups: {
    client: CloudWatchLogsClient;
    stackName: string;
    logGroup: string;
  }[] = [];
  /**
   * List of buckets will be used to delete post stack deletion
   */
  private buckets: { client: S3Client; stackName: string; bucket: string }[] = [];

  /**
   * List of IAM roles will be used to delete post stack deletion
   */
  private iamRoles: { client: IAMClient; stackName: string; roleName: string }[] = [];

  /**
   * pipelineManagementAccount
   * @private
   */
  private pipelineManagementAccount: ManagementAccountType = undefined;

  /**
   * externalPipelineAccount object
   * @private
   */
  private externalPipelineAccount: { isUsed: boolean; accountId: string | undefined } = {
    isUsed: false,
    accountId: undefined,
  };

  /**
   * acceleratorCloudFormationStacks
   * @private
   */
  private acceleratorCloudFormationStacks: pipelineStackType[] = [];

  private acceleratorCodeBuildProjects: string[] = [];

  private logger: winston.Logger;

  constructor(props: AcceleratorToolProps) {
    this.acceleratorToolProps = props;
    this.logger = createLogger(['accelerator-tool']);
  }

  /**
   * Function to uninstall accelerator. It is expected to completely rollback installer.
   * Uninstaller can rollback following resources created by accelerator.
   * <ul>
   * <li>CloudFormation Stacks
   * <li>S3 Buckets
   * <li>Cloudwatch Log Groups
   * <li>Codebuild Projects
   * <li>CodeCommit Repository
   * <li>CodePipeline
   * </ul>
   * @param installerStackName
   * The name of the installer cloudformation stack
   */
  public async uninstallAccelerator(installerStackName: string): Promise<boolean> {
    // Set global region
    this.setGlobalRegion();

    // Get executing account ID
    const response = await throttlingBackOff(() => new STSClient({}).send(new GetCallerIdentityCommand({})));
    this.executingAccountId = response.Account;

    // Get installer pipeline
    const installerPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(installerStackName);
    if (!installerPipeline.status) {
      this.debugLog(`${installerPipeline.pipelineName}`, 'info');
      return false;
    }

    const getPipelineNameResponse = await throttlingBackOff(() =>
      new CodePipelineClient({}).send(new GetPipelineCommand({ name: installerPipeline.pipelineName })),
    );

    const installerCodeBuildProjectName =
      getPipelineNameResponse.pipeline!.stages![1].actions![0].configuration!['ProjectName'];

    const batchGetProjectsCommandResponse = await throttlingBackOff(() =>
      new CodeBuildClient({}).send(new BatchGetProjectsCommand({ names: [installerCodeBuildProjectName] })),
    );

    let isQualifierUsed = false;
    let acceleratorQualifier = 'AWSAccelerator';
    let acceleratorPrefix = 'AWSAccelerator';
    let repoNamePrefix = 'aws-accelerator';

    for (const envVariable of batchGetProjectsCommandResponse.projects![0].environment!.environmentVariables!) {
      if (envVariable.name === 'ACCELERATOR_QUALIFIER') {
        acceleratorQualifier = envVariable.value!;
        isQualifierUsed = true;
      }
      if (envVariable.name === 'ACCELERATOR_PREFIX') {
        acceleratorPrefix = envVariable.value!;
        repoNamePrefix = envVariable.value!;
      }
    }

    // Default assignments with prefix when no qualifier present
    let testerPipelineConfigRepositoryName = `${repoNamePrefix}-test-config`;
    let acceleratorPipelineStackNamePrefix = `${acceleratorPrefix}-PipelineStack`;
    let acceleratorPipelineName = `${acceleratorPrefix}-Pipeline`;
    // Accelerator tester configuration
    let testerPipelineStackNamePrefix = `${acceleratorPrefix}-TesterPipelineStack`;
    let testerStackNamePrefix = `${acceleratorPrefix}-TesterStack`;

    // Name resources based on qualifier
    if (isQualifierUsed) {
      acceleratorPipelineStackNamePrefix = `${acceleratorQualifier}-pipeline-stack`;
      acceleratorPipelineName = `${acceleratorQualifier}-pipeline`;
      testerStackNamePrefix = `${acceleratorQualifier}-tester-stack`;
      testerPipelineStackNamePrefix = `${acceleratorQualifier}-tester-pipeline-stack`;
      testerPipelineConfigRepositoryName = `${acceleratorQualifier}-test-config`;
    }

    //Delete accelerator target cloudformation stacks
    await this.deletePipelineCloudFormationStacks(acceleratorPrefix, acceleratorPipelineName);

    // remaining cleanup is required when fullDestroy or deleteAccelerator option used
    if (this.acceleratorToolProps.fullDestroy || this.acceleratorToolProps.deleteAccelerator) {
      // Installer and Tester stack resource cleanup takes place in pipeline or management account, so reset the credential settings
      AcceleratorTool.resetCredentialEnvironment();

      // Delete tester stack
      await this.deleteTesterStack(testerStackNamePrefix);

      // Delete tester pipeline stack when keepPipelineAndConfig not used
      if (!this.acceleratorToolProps.keepPipelineAndConfig) {
        await this.deleteTesterPipelineStack(testerPipelineStackNamePrefix, testerPipelineConfigRepositoryName);
      }

      // Delete Accelerator Pipeline stack when keepPipelineAndConfig not used
      if (!this.acceleratorToolProps.keepPipelineAndConfig) {
        await this.deleteAcceleratorPipelineStack(acceleratorPipelineStackNamePrefix);
      }

      //
      // Start of installer cleanup only when fullDestroy used

      //Delete Installer Stack when fullDestroy used
      if (this.acceleratorToolProps.fullDestroy) {
        await this.deleteAcceleratorInstallerStack(installerStackName);

        // Delete bootstrap stack only when pipeline not executed from external account
        if (!this.externalPipelineAccount.isUsed) {
          // AcceleratorTool.resetCredentialEnvironment();
          await this.deleteStack(new CloudFormationClient({}), `${acceleratorPrefix}-CDKToolkit`);
        }
        //start final resource cleanup, CWL logs are re-created post CFN stack deletion so these needs to be clean
        await this.finalCleanup(acceleratorPrefix, acceleratorQualifier);
      }
    }
    return true;
  }

  /**
   *
   * @param stsClient Function to assume role
   * @param roleArn
   * @returns
   */
  private async assumeRole(stsClient: STSClient, roleArn: string): Promise<AssumeRoleCommandOutput> {
    return throttlingBackOff(() =>
      stsClient.send(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: 'acceleratorAssumeRoleSession',
          DurationSeconds: 3600,
        }),
      ),
    );
  }

  /**
   * Clears credential environment variables
   * @private
   */
  private static resetCredentialEnvironment() {
    //reset credential variables
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_ACCESS_KEY'];
    delete process.env['AWS_SECRET_KEY'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_SESSION_TOKEN'];
  }

  /**
   * Delete installer stack and resources like installer stack, installer pipeline code build projects etc.
   * @param installerStackName
   * @private
   */
  private async deleteAcceleratorInstallerStack(installerStackName: string): Promise<void> {
    if (this.acceleratorToolProps.keepPipelineAndConfig) {
      return;
    }

    const installerPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(installerStackName);

    if (installerPipeline.status) {
      const codeBuildClient = new CodeBuildClient({});
      const response = await throttlingBackOff(() =>
        codeBuildClient.send(new BatchGetProjectsCommand({ names: [installerPipeline.pipelineName] })),
      );
      for (const project of response.projects ?? []) {
        await this.deleteCodeBuilds(codeBuildClient, project.name!);
      }
    }
    await this.deleteStack(new CloudFormationClient({}), installerStackName);
  }

  /**
   * Function to delete cloudformation stacks created by accelerator pipeline
   * @param pipelineName
   * @private
   */
  private async deletePipelineCloudFormationStacks(acceleratorPrefix: string, pipelineName: string): Promise<void> {
    await this.initPipeline(acceleratorPrefix, pipelineName);

    for (const stack of this.acceleratorCloudFormationStacks) {
      await this.deleteStacks(acceleratorPrefix, stack.stackName);
    }
  }

  /**
   * Private async function to initialize required properties to perform accelerator cleanup
   * @private
   */
  private async initPipeline(acceleratorPrefix: string, pipelineName: string): Promise<void> {
    try {
      const response = await throttlingBackOff(() =>
        new CodePipelineClient({}).send(new GetPipelineCommand({ name: pipelineName })),
      );

      for (const stage of response.pipeline!.stages ?? []) {
        // Create list of stage names to be used for stage filter when input stage name is given
        this.pipelineStageNames.push(stage.name!.toLowerCase());

        // maintain list of code build project for the accelerator pipeline
        this.getCodebuildProjects(stage);

        // Get the source repo names
        this.getPipelineRepos(stage);

        // Get pipeline action names
        this.getPipelineActionNames(stage);

        // Get bootstrap environment variables
        await this.getBootstrapEnvVariables(stage);
      }

      //
      // Filter the stages to be destroy based on input stage name
      try {
        this.filterPipelineStages();
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        throw new Error(e);
      }

      // Get Pipeline Global config
      this.globalConfig = await this.getGlobalConfig();

      // Get Pipeline Security config
      this.securityConfig = await this.getSecurityConfig();

      // Set pipeline management account details
      this.pipelineManagementAccount = await this.getPipelineManagementAccount();

      // Get List of Accounts within organization
      this.organizationAccounts = await this.getOrganizationAccountList();

      // Order the stacks in delete order
      this.acceleratorCloudFormationStacks = this.getPipelineCloudFormationStacks(acceleratorPrefix);
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e.name === 'PipelineNotFoundException') {
        throw new Error(`Pipeline ${pipelineName} not found!!!`);
      } else {
        throw new Error(e);
      }
    }
  }

  /**
   * Function to delete accelerator pipeline stack and it's resources
   * @param acceleratorPipelineStackNamePrefix
   * @private
   */
  private async deleteAcceleratorPipelineStack(acceleratorPipelineStackNamePrefix: string): Promise<void> {
    const acceleratorPipelineStackName = `${acceleratorPipelineStackNamePrefix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    const acceleratorPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(
      acceleratorPipelineStackName,
    );

    if (
      acceleratorPipeline.status &&
      (await AcceleratorTool.isConfigRepositoryCreatedByAccelerator(acceleratorPipelineStackName))
    ) {
      await this.deleteCodecommitRepository(
        new CodeCommitClient({}),
        `${this.pipelineConfigSourceRepo?.repositoryName}`,
      );

      const codeBuildClient = new CodeBuildClient({});
      const response = await throttlingBackOff(() =>
        codeBuildClient.send(new BatchGetProjectsCommand({ names: [acceleratorPipeline.pipelineName] })),
      );
      for (const project of response.projects ?? []) {
        await this.deleteCodeBuilds(codeBuildClient, project.name!);
      }
    }

    await this.deleteStack(new CloudFormationClient({}), acceleratorPipelineStackName);
  }

  /**
   * Function to get code build environment variables
   * @param buildProjectName
   * @private
   */
  private async getCodeBuildEnvironmentVariables(
    buildProjectName: string,
  ): Promise<{ name: string; value: string }[] | undefined> {
    const buildEnvironmentVariables: { name: string; value: string }[] = [];
    const codeBuildClient = new CodeBuildClient({});
    const response = await throttlingBackOff(() =>
      codeBuildClient.send(new BatchGetProjectsCommand({ names: [buildProjectName] })),
    );

    for (const envVariable of response.projects![0].environment!.environmentVariables!) {
      buildEnvironmentVariables.push({ name: envVariable.name!, value: envVariable.value! });
    }

    return buildEnvironmentVariables;
  }

  /**
   * Get pipeline management account details
   * @private
   */
  private async getPipelineManagementAccount(): Promise<ManagementAccountType> {
    let managementAccountId: string | undefined;
    let managementAccountRoleName: string | undefined;
    let managementAccountCredentials: Credentials | undefined;

    for (const envVariable of this.bootstrapBuildEnvironmentVariables!) {
      if (envVariable.name === 'MANAGEMENT_ACCOUNT_ID') {
        managementAccountId = envVariable.value;
      }
      if (envVariable.name === 'MANAGEMENT_ACCOUNT_ROLE_NAME') {
        managementAccountRoleName = envVariable.value;
      }
    }

    if (this.executingAccountId !== managementAccountId && managementAccountId && managementAccountRoleName) {
      managementAccountCredentials = await this.getManagementAccountCredentials(
        managementAccountId,
        managementAccountRoleName,
      );
      this.externalPipelineAccount = { isUsed: true, accountId: this.executingAccountId! };
      return {
        accountId: managementAccountId,
        assumeRoleName: managementAccountRoleName,
        credentials: managementAccountCredentials,
      };
    } else {
      this.externalPipelineAccount = { isUsed: false, accountId: managementAccountId };
      return {
        accountId: this.executingAccountId!,
        assumeRoleName: undefined,
        credentials: undefined,
      };
    }
  }

  /**
   * Function to get account list from organization
   * @private
   */
  private async getOrganizationAccountList(): Promise<{ accountName: string; accountId: string }[]> {
    let organizationsClient: OrganizationsClient;
    if (this.pipelineManagementAccount!.credentials) {
      organizationsClient = new OrganizationsClient({
        credentials: {
          secretAccessKey: this.pipelineManagementAccount!.credentials.SecretAccessKey!,
          accessKeyId: this.pipelineManagementAccount!.credentials.AccessKeyId!,
          sessionToken: this.pipelineManagementAccount!.credentials.SessionToken!,
          expiration: this.pipelineManagementAccount!.credentials.Expiration!,
        },
      });
    } else {
      organizationsClient = new OrganizationsClient({});
    }

    const accountIds: { accountName: string; accountId: string }[] = [];
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        organizationsClient.send(new ListAccountsCommand({ NextToken: nextToken })),
      );
      for (const account of page.Accounts ?? []) {
        if (account.Id && account.Name) {
          accountIds.push({ accountName: account.Name, accountId: account.Id });
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
    return accountIds;
  }

  /**
   * Function to get cloudformation stacks created by pipeline stage actions
   * @private
   */
  private getPipelineCloudFormationStacks(acceleratorPrefix: string): pipelineStackType[] {
    const pipelineCloudFormationStacks: pipelineStackType[] = [];

    for (const stage of this.pipelineStageActions) {
      for (const action of stage.actions) {
        // for (const account of this.organizationAccounts) {
        pipelineCloudFormationStacks.push({
          stageOrder: stage.order,
          order: action.order,
          stackName: `${acceleratorPrefix}${action.stackPrefix}`,
        });

        // }
      }
    }
    return pipelineCloudFormationStacks;
  }

  private async getListObjectVersions(
    s3Client: S3Client,
    bucketName: string,
  ): Promise<ListObjectVersionsCommandOutput> {
    return throttlingBackOff(() =>
      s3Client.send(
        new ListObjectVersionsCommand({
          Bucket: bucketName,
        }),
      ),
    );
  }

  /**
   * Function to get management account credentials
   * @param managementAccountId
   * @param managementAccountRoleName
   * @private
   */
  private async getManagementAccountCredentials(
    managementAccountId: string,
    managementAccountRoleName: string | undefined,
  ): Promise<Credentials | undefined> {
    if (!managementAccountId && !managementAccountRoleName) {
      return undefined;
    }

    const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${managementAccountId}:role/${managementAccountRoleName}`;

    const stsClient = new STSClient({});

    const assumeRoleCredential = await this.assumeRole(stsClient, roleArn);

    process.env['AWS_ACCESS_KEY_ID'] = assumeRoleCredential.Credentials!.AccessKeyId!;
    process.env['AWS_ACCESS_KEY'] = assumeRoleCredential.Credentials!.AccessKeyId!;

    process.env['AWS_SECRET_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;
    process.env['AWS_SECRET_ACCESS_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;

    process.env['AWS_SESSION_TOKEN'] = assumeRoleCredential.Credentials!.SessionToken;

    return assumeRoleCredential.Credentials;
  }

  /**
   * Function to get GlobalConfig object from the repo content
   * @private
   */
  private async getGlobalConfig(): Promise<GlobalConfig> {
    const codeCommitClient = new CodeCommitClient({});
    const response = await throttlingBackOff(() =>
      codeCommitClient.send(
        new GetFileCommand({
          repositoryName: this.pipelineConfigSourceRepo!.repositoryName,
          filePath: 'global-config.yaml',
        }),
      ),
    );

    const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'accel-config'));
    fs.writeFileSync(path.join(tempDirPath, 'global-config.yaml'), response.fileContent!, 'utf8');
    return GlobalConfig.load(tempDirPath);
  }

  /**
   * Function to get SecurityConfig object from the repo content
   * @private
   */
  private async getSecurityConfig(): Promise<SecurityConfig> {
    const codeCommitClient = new CodeCommitClient({});
    const response = await throttlingBackOff(() =>
      codeCommitClient.send(
        new GetFileCommand({
          repositoryName: this.pipelineConfigSourceRepo!.repositoryName,
          filePath: 'security-config.yaml',
        }),
      ),
    );

    const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'accel-config'));
    fs.writeFileSync(path.join(tempDirPath, 'security-config.yaml'), response.fileContent!, 'utf8');
    return SecurityConfig.load(tempDirPath);
  }

  /**
   * Function to get list of managed policies which are assigned to IAM roles by SSM automation accelerator-ec2-instance-profile-permission
   * @returns
   */
  private getSsmManagedPolicies(): string[] {
    for (const ruleSet of this.securityConfig!.awsConfig.ruleSets ?? []) {
      for (const rule of ruleSet.rules) {
        if (rule.name.toString() === 'accelerator-ec2-instance-profile-permission') {
          for (const [key, value] of Object.entries(rule.inputParameters)) {
            if (key === 'AWSManagedPolicies') {
              return (value as string).split(',');
            }
          }
        }
      }
    }
    return [];
  }

  /**
   * Function to delete bucket once all objects are deleted
   * @param s3Client
   * @param stackName
   * @param bucketName
   * @private
   */
  private async deleteBucket(s3Client: S3Client, stackName: string, bucketName: string): Promise<boolean> {
    // List object and Delete objects
    try {
      let listObjectVersionsResponse = await this.getListObjectVersions(s3Client, bucketName);
      let contents = [
        ...(listObjectVersionsResponse.Versions ?? []),
        ...(listObjectVersionsResponse.DeleteMarkers ?? []),
      ];
      while (contents.length > 0) {
        this.debugLog(`Number of objects in ${bucketName} is ${contents.length} will be deleted`, 'info');
        // eslint-disable-next-line  @typescript-eslint/no-explicit-any
        const records = contents.map((record: any) => ({
          Key: record.Key,
          VersionId: record.VersionId,
        }));
        this.debugLog(`Deleting objects from bucket ${bucketName} from ${stackName} stack`, 'info');
        await throttlingBackOff(() =>
          s3Client.send(
            new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: { Objects: records },
            }),
          ),
        );

        // Wait before checking again for data
        await this.delay(1000);

        listObjectVersionsResponse = await this.getListObjectVersions(s3Client, bucketName);

        contents = [
          ...(listObjectVersionsResponse.Versions ?? []),
          ...(listObjectVersionsResponse.DeleteMarkers ?? []),
        ];

        this.debugLog(`Number of objects in ${bucketName} is ${contents.length}, remaining to delete`, 'info');
      }

      // Delete the empty Bucket
      this.debugLog(`Deleting empty bucket ${bucketName} from ${stackName} stack`, 'info');
      await throttlingBackOff(() =>
        s3Client.send(
          new DeleteBucketCommand({
            Bucket: bucketName,
          }),
        ),
      );
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      if (e.name === 'NoSuchBucket') {
        return true;
      }
    }
    return true;
  }

  /**
   * Function to delete Cloudwatch log group
   * @param cloudWatchLogsClient
   * @param stackName
   * @param logGroupName
   * @private
   */
  private async deleteCloudWatchLogs(
    cloudWatchLogsClient: CloudWatchLogsClient,
    stackName: string,
    logGroupName: string,
  ): Promise<boolean> {
    this.debugLog(`Deleting Cloudwatch Log group ${logGroupName} from ${stackName} stack`, 'info');
    try {
      await throttlingBackOff(() =>
        cloudWatchLogsClient.send(new DeleteLogGroupCommand({ logGroupName: logGroupName })),
      );
    } catch (ResourceNotFoundException) {
      this.debugLog(
        `Cloudwatch Log group delete Error Log Group NOT FOUND ${logGroupName} from ${stackName} stack`,
        'info',
      );
    }
    return true;
  }

  private async deleteIamRolePolicy(): Promise<void> {
    for (const item of this.iamRoles) {
      // this.debugLog(`Deleting IAM Role ${item.roleName} from ${item.stackName} stack`, 'info');
      try {
        // Remove managed policies
        const listAttachedRolePoliciesResponse = await throttlingBackOff(() =>
          item.client.send(new ListAttachedRolePoliciesCommand({ RoleName: item.roleName })),
        );

        for (const policy of listAttachedRolePoliciesResponse.AttachedPolicies!) {
          if (
            this.getSsmManagedPolicies().indexOf(policy.PolicyName!) !== -1
            // policy.PolicyName === 'AmazonSSMManagedInstanceCore' ||
            // policy.PolicyName === 'AmazonSSMDirectoryServiceAccess' ||
            // policy.PolicyName === 'CloudWatchAgentServerPolicy'
          ) {
            this.debugLog(
              `Managed policy ${policy.PolicyName} detached from IAM Role ${item.roleName} from ${item.stackName}`,
              'info',
            );
            await throttlingBackOff(() =>
              item.client.send(new DetachRolePolicyCommand({ RoleName: item.roleName, PolicyArn: policy.PolicyArn })),
            );
          }
        }
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        if (e.name === 'NoSuchEntity') {
          this.debugLog(`IAM Role ${item.roleName} from ${item.stackName} stack not found !!`, 'info');
        }
      }
    }
    this.iamRoles = [];
  }

  /**
   * Function to delete Cloudwatch log group
   * @param backupClient
   * @param stackName
   * @param backupVaultName
   * @private
   */
  private async deleteBackupVault(
    backupClient: BackupClient,
    stackName: string,
    backupVaultName: string,
  ): Promise<boolean> {
    this.debugLog(`Deleting BackupVault ${backupVaultName} from ${stackName} stack`, 'info');

    try {
      await throttlingBackOff(() =>
        backupClient.send(new DeleteBackupVaultCommand({ BackupVaultName: backupVaultName })),
      );
    } catch (ResourceNotFoundException) {
      this.debugLog(`AWS BackupVault NOT FOUND ${backupVaultName} from ${stackName} stack`, 'debug');
    }
    return true;
  }

  /**
   * Function to schedule Key deletion
   * @param kMSClient
   * @param stackName
   * @param kmsKeyId
   * @private
   */
  private async scheduleKeyDeletion(kMSClient: KMSClient, stackName: string, kmsKeyId: string): Promise<boolean> {
    this.debugLog(`Disabling KMS Key ${kmsKeyId} from ${stackName} stack`, 'info');
    const keyStatus = await throttlingBackOff(() => kMSClient.send(new DescribeKeyCommand({ KeyId: kmsKeyId })));
    if (keyStatus.KeyMetadata?.KeyState === KeyState.Enabled) {
      try {
        await throttlingBackOff(() => kMSClient.send(new DisableKeyCommand({ KeyId: kmsKeyId })));
        this.debugLog(`Schedule KMS Key deletion ${kmsKeyId} from ${stackName} stack`, 'info');
        await throttlingBackOff(() =>
          kMSClient.send(
            new ScheduleKeyDeletionCommand({
              KeyId: kmsKeyId,
              PendingWindowInDays: 7,
            }),
          ),
        );
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        if (e.name === 'KMSInvalidStateException') {
          // This is needed because session manager key is deleted with stack
          this.debugLog(
            '`KMS Key ${kmsKeyId} from ${stackName} stack in ${keyStatus.KeyMetadata?.KeyState} status, can not schedule deletion`',
            'info',
          );
          return true;
        }
      }
    } else {
      this.debugLog(
        `KMS Key ${kmsKeyId} from ${stackName} stack in ${keyStatus.KeyMetadata?.KeyState} status, can not schedule deletion`,
        'info',
      );
    }
    return true;
  }

  /**
   * Function to get pipeline name from given cloudformation stack
   * @param stackName
   * @private
   */
  private static async getPipelineNameFromCloudFormationStack(
    stackName: string,
  ): Promise<{ status: boolean; pipelineName: string }> {
    try {
      const cloudformationClient = new CloudFormationClient({});
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          cloudformationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
        );
        for (const stackResourceSummary of page.StackResourceSummaries ?? []) {
          if (stackResourceSummary.ResourceType === 'AWS::CodePipeline::Pipeline') {
            return { status: true, pipelineName: stackResourceSummary.PhysicalResourceId! };
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);
      return { status: false, pipelineName: `No pipeline found in stack ${stackName}` };
    } catch (error) {
      return { status: false, pipelineName: `${error}` };
    }
  }

  /**
   * Function to check weather accelerator pipeline created code commit repository
   * @param stackName
   * @private
   */
  private static async isConfigRepositoryCreatedByAccelerator(stackName: string): Promise<boolean> {
    const cloudFormationClient = new CloudFormationClient({});
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cloudFormationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
      );
      for (const stackResourceSummary of page.StackResourceSummaries ?? []) {
        if (stackResourceSummary.ResourceType === 'AWS::CodeCommit::Repository') {
          return true;
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    return false;
  }

  /**
   * Function to delete stack's resources like S3/Cloudwatch logs, KMS key
   * @param accountId
   * @param stackName
   * @param cloudFormationClient
   * @param cloudWatchLogsClient
   * @param s3Client
   * @param backupClient
   * @param iamClient
   * @param kMSClient
   * @private
   */
  private async prepareStackResourcesForDelete(
    stackName: string,
    cloudFormationClient: CloudFormationClient,
    cloudWatchLogsClient: CloudWatchLogsClient,
    s3Client: S3Client,
    backupClient: BackupClient,
    kMSClient: KMSClient,
    iamClient: IAMClient,
  ): Promise<void> {
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cloudFormationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
      );
      for (const stackResourceSummary of page.StackResourceSummaries ?? []) {
        switch (stackResourceSummary.ResourceType) {
          case 'AWS::KMS::Key':
            this.kmsKeys.push({
              client: kMSClient,
              stackName: stackName,
              key: stackResourceSummary.PhysicalResourceId!,
            });
            break;
          case 'AWS::Backup::BackupVault':
            this.backupVaults.push({
              client: backupClient,
              stackName: stackName,
              backup: stackResourceSummary.PhysicalResourceId!,
            });
            break;
          case 'AWS::Logs::LogGroup':
            this.logGroups.push({
              client: cloudWatchLogsClient,
              stackName: stackName,
              logGroup: stackResourceSummary.PhysicalResourceId!,
            });
            break;
          case 'AWS::S3::Bucket':
            const listBucketResponse = await throttlingBackOff(() => s3Client.send(new ListBucketsCommand({})));
            for (const bucket of listBucketResponse.Buckets!) {
              if (bucket.Name === stackResourceSummary.PhysicalResourceId) {
                this.buckets.push({
                  client: s3Client,
                  stackName: stackName,
                  bucket: stackResourceSummary.PhysicalResourceId!,
                });
              }
            }
            break;
          case 'AWS::IAM::Role':
            // This is needed because SessionManagerEC2Role will have managed policies by SSM automation
            // which will cause stack deletion to fail
            // if (
            //   stackResourceSummary.PhysicalResourceId!.includes('AWSAccelerator-SessionManagerEC2Role') &&
            //   iamClient
            // ) {
            this.iamRoles.push({
              client: iamClient,
              stackName: stackName,
              roleName: stackResourceSummary.PhysicalResourceId!,
            });
            // }
            break;
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
  }

  /**
   * Function to check if given stack deletion completed.
   * @param cloudFormationClient
   * @param stackName
   * @private
   */
  private async isStackDeletionCompleted(
    cloudFormationClient: CloudFormationClient,
    stackName: string,
    retryAttempt: number,
    maxRetry: number,
  ): Promise<'FAILED' | 'COMPLETE' | 'IN_PROGRESS'> {
    if (retryAttempt === 1) {
      await this.delay(30000);
    }
    try {
      const response = await throttlingBackOff(() =>
        cloudFormationClient.send(new DescribeStacksCommand({ StackName: stackName })),
      );
      if (response.Stacks![0].StackStatus === StackStatus.DELETE_FAILED) {
        if (retryAttempt > maxRetry) {
          throw Error(
            `Stack ${stackName} failed to delete, ${retryAttempt} times delete attempted, investigate and fix the issue and rerun uninstaller`,
          );
        } else {
          return 'FAILED';
        }
      }
      if (response.Stacks![0].StackStatus === StackStatus.DELETE_IN_PROGRESS) {
        if (retryAttempt > maxRetry) {
          throw Error(
            `Stack ${stackName} failed to delete, stack is in ${
              response.Stacks![0].StackStatus
            } status for more than 10 minutes, uninstaller exited!!!`,
          );
        }
        this.debugLog(`Stack ${stackName} deletion in-progress.....`, 'display');
        return 'IN_PROGRESS';
      }
      if (response.Stacks![0].StackStatus === StackStatus.DELETE_COMPLETE) {
        return 'COMPLETE';
      }
    } catch (error) {
      if (`${error}`.includes(`Stack ${stackName} does not exist`)) {
        return 'COMPLETE';
      }
    }

    return 'COMPLETE';
  }

  /**
   * Function to delete cloudformation stack
   * @param stackName
   * @private
   */
  private async deleteStacks(acceleratorPrefix: string, stackName: string): Promise<void> {
    // const promises: Promise<boolean>[] = [];
    // const deleteStackStartedPromises: Promise<DeleteStackCommandOutput>[] = [];
    // const deleteStackCompletedPromises: Promise<WaiterResult>[] = [];
    const assumeRoleName = this.globalConfig?.managementAccountAccessRole || 'AWSControlTowerExecution';
    let cloudFormationClient: CloudFormationClient;
    let s3Client: S3Client;
    let kMSClient: KMSClient;
    let cloudWatchLogsClient: CloudWatchLogsClient;
    let backupClient: BackupClient;
    let iamClient: IAMClient;

    // Make list of regions for cleanup of stacks, this is required because some stack goes to global region
    const cleanupRegions: string[] = [];
    for (const region of this.globalConfig?.enabledRegions || []) {
      cleanupRegions.push(region);
    }

    if (cleanupRegions.indexOf(this.globalRegion) === -1) {
      cleanupRegions.push(this.globalRegion);
    }

    // let cloudFormationStack: Stack | undefined;
    //Use a loop for all regions
    for (const region of cleanupRegions) {
      for (const account of this.organizationAccounts) {
        if (account.accountId !== this.pipelineManagementAccount?.accountId) {
          const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${account.accountId}:role/${assumeRoleName}`;
          const stsClient = new STSClient({ region: region });
          const assumeRoleCredential = await this.assumeRole(stsClient, roleArn);
          cloudFormationClient = new CloudFormationClient({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });
          s3Client = new S3Client({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });

          cloudWatchLogsClient = new CloudWatchLogsClient({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });
          backupClient = new BackupClient({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });
          iamClient = new IAMClient({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });
          kMSClient = new KMSClient({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });
        } else {
          cloudFormationClient = new CloudFormationClient({ region: region });
          s3Client = new S3Client({ region: region });
          cloudWatchLogsClient = new CloudWatchLogsClient({ region: region });
          backupClient = new BackupClient({ region: region });
          iamClient = new IAMClient({ region: region });
          kMSClient = new KMSClient({ region: region });
        }

        // Exclude management account home region bootstrap deletion before pipeline stack and installer stacks are deleted, conditions are
        // 1. When pipeline account is not used
        // 2. When stack is for home region
        // 3. When it is bootstrap stack
        // 4. When stack is part of management account
        // 5. When keepBootstraps flag is OFF
        if (
          // cloudFormationStack &&
          !this.externalPipelineAccount.isUsed &&
          this.globalConfig?.homeRegion === region &&
          stackName === `${acceleratorPrefix}-CDKToolkit` &&
          this.pipelineManagementAccount!.accountId === account.accountId &&
          !this.acceleratorToolProps.keepBootstraps
        ) {
          this.debugLog(`Management account home region bootstrap stack deletion excluded`, 'info');
          this.debugLog(
            `${stackName} stack region is ${region} and home region is ${this.globalConfig?.homeRegion}`,
            'info',
          );
        } else {
          this.deleteStackLists.push({
            clients: {
              cloudFormation: cloudFormationClient,
              cloudWatchLogs: cloudWatchLogsClient,
              s3: s3Client,
              backup: backupClient,
              iam: iamClient,
              kms: kMSClient,
            },
            stackName: stackName!,
            accountID: account.accountId,
            region: region,
          });
        }
      }
    }
    await this.completeStacksDeletion(acceleratorPrefix);
  }

  /**
   * Function to see is cloudformation stack is deletable
   * If stack termination protection is ON and uninstaller flag to ignore termination protection is on then it is considered to be deletable
   * @param cloudFormationClient
   * @param stackName
   * @param accountId
   * @param region
   * @private
   */
  private async disableStackTermination(
    cloudFormationClient: CloudFormationClient,
    stackName: string,
    accountId?: string,
    region?: string,
  ): Promise<boolean> {
    let enableTerminationProtection = false;
    const response = await throttlingBackOff(() =>
      cloudFormationClient.send(new DescribeStacksCommand({ StackName: stackName })),
    );
    enableTerminationProtection = response.Stacks![0].EnableTerminationProtection ?? false;
    if (enableTerminationProtection) {
      if (this.acceleratorToolProps.ignoreTerminationProtection) {
        this.debugLog(
          `Stack ${stackName} termination protection is enabled, disabling the termination protection"`,
          'info',
        );
        await throttlingBackOff(() =>
          cloudFormationClient.send(
            new UpdateTerminationProtectionCommand({
              StackName: stackName,
              EnableTerminationProtection: false,
            }),
          ),
        );
        this.debugLog(`Waiting stack ${stackName} update completion"`, 'info');

        await this.delay(1000);

        return true;
      } else {
        if (stackName && accountId) {
          this.debugLog(
            `Due to termination protection enable skipping deletion of CloudFormation stack ${stackName} in ${accountId} account from ${region} region`,
            'warn',
          );
        } else {
          this.debugLog(
            `Due to termination protection enable skipping deletion of CloudFormation stack ${stackName}`,
            'warn',
          );
        }
        this.debugLog(`Un-installation STOPPED, due to termination protection of  stack ${stackName}!!!"`, 'warn');
        process.abort();
      }
    } else {
      return true;
    }
  }

  /**
   * Function to delete accelerator tester stack
   * @param stackNamePrefix
   * @private
   */
  private async deleteTesterStack(stackNamePrefix: string): Promise<void> {
    const cloudFormationClient = new CloudFormationClient({});
    const testerStackName = `${stackNamePrefix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    await this.deleteStack(cloudFormationClient, testerStackName);
  }

  /**
   * Function to delete accelerator tester pipeline stack
   * @param testerPipelineStackNamePrefix
   * @param testerPipelineConfigRepositoryName
   * @private
   */
  private async deleteTesterPipelineStack(
    testerPipelineStackNamePrefix: string,
    testerPipelineConfigRepositoryName: string,
  ): Promise<void> {
    const cloudFormationClient = new CloudFormationClient({});

    if (this.acceleratorToolProps.keepPipelineAndConfig) {
      return;
    }

    const testerPipelineStackName = `${testerPipelineStackNamePrefix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    if (!this.acceleratorToolProps.keepPipelineAndConfig) {
      await this.deleteCodecommitRepository(new CodeCommitClient({}), testerPipelineConfigRepositoryName);
    }

    const testerPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(testerPipelineStackName);

    if (testerPipeline.status) {
      const codeBuildClient = new CodeBuildClient({});
      const response = await throttlingBackOff(() =>
        codeBuildClient.send(new BatchGetProjectsCommand({ names: [testerPipeline.pipelineName] })),
      );
      for (const project of response.projects ?? []) {
        await this.deleteCodeBuilds(codeBuildClient, project.name!);
      }
    }

    await this.deleteStack(cloudFormationClient, testerPipelineStackName);
  }

  /**
   * Function to delete cloudformation stack
   * @param cloudFormationClient
   * @param stackName
   * @private
   */
  private async deleteStack(cloudFormationClient: CloudFormationClient, stackName: string): Promise<void> {
    try {
      await throttlingBackOff(() => cloudFormationClient.send(new DescribeStacksCommand({ StackName: stackName })));
      // cloudFormationStack = response.Stacks![0].StackName;
    } catch (error) {
      if (`${error}`.includes(`Stack with id ${stackName} does not exist`)) {
        this.debugLog(`Stack ${stackName} does not exist`, 'warn');
        return;
      }
    }

    if (!(await this.disableStackTermination(cloudFormationClient, stackName))) {
      return;
    }

    // Prepare list of resources to be deleted before and after stack deletion
    await this.prepareStackResourcesForDelete(
      stackName,
      cloudFormationClient,
      new CloudWatchLogsClient({}),
      new S3Client({}),
      new BackupClient({}),
      new KMSClient({}),
      new IAMClient({}),
    );

    // Delete resource before stack deletion
    await this.deletePreStackDeleteResources();

    await this.completeStackDeletion(cloudFormationClient, stackName);

    // Delete resource after stack deletion
    await this.deletePostStackDeleteResources();
  }

  /**
   * Function to delete code commit repository
   * @param codeCommitClient
   * @param repositoryName
   * @private
   */
  private async deleteCodecommitRepository(codeCommitClient: CodeCommitClient, repositoryName: string): Promise<void> {
    //Delete config repository
    this.debugLog(`CodeCommit repository ${repositoryName} deletion started`, 'display');
    await throttlingBackOff(() =>
      codeCommitClient.send(new DeleteRepositoryCommand({ repositoryName: repositoryName })),
    );
    this.debugLog(`CodeCommit repository ${repositoryName} deletion completed`, 'display');
  }

  /**
   * Function to delete build ids for code build project
   * @param codeBuildClient
   * @param buildProjectName
   * @private
   */
  private async deleteCodeBuilds(codeBuildClient: CodeBuildClient, buildProjectName: string): Promise<void> {
    //delete code build projects before deleting pipeline
    const buildIds: string[] = [];
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        codeBuildClient.send(new ListBuildsForProjectCommand({ projectName: buildProjectName, nextToken })),
      );
      for (const id of page.ids!) {
        buildIds.push(id);
      }
      nextToken = page.nextToken;
    } while (nextToken);
    this.debugLog(`Deleting build ids for the project ${buildProjectName}`, 'info');
    await throttlingBackOff(() => codeBuildClient.send(new BatchDeleteBuildsCommand({ ids: buildIds })));
  }

  /**
   *
   * @returns Function to filter stages to be deleted based on input stage name
   */
  private filterPipelineStages() {
    const requiredStages: {
      stage: string;
      order: number;
      actions: stageActionType[];
    }[] = [];
    let stageOrder = 0;
    let actionOrder = 0;

    // filter based on stage name

    if (this.acceleratorToolProps.stageName !== 'all') {
      if (this.pipelineStageNames.indexOf(this.acceleratorToolProps.stageName.toLowerCase()) === -1) {
        throw new Error(`Invalid pipeline stage name ${this.acceleratorToolProps.stageName}`);
      }

      for (const stage of this.pipelineStageActions) {
        if (stage.stage.toLowerCase() === this.acceleratorToolProps.stageName.toLowerCase()) {
          stageOrder = stage.order;
        }
      }
      this.pipelineStageActions = this.pipelineStageActions.filter(item => item.order >= stageOrder);
    }

    // Exclude bootstrap stacks when keepBootstraps flag is on
    if (this.acceleratorToolProps.keepBootstraps) {
      this.pipelineStageActions = this.pipelineStageActions.filter(item => item.stage.toLowerCase() !== 'bootstrap');
    }

    //
    // Filter based on action name
    stageOrder = 0;
    if (this.acceleratorToolProps.actionName !== 'all') {
      if (this.pipelineActionNames.indexOf(this.acceleratorToolProps.actionName.toLowerCase()) === -1) {
        throw new Error(`Invalid pipeline action name ${this.acceleratorToolProps.actionName}`);
      }

      for (const stage of this.pipelineStageActions) {
        for (const action of stage.actions) {
          if (action.name.toLowerCase() === this.acceleratorToolProps.actionName.toLowerCase()) {
            actionOrder = action.order;
            stageOrder = stage.order;
          }
        }
      }
    }
    this.pipelineStageActions = this.pipelineStageActions.filter(item => item.order >= stageOrder);

    for (const stage of this.pipelineStageActions) {
      for (const action of stage.actions!.filter(item => item.order >= actionOrder)) {
        requiredStages.push({ stage: stage.stage, order: stage.order, actions: [action] });
      }
    }

    this.pipelineStageActions = requiredStages;
  }

  /**
   * Function to get pipeline repository names
   * @param stage
   */
  private getPipelineRepos(stage: StageDeclaration) {
    if (stage.name === 'Source') {
      for (const action of stage.actions!) {
        if (action.name! === 'Configuration') {
          this.pipelineConfigSourceRepo = {
            repositoryName: action.configuration!['RepositoryName'],
            branch: action.configuration!['BranchName'],
            provider: action.actionTypeId!.provider!,
          };
        }
      }
    }
  }

  /**
   * Function to get pipeline action names
   * @param stage
   */
  private getPipelineActionNames(stage: StageDeclaration) {
    if (stage.name !== 'Source' && stage.name !== 'Build' && stage.name !== 'Review') {
      for (const action of stage.actions!) {
        this.pipelineActionNames.push(action.name!.toLowerCase());
      }
    }
  }

  /**
   * Function to get pipeline build projects
   */
  private getCodebuildProjects(stage: StageDeclaration) {
    for (const action of stage.actions ?? []) {
      if (
        action.configuration!['ProjectName'] &&
        !this.acceleratorCodeBuildProjects.find(item => item === action.configuration!['ProjectName'])
      ) {
        this.acceleratorCodeBuildProjects.push(action.configuration!['ProjectName']);
      }
    }
  }

  /**
   * Function to get pipeline bootstrap stage environment variables
   * @param stage
   */
  private async getBootstrapEnvVariables(stage: StageDeclaration) {
    if (stage.name === 'Bootstrap') {
      this.bootstrapBuildEnvironmentVariables = await this.getCodeBuildEnvironmentVariables(
        stage.actions![0].configuration!['ProjectName'],
      );
    }
  }

  /**
   * Function to schedule deletion of ksm keys post stack deletion
   */
  private async deleteKmsKeys() {
    if (!this.acceleratorToolProps.keepData) {
      for (const item of this.kmsKeys) {
        await this.scheduleKeyDeletion(item.client, item.stackName, item.key);
      }
    }
    this.kmsKeys = [];
  }

  /**
   * Function to delete backup vaults
   */
  private async deleteBackupVaults() {
    if (!this.acceleratorToolProps.keepData) {
      for (const item of this.backupVaults) {
        await this.deleteBackupVault(item.client, item.stackName, item.backup);
      }
    }
    this.backupVaults = [];
  }

  /**
   * Function to delete log groups
   */
  private async deleteLogGroups() {
    if (!this.acceleratorToolProps.keepData) {
      for (const item of this.logGroups) {
        await this.deleteCloudWatchLogs(item.client, item.stackName, item.logGroup);
      }
    }
    this.logGroups = [];
  }

  /**
   * Function to delete buckets post stack deletion, if buckets deleted before stack replication custom resource will fail
   */
  private async deleteBuckets() {
    if (!this.acceleratorToolProps.keepData) {
      for (const item of this.buckets) {
        await this.deleteBucket(item.client, item.stackName, item.bucket);
      }
    }
    this.buckets = [];
  }

  /**
   * Function to check if stack exists
   * @param cloudFormationClient
   * @param stackName
   * @param accountId
   * @param region
   * @returns
   */
  private async validateStackExistence(
    cloudFormationClient: CloudFormationClient,
    stackName: string,
    accountId: string,
    region: string,
  ): Promise<Stack | undefined> {
    let cloudFormationStack: Stack | undefined;
    try {
      const response = await throttlingBackOff(() =>
        cloudFormationClient.send(new DescribeStacksCommand({ StackName: stackName })),
      );
      cloudFormationStack = response.Stacks![0];
    } catch (error) {
      if (`${error}`.includes(`Stack with id ${stackName} does not exist`)) {
        this.debugLog(`Stack ${stackName} does not exist in ${accountId} account in ${region} region`, 'info');
        cloudFormationStack = undefined;
      }
    }

    return cloudFormationStack;
  }

  private async completeStacksDeletion(acceleratorPrefix: string) {
    const promises: Promise<void>[] = [];
    let stackName = '';
    for (const item of this.deleteStackLists) {
      stackName = item.stackName;
      const fullyQualifiedStackName =
        item.stackName === `${acceleratorPrefix}-CDKToolkit`
          ? `${acceleratorPrefix}-CDKToolkit`
          : `${item.stackName}-${item.accountID}-${item.region}`;

      const stackExists = await this.validateStackExistence(
        item.clients.cloudFormation,
        fullyQualifiedStackName,
        item.accountID,
        item.region,
      );

      if (stackExists) {
        await this.disableStackTermination(
          item.clients.cloudFormation,
          fullyQualifiedStackName,
          item.accountID,
          item.region,
        );

        // Prepare list of resources to be deleted before and after stack deletion
        await this.prepareStackResourcesForDelete(
          fullyQualifiedStackName,
          item.clients.cloudFormation,
          item.clients.cloudWatchLogs,
          item.clients.s3,
          item.clients.backup,
          item.clients.kms,
          item.clients.iam,
        );

        promises.push(this.cleanupStack(item.clients.cloudFormation, fullyQualifiedStackName));
      }
    }

    if (promises.length >= 0) {
      await Promise.all(promises);
    }

    await Promise.all(promises);

    //
    // Network vpcs stack takes time to deallocate IPAM
    if (promises.length > 0 && stackName === `${acceleratorPrefix}-NetworkVpcStack`) {
      await this.delay(360000);
    }
    this.deleteStackLists = [];
  }

  /**
   * Function to clean stack and it's resources
   * @param cloudFormationClient
   * @param stackName
   */
  private async cleanupStack(cloudFormationClient: CloudFormationClient, stackName: string) {
    await this.deletePreStackDeleteResources();
    await this.completeStackDeletion(cloudFormationClient, stackName);
    await this.deletePostStackDeleteResources();
  }

  /**
   * Function to delete resources before stack deletion
   */
  private async deletePreStackDeleteResources(): Promise<void> {
    // Delete IAM roles
    await this.deleteIamRolePolicy();
  }

  /**
   * Function to delete resources after stack deletion
   */
  private async deletePostStackDeleteResources(): Promise<void> {
    // Delete cloudwatch log groups
    await this.deleteLogGroups();

    // Delete backup vaults
    await this.deleteBackupVaults();

    // Delete buckets
    await this.deleteBuckets();

    // Delete KMS keys
    await this.deleteKmsKeys();
  }

  private async completeStackDeletion(cloudFormationClient: CloudFormationClient, stackName: string): Promise<void> {
    let retryAttempt = 1;
    this.debugLog(`Stack ${stackName} deletion started.`, 'display');
    await throttlingBackOff(() => cloudFormationClient.send(new DeleteStackCommand({ StackName: stackName })));

    let stackDeleteStatus = await this.isStackDeletionCompleted(cloudFormationClient, stackName, retryAttempt, 2);

    while (stackDeleteStatus !== 'COMPLETE') {
      // Wait before retry
      await this.delay(60000);
      if (stackDeleteStatus === 'FAILED') {
        retryAttempt = retryAttempt + 1;
        this.debugLog(
          `Stack ${stackName} deletion status ${stackDeleteStatus}, retry deletion, retry count ${retryAttempt}`,
          'info',
        );

        await throttlingBackOff(() => cloudFormationClient.send(new DeleteStackCommand({ StackName: stackName })));
        stackDeleteStatus = await this.isStackDeletionCompleted(cloudFormationClient, stackName, retryAttempt, 3);
      } else {
        stackDeleteStatus = await this.isStackDeletionCompleted(cloudFormationClient, stackName, retryAttempt, 10);
      }
    }

    this.debugLog(`Stack ${stackName} deletion completed.`, 'display');
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private debugLog(message: string, messageType: string) {
    switch (messageType) {
      case 'warn':
        this.logger.warn(message);
        break;
      case 'info':
        if (this.acceleratorToolProps.debug) {
          this.logger.warn(message);
        }
        break;
      case 'debug':
        if (this.acceleratorToolProps.debug) {
          this.logger.warn(message);
        }
        break;
      case 'display':
        this.logger.info(message);
        break;
    }
  }

  /**
   * Function to set global region
   */
  private setGlobalRegion() {
    if (this.acceleratorToolProps.partition === 'aws-us-gov') {
      this.globalRegion = 'us-gov-west-1';
    }

    if (this.acceleratorToolProps.partition === 'aws-iso-b') {
      this.globalRegion = 'us-isob-east-1';
    }

    if (this.acceleratorToolProps.partition === 'aws-cn') {
      this.globalRegion = 'cn-northwest-1';
    }
  }

  private async finalCleanup(acceleratorPrefix: string, acceleratorQualifier: string): Promise<void> {
    //cleanup CWL logs
    await this.deleteAllRemainingCloudWatchLogGroups(acceleratorPrefix, acceleratorQualifier);

    await this.deleteAllEcrs();
    return;
  }

  private async deleteAllEcrs(): Promise<void> {
    const assumeRoleName = this.globalConfig?.managementAccountAccessRole || 'AWSControlTowerExecution';
    let ecrClient: ECRClient;

    // Make list of regions for cleanup of stacks, this is required because some stack goes to global region
    const cleanupRegions: string[] = [];
    for (const region of this.globalConfig?.enabledRegions || []) {
      cleanupRegions.push(region);
    }

    if (cleanupRegions.indexOf(this.globalRegion) === -1) {
      cleanupRegions.push(this.globalRegion);
    }

    //Use a loop for all regions
    for (const region of cleanupRegions) {
      for (const account of this.organizationAccounts) {
        if (account.accountId !== this.pipelineManagementAccount?.accountId) {
          const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${account.accountId}:role/${assumeRoleName}`;
          const stsClient = new STSClient({ region: region });
          const assumeRoleCredential = await this.assumeRole(stsClient, roleArn);

          ecrClient = new ECRClient({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });
        } else {
          ecrClient = new ECRClient({ region: region });
        }

        this.debugLog(`Final Ecrs cleanup started in region ${region} of account ${account.accountName}`, 'display');
        let nextToken: string | undefined = undefined;
        const repositories: string[] = [];
        try {
          do {
            const page = await throttlingBackOff(() =>
              ecrClient.send(
                new DescribeRepositoriesCommand({
                  repositoryNames: [`cdk-accel-container-assets-${account.accountId}-${region}`],
                  nextToken: nextToken,
                }),
              ),
            );
            for (const repository of page.repositories ?? []) {
              repositories.push(repository.repositoryName!);
            }
            nextToken = page.nextToken;
          } while (nextToken);
        } catch (RepositoryNotFoundException) {
          this.debugLog(
            `Ecr delete Error, repository NOT FOUND cdk-accel-container-assets-${account.accountId}-${region} in region ${region} of account ${account.accountName}`,
            'info',
          );
        }

        for (const repository of repositories) {
          this.debugLog(`Deleting Ecr ${repository} in region ${region} of account ${account.accountName}`, 'info');
          try {
            await throttlingBackOff(() => ecrClient.send(new DeleteEcr({ repositoryName: repository })));
            this.debugLog(
              `Ecr ${repository} in region ${region} of account ${account.accountName} deleted successfully`,
              'info',
            );
          } catch (RepositoryNotFoundException) {
            this.debugLog(
              `Ecr delete Error, repository NOT FOUND ${repository} in region ${region} of account ${account.accountName}`,
              'info',
            );
          }
        }
      }
    }
  }

  private async deleteAllRemainingCloudWatchLogGroups(
    acceleratorPrefix: string,
    acceleratorQualifier: string,
  ): Promise<void> {
    const assumeRoleName = this.globalConfig?.managementAccountAccessRole || 'AWSControlTowerExecution';
    let cloudWatchLogsClient: CloudWatchLogsClient;

    // Make list of regions for cleanup of stacks, this is required because some stack goes to global region
    const cleanupRegions: string[] = [];
    for (const region of this.globalConfig?.enabledRegions || []) {
      cleanupRegions.push(region);
    }

    if (cleanupRegions.indexOf(this.globalRegion) === -1) {
      cleanupRegions.push(this.globalRegion);
    }

    // let cloudFormationStack: Stack | undefined;
    //Use a loop for all regions
    for (const region of cleanupRegions) {
      for (const account of this.organizationAccounts) {
        if (account.accountId !== this.pipelineManagementAccount?.accountId) {
          const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${account.accountId}:role/${assumeRoleName}`;
          const stsClient = new STSClient({ region: region });
          const assumeRoleCredential = await this.assumeRole(stsClient, roleArn);

          cloudWatchLogsClient = new CloudWatchLogsClient({
            region: region,
            credentials: {
              accessKeyId: assumeRoleCredential.Credentials!.AccessKeyId!,
              secretAccessKey: assumeRoleCredential.Credentials!.SecretAccessKey!,
              sessionToken: assumeRoleCredential.Credentials!.SessionToken,
              expiration: assumeRoleCredential.Credentials!.Expiration,
            },
          });
        } else {
          cloudWatchLogsClient = new CloudWatchLogsClient({ region: region });
        }

        this.debugLog(`Final log groups cleanup started in region ${region} of account ${account}`, 'display');

        let nextToken: string | undefined = undefined;
        const logGroupNames: string[] = [];
        do {
          const page = await throttlingBackOff(() =>
            cloudWatchLogsClient.send(
              new DescribeLogGroupsCommand({
                logGroupNamePrefix: `/aws/codebuild/${acceleratorQualifier}`,
                nextToken: nextToken,
              }),
            ),
          );
          for (const logGroup of page.logGroups ?? []) {
            logGroupNames.push(logGroup.logGroupName!);
          }
          nextToken = page.nextToken;
        } while (nextToken);

        nextToken = undefined;
        do {
          const page = await throttlingBackOff(() =>
            cloudWatchLogsClient.send(
              new DescribeLogGroupsCommand({
                logGroupNamePrefix: `/aws/lambda/${acceleratorQualifier}`,
                nextToken: nextToken,
              }),
            ),
          );
          for (const logGroup of page.logGroups ?? []) {
            logGroupNames.push(logGroup.logGroupName!);
          }
          nextToken = page.nextToken;
        } while (nextToken);

        // Add /AWSAccelerator-SecurityHub log groups for deletion
        logGroupNames.push(`/${acceleratorPrefix}-SecurityHub`);

        for (const logGroupName of logGroupNames) {
          this.debugLog(
            `Deleting Cloudwatch Log group ${logGroupName} in region ${region} of account ${account}`,
            'info',
          );
          try {
            await throttlingBackOff(() =>
              cloudWatchLogsClient.send(new DeleteLogGroupCommand({ logGroupName: logGroupName })),
            );
          } catch (ResourceNotFoundException) {
            this.debugLog(
              `Cloudwatch Log group delete Error Log Group NOT FOUND ${logGroupName} in region ${region} of account ${account}`,
              'info',
            );
          }
        }

        // cleanup the
        logGroupNames.length = 0;
        this.debugLog(`Log groups cleanup completed in region ${region} of account ${account}`, 'display');
      }
    }
  }
}

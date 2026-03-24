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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as winston from 'winston';

import { GlobalConfig, OrganizationConfig, AccountsConfig } from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils/lib/logger';
import { throttlingBackOff } from '@aws-accelerator/utils/lib/throttle';
import { getGlobalRegion } from '@aws-accelerator/utils/lib/common-functions';
import { BackupClient, DeleteBackupVaultCommand } from '@aws-sdk/client-backup';
import {
  CloudFormationClient,
  DeleteStackCommand,
  DescribeStacksCommand,
  ListStackResourcesCommand,
  ListStacksCommand,
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
import { DeregisterTaskDefinitionCommand, ECSClient, ListTasksCommand, StopTaskCommand } from '@aws-sdk/client-ecs';
import {
  DetachRolePolicyCommand,
  IAMClient,
  ListAttachedRolePoliciesCommand,
  ListEntitiesForPolicyCommand,
} from '@aws-sdk/client-iam';
import {
  DescribeKeyCommand,
  DisableKeyCommand,
  KeyState,
  KMSClient,
  ScheduleKeyDeletionCommand,
} from '@aws-sdk/client-kms';
import {
  AccountStatus,
  ListAccountsCommand,
  ListParentsCommand,
  DescribeOrganizationalUnitCommand,
  OrganizationsClient,
} from '@aws-sdk/client-organizations';
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
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
import { ConfigServiceClient, DescribeConfigRulesCommand } from '@aws-sdk/client-config-service';
import { DeleteParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import AdmZip, { IZipEntry } from 'adm-zip';

import { AcceleratorV2Stacks } from '../../../accelerator/lib/accelerator';

/**
 * Enum to identify the type of installer stack deployment
 */
enum InstallerStackType {
  CODEPIPELINE = 'codepipeline',
  CONTAINER = 'container',
}

/**
 * Container deployment configuration extracted from the InstallerContainerStack
 */
interface ContainerDeploymentConfig {
  /**
   * Qualifier used for resource naming in external pipeline deployments.
   * Empty string when running in single-account (non-external) mode.
   */
  acceleratorQualifier: string;
  acceleratorPrefix: string;
  /**
   * The oneWordPrefix derived from acceleratorPrefix, matching the logic in
   * the installer-container-stack's ResourceNamePrefixes custom resource.
   * e.g. 'AWSAccelerator' -> 'accelerator', custom prefix -> as-is.
   */
  oneWordPrefix: string;
  /**
   * Management account ID. Empty when running in single-account mode
   * (i.e. the executing account IS the management account).
   */
  managementAccountId: string;
  managementAccountRoleName: string;
  /**
   * Whether this is an external pipeline deployment (qualifier-based).
   */
  isExternalPipeline: boolean;
  ecsClusterArn: string | undefined;
  taskDefinitionArn: string | undefined;
}

/**
 * Type for pipeline stage action information with order and action name
 */
type stageActionType = { order: number; name: string; stackPrefix: string; hasV2Stacks?: boolean };

/**
 * Pipeline Stack Type
 */
type pipelineStackType = {
  stageOrder: number;
  order: number;
  stackName: string;
  hasV2Stacks?: boolean;
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
  hasV2Stacks?: boolean;
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
  readonly configPath?: string;
}

/**
 * LZARepository Properties
 */
export interface LzaRepositoryProps {
  repositoryName?: string;
  branch?: string;
  bucketName?: string;
  objectKey?: string;
  provider: string;
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
  private pipelineConfigSourceRepo: LzaRepositoryProps | undefined;

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
   *
   */
  private accountStacks: string[] = [];

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
        { order: 6, name: 'Customizations', stackPrefix: '-ResourcePolicyEnforcementStack' },
        { order: 5, name: 'Network_Associations', stackPrefix: '-NetworkAssociationsStack' },
        { order: 5, name: 'Network_Associations', stackPrefix: '-NetworkAssociationsGwlbStack' },
        { order: 2, name: 'Security_Resources', stackPrefix: '-SecurityResourcesStack' },
        { order: 2, name: 'Security_Resources', stackPrefix: '-SecurityGuardDutyS3MalwareStack' },
        { order: 2, name: 'Identity_Center', stackPrefix: '-IdentityCenterStack' },
        { order: 4, name: 'Network_VPCs', stackPrefix: '-NetworkVpcDnsStack' },
        { order: 3, name: 'Network_VPCs', stackPrefix: '-NetworkVpcEndpointsStack' },
        { order: 2, name: 'Network_VPCs', stackPrefix: '-NetworkVpcStack', hasV2Stacks: true },
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
   * List of IAM roles to have policies detached prior to stack deletion
   */
  private iamRoles: { client: IAMClient; stackName: string; roleName: string }[] = [];

  /**
   * List of IAM policies to be detached prior to stack deletion
   */
  private iamPolicies: { client: IAMClient; stackName: string; policyName: string }[] = [];

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
   * Saved AWS_PROFILE value, stored before clearing it during management account
   * credential assumption so it can be restored when credentials are reset.
   * @private
   */
  private savedAwsProfile: string | undefined;

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
    this.globalRegion = getGlobalRegion(this.acceleratorToolProps.partition);

    // Get executing account ID
    const response = await throttlingBackOff(() => new STSClient({}).send(new GetCallerIdentityCommand({})));
    this.executingAccountId = response.Account;

    // Detect installer stack type (CodePipeline vs Container)
    const stackType = await AcceleratorTool.detectInstallerStackType(installerStackName);
    if (stackType === InstallerStackType.CONTAINER) {
      return this.uninstallContainerAccelerator(installerStackName);
    }

    // CodePipeline-based deployment path (existing behavior)
    // Get installer pipeline
    const installerPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(installerStackName);
    if (!installerPipeline.status) {
      this.debugLog(`${installerPipeline.pipelineName}`, 'info');
      this.logger.error(`${installerPipeline.pipelineName} doesn't exist, cannot continue`);
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
    let diagnosticsPackStackNamePrefix = `${acceleratorPrefix}-DiagnosticsPackStack`;

    // Name resources based on qualifier
    if (isQualifierUsed) {
      acceleratorPipelineStackNamePrefix = `${acceleratorQualifier}-pipeline-stack`;
      acceleratorPipelineName = `${acceleratorQualifier}-pipeline`;
      testerStackNamePrefix = `${acceleratorQualifier}-tester-stack`;
      testerPipelineStackNamePrefix = `${acceleratorQualifier}-tester-pipeline-stack`;
      diagnosticsPackStackNamePrefix = `${acceleratorQualifier}-DiagnosticsPackStack`;
      testerPipelineConfigRepositoryName = `${acceleratorQualifier}-test-config`;
    }

    //Delete accelerator target cloudformation stacks
    await this.deletePipelineCloudFormationStacks(acceleratorPrefix, acceleratorPipelineName);

    // remaining cleanup is required when fullDestroy or deleteAccelerator option used
    if (this.acceleratorToolProps.fullDestroy || this.acceleratorToolProps.deleteAccelerator) {
      if (this.externalPipelineAccount.isUsed) {
        // Installer and Tester stack resource cleanup takes place in pipeline or management account, so reset the credential settings
        this.resetCredentialEnvironment();
      }

      // Delete tester stack
      await this.deletePipelineAccountStack(testerStackNamePrefix);

      // Delete Diagnostics pack stack
      await this.deletePipelineAccountStack(diagnosticsPackStackNamePrefix);

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
  private resetCredentialEnvironment() {
    //reset credential variables
    delete process.env['AWS_ACCESS_KEY_ID'];
    delete process.env['AWS_ACCESS_KEY'];
    delete process.env['AWS_SECRET_KEY'];
    delete process.env['AWS_SECRET_ACCESS_KEY'];
    delete process.env['AWS_SESSION_TOKEN'];

    // Restore the original AWS_PROFILE so the SDK can authenticate
    // as the original caller (e.g. orchestration account) for local operations
    if (this.savedAwsProfile) {
      process.env['AWS_PROFILE'] = this.savedAwsProfile;
    }
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

    await this.queryAccountStacks(acceleratorPrefix);

    for (const stack of this.acceleratorCloudFormationStacks) {
      await this.deleteStacks(acceleratorPrefix, stack.stackName, stack.hasV2Stacks);
    }
  }

  /**
   * Private async function to initialize required properties to perform accelerator cleanup
   * @private
   */
  private async initPipeline(acceleratorPrefix: string, pipelineName: string): Promise<void> {
    this.logger.info(`Pipeline name: ${pipelineName}`);
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

    const acceleratorPipeline =
      await AcceleratorTool.getPipelineNameFromCloudFormationStack(acceleratorPipelineStackName);

    if (
      acceleratorPipeline.status &&
      (await AcceleratorTool.isConfigRepositoryCreatedByAccelerator(acceleratorPipelineStackName))
    ) {
      await this.deleteLzaRepository(this.pipelineConfigSourceRepo!);

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
    // Build ignored OU set and account-to-OU map when configPath is available
    let ignoredOuNames: Set<string> = new Set();
    let accountOuMap: Map<string, string> = new Map();

    if (this.acceleratorToolProps.configPath) {
      try {
        this.logger.info(`Loading OU-ignore configuration from ${this.acceleratorToolProps.configPath}`);
        const orgConfig = OrganizationConfig.loadRawOrganizationsConfig(this.acceleratorToolProps.configPath);
        const accountsConfig = AccountsConfig.load(this.acceleratorToolProps.configPath);

        const ignoredOus = orgConfig.getIgnoredOus();
        ignoredOuNames = new Set(ignoredOus.map(ou => ou.name));
        // Key by email (lowercased) since config logical names may differ from AWS account display names
        accountOuMap = new Map(accountsConfig.getAccounts().map(a => [a.email.toLowerCase(), a.organizationalUnit]));
        this.logger.info(
          `OU-ignore filtering active: ${ignoredOuNames.size} ignored OU(s) [${[...ignoredOuNames].join(', ')}], ${accountOuMap.size} account(s) mapped`,
        );
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        this.logger.error(`Failed to load config for OU-ignore filtering, falling back to no filtering: ${e.message}`);
        ignoredOuNames = new Set();
        accountOuMap = new Map();
      }
    } else {
      this.logger.warn('OU-ignore filtering is unavailable because configPath is not defined');
    }

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
        if (account.Status == AccountStatus.SUSPENDED) {
          this.logger.error(`Account ${account.Name} (${account.Email}) is suspended, will not be cleaned up`);
          continue;
        }
        if (account.Id && account.Name) {
          // OU-ignore filtering
          if (ignoredOuNames.size > 0) {
            let accountOu = accountOuMap.get(account.Email?.toLowerCase() ?? '');
            // If account is not in AccountsConfig, query Organizations API for its parent OU
            if (!accountOu) {
              try {
                const parentsResponse = await throttlingBackOff(() =>
                  organizationsClient.send(new ListParentsCommand({ ChildId: account.Id })),
                );
                const parentId = parentsResponse.Parents?.[0]?.Id;
                if (parentId && parentId.startsWith('ou-')) {
                  const ouResponse = await throttlingBackOff(() =>
                    organizationsClient.send(new DescribeOrganizationalUnitCommand({ OrganizationalUnitId: parentId })),
                  );
                  accountOu = ouResponse.OrganizationalUnit?.Name;
                }
              } catch (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                e: any
              ) {
                this.logger.debug(
                  `Could not resolve OU for account ${account.Name} (${account.Id}) via Organizations API: ${e.message}`,
                );
              }
            }
            if (accountOu && ignoredOuNames.has(accountOu)) {
              this.logger.warn(
                `Skipping account ${account.Name} (${account.Id}) because its OU '${accountOu}' is marked as ignored`,
              );
              continue;
            }
          }
          accountIds.push({ accountName: account.Name, accountId: account.Id });
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    this.logger.info(
      `Organization account list built: ${accountIds.length} account(s) after filtering [${accountIds.map(a => `${a.accountName}(${a.accountId})`).join(', ')}]`,
    );
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
        pipelineCloudFormationStacks.push({
          stageOrder: stage.order,
          order: action.order,
          stackName: `${acceleratorPrefix}${action.stackPrefix}`,
          hasV2Stacks: action.hasV2Stacks,
        });
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

    // Remove AWS_PROFILE so the SDK uses the explicit credentials above
    // instead of the profile, which would resolve back to the original caller identity
    this.savedAwsProfile = process.env['AWS_PROFILE'];
    delete process.env['AWS_PROFILE'];
    delete process.env['AWS_DEFAULT_PROFILE'];

    return assumeRoleCredential.Credentials;
  }

  /**
   * Function to get GlobalConfig object from the repo content
   * @private
   */
  private async getGlobalConfig(): Promise<GlobalConfig> {
    // If configPath is provided, use local files instead of downloading from repository
    if (this.acceleratorToolProps.configPath) {
      this.logger.info(`Using local config path: ${this.acceleratorToolProps.configPath}`);
      return GlobalConfig.loadRawGlobalConfig(this.acceleratorToolProps.configPath);
    }

    this.logger.info(`Config Repository Name:  ${this.pipelineConfigSourceRepo?.repositoryName}`);
    let fileContent: string;
    if (this.pipelineConfigSourceRepo?.provider.toLocaleLowerCase() === 'codecommit') {
      const codeCommitClient = new CodeCommitClient({});
      const response = await throttlingBackOff(() =>
        codeCommitClient.send(
          new GetFileCommand({
            repositoryName: this.pipelineConfigSourceRepo!.repositoryName,
            filePath: 'global-config.yaml',
          }),
        ),
      );
      if (response.fileContent) {
        fileContent = new TextDecoder().decode(response.fileContent);
      } else {
        throw new Error('Error retrieving global-config.yaml from the CodeCommit repository');
      }
    } else {
      const tempFilePath = await this.getZipFileFromS3(
        new S3Client({}),
        this.pipelineConfigSourceRepo!.bucketName!,
        this.pipelineConfigSourceRepo!.objectKey!,
      );
      const admZipInstance = new AdmZip(tempFilePath);
      const zipEntries = admZipInstance.getEntries();

      zipEntries.forEach((zipEntry: IZipEntry) => {
        if (!zipEntry.isDirectory) {
          this.debugLog(`Reading file: ${zipEntry.entryName}`, 'info');
          if (zipEntry.entryName === 'global-config.yaml') {
            fileContent = admZipInstance.readAsText(zipEntry);
          }
        }
      });
      fs.unlinkSync(tempFilePath);
    }

    const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'accel-config'));
    fs.writeFileSync(path.join(tempDirPath, 'global-config.yaml'), fileContent!, 'utf8');
    return GlobalConfig.loadRawGlobalConfig(tempDirPath);
  }

  /**
   * Function to get list of managed policies which are assigned to IAM roles by SSM automation accelerator-ec2-instance-profile-permission
   * @returns
   */
  private async getSsmManagedPolicies(): Promise<string[]> {
    //Get the actual values from the Config rule (not the securityConfig) to make sure we are getting the resolved ${ACCEL_LOOKUP} values.
    const policies: string[] = [];
    const configClient = new ConfigServiceClient({});

    try {
      const response = await throttlingBackOff(() =>
        configClient.send(
          new DescribeConfigRulesCommand({
            ConfigRuleNames: ['accelerator-ec2-instance-profile-permission'],
          }),
        ),
      );

      //If rule not implemented, return empty array.
      if (typeof response.ConfigRules![0] == 'undefined') {
        return [];
      }

      //else, get inputParameters from the Config rule
      const configRule = response.ConfigRules![0];
      const inputParameters = configRule.InputParameters;
      if (typeof inputParameters == 'undefined') {
        return [];
      }

      for (const [key, value] of Object.entries(JSON.parse(inputParameters))) {
        if (key === 'AWSManagedPolicies' || key === 'CustomerManagedPolicies') {
          policies.push(...(value as string).split(','));
        }
      }
    } catch (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      e: any
    ) {
      this.debugLog(e, 'error');
    }

    return policies;
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
   * Function to retrieve the zip repo from S3
   * @param s3Client
   * @param stackName
   * @param bucketName
   * @private
   */
  private async getZipFileFromS3(s3Client: S3Client, configBucketName: string, s3ConfigObjectKey: string) {
    let zipFile;
    try {
      const response = await throttlingBackOff(() =>
        s3Client.send(
          new GetObjectCommand({
            Bucket: configBucketName,
            Key: s3ConfigObjectKey,
          }),
        ),
      );
      zipFile = response.Body;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      this.logger.error('Failed to retreive configuration from S3', e.message);
      this.logger.error('ConfigBucketName:', configBucketName);
      this.logger.error('s3ConfigObjectKey:', s3ConfigObjectKey);
    }

    if (!zipFile) {
      throw new Error('Failed to download the configuration file from S3.');
    }
    const tempFilePath = `/tmp/${s3ConfigObjectKey.split('/').pop()}`;
    await fs.promises.writeFile(tempFilePath, await zipFile.transformToByteArray());

    return tempFilePath;
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (ResourceNotFoundException) {
      this.debugLog(
        `Cloudwatch Log group delete Error Log Group NOT FOUND ${logGroupName} from ${stackName} stack`,
        'info',
      );
    }
    return true;
  }

  private async removeSsmManagedPolicies(): Promise<void> {
    // get SsmManagedPolicies onces
    const ssmManagedPolicies = await this.getSsmManagedPolicies();

    for (const item of this.iamRoles) {
      this.debugLog(`Deleting IAM Role ${item.roleName} from ${item.stackName} stack`, 'info');
      try {
        // Get managed policies
        const listAttachedRolePoliciesResponse = await throttlingBackOff(() =>
          item.client.send(new ListAttachedRolePoliciesCommand({ RoleName: item.roleName })),
        );

        //Delete managed policies
        for (const policy of listAttachedRolePoliciesResponse.AttachedPolicies!) {
          if (ssmManagedPolicies.indexOf(policy.PolicyName!) !== -1) {
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

  private async detachPoliciesFromRole(): Promise<void> {
    for (const item of this.iamPolicies) {
      this.debugLog(`Detaching IAM policy ${item.policyName} from ${item.stackName} stack`, 'info');

      try {
        // Get roles with this policy attached
        const listEntitiesForPolicyResponse = await throttlingBackOff(() =>
          item.client.send(new ListEntitiesForPolicyCommand({ PolicyArn: item.policyName })),
        );
        //Detach policy from roles
        for (const role of listEntitiesForPolicyResponse.PolicyRoles!) {
          this.debugLog(
            `Detaching policy ${item.policyName} from role ${role.RoleName} from ${item.stackName} stack`,
            'info',
          );
          await throttlingBackOff(() =>
            item.client.send(new DetachRolePolicyCommand({ RoleName: role.RoleName, PolicyArn: item.policyName })),
          );
        }
      } catch (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e: any
      ) {
        if (e.name === 'NoSuchEntity') {
          this.debugLog(`IAM Policy ${item.policyName} from ${item.stackName} stack not found !!`, 'info');
        }
      }
    }
    this.iamPolicies = [];
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            `KMS Key ${kmsKeyId} from ${stackName} stack in ${keyStatus.KeyMetadata?.KeyState} status, can not schedule deletion`,
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
   * Detect whether the installer stack is a CodePipeline-based or container-based deployment
   * by inspecting the stack's resources.
   * @param stackName
   * @private
   */
  private static async detectInstallerStackType(stackName: string): Promise<InstallerStackType> {
    try {
      const cloudformationClient = new CloudFormationClient({});
      let nextToken: string | undefined = undefined;
      do {
        const page = await throttlingBackOff(() =>
          cloudformationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
        );
        for (const resource of page.StackResourceSummaries ?? []) {
          if (resource.ResourceType === 'AWS::CodePipeline::Pipeline') {
            return InstallerStackType.CODEPIPELINE;
          }
          if (resource.ResourceType === 'AWS::ECS::Cluster') {
            return InstallerStackType.CONTAINER;
          }
        }
        nextToken = page.NextToken;
      } while (nextToken);
    } catch (error) {
      throw new Error(`[uninstaller] Failed to detect installer stack type for ${stackName}: ${error}`);
    }
    throw new Error(
      `[uninstaller] Unable to determine installer stack type for ${stackName}. ` +
        `Stack does not contain AWS::CodePipeline::Pipeline or AWS::ECS::Cluster resources.`,
    );
  }

  /**
   * Extract container deployment configuration from the InstallerContainerStack.
   * Reads SSM parameters and stack parameters to determine the qualifier, prefix,
   * and management account details.
   * @param stackName
   * @private
   */
  private async getContainerDeploymentConfig(stackName: string): Promise<ContainerDeploymentConfig> {
    const cloudformationClient = new CloudFormationClient({});

    // Get stack parameters
    const describeResponse = await throttlingBackOff(() =>
      cloudformationClient.send(new DescribeStacksCommand({ StackName: stackName })),
    );
    const stack = describeResponse.Stacks?.[0];
    if (!stack) {
      throw new Error(`[uninstaller] Container installer stack ${stackName} not found`);
    }

    let acceleratorQualifier = '';
    let acceleratorPrefix = 'AWSAccelerator';
    let managementAccountId = '';
    let managementAccountRoleName = '';

    for (const param of stack.Parameters ?? []) {
      switch (param.ParameterKey) {
        case 'AcceleratorQualifier':
          acceleratorQualifier = param.ParameterValue ?? '';
          break;
        case 'AcceleratorPrefix':
          acceleratorPrefix = param.ParameterValue ?? 'AWSAccelerator';
          break;
        case 'ManagementAccountId':
          managementAccountId = param.ParameterValue ?? '';
          break;
        case 'ManagementAccountRoleName':
          managementAccountRoleName = param.ParameterValue ?? '';
          break;
      }
    }

    // Derive oneWordPrefix using the same logic as the installer-container-stack's
    // ResourceNamePrefixes custom resource: AWSAccelerator -> accelerator, else as-is
    const lowerCasePrefix = acceleratorPrefix.toLowerCase();
    const oneWordPrefix = lowerCasePrefix === 'awsaccelerator' ? 'accelerator' : acceleratorPrefix;

    // AcceleratorQualifier is only present for external pipeline deployments.
    // For single-account deployments, the qualifier is empty and SSM paths
    // use /{oneWordPrefix}/{stackName}/... instead of /{oneWordPrefix}/{qualifier}/...
    const isExternalPipeline = !!acceleratorQualifier;

    // Get ECS cluster and task definition ARNs from stack resources
    let ecsClusterArn: string | undefined;
    let taskDefinitionArn: string | undefined;
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cloudformationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
      );
      for (const resource of page.StackResourceSummaries ?? []) {
        if (resource.ResourceType === 'AWS::ECS::Cluster') {
          ecsClusterArn = resource.PhysicalResourceId;
        }
        if (resource.ResourceType === 'AWS::ECS::TaskDefinition') {
          taskDefinitionArn = resource.PhysicalResourceId;
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    return {
      acceleratorQualifier,
      acceleratorPrefix,
      oneWordPrefix,
      managementAccountId,
      managementAccountRoleName,
      isExternalPipeline,
      ecsClusterArn,
      taskDefinitionArn,
    };
  }

  /**
   * Stop all running ECS tasks in the container deployment cluster and
   * deregister the task definition.
   * @param config Container deployment configuration
   * @private
   */
  private async cleanupEcsResources(config: ContainerDeploymentConfig): Promise<void> {
    if (!config.ecsClusterArn) {
      this.debugLog('No ECS cluster found in container stack, skipping ECS cleanup', 'info');
      return;
    }

    const ecsClient = new ECSClient({});

    // Stop any running tasks
    this.debugLog(`Stopping running ECS tasks in cluster ${config.ecsClusterArn}`, 'display');
    try {
      let nextToken: string | undefined = undefined;
      do {
        const listResponse = await throttlingBackOff(() =>
          ecsClient.send(
            new ListTasksCommand({
              cluster: config.ecsClusterArn,
              desiredStatus: 'RUNNING',
              nextToken: nextToken,
            }),
          ),
        );
        for (const taskArn of listResponse.taskArns ?? []) {
          this.debugLog(`Stopping ECS task ${taskArn}`, 'info');
          await throttlingBackOff(() =>
            ecsClient.send(
              new StopTaskCommand({
                cluster: config.ecsClusterArn,
                task: taskArn,
                reason: 'LZA uninstaller cleanup',
              }),
            ),
          );
        }
        nextToken = listResponse.nextToken;
      } while (nextToken);
    } catch (error) {
      this.debugLog(`Error stopping ECS tasks: ${error}`, 'warn');
    }

    // Wait for tasks to stop
    if (config.ecsClusterArn) {
      this.debugLog('Waiting for ECS tasks to stop...', 'info');
      await this.waitForEcsTasksToStop(ecsClient, config.ecsClusterArn);
    }

    // Deregister task definition
    if (config.taskDefinitionArn) {
      this.debugLog(`Deregistering task definition ${config.taskDefinitionArn}`, 'info');
      try {
        await throttlingBackOff(() =>
          ecsClient.send(
            new DeregisterTaskDefinitionCommand({
              taskDefinition: config.taskDefinitionArn,
            }),
          ),
        );
      } catch (error) {
        this.debugLog(`Error deregistering task definition: ${error}`, 'warn');
      }
    }
  }

  /**
   * Wait for all tasks in an ECS cluster to reach STOPPED status.
   * @param ecsClient
   * @param clusterArn
   * @private
   */
  private async waitForEcsTasksToStop(ecsClient: ECSClient, clusterArn: string): Promise<void> {
    const maxWaitTimeMs = 5 * 60 * 1000; // 5 minutes
    const pollIntervalMs = 10 * 1000; // 10 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTimeMs) {
      const listResponse = await throttlingBackOff(() =>
        ecsClient.send(
          new ListTasksCommand({
            cluster: clusterArn,
            desiredStatus: 'RUNNING',
          }),
        ),
      );

      if (!listResponse.taskArns || listResponse.taskArns.length === 0) {
        this.debugLog('All ECS tasks have stopped', 'info');
        return;
      }

      this.debugLog(`Waiting for ${listResponse.taskArns.length} ECS task(s) to stop...`, 'info');
      await this.delay(pollIntervalMs);
    }

    this.logger.warn('[uninstaller] Timed out waiting for ECS tasks to stop, proceeding with cleanup');
  }

  /**
   * Delete SSM parameters created by the container deployment stack.
   * These parameters use the qualifier-based naming convention.
   * @param config Container deployment configuration
   * @param installerStackName
   * @private
   */
  private async cleanupContainerSsmParameters(
    config: ContainerDeploymentConfig,
    installerStackName: string,
  ): Promise<void> {
    const ssmClient = new SSMClient({});

    const owp = config.oneWordPrefix;

    // SSM parameter paths differ based on whether this is an external pipeline deployment.
    // External pipeline: /{oneWordPrefix}/{qualifier}/{stackName}/...
    // Single-account:    /{oneWordPrefix}/{stackName}/...
    const parameterPaths: string[] = [];
    if (config.isExternalPipeline) {
      const q = config.acceleratorQualifier;
      parameterPaths.push(
        `/${owp}/${q}/${installerStackName}/stack-id`,
        `/${owp}/${q}/${installerStackName}/version`,
        `/${owp}/${q}/installer/kms/key-arn`,
        `/${owp}/${q}/installer-access-logs-bucket-name`,
        `/${owp}/${q}/lza-prefix`,
      );
    } else {
      parameterPaths.push(
        `/${owp}/${installerStackName}/stack-id`,
        `/${owp}/${installerStackName}/version`,
        `/${owp}/installer/kms/key-arn`,
        `/${owp}/installer-access-logs-bucket-name`,
      );
    }

    // Also try the lza-prefix parameter which may exist at a different path
    parameterPaths.push(`/${owp}/lza-prefix`);

    for (const paramName of parameterPaths) {
      this.debugLog(`Deleting SSM parameter: ${paramName}`, 'info');
      try {
        await throttlingBackOff(() => ssmClient.send(new DeleteParameterCommand({ Name: paramName })));
      } catch (error) {
        // Parameter may not exist, that's fine
        this.debugLog(`SSM parameter ${paramName} not found or already deleted: ${error}`, 'info');
      }
    }
  }

  /**
   * Main entry point for uninstalling a container-based LZA deployment.
   * This handles the full teardown of the InstallerContainerStack and all
   * LZA-deployed resources across accounts and regions.
   * @param installerStackName
   * @private
   */
  private async uninstallContainerAccelerator(installerStackName: string): Promise<boolean> {
    this.logger.info(`[uninstaller] Detected container-based deployment: ${installerStackName}`);

    // Extract configuration from the container stack
    const containerConfig = await this.getContainerDeploymentConfig(installerStackName);
    this.logger.info(`[uninstaller] Accelerator Prefix: ${containerConfig.acceleratorPrefix}`);
    this.logger.info(`[uninstaller] One-word Prefix: ${containerConfig.oneWordPrefix}`);
    this.logger.info(`[uninstaller] External Pipeline: ${containerConfig.isExternalPipeline}`);
    if (containerConfig.isExternalPipeline) {
      this.logger.info(`[uninstaller] Accelerator Qualifier: ${containerConfig.acceleratorQualifier}`);
      this.logger.info(`[uninstaller] Management Account ID: ${containerConfig.managementAccountId}`);
    }

    const acceleratorPrefix = containerConfig.acceleratorPrefix;

    // For external pipeline deployments, resources are named with the qualifier.
    // For single-account deployments, resources use the prefix (same as CodePipeline path).
    const isQualifierUsed = containerConfig.isExternalPipeline;
    const acceleratorQualifier = isQualifierUsed ? containerConfig.acceleratorQualifier : acceleratorPrefix;

    let acceleratorPipelineStackNamePrefix: string;
    if (isQualifierUsed) {
      acceleratorPipelineStackNamePrefix = `${containerConfig.acceleratorQualifier}-pipeline-stack`;
    } else {
      acceleratorPipelineStackNamePrefix = `${acceleratorPrefix}-PipelineStack`;
    }

    // Set up account context based on deployment type
    if (
      containerConfig.isExternalPipeline &&
      containerConfig.managementAccountId &&
      containerConfig.managementAccountRoleName
    ) {
      // External pipeline: orchestration account differs from management account
      if (this.executingAccountId !== containerConfig.managementAccountId) {
        this.externalPipelineAccount = { isUsed: true, accountId: this.executingAccountId };

        // Get management account credentials for cross-account operations
        this.pipelineManagementAccount = {
          accountId: containerConfig.managementAccountId,
          assumeRoleName: containerConfig.managementAccountRoleName,
          credentials: await this.getManagementAccountCredentials(
            containerConfig.managementAccountId,
            containerConfig.managementAccountRoleName,
          ),
        };
      } else {
        this.externalPipelineAccount = { isUsed: false, accountId: containerConfig.managementAccountId };
        this.pipelineManagementAccount = {
          accountId: this.executingAccountId!,
          assumeRoleName: undefined,
          credentials: undefined,
        };
      }
    } else {
      // Single-account deployment: executing account IS the management account
      this.externalPipelineAccount = { isUsed: false, accountId: this.executingAccountId };
      this.pipelineManagementAccount = {
        accountId: this.executingAccountId!,
        assumeRoleName: undefined,
        credentials: undefined,
      };
    }

    // Load global config for region and account discovery
    // Container deployments store config in S3, so configPath must be provided
    if (this.acceleratorToolProps.configPath) {
      this.globalConfig = await this.getGlobalConfig();
    } else {
      // Attempt to find the config bucket from the stack resources
      this.logger.info(
        '[uninstaller] No --config-path provided. Attempting to discover config from container stack resources.',
      );
      const configBucketName = await this.getContainerConfigBucketName(installerStackName, containerConfig);
      if (configBucketName) {
        // For external pipeline, config zip is stored under qualifier prefix.
        // For single-account, it is stored under 'lza/' prefix.
        const objectKey = isQualifierUsed
          ? `${containerConfig.acceleratorQualifier}/aws-accelerator-config.zip`
          : 'lza/aws-accelerator-config.zip';
        this.pipelineConfigSourceRepo = {
          provider: 's3',
          bucketName: configBucketName,
          objectKey,
        };
        try {
          this.globalConfig = await this.getGlobalConfig();
        } catch (error) {
          this.logger.warn(
            `[uninstaller] Failed to load global config from S3 bucket ${configBucketName}: ${error}. ` +
              'The config bucket may have been deleted by a previous run. Continuing with default region settings.',
          );
        }
      } else {
        this.logger.warn(
          '[uninstaller] Could not discover config bucket. Using default region settings. ' +
            'Provide --config-path for complete cleanup across all regions.',
        );
      }
    }

    // Get organization accounts for cross-account cleanup
    this.organizationAccounts = await this.getOrganizationAccountList();

    // Build the list of LZA CloudFormation stacks to delete
    this.acceleratorCloudFormationStacks = this.getPipelineCloudFormationStacks(acceleratorPrefix);

    // Query account stacks across all accounts and regions
    await this.queryAccountStacks(acceleratorPrefix);

    // Delete LZA-deployed CloudFormation stacks across all accounts
    for (const stack of this.acceleratorCloudFormationStacks) {
      await this.deleteStacks(acceleratorPrefix, stack.stackName, stack.hasV2Stacks);
    }

    // Remaining cleanup for fullDestroy or deleteAccelerator
    if (this.acceleratorToolProps.fullDestroy || this.acceleratorToolProps.deleteAccelerator) {
      if (this.externalPipelineAccount.isUsed) {
        this.resetCredentialEnvironment();
      }

      // Delete pipeline stack if it exists (container deployments may still have one)
      if (!this.acceleratorToolProps.keepPipelineAndConfig) {
        await this.deleteAcceleratorPipelineStack(acceleratorPipelineStackNamePrefix);
      }

      // Full destroy: clean up the container installer stack and all associated resources
      if (this.acceleratorToolProps.fullDestroy) {
        // Stop running ECS tasks and deregister task definitions before stack deletion
        await this.cleanupEcsResources(containerConfig);

        // Prepare retained resources (S3 buckets, KMS keys) for deletion
        await this.prepareContainerStackForDelete(installerStackName);

        // Delete the container installer CloudFormation stack
        await this.deleteStack(new CloudFormationClient({}), installerStackName);

        // Clean up SSM parameters created by the stack's custom resource
        await this.cleanupContainerSsmParameters(containerConfig, installerStackName);

        // Delete bootstrap stack only when not running from external account
        if (!this.externalPipelineAccount.isUsed) {
          await this.deleteStack(new CloudFormationClient({}), `${acceleratorPrefix}-CDKToolkit`);
        }

        // Final cleanup: CWL logs and ECRs that get recreated post-stack deletion
        try {
          await this.finalCleanup(acceleratorPrefix, acceleratorQualifier);
        } catch (error) {
          this.logger.warn(
            `[uninstaller] Final cleanup partially failed: ${error}. ` +
              'Cross-account roles may have been deleted. Local account cleanup completed.',
          );
        }
      }
    }

    return true;
  }

  /**
   * Get the config S3 bucket name from the container stack resources.
   * @param stackName
   * @param config
   * @private
   */
  private async getContainerConfigBucketName(
    stackName: string,
    config: ContainerDeploymentConfig,
  ): Promise<string | undefined> {
    const cloudformationClient = new CloudFormationClient({});
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cloudformationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
      );
      for (const resource of page.StackResourceSummaries ?? []) {
        if (resource.LogicalResourceId === 'ConfigBucket' && resource.ResourceType === 'AWS::S3::Bucket') {
          return resource.PhysicalResourceId;
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);

    // Fallback: construct the expected bucket name
    // External pipeline: {qualifier}-config-{account}-{region}
    // Single-account: {lowerCasePrefix}-config-{account}-{region}
    const region = process.env['AWS_REGION'] || process.env['AWS_DEFAULT_REGION'];
    if (!region) {
      this.logger.warn('[uninstaller] AWS_REGION not set, defaulting to us-east-1 for config bucket name construction');
    }
    const fallbackRegion = region || 'us-east-1';
    if (config.isExternalPipeline) {
      return `${config.acceleratorQualifier}-config-${this.executingAccountId}-${fallbackRegion}`;
    }
    const lowerCasePrefix = config.acceleratorPrefix.toLowerCase();
    const bucketPrefix = lowerCasePrefix === 'awsaccelerator' ? 'aws-accelerator' : lowerCasePrefix;
    return `${bucketPrefix}-config-${this.executingAccountId}-${fallbackRegion}`;
  }

  /**
   * Prepare container stack resources with Retain deletion policy for deletion.
   * This handles S3 buckets and KMS keys that have DeletionPolicy: Retain.
   * @param stackName
   * @private
   */
  private async prepareContainerStackForDelete(stackName: string): Promise<void> {
    const cloudformationClient = new CloudFormationClient({});
    const s3Client = new S3Client({});
    const kmsClient = new KMSClient({});

    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cloudformationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
      );
      for (const resource of page.StackResourceSummaries ?? []) {
        // Empty and delete S3 buckets (unless keep-data is set)
        if (resource.ResourceType === 'AWS::S3::Bucket' && resource.PhysicalResourceId) {
          if (!this.acceleratorToolProps.keepData) {
            this.debugLog(`Preparing S3 bucket for deletion: ${resource.PhysicalResourceId}`, 'info');
            await this.deleteBucket(s3Client, stackName, resource.PhysicalResourceId);
          } else {
            this.debugLog(`Keeping S3 bucket (--keep-data): ${resource.PhysicalResourceId}`, 'info');
          }
        }

        // Schedule KMS key deletion
        if (resource.ResourceType === 'AWS::KMS::Key' && resource.PhysicalResourceId) {
          this.debugLog(`Scheduling KMS key deletion: ${resource.PhysicalResourceId}`, 'info');
          await this.scheduleKeyDeletion(kmsClient, stackName, resource.PhysicalResourceId);
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
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
            // This is needed because roles may have policies added from the 'accelerator-ec2-instance-profile-permission'
            // config rule which will cause stack deletion to fail
            this.iamRoles.push({
              client: iamClient,
              stackName: stackName,
              roleName: stackResourceSummary.PhysicalResourceId!,
            });
            break;
          case 'AWS::IAM::ManagedPolicy':
            // This is needed because the SecurityResources stack creates a policy that can be attached to roles for SSM logging.
            // We have to detach the policy from any roles or the stack will fail to delete the policy.
            this.iamPolicies.push({
              client: iamClient,
              stackName: stackName,
              policyName: stackResourceSummary.PhysicalResourceId!,
            });
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
            `\n\n\nStack ${stackName} failed to delete, ${retryAttempt} times, investigate and fix the issue.

Usually this issue is caused by resources having being deployed into the environment which prevents cloudformation from deleting the stack.
Once it is resolved rerun uninstaller. Additional error details:\n\n\n\n\n\n`,
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
      if (`${error}`.includes(`${stackName} does not exist`)) {
        return 'COMPLETE';
      } else {
        throw error;
      }
    }

    return 'COMPLETE';
  }

  /**
   * Function to parallelize querying account stacks so we only process stacks that exist.
   */
  private async queryAccountStacks(acceleratorPrefix: string): Promise<void> {
    const assumeRoleName = this.globalConfig?.managementAccountAccessRole || 'AWSControlTowerExecution';
    const cleanupRegions: string[] = this.getCleanupRegions();

    const regionPromises: Promise<void>[] = [];

    for (const region of cleanupRegions) {
      regionPromises.push(this.processRegion(region, acceleratorPrefix, assumeRoleName));
    }

    await Promise.all(regionPromises);
  }

  private async processRegion(region: string, acceleratorPrefix: string, assumeRoleName: string): Promise<void> {
    const accountPromises: Promise<void>[] = [];

    for (const account of this.organizationAccounts) {
      if (account.accountId !== this.pipelineManagementAccount?.accountId) {
        accountPromises.push(this.getStacksToDelete(region, account.accountId, acceleratorPrefix, assumeRoleName));
      } else {
        accountPromises.push(this.getStacksToDelete(region, account.accountId, acceleratorPrefix));
      }
    }

    await Promise.all(accountPromises);
  }

  /**
   * Function to query account stacks that are currently deployed.
   */
  private async getStacksToDelete(
    region: string,
    account: string,
    acceleratorPrefix: string,
    assumeRoleName?: string,
  ): Promise<void> {
    this.debugLog(`Building stack list for: ${account} in region ${region}`, 'info');

    let cloudFormationClient: CloudFormationClient;

    if (assumeRoleName) {
      const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${account}:role/${assumeRoleName}`;
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
    } else {
      cloudFormationClient = new CloudFormationClient({ region: region });
    }

    const response = await throttlingBackOff(() => cloudFormationClient.send(new ListStacksCommand({})));

    for (const stack of response.StackSummaries!) {
      if (stack.StackName?.startsWith(acceleratorPrefix) && stack.StackStatus !== StackStatus.DELETE_COMPLETE) {
        this.accountStacks.push(`${stack.StackName}`);
      }
    }
  }

  /**
   * Function to query which regions we need to process.
   */
  private getCleanupRegions(): string[] {
    const cleanupRegions: string[] = [];
    for (const region of this.globalConfig?.enabledRegions || []) {
      cleanupRegions.push(region);
    }

    if (cleanupRegions.indexOf(this.globalRegion) === -1) {
      cleanupRegions.push(this.globalRegion);
    }

    return cleanupRegions;
  }

  /**
   * Function to parallelise deletion cloudformation stack
   * @param stackName
   * @private
   */
  private async deleteStacks(acceleratorPrefix: string, stackName: string, hasV2Stacks?: boolean): Promise<void> {
    const assumeRoleName = this.globalConfig?.managementAccountAccessRole || 'AWSControlTowerExecution';
    const cleanupRegions: string[] = this.getCleanupRegions();

    const regionPromises: Promise<void>[] = [];

    for (const region of cleanupRegions) {
      regionPromises.push(
        this.processRegionsForStackDeletion(region, acceleratorPrefix, stackName, assumeRoleName, hasV2Stacks),
      );
    }

    await Promise.all(regionPromises);
    await this.completeStacksDeletion(acceleratorPrefix);
  }

  private async processRegionsForStackDeletion(
    region: string,
    acceleratorPrefix: string,
    stackName: string,
    assumeRoleName: string,
    hasV2Stacks?: boolean,
  ): Promise<void> {
    const accountPromises: Promise<void>[] = [];

    for (const account of this.organizationAccounts) {
      if (this.accountStacks.includes(`${stackName}-${account.accountId}-${region}`)) {
        accountPromises.push(
          this.processAccountDeleteStacks(
            region,
            account.accountId,
            acceleratorPrefix,
            stackName,
            assumeRoleName,
            hasV2Stacks,
          ),
        );
      }
    }

    await Promise.all(accountPromises);
  }

  /**
   * Function to delete cloudformation stack
   */
  private async processAccountDeleteStacks(
    region: string,
    account: string,
    acceleratorPrefix: string,
    stackName: string,
    assumeRoleName: string,
    hasV2Stacks?: boolean,
  ): Promise<void> {
    let cloudFormationClient: CloudFormationClient;
    let s3Client: S3Client;
    let cloudWatchLogsClient: CloudWatchLogsClient;
    let backupClient: BackupClient;
    let iamClient: IAMClient;
    let kMSClient: KMSClient;
    this.debugLog(`Generating creds for ${account} in ${region}`, 'info');

    if (account !== this.pipelineManagementAccount?.accountId) {
      const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${account}:role/${assumeRoleName}`;
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
      !this.externalPipelineAccount.isUsed &&
      this.globalConfig?.homeRegion === region &&
      stackName === `${acceleratorPrefix}-CDKToolkit` &&
      this.pipelineManagementAccount!.accountId === account &&
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
        stackName: stackName,
        accountID: account,
        region: region,
        hasV2Stacks,
      });
    }
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
   * Function to delete stacks in pipeline account accelerator tester stack
   * @param stackNamePrefix
   * @private
   */
  private async deletePipelineAccountStack(stackNamePrefix: string): Promise<void> {
    const cloudFormationClient = new CloudFormationClient({});
    const stackName = `${stackNamePrefix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    await this.deleteStack(cloudFormationClient, stackName);
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
   * Function to delete LZA configuration repository
   * @param repositoryProps
   * @private
   */
  private async deleteLzaRepository(repositoryProps: LzaRepositoryProps): Promise<void> {
    //Delete config repository
    if (repositoryProps.provider === 'codecommit') {
      await this.deleteCodecommitRepository(new CodeCommitClient({}), repositoryProps.repositoryName!);
    } else {
      // await this.deleteS3Repository();
      await this.deleteBucket(new S3Client({}), 'Prepare', repositoryProps.bucketName!);
    }
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
            bucketName: action.configuration!['S3Bucket'],
            objectKey: action.configuration!['S3ObjectKey'],
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
        this.debugLog(`Scheduling deletion of KMS key ${item.stackName} ${item.key}`, 'info');
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
        this.debugLog(`Deleting backup vault', ${item.stackName} ${item.backup}`, 'display');
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
        this.debugLog(`Deleting log group', ${item.stackName} ${item.logGroup}`, 'display');
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
        this.debugLog(`Deleting bucket', ${item.stackName} ${item.bucket}`, 'display');
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

  private async completeV2NetworkVPcStacksDeletion(acceleratorPrefix: string, item: deleteStacksType): Promise<void> {
    // Maintain the stack order in the array for deletion order
    const v2NetworkVpcStackNamePrefixes = [
      `${acceleratorPrefix}-${AcceleratorV2Stacks.NACLS_STACK}`,
      `${acceleratorPrefix}-${AcceleratorV2Stacks.LB_STACK}`,
      `${acceleratorPrefix}-${AcceleratorV2Stacks.ROUTE_ENTRIES_STACK}`,
      `${acceleratorPrefix}-${AcceleratorV2Stacks.SUBNETS_SHARE_STACK}`,
      `${acceleratorPrefix}-${AcceleratorV2Stacks.SUBNETS_STACK}`,
      `${acceleratorPrefix}-${AcceleratorV2Stacks.SECURITY_GROUPS_STACK}`,
      `${acceleratorPrefix}-${AcceleratorV2Stacks.ROUTE_TABLES_STACK}`,
      `${acceleratorPrefix}-${AcceleratorV2Stacks.VPC_STACK}`,
    ];

    for (const v2NetworkVpcStackNamePrefix of v2NetworkVpcStackNamePrefixes) {
      this.logger.info(
        `Checking stacks with prefix ${v2NetworkVpcStackNamePrefix} is present in ${item.accountID} for ${item.region} region.`,
      );
      for (const accountStack of this.accountStacks) {
        if (accountStack.includes(v2NetworkVpcStackNamePrefix)) {
          const stackExists = await this.validateStackExistence(
            item.clients.cloudFormation,
            accountStack,
            item.accountID,
            item.region,
          );

          if (stackExists) {
            this.logger.info(
              `Found v2 stack ${accountStack}, started deletion in ${item.accountID} for ${item.region} region.`,
            );
            await this.disableStackTermination(item.clients.cloudFormation, accountStack, item.accountID, item.region);

            // Prepare list of resources to be deleted before and after stack deletion
            await this.prepareStackResourcesForDelete(
              accountStack,
              item.clients.cloudFormation,
              item.clients.cloudWatchLogs,
              item.clients.s3,
              item.clients.backup,
              item.clients.kms,
              item.clients.iam,
            );

            await this.cleanupStack(item.clients.cloudFormation, accountStack);
          }
        }
      }
      this.logger.info(
        `Not found stacks with prefix ${v2NetworkVpcStackNamePrefix} in ${item.accountID} for ${item.region} region.`,
      );
    }
  }

  private async completeV2StacksDeletion(
    stackName: string,
    acceleratorPrefix: string,
    item: deleteStacksType,
  ): Promise<void> {
    if (stackName.includes('NetworkVpcStack')) {
      this.logger.info(
        `Started deletion of v2 stacks in ${item.accountID} for ${item.region} region for ${stackName} stack.`,
      );
      await this.completeV2NetworkVPcStacksDeletion(acceleratorPrefix, item);
    }
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

      if (item.hasV2Stacks) {
        this.logger.info(
          `V2 stack flag is ON for stack ${stackName} in ${item.accountID} account for ${item.region} region.`,
        );
        await this.completeV2StacksDeletion(stackName, acceleratorPrefix, item);
      }

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
    // 1. For roles in this stack, remove SsmManagedPolicies that would prevent role deletion
    await this.removeSsmManagedPolicies();
    // 2. For policies in this stack, detach from any roles that would prevent policy deletion
    await this.detachPoliciesFromRole();
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
      const maxRetry = 3;
      if (stackDeleteStatus === 'FAILED') {
        retryAttempt = retryAttempt + 1;
        this.debugLog(
          `Stack ${stackName} deletion status ${stackDeleteStatus}, retry deletion, retry count ${retryAttempt} out of a maximum retry of ${maxRetry}`,
          'display',
        );

        stackDeleteStatus = await this.isStackDeletionCompleted(
          cloudFormationClient,
          stackName,
          retryAttempt,
          maxRetry,
        );
      } else {
        const maxRetry = 10;
        stackDeleteStatus = await this.isStackDeletionCompleted(
          cloudFormationClient,
          stackName,
          retryAttempt,
          maxRetry,
        );
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
          this.logger.info(message);
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

        // Add ECS log groups for container deployments
        // External pipeline: /ecs/{qualifier}-lza-deployment
        // Single-account: /ecs/{lowerCasePrefix}-lza-deployment
        nextToken = undefined;
        do {
          const page = await throttlingBackOff(() =>
            cloudWatchLogsClient.send(
              new DescribeLogGroupsCommand({
                logGroupNamePrefix: `/ecs/${acceleratorQualifier}`,
                nextToken: nextToken,
              }),
            ),
          );
          for (const logGroup of page.logGroups ?? []) {
            logGroupNames.push(logGroup.logGroupName!);
          }
          nextToken = page.nextToken;
        } while (nextToken);

        // Also search for ECS log groups using the lowercase prefix pattern
        // (covers single-account container deployments where qualifier == prefix)
        if (acceleratorPrefix.toLowerCase() !== acceleratorQualifier.toLowerCase()) {
          const lowerPrefix =
            acceleratorPrefix.toLowerCase() === 'awsaccelerator' ? 'aws-accelerator' : acceleratorPrefix.toLowerCase();
          nextToken = undefined;
          do {
            const page = await throttlingBackOff(() =>
              cloudWatchLogsClient.send(
                new DescribeLogGroupsCommand({
                  logGroupNamePrefix: `/ecs/${lowerPrefix}`,
                  nextToken: nextToken,
                }),
              ),
            );
            for (const logGroup of page.logGroups ?? []) {
              if (!logGroupNames.includes(logGroup.logGroupName!)) {
                logGroupNames.push(logGroup.logGroupName!);
              }
            }
            nextToken = page.nextToken;
          } while (nextToken);
        }

        for (const logGroupName of logGroupNames) {
          this.debugLog(
            `Deleting Cloudwatch Log group ${logGroupName} in region ${region} of account ${account}`,
            'info',
          );
          try {
            await throttlingBackOff(() =>
              cloudWatchLogsClient.send(new DeleteLogGroupCommand({ logGroupName: logGroupName })),
            );
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

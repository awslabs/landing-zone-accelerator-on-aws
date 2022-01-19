/**
 *  Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import { CodePipelineClient, GetPipelineCommand } from '@aws-sdk/client-codepipeline';
import {
  BatchDeleteBuildsCommand,
  BatchGetProjectsCommand,
  CodeBuildClient,
  DeleteProjectCommand,
  paginateListBuildsForProject,
} from '@aws-sdk/client-codebuild';
import { OrganizationsClient, paginateListAccounts } from '@aws-sdk/client-organizations';
import { STSClient, AssumeRoleCommand, Credentials } from '@aws-sdk/client-sts';
import {
  CloudFormationClient,
  DeleteStackCommand,
  DeleteStackCommandOutput,
  DescribeStacksCommand,
  Stack,
  paginateListStackResources,
  UpdateTerminationProtectionCommand,
  waitUntilStackDeleteComplete,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import { WaiterResult } from '@aws-sdk/util-waiter';
import {
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  DescribeKeyCommand,
  DisableKeyCommand,
  KMSClient,
  KeyState,
  ScheduleKeyDeletionCommand,
} from '@aws-sdk/client-kms';
import {
  CloudWatchLogsClient,
  DeleteLogGroupCommand,
  paginateDescribeLogGroups,
} from '@aws-sdk/client-cloudwatch-logs';
import { CodeCommitClient, DeleteRepositoryCommand, GetFileCommand } from '@aws-sdk/client-codecommit';
import { GlobalConfig } from '@aws-accelerator/config';
import { pascalCase } from 'pascal-case';

import { AcceleratorStackNames, Logger } from '@aws-accelerator/accelerator';
import { throttlingBackOff } from '@aws-accelerator/utils';

/**
 * Type for pipeline stage action information with order and action name
 */
type stageActionType = { order: number; name: string };

/**
 * Pipeline Stack Type
 */
type pipelineStackType = {
  stageOrder: number;
  order: number;
  stackName: string;
  accountId: string;
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
  readonly keepBootstraps: boolean;
  readonly deleteData: boolean;
  readonly deletePipelines: boolean;
  readonly ignoreTerminationProtection: boolean;
}

/**
 * AcceleratorTool Class
 */
export class AcceleratorTool {
  /**
   * Pipeline Global Config
   * @private
   */
  private globalConfig: GlobalConfig | undefined;

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
   * codePipelineClient
   * @private
   */
  private readonly codePipelineClient: CodePipelineClient;

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
   * multiActionStageActions
   * @private
   */
  private multiActionStageActions: stageActionType[] = [];

  /**
   * pipelineStageActions
   * @private
   */
  private pipelineStageActions: {
    stage: string;
    order: number;
    actions: stageActionType[];
  }[] = [];

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
  private acceleratorCloudFormationStacks: {
    stageOrder: number;
    order: number;
    stackName: string;
    accountId: string;
  }[] = [];

  private acceleratorCodeBuildProjects: string[] = [];

  constructor(props: AcceleratorToolProps) {
    this.acceleratorToolProps = props;
    this.codePipelineClient = new CodePipelineClient({});
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
   * @param installerStackName {string}
   * The name of the installer cloudformation stack
   */
  public async uninstallAccelerator(installerStackName: string): Promise<boolean> {
    const DEFAULT_QUALIFIER = 'aws-accelerator';
    const installerPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(installerStackName);
    if (!installerPipeline.status) {
      // console.error(`[PlatformAccelerator][Cleanup][ERROR] ${installerPipeline.pipelineName}`);
      Logger.debug(`[accelerator-tool] ${installerPipeline.pipelineName}`);
      return false;
    }

    const getPipelineNameResponse = await throttlingBackOff(() =>
      this.codePipelineClient.send(new GetPipelineCommand({ name: installerPipeline!.pipelineName })),
    );

    const installerCodeBuildProjectName =
      getPipelineNameResponse.pipeline!.stages![1].actions![0].configuration!['ProjectName'];

    const batchGetProjectsCommandResponse = await throttlingBackOff(() =>
      new CodeBuildClient({}).send(new BatchGetProjectsCommand({ names: [installerCodeBuildProjectName] })),
    );

    let installerQualifier = DEFAULT_QUALIFIER;
    let qualifierInPascalCase = 'AWSAccelerator';

    for (const envVariable of batchGetProjectsCommandResponse.projects![0].environment!.environmentVariables!) {
      if (envVariable.name === 'ACCELERATOR_QUALIFIER') {
        installerQualifier = envVariable.value!;
        qualifierInPascalCase = pascalCase(installerQualifier)
          .split('_')
          .join('-')
          .replace(/AwsAccelerator/gi, 'AWSAccelerator');
        break;
      }
    }

    // List of Accelerator Pipelines post fix to identify different pipelines
    const acceleratorPipelinePostfix: string[] = ['Pipeline'];

    for (const pipelinePostfix of acceleratorPipelinePostfix) {
      //Delete Accelerator Pipeline Cloudformation Stacks
      await this.deletePipelineCloudFormationStacks(`${qualifierInPascalCase}-${pipelinePostfix}`);
    }

    // Cleanup any pending resources in all accounts
    if (this.acceleratorToolProps.ignoreTerminationProtection) {
      await this.cleanRemainingResourcesInOrganizationAccounts(installerQualifier!);
    }

    // Installer stack resource cleanup takes place in pipeline or management account, so reset the credential settings
    AcceleratorTool.resetCredentialEnvironment();

    for (const pipelinePostfix of acceleratorPipelinePostfix) {
      if (this.acceleratorToolProps.deletePipelines) {
        // Delete Accelerator Pipeline stack and resources
        await this.deletePipelineStack(qualifierInPascalCase, pipelinePostfix);
      }
    }

    //Delete Installer Stack resources, this is to be executed from pipeline account or management account
    await this.deleteInstallerResources(
      installerStackName,
      installerPipeline.pipelineName,
      installerCodeBuildProjectName,
    );

    //TODO Delete bootstrap stack for management account home region after pipeline deleted only when pipeline management account is not used
    // Delete bootstrap stack from home region for management or pipeline account as last step of cleanups
    if (!this.acceleratorToolProps.keepBootstraps) {
      const cloudFormationClient = new CloudFormationClient({ region: this.globalConfig?.homeRegion });
      // If delete-data flag is on perform deletion, before stack deletion
      if (this.acceleratorToolProps.deleteData) {
        Logger.info('[accelerator-tool] delete-data flag is ON !!!');

        await this.deleteStackPersistentData(
          cloudFormationClient,
          'AWSAccelerator-CDKToolkit',
          new KMSClient({ region: this.globalConfig?.homeRegion }),
          new CloudWatchLogsClient({ region: this.globalConfig?.homeRegion }),
          new S3Client({ region: this.globalConfig?.homeRegion }),
        );
      }

      Logger.info(
        '[accelerator-tool] Deleting bootstrap stack for home region in management account "AWSAccelerator-CDKToolkit"',
      );
      await throttlingBackOff(() =>
        cloudFormationClient.send(new DeleteStackCommand({ StackName: 'AWSAccelerator-CDKToolkit' })),
      );

      Logger.info(`[accelerator-tool] Waiting until stack AWSAccelerator-CDKToolkit deletion completed`);
      while (!(await this.isStackDeletionCompleted(cloudFormationClient, 'AWSAccelerator-CDKToolkit'))) {
        // Wait before checking again
        await new Promise(func => setTimeout(func, 1000));
      }
      Logger.info(`[accelerator-tool] Stack AWSAccelerator-CDKToolkit deleted successfully`);
    }

    return true;
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
   * @param installerPipelineName
   * @param installerCodeBuildProject
   * @private
   */
  private async deleteInstallerResources(
    installerStackName: string,
    installerPipelineName: string,
    installerCodeBuildProject: string,
  ): Promise<boolean> {
    AcceleratorTool.resetCredentialEnvironment();
    const cloudFormationClient = new CloudFormationClient({});

    if (
      !(await this.isStackDeletable(
        cloudFormationClient,
        installerStackName,
        this.externalPipelineAccount.isUsed
          ? this.externalPipelineAccount.accountId!
          : this.pipelineManagementAccount!.accountId,
        this.globalConfig?.homeRegion,
      ))
    ) {
      return true;
    }

    if (!this.acceleratorToolProps.deletePipelines) {
      return true;
    }

    if (this.acceleratorToolProps.deleteData) {
      // Delete Installer stack persistent data
      await this.deleteStackPersistentData(
        cloudFormationClient,
        installerStackName,
        new KMSClient({}),
        new CloudWatchLogsClient({}),
        new S3Client({}),
      );
    }

    // cleanup installer pipeline code build projects and build history
    const codeBuildClient = new CodeBuildClient({});
    const buildIds: string[] = [];
    for await (const page of paginateListBuildsForProject(
      { client: codeBuildClient },
      { projectName: installerCodeBuildProject },
    )) {
      for (const id of page.ids!) {
        buildIds.push(id);
      }
    }
    Logger.info(
      `[accelerator-tool] Deleting build ids for the project ${installerCodeBuildProject} used in pipeline ${installerPipelineName}`,
    );

    await throttlingBackOff(() => codeBuildClient.send(new BatchDeleteBuildsCommand({ ids: buildIds })));

    Logger.info(
      `[accelerator-tool] Deleting Codebuild project ${installerCodeBuildProject} used in pipeline ${installerPipelineName}`,
    );
    await throttlingBackOff(() => codeBuildClient.send(new DeleteProjectCommand({ name: installerCodeBuildProject })));

    // Delete Installer Stack
    Logger.info(`[accelerator-tool] Deleting stack ${installerStackName}`);
    await throttlingBackOff(() => cloudFormationClient.send(new DeleteStackCommand({ StackName: installerStackName })));

    // Wait till installer stack deletion completed
    Logger.info(`[accelerator-tool] Waiting until stack ${installerStackName} deletion completed`);
    while (!(await this.isStackDeletionCompleted(cloudFormationClient, installerStackName))) {
      // Wait before checking again
      await new Promise(func => setTimeout(func, 1000));
    }
    Logger.info(`[accelerator-tool] Stack ${installerStackName} deleted successfully`);

    return true;
  }

  /**
   * Function to delete cloudformation stacks created for the given pipeline
   * @param pipelineName {string}
   * The name of the pipeline.
   * The stack name prefix
   * @private
   */
  private async deletePipelineCloudFormationStacks(pipelineName: string): Promise<boolean> {
    if (await this.initPipeline(pipelineName)) {
      const groupBy = (array: pipelineStackType[], key1: string, key2: string) => {
        return array.reduce((accumulator, currentValue) => {
          // @ts-ignore
          if (!accumulator[currentValue[key1] + '' + currentValue[key2]]) {
            // @ts-ignore
            accumulator[currentValue[key1] + '' + currentValue[key2]] = [];
          }
          // @ts-ignore
          accumulator[currentValue[key1] + '' + currentValue[key2]].push({
            accountId: currentValue.accountId,
            stackName: currentValue.stackName,
          });
          return accumulator;
        }, {});
      };
      const stacksGroupByAccounts = groupBy(this.acceleratorCloudFormationStacks, 'stageOrder', 'order');

      let pipelineStacksInDeleteOrder: {
        deleteOrder: number;
        displayOrderString: string;
        resourceDetails: [{ accountId: string; stackName: string }];
      }[] = [];

      for (const [key, value] of Object.entries(stacksGroupByAccounts)) {
        pipelineStacksInDeleteOrder.push({
          deleteOrder: parseInt(key),
          displayOrderString: [...key].map(Number).join('.'),
          resourceDetails: value as [{ accountId: string; stackName: string }],
        });
      }

      // Sort it descending to create delete stack commands
      pipelineStacksInDeleteOrder = pipelineStacksInDeleteOrder.sort((first, second) =>
        0 - first.deleteOrder > second.deleteOrder ? 1 : -1,
      );

      for (const accountStack of pipelineStacksInDeleteOrder) {
        Logger.info(`[accelerator-tool] >>>>> Step - ${accountStack.displayOrderString} deletion started`);
        if (!(await this.deleteStacks(accountStack))) {
          return false;
        }
        Logger.info(`[accelerator-tool] >>>>> Step - ${accountStack.displayOrderString} deletion completed`);
        Logger.info('');
      }
      return true;
    } else {
      return false;
    }
  }

  /**
   * Private async function to initialize required properties to perform accelerator cleanup
   * @private
   */
  private async initPipeline(pipelineName: string): Promise<boolean> {
    try {
      const response = await throttlingBackOff(() =>
        this.codePipelineClient.send(new GetPipelineCommand({ name: pipelineName })),
      );

      let orderCounter = 0;
      for (const stage of response.pipeline!.stages!) {
        // maintain list of code build project for the accelerator pipeline
        for (const action of stage.actions!) {
          if (
            action.configuration!['ProjectName'] &&
            !this.acceleratorCodeBuildProjects.find(item => item === action.configuration!['ProjectName'])
          ) {
            this.acceleratorCodeBuildProjects.push(action.configuration!['ProjectName']);
          }
        }

        // Get the source repo names
        if (stage.name === 'Source') {
          for (const action of stage.actions!) {
            switch (action.name!) {
              case 'Configuration':
                this.pipelineConfigSourceRepo = {
                  repositoryName: action.configuration!['RepositoryName'],
                  branch: action.configuration!['BranchName'],
                  provider: action.actionTypeId!.provider!,
                };
                break;
            }
          }
        }
        // Get bootstrap environment variables
        if (stage.name === 'Bootstrap') {
          this.bootstrapBuildEnvironmentVariables = await this.getCodeBuildEnvironmentVariables(
            stage.actions![0].configuration!['ProjectName'],
          );
        }

        // Get Accelerator stage actions
        if (stage.name !== 'Source' && stage.name !== 'Build') {
          if (stage.actions!.length > 1) {
            for (const action of stage.actions!) {
              const environmentVariableJson = Object.values(
                JSON.parse(action.configuration!['EnvironmentVariables']),
              )[0];

              const environmentDeployCommand = environmentVariableJson as {
                name: string;
                type: string;
                value: string;
              };

              const stackName = AcceleratorStackNames[environmentDeployCommand.value.split(' ')[2]];
              this.multiActionStageActions.push({
                order: action.runOrder!,
                name: stackName,
              });
            }

            // Sort it descending to create delete stack commands
            this.multiActionStageActions = this.multiActionStageActions.sort((first, second) =>
              0 - first.order > second.order ? 1 : -1,
            );

            this.pipelineStageActions.push({
              stage: stage.name!,
              order: (orderCounter += 1),
              actions: this.multiActionStageActions,
            });
          } else {
            for (const action of stage.actions!) {
              const environmentVariableJson = Object.values(
                JSON.parse(action.configuration!['EnvironmentVariables']),
              )[0];
              const environmentDeployCommand = environmentVariableJson as {
                name: string;
                type: string;
                value: string;
              };

              let stackName: string | undefined;
              if (environmentDeployCommand.value.split(' ')[0] === 'bootstrap') {
                if (this.acceleratorToolProps.keepBootstraps) {
                  stackName = undefined;
                } else {
                  stackName = 'AWSAccelerator-CDKToolkit';
                }
              } else {
                stackName = AcceleratorStackNames[environmentDeployCommand.value.split(' ')[2]];
              }

              if (stackName) {
                this.pipelineStageActions.push({
                  stage: stage.name!,
                  order: (orderCounter += 1),
                  actions: [
                    {
                      order: 1,
                      name: stackName,
                    },
                  ],
                });
              }
            }
          }
        }
      }

      // Sort it descending to create delete stack commands
      this.pipelineStageActions = this.pipelineStageActions.sort((first, second) =>
        0 - first.order > second.order ? 1 : -1,
      );

      // Get Pipeline Global config
      this.globalConfig = await this.getGlobalConfig();

      // Set pipeline management account details
      this.pipelineManagementAccount = await this.getPipelineManagementAccount();

      // Get List of Accounts within organization
      this.organizationAccounts = await this.getOrganizationAccountList();

      // Order the stacks in delete order
      this.acceleratorCloudFormationStacks = this.getPipelineCloudFormationStacks();

      // console.log(this.acceleratorCloudFormationStacks);
      // process.exit(1);

      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  /**
   * Function to delete accelerator pipeline stack and it's resources
   * @private
   */
  private async deletePipelineStack(qualifierInPascalCase: string, pipelinePostfix: string): Promise<boolean> {
    const pipelineName = `${qualifierInPascalCase}-${pipelinePostfix}`;
    const pipelineStackPostfix = 'PipelineStack';
    // if (pipelinePostfix === 'Pipeline'){
    //   pipelineStackPostfix
    // }
    const cloudFormationClient = new CloudFormationClient({});
    const fullyQualifiedStackName = `${qualifierInPascalCase}-${pipelineStackPostfix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    if (!(await this.isStackDeletable(cloudFormationClient, fullyQualifiedStackName))) {
      return true;
    }

    const codeBuildClient = new CodeBuildClient({});
    const codeCommitClient = new CodeCommitClient({});

    //delete code commit repository created by the accelerator pipeline
    if (this.pipelineConfigSourceRepo?.provider === 'CodeCommit') {
      //Delete config repository
      Logger.info(`[accelerator-tool] Deleting config repository ${this.pipelineConfigSourceRepo?.repositoryName}`);
      await throttlingBackOff(() =>
        codeCommitClient.send(
          new DeleteRepositoryCommand({ repositoryName: this.pipelineConfigSourceRepo?.repositoryName }),
        ),
      );
    }

    //delete code build projects before deleting pipeline
    for (const project of this.acceleratorCodeBuildProjects) {
      const buildIds: string[] = [];
      for await (const page of paginateListBuildsForProject({ client: codeBuildClient }, { projectName: project })) {
        for (const id of page.ids!) {
          buildIds.push(id);
        }
      }
      Logger.info(`[accelerator-tool] Deleting build ids for the project ${project} used in pipeline ${pipelineName}`);
      await throttlingBackOff(() => codeBuildClient.send(new BatchDeleteBuildsCommand({ ids: buildIds })));

      Logger.info(`[accelerator-tool] Codebuild project ${project} used in pipeline ${pipelineName}`);
      await throttlingBackOff(() => codeBuildClient.send(new DeleteProjectCommand({ name: project })));
    }

    if (this.acceleratorToolProps.deleteData) {
      // Delete Installer stack persistent data
      await this.deleteStackPersistentData(
        cloudFormationClient,
        fullyQualifiedStackName,
        new KMSClient({}),
        new CloudWatchLogsClient({}),
        new S3Client({}),
      );
    }

    Logger.info(`[accelerator-tool] Deleting stack ${fullyQualifiedStackName}`);
    await throttlingBackOff(() =>
      cloudFormationClient.send(new DeleteStackCommand({ StackName: `${fullyQualifiedStackName}` })),
    );

    Logger.info(`[accelerator-tool] Waiting until stack ${fullyQualifiedStackName} deletion completed`);
    while (!(await this.isStackDeletionCompleted(cloudFormationClient, fullyQualifiedStackName))) {
      // Wait before checking again
      await new Promise(func => setTimeout(func, 1000));
    }
    Logger.info(`[accelerator-tool] Stack ${fullyQualifiedStackName} deleted successfully`);
    return true;
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
    let executingAccountId: string | undefined;
    let managementAccountId: string | undefined;
    let managementAccountRoleName: string | undefined;
    let managementAccountCredentials: Credentials | undefined;

    for (const envVariable of this.bootstrapBuildEnvironmentVariables!) {
      if (envVariable.name === 'ACCOUNT_ID') {
        executingAccountId = envVariable.value;
      }
      if (envVariable.name === 'MANAGEMENT_ACCOUNT_ID') {
        managementAccountId = envVariable.value;
      }
      if (envVariable.name === 'MANAGEMENT_ACCOUNT_ROLE_NAME') {
        managementAccountRoleName = envVariable.value;
      }
    }

    if (executingAccountId !== managementAccountId && managementAccountId && managementAccountRoleName) {
      managementAccountCredentials = await this.getManagementAccountCredentials(
        managementAccountId!,
        managementAccountRoleName,
      );
      this.externalPipelineAccount = { isUsed: true, accountId: executingAccountId! };
      return {
        accountId: managementAccountId,
        assumeRoleName: managementAccountRoleName,
        credentials: managementAccountCredentials,
      };
    } else {
      this.externalPipelineAccount = { isUsed: false, accountId: managementAccountId };
      return {
        accountId: executingAccountId!,
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
    for await (const page of paginateListAccounts({ client: organizationsClient }, {})) {
      for (const account of page.Accounts ?? []) {
        if (account.Id && account.Name) {
          accountIds.push({ accountName: account.Name, accountId: account.Id });
        }
      }
    }
    return accountIds;
  }

  /**
   * Function to get cloudformation stacks created by pipeline stage actions
   * @private
   */
  private getPipelineCloudFormationStacks(): pipelineStackType[] {
    const pipelineCloudFormationStacks: pipelineStackType[] = [];

    for (const stage of this.pipelineStageActions) {
      for (const action of stage.actions) {
        for (const account of this.organizationAccounts) {
          pipelineCloudFormationStacks.push({
            stageOrder: stage.order,
            order: action.order,
            accountId: account.accountId,
            stackName: action.name,
          });
        }
      }
    }
    return pipelineCloudFormationStacks;
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

    Logger.info(`[accelerator-tool] management account roleArn => ${roleArn}`);

    const assumeRoleCredential = await throttlingBackOff(() =>
      stsClient.send(
        new AssumeRoleCommand({
          RoleArn: roleArn,
          RoleSessionName: 'acceleratorAssumeRoleSession',
          DurationSeconds: 3600,
        }),
      ),
    );

    process.env['AWS_ACCESS_KEY_ID'] = assumeRoleCredential.Credentials!.AccessKeyId!;
    process.env['AWS_ACCESS_KEY'] = assumeRoleCredential.Credentials!.AccessKeyId!;

    process.env['AWS_SECRET_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;
    process.env['AWS_SECRET_ACCESS_KEY'] = assumeRoleCredential.Credentials!.SecretAccessKey!;

    process.env['AWS_SESSION_TOKEN'] = assumeRoleCredential.Credentials!.SessionToken;

    return assumeRoleCredential.Credentials;
  }

  /**
   * Function to clean remaining resources from all accounts, this is because custom resource creates cloudwatch log group during delete events.
   * Which is not deleted by the cloudformation stack
   * @param installerQualifier
   * @private
   */
  private async cleanRemainingResourcesInOrganizationAccounts(installerQualifier: string): Promise<boolean> {
    const assumeRoleName = 'AWSControlTowerExecution';
    let cloudWatchLogsClient: CloudWatchLogsClient;
    for (const region of this.globalConfig!.enabledRegions) {
      for (const account of this.organizationAccounts) {
        if (account.accountId !== this.pipelineManagementAccount!.accountId) {
          const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${account.accountId}:role/${assumeRoleName}`;
          const stsClient = new STSClient({ region: region });
          const assumeRoleCredential = await throttlingBackOff(() =>
            stsClient.send(
              new AssumeRoleCommand({
                RoleArn: roleArn,
                RoleSessionName: 'acceleratorAssumeRoleSession',
              }),
            ),
          );
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

        // Clean all accelerator related cloud watch log groups
        for await (const page of paginateDescribeLogGroups({ client: cloudWatchLogsClient }, {})) {
          for (const logGroup of page.logGroups!) {
            if (
              logGroup.logGroupName?.includes('/aws/lambda/AWSAccelerator') ||
              // logGroup.logGroupName?.includes('/aws/lambda/Accelerator') ||
              logGroup.logGroupName?.includes(`/aws/codebuild/${installerQualifier}`)
            ) {
              Logger.info(`[accelerator-tool] Deleting log group ${logGroup.logGroupName}`);
              await throttlingBackOff(() =>
                cloudWatchLogsClient.send(new DeleteLogGroupCommand({ logGroupName: logGroup.logGroupName })),
              );
            }
          }
        }
      }
    }
    return true;
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
          repositoryName: this.pipelineConfigSourceRepo!.repositoryName!,
          filePath: 'global-config.yaml',
        }),
      ),
    );
    const globalConfig = GlobalConfig.loadFromString(new TextDecoder('utf-8').decode(response.fileContent!));
    if (!globalConfig) {
      Logger.warn('[accelerator-tool] Error parsing global-config file, object undefined');
    }
    return globalConfig!;
  }

  /**
   * Function to delete bucket once all objects are deleted
   * @param s3Client
   * @param stackName
   * @param bucketName
   * @private
   */
  private async deleteBucket(s3Client: S3Client, stackName: string, bucketName: string): Promise<boolean> {
    // Paginate List object and Delete objects
    let listObjectVersionsResponse = await throttlingBackOff(() =>
      s3Client.send(
        new ListObjectVersionsCommand({
          Bucket: bucketName,
        }),
      ),
    );
    let contents = [
      ...(listObjectVersionsResponse.Versions ?? []),
      ...(listObjectVersionsResponse.DeleteMarkers ?? []),
    ];
    while (contents.length > 0) {
      Logger.info(`[accelerator-tool] Number of objects in ${bucketName} is ${contents.length} will be deleted`);
      // eslint-disable-next-line  @typescript-eslint/no-explicit-any
      const records = contents.map((record: any) => ({
        Key: record.Key,
        VersionId: record.VersionId,
      }));
      Logger.info(`[accelerator-tool] Deleting objects from bucket ${bucketName} from ${stackName} stack`);
      await throttlingBackOff(() =>
        s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: { Objects: records },
          }),
        ),
      );

      // Wait before checking again for data
      await new Promise(func => setTimeout(func, 1000));

      listObjectVersionsResponse = await throttlingBackOff(() =>
        s3Client.send(
          new ListObjectVersionsCommand({
            Bucket: bucketName,
          }),
        ),
      );

      contents = [...(listObjectVersionsResponse.Versions ?? []), ...(listObjectVersionsResponse.DeleteMarkers ?? [])];

      Logger.info(`[accelerator-tool] Number of objects in ${bucketName} is ${contents.length}, remaining to delete`);
    }

    // Delete the empty Bucket
    Logger.info(`[accelerator-tool] Deleting empty bucket ${bucketName} from ${stackName} stack`);
    await throttlingBackOff(() =>
      s3Client.send(
        new DeleteBucketCommand({
          Bucket: bucketName,
        }),
      ),
    );

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
    Logger.info(`[accelerator-tool] Deleting Cloudwatch Log group ${logGroupName} from ${stackName} stack`);

    try {
      await throttlingBackOff(() =>
        cloudWatchLogsClient.send(new DeleteLogGroupCommand({ logGroupName: logGroupName })),
      );
    } catch (ResourceNotFoundException) {
      Logger.warn(
        `[accelerator-tool] Cloudwatch Log group delete Error Log Group NOT FOUND ${logGroupName} from ${stackName} stack`,
      );
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
    Logger.info(`[accelerator-tool] Disabling KMS Key ${kmsKeyId} from ${stackName} stack`);
    const keyStatus = await throttlingBackOff(() => kMSClient.send(new DescribeKeyCommand({ KeyId: kmsKeyId })));
    if (keyStatus.KeyMetadata?.KeyState === KeyState.Enabled) {
      await throttlingBackOff(() => kMSClient.send(new DisableKeyCommand({ KeyId: kmsKeyId })));

      Logger.info(`[accelerator-tool] Schedule KMS Key deletion ${kmsKeyId} from ${stackName} stack`);
      await throttlingBackOff(() =>
        kMSClient.send(
          new ScheduleKeyDeletionCommand({
            KeyId: kmsKeyId,
            PendingWindowInDays: 7,
          }),
        ),
      );
    } else {
      Logger.warn(
        `[accelerator-tool] KMS Key ${kmsKeyId} from ${stackName} stack in ${keyStatus.KeyMetadata?.KeyState} status, can not schedule deletion`,
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
      for await (const page of paginateListStackResources(
        { client: new CloudFormationClient({}) },
        { StackName: stackName },
      )) {
        for (const stackResourceSummary of page.StackResourceSummaries ?? []) {
          if (stackResourceSummary.ResourceType === 'AWS::CodePipeline::Pipeline') {
            return { status: true, pipelineName: stackResourceSummary.PhysicalResourceId! };
          }
        }
      }
      return { status: false, pipelineName: `No pipeline found in stack ${stackName}` };
    } catch (error) {
      return { status: false, pipelineName: `${error}` };
    }
  }

  private async deleteStackPersistentData(
    cloudFormationClient: CloudFormationClient,
    stackName: string,
    kMSClient: KMSClient,
    cloudWatchLogsClient: CloudWatchLogsClient,
    s3Client: S3Client,
  ): Promise<boolean> {
    for await (const page of paginateListStackResources({ client: cloudFormationClient }, { StackName: stackName })) {
      for (const stackResourceSummary of page.StackResourceSummaries ?? []) {
        switch (stackResourceSummary.ResourceType) {
          case 'AWS::KMS::Key':
            await this.scheduleKeyDeletion(kMSClient, stackName, stackResourceSummary.PhysicalResourceId!);
            break;
          case 'AWS::Logs::LogGroup':
            await this.deleteCloudWatchLogs(cloudWatchLogsClient, stackName, stackResourceSummary.PhysicalResourceId!);
            break;
          case 'AWS::S3::Bucket':
            const listBucketResponse = await throttlingBackOff(() => s3Client.send(new ListBucketsCommand({})));
            for (const bucket of listBucketResponse.Buckets!) {
              if (bucket.Name === stackResourceSummary.PhysicalResourceId) {
                await this.deleteBucket(s3Client, stackName, stackResourceSummary.PhysicalResourceId!);
              }
            }
            break;
        }
      }
    }
    return true;
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
  ): Promise<boolean> {
    try {
      await throttlingBackOff(() => cloudFormationClient.send(new DescribeStacksCommand({ StackName: stackName })));
      return false;
    } catch (error) {
      return `${error}`.includes(`Stack with id ${stackName} does not exist`);
    }
  }

  /**
   * Function to delete cloudformation stack
   * @param accountStack
   * @private
   */
  private async deleteStacks(accountStack: {
    deleteOrder: number;
    resourceDetails: [{ accountId: string; stackName: string }];
  }): Promise<boolean> {
    const deleteStackStartedPromises: Promise<DeleteStackCommandOutput>[] = [];
    const deleteStackCompletedPromises: Promise<WaiterResult>[] = [];
    const assumeRoleName = 'AWSControlTowerExecution';
    let cloudFormationClient: CloudFormationClient;
    let s3Client: S3Client;
    let kMSClient: KMSClient;
    let cloudWatchLogsClient: CloudWatchLogsClient;

    let cloudFormationStack: Stack | undefined;
    //Use a loop for all regions
    for (const region of this.globalConfig!.enabledRegions) {
      for (const resource of accountStack.resourceDetails) {
        if (resource.accountId !== this.pipelineManagementAccount?.accountId) {
          const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${resource.accountId}:role/${assumeRoleName}`;
          const stsClient = new STSClient({ region: region });
          const assumeRoleCredential = await throttlingBackOff(() =>
            stsClient.send(
              new AssumeRoleCommand({
                RoleArn: roleArn,
                RoleSessionName: 'acceleratorAssumeRoleSession',
              }),
            ),
          );
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
          kMSClient = new KMSClient({
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
        } else {
          cloudFormationClient = new CloudFormationClient({ region: region });
          s3Client = new S3Client({ region: region });
          kMSClient = new KMSClient({ region: region });
          cloudWatchLogsClient = new CloudWatchLogsClient({ region: region });
        }

        const fullyQualifiedStackName = `${resource.stackName}-${resource.accountId}-${region}`;

        try {
          const response = await throttlingBackOff(() =>
            cloudFormationClient.send(new DescribeStacksCommand({ StackName: fullyQualifiedStackName })),
          );
          cloudFormationStack = response.Stacks![0];
        } catch (error) {
          if (`${error}`.includes(`Stack with id ${fullyQualifiedStackName} does not exist`)) {
            Logger.warn(
              `[accelerator-tool] Stack with id ${fullyQualifiedStackName} does not exist in ${resource.accountId} account in ${region} region`,
            );
            cloudFormationStack = undefined;
          }
        }

        // Exclude management account home region bootstrap deletion before pipeline stack and installer stacks are deleted, conditions are
        // 1. When pipeline account is not used
        // 2. When stack is for home region
        // 3. When it is bootstrap stack
        // 4. When stack is part of management account
        if (
          cloudFormationStack &&
          !this.externalPipelineAccount.isUsed &&
          this.globalConfig?.homeRegion === region &&
          cloudFormationStack?.StackName === 'AWSAccelerator-CDKToolkit' &&
          this.pipelineManagementAccount!.accountId === resource.accountId &&
          !this.acceleratorToolProps.keepBootstraps
        ) {
          Logger.info(`[accelerator-tool] Management account home region bootstrap stack deletion excluded`);
          Logger.info(
            `[accelerator-tool] ${cloudFormationStack?.StackName} stack region is ${region} and home region is ${this.globalConfig?.homeRegion}`,
          );

          cloudFormationStack = undefined;
        }

        if (
          cloudFormationStack &&
          (await this.isStackDeletable(
            cloudFormationClient,
            cloudFormationStack.StackName!,
            resource.accountId,
            region,
          ))
        ) {
          Logger.info(
            `[accelerator-tool] Deleting CloudFormation stack ${cloudFormationStack!.StackName} in ${
              resource.accountId
            } account from ${region} region`,
          );

          // If delete-data flag is on perform deletion, before stack deletion
          if (this.acceleratorToolProps.deleteData) {
            Logger.info('[accelerator-tool] delete-data flag is ON !!!');

            await this.deleteStackPersistentData(
              cloudFormationClient,
              cloudFormationStack!.StackName!,
              kMSClient,
              cloudWatchLogsClient,
              s3Client,
            );
          } else {
            Logger.info('[accelerator-tool] delete-data flag is OFF');
          }

          deleteStackStartedPromises.push(
            cloudFormationClient.send(new DeleteStackCommand({ StackName: cloudFormationStack!.StackName! })),
          );

          // This is required to make sure stacks are deleted before moving to next stage of stack deletion
          deleteStackCompletedPromises.push(
            waitUntilStackDeleteComplete(
              { client: cloudFormationClient, maxWaitTime: 3600 }, // waitTime is in second
              { StackName: cloudFormationStack!.StackName! },
            ),
          );
        }
      }
    }

    if (deleteStackStartedPromises.length > 0 && deleteStackCompletedPromises.length > 0) {
      Logger.info(`[accelerator-tool] Total ${deleteStackStartedPromises.length} stack(s) will be deleted.`);
      const start = new Date().getTime();
      await Promise.all(deleteStackStartedPromises);
      await Promise.all(deleteStackCompletedPromises);
      const elapsed = Math.round((new Date().getTime() - start) / 60000);
      Logger.info(
        `[accelerator-tool] Total ${deleteStackCompletedPromises.length} stack(s) deleted successfully. Elapsed time - ~${elapsed} minutes`,
      );
    }
    return true;
  }

  private async isStackDeletable(
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
        Logger.warn(
          `[accelerator-tool] Stack ${stackName} termination protection is enabled, disabling the termination protection"`,
        );
        await throttlingBackOff(() =>
          cloudFormationClient.send(
            new UpdateTerminationProtectionCommand({
              StackName: stackName,
              EnableTerminationProtection: false,
            }),
          ),
        );
        Logger.warn(`[accelerator-tool] Waiting stack ${stackName} update completion"`);
        waitUntilStackUpdateComplete(
          { client: cloudFormationClient, maxWaitTime: 3600 }, // waitTime is in second
          { StackName: stackName },
        );
        return true;
      } else {
        if (stackName && accountId) {
          Logger.warn(
            `[accelerator-tool] Due to termination protection enable skipping deletion of CloudFormation stack ${stackName} in ${accountId} account from ${region} region`,
          );
        } else {
          Logger.warn(
            `[accelerator-tool] Due to termination protection enable skipping deletion of CloudFormation stack ${stackName}`,
          );
        }
        Logger.warn(
          `[accelerator-tool] Uninstallation STOPPED, due to termination protection of  stack ${stackName}!!!"`,
        );
        process.abort();
        return false;
      }
    } else {
      return true;
    }
  }
}

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
import { AcceleratorStackNames } from '../../../accelerator/lib/accelerator';
import { Logger } from '../../../accelerator/lib/logger';
import { GlobalConfig } from '@aws-accelerator/config';
import { throttlingBackOff } from '@aws-accelerator/utils';

import {
  CloudFormationClient,
  DeleteStackCommand,
  DeleteStackCommandOutput,
  DescribeStacksCommand,
  ListStackResourcesCommand,
  Stack,
  UpdateTerminationProtectionCommand,
  waitUntilStackDeleteComplete,
  waitUntilStackUpdateComplete,
} from '@aws-sdk/client-cloudformation';
import { CloudWatchLogsClient, DeleteLogGroupCommand, DescribeLogGroupsCommand } from '@aws-sdk/client-cloudwatch-logs';
import {
  BatchDeleteBuildsCommand,
  BatchGetProjectsCommand,
  CodeBuildClient,
  ListBuildsForProjectCommand,
} from '@aws-sdk/client-codebuild';
import { CodeCommitClient, DeleteRepositoryCommand, GetFileCommand } from '@aws-sdk/client-codecommit';
import { CodePipelineClient, GetPipelineCommand } from '@aws-sdk/client-codepipeline';
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
import { WaiterResult } from '@aws-sdk/util-waiter';
import { BackupClient, DeleteBackupVaultCommand } from '@aws-sdk/client-backup';

/**
 * Type for pipeline stage action information with order and action name
 */
export type stageActionType = { order: number; name: string };

/**
 * Pipeline Stack Type
 */
export type pipelineStackType = {
  stageOrder: number;
  order: number;
  stackName: string;
  accountId: string;
};

/**
 * Pipeline Management Account Type, with account ID, role name to assume and sts credential
 */
export type ManagementAccountType =
  | {
      accountId: string;
      assumeRoleName: string | undefined;
      credentials: Credentials | undefined;
    }
  | undefined;

type stackPersistentObjectListType = {
  stackName: string;
  resourceType: 'S3' | 'CWLogs' | 'KMS';
  resourceClient: KMSClient | CloudWatchLogsClient | S3Client | BackupClient;
  resourcePhysicalId: string;
};

/**
 * Accelerator AcceleratorToolProps
 */
export interface AcceleratorToolProps {
  readonly installerStackName: string;
  readonly partition: string;
  readonly keepBootstraps: boolean;
  readonly deleteData: boolean;
  readonly deleteConfigRepo: boolean;
  readonly deletePipelines: boolean;
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

  private prepareStackPersistentObjectList: stackPersistentObjectListType[] = [];

  constructor(props: AcceleratorToolProps) {
    this.acceleratorToolProps = props;
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
    // Get executing account ID
    const response = await throttlingBackOff(() => new STSClient({}).send(new GetCallerIdentityCommand({})));
    this.executingAccountId = response.Account;

    // Get installer pipeline
    const installerPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(installerStackName);
    if (!installerPipeline.status) {
      Logger.debug(`[accelerator-tool] ${installerPipeline.pipelineName}`);
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

    // Default assignments when no qualifier present
    let acceleratorQualifier = 'AWSAccelerator';
    let acceleratorPipelineStackNamePrefix = 'AWSAccelerator-PipelineStack';
    let acceleratorPipelineName = 'AWSAccelerator-Pipeline';

    // Accelerator tester configuration
    let testerPipelineStackNamePrefix = 'AWSAccelerator-TesterPipelineStack';
    let testerPipelineConfigRepositoryName = 'aws-accelerator-test-config';
    let testerStackNamePrefix = 'AWSAccelerator-TesterStack';
    // End of default assignments

    for (const envVariable of batchGetProjectsCommandResponse.projects![0].environment!.environmentVariables!) {
      if (envVariable.name === 'ACCELERATOR_QUALIFIER') {
        acceleratorQualifier = envVariable.value!;
        acceleratorPipelineStackNamePrefix = `${envVariable.value!}-pipeline-stack`;
        acceleratorPipelineName = `${envVariable.value!}-pipeline`;
        testerStackNamePrefix = `${envVariable.value!}-tester-stack`;
        testerPipelineStackNamePrefix = `${envVariable.value!}-tester-pipeline-stack`;
        testerPipelineConfigRepositoryName = `${envVariable.value!}-test-config`;
        break;
      }
    }

    //Delete accelerator target cloudformation stacks
    await this.deleteAcceleratorTargetCloudFormationStacks(acceleratorPipelineName);

    await this.deletePrepareStackResources();

    // Installer and Tester stack resource cleanup takes place in pipeline or management account, so reset the credential settings
    AcceleratorTool.resetCredentialEnvironment();

    // Delete tester stack
    await this.deleteTesterStack(testerStackNamePrefix);

    // Delete tester pipeline stack
    await this.deleteTesterPipelineStack(testerPipelineStackNamePrefix, testerPipelineConfigRepositoryName);

    // Delete Accelerator Pipeline stack
    await this.deleteAcceleratorPipelineStack(acceleratorPipelineStackNamePrefix);

    //Delete Installer Stack
    await this.deleteAcceleratorInstallerStack(installerStackName);

    // Cleanup any remaining resources in all accounts, this is required because,
    // during deletion of custom resources creates cloudwatch logs which is required to clean
    // Only when full cleanup was intended this this cleanup should take place
    if (this.acceleratorToolProps.ignoreTerminationProtection) {
      await this.deleteAcceleratorRemainingResourcesInAllAccounts(acceleratorQualifier);
    }

    if (!this.acceleratorToolProps.keepBootstraps && !this.externalPipelineAccount.isUsed) {
      AcceleratorTool.resetCredentialEnvironment();
      await this.deleteStack(new CloudFormationClient({}), 'AWSAccelerator-CDKToolkit');
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
    if (!this.acceleratorToolProps.deletePipelines) {
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
  private async deleteAcceleratorTargetCloudFormationStacks(pipelineName: string): Promise<boolean> {
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
        new CodePipelineClient({}).send(new GetPipelineCommand({ name: pipelineName })),
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
            if (action.name! === 'Configuration') {
              this.pipelineConfigSourceRepo = {
                repositoryName: action.configuration!['RepositoryName'],
                branch: action.configuration!['BranchName'],
                provider: action.actionTypeId!.provider!,
              };
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
        if (stage.name !== 'Source' && stage.name !== 'Build' && stage.name !== 'Review') {
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
            this.multiActionStageActions.sort((first, second) => (0 - first.order > second.order ? 1 : -1));

            orderCounter += 1;
            this.pipelineStageActions.push({
              stage: stage.name!,
              order: orderCounter,
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
                orderCounter += 1;
                this.pipelineStageActions.push({
                  stage: stage.name!,
                  order: orderCounter,
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
      this.pipelineStageActions.sort((first, second) => (0 - first.order > second.order ? 1 : -1));

      // Get Pipeline Global config
      this.globalConfig = await this.getGlobalConfig();

      // Set pipeline management account details
      this.pipelineManagementAccount = await this.getPipelineManagementAccount();

      // Get List of Accounts within organization
      this.organizationAccounts = await this.getOrganizationAccountList();

      // Order the stacks in delete order
      this.acceleratorCloudFormationStacks = this.getPipelineCloudFormationStacks();

      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  /**
   * Function to delete accelerator pipeline stack and it's resources
   * @param acceleratorPipelineStackNamePrefix
   * @private
   */
  private async deleteAcceleratorPipelineStack(acceleratorPipelineStackNamePrefix: string): Promise<void> {
    if (!this.acceleratorToolProps.deletePipelines) {
      return;
    }
    const acceleratorPipelineStackName = `${acceleratorPipelineStackNamePrefix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    const acceleratorPipeline = await AcceleratorTool.getPipelineNameFromCloudFormationStack(
      acceleratorPipelineStackName,
    );

    if (acceleratorPipeline.status) {
      if (this.acceleratorToolProps.deleteConfigRepo) {
        await this.deleteCodecommitRepository(
          new CodeCommitClient({}),
          `${this.pipelineConfigSourceRepo?.repositoryName}`,
        );
      }

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
   * Function to clean remaining resources from all accounts, this is because custom resource creates cloudwatch log group during delete events.
   * Which is not deleted by the cloudformation stack
   * @param installerQualifier
   * @private
   */
  private async deleteAcceleratorRemainingResourcesInAllAccounts(installerQualifier: string): Promise<boolean> {
    if (this.pipelineManagementAccount!.credentials) {
      process.env['AWS_ACCESS_KEY_ID'] = this.pipelineManagementAccount!.credentials.AccessKeyId!;
      process.env['AWS_ACCESS_KEY'] = this.pipelineManagementAccount!.credentials.AccessKeyId!;
      process.env['AWS_SECRET_KEY'] = this.pipelineManagementAccount!.credentials.SecretAccessKey!;
      process.env['AWS_SECRET_ACCESS_KEY'] = this.pipelineManagementAccount!.credentials.SecretAccessKey!;
      process.env['AWS_SESSION_TOKEN'] = this.pipelineManagementAccount!.credentials.SessionToken;
    }

    const assumeRoleName = 'AWSControlTowerExecution';
    let cloudWatchLogsClient: CloudWatchLogsClient;
    for (const region of this.globalConfig?.enabledRegions || []) {
      for (const account of this.organizationAccounts) {
        if (account.accountId !== this.pipelineManagementAccount!.accountId) {
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

        // Clean all accelerator related cloud watch log groups
        let nextToken: string | undefined = undefined;
        do {
          const page = await throttlingBackOff(() =>
            cloudWatchLogsClient.send(new DescribeLogGroupsCommand({ nextToken })),
          );
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
          nextToken = page.nextToken;
        } while (nextToken);
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
          repositoryName: this.pipelineConfigSourceRepo!.repositoryName,
          filePath: 'global-config.yaml',
        }),
      ),
    );
    const globalConfig = GlobalConfig.loadFromString(new TextDecoder('utf-8').decode(response.fileContent!));
    if (!globalConfig) {
      throw Error('[accelerator-tool] Error parsing global-config file, object undefined');
    }
    return globalConfig;
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
    let listObjectVersionsResponse = await this.getListObjectVersions(s3Client, bucketName);
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

      listObjectVersionsResponse = await this.getListObjectVersions(s3Client, bucketName);

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
    Logger.info(`[accelerator-tool] Deleting BackupVault ${backupVaultName} from ${stackName} stack`);

    try {
      await throttlingBackOff(() =>
        backupClient.send(new DeleteBackupVaultCommand({ BackupVaultName: backupVaultName })),
      );
    } catch (ResourceNotFoundException) {
      Logger.warn(`[accelerator-tool] AWS BackupVault NOT FOUND ${backupVaultName} from ${stackName} stack`);
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
   * Function to delete stack's resources like S3/Cloudwatch logs, KMS key
   * @param cloudFormationClient
   * @param stackName
   * @param kMSClient
   * @param cloudWatchLogsClient
   * @param s3Client
   * @param backupClient
   * @private
   */
  private async deleteStackPersistentData(
    cloudFormationClient: CloudFormationClient,
    stackName: string,
    kMSClient: KMSClient,
    cloudWatchLogsClient: CloudWatchLogsClient,
    s3Client: S3Client,
    backupClient: BackupClient,
  ): Promise<boolean> {
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cloudFormationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
      );
      for (const stackResourceSummary of page.StackResourceSummaries ?? []) {
        switch (stackResourceSummary.ResourceType) {
          case 'AWS::KMS::Key':
            await this.scheduleKeyDeletion(kMSClient, stackName, stackResourceSummary.PhysicalResourceId!);
            break;
          case 'AWS::Backup::BackupVault':
            await this.deleteBackupVault(backupClient, stackName, stackResourceSummary.PhysicalResourceId!);
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
      nextToken = page.NextToken;
    } while (nextToken);
    return true;
  }

  /**
   * Function to create list of stack resources for S3, KMS, Cloudwatch logs, which will be deleted after stack deletion completed.
   * @param cloudFormationClient
   * @param stackName
   * @param kMSClient
   * @param cloudWatchLogsClient
   * @param s3Client
   * @private
   */
  private async makeStackPersistentObjectList(
    cloudFormationClient: CloudFormationClient,
    stackName: string,
    kMSClient: KMSClient,
    cloudWatchLogsClient: CloudWatchLogsClient,
    s3Client: S3Client,
  ): Promise<stackPersistentObjectListType[]> {
    const stackPersistentObjectList: stackPersistentObjectListType[] = [];
    let nextToken: string | undefined = undefined;
    do {
      const page = await throttlingBackOff(() =>
        cloudFormationClient.send(new ListStackResourcesCommand({ StackName: stackName, NextToken: nextToken })),
      );
      for (const stackResourceSummary of page.StackResourceSummaries ?? []) {
        switch (stackResourceSummary.ResourceType) {
          case 'AWS::KMS::Key':
            stackPersistentObjectList.push({
              stackName: stackName,
              resourceType: 'KMS',
              resourceClient: kMSClient,
              resourcePhysicalId: stackResourceSummary.PhysicalResourceId!,
            });
            break;
          case 'AWS::Logs::LogGroup':
            stackPersistentObjectList.push({
              stackName: stackName,
              resourceType: 'CWLogs',
              resourceClient: cloudWatchLogsClient,
              resourcePhysicalId: stackResourceSummary.PhysicalResourceId!,
            });
            break;
          case 'AWS::S3::Bucket':
            const listBucketResponse = await throttlingBackOff(() => s3Client.send(new ListBucketsCommand({})));
            for (const bucket of listBucketResponse.Buckets!) {
              if (bucket.Name === stackResourceSummary.PhysicalResourceId) {
                stackPersistentObjectList.push({
                  stackName: stackName,
                  resourceType: 'S3',
                  resourceClient: s3Client,
                  resourcePhysicalId: stackResourceSummary.PhysicalResourceId!,
                });
              }
            }
            break;
        }
      }
      nextToken = page.NextToken;
    } while (nextToken);
    return stackPersistentObjectList;
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
    let backupClient: BackupClient;

    let cloudFormationStack: Stack | undefined;
    //Use a loop for all regions
    for (const region of this.globalConfig?.enabledRegions || []) {
      for (const resource of accountStack.resourceDetails) {
        if (resource.accountId !== this.pipelineManagementAccount?.accountId) {
          const roleArn = `arn:${this.acceleratorToolProps.partition}:iam::${resource.accountId}:role/${assumeRoleName}`;
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
          backupClient = new BackupClient({
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
          backupClient = new BackupClient({ region: region });
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
            `[accelerator-tool] Deleting CloudFormation stack ${cloudFormationStack.StackName} in ${resource.accountId} account from ${region} region`,
          );

          // If delete-data flag is on perform deletion, before stack deletion
          if (this.acceleratorToolProps.deleteData) {
            Logger.info('[accelerator-tool] delete-data flag is ON !!!');

            // Since prepare stack have dependencies on KSM key, can't delete resources before stacks deleted.
            if (cloudFormationStack.StackName!.includes('PrepareStack')) {
              this.prepareStackPersistentObjectList = await this.makeStackPersistentObjectList(
                cloudFormationClient,
                cloudFormationStack.StackName!,
                kMSClient,
                cloudWatchLogsClient,
                s3Client,
              );
            } else {
              await this.deleteStackPersistentData(
                // this.stackPersistentObjectList = await this.makeStackPersistentObjectList(
                cloudFormationClient,
                cloudFormationStack.StackName!,
                kMSClient,
                cloudWatchLogsClient,
                s3Client,
                backupClient,
              );
            }
          } else {
            Logger.info('[accelerator-tool] delete-data flag is OFF');
          }

          deleteStackStartedPromises.push(
            cloudFormationClient.send(new DeleteStackCommand({ StackName: cloudFormationStack.StackName! })),
          );

          // This is required to make sure stacks are deleted before moving to next stage of stack deletion
          deleteStackCompletedPromises.push(
            waitUntilStackDeleteComplete(
              { client: cloudFormationClient, maxWaitTime: 3600 }, // waitTime is in second
              { StackName: cloudFormationStack.StackName! },
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

  /**
   * Function to see is cloudformation stack is deletable
   * If stack termination protection is ON and uninstaller flag to ignore termination protection is on then it is considered to be deletable
   * @param cloudFormationClient
   * @param stackName
   * @param accountId
   * @param region
   * @private
   */
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

  /**
   * Function to delete accelerator tester stack
   * @param stackNamePrefix
   * @private
   */
  private async deleteTesterStack(stackNamePrefix: string): Promise<boolean> {
    const cloudFormationClient = new CloudFormationClient({});
    const testerStackName = `${stackNamePrefix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    await this.deleteStack(cloudFormationClient, testerStackName);
    return true;
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

    if (!this.acceleratorToolProps.deletePipelines) {
      return;
    }

    const testerPipelineStackName = `${testerPipelineStackNamePrefix}-${
      this.externalPipelineAccount.isUsed
        ? this.externalPipelineAccount.accountId!
        : this.pipelineManagementAccount!.accountId
    }-${this.globalConfig?.homeRegion}`;

    if (this.acceleratorToolProps.deleteConfigRepo) {
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
        Logger.warn(`[accelerator-tool] Stack with id ${stackName} does not exist`);
        return;
      }
    }

    if (!(await this.isStackDeletable(cloudFormationClient, stackName))) {
      return;
    }

    if (this.acceleratorToolProps.deleteData) {
      // Delete Installer stack persistent data
      await this.deleteStackPersistentData(
        cloudFormationClient,
        stackName,
        new KMSClient({}),
        new CloudWatchLogsClient({}),
        new S3Client({}),
        new BackupClient({}),
      );
    }

    Logger.info(`[accelerator-tool] Deleting stack ${stackName}`);
    await throttlingBackOff(() => cloudFormationClient.send(new DeleteStackCommand({ StackName: `${stackName}` })));

    Logger.info(`[accelerator-tool] Waiting until stack ${stackName} deletion completes`);
    while (!(await this.isStackDeletionCompleted(cloudFormationClient, stackName))) {
      // Wait before checking again
      await new Promise(func => setTimeout(func, 1000));
    }
    Logger.info(`[accelerator-tool] Stack ${stackName} deleted successfully`);
  }

  /**
   * Function to delete code commit repository
   * @param codeCommitClient
   * @param repositoryName
   * @private
   */
  private async deleteCodecommitRepository(
    codeCommitClient: CodeCommitClient,
    repositoryName: string,
  ): Promise<boolean> {
    //Delete config repository
    Logger.info(`[accelerator-tool] Deleting code commit repository ${repositoryName}`);
    await throttlingBackOff(() =>
      codeCommitClient.send(new DeleteRepositoryCommand({ repositoryName: repositoryName })),
    );

    return true;
  }

  /**
   * Delete prepare stack resources
   * @private
   */
  private async deletePrepareStackResources(): Promise<boolean> {
    // Now delete persistent resources from deleted stacks
    Logger.info(`[accelerator-tool] Deleting S3, cloudwatch logs and KMS keys`);
    for (const stackPersistentObject of this.prepareStackPersistentObjectList) {
      switch (stackPersistentObject.resourceType) {
        case 'KMS':
          // await this.scheduleKeyDeletion(kMSClient, stackName, stackResourceSummary.PhysicalResourceId!);
          await this.scheduleKeyDeletion(
            stackPersistentObject.resourceClient as KMSClient,
            stackPersistentObject.stackName,
            stackPersistentObject.resourcePhysicalId,
          );
          break;
        case 'CWLogs':
          await this.deleteCloudWatchLogs(
            stackPersistentObject.resourceClient as CloudWatchLogsClient,
            stackPersistentObject.stackName,
            stackPersistentObject.resourcePhysicalId,
          );
          break;
        case 'S3':
          await this.deleteBucket(
            stackPersistentObject.resourceClient as S3Client,
            stackPersistentObject.stackName,
            stackPersistentObject.resourcePhysicalId,
          );
          break;
      }
    }

    return true;
  }

  /**
   * Function to delete build ids for code build project
   * @param codeBuildClient
   * @param buildProjectName
   * @private
   */
  private async deleteCodeBuilds(codeBuildClient: CodeBuildClient, buildProjectName: string): Promise<boolean> {
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
    Logger.info(`[accelerator-tool] Deleting build ids for the project ${buildProjectName}`);
    await throttlingBackOff(() => codeBuildClient.send(new BatchDeleteBuildsCommand({ ids: buildIds })));
    return true;
  }
}
